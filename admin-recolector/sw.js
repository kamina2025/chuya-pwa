/**
 * Chuya - Service Worker Operativo (Admin & Recolector en Campo)
 * Estrategia: Local-First (App Shell + Módulos ES6 en Caché, API/RPC directo a Red)
 * Ubicación: chuya-pwa/admin-recolector/sw.js
 */

const CACHE_VERSION = "chuya-admin-v1.0.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Recursos críticos del App Shell, parciales HTML y librerías locales
const PRECACHE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/admin-styles.css",
    "./css/ticket-styles.css",
    "./js/admin-app.js",
    "./components/header.html",
    "./components/sidebar.html",
    "./components/sec-registrar-miembro.html",
    "./components/sec-usuarios.html.html",
    "./components/sec-recompensar.html",
    "./components/sec-ticket-generador.html",
    "./components/sec-pedidos.html",
    "./components/sec-inventario.html",
    "./components/bottom-nav.html",
    "../libs/nanocurrency.min.js",
    "../libs/openpgp.min.js",
    "../libs/qrcode.min.js",
    "../libs/jspdf.umd.min.js",
    "../assets/icons/favicon.png",
    "../assets/icons/icon-192.png",
    "../assets/icons/icon-512.png"
];

/* ==========================================================================
   1. INSTALACIÓN: Precarga resiliente de activos locales
   ========================================================================== */
self.addEventListener("install", (event) => {
    console.log(`[Chuya::AdminSW] Instalando Service Worker (${CACHE_VERSION})...`);

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

            console.log(`[Chuya::AdminSW] Precaché completado: ${okCount}/${PRECACHE_ASSETS.length} recursos almacenados.`);
            if (failed.length > 0) {
                console.warn("[Chuya::AdminSW] Recursos opcionales omitidos en precaché:", failed.map((f) => f.reason.message));
            }
        })
    );

    self.skipWaiting();
});

/* ==========================================================================
   2. ACTIVACIÓN: Limpieza de versiones obsoletas de caché
   ========================================================================== */
self.addEventListener("activate", (event) => {
    console.log(`[Chuya::AdminSW] Activando versión ${CACHE_VERSION} y purgando cachés antiguos...`);

    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
                        console.log(`[Chuya::AdminSW] Eliminando caché obsoleta: ${cacheName}`);
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
   3. INTERCEPTACIÓN DE RED (FETCH): Local-First para App Shell y Módulos ES6
   ========================================================================== */
self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Ignorar métodos distintos de GET (POST a Google Apps Script o RPC Nano)
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Excluir APIs externas (Google Apps Script, Google UserContent, Nodo RPC Nano)
    if (
        url.hostname.includes("script.google.com") ||
        url.hostname.includes("googleusercontent.com") ||
        url.hostname.includes("nano.to")
    ) {
        return;
    }

    // Solo gestionar recursos del mismo origen (http/https local o hosting)
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Estrategia Stale-While-Revalidate para mantener módulos JS/CSS/HTML frescos cuando hay red
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
                    console.warn(`[Chuya::AdminSW] Modo Offline activo para: ${url.pathname} (${err.message})`);
                    // Si es navegación directa y no está en caché, devolver index.html del panel
                    if (request.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                    return null;
                });

            return cachedResponse || networkFetch;
        })
    );
});