/**
 * Chuya - Gestor PWA (Service Worker, Instalador, Conectividad)
 * Stack: JS Vanilla ES6+
 */

import { APIService } from "./api-service.js";

let deferredPrompt = null;

export const PWAManager = {
    /**
     * Inicializa el Service Worker, prompt de instalación y monitoreo de red
     */
    init() {
        console.log("[AveLibre::PWAManager] Inicializando subsistema PWA...");
        this.registerServiceWorker();
        this.initPWAInstaller();
        this.initNetworkListeners();
    },

    registerServiceWorker() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("sw.js")
                .then((reg) => console.log("[AveLibre::PWAManager] Service Worker activo. Scope:", reg.scope))
                .catch((err) => console.error("[AveLibre::PWAManager] Error en Service Worker:", err));
        }
    },

    initPWAInstaller() {
        const btnHeader = document.getElementById("btn-install-pwa");
        const btnSidebar = document.getElementById("btn-install-sidebar");

        window.addEventListener("beforeinstallprompt", (e) => {
            console.log("[AveLibre::PWAManager] Capturado evento 'beforeinstallprompt'.");
            e.preventDefault();
            deferredPrompt = e;

            if (btnHeader) btnHeader.classList.remove("hidden");
            if (btnSidebar) btnSidebar.classList.remove("hidden");
        });

        const triggerInstall = async () => {
            if (!deferredPrompt) {
                console.warn("[AveLibre::PWAManager] No hay prompt de instalación disponible.");
                return;
            }

            console.log("[AveLibre::PWAManager] Desplegando diálogo nativo de instalación...");
            deferredPrompt.prompt();

            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[AveLibre::PWAManager] Decisión del usuario: ${outcome}`);

            deferredPrompt = null;
            if (btnHeader) btnHeader.classList.add("hidden");
            if (btnSidebar) btnSidebar.classList.add("hidden");
        };

        if (btnHeader) btnHeader.addEventListener("click", triggerInstall);
        if (btnSidebar) btnSidebar.addEventListener("click", triggerInstall);

        window.addEventListener("appinstalled", () => {
            console.log("[AveLibre::PWAManager] Aplicación PWA instalada exitosamente.");
            deferredPrompt = null;
            if (btnHeader) btnHeader.classList.add("hidden");
            if (btnSidebar) btnSidebar.classList.add("hidden");
        });
    },

    initNetworkListeners() {
        window.addEventListener("online", () => {
            console.log("[AveLibre::PWAManager] Conectividad restablecida. Ejecutando sincronización...");
            APIService.sincronizarPedidosPendientes();
        });

        window.addEventListener("offline", () => {
            console.warn("[AveLibre::PWAManager] Sin conexión. Modo Local-First activado.");
        });
    }
};