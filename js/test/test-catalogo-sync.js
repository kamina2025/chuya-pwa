/**
 * Chuya - Suite de Prueba de Sincronización en Tiempo Real de Google Sheets -> PWA
 * Ejecutar en la consola del navegador sobre la vista #catalogo
 */
(async function testCatalogoSync() {
    console.log("==================================================");
    console.log("[AveLibre::Test] Iniciando prueba de sincronización Sheets -> LocalStorage...");
    console.log("==================================================");

    let testResults = { passed: 0, failed: 0 };

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ [PASÓ] ${message}`);
            testResults.passed++;
        } else {
            console.error(`❌ [FALLÓ] ${message}`);
            testResults.failed++;
        }
    }

    // 1. Intentar vincular APIService probando rutas de módulos locales sin errores de red descontrolados
    if (!window.APIService) {
        console.warn("[AveLibre::Test] APIService no hallado en window. Resolviendo módulo dinámicamente...");
        const modulePaths = ["./js/modules/api-service.js", "../js/modules/api-service.js"];
        for (const path of modulePaths) {
            try {
                const module = await import(path);
                if (module?.APIService) {
                    window.APIService = module.APIService;
                    console.log(`[AveLibre::Test] Módulo APIService cargado dinámicamente desde: ${path}`);
                    break;
                }
            } catch (e) {
                // Silenciar intentos fallidos
            }
        }
    }

    const apiDisponible = window.APIService && typeof window.APIService.cargarProductos === "function";
    assert(apiDisponible, "APIService.cargarProductos está activo en la sesión");

    if (!apiDisponible) {
        console.error("[AveLibre::Test] Abortando prueba: APIService no pudo ser inicializado.");
        return;
    }

    // 2. Petición HTTP directa a Google Sheets para forzar actualización de red
    console.log("[AveLibre::Test] Solicitando catálogo actualizado a Google Sheets...");
    const productosRed = await window.APIService.cargarProductos();
    
    assert(Array.isArray(productosRed) && productosRed.length > 0, "Catálogo devuelto por Google Sheets contiene registros válidos");

    // 3. Inspección y auditoría de la caché local (LocalStorage)
    const localCacheRaw = localStorage.getItem("avelibre_products_cache");
    const localCache = localCacheRaw ? JSON.parse(localCacheRaw) : [];
    assert(localCache.length === productosRed.length, "La caché LocalStorage (avelibre_products_cache) se actualizó correctamente");

    // 4. Ubicar el producto 'prod-huevo-u' y auditar el valor reflejado
    const huevoProd = productosRed.find(p => p.id === "prod-huevo-u");
    if (huevoProd) {
        console.log(`[AveLibre::Test] ➔ Stock actual de 'Huevo Campesino Fresco (Unidad)' devuelto por Sheets: ${huevoProd.stock}`);
        assert(huevoProd.stock !== undefined, `Propiedad stock leída exitosamente: ${huevoProd.stock} Unid.`);
    } else {
        assert(false, "Producto 'prod-huevo-u' no fue encontrado en la respuesta del catálogo");
    }

    // 5. Re-renderizado reactivo del DOM si el módulo CatalogoView está montado
    if (window.CatalogoView && typeof window.CatalogoView.init === "function") {
        console.log("[AveLibre::Test] Re-renderizando vista del catálogo en la interfaz...");
        await window.CatalogoView.init();
    }

    console.log("==================================================");
    console.log(`[AveLibre::Test] Resumen de Sincronización: ${testResults.passed} pasadas, ${testResults.failed} fallidas.`);
    console.log("==================================================");
})();