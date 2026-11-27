/**
 * Chuya Admin - Servicio API de Operaciones, Registro, Firma y Resiliencia Offline
 * Stack: JS Vanilla ES6+ (Local-First)
 * Ubicación: chuya-pwa/admin-recolector/js/modules/admin-api.js
 * Descripción: Maneja peticiones HTTP hacia Google Apps Script (Backend),
 * administración del pool de claves, cruce de usuarios y sincronización en cola LocalStorage.
 */

import { ADMIN_CONFIG } from "../admin-config.js";

const STORAGE_KEYS_FALLBACK = {
    ADMIN_WALLET: "chuya_admin_address",
    LEGACY_ADMIN_WALLET: "avelibre_admin_address",
    PENDING_TXS: "chuya_admin_pending_txs",
    LEGACY_PENDING_TXS: "avelibre_admin_pending_txs",
    USERS_CACHE: "chuya_admin_users_cache",
    ORDERS_CACHE: "chuya_admin_orders_cache",
    INVENTORY_CACHE: "chuya_admin_inventory_cache"
};

/**
 * Error tipado para distinguir rechazos de reglas de negocio en Apps Script
 * (ej. pool agotado, RBAC, parámetros inválidos) frente a fallos reales de red.
 */
class BackendBusinessError extends Error {
    constructor(message) {
        super(message);
        this.name = "BackendBusinessError";
        this.isBusinessError = true;
    }
}

