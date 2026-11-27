/**
 * Chuya Admin - Servicio API de Operaciones, Registro, Firma y Resiliencia Offline
 * Stack: JS Vanilla ES6+ (Local-First)
 * Descripción: Maneja peticiones HTTP hacia Google Apps Script (Backend),
 * administración del pool de claves, cruce de usuarios y sincronización en cola LocalStorage.
 */

import { ADMIN_CONFIG } from "../admin-config.js";

const STORAGE_KEYS_FALLBACK = {
    PENDING_TXS: "chuya_admin_pending_txs",
    LEGACY_PENDING_TXS: "avelibre_admin_pending_txs",
    USERS_CACHE: "chuya_admin_users_cache",
    ORDERS_CACHE: "chuya_admin_orders_cache",
    INVENTORY_CACHE: "chuya_admin_inventory_cache"
};

export const AdminAPIService = {
    _isSyncing: false,

    /**
     * Obtiene la lista completa de usuarios/miembros registrados (requerido para descifrado PII)
     * con respaldo en caché LocalStorage (Local-First)
     * @returns {Promise<Object>} { success: boolean, status: string, data: Array, offline?: boolean }
     */
    async obtenerUsuarios() {
        console.log("[Chuya::AdminAPI] Consultando lista de usuarios...");
        return this._getCollection("getUsers", STORAGE_KEYS_FALLBACK.USERS_CACHE, "usuarios");
    },

    /**
     * Obtiene la lista completa de pedidos registrados en Google Sheets
     * con respaldo en caché LocalStorage (Local-First)
     * @returns {Promise<Object>} { success: boolean, status: string, data: Array, offline?: boolean }
     */
    async obtenerPedidos() {
        console.log("[Chuya::AdminAPI] Consultando lista de pedidos...");
        return this._getCollection("getOrders", STORAGE_KEYS_FALLBACK.ORDERS_CACHE, "pedidos");
    },

    /**
     * Obtiene el inventario de productos registrados
     * con respaldo en caché LocalStorage (Local-First)
     * @returns {Promise<Object>} { success: boolean, status: string, data: Array, offline?: boolean }
     */
    async obtenerInventario() {
        console.log("[Chuya::AdminAPI] Consultando inventario de productos...");
        return this._getCollection("getProducts", STORAGE_KEYS_FALLBACK.INVENTORY_CACHE, "inventario");
    },

    /**
     * Registra un nuevo miembro en Google Sheets asignando automáticamente
     * dirección Nano y clave PGP desde el Pool (si no son provistas).
     * @param {Object} datos - { nombre, telefono, direccion, nanoAddress, rol, pgpPublicKey, operatorAddress }
     * @returns {Promise<Object>}
     */
    async registrarNuevoMiembro(datos = {}) {
        const nombreLimpio = String(datos.nombre || "").trim();
        console.log(`[Chuya::AdminAPI] Registrando nuevo miembro: ${nombreLimpio || "Anónimo"}...`);

        const operatorAddress = datos.operatorAddress || ADMIN_CONFIG.OPERATOR_ADDRESS;
        if (!operatorAddress) {
            console.error("[Chuya::AdminAPI] Registro abortado: operatorAddress no configurado.");
            return { success: false, status: "error", error: "Sesión de operador no válida." };
        }

        const action = "registerMember";
        const bodyPayload = {
            action,
            operatorAddress,
            nombre: nombreLimpio,
            telefono: String(datos.telefono || datos.email || "").trim(),
            direccion: String(datos.direccion || "").trim(),
            nanoAddress: String(datos.nanoAddress || "").trim(),
            rol: datos.rol || "CLIENTE",
            pgpPublicKey: datos.pgpPublicKey || ""
        };

        if (!navigator.onLine) {
            console.warn("[Chuya::AdminAPI] Dispositivo offline. Encolando registro de miembro...");
            this._encolarTransaccionOffline({
                txId: `TX-USR-${Date.now()}`,
                tipo: "nuevo_miembro",
                action,
                bodyPayload,
                timestamp: new Date().toISOString()
            });
            return {
                success: true,
                status: "success",
                offline: true,
                message: "Miembro guardado localmente en cola Chuya (Modo Offline)."
            };
        }

        try {
            const result = await this._postAction(action, bodyPayload);
            console.log("[Chuya::AdminAPI] Miembro registrado con éxito:", result);
            return {
                success: true,
                status: "success",
                data: result,
                nanoAddress: result.nanoAddress || result.data?.nanoAddress,
                pgpFingerprint: result.pgpFingerprint || result.data?.pgpFingerprint,
                idUsuario: result.idUsuario || result.data?.idUsuario
            };
        } catch (error) {
            console.error("[Chuya::AdminAPI] Error al registrar miembro. Encolando localmente:", error.message);
            this._encolarTransaccionOffline({
                txId: `TX-USR-${Date.now()}`,
                tipo: "nuevo_miembro",
                action,
                bodyPayload,
                timestamp: new Date().toISOString()
            });
            return { success: false, status: "error", offline: true, error: error.message };
        }
    },

    /**
     * Consulta el estado del pool de direcciones o número de usuarios registrados
     * @returns {Promise<Object>} { total: number, disponibles?: number, asignadas?: number }
     */
    async obtenerTotalUsuarios() {
        if (!navigator.onLine) {
            const queue = this._obtenerColaOffline();
            const offlineMembers = queue.filter(item => item.tipo === "nuevo_miembro").length;
            return { total: 1 + offlineMembers };
        }

        try {
            const res = await fetch(`${ADMIN_CONFIG.API_URL}?action=getPoolStatus`, {
                method: "GET",
                redirect: "follow"
            });
            if (!res.ok) return { total: 1 };

            const result = await res.json();
            if (result.status === "success") {
                console.log("[Chuya::AdminAPI] Estado del pool recibido:", result);
                return {
                    total: result.total || 1,
                    disponibles: result.disponibles || 0,
                    asignadas: result.asignadas || 0
                };
            }
            return { total: 1 };
        } catch (err) {
            console.warn("[Chuya::AdminAPI] Fallo consultando estado del pool. Usando valor base:", err.message);
            return { total: 1 };
        }
    },

    /**
     * Procesa y firma transacciones de recolección (cáscaras o aserrín) con control RBAC.
     * @param {string} tipo - "cascaras" | "aserrin"
     * @param {string} targetAddress - Dirección Nano del cliente receptor
     * @param {number} cantidad - Cantidad acumulada
     * @returns {Promise<Object>}
     */
    async procesarTransaccion(tipo, targetAddress, cantidad) {
        const cleanTarget = String(targetAddress || "").trim();
        const numCantidad = Number(cantidad);

        console.log(`[Chuya::AdminAPI] Firmando y enviando ${tipo}: ${numCantidad} para ${cleanTarget}...`);

        if (!cleanTarget || Number.isNaN(numCantidad) || numCantidad <= 0) {
            console.error("[Chuya::AdminAPI] Parámetros inválidos en procesarTransaccion:", { tipo, cleanTarget, cantidad });
            return {
                success: false,
                status: "error",
                error: "La dirección del cliente y una cantidad mayor a 0 son obligatorias."
            };
        }

        const actionMap = {
            aserrin: "registerAserrin",
            cascaras: "registerCascaras"
        };

        const action = actionMap[tipo] || "registerCascaras";
        const bodyPayload = {
            action,
            operatorAddress: ADMIN_CONFIG.OPERATOR_ADDRESS,
            targetAddress: cleanTarget,
            ...(tipo === "aserrin" ? { cantidadAserrin: numCantidad } : { cantidadCascaras: numCantidad })
        };

        if (!navigator.onLine) {
            console.warn("[Chuya::AdminAPI] Dispositivo offline. Encolando transacción localmente...");
            this._encolarTransaccionOffline({
                txId: `TX-${tipo.toUpperCase()}-${Date.now()}`,
                tipo,
                action,
                bodyPayload,
                timestamp: new Date().toISOString()
            });
            return {
                success: true,
                status: "success",
                offline: true,
                message: "Transacción guardada localmente en cola Chuya (Modo Offline)."
            };
        }

        try {
            const result = await this._postAction(action, bodyPayload);
            console.log("[Chuya::AdminAPI] Transacción firmada y procesada con éxito:", result);
            return { success: true, status: "success", data: result };
        } catch (error) {
            console.error("[Chuya::AdminAPI] Error enviando transacción. Encolando localmente:", error.message);
            this._encolarTransaccionOffline({
                txId: `TX-${tipo.toUpperCase()}-${Date.now()}`,
                tipo,
                action,
                bodyPayload,
                timestamp: new Date().toISOString()
            });
            return { success: false, status: "error", offline: true, error: error.message };
        }
    },

    /**
     * Procesa y vacía la cola de transacciones almacenadas localmente al recuperar la conexión
     * @returns {Promise<Object>} { procesadas: number, errores: number }
     */
    async sincronizarColaOffline() {
        if (!navigator.onLine) {
            console.warn("[Chuya::AdminSync] No se puede sincronizar: el dispositivo continúa offline.");
            return { procesadas: 0, errores: 0 };
        }

        if (this._isSyncing) {
            console.log("[Chuya::AdminSync] Sincronización ya en curso. Omitiendo ejecución duplicada.");
            return { procesadas: 0, errores: 0 };
        }

        const cola = this._obtenerColaOffline();
        if (cola.length === 0) {
            return { procesadas: 0, errores: 0 };
        }

        this._isSyncing = true;
        console.log(`[Chuya::AdminSync] Iniciando sincronización de ${cola.length} transacciones pendientes...`);

        let procesadas = 0;
        let errores = 0;
        const pendientesRestantes = [];

        try {
            for (const item of cola) {
                try {
                    const action = item.action || item.bodyPayload?.action || "registerCascaras";
                    await this._postAction(action, item.bodyPayload);
                    procesadas++;
                    console.log(`[Chuya::AdminSync] Elemento sincronizado (${item.tipo || action}).`);
                } catch (err) {
                    console.error("[Chuya::AdminSync] Error al reintentar elemento de la cola:", err.message);
                    pendientesRestantes.push(item);
                    errores++;
                }
            }

            this._guardarColaOffline(pendientesRestantes);
            console.log(`[Chuya::AdminSync] Sincronización finalizada: ${procesadas} exitosas, ${errores} con error.`);
            return { procesadas, errores };
        } finally {
            this._isSyncing = false;
        }
    },

    /**
     * Helper unificado para peticiones GET con respaldo en caché LocalStorage
     * @private
     */
    async _getCollection(action, cacheKey, label) {
        try {
            const response = await fetch(`${ADMIN_CONFIG.API_URL}?action=${encodeURIComponent(action)}`, {
                method: "GET",
                redirect: "follow"
            });
            if (!response.ok) throw new Error(`HTTP Status ${response.status}`);

            const result = await response.json();
            if (result.status === "success") {
                const items = result.data || [];
                localStorage.setItem(cacheKey, JSON.stringify(items));
                console.log(`[Chuya::AdminAPI] ${label} sincronizados desde red (${items.length} registros).`);
                return { success: true, status: "success", data: items };
            }

            throw new Error(result.message || `Error al obtener ${label}.`);
        } catch (err) {
            console.warn(`[Chuya::AdminAPI] Fallo consultando ${label} en red (${err.message}). Leyendo caché local...`);
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
                if (cached.length > 0) {
                    console.log(`[Chuya::AdminAPI] ${label} recuperados desde caché local (${cached.length} registros).`);
                    return { success: true, status: "success", offline: true, data: cached };
                }
            } catch (parseErr) {
                console.error(`[Chuya::AdminAPI] Caché local corrupta para ${label}:`, parseErr);
            }
            return { success: false, status: "error", error: err.message, data: [] };
        }
    },

    /**
     * Helper unificado para peticiones POST preservando action en query string ante redirecciones 302
     * @private
     */
    async _postAction(action, bodyPayload) {
        const url = `${ADMIN_CONFIG.API_URL}?action=${encodeURIComponent(action)}`;
        const res = await fetch(url, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(bodyPayload)
        });

        if (!res.ok) throw new Error(`HTTP Status ${res.status}`);

        const result = await res.json();
        if (result.status === "error") {
            throw new Error(result.message || "Error procesando operación en backend Chuya.");
        }
        return result;
    },

    /**
     * Recupera de forma segura la cola de transacciones pendientes desde LocalStorage
     * migrando automáticamente registros heredados de avelibre_admin_pending_txs
     * @private
     */
    _obtenerColaOffline() {
        try {
            const queueKey = ADMIN_CONFIG.STORAGE_KEYS?.PENDING_TXS || STORAGE_KEYS_FALLBACK.PENDING_TXS;
            const currentRaw = localStorage.getItem(queueKey);
            const legacyRaw = localStorage.getItem(STORAGE_KEYS_FALLBACK.LEGACY_PENDING_TXS);

            if (legacyRaw) {
                const currentArr = currentRaw ? JSON.parse(currentRaw) : [];
                const legacyArr = JSON.parse(legacyRaw);
                const merged = [...legacyArr, ...currentArr];
                localStorage.setItem(queueKey, JSON.stringify(merged));
                localStorage.removeItem(STORAGE_KEYS_FALLBACK.LEGACY_PENDING_TXS);
                console.log(`[Chuya::AdminSync] Migrados ${legacyArr.length} registros heredados a ${queueKey}.`);
                return merged;
            }

            return JSON.parse(currentRaw || "[]");
        } catch (e) {
            console.error("[Chuya::AdminAPI] Error leyendo LocalStorage:", e);
            return [];
        }
    },

    /**
     * Guarda de forma segura la cola de transacciones en LocalStorage
     * @private
     */
    _guardarColaOffline(queue) {
        try {
            const queueKey = ADMIN_CONFIG.STORAGE_KEYS?.PENDING_TXS || STORAGE_KEYS_FALLBACK.PENDING_TXS;
            localStorage.setItem(queueKey, JSON.stringify(queue));
        } catch (e) {
            console.error("[Chuya::AdminAPI] Error escribiendo en LocalStorage:", e);
        }
    },

    /**
     * Encola operaciones pendientes en LocalStorage
     * @private
     */
    _encolarTransaccionOffline(txData) {
        const queue = this._obtenerColaOffline();
        queue.push(txData);
        this._guardarColaOffline(queue);
        console.log("[Chuya::AdminSync] Transacción guardada en cola offline. Total pendientes:", queue.length);
    }
};

window.AdminAPIService = AdminAPIService;