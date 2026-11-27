/**
 * Chuya - Suite de Diagnóstico y Prueba Directa para Gana Nano / Economía Circular
 * Copiar y pegar en la consola del navegador sobre la vista #gana-xno
 */
(async function diagnosticoGanaNano() {
    console.log("==================================================");
    console.log("[AveLibre::Test] Diagnóstico e Inspección de Datos Gana Nano...");
    console.log("==================================================");

    // 1. Verificar lo que existe actualmente en LocalStorage
    const metasLocales = localStorage.getItem("avelibre_user_metas");
    const walletLocal = localStorage.getItem("nano_address") || localStorage.getItem("avelibre_nano_wallet");

    console.log("[AveLibre::Test] Dirección Nano vinculada en LocalStorage:", walletLocal || "⚠️ Ninguna billetera vinculada");
    console.log("[AveLibre::Test] Datos raw en 'avelibre_user_metas':", metasLocales || "⚠️ No hay caché de metas guardada");

    // 2. Inyectar datos de prueba garantizados para forzar reflejo en el DOM
    const datosPrueba = {
        cascaras: { actual: 21, max: 30 },
        aserrin: { actual: 2.5, max: 3 }, // 2 bultos y medio
        descuentoCOP: 200,
        descuentoXNO: 0.166
    };

    localStorage.setItem("avelibre_user_metas", JSON.stringify(datosPrueba));
    console.log("[AveLibre::Test] Datos de prueba inyectados en LocalStorage:", datosPrueba);

    // 3. Forzar re-inicialización y renderizado desde el controlador GanaNanoView
    if (window.GanaNanoView && typeof window.GanaNanoView.init === "function") {
        console.log("[AveLibre::Test] Ejecutando window.GanaNanoView.init()...");
        await window.GanaNanoView.init();
    } else if (window.GanaNanoView && typeof window.GanaNanoView.renderMetas === "function") {
        console.log("[AveLibre::Test] Ejecutando window.GanaNanoView.renderMetas()...");
        window.GanaNanoView.renderMetas(datosPrueba);
    } else {
        console.warn("[AveLibre::Test] GanaNanoView no hallado globalmente. Forzando inyección directa al DOM...");
        const cProg = document.getElementById("cascaras");
        const cNum = document.getElementById("cascaras-num");
        const aProg = document.getElementById("aserrin");
        const aNum = document.getElementById("aserrin-num");
        const rTexto = document.getElementById("recompensa-texto");

        if (cProg) cProg.value = datosPrueba.cascaras.actual;
        if (cNum) cNum.textContent = `${datosPrueba.cascaras.actual} / ${datosPrueba.cascaras.max} Unid.`;
        if (aProg) aProg.value = datosPrueba.aserrin.actual;
        if (aNum) aNum.textContent = `${datosPrueba.aserrin.actual} / ${datosPrueba.aserrin.max} Bultos`;
        if (rTexto) rTexto.innerHTML = `🎉 Tienes <strong>${datosPrueba.descuentoXNO} XNO</strong> ($${datosPrueba.descuentoCOP} COP) acumulados.`;
    }

    // 4. Inspeccionar el estado real del DOM tras el renderizado
    console.log("--------------------------------------------------");
    console.log("[AveLibre::Test] AUDITORÍA DE ELEMENTOS HTML EN PANTALLA:");
    
    const elemCascaras = document.getElementById("cascaras");
    const elemCascarasNum = document.getElementById("cascaras-num");
    const elemAserrin = document.getElementById("aserrin");
    const elemAserrinNum = document.getElementById("aserrin-num");
    const elemRecompensa = document.getElementById("recompensa-texto");

    console.log("  • Progreso Cáscaras (<progress>):", elemCascaras ? `${elemCascaras.value}/${elemCascaras.max}` : "❌ No encontrado (#cascaras)");
    console.log("  • Texto Cáscaras (<span>):", elemCascarasNum ? elemCascarasNum.textContent : "❌ No encontrado (#cascaras-num)");
    console.log("  • Progreso Aserrín (<progress>):", elemAserrin ? `${elemAserrin.value}/${elemAserrin.max}` : "❌ No encontrado (#aserrin)");
    console.log("  • Texto Aserrín (<span>):", elemAserrinNum ? elemAserrinNum.textContent : "❌ No encontrado (#aserrin-num)");
    console.log("  • Cuadro Recompensa (<div>):", elemRecompensa ? elemRecompensa.textContent.trim() : "❌ No encontrado (#recompensa-texto)");
    console.log("==================================================");
})();