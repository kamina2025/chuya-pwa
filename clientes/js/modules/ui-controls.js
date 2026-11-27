/**
 * Chuya - Controladores Interacción UI (Sidebar Drawer & Accesibilidad ARIA)
 * Ubicación: chuya-pwa/clientes/js/modules/ui-controls.js
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
            console.warn("[Chuya::UIControls] Elementos del sidebar u overlay no encontrados en el DOM.");
            return;
        }

        if (sidebar.dataset.sidebarBound === "true") {
            console.log("[Chuya::UIControls] Sidebar Drawer ya vinculado. Omitiendo duplicado.");
            return;
        }
        sidebar.dataset.sidebarBound = "true";

        // Asegurar estado inicial cerrado y accesible
        sidebar.setAttribute("aria-hidden", "true");
        sidebar.setAttribute("inert", "");
        if (btnOpen) btnOpen.setAttribute("aria-expanded", "false");

        const openMenu = () => {
            console.log("[Chuya::UIControls] Desplegando Sidebar Drawer.");
            sidebar.classList.add("open");
            sidebar.setAttribute("aria-hidden", "false");
            sidebar.removeAttribute("inert");

            if (overlay) {
                overlay.classList.add("active");
                overlay.setAttribute("aria-hidden", "false");
            }
            if (btnOpen) {
                btnOpen.setAttribute("aria-expanded", "true");
            }
            document.body.classList.add("sidebar-open");

            // Trasladar el foco al botón de cierre para accesibilidad con teclado
            if (btnClose) {
                requestAnimationFrame(() => btnClose.focus());
            }
        };

        const closeMenu = (restoreFocus = false) => {
            if (!sidebar.classList.contains("open")) return;

            console.log("[Chuya::UIControls] Ocultando Sidebar Drawer.");

            // Retirar el foco activo de cualquier descendiente antes de aplicar aria-hidden="true"
            if (document.activeElement instanceof HTMLElement && sidebar.contains(document.activeElement)) {
                document.activeElement.blur();
            }

            sidebar.classList.remove("open");
            sidebar.setAttribute("aria-hidden", "true");
            sidebar.setAttribute("inert", "");

            if (overlay) {
                overlay.classList.remove("active");
                overlay.setAttribute("aria-hidden", "true");
            }
            if (btnOpen) {
                btnOpen.setAttribute("aria-expanded", "false");
                if (restoreFocus) btnOpen.focus();
            }
            document.body.classList.remove("sidebar-open");
        };

        if (btnOpen) btnOpen.addEventListener("click", openMenu);
        if (btnClose) btnClose.addEventListener("click", () => closeMenu(true));
        if (overlay) overlay.addEventListener("click", () => closeMenu(false));

        // Cerrar al presionar la tecla Escape devolviendo el foco al botón disparador
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && sidebar.classList.contains("open")) {
                closeMenu(true);
            }
        });

        // Auto-cerrar sidebar y retirar foco al seleccionar un enlace de navegación
        const navLinks = sidebar.querySelectorAll(".sidebar-nav a");
        navLinks.forEach((link) => {
            link.addEventListener("click", () => {
                const targetView = link.getAttribute("href");
                console.log(`[Chuya::UIControls] Navegación activada hacia: ${targetView}`);
                closeMenu(false);
            });
        });

        console.log("[Chuya::UIControls] Eventos de Sidebar y accesibilidad ARIA vinculados con éxito.");
    }
};

if (typeof window !== "undefined") {
    window.UIControls = UIControls;
}