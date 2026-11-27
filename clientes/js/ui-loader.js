/**
 * Chuya - UI Loader Module
 * Carga modular de parciales HTML para App Shell en PWA Local-First
 * Stack: JS Vanilla ES6+
 */

const UILoader = {
    /**
     * Carga un componente parcial mediante fetch y lo inyecta en el contenedor destino.
     * @param {string} url - Ruta del archivo HTML parcial.
     * @param {string} targetId - ID del contenedor en el DOM.
     * @returns {Promise<boolean>}
     */
    async loadPartial(url, targetId) {
        console.log(`[AveLibre::UILoader] Cargando parcial '${url}' hacia '#${targetId}'...`);
        const targetElement = document.getElementById(targetId);

        if (!targetElement) {
            console.error(`[AveLibre::UILoader] Contenedor destino '#${targetId}' no encontrado.`);
            return false;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} al solicitar ${url}`);
            }

            const htmlContent = await response.text();
            targetElement.innerHTML = htmlContent;
            console.log(`[AveLibre::UILoader] Parcial '${url}' renderizado con éxito.`);
            return true;
        } catch (error) {
            console.error(`[AveLibre::UILoader] Error cargando componente '${url}':`, error.message);
            targetElement.innerHTML = `<div class="error-box">Error al cargar componente.</div>`;
            return false;
        }
    },

    /**
     * Carga de manera paralela la estructura completa del App Shell
     * @returns {Promise<boolean>}
     */
    async loadAppShell() {
        console.log("[AveLibre::UILoader] Iniciando ensamble modular del App Shell...");
        
        const results = await Promise.all([
            this.loadPartial("components/top-bar.html", "header-container"),
            this.loadPartial("components/sidebar.html", "sidebar-container"),
            this.loadPartial("components/bottom-bar.html", "bottom-bar-container"),
            this.loadPartial("vistas/principal.html", "main-content")
        ]);

        const shellCompleto = results.every(res => res === true);
        if (shellCompleto) {
            console.log("[AveLibre::UILoader] App Shell montado e integrado en el DOM.");
        } else {
            console.warn("[AveLibre::UILoader] El App Shell se montó con advertencias/errores parciales.");
        }
        
        return shellCompleto;
    }
};