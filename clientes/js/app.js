/**
 * Chuya - Main Entry Point & Orchestration (Clientes PWA)
 * Ubicación: chuya-pwa/clientes/js/app.js
 * Stack: JS Vanilla ES6+ (Module)
 * Arquitectura: Frontend Local-First Desacoplado
 */

import { PWAManager } from "./modules/pwa-manager.js";
import { UIControls } from "./modules/ui-controls.js";
import { APIService } from "./modules/api-service.js";
import { NanoWallet } from "./modules/nano-wallet.js";
import { Router } from "./modules/router.js";
import { AuthModule } from "./modules/auth.js";
import { CartService } from "./modules/cart.js";

// Mitigar errores asíncronos inofensivos inyectados por extensiones del navegador
if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
        if (event.reason && typeof event.reason.message === "string") {
            if (
                event.reason.message.includes("message channel closed") ||
                event.reason.message.includes("listener indicated an asynchronous response")
            ) {
                event.preventDefault();
                console.warn("[Chuya::App] Excepción de extensión de navegador mitigada.");
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("[Chuya::App] Iniciando ciclo de vida modular Chuya Clientes...");

    if (typeof document !== "undefined") {
        document.title = "Chuya | Tienda & Economía Circular";
    }

    try {
        // 1. Cargar App Shell dinámico (Top bar, Sidebar, Bottom bar)
        const loader = (typeof window !== "undefined" && window.UILoader) || (typeof UILoader !== "undefined" ? UILoader : null);
        if (loader && typeof loader.loadAppShell === "function") {
            await loader.loadAppShell();
            console.log("[Chuya::App] App Shell montado correctamente.");
        } else {
            console.warn("[Chuya::App] UILoader no está disponible en el entorno global.");
        }

        // 2. Inicializar controladores de interfaz, badge del carrito y subsistema PWA
        UIControls.initSidebar();
        if (typeof CartService?.updateCartBadge === "function") {
            CartService.updateCartBadge();
        }
        PWAManager.init();

        // 3. Inicializar enrutador SPA para renderizado dinámico por hash
        Router.init();

        // 4. Verificar sesión de identidad local y billetera Nano (XNO)
        const sesionActiva = typeof AuthModule?.obtenerSesion === "function" ? AuthModule.obtenerSesion() : null;
        if (sesionActiva) {
            console.log("[Chuya::App] Sesión de miembro activa detectada:", sesionActiva.nombre);
        }

        const walletAddress = NanoWallet.obtenerOVincular();
        if (walletAddress) {
            console.log("[Chuya::App] Billetera Nano vinculada detectada:", walletAddress);
        } else {
            console.warn("[Chuya::App] Sin billetera Nano vinculada en esta sesión.");
        }

        // 5. Precargar catálogo inicial Local-First (evitando doble petición si ya entró en #catalogo)
        const hashInicial = (window.location.hash || "#inicio").trim().toLowerCase();
        if (hashInicial !== "#catalogo") {
            await APIService.cargarProductos();
        }

        console.log("[Chuya::App] Inicialización modular completada con éxito.");
    } catch (error) {
        console.error("[Chuya::App] Error crítico durante el ciclo de vida de la aplicación:", error.message);
    }
});