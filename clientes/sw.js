/**
 * Chuya - Service Worker PWA Clientes
 * Estrategia: Local-First (App Shell, Vistas y Módulos ES6 en Caché; API/RPC directo a Red)
 * Ubicación: chuya-pwa/clientes/sw.js
 */

const CACHE_VERSION = "chuya-clientes-v1.0.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Recursos críticos del App Shell, vistas SPA, módulos ES6+ y compartidos en raíz
const PRECACHE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/styles.css",
    "./css/base.css",
    "./css/layout.css",
    "./css/catalogo.css",
    "./css/gamification.css",
    "./css/login.css",
    "./css/pedidos.css",
    "./css/perfil.css",
    "./css/components/modal.css",
    "./components/top-bar.html",
    "./components/sidebar.html",
    "./components/bottom-bar.html",
    "./vistas/principal.html",
    "./vistas/catalogo.html",
    "./vistas/pedidos.html",
    "./vistas/gana-nano.html",
    "./vistas/billetera.html",
    "./vistas/login.html",
    "./vistas/perfil.html",
    "./js/app.js",
    "./js/config.js",
    "./js/ui-loader.js",
    "./js/modules/api-service.js",
    "./js/modules/auth.js",
    "./js/modules/cart.js",
    "./js/modules/catalogo.js",
    "./js/modules/gana-nano.js",
    "./js/modules/nano-wallet.js",
    "./js/modules/pedidos.js",
    "./js/modules/pwa-manager.js",
    "./js/modules/qr-pdf-importer.js",
    "./js/modules/router.js",
    "./js/modules/ui-controls.js",
    "../js/modules/crypto-utils.js",
    "../assets/icons/favicon.png",
    "../assets/icons/icon-192.png",
    "../assets/icons/icon-512.png"
];

/* ==========================================================================
   1. INSTALACIÓN: Precarga resiliente del App Shell y módulos ES6+
   ========================================================================== */
self.addEventListener("install", (event) => {
    console.log(`[Chuya::ClientesSW] Instalando Service Worker (${CACHE_VERSION})...`);

    event.waitUntil(
        caches.open(STATIC_CACHE).then(async (cache) => {
            const results = await Promise.allSettled(
                PRECACHE_ASSETS.map(async (assetUrl) => {
                    const response = await fetch(assetUrl, { cache: "no-cache" });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} en ${assetUrl}`);
                    }
                    await cache.put(assetUrl, response);
                    return assetUrl;
                })
            );

            const okCount = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.filter((r) => r.status === "rejected");

            console.log(`[Chuya::ClientesSW] Precaché completado: ${okCount}/${PRECACHE_ASSETS.length} recursos almacenados.`);
            if (failed.length > 0) {
                console.warn(
                    "[Chuya::ClientesSW] Recursos opcionales omitidos en precaché:",
                    failed.map((f) => f.reason.message)
                );
            }
        })
    );

    self.skipWaiting();
});

/* ==========================================================================
   2. ACTIVACIÓN: Limpieza de versiones obsoletas de caché
   ========================================================================== */
self.addEventListener("activate", (event) => {
    console.log(`[Chuya::ClientesSW] Activando versión ${CACHE_VERSION} y purgando cachés antiguos...`);

    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
                        console.log(`[Chuya::ClientesSW] Eliminando caché obsoleta: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                    return null;
                })
            )
        )
    );

    self.clients.claim();
});

/* ==========================================================================
   3. INTERCEPTACIÓN DE RED (FETCH): Local-First para App Shell y Módulos ES6+
   ========================================================================== */
self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Ignorar peticiones POST/PUT/DELETE (envío de pedidos, entregas o RPC Nano)
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Excluir APIs dinámicas externas (Google Apps Script, Google UserContent, Nodo RPC Nano)
    if (
        url.hostname.includes("script.google.com") ||
        url.hostname.includes("googleusercontent.com") ||
        url.hostname.includes("nano.to")
    ) {
        return;
    }

    // Permitir caché runtime para CDNs de PDF.js / Html5Qrcode una vez descargados
    const isAllowedCDN =
        url.hostname.includes("cdnjs.cloudflare.com") ||
        url.hostname.includes("unpkg.com");

    if (url.origin !== self.location.origin && !isAllowedCDN) return;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const networkFetch = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(RUNTIME_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch((err) => {
                    console.warn(`[Chuya::ClientesSW] Modo Offline activo para: ${url.pathname} (${err.message})`);
                    if (request.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                    return null;
                });

            return cachedResponse || networkFetch;
        })
    );
});