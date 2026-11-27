/**
 * Chuya Clientes - Suite de Pruebas Integral End-to-End (E2E)
 * Ubicación: chuya-pwa/clientes/js/test/test-clientes-e2e.js
 * Valida: Rutas post-reorganización, Service Worker, App Shell, Auth/Firma,
 *         Catálogo Local-First, Carrito/Stock, Cifrado AES-GCM y Router SPA.
 */

export async function runChuyaClientesE2ETest() {
    console.log("==================================================================");
    console.log("🌱 [Chuya::TestE2E] INICIANDO AUDITORÍA INTEGRAL DE chuya-pwa/clientes");
    console.log("==================================================================");

    const stats = { passed: 0, failed: 0, warnings: 0 };

    function assert(condition, message, detail = "") {
        if (condition) {
            console.log(`✅ [PASÓ] ${message}`, detail ? `-> ${detail}` : "");
            stats.passed++;
        } else {
            console.error(`❌ [FALLÓ] ${message}`, detail ? `-> ${detail}` : "");
            stats.failed++;
        }
    }

    function warn(message) {
        console.warn(`⚠️ [AVISO] ${message}`);
        stats.warnings++;
    }

    // Espera reactiva a que un selector aparezca en el DOM (evita fallos por setTimeout fijo)
    async function esperarElementoDOM(selector, timeoutMs = 1500) {
        const inicio = Date.now();
        while (Date.now() - inicio < timeoutMs) {
            const el = document.querySelector(selector);
            if (el) return el;
            await new Promise((r) => setTimeout(r, 40));
        }
        return null;
    }

    // Respaldar estado previo de LocalStorage para restaurarlo al finalizar la prueba
    const storageBackup = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        storageBackup[key] = localStorage.getItem(key);
    }

    const hashOriginal = window.location.hash || "#inicio";

    try {
        /* ------------------------------------------------------------------
           FASE 1: Verificación de Rutas Post-Reorganización, Manifest y SW
           ------------------------------------------------------------------ */
        console.group("📂 FASE 1: Rutas Relativas, Manifest y Service Worker");

        assert(
            window.location.pathname.includes("/clientes"),
            "Ruta base ubicada dentro del dominio /clientes/",
            window.location.pathname
        );

        try {
            const manifestRes = await fetch("manifest.json", { cache: "no-cache" });
            const manifestJson = manifestRes.ok ? await manifestRes.json() : null;
            assert(
                manifestRes.ok && manifestJson?.short_name === "Chuya",
                "manifest.json accesible y configurado con identidad 'Chuya'",
                manifestJson ? `scope: ${manifestJson.scope}` : "Error HTTP"
            );
        } catch (e) {
            assert(false, "manifest.json accesible", e.message);
        }

        if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            const clientSW = regs.find((r) => r.scope.includes("/clientes"));
            assert(
                Boolean(clientSW),
                "Service Worker registrado con scope aislado en /clientes/",
                clientSW ? clientSW.scope : "No registrado aún (recarga una vez si acabas de crear sw.js)"
            );
        } else {
            warn("El navegador actual no soporta Service Workers.");
        }

        // Resolver ruta relativa hacia chuya-pwa/js/modules/crypto-utils.js anclada a clientes/index.html
        let CryptoModule = window.CryptoUtils || null;
        try {
            const cryptoResolvedUrl = new URL("../js/modules/crypto-utils.js", window.location.href).href;
            console.log("[Chuya::TestE2E] Resolviendo módulo compartido:", cryptoResolvedUrl);

            const imported = await import(cryptoResolvedUrl);
            CryptoModule = imported.CryptoUtils || window.CryptoUtils;

            const tieneMetodosCifrado = Boolean(
                CryptoModule &&
                typeof CryptoModule.cifrar === "function" &&
                typeof CryptoModule.descifrar === "function"
            );

            assert(
                tieneMetodosCifrado,
                "Módulo compartido ../js/modules/crypto-utils.js resuelto sin bloqueo MIME",
                cryptoResolvedUrl
            );
        } catch (e) {
            assert(false, "Módulo compartido ../js/modules/crypto-utils.js resuelto sin bloqueo MIME", e.message);
        }

        console.groupEnd();

        /* ------------------------------------------------------------------
           FASE 2: App Shell y Controles WAI-ARIA (UILoader + UIControls)
           ------------------------------------------------------------------ */
        console.group("🧩 FASE 2: App Shell y Accesibilidad WAI-ARIA");

        assert(Boolean(document.querySelector("#header-container *")), "Top Bar inyectado en #header-container");
        assert(Boolean(document.querySelector("#sidebar-container *")), "Sidebar inyectado en #sidebar-container");
        assert(Boolean(document.querySelector("#bottom-bar-container *")), "Bottom Bar inyectado en #bottom-bar-container");

        const sidebar = document.getElementById("sidebar");
        const btnOpenSidebar = document.getElementById("btn-open-sidebar");
        const btnCloseSidebar = document.getElementById("btn-close-sidebar");

        if (sidebar && btnOpenSidebar && btnCloseSidebar) {
            btnOpenSidebar.click();
            const abiertoOK = sidebar.classList.contains("open") && sidebar.getAttribute("aria-hidden") === "false";
            btnCloseSidebar.click();
            const cerradoOK = !sidebar.classList.contains("open") && sidebar.getAttribute("aria-hidden") === "true";
            assert(abiertoOK && cerradoOK, "Sidebar Drawer abre y cierra correctamente con atributos ARIA");
        } else {
            warn("No se encontraron botones de apertura/cierre de sidebar para prueba interactiva.");
        }

        console.groupEnd();

        /* ------------------------------------------------------------------
           FASE 3: Identidad, Sesión y Firma Digital (AuthModule + NanoWallet)
           ------------------------------------------------------------------ */
        console.group("🔐 FASE 3: Sesión Local, Billetera Nano y Firma Digital");

        const auth = window.AuthModule;
        const wallet = window.NanoWallet;

        assert(Boolean(auth && wallet), "Módulos AuthModule y NanoWallet disponibles globalmente");

        if (auth && wallet) {
            const testNano = "nano_1jco93p1w4w8gfuj9ucf7j16h1y6krazcbc6n4trinskfg4uj5mft6y8wnhn";
            const testPGP = "78CC586832CC4831DFDA780201D4EB654D7D8026";

            auth.guardarSesionLocal("Camila Test", testNano, testPGP, "3001234567", "Vereda El Ortigal, Miranda");
            const sesionLeida = auth.obtenerSesion();

            assert(
                sesionLeida?.nombre === "Camila Test" && sesionLeida?.nanoAddress === testNano,
                "Sesión de cliente persistida y recuperada desde chuya_user_session"
            );

            const walletVinculada = wallet.obtenerOBilleteraNano();
            assert(
                walletVinculada === testNano,
                "NanoWallet.obtenerOBilleteraNano() sincronizado con la sesión activa"
            );

            const payloadFirmado = auth.firmarTransaccion({
                totalCOP: 7000,
                items: [{ id: "prod-huevo-u", cantidad: 10 }]
            });
            assert(
                typeof payloadFirmado.firmaDigital === "string" && payloadFirmado.firmaDigital.startsWith("SIG-78CC5868-"),
                "Firma criptográfica adjuntada correctamente al payload del pedido",
                payloadFirmado.firmaDigital
            );
        }

        console.groupEnd();

        /* ------------------------------------------------------------------
           FASE 4: Cifrado Simétrico PII AES-GCM (CryptoUtils.cifrar / descifrar)
           ------------------------------------------------------------------ */
        console.group("🛡️ FASE 4: Cifrado PII AES-GCM (CryptoUtils)");

        if (CryptoModule && typeof CryptoModule.cifrar === "function" && typeof CryptoModule.descifrar === "function") {
            const piiOriginal = "Tel: 3001234567 | Dir: Finca La Esperanza, Miranda";
            const llavePrueba = "78CC586832CC4831DFDA780201D4EB654D7D8026";
            const cifrado = await CryptoModule.cifrar(piiOriginal, llavePrueba);
            const descifrado = await CryptoModule.descifrar(cifrado, llavePrueba);

            assert(
                Boolean(cifrado) && cifrado !== piiOriginal && descifrado === piiOriginal,
                "Cifrado y descifrado reversible AES-GCM verificado en clientes",
                `Ciphertext: ${cifrado.slice(0, 24)}...`
            );
        } else {
            assert(false, "CryptoUtils expone cifrar() y descifrar() correctamente");
        }

        console.groupEnd();

        /* ------------------------------------------------------------------
           FASE 5: Catálogo Local-First y Carrito con Control de Stock
           ------------------------------------------------------------------ */
        console.group("🛒 FASE 5: Catálogo Local-First y Carrito con Validación de Stock");

        const api = window.APIService;
        const cart = window.CartService;

        if (api && cart) {
            const productos = await api.cargarProductos();
            assert(Array.isArray(productos) && productos.length > 0, `Catálogo cargado con ${productos.length} productos`);

            cart.clearCart();
            const prodPrueba = { id: "test-huevo", nombre: "Huevo Prueba", precio: 700, stock: 3, icono: "🥚" };
            const resAdd = cart.addItem(prodPrueba, 5); // Solicitar 5 cuando el stock es 3

            assert(
                resAdd.success === true && resAdd.maxAlcanzado === true && resAdd.totalEnCarrito === 3,
                "CartService limita correctamente la cantidad al stock máximo disponible (3/5)"
            );
            assert(
                cart.getTotalCOP() === 2100,
                "Cálculo total en COP verificado ($2.100 COP)",
                `$${cart.getTotalCOP()} COP`
            );
            cart.clearCart();
        } else {
            assert(false, "APIService y CartService disponibles en ámbito global");
        }

        console.groupEnd();

        /* ------------------------------------------------------------------
           FASE 6: Navegación SPA (Router)
           ------------------------------------------------------------------ */
        console.group("🧭 FASE 6: Enrutador SPA (#catalogo -> #pedidos -> #gana-xno)");

        const router = window.Router;
        if (router && typeof router.navigate === "function") {
            router.navigate("#catalogo");
            const gridCatalogo = await esperarElementoDOM("#productos-grid");
            assert(Boolean(gridCatalogo), "Vista #catalogo renderizada con #productos-grid");

            router.navigate("#pedidos");
            const vistaPedidos = await esperarElementoDOM("#carrito-items-container, #form-confirmar-pedido, #main-content > *");
            assert(Boolean(vistaPedidos), "Vista #pedidos renderizada correctamente");

            router.navigate("#gana-xno");
            const barraCascaras = await esperarElementoDOM("#cascaras");
            assert(Boolean(barraCascaras), "Vista #gana-xno renderizada con barra de progreso #cascaras");
        } else {
            assert(false, "Router SPA disponible en ámbito global");
        }

        console.groupEnd();
    } finally {
        // Detener temporizadores de vistas transitorias antes de restaurar estado
        if (window.GanaNanoView?.detenerSincronizacion) {
            window.GanaNanoView.detenerSincronizacion();
        }

        // Restaurar estado original de LocalStorage y ruta inicial
        localStorage.clear();
        Object.entries(storageBackup).forEach(([k, v]) => localStorage.setItem(k, v));

        if (window.CartService?.updateCartBadge) {
            window.CartService.updateCartBadge();
        }
        if (window.Router?.navigate) {
            window.Router.navigate(hashOriginal);
        }
    }

    console.log("==================================================================");
    console.log(`🏁 [Chuya::TestE2E] RESUMEN FINAL: ${stats.passed} pasadas | ${stats.failed} fallidas | ${stats.warnings} avisos`);
    console.log("==================================================================");

    return stats;
}

if (typeof window !== "undefined") {
    window.runChuyaClientesE2ETest = runChuyaClientesE2ETest;
}

// Auto-ejecutar al cargarse o pegarse en DevTools
runChuyaClientesE2ETest();