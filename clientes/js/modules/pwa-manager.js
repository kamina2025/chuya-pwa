/**
 * Chuya - Gestor PWA (Service Worker, Instalador, Conectividad y Sincronización)
 * Ubicación: chuya-pwa/clientes/js/modules/pwa-manager.js
 * Stack: JS Vanilla ES6+
 */

import { APIService } from "./api-service.js";

let deferredPrompt = null;

export const PWAManager = {
    _initialized: false,

    /**
     * Inicializa el Service Worker, prompt de instalación y monitoreo de red
     */
    init() {
        if (this._initialized) {
            console.log("[Chuya::PWAManager] Subsistema PWA ya inicializado. Omitiendo duplicado.");
            return;
        }
        this._initialized = true;

        console.log("[Chuya::PWAManager] Inicializando subsistema PWA Chuya Clientes...");
        this.registerServiceWorker();
        this.initPWAInstaller();
        this.initNetworkListeners();
    },

    /**
     * Registra el Service Worker local (clientes/sw.js) y supervisa actualizaciones
     */
    registerServiceWorker() {
        if (!("serviceWorker" in navigator)) {
            console.warn("[Chuya::PWAManager] Service Worker no soportado en este navegador.");
            return;
        }

        navigator.serviceWorker
            .register("sw.js")
            .then((reg) => {
                console.log("[Chuya::PWAManager] Service Worker activo. Scope:", reg.scope);

                reg.addEventListener("updatefound", () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;

                    console.log("[Chuya::PWAManager] Nueva actualización de Service Worker detectada...");
                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            console.log("[Chuya::PWAManager] Nueva versión lista. Se aplicará al recargar.");
                        }
                    });
                });
            })
            .catch((err) => {
                console.error("[Chuya::PWAManager] Error registrando Service Worker:", err.message);
            });
    },

    /**
     * Gestiona el flujo de instalación nativa PWA (beforeinstallprompt / appinstalled)
     */
    initPWAInstaller() {
        const getInstallButtons = () => [
            document.getElementById("btn-install-pwa"),
            document.getElementById("btn-install-sidebar")
        ].filter(Boolean);

        const toggleInstallButtons = (show) => {
            getInstallButtons().forEach((btn) => {
                btn.classList.toggle("hidden", !show);
            });
        };

        // Si ya está ejecutándose como app instalada, mantener botones ocultos
        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true;

        if (isStandalone) {
            console.log("[Chuya::PWAManager] Ejecutando en modo Standalone (PWA instalada).");
            toggleInstallButtons(false);
        }

        window.addEventListener("beforeinstallprompt", (e) => {
            console.log("[Chuya::PWAManager] Capturado evento 'beforeinstallprompt'.");
            e.preventDefault();
            deferredPrompt = e;
            toggleInstallButtons(true);
        });

        const triggerInstall = async () => {
            if (!deferredPrompt) {
                console.warn("[Chuya::PWAManager] No hay prompt de instalación disponible.");
                return;
            }

            console.log("[Chuya::PWAManager] Desplegando diálogo nativo de instalación...");
            deferredPrompt.prompt();

            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[Chuya::PWAManager] Decisión del usuario: ${outcome}`);

            deferredPrompt = null;
            toggleInstallButtons(false);
        };

        // Delegación de eventos para soportar botones cargados dinámicamente por UILoader
        document.addEventListener("click", (e) => {
            const targetBtn = e.target.closest("#btn-install-pwa, #btn-install-sidebar");
            if (targetBtn) {
                triggerInstall();
            }
        });

        window.addEventListener("appinstalled", () => {
            console.log("[Chuya::PWAManager] Aplicación Chuya Clientes instalada exitosamente.");
            deferredPrompt = null;
            toggleInstallButtons(false);
        });
    },

    /**
     * Monitorea conectividad y vacía la cola offline de pedidos/cáscaras al reconectar
     */
    initNetworkListeners() {
        window.addEventListener("online", async () => {
            console.log("[Chuya::PWAManager] Conectividad restablecida. Ejecutando sincronización...");
            if (typeof APIService?.sincronizarPedidosPendientes === "function") {
                await APIService.sincronizarPedidosPendientes();
            }
        });

        window.addEventListener("offline", () => {
            console.warn("[Chuya::PWAManager] Sin conexión a red. Modo Local-First activado.");
        });

        // Si arranca con conexión, intentar vaciar cola pendiente de sesiones anteriores
        if (navigator.onLine && typeof APIService?.sincronizarPedidosPendientes === "function") {
            APIService.sincronizarPedidosPendientes();
        }
    }
};

if (typeof window !== "undefined") {
    window.PWAManager = PWAManager;
}