/**
 * Chuya Admin - Módulo de Configuración Operativa
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 * Ubicación: chuya-pwa/admin-recolector/js/admin-config.js
 * Descripción: Mantiene constantes inmutables para endpoints API,
 * credenciales del operador, rutas de impresión y claves de almacenamiento local.
 */

const RAW_API_URL =
    "https://script.google.com/macros/s/AKfycbwn4fM5DJUJoL7LlbyKtqL4vr21lZC6rjk9DWy5V1yP2W0t-p-WbTDtiPe1Csw5PvmKgA/exec".trim();

const RAW_OPERATOR_ADDRESS =
    "nano_3admin1111111111111111111111111111111111111111111111111111111".trim().toLowerCase();

const CONFIG = {
    APP_NAME: "Chuya Admin",
    BRAND_NAME: "Chuya",
    VERSION: "1.0.0",

    // URL del despliegue Web App de Google Apps Script (Backend REST API)
    API_URL: RAW_API_URL,

    // Nodo RPC público de Nano (XNO) para consultas de saldo y estado
    NANO_RPC_URL: "https://rpc.nano.to",

    // Dirección Nano pública autorizada para el operador/administrador (normalizada)
    OPERATOR_ADDRESS: RAW_OPERATOR_ADDRESS,

    // Rutas relativas para tickets térmicos y vinculación con la PWA cliente
    ROUTES: Object.freeze({
        CLIENT_PWA_INDEX: "../index.html#inicio",
        PRINT_TICKET_TEMPLATE: "./print-ticket.html"
    }),

    // Parámetros operativos de economía circular
    ECONOMY: Object.freeze({
        XNO_PER_META: 0.083,
        COP_PER_META: 100,
        META_CASCARAS: 30,
        META_ASERRIN: 3
    }),

    // Claves de persistencia en LocalStorage para modo offline (Marca Chuya)
    STORAGE_KEYS: Object.freeze({
        ADMIN_WALLET: "chuya_admin_address",
        PENDING_TXS: "chuya_admin_pending_txs",
        USERS_CACHE: "chuya_admin_users_cache",
        ORDERS_CACHE: "chuya_admin_orders_cache",
        INVENTORY_CACHE: "chuya_admin_inventory_cache",
        TICKETS_HISTORY: "chuya_admin_tickets_history"
    }),

    // Claves heredadas para migración segura sin pérdida de datos locales previos
    LEGACY_STORAGE_KEYS: Object.freeze({
        ADMIN_WALLET: "avelibre_admin_address",
        PENDING_TXS: "avelibre_admin_pending_txs",
        USERS_CACHE: "avelibre_admin_users_cache",
        ORDERS_CACHE: "avelibre_admin_orders_cache",
        INVENTORY_CACHE: "avelibre_admin_inventory_cache"
    })
};

// Garantiza inmutabilidad estricta contra modificaciones en runtime
export const ADMIN_CONFIG = Object.freeze(CONFIG);

// Validación diagnóstica de integridad de configuración al arrancar
const isValidNanoFormat = /^(nano|xrb)_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(
    ADMIN_CONFIG.OPERATOR_ADDRESS
);

if (!isValidNanoFormat) {
    console.warn(
        `[Chuya::AdminConfig] Advertencia: OPERATOR_ADDRESS no cumple longitud estándar de 65 caracteres (${ADMIN_CONFIG.OPERATOR_ADDRESS.length}).`
    );
}

console.log(`[Chuya::AdminConfig] Constantes de administración cargadas e inmutabilizadas para ${ADMIN_CONFIG.APP_NAME}.`, {
    version: ADMIN_CONFIG.VERSION,
    apiConfigured: ADMIN_CONFIG.API_URL.startsWith("https://script.google.com/"),
    operatorAddress: ADMIN_CONFIG.OPERATOR_ADDRESS,
    storageKeys: Object.values(ADMIN_CONFIG.STORAGE_KEYS)
});