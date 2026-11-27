/**
 * Chuya - Módulo de Configuración y Constantes (Clientes PWA)
 * Ubicación: chuya-pwa/clientes/js/config.js
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

const RAW_API_URL =
    "https://script.google.com/macros/s/AKfycbwn4fM5DJUJoL7LlbyKtqL4vr21lZC6rjk9DWy5V1yP2W0t-p-WbTDtiPe1Csw5PvmKgA/exec".trim();

export const CONFIG = Object.freeze({
    APP_NAME: "Chuya",
    BRAND_NAME: "Chuya",
    VERSION: "1.0.0",

    // Endpoint REST de Google Apps Script (verificar coincidencia con admin-config.js)
    API_URL: RAW_API_URL,

    // Nodo RPC público de Nano (XNO)
    NANO_RPC_URL: "https://rpc.nano.to",

    // Parámetros de conversión y economía circular
    ECONOMY: Object.freeze({
        XNO_PER_META: 0.083,
        COP_PER_META: 100,
        META_CASCARAS: 30,
        META_ASERRIN: 3
    }),

    // Claves estandarizadas en LocalStorage (Marca Chuya)
    STORAGE_KEYS: Object.freeze({
        PRODUCTS: "chuya_products_cache",
        NANO_ADDRESS: "chuya_nano_address",
        WALLET_BALANCE: "chuya_wallet_balance_cache",
        PENDING_ORDERS: "chuya_pending_orders",
        USER_SESSION: "chuya_user_session",
        USER_METAS: "chuya_user_metas",
        CURRENT_CART: "chuya_current_cart",
        DISCOUNT_APPLIED: "chuya_descuento_aplicado"
    }),

    // Claves heredadas para migración automática sin pérdida de datos locales
    LEGACY_STORAGE_KEYS: Object.freeze({
        PRODUCTS: "avelibre_products_cache",
        NANO_ADDRESS: "nano_address",
        NANO_WALLET_ALT: "avelibre_nano_wallet",
        PENDING_ORDERS: "avelibre_pending_orders",
        USER_SESSION: "avelibre_user_session",
        USER_METAS: "avelibre_user_metas",
        CURRENT_CART: "avelibre_current_cart",
        DISCOUNT_APPLIED: "avelibre_descuento_aplicado"
    })
});

if (typeof window !== "undefined") {
    window.CONFIG = CONFIG;
}

console.log(`[Chuya::Config] Constantes de entorno cargadas correctamente para ${CONFIG.APP_NAME}.`, {
    version: CONFIG.VERSION,
    apiConfigured: CONFIG.API_URL.startsWith("https://script.google.com/"),
    rpcUrl: CONFIG.NANO_RPC_URL,
    storageKeys: Object.values(CONFIG.STORAGE_KEYS)
});