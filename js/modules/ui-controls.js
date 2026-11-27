/**
 * Chuya - Controladores Interacción UI (Sidebar Drawer & Accesibilidad ARIA)
 * Stack: JS Vanilla ES6+
 */

export const UIControls = {
    /**
     * Vincula los controladores del menú lateral, accesibilidad ARIA y gestión de foco
     */
    initSidebar() {
        const btnOpen = document.getElementById("btn-open-sidebar");
        const btnClose = document.getElementById("btn-close-sidebar");
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("sidebar-overlay");

        if (!sidebar || !overlay) {
            console.warn("[AveLibre::UIControls] Elementos del sidebar u overlay no encontrados en el DOM.");
            return;
        }

        const openMenu = () => {
            console.log("[AveLibre::UIControls] Desplegando Sidebar Drawer.");
            sidebar.classList.add("open");
            sidebar.setAttribute("aria-hidden", "false");
            sidebar.removeAttribute("inert");

            if (overlay) {
                overlay.classList.add("active");
                overlay.setAttribute("aria-hidden", "false");
            }
        };

        const closeMenu = () => {
            console.log("[AveLibre::UIControls] Ocultando Sidebar Drawer.");
            sidebar.classList.remove("open");
            sidebar.setAttribute("aria-hidden", "true");
            sidebar.setAttribute("inert", "");

            if (overlay) {
                overlay.classList.remove("active");
                overlay.setAttribute("aria-hidden", "true");
            }
        };

        if (btnOpen) btnOpen.addEventListener("click", openMenu);
        if (btnClose) btnClose.addEventListener("click", closeMenu);
        if (overlay) overlay.addEventListener("click", closeMenu);

        // Cerrar al presionar la tecla Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && sidebar.classList.contains("open")) {
                closeMenu();
            }
        });

        // Auto-cerrar sidebar y retirar foco al seleccionar un enlace de navegación
        const navLinks = sidebar.querySelectorAll(".sidebar-nav a");
        navLinks.forEach(link => {
            link.addEventListener("click", () => {
                const targetView = link.getAttribute("href");
                console.log(`[AveLibre::UIControls] Navegación activada hacia: ${targetView}`);

                // Retirar el foco activo del elemento para evitar advertencias de aria-hidden
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }

                closeMenu();
            });
        });

        console.log("[AveLibre::UIControls] Eventos de Sidebar y accesibilidad ARIA vinculados con éxito.");
    }
};