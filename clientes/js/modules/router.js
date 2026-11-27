/**
 * Chuya - Enrutador SPA (Single Page Application)
 * Mapeo e invocación modular de vistas y controladores.
 * Stack: JS Vanilla ES6+
 */

import { CatalogoView } from "./catalogo.js";
import { PedidosView } from "./pedidos.js";
import { GanaNanoView } from "./gana-nano.js";
import { AuthModule } from "./auth.js";

export const Router = {
    /**
     * Mapeo de rutas hacia vistas HTML e inicializadores de controladores
     */
    routes: {
        "#inicio": {
            view: "vistas/principal.html",
            init: () => console.log("[AveLibre::Router] Vista de Inicio / Principal cargada con éxito.")
        },
        "#login": {
            view: "vistas/login.html",
            init: () => {
                console.log("[AveLibre::Router] Cargando vista de ingreso de cliente (Login)...");
                const auth = window.AuthModule || AuthModule;
                if (auth && typeof auth.init === "function") {
                    auth.init();
                }
            }
        },
        "#perfil": {
            view: "vistas/perfil.html",
            init: () => {
                console.log("[AveLibre::Router] Cargando vista de edición de perfil...");
                const auth = window.AuthModule || AuthModule;
                if (auth && typeof auth.init === "function") {
                    auth.init();
                }
            }
        },
        "#catalogo": {
            view: "vistas/catalogo.html",
            init: () => CatalogoView.init()
        },
        "#pedidos": {
            view: "vistas/pedidos.html",
            init: () => PedidosView.init()
        },
        "#gana-xno": {
            view: "vistas/gana-nano.html",
            init: () => GanaNanoView.init()
        },
        "#cascaras": {
            view: "vistas/gana-nano.html",
            init: () => GanaNanoView.init()
        },
        "#wallet": {
            view: "vistas/billetera.html",
            init: () => console.log("[AveLibre::Router] Vista de Billetera Nano (XNO) cargada.")
        }
    },

    /**
     * Inicializa los escuchadores de navegación SPA
     */
    init() {
        console.log("[AveLibre::Router] Inicializando enrutador SPA...");
        window.addEventListener("hashchange", () => this.handleRoute());
        this.handleRoute();
    },

    /**
     * Navega dinámicamente hacia el hash indicado
     * @param {string} hash 
     */
    navigate(hash) {
        if (window.location.hash !== hash) {
            window.location.hash = hash;
        } else {
            this.handleRoute();
        }
    },

    /**
     * Resuelve e inyecta la vista correspondiente a la ruta actual con guardia de sesión
     */
    async handleRoute() {
        let hash = window.location.hash || "#inicio";
        const auth = window.AuthModule || AuthModule;
        const tieneSesion = auth && typeof auth.obtenerSesion === "function" ? auth.obtenerSesion() : null;

        // Guardias de navegación según presencia de sesión
        if (hash === "#perfil" && !tieneSesion) {
            console.warn("[AveLibre::Router] Intento de acceso a #perfil sin sesión activa. Redirigiendo a #login...");
            this.navigate("#login");
            return;
        }

        if (hash === "#login" && tieneSesion) {
            console.log("[AveLibre::Router] Sesión activa detectada en #login. Redirigiendo a #perfil...");
            this.navigate("#perfil");
            return;
        }

        console.log(`[AveLibre::Router] Navegando hacia la ruta: '${hash}'`);
        const route = this.routes[hash] || this.routes["#inicio"];

        if (typeof UILoader !== "undefined") {
            const loaded = await UILoader.loadPartial(route.view, "main-content");
            
            if (loaded && typeof route.init === "function") {
                try {
                    await route.init();
                } catch (err) {
                    console.error(`[AveLibre::Router] Error al ejecutar init() en '${hash}':`, err.message);
                }
            }
        } else {
            console.error("[AveLibre::Router] UILoader no está disponible en el entorno global.");
        }

        this.updateActiveLinks(hash);
    },

    /**
     * Sincroniza la clase 'active' en las barras de navegación
     * @param {string} activeHash 
     */
    updateActiveLinks(activeHash) {
        const links = document.querySelectorAll(".sidebar-nav a, .bottom-bar a");
        links.forEach(link => {
            if (link.getAttribute("href") === activeHash) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }
};

window.Router = Router;