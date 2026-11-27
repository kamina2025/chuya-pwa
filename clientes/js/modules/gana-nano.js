/**
 * Chuya - Módulo Gana Nano & Economía Circular
 * Ubicación: chuya-pwa/clientes/js/modules/gana-nano.js
 * Sincronizado con Google Sheets (Code.gs) y Local-First PWA.
 * Adaptativo para desarrollo (Refresco Manual) y producción (Refresco Inteligente).
 * Stack: JS Vanilla ES6+
 */

import { CONFIG } from "../config.js";
import { NanoWallet } from "./nano-wallet.js";

// Dirección ficticia de prueba EXCLUSIVA para entornos locales de desarrollo
const FICTITIOUS_TEST_NANO_ADDRESS = "nano_3test1111111111111111111111111111111111111111111111111111111";
const RUTAS_VISTA_METAS = ["#gana-xno", "#cascaras"];

export const GanaNanoView = {
    pollingInterval: null,
    // Intervalo amplio de 90 segundos para producción (protege cuotas de Google Apps Script)
    PROD_POLLING_DELAY_MS: 90000,
    cargando: false,

    /**
     * Detecta si la aplicación se ejecuta en un entorno local de desarrollo
     * @returns {boolean}
     */
    esEntornoDesarrollo() {
        const host = window.location.hostname;
        return host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
    },

    /**
     * Verifica si la vista de Gana Nano sigue montada en el enrutador SPA
     * @returns {boolean}
     */
    _estaEnVistaMetas() {
        const hashActual = (window.location.hash || "").toLowerCase();
        return RUTAS_VISTA_METAS.includes(hashActual) && Boolean(document.getElementById("cascaras"));
    },

    /**
     * Inicializa la vista de metas de economía circular
     */
    async init() {
        const esDev = this.esEntornoDesarrollo();
        console.log(`[Chuya::GanaNano] Inicializando vista de metas (${esDev ? "Entorno DESARROLLO" : "Entorno PRODUCCIÓN"})...`);

        this.cacheDOM();
        this.bindEvents();

        // 1. Carga inicial de datos (Local-First + Red)
        await this.cargarProgresoUsuario();

        // 2. Estrategia de refresco según entorno
        if (esDev) {
            console.log("[Chuya::GanaNano] Modo Desarrollo: Refresco automático desactivado. Usa el botón manual de actualización.");
            this.detenerSincronizacion();
        } else {
            console.log("[Chuya::GanaNano] Modo Producción: Activando sincronización pasiva e inteligente...");
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

        // Evento de visibilidad para producción: refresca solo al regresar a la pestaña activa
        if (!this._visibilityListenerBound && !this.esEntornoDesarrollo()) {
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible" && this._estaEnVistaMetas()) {
                    console.log("[Chuya::GanaNano] Pestaña reactivada en vista de metas. Sincronizando...");
                    this.cargarProgresoUsuario();
                }
            });
            this._visibilityListenerBound = true;
        }
    },

    /**
     * Obtiene la dirección Nano real o asigna la wallet ficticia únicamente en desarrollo local
     * @returns {string|null}
     */
    obtenerNanoAddress() {
        let address = null;
        if (typeof NanoWallet?.obtenerOBilleteraNano === "function") {
            address = NanoWallet.obtenerOBilleteraNano();
        } else if (typeof NanoWallet?.obtenerOVincular === "function") {
            address = NanoWallet.obtenerOVincular();
        }

        if (!address) {
            address = localStorage.getItem(CONFIG.STORAGE_KEYS?.NANO_ADDRESS || "chuya_nano_address")
                || localStorage.getItem("nano_address")
                || localStorage.getItem("avelibre_nano_wallet");
        }

        if (!address && this.esEntornoDesarrollo()) {
            console.warn(`[Chuya::GanaNano] Sin wallet vinculada en desarrollo. Usando dirección de prueba: ${FICTITIOUS_TEST_NANO_ADDRESS}`);
            address = FICTITIOUS_TEST_NANO_ADDRESS;
        }

        return address || null;
    },

    /**
     * Carga el estado actual de las metas del usuario desde LocalStorage y Google Sheets
     * @param {boolean} esManual - Indica si la solicitud fue detonada por un clic manual del usuario
     */
    async cargarProgresoUsuario(esManual = false) {
        if (this.cargando) return;
        this.cargando = true;
        this.setEstadoBotonRefrescar(true);

        console.log(`[Chuya::GanaNano] Consultando progreso de metas (${esManual ? "Solicitud Manual" : "Sincronización Automática"})...`);

        const metasKey = CONFIG.STORAGE_KEYS?.USER_METAS || "chuya_user_metas";
        const defaultData = {
            cascaras: { actual: 0, max: 30 },
            aserrin: { actual: 0, max: 3 },
            descuentoCOP: 0,
            descuentoXNO: 0
        };

        // 1. Cargar datos inmediatos desde LocalStorage (Local-First + migración legacy)
        let userData = defaultData;
        try {
            const localRaw = localStorage.getItem(metasKey) || localStorage.getItem("avelibre_user_metas");
            if (localRaw) {
                const parsed = JSON.parse(localRaw);
                userData = {
                    cascaras: { ...defaultData.cascaras, ...(parsed.cascaras || {}) },
                    aserrin: { ...defaultData.aserrin, ...(parsed.aserrin || {}) },
                    descuentoCOP: Number(parsed.descuentoCOP) || 0,
                    descuentoXNO: Number(parsed.descuentoXNO) || 0
                };
                localStorage.setItem(metasKey, JSON.stringify(userData));
            }
        } catch (e) {
            console.warn("[Chuya::GanaNano] Error al leer LocalStorage, usando valores base:", e.message);
        }

        this.renderMetas(userData);

        // 2. Validar wallet vinculada antes de consultar Google Sheets
        const nanoAddress = this.obtenerNanoAddress();
        if (!nanoAddress) {
            console.warn("[Chuya::GanaNano] Sin dirección Nano vinculada en producción.");
            if (this.recompensaTexto) {
                this.recompensaTexto.innerHTML = `⚠️ <strong>Vincula tu Billetera Nano</strong> en tu perfil para consultar tus entregas de cáscaras y aserrín acumuladas.`;
            }
            this.cargando = false;
            this.setEstadoBotonRefrescar(false);
            return;
        }

        // 3. Consulta al backend en Google Sheets
        if (navigator.onLine) {
            console.log(`[Chuya::GanaNano] 🔄 Petición HTTP GET a Google Sheets para wallet: ${nanoAddress}`);
            try {
                const url = `${CONFIG.API_URL}?action=getUser&nanoAddress=${encodeURIComponent(nanoAddress)}`;
                const res = await fetch(url, {
                    method: "GET",
                    mode: "cors",
                    credentials: "omit",
                    redirect: "follow"
                });

                if (res.ok) {
                    const rawText = await res.text();
                    const result = JSON.parse(rawText);

                    if (result.status === "success" && result.data) {
                        const cascarasAcum = Number(result.data.cascarasAcumuladas) || 0;
                        const aserrinAcum = Number(result.data.aserrinAcumulado) || 0;

                        const metasCompletadas = Math.floor(cascarasAcum / 30) + Math.floor(aserrinAcum / 3);
                        const descuentoCOP = metasCompletadas * 100;
                        const descuentoXNO = Number((metasCompletadas * 0.083).toFixed(3));

                        userData = {
                            cascaras: { actual: cascarasAcum, max: 30 },
                            aserrin: { actual: aserrinAcum, max: 3 },
                            descuentoCOP,
                            descuentoXNO
                        };

                        localStorage.setItem(metasKey, JSON.stringify(userData));
                        console.log("[Chuya::GanaNano] ✅ Sincronización exitosa desde Google Sheets:", userData);
                        this.renderMetas(userData);
                    } else if (result.status === "notFound") {
                        console.log("[Chuya::GanaNano] Usuario aún no registrado en Google Sheets. Conservando caché local.");
                    } else {
                        console.warn("[Chuya::GanaNano] Respuesta inesperada del servidor:", result.message);
                    }
                } else {
                    console.warn(`[Chuya::GanaNano] Respuesta de red no óptima (HTTP ${res.status}).`);
                }
            } catch (error) {
                console.warn("[Chuya::GanaNano] Fallo de conexión o parseo. Conservando caché local:", error.message);
            }
        } else {
            console.warn("[Chuya::GanaNano] Dispositivo offline. Mostrando datos de LocalStorage.");
        }

        this.cargando = false;
        this.setEstadoBotonRefrescar(false);
    },

    /**
     * Activa un temporizador de actualización pasivo para producción (auto-limpiable en SPA)
     */
    iniciarSincronizacionInteligente() {
        this.detenerSincronizacion();
        console.log(`[Chuya::GanaNano] Refresco en producción configurado cada ${this.PROD_POLLING_DELAY_MS / 1000}s.`);

        this.pollingInterval = setInterval(() => {
            if (!this._estaEnVistaMetas()) {
                this.detenerSincronizacion();
                return;
            }
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
            console.log("[Chuya::GanaNano] Sincronización automática detenida.");
        }
    },

    /**
     * Controla el estado visual y de interacción del botón de refresco manual
     * @param {boolean} cargando
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
     * @param {Object} data
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

        const tieneDescuento = (Number(data.descuentoCOP) > 0 || Number(data.descuentoXNO) > 0);

        if (this.recompensaTexto) {
            if (tieneDescuento) {
                this.recompensaTexto.innerHTML = `🎉 <strong>¡Felicidades!</strong> Tienes <strong>${data.descuentoXNO} XNO</strong> ($${Number(data.descuentoCOP).toLocaleString("es-CO")} COP) acumulados por tus aportes de economía circular.`;
            } else {
                this.recompensaTexto.innerHTML = `Entrega tus cáscaras de huevo y bultos de aserrín para acumular descuentos en tus pedidos.`;
            }
        }

        if (this.btnRedimir) {
            this.btnRedimir.disabled = !tieneDescuento;
            this.btnRedimir.classList.toggle("disabled", !tieneDescuento);
        }
    },

    handleRedimirDescuento() {
        const discountKey = CONFIG.STORAGE_KEYS?.DISCOUNT_APPLIED || "chuya_descuento_aplicado";
        console.log("[Chuya::GanaNano] Aplicando descuento acumulado al pedido...");
        localStorage.setItem(discountKey, "true");
        localStorage.setItem("avelibre_descuento_aplicado", "true"); // Compatibilidad temporal

        this.detenerSincronizacion();
        if (window.Router) {
            window.Router.navigate("#catalogo");
        } else {
            window.location.hash = "#catalogo";
        }
    }
};

if (typeof window !== "undefined") {
    window.GanaNanoView = GanaNanoView;
}