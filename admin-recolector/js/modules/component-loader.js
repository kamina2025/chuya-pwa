/**
 * Chuya Admin - Módulo Cargador de Componentes Parciales HTML
 * Permite la inyección asíncrona de vistas parciales con soporte para componentes anidados.
 * Stack: JS Vanilla ES6+
 */

export const ComponentLoader = {
    /**
     * Busca todos los elementos con el atributo data-component y los reemplaza con su contenido HTML.
     * Resuelve de forma iterativa componentes anidados y previene bucles infinitos.
     */
    async cargarComponentes() {
        let maxProfundidad = 5; // Límite defensivo para evitar bucles de carga circular
        let slots = document.querySelectorAll("[data-component]");

        while (slots.length > 0 && maxProfundidad > 0) {
            const promesas = Array.from(slots).map(async (slot) => {
                const filePath = slot.getAttribute("data-component");
                if (!filePath) return;

                try {
                    const response = await fetch(filePath);
                    if (!response.ok) {
                        throw new Error(`Error HTTP ${response.status} cargando ${filePath}`);
                    }

                    const htmlText = await response.text();

                    // Reemplazo seguro del nodo si aún pertenece al DOM
                    if (slot.parentNode) {
                        const range = document.createRange();
                        const fragment = range.createContextualFragment(htmlText);
                        slot.replaceWith(fragment);
                    }
                } catch (err) {
                    console.error(`[AveLibre::Loader] Fallo al cargar componente: ${filePath}`, err);
                    
                    // Notificación en pantalla si falla la descarga del parcial
                    if (slot.parentNode) {
                        slot.innerHTML = `<div style="color:#b91c1c; background:#fee2e2; padding:8px; border-radius:4px; font-size:11px;">⚠️ Fallo al cargar: ${filePath}</div>`;
                        slot.removeAttribute("data-component");
                    }
                }
            });

            await Promise.all(promesas);
            maxProfundidad--;
            slots = document.querySelectorAll("[data-component]");
        }

        if (maxProfundidad === 0 && document.querySelectorAll("[data-component]").length > 0) {
            console.warn("[AveLibre::Loader] Se alcanzó el límite de profundidad de componentes anidados.");
        } else {
            console.log("[AveLibre::Loader] Todos los componentes HTML parciales han sido inyectados.");
        }
    }
};