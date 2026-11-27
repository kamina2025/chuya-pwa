/**
 * Chuya - Enrutador SPA (Single Page Application)
 * Ubicación: chuya-pwa/clientes/js/modules/router.js
 * Mapeo e invocación modular de vistas y controladores con guardias de sesión.
 * Stack: JS Vanilla ES6+
 */

import { CatalogoView } from "./catalogo.js";
import { PedidosView } from "./pedidos.js";
import { GanaNanoView } from "./gana-nano.js";
import { AuthModule } from "./auth.js";
import { NanoWallet } from "./nano-wallet.js";

export const Router = {
    _initialized: false,
    _currentHash: null,

    /**
     * Mapeo de rutas hacia vistas HTML e inicializadores de controladores
     */
    routes: {
        "#inicio": {
            view: "vistas/principal.html",
            init: () => console.log("[Chuya::Router] Vista de Inicio / Principal cargada con éxito.")
        },
        "#login": {
            view: "vistas/login.html",
            init: () => {
                console.log("[Chuya::Router] Cargando vista de ingreso de cliente (Login)...");
                const auth = window.AuthModule || AuthModule;
                if (auth && typeof auth.init === "function") {
                    auth.init();
                }
            }
        },
        "#perfil": {
            view: "vistas/perfil.html",
            init: () => {
                console.log("[Chuya::Router] Cargando vista de edición de perfil...");
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
            init: async () => {
                console.log("[Chuya::Router] Vista de Billetera Nano (XNO) cargada.");
                const wallet = window.NanoWallet || NanoWallet;
                if (wallet && typeof wallet.obtenerOVincular === "function") {
                    const addr = wallet.obtenerOVincular();
                    if (addr && typeof wallet.consultarSaldo === "function") {
                        await wallet.consultarSaldo(addr);
                    }
                }
            }
        }
    },

    /**
     * Inicializa los escuchadores de navegación SPA
     */
    init() {
        if (this._initialized) {
            console.log("[Chuya::Router] Enrutador SPA ya inicializado. Omitiendo duplicado.");
            return;
        }
        this._initialized = true;

        console.log("[Chuya::Router] Inicializando enrutador SPA Chuya Clientes...");
        window.addEventListener("hashchange", () => this.handleRoute());
        this.handleRoute();
    },

    /**
     * Navega dinámicamente hacia el hash indicado
     * @param {string} hash
     */
    navigate(hash) {
        const normalizedTarget = String(hash || "#inicio").trim().toLowerCase();
        if (window.location.hash.toLowerCase() !== normalizedTarget) {
            window.location.hash = normalizedTarget;
        } else {
            this.handleRoute();
        }
    },

    /**
     * Libera recursos activos de la vista anterior (cámara QR, intervalos de polling)
     * @private
     */
    async _limpiarRecursosVistaAnterior(nuevoHash) {
        if (this._currentHash === nuevoHash) return;

        // 1. Detener cámara WebRTC si se abandona #login o #perfil
        if ((this._currentHash === "#login" || this._currentHash === "#perfil") && window.QRPDFImporter?.detenerEscanerQR) {
            await window.QRPDFImporter.detenerEscanerQR();
        }

        // 2. Detener polling de metas si se abandona #gana-xno o #cascaras
        if ((this._currentHash === "#gana-xno" || this._currentHash === "#cascaras") && typeof GanaNanoView?.detenerSincronizacion === "function") {
            GanaNanoView.detenerSincronizacion();
        }
    },

    /**
     * Resuelve e inyecta la vista correspondiente a la ruta actual con guardia de sesión
     */
    async handleRoute() {
        const rawHash = window.location.hash || "#inicio";
        const hash = rawHash.trim().toLowerCase();

        const auth = window.AuthModule || AuthModule;
        const tieneSesion = auth && typeof auth.obtenerSesion === "function" ? auth.obtenerSesion() : null;

        // Guardias de navegación según presencia de sesión (#login vs #perfil)
        if (hash === "#perfil" && !tieneSesion) {
            console.warn("[Chuya::Router] Intento de acceso a #perfil sin sesión activa. Redirigiendo a #login...");
            this.navigate("#login");
            return;
        }

        if (hash === "#login" && tieneSesion) {
            console.log("[Chuya::Router] Sesión activa detectada en #login. Redirigiendo a #perfil...");
            this.navigate("#perfil");
            return;
        }

        await this._limpiarRecursosVistaAnterior(hash);
        this._currentHash = hash;

        console.log(`[Chuya::Router] Navegando hacia la ruta: '${hash}'`);
        const route = this.routes[hash] || this.routes["#inicio"];
        const loader = (typeof window !== "undefined" && window.UILoader) || (typeof UILoader !== "undefined" ? UILoader : null);

        if (loader && typeof loader.loadPartial === "function") {
            const loaded = await loader.loadPartial(route.view, "main-content");

            if (loaded && typeof route.init === "function") {
                try {
                    await route.init();
                } catch (err) {
                    console.error(`[Chuya::Router] Error al ejecutar init() en '${hash}':`, err.message);
                }
            }
        } else {
            console.error("[Chuya::Router] UILoader no está disponible en el entorno global.");
        }

        this.updateActiveLinks(hash);
    },

    /**
     * Sincroniza la clase 'active' en las barras de navegación (sidebar y bottom-bar)
     * @param {string} activeHash
     */
    updateActiveLinks(activeHash) {
        const links = document.querySelectorAll(".sidebar-nav a, .bottom-bar a");
        links.forEach((link) => {
            const linkHref = (link.getAttribute("href") || "").trim().toLowerCase();
            if (linkHref === activeHash) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }
};

if (typeof window !== "undefined") {
    window.Router = Router;
}