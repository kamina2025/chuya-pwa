/**
 * Chuya Admin - Módulo Cargador de Componentes Parciales HTML
 * Permite la inyección asíncrona de vistas parciales con soporte para componentes anidados,
 * caché en memoria y detección de referencias circulares.
 * Stack: JS Vanilla ES6+ (Local-First)
 */

export const ComponentLoader = {
    _cache: new Map(),

    /**
     * Escapa caracteres HTML básicos para mensajes de error seguros en el DOM
     * @private
     */
    _escapeHTML(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    /**
     * Obtiene el contenido HTML de un parcial usando caché en memoria cuando está disponible
     * @private
     */
    async _fetchPartialHTML(filePath) {
        if (this._cache.has(filePath)) {
            console.log(`[Chuya::Loader] Parcial recuperado desde caché en memoria: ${filePath}`);
            return this._cache.get(filePath);
        }

        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status} cargando ${filePath}`);
        }

        const htmlText = await response.text();
        this._cache.set(filePath, htmlText);
        return htmlText;
    },

    /**
     * Busca todos los elementos con el atributo data-component y los reemplaza con su contenido HTML.
     * Resuelve de forma iterativa componentes anidados y previene bucles infinitos o circulares.
     * @param {Object} [options]
     * @param {boolean} [options.bypassCache=false] - Fuerza recarga desde red/Service Worker
     * @returns {Promise<{ cargados: number, errores: number }>}
     */
    async cargarComponentes({ bypassCache = false } = {}) {
        if (bypassCache) {
            this._cache.clear();
            console.log("[Chuya::Loader] Caché de parciales limpiada para recarga fresca.");
        }

        let maxProfundidad = 5;
        let slots = document.querySelectorAll("[data-component]");
        let totalCargados = 0;
        let totalErrores = 0;

        if (slots.length > 0) {
            console.log(`[Chuya::Loader] Iniciando inyección de ${slots.length} componente(s) parcial(es)...`);
        }

        while (slots.length > 0 && maxProfundidad > 0) {
            const promesas = Array.from(slots).map(async (slot) => {
                const filePath = String(slot.getAttribute("data-component") || "").trim();
                if (!filePath) {
                    slot.removeAttribute("data-component");
                    return;
                }

                const parentChain = (slot.getAttribute("data-parent-chain") || "")
                    .split("|")
                    .filter(Boolean);

                if (parentChain.includes(filePath)) {
                    console.error(`[Chuya::Loader] Referencia circular detectada y bloqueada: ${[...parentChain, filePath].join(" -> ")}`);
                    slot.removeAttribute("data-component");
                    totalErrores++;
                    return;
                }

                try {
                    const htmlText = await this._fetchPartialHTML(filePath);

                    if (slot.parentNode) {
                        const range = document.createRange();
                        const fragment = range.createContextualFragment(htmlText);

                        // Propagar cadena de ancestros a sub-componentes anidados
                        const nextChain = [...parentChain, filePath].join("|");
                        fragment.querySelectorAll("[data-component]").forEach((childSlot) => {
                            childSlot.setAttribute("data-parent-chain", nextChain);
                        });

                        slot.replaceWith(fragment);
                        totalCargados++;
                        console.log(`[Chuya::Loader] Parcial inyectado: ${filePath}`);
                    }
                } catch (err) {
                    totalErrores++;
                    console.error(`[Chuya::Loader] Fallo al cargar componente: ${filePath}`, err);

                    if (slot.parentNode) {
                        const safePath = this._escapeHTML(filePath);
                        slot.innerHTML = `<div style="color:#b91c1c; background:#fee2e2; padding:8px; border-radius:4px; font-size:11px;">⚠️ Fallo al cargar: ${safePath}</div>`;
                        slot.removeAttribute("data-component");
                    }
                }
            });

            await Promise.all(promesas);
            maxProfundidad--;
            slots = document.querySelectorAll("[data-component]");
        }

        if (maxProfundidad === 0 && document.querySelectorAll("[data-component]").length > 0) {
            console.warn("[Chuya::Loader] Se alcanzó el límite de profundidad (5) de componentes anidados.");
        } else {
            console.log(`[Chuya::Loader] Inyección finalizada (${totalCargados} cargados, ${totalErrores} errores).`);
        }

        return { cargados: totalCargados, errores: totalErrores };
    }
};

if (typeof window !== "undefined") {
    window.ComponentLoader = ComponentLoader;
}