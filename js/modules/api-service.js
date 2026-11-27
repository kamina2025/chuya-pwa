/**
 * Chuya - Servicio API REST (Google Apps Script) & Local-First Sync
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

export const APIService = {
    /**
     * Carga el catálogo de productos con respaldo Local-First y fallback de semillas
     * @returns {Promise<Array>}
     */
    async cargarProductos() {
        console.log("[AveLibre::API] Solicitando catálogo de productos a la red...");
        try {
            const res = await fetch(`${CONFIG.API_URL}?action=getProducts`, {
                method: "GET",
                redirect: "follow"
            });

            if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);

            const result = await res.json();
            
            // Validar respuesta interna estructurada de Google Apps Script
            if (result.status === "error") {
                throw new Error(result.message || "Error devuelto por el servidor backend.");
            }

            const productos = result.data || [];

            if (productos.length > 0) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS || "avelibre_products_cache", JSON.stringify(productos));
                console.log("[AveLibre::API] Catálogo actualizado exitosamente desde la red:", productos);
                return productos;
            } else {
                throw new Error("El catálogo devuelto por la red está vacío.");
            }
        } catch (error) {
            console.warn(`[AveLibre::API] Fallo de red/servidor (${error.message}). Recurriendo a caché o datos semilla...`);
            
            const cachedData = this._obtenerStorageSeguro(CONFIG.STORAGE_KEYS.PRODUCTS || "avelibre_products_cache");
            if (cachedData && cachedData.length > 0) {
                console.log("[AveLibre::API] Catálogo recuperado exitosamente desde LocalStorage:", cachedData);
                return cachedData;
            }

            // Fallback Local-First si es el primer inicio y la red falla
            console.warn("[AveLibre::API] LocalStorage vacío o corrupto. Inicializando catálogo con datos semilla...");
            localStorage.setItem(CONFIG.STORAGE_KEYS.PRODUCTS || "avelibre_products_cache", JSON.stringify(PRODUCTOS_SEMILLA));
            return PRODUCTOS_SEMILLA;
        }
    },

    /**
     * Envía un pedido o lo almacena en la cola local si el dispositivo está offline
     * @param {Object} orderData 
     * @returns {Promise<Object>}
     */
    async enviarPedido(orderData) {
        console.log("[AveLibre::API] Preparando envío de pedido:", orderData);

        if (!navigator.onLine) {
            console.warn("[AveLibre::API] Dispositivo offline. Guardando pedido en cola local.");
            this._guardarPedidoPendiente(orderData);
            return { success: true, offline: true, message: "Pedido guardado localmente." };
        }

        try {
            const result = await this._postData("createOrder", { action: "createOrder", order: orderData });
            console.log("[AveLibre::API] Pedido procesado exitosamente por la API:", result);
            return { success: true, data: result };
        } catch (error) {
            console.error("[AveLibre::API] Error enviando pedido. Encolando localmente:", error.message);
            this._guardarPedidoPendiente(orderData);
            return { success: false, offline: true, error: error.message };
        }
    },

    /**
     * Registra las cáscaras de huevo recicladas para gamificación
     * @param {string} nanoAddress 
     * @param {number} cantidad 
     * @returns {Promise<Object>}
     */
    async entregarCascaras(nanoAddress, cantidad) {
        console.log(`[AveLibre::API] Registrando ${cantidad} cáscaras para wallet: ${nanoAddress}`);

        const esValida = typeof NanoWallet?.esDireccionValida === "function" 
            ? NanoWallet.esDireccionValida(nanoAddress)
            : (typeof nanoAddress === "string" && /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/.test(nanoAddress.trim()));

        if (!esValida || cantidad <= 0) {
            console.error("[AveLibre::API] Parámetros no válidos para la entrega de cáscaras.");
            return { success: false, error: "Dirección Nano o cantidad no válida" };
        }

        if (!navigator.onLine) {
            console.warn("[AveLibre::API] Sin conexión a red. Guardando entrega de cáscaras en cola offline.");
            this._guardarCascarasPendientes(nanoAddress, cantidad);
            return { success: true, offline: true, message: "Entrega registrada en cola offline local." };
        }

        try {
            const payload = {
                action: "registerCascaras",
                nanoAddress,
                cantidadCascaras: cantidad
            };
            const result = await this._postData("registerCascaras", payload);
            console.log("[AveLibre::API] Cáscaras registradas con éxito:", result);
            return { success: true, data: result };
        } catch (error) {
            console.error("[AveLibre::API] Error al registrar cáscaras. Guardando en cola local:", error.message);
            this._guardarCascarasPendientes(nanoAddress, cantidad);
            return { success: false, offline: true, error: error.message };
        }
    },

    /**
     * Procesa y sincroniza los elementos almacenados en la cola offline (pedidos y cáscaras)
     */
    async sincronizarPedidosPendientes() {
        const queueKey = CONFIG.STORAGE_KEYS.PENDING_ORDERS || "avelibre_pending_orders";
        const queue = this._obtenerStorageSeguro(queueKey) || [];
        if (queue.length === 0) return;

        console.log(`[AveLibre::Sync] Procesando sincronización de ${queue.length} elementos pendientes...`);
        const remainingQueue = [];

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
                console.log(`[AveLibre::Sync] Elemento encolado (${item.type || 'order'}) sincronizado exitosamente:`, result);
            } catch (error) {
                console.warn("[AveLibre::Sync] No se pudo sincronizar elemento encolado, reintentando luego:", error.message);
                remainingQueue.push(item);
            }
        }

        localStorage.setItem(queueKey, JSON.stringify(remainingQueue));
    },

    /**
     * Helper para enviar peticiones POST conservando la acción en la query string
     * Previene que la acción se pierda durante las redirecciones HTTP 302 de Google Apps Script
     * @private
     */
    async _postData(action, bodyPayload) {
        const url = `${CONFIG.API_URL}?action=${encodeURIComponent(action)}`;
        const res = await fetch(url, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(bodyPayload)
        });

        if (!res.ok) throw new Error(`HTTP Status ${res.status}`);

        const result = await res.json();
        if (result.status === "error") throw new Error(result.message || "Error procesando solicitud en backend");

        return result;
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
            console.error(`[AveLibre::API] Error de lectura JSON en LocalStorage para '${key}':`, e.message);
            return null;
        }
    },

    /**
     * Encola un pedido localmente cuando no hay red
     * @private
     */
    _guardarPedidoPendiente(orderData) {
        const queueKey = CONFIG.STORAGE_KEYS.PENDING_ORDERS || "avelibre_pending_orders";
        const queue = this._obtenerStorageSeguro(queueKey) || [];
        queue.push({ type: "order", orderData, timestamp: Date.now() });
        localStorage.setItem(queueKey, JSON.stringify(queue));
        console.log("[AveLibre::Sync] Pedido encolado en LocalStorage. Total pendientes:", queue.length);
    },

    /**
     * Encola una entrega de cáscaras localmente cuando no hay red
     * @private
     */
    _guardarCascarasPendientes(nanoAddress, cantidad) {
        const queueKey = CONFIG.STORAGE_KEYS.PENDING_ORDERS || "avelibre_pending_orders";
        const queue = this._obtenerStorageSeguro(queueKey) || [];
        queue.push({ type: "cascaras", nanoAddress, cantidad, timestamp: Date.now() });
        localStorage.setItem(queueKey, JSON.stringify(queue));
        console.log("[AveLibre::Sync] Entrega de cáscaras encolada en LocalStorage. Total pendientes:", queue.length);
    }
};

// Exportación explícita e incondicional al objeto global window
window.APIService = APIService;