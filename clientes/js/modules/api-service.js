/**
 * Chuya - Servicio API REST (Google Apps Script) & Local-First Sync
 * Ubicación: chuya-pwa/clientes/js/modules/api-service.js
 * Stack: JS Vanilla ES6+
 */

import { CONFIG } from "../config.js";
import { NanoWallet } from "./nano-wallet.js";

// Catálogo Semilla de respaldo para arranque Offline sin caché previa (Cold Start Fallback)
const PRODUCTOS_SEMILLA = [
    { id: "prod-huevo-u", nombre: "Huevo Campesino Fresco (Unidad)", precio: 700, categoria: "huevos", icono: "🥚", stock: 8, descripcion: "Venta por unidad según postura del día" },
    { id: "prod-pollo-7500", nombre: "Presas de Pollo Empaquetadas (Bolsa 500g)", precio: 7500, categoria: "pollo", icono: "🍗", stock: 3, descripcion: "Bolsa sellada individual por peso" },
    { id: "prod-abono-500g", nombre: "Abono de Cáscara Procesada (500g)", precio: 5000, categoria: "abono", icono: "🌱", stock: 10, descripcion: "Abono orgánico enriquecido" }
];

// Error controlado para rechazos lógicos del backend (no deben reintentarse en cola offline)
class BackendBusinessError extends Error {
    constructor(message) {
        super(message);
        this.name = "BackendBusinessError";
    }
}

