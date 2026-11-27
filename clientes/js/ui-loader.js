/**
 * Chuya - UI Loader Module (Clientes PWA)
 * Ubicación: chuya-pwa/clientes/js/ui-loader.js
 * Carga modular y cacheada en memoria de parciales HTML para App Shell en PWA Local-First
 * Stack: JS Vanilla ES6+
 */

const UILoader = {
    _cache: new Map(),
    _requestSeq: new Map(),

    /**
     * Carga un componente parcial mediante fetch (con caché en memoria) y lo inyecta en el contenedor destino.
     * @param {string} url - Ruta del archivo HTML parcial relativa a clientes/index.html.
     * @param {string} targetId - ID del contenedor en el DOM.
     * @param {Object} [options]
     * @param {boolean} [options.bypassCache=false] - Fuerza recarga desde red/Service Worker.
     * @returns {Promise<boolean>}
     */
    async loadPartial(url, targetId, { bypassCache = false } = {}) {
        const cleanUrl = String(url || "").trim();
        console.log(`[Chuya::UILoader] Cargando parcial '${cleanUrl}' hacia '#${targetId}'...`);
        const targetElement = document.getElementById(targetId);

        if (!targetElement) {
            console.error(`[Chuya::UILoader] Contenedor destino '#${targetId}' no encontrado.`);
            return false;
        }

        // Token de secuencia para evitar condiciones de carrera si el usuario cambia rápido de vista
        const nextSeq = (this._requestSeq.get(targetId) || 0) + 1;
        this._requestSeq.set(targetId, nextSeq);

        try {
            let htmlContent;

            if (!bypassCache && this._cache.has(cleanUrl)) {
                htmlContent = this._cache.get(cleanUrl);
                console.log(`[Chuya::UILoader] Parcial '${cleanUrl}' recuperado desde caché en memoria.`);
            } else {
                const response = await fetch(cleanUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} al solicitar ${cleanUrl}`);
                }
                htmlContent = await response.text();
                this._cache.set(cleanUrl, htmlContent);
            }

            // Verificar que no haya una navegación más reciente en curso sobre el mismo contenedor
            if (this._requestSeq.get(targetId) !== nextSeq) {
                console.warn(`[Chuya::UILoader] Inyección descartada para '${cleanUrl}' por navegación más reciente.`);
                return false;
            }

            targetElement.innerHTML = htmlContent;
            console.log(`[Chuya::UILoader] Parcial '${cleanUrl}' renderizado con éxito.`);
            return true;
        } catch (error) {
            this._cache.delete(cleanUrl);
            console.error(`[Chuya::UILoader] Error cargando componente '${cleanUrl}':`, error.message);

            if (this._requestSeq.get(targetId) === nextSeq) {
                const errorBox = document.createElement("div");
                errorBox.className = "error-box";
                errorBox.textContent = `⚠️ Error al cargar componente (${cleanUrl}).`;
                targetElement.innerHTML = "";
                targetElement.appendChild(errorBox);
            }
            return false;
        }
    },

    /**
     * Carga de manera paralela la estructura base del App Shell
     * @returns {Promise<boolean>}
     */
    async loadAppShell() {
        console.log("[Chuya::UILoader] Iniciando ensamble modular del App Shell...");

        const hashActual = (window.location.hash || "").trim().toLowerCase();
        const cargarPrincipal = !hashActual || hashActual === "#inicio";

        const tareas = [
            this.loadPartial("components/top-bar.html", "header-container"),
            this.loadPartial("components/sidebar.html", "sidebar-container"),
            this.loadPartial("components/bottom-bar.html", "bottom-bar-container")
        ];

        if (cargarPrincipal) {
            tareas.push(this.loadPartial("vistas/principal.html", "main-content"));
        }

        const results = await Promise.all(tareas);
        const shellCompleto = results.every((res) => res === true);

        if (shellCompleto) {
            console.log("[Chuya::UILoader] App Shell montado e integrado en el DOM.");
        } else {
            console.warn("[Chuya::UILoader] El App Shell se montó con advertencias/errores parciales.");
        }

        return shellCompleto;
    },

    /**
     * Limpia la caché en memoria de plantillas HTML
     */
    clearCache() {
        this._cache.clear();
        console.log("[Chuya::UILoader] Caché de plantillas HTML limpiada.");
    }
};

if (typeof window !== "undefined") {
    window.UILoader = UILoader;
}