export const AdminAPIService = {
    _isSyncing: false,

    /**
     * Resuelve claves de LocalStorage priorizando ADMIN_CONFIG.STORAGE_KEYS
     * @private
     */
    _getStorageKey(keyName) {
        return ADMIN_CONFIG.STORAGE_KEYS?.[keyName] || STORAGE_KEYS_FALLBACK[keyName];
    },

    /**
     * Resuelve la dirección Nano del operador activo (LocalStorage o ADMIN_CONFIG)
     * @private
     */
    _obtenerOperadorActivo(overrideAddress = "") {
        if (overrideAddress && String(overrideAddress).trim()) {
            return String(overrideAddress).trim().toLowerCase();
        }
        const walletKey = this._getStorageKey("ADMIN_WALLET");
        const legacyWalletKey =
            ADMIN_CONFIG.LEGACY_STORAGE_KEYS?.ADMIN_WALLET || STORAGE_KEYS_FALLBACK.LEGACY_ADMIN_WALLET;

        const stored =
            localStorage.getItem(walletKey)?.trim().toLowerCase() ||
            localStorage.getItem(legacyWalletKey)?.trim().toLowerCase();

        return stored || ADMIN_CONFIG.OPERATOR_ADDRESS;
    },

    /**
     * Evalúa si una excepción corresponde a transporte/conectividad o bloqueo temporal del servidor
     * y amerita retención en cola offline
     * @private
     */
    _esErrorDeRed(error) {
        if (!navigator.onLine) return true;
        if (!error) return false;

        const msg = String(error.message || "").toLowerCase();

        // Si LockService en Google Apps Script está ocupado, retener en cola para reintentar
        if (msg.includes("servidor ocupado")) {
            return true;
        }

        if (error.isBusinessError) return false;

        return (
            error.name === "TypeError" ||
            msg.includes("networkerror") ||
            msg.includes("failed to fetch") ||
            msg.includes("load failed") ||
            msg.includes("http status 5")
        );
    },

    /**
     * Obtiene la lista completa de usuarios/miembros registrados (requerido para descifrado PII)
     * con respaldo en caché LocalStorage (Local-First)
     * @returns {Promise<Object>} { success: boolean, status: string, data: Array, offline?: boolean }
     */
    async obtenerUsuarios() {
        console.log("[Chuya::AdminAPI] Consultando lista de usuarios...");
        return this._getCollection("getUsers", this._getStorageKey("USERS_CACHE"), "usuarios");
    },

    /**
     * Obtiene la lista completa de pedidos registrados en Google Sheets
     * con respaldo en caché LocalStorage (Local-First)
     * @returns {Promise<Object>} { success: boolean, status: string, data: Array, offline?: boolean }
     */
    async obtenerPedidos() {
        console.log("[Chuya::AdminAPI] Consultando lista de pedidos...");
        return this._getCollection("getOrders", this._getStorageKey("ORDERS_CACHE"), "pedidos");
    },

    /**
     * Obtiene el inventario de productos registrados
     * con respaldo en caché LocalStorage (Local-First)
     * @returns {Promise<Object>} { success: boolean, status: string, data: Array, offline?: boolean }
     */
    async obtenerInventario() {
        console.log("[Chuya::AdminAPI] Consultando inventario de productos...");
        return this._getCollection("getProducts", this._getStorageKey("INVENTORY_CACHE"), "inventario");
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

        const operatorAddress = this._obtenerOperadorActivo(datos.operatorAddress);
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
                pgpPublicKey: result.pgpPublicKey || result.data?.pgpPublicKey,
                idUsuario: result.idUsuario || result.data?.idUsuario
            };
        } catch (error) {
            if (this._esErrorDeRed(error)) {
                console.warn("[Chuya::AdminAPI] Fallo de red al registrar miembro. Encolando localmente:", error.message);
                this._encolarTransaccionOffline({
                    txId: `TX-USR-${Date.now()}`,
                    tipo: "nuevo_miembro",
                    action,
                    bodyPayload,
                    timestamp: new Date().toISOString()
                });
                return { success: false, status: "error", offline: true, error: error.message };
            }

            console.error("[Chuya::AdminAPI] Registro rechazado por backend (no encolado):", error.message);
            return { success: false, status: "error", offline: false, error: error.message };
        }
    },

    /**
     * Consulta el estado del pool de direcciones o número de usuarios registrados
     * @returns {Promise<Object>} { total: number, disponibles?: number, asignadas?: number }
     */
    async obtenerTotalUsuarios() {
        if (!navigator.onLine) {
            const queue = this._obtenerColaOffline();
            const offlineMembers = queue.filter((item) => item.tipo === "nuevo_miembro").length;
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
     * @param {string} [operatorOverride] - Dirección Nano opcional del recolector activo
     * @returns {Promise<Object>}
     */
    async procesarTransaccion(tipo, targetAddress, cantidad, operatorOverride = "") {
        const cleanTarget = String(targetAddress || "").trim();
        const numCantidad = Number(cantidad);
        const operatorAddress = this._obtenerOperadorActivo(operatorOverride);

        console.log(`[Chuya::AdminAPI] Firmando y enviando ${tipo}: ${numCantidad} para ${cleanTarget} (Operador: ${operatorAddress})...`);

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
            operatorAddress,
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
            if (this._esErrorDeRed(error)) {
                console.warn("[Chuya::AdminAPI] Error de red enviando transacción. Encolando localmente:", error.message);
                this._encolarTransaccionOffline({
                    txId: `TX-${tipo.toUpperCase()}-${Date.now()}`,
                    tipo,
                    action,
                    bodyPayload,
                    timestamp: new Date().toISOString()
                });
                return { success: false, status: "error", offline: true, error: error.message };
            }

            console.error("[Chuya::AdminAPI] Transacción rechazada por backend (no encolada):", error.message);
            return { success: false, status: "error", offline: false, error: error.message };
        }
    },

    /**
     * Actualiza el estado de un pedido en Google Sheets (Pendiente -> Entregado / Cancelado)
     * @param {string} idPedido
     * @param {string} nuevoEstado
     * @returns {Promise<Object>}
     */
    async actualizarEstadoPedido(idPedido, nuevoEstado) {
        const cleanId = String(idPedido || "").trim();
        const cleanEstado = String(nuevoEstado || "").trim();
        const operatorAddress = this._obtenerOperadorActivo();

        console.log(`[Chuya::AdminAPI] Actualizando pedido ${cleanId} a estado '${cleanEstado}'...`);

        if (!cleanId || !cleanEstado) {
            return { success: false, status: "error", error: "ID de pedido y estado son obligatorios." };
        }

        const action = "updateOrderStatus";
        const bodyPayload = {
            action,
            operatorAddress,
            idPedido: cleanId,
            estado: cleanEstado
        };

        if (!navigator.onLine) {
            console.warn("[Chuya::AdminAPI] Dispositivo offline. Encolando actualización de pedido...");
            this._encolarTransaccionOffline({
                txId: `TX-ORD-${Date.now()}`,
                tipo: "estado_pedido",
                action,
                bodyPayload,
                timestamp: new Date().toISOString()
            });
            return { success: true, status: "success", offline: true, message: "Cambio de estado guardado en cola offline." };
        }

        try {
            const result = await this._postAction(action, bodyPayload);
            console.log(`[Chuya::AdminAPI] Pedido ${cleanId} actualizado con éxito:`, result);
            return { success: true, status: "success", data: result };
        } catch (error) {
            if (this._esErrorDeRed(error)) {
                console.warn(`[Chuya::AdminAPI] Fallo de red actualizando pedido ${cleanId}. Encolando localmente:`, error.message);
                this._encolarTransaccionOffline({
                    txId: `TX-ORD-${Date.now()}`,
                    tipo: "estado_pedido",
                    action,
                    bodyPayload,
                    timestamp: new Date().toISOString()
                });
                return { success: false, status: "error", offline: true, error: error.message };
            }

            console.error(`[Chuya::AdminAPI] Error de negocio actualizando pedido ${cleanId} (no encolado):`, error.message);
            return { success: false, status: "error", offline: false, error: error.message };
        }
    },

    /**
     * Devuelve el conteo actual de operaciones pendientes en la cola offline
     * @returns {number}
     */
    obtenerConteoColaOffline() {
        return this._obtenerColaOffline().length;
    },

    /**
     * Purga manualmente todos los elementos pendientes de la cola offline
     */
    limpiarColaOffline() {
        this._guardarColaOffline([]);
        console.log("[Chuya::AdminSync] Cola offline purgada manualmente.");
    },

    /**
     * Procesa y vacía la cola de transacciones almacenadas localmente al recuperar la conexión.
     * Descarta elementos que fallen por validación de negocio para evitar bucles infinitos.
     * @returns {Promise<Object>} { procesadas: number, errores: number, descartadas: number }
     */
    async sincronizarColaOffline() {
        if (!navigator.onLine) {
            console.warn("[Chuya::AdminSync] No se puede sincronizar: el dispositivo continúa offline.");
            return { procesadas: 0, errores: 0, descartadas: 0 };
        }

        if (this._isSyncing) {
            console.log("[Chuya::AdminSync] Sincronización ya en curso. Omitiendo ejecución duplicada.");
            return { procesadas: 0, errores: 0, descartadas: 0 };
        }

        const cola = this._obtenerColaOffline();
        if (cola.length === 0) {
            return { procesadas: 0, errores: 0, descartadas: 0 };
        }

        this._isSyncing = true;
        console.log(`[Chuya::AdminSync] Iniciando sincronización de ${cola.length} transacciones pendientes...`);

        let procesadas = 0;
        let errores = 0;
        let descartadas = 0;
        const pendientesRestantes = [];

        try {
            for (const item of cola) {
                try {
                    const action = item.action || item.bodyPayload?.action || "registerCascaras";
                    await this._postAction(action, item.bodyPayload);
                    procesadas++;
                    console.log(`[Chuya::AdminSync] Elemento sincronizado (${item.tipo || action}).`);
                } catch (err) {
                    errores++;
                    if (this._esErrorDeRed(err)) {
                        console.warn("[Chuya::AdminSync] Fallo de red al reintentar elemento. Se mantiene en cola:", err.message);
                        pendientesRestantes.push(item);
                    } else {
                        descartadas++;
                        console.error(
                            `[Chuya::AdminSync] Elemento descartado de la cola por rechazo del backend (${item.tipo}):`,
                            err.message
                        );
                    }
                }
            }

            this._guardarColaOffline(pendientesRestantes);
            console.log(
                `[Chuya::AdminSync] Sincronización finalizada: ${procesadas} exitosas, ${errores} con error (${descartadas} descartadas, ${pendientesRestantes.length} retenidas).`
            );
            return { procesadas, errores, descartadas };
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

            throw new BackendBusinessError(result.message || `Error al obtener ${label}.`);
        } catch (err) {
            console.warn(`[Chuya::AdminAPI] Fallo consultando ${label} en red (${err.message}). Leyendo caché local...`);
            try {
                const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
                if (Array.isArray(cached) && cached.length > 0) {
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
            throw new BackendBusinessError(result.message || "Error procesando operación en backend Chuya.");
        }
        return result;
    },

    /**
     * Parsea arreglos JSON desde LocalStorage de forma aislada y segura
     * @private
     */
    _parseSafeArray(rawValue, label) {
        if (!rawValue) return [];
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.error(`[Chuya::AdminAPI] JSON corrupto detectado en '${label}':`, err.message);
            return [];
        }
    },

    /**
     * Recupera de forma segura la cola de transacciones pendientes desde LocalStorage
     * migrando automáticamente registros heredados de avelibre_admin_pending_txs
     * @private
     */
    _obtenerColaOffline() {
        const queueKey = this._getStorageKey("PENDING_TXS");
        const legacyKey =
            ADMIN_CONFIG.LEGACY_STORAGE_KEYS?.PENDING_TXS || STORAGE_KEYS_FALLBACK.LEGACY_PENDING_TXS;

        const currentArr = this._parseSafeArray(localStorage.getItem(queueKey), queueKey);
        const legacyRaw = localStorage.getItem(legacyKey);

        if (legacyRaw) {
            const legacyArr = this._parseSafeArray(legacyRaw, legacyKey);
            const merged = [...legacyArr, ...currentArr];
            this._guardarColaOffline(merged);
            localStorage.removeItem(legacyKey);
            console.log(`[Chuya::AdminSync] Migrados ${legacyArr.length} registros heredados a ${queueKey}.`);
            return merged;
        }

        return currentArr;
    },

    /**
     * Guarda de forma segura la cola de transacciones en LocalStorage
     * @private
     */
    _guardarColaOffline(queue) {
        try {
            const queueKey = this._getStorageKey("PENDING_TXS");
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

if (typeof window !== "undefined") {
    window.AdminAPIService = AdminAPIService;
}