export const APIService = {
    _isSyncing: false,

    /**
     * Carga el catálogo de productos con respaldo Local-First y fallback de semillas
     * @returns {Promise<Array>}
     */
    async cargarProductos() {
        const productsKey = CONFIG.STORAGE_KEYS?.PRODUCTS || "chuya_products_cache";
        console.log("[Chuya::API] Solicitando catálogo de productos a la red...");

        try {
            const res = await fetch(`${CONFIG.API_URL}?action=getProducts`, {
                method: "GET",
                mode: "cors",
                credentials: "omit",
                redirect: "follow"
            });

            if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);

            const result = await this._parsearRespuestaSegura(res);

            if (result.status === "error") {
                throw new BackendBusinessError(result.message || "Error devuelto por el servidor backend.");
            }

            const productos = Array.isArray(result.data) ? result.data : [];

            if (productos.length > 0) {
                localStorage.setItem(productsKey, JSON.stringify(productos));
                console.log("[Chuya::API] Catálogo actualizado exitosamente desde la red:", productos.length, "items");
                return productos;
            } else {
                throw new Error("El catálogo devuelto por la red está vacío.");
            }
        } catch (error) {
            console.warn(`[Chuya::API] Fallo de red/servidor (${error.message}). Recurriendo a caché o datos semilla...`);

            // Buscar en clave actual o migrar caché heredada
            const cachedData = this._obtenerStorageSeguro(productsKey)
                || this._obtenerStorageSeguro("avelibre_products_cache");

            if (Array.isArray(cachedData) && cachedData.length > 0) {
                localStorage.setItem(productsKey, JSON.stringify(cachedData));
                console.log("[Chuya::API] Catálogo recuperado exitosamente desde LocalStorage:", cachedData.length, "items");
                return cachedData;
            }

            // Fallback Local-First si es el primer inicio y la red falla
            console.warn("[Chuya::API] LocalStorage vacío o corrupto. Inicializando catálogo con datos semilla...");
            localStorage.setItem(productsKey, JSON.stringify(PRODUCTOS_SEMILLA));
            return PRODUCTOS_SEMILLA;
        }
    },

    /**
     * Envía un pedido o lo almacena en la cola local si el dispositivo está offline
     * @param {Object} orderData
     * @returns {Promise<Object>}
     */
    async enviarPedido(orderData) {
        console.log("[Chuya::API] Preparando envío de pedido:", orderData);

        if (!orderData || !Array.isArray(orderData.items) || orderData.items.length === 0) {
            console.error("[Chuya::API] Pedido inválido o sin ítems.");
            return { success: false, error: "El pedido no contiene productos válidos." };
        }

        if (!navigator.onLine) {
            console.warn("[Chuya::API] Dispositivo offline. Guardando pedido en cola local.");
            this._guardarPedidoPendiente(orderData);
            return { success: true, offline: true, message: "Pedido guardado localmente." };
        }

        try {
            const result = await this._postData("createOrder", { action: "createOrder", order: orderData });
            console.log("[Chuya::API] Pedido procesado exitosamente por la API:", result);
            return { success: true, data: result };
        } catch (error) {
            if (this._esErrorDeRed(error)) {
                console.warn("[Chuya::API] Error de conectividad enviando pedido. Encolando localmente:", error.message);
                this._guardarPedidoPendiente(orderData);
                return { success: true, offline: true, message: "Sin conexión estable. Pedido guardado localmente." };
            }

            console.error("[Chuya::API] Rechazo del servidor al procesar pedido:", error.message);
            return { success: false, offline: false, error: error.message };
        }
    },

    /**
     * Registra las cáscaras de huevo recicladas para gamificación
     * @param {string} nanoAddress
     * @param {number} cantidad
     * @returns {Promise<Object>}
     */
    async entregarCascaras(nanoAddress, cantidad) {
        console.log(`[Chuya::API] Registrando ${cantidad} cáscaras para wallet: ${nanoAddress}`);

        const esValida = typeof NanoWallet?.esDireccionValida === "function"
            ? NanoWallet.esDireccionValida(nanoAddress)
            : (typeof nanoAddress === "string" && /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/.test(nanoAddress.trim()));

        if (!esValida || Number(cantidad) <= 0) {
            console.error("[Chuya::API] Parámetros no válidos para la entrega de cáscaras.");
            return { success: false, error: "Dirección Nano o cantidad no válida" };
        }

        if (!navigator.onLine) {
            console.warn("[Chuya::API] Sin conexión a red. Guardando entrega de cáscaras en cola offline.");
            this._guardarCascarasPendientes(nanoAddress, Number(cantidad));
            return { success: true, offline: true, message: "Entrega registrada en cola offline local." };
        }

        try {
            const payload = {
                action: "registerCascaras",
                nanoAddress: nanoAddress.trim(),
                cantidadCascaras: Number(cantidad)
            };
            const result = await this._postData("registerCascaras", payload);
            console.log("[Chuya::API] Cáscaras registradas con éxito:", result);
            return { success: true, data: result };
        } catch (error) {
            if (this._esErrorDeRed(error)) {
                console.warn("[Chuya::API] Fallo de red al registrar cáscaras. Guardando en cola local:", error.message);
                this._guardarCascarasPendientes(nanoAddress, Number(cantidad));
                return { success: true, offline: true, message: "Entrega encolada localmente." };
            }

            console.error("[Chuya::API] Rechazo del servidor al registrar cáscaras:", error.message);
            return { success: false, offline: false, error: error.message };
        }
    },

    /**
     * Procesa y sincroniza los elementos almacenados en la cola offline (pedidos y cáscaras)
     * @returns {Promise<Object>}
     */
    async sincronizarPedidosPendientes() {
        if (!navigator.onLine) {
            console.log("[Chuya::Sync] Dispositivo offline. Se pospone sincronización.");
            return { procesados: 0, pendientes: 0 };
        }

        if (this._isSyncing) {
            console.log("[Chuya::Sync] Sincronización ya en curso. Omitiendo ejecución paralela.");
            return { procesados: 0, pendientes: 0 };
        }

        const queue = this._obtenerColaPendiente();
        if (queue.length === 0) return { procesados: 0, pendientes: 0 };

        this._isSyncing = true;
        console.log(`[Chuya::Sync] Procesando sincronización de ${queue.length} elementos pendientes...`);

        const remainingQueue = [];
        let procesados = 0;

        try {
            for (const item of queue) {
                try {
                    let action = "createOrder";
                    let payload = {};

                    if (item.type === "cascaras") {
                        action = "registerCascaras";
                        payload = {
                            action: "registerCascaras",
                            nanoAddress: item.nanoAddress,
                            cantidadCascaras: item.cantidad
                        };
                    } else {
                        payload = { action: "createOrder", order: item.orderData };
                    }

                    const result = await this._postData(action, payload);
                    procesados++;
                    console.log(`[Chuya::Sync] Elemento encolado (${item.type || "order"}) sincronizado exitosamente:`, result);
                } catch (error) {
                    if (this._esErrorDeRed(error)) {
                        console.warn("[Chuya::Sync] Red inestable, conservando elemento para próximo intento:", error.message);
                        remainingQueue.push(item);
                    } else {
                        console.error(`[Chuya::Sync] Elemento descartado por rechazo lógico del backend (${error.message}):`, item);
                    }
                }
            }

            this._guardarColaPendiente(remainingQueue);
            console.log(`[Chuya::Sync] Sincronización finalizada. Procesados: ${procesados}, Pendientes: ${remainingQueue.length}`);
            return { procesados, pendientes: remainingQueue.length };
        } finally {
            this._isSyncing = false;
        }
    },

    /**
     * Helper para enviar peticiones POST conservando la acción en la query string
     * y evitando envío de cookies de sesión en redirecciones HTTP 302 de Google Apps Script
     * @private
     */
    async _postData(action, bodyPayload) {
        const url = `${CONFIG.API_URL}?action=${encodeURIComponent(action)}`;
        const res = await fetch(url, {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(bodyPayload)
        });

        if (!res.ok) throw new Error(`HTTP Status ${res.status}`);

        const result = await this._parsearRespuestaSegura(res);
        if (result.status === "error") {
            throw new BackendBusinessError(result.message || "Error procesando solicitud en backend");
        }

        return result;
    },

    /**
     * Parsea la respuesta HTTP validando que sea JSON válido y no una página HTML de error
     * @private
     */
    async _parsearRespuestaSegura(response) {
        const rawText = await response.text();
        try {
            return JSON.parse(rawText);
        } catch (err) {
            console.error("[Chuya::API] Respuesta no-JSON recibida del servidor:", rawText.slice(0, 180));
            throw new BackendBusinessError("El servidor devolvió una respuesta HTML/inválida. Verifica el despliegue.");
        }
    },

    /**
     * Determina si una excepción corresponde a falta de red (encolable) vs error lógico
     * @private
     */
    _esErrorDeRed(error) {
        if (!navigator.onLine) return true;
        if (error instanceof BackendBusinessError) return false;
        return error instanceof TypeError || /Failed to fetch|NetworkError|HTTP (Error )?Status 5\d\d/i.test(error.message);
    },

    /**
     * Helper defensivo para leer y parsear JSON desde LocalStorage
     * @private
     */
    _obtenerStorageSeguro(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error(`[Chuya::API] Error de lectura JSON en LocalStorage para '${key}':`, e.message);
            return null;
        }
    },

    /**
     * Obtiene la cola offline actual migrando registros heredados si existen
     * @private
     */
    _obtenerColaPendiente() {
        const queueKey = CONFIG.STORAGE_KEYS?.PENDING_ORDERS || "chuya_pending_orders";
        const legacyKey = "avelibre_pending_orders";

        const current = this._obtenerStorageSeguro(queueKey);
        const currentArr = Array.isArray(current) ? current : [];
        const legacy = this._obtenerStorageSeguro(legacyKey);

        if (Array.isArray(legacy) && legacy.length > 0) {
            const merged = [...legacy, ...currentArr];
            this._guardarColaPendiente(merged);
            localStorage.removeItem(legacyKey);
            console.log(`[Chuya::Sync] Migrados ${legacy.length} elementos heredados a '${queueKey}'.`);
            return merged;
        }

        return currentArr;
    },

    /**
     * Persiste la cola offline de forma segura
     * @private
     */
    _guardarColaPendiente(queue) {
        const queueKey = CONFIG.STORAGE_KEYS?.PENDING_ORDERS || "chuya_pending_orders";
        try {
            localStorage.setItem(queueKey, JSON.stringify(queue));
        } catch (e) {
            console.error("[Chuya::Sync] Error guardando cola offline en LocalStorage:", e.message);
        }
    },

    /**
     * Encola un pedido localmente cuando no hay red
     * @private
     */
    _guardarPedidoPendiente(orderData) {
        const queue = this._obtenerColaPendiente();
        queue.push({ type: "order", orderData, timestamp: Date.now() });
        this._guardarColaPendiente(queue);
        console.log("[Chuya::Sync] Pedido encolado en LocalStorage. Total pendientes:", queue.length);
    },

    /**
     * Encola una entrega de cáscaras localmente cuando no hay red
     * @private
     */
    _guardarCascarasPendientes(nanoAddress, cantidad) {
        const queue = this._obtenerColaPendiente();
        queue.push({ type: "cascaras", nanoAddress, cantidad, timestamp: Date.now() });
        this._guardarColaPendiente(queue);
        console.log("[Chuya::Sync] Entrega de cáscaras encolada en LocalStorage. Total pendientes:", queue.length);
    }
};

if (typeof window !== "undefined") {
    window.APIService = APIService;
}