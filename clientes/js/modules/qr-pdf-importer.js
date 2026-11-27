/**
 * Chuya - Módulo de Importación de PDF de Identidad y Escáner de Código QR
 * Ubicación: chuya-pwa/clientes/js/modules/qr-pdf-importer.js
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
const PDFJS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
const HTML5_QRCODE_CDN = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

export const QRPDFImporter = {
    _loadingPromise: null,
    _activeScanner: null,
    _cleanupListeners: null,

    /**
     * Inicializa y precarga las dependencias externas (PDF.js / Html5Qrcode)
     */
    async init() {
        console.log("[Chuya::QRPDF] Inicializando módulo de lectura QR y parseo de PDF...");
        await this.cargarLibrerias();
    },

    /**
     * Carga dinámicamente PDF.js y Html5Qrcode con reintento automático si hubo fallo offline
     * @returns {Promise<boolean>}
     */
    cargarLibrerias() {
        if (window.pdfjsLib && window.Html5Qrcode) {
            return Promise.resolve(true);
        }

        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = new Promise((resolve) => {
            const promesas = [];
            let huboError = false;

            // 1. Cargar PDF.js
            if (!window.pdfjsLib) {
                promesas.push(new Promise((res) => {
                    const scriptPdf = document.createElement("script");
                    scriptPdf.src = PDFJS_CDN;
                    scriptPdf.onload = () => {
                        if (window.pdfjsLib) {
                            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
                            console.log("[Chuya::QRPDF] PDF.js cargado exitosamente.");
                        } else {
                            huboError = true;
                        }
                        res();
                    };
                    scriptPdf.onerror = () => {
                        huboError = true;
                        console.warn("[Chuya::QRPDF] No se pudo descargar PDF.js (sin red o CDN bloqueado).");
                        res();
                    };
                    document.head.appendChild(scriptPdf);
                }));
            }

            // 2. Cargar Html5Qrcode
            if (!window.Html5Qrcode) {
                promesas.push(new Promise((res) => {
                    const scriptQr = document.createElement("script");
                    scriptQr.src = HTML5_QRCODE_CDN;
                    scriptQr.onload = () => {
                        if (window.Html5Qrcode) {
                            console.log("[Chuya::QRPDF] Html5Qrcode cargado exitosamente.");
                        } else {
                            huboError = true;
                        }
                        res();
                    };
                    scriptQr.onerror = () => {
                        huboError = true;
                        console.warn("[Chuya::QRPDF] No se pudo descargar Html5Qrcode (sin red o CDN bloqueado).");
                        res();
                    };
                    document.head.appendChild(scriptQr);
                }));
            }

            Promise.all(promesas).then(() => {
                const listo = Boolean(window.pdfjsLib && window.Html5Qrcode);
                if (huboError || !listo) {
                    this._loadingPromise = null;
                }
                resolve(listo);
            });
        });

        return this._loadingPromise;
    },

    /**
     * Lee un archivo PDF de credencial Chuya/Ave-Libre y extrae Miembro, Dirección Nano y Fingerprint PGP
     * @param {File} file
     * @returns {Promise<{nombre: string, nanoAddress: string, pgpFingerprint: string}>}
     */
    async procesarPDF(file) {
        if (!file) throw new Error("No se proporcionó ningún archivo PDF.");

        const esPDFValido =
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf");

        if (!esPDFValido) {
            throw new Error("El archivo seleccionado no es un documento PDF válido.");
        }

        console.log("[Chuya::QRPDF] Procesando archivo PDF de identidad:", file.name);
        await this.cargarLibrerias();

        if (!window.pdfjsLib) {
            throw new Error("PDF.js no está disponible. Verifica tu conexión a internet e intenta de nuevo.");
        }

        try {
            const buffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
            let textoCompleto = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item) => item.str).join(" ");
                textoCompleto += pageText + " ";
            }

            console.log("[Chuya::QRPDF] Texto extraído del PDF:", textoCompleto);

            // 0. Detectar si el usuario subió por error un Comprobante de Pago POS
            const esComprobantePOS =
                /COMPROBANTE DE PAGO\s*&\s*PROMOCI[ÓO]N/i.test(textoCompleto) ||
                /Hash:\s*CUS-/i.test(textoCompleto);

            if (esComprobantePOS) {
                console.warn("[Chuya::QRPDF] Documento rechazado: corresponde a un Comprobante POS, no a una Tarjeta QR.");
                throw new Error(
                    "Subiste un Comprobante de Pago POS. Para iniciar sesión debes cargar tu 'Tarjeta QR de Miembro'."
                );
            }

            // 1. Extraer Nombre del Miembro (compatible con nomenclatura Ave-Libre y Chuya)
            const matchMiembro =
                textoCompleto.match(/(?:Miembro|Usuario|Cliente)\s*:\s*([^\n\r\t]+?)(?=\s*(?:Direcci|Identidad|PGP|Fingerprint|☐|$))/i) ||
                textoCompleto.match(/(?:Miembro|Usuario|Cliente)\s*:\s*([a-zA-Z0-9À-ÿ_\-\s]+)/i);

            // 2. Extraer Dirección Nano tolerando saltos de línea y espacios intermedios en el PDF
            let nanoAddressExtraida = "";
            const regexNanoFragment = /((?:nano|xrb)_[13][13-9a-km-uw-z\s]{59,75})/i;
            const matchRawNano = textoCompleto.match(regexNanoFragment);

            if (matchRawNano) {
                const cleanedAddress = matchRawNano[1].replace(/\s+/g, "").trim().toLowerCase();
                if (/^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/.test(cleanedAddress)) {
                    nanoAddressExtraida = cleanedAddress;
                } else {
                    const subCleaned = cleanedAddress.substring(0, 65);
                    if (/^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/.test(subCleaned)) {
                        nanoAddressExtraida = subCleaned;
                    }
                }
            }

            // 3. Extraer Huella PGP Fingerprint (40 caracteres hexadecimales)
            const matchPGP =
                textoCompleto.match(/(?:PGP\s*Fingerprint\s*:\s*|Fingerprint\s*:\s*)([A-Fa-f0-9\s]{40,55})/i) ||
                textoCompleto.match(/([A-Fa-f0-9]{40})/);

            const pgpLimpia = matchPGP
                ? matchPGP[1].replace(/\s+/g, "").substring(0, 40).toUpperCase()
                : "";

            const resultado = {
                nombre: matchMiembro ? matchMiembro[1].trim() : "",
                nanoAddress: nanoAddressExtraida,
                pgpFingerprint: /^[A-F0-9]{40}$/.test(pgpLimpia) ? pgpLimpia : ""
            };

            console.log("[Chuya::QRPDF] Identidad extraída con éxito:", resultado);
            return resultado;
        } catch (error) {
            console.error("[Chuya::QRPDF] Fallo al parsear el archivo PDF:", error.message);
            throw error;
        }
    },

    /**
     * Inicia la cámara trasera del dispositivo para escanear un código QR de credencial o entrega
     * @param {string} elementId - ID del contenedor HTML donde se monta el visor
     * @param {Function} onSuccess - Callback ejecutado al decodificar un QR válido
     */
    async iniciarEscanerQR(elementId, onSuccess) {
        console.log(`[Chuya::QRPDF] Iniciando escáner QR en '#${elementId}'...`);

        await this.cargarLibrerias();

        if (!window.Html5Qrcode) {
            console.error("[Chuya::QRPDF] Html5Qrcode no está disponible.");
            alert("⚠️ El motor del escáner QR no está disponible. Verifica tu conexión e intenta de nuevo.");
            return;
        }

        const container = document.getElementById(elementId);
        if (!container) {
            console.error(`[Chuya::QRPDF] Contenedor '#${elementId}' no encontrado en el DOM.`);
            return;
        }

        // Detener cualquier instancia previa activa antes de abrir una nueva
        await this.detenerEscanerQR();

        const html5QrCode = new window.Html5Qrcode(elementId);
        this._activeScanner = html5QrCode;
        this._registrarAutoLimpieza();

        const config = { fps: 10, qrbox: { width: 240, height: 240 } };

        try {
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                async (decodedText) => {
                    console.log("[Chuya::QRPDF] Código QR decodificado exitosamente:", decodedText);
                    await this.detenerEscanerQR();

                    if (typeof onSuccess === "function") {
                        onSuccess(decodedText);
                    }
                },
                () => {
                    // Lectura continua en cuadros sin QR (silencioso)
                }
            );
        } catch (err) {
            console.error("[Chuya::QRPDF] Error al acceder a la cámara del dispositivo:", err.message);
            await this.detenerEscanerQR();
            alert("⚠️ No se pudo acceder a la cámara. Verifica los permisos del navegador.");
        }
    },

    /**
     * Registra listeners de ciclo de vida para apagar la cámara si el usuario cambia de vista u oculta la pestaña
     * @private
     */
    _registrarAutoLimpieza() {
        this._removerAutoLimpieza();

        const onRouteOrHide = () => {
            if (document.hidden || this._activeScanner) {
                console.log("[Chuya::QRPDF] Cambio de vista o visibilidad detectado; liberando cámara...");
                this.detenerEscanerQR();
            }
        };

        window.addEventListener("hashchange", onRouteOrHide);
        document.addEventListener("visibilitychange", onRouteOrHide);

        this._cleanupListeners = () => {
            window.removeEventListener("hashchange", onRouteOrHide);
            document.removeEventListener("visibilitychange", onRouteOrHide);
        };
    },

    /**
     * Elimina los listeners temporales de auto-limpieza
     * @private
     */
    _removerAutoLimpieza() {
        if (typeof this._cleanupListeners === "function") {
            this._cleanupListeners();
            this._cleanupListeners = null;
        }
    },

    /**
     * Detiene y libera limpiamente la cámara WebRTC si existe un escáner activo
     */
    async detenerEscanerQR() {
        this._removerAutoLimpieza();

        if (!this._activeScanner) return;

        const scanner = this._activeScanner;
        this._activeScanner = null;

        try {
            await scanner.stop();
            scanner.clear();
            console.log("[Chuya::QRPDF] Cámara del escáner QR liberada correctamente.");
        } catch (err) {
            console.warn("[Chuya::QRPDF] Advertencia al detener escáner QR:", err.message);
        }
    }
};

if (typeof window !== "undefined") {
    window.QRPDFImporter = QRPDFImporter;
}