/**
 * Chuya - Main Entry Point & Orchestration
 * Stack: JS Vanilla ES6+ (Module)
 * Arquitectura: Frontend Local-First Desacoplado
 */

import { PWAManager } from "./modules/pwa-manager.js";
import { UIControls } from "./modules/ui-controls.js";
import { APIService } from "./modules/api-service.js";
import { NanoWallet } from "./modules/nano-wallet.js";
import { Router } from "./modules/router.js";

document.addEventListener("DOMContentLoaded", async () => {
    console.log("[AveLibre::App] Iniciando ciclo de vida modular Chuya...");

    // 1. Cargar App Shell dinámico (Top bar, Sidebar, Bottom bar)
    if (typeof UILoader !== "undefined") {
        await UILoader.loadAppShell();
    } else {
        console.warn("[AveLibre::App] UILoader no está disponible en el entorno global.");
    }

    // 2. Inicializar controladores de interfaz y subsistema PWA
    UIControls.initSidebar();
    PWAManager.init();

    // 3. Inicializar enrutador SPA para renderizado dinámico por hash
    Router.init();

    // 4. Verificar y/o vincular billetera Nano (XNO) local
    const walletAddress = NanoWallet.obtenerOVincular();
    if (walletAddress) {
        console.log("[AveLibre::App] Billetera Nano vinculada detectada:", walletAddress);
    } else {
        console.warn("[AveLibre::App] Sin billetera Nano vinculada en esta sesión.");
    }

    // 5. Cargar catálogo de productos inicial con soporte Local-First
    await APIService.cargarProductos();

    console.log("[AveLibre::App] Inicialización modular completada con éxito.");
});