/**
 * Chuya - Módulo de Configuración y Constantes
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 * Ubicación: chuya-pwa/js/config.js
 */

export const CONFIG = Object.freeze({
    APP_NAME: "Chuya",
    API_URL: "https://script.google.com/macros/s/AKfycbybDwZJ6FcLI44OqqRl1a45L2obasVRT2G4QeaElZVHMWPzytfF91HjFhfmzwl8civsGA/exec",
    NANO_RPC_URL: "https://rpc.nano.to",
    STORAGE_KEYS: Object.freeze({
        PRODUCTS: "chuya_products_cache",
        NANO_ADDRESS: "chuya_nano_address",
        PENDING_ORDERS: "chuya_pending_orders",
        USER_SESSION: "chuya_user_session",
        USER_METAS: "chuya_user_metas",
        CURRENT_CART: "chuya_current_cart",
        DISCOUNT_APPLIED: "chuya_descuento_aplicado"
    }),
    LEGACY_STORAGE_KEYS: Object.freeze({
        PRODUCTS: "avelibre_products_cache",
        NANO_ADDRESS: "nano_address",
        PENDING_ORDERS: "avelibre_pending_orders",
        USER_SESSION: "avelibre_user_session",
        USER_METAS: "avelibre_user_metas",
        CURRENT_CART: "avelibre_current_cart"
    })
});

console.log(`[Chuya::Config] Constantes de entorno cargadas correctamente para ${CONFIG.APP_NAME}.`, {
    apiConfigured: Boolean(CONFIG.API_URL),
    rpcUrl: CONFIG.NANO_RPC_URL,
    storageKeys: Object.values(CONFIG.STORAGE_KEYS)
});