/**
 * Chuya - Módulo Gana Nano & Economía Circular
 * Refactorizado para sincronización optimizada con Google Sheets (Code.gs) y Local-First PWA.
 * Adaptativo para entorno de desarrollo (Refresco Manual) y producción (Refresco Inteligente/Recursivo en GitHub Pages).
 * Stack: JS Vanilla ES6+
 */

import { CONFIG } from "../config.js";
import { NanoWallet } from "./nano-wallet.js";

// Dirección ficticia de prueba para desarrollo/demo cuando no hay wallet vinculada
const FICTITIOUS_TEST_NANO_ADDRESS = "nano_3test1111111111111111111111111111111111111111111111111111111";

export const GanaNanoView = {
    pollingInterval: null,
    // Intervalo amplio de 90 segundos para producción en GitHub Pages (evita cuotas de Google Apps Script)
    PROD_POLLING_DELAY_MS: 90000, 
    cargando: false,

    /**
     * Detecta si la aplicación se ejecuta en un entorno local de desarrollo
     */
    esEntornoDesarrollo() {
        const host = window.location.hostname;
        return host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
    },

    /**
     * Inicializa la vista de metas de economía circular
     */
    async init() {
        const esDev = this.esEntornoDesarrollo();
        console.log(`[AveLibre::GanaNano] Inicializando vista de metas (${esDev ? "Entorno DESARROLLO" : "Entorno PRODUCCIÓN (GitHub Pages)"})...`);
        
        this.cacheDOM();
        this.bindEvents();
        
        // 1. Carga inicial de datos
        await this.cargarProgresoUsuario();

        // 2. Configuración de estrategia de refresco según el entorno
        if (esDev) {
            console.log("[AveLibre::GanaNano] Modo Desarrollo: Refresco automático desactivado. Utiliza el botón manual de actualización.");
            this.detenerSincronizacion();
        } else {
            console.log("[AveLibre::GanaNano] Modo Producción: Activando sincronización pasiva e inteligente...");
            this.iniciarSincronizacionInteligente();
        }
    },

    /**
     * Referencias a los elementos del DOM
     */
    cacheDOM() {
        this.cascarasProgress = document.getElementById("cascaras");
        this.cascarasNum = document.getElementById("cascaras-num");
        this.aserrinProgress = document.getElementById("aserrin");
        this.aserrinNum = document.getElementById("aserrin-num");
        this.recompensaTexto = document.getElementById("recompensa-texto");
        this.btnRedimir = document.getElementById("btn-redimir-descuento");
        this.btnRefrescar = document.getElementById("btn-refrescar-metas");
    },

    /**
     * Vinculación de eventos e interacciones del DOM
     */
    bindEvents() {
        if (this.btnRedimir) {
            this.btnRedimir.removeEventListener("click", this._onRedimirClick);
            this._onRedimirClick = () => this.handleRedimirDescuento();
            this.btnRedimir.addEventListener("click", this._onRedimirClick);
        }

        if (this.btnRefrescar) {
            this.btnRefrescar.removeEventListener("click", this._onRefrescarClick);
            this._onRefrescarClick = () => this.cargarProgresoUsuario(true);
            this.btnRefrescar.addEventListener("click", this._onRefrescarClick);
        }

        // Evento de visibilidad para producción: Refresca solo al regresar a la pestaña activa
        if (!this._visibilityListenerBound && !this.esEntornoDesarrollo()) {
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible" && window.location.hash === "#gana-xno") {
                    console.log("[AveLibre::GanaNano] Pestaña reactivada. Sincronizando datos con Google Sheets...");
                    this.cargarProgresoUsuario();
                }
            });
            this._visibilityListenerBound = true;
        }
    },

    /**
     * Obtiene la dirección Nano real o asigna la dirección ficticia de prueba
     */
    obtenerNanoAddress() {
        let address = null;
        if (typeof NanoWallet?.obtenerOBilleteraNano === "function") {
            address = NanoWallet.obtenerOBilleteraNano();
        } else if (typeof NanoWallet?.obtenerOVincular === "function") {
            address = NanoWallet.obtenerOVincular();
        }

        if (!address) {
            address = localStorage.getItem(CONFIG.STORAGE_KEYS?.NANO_ADDRESS || "nano_address") || 
                      localStorage.getItem("avelibre_nano_wallet");
        }

        if (!address) {
            console.warn(`[AveLibre::GanaNano] Sin wallet vinculada. Utilizando dirección ficticia para pruebas: ${FICTITIOUS_TEST_NANO_ADDRESS}`);
            address = FICTITIOUS_TEST_NANO_ADDRESS;
        }

        return address;
    },

    /**
     * Carga el estado actual de las metas del usuario desde LocalStorage y Google Sheets
     * @param {boolean} esManual - Indica si la solicitud fue detonada por un clic manual del usuario
     */
    async cargarProgresoUsuario(esManual = false) {
        if (this.cargando) return;
        this.cargando = true;
        this.setEstadoBotonRefrescar(true);

        console.log(`[AveLibre::GanaNano] Consultando progreso de metas (${esManual ? "Solicitud Manual" : "Sincronización Automática"})...`);

        const defaultData = {
            cascaras: { actual: 0, max: 30 },
            aserrin: { actual: 0, max: 3 },
            descuentoCOP: 0,
            descuentoXNO: 0
        };

        // 1. Cargar datos inmediatos desde LocalStorage (Local-First)
        let userData = defaultData;
        try {
            const localRaw = localStorage.getItem("avelibre_user_metas");
            if (localRaw) {
                userData = JSON.parse(localRaw);
            }
        } catch (e) {
            console.warn("[AveLibre::GanaNano] Error al leer LocalStorage:", e.message);
        }

        this.renderMetas(userData);

        // 2. Consulta al backend en Google Sheets
        const nanoAddress = this.obtenerNanoAddress();

        if (nanoAddress && navigator.onLine) {
            console.log(`[AveLibre::GanaNano] 🔄 Petición HTTP GET a Google Sheets para wallet: ${nanoAddress}`);
            try {
                const url = `${CONFIG.API_URL}?action=getUser&nanoAddress=${encodeURIComponent(nanoAddress)}`;
                const res = await fetch(url, { method: "GET", redirect: "follow" });

                if (res.ok) {
                    const result = await res.json();
                    if (result.status === "success" && result.data) {
                        const cascarasAcum = Number(result.data.cascarasAcumuladas) || 0;
                        const aserrinAcum = Number(result.data.aserrinAcumulado) || 0;

                        const metasCompletadas = Math.floor(cascarasAcum / 30) + Math.floor(aserrinAcum / 3);
                        const descuentoCOP = metasCompletadas * 100;
                        const descuentoXNO = Number((metasCompletadas * 0.083).toFixed(3));

                        userData = {
                            cascaras: { actual: cascarasAcum, max: 30 },
                            aserrin: { actual: aserrinAcum, max: 3 },
                            descuentoCOP: descuentoCOP,
                            descuentoXNO: descuentoXNO
                        };

                        localStorage.setItem("avelibre_user_metas", JSON.stringify(userData));
                        console.log("[AveLibre::GanaNano] ✅ Sincronización exitosa desde Google Sheets:", userData);
                        this.renderMetas(userData);
                    } else if (result.status === "notFound") {
                        console.log("[AveLibre::GanaNano] Usuario aún no registrado en Google Sheets. Conservando caché local.");
                    }
                } else {
                    console.warn(`[AveLibre::GanaNano] Respuesta de red no óptima (HTTP ${res.status}).`);
                }
            } catch (error) {
                console.warn("[AveLibre::GanaNano] Fallo de conexión de red. Conservando caché local:", error.message);
            }
        } else {
            console.warn("[AveLibre::GanaNano] Dispositivo offline. Mostrando datos de LocalStorage.");
        }

        this.cargando = false;
        this.setEstadoBotonRefrescar(false);
    },

    /**
     * Activa un temporizador de actualización pasivo para producción
     */
    iniciarSincronizacionInteligente() {
        this.detenerSincronizacion();
        console.log(`[AveLibre::GanaNano] Refresco en producción configurado a cada ${this.PROD_POLLING_DELAY_MS / 1000}s (solo con pestaña activa).`);
        
        this.pollingInterval = setInterval(() => {
            // Unicamente refrescar si la pestaña está visible y hay conexión a red
            if (document.visibilityState === "visible" && navigator.onLine) {
                this.cargarProgresoUsuario();
            }
        }, this.PROD_POLLING_DELAY_MS);
    },

    /**
     * Limpia y detiene temporizadores activos
     */
    detenerSincronizacion() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log("[AveLibre::GanaNano] Sincronización automática detenida.");
        }
    },

    /**
     * Controla el estado visual y de interacción del botón de refresco manual
     */
    setEstadoBotonRefrescar(cargando) {
        if (!this.btnRefrescar) return;
        this.btnRefrescar.disabled = cargando;
        if (cargando) {
            this.btnRefrescar.classList.add("loading");
            this.btnRefrescar.innerHTML = `🔄 Sincronizando...`;
        } else {
            this.btnRefrescar.classList.remove("loading");
            this.btnRefrescar.innerHTML = `🔄 Actualizar Metas`;
        }
    },

    /**
     * Renderiza las barras de progreso y el resumen de recompensas en el DOM
     */
    renderMetas(data) {
        if (!this.cascarasProgress || !document.body.contains(this.cascarasProgress)) {
            this.cacheDOM();
        }

        if (this.cascarasProgress && this.cascarasNum) {
            this.cascarasProgress.value = data.cascaras.actual;
            this.cascarasProgress.max = data.cascaras.max;
            this.cascarasNum.textContent = `${data.cascaras.actual} / ${data.cascaras.max} Unid.`;
        }

        if (this.aserrinProgress && this.aserrinNum) {
            this.aserrinProgress.value = data.aserrin.actual;
            this.aserrinProgress.max = data.aserrin.max;
            this.aserrinNum.textContent = `${data.aserrin.actual} / ${data.aserrin.max} Bultos`;
        }

        if (this.recompensaTexto) {
            if (data.descuentoCOP > 0 || data.descuentoXNO > 0) {
                this.recompensaTexto.innerHTML = `🎉 <strong>¡Felicidades!</strong> Tienes <strong>${data.descuentoXNO} XNO</strong> ($${data.descuentoCOP} COP) acumulados por tus aportes de economía circular.`;
            } else {
                this.recompensaTexto.innerHTML = `Entrega tus cáscaras de huevo y bultos de aserrín para acumular descuentos en tus pedidos.`;
            }
        }
    },

    handleRedimirDescuento() {
        console.log("[AveLibre::GanaNano] Aplicando descuento acumulado...");
        localStorage.setItem("avelibre_descuento_aplicado", "true");
        if (window.Router) {
            window.Router.navigate("#catalogo");
        } else {
            window.location.hash = "#catalogo";
        }
    }
};

window.GanaNanoView = GanaNanoView;