/**
 * Chuya - Módulo de Importación de PDF de Identidad y Escáner de Código QR
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

export const QRPDFImporter = {
    _loadingPromise: null,

    async init() {
        console.log("[AveLibre::QRPDF] Inicializando módulo de lectura QR y parseo de PDF...");
        await this.cargarLibrerias();
    },

    cargarLibrerias() {
        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = new Promise((resolve) => {
            const promesas = [];

            if (!window.pdfjsLib) {
                promesas.push(new Promise((res) => {
                    const scriptPdf = document.createElement("script");
                    scriptPdf.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
                    scriptPdf.onload = () => {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
                            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
                        console.log("[AveLibre::QRPDF] PDF.js cargado exitosamente.");
                        res();
                    };
                    scriptPdf.onerror = () => res();
                    document.head.appendChild(scriptPdf);
                }));
            }

            if (!window.Html5QrcodeScanner && !window.Html5Qrcode) {
                promesas.push(new Promise((res) => {
                    const scriptQr = document.createElement("script");
                    scriptQr.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
                    scriptQr.onload = () => {
                        console.log("[AveLibre::QRPDF] Html5Qrcode cargado exitosamente.");
                        res();
                    };
                    scriptQr.onerror = () => res();
                    document.head.appendChild(scriptQr);
                }));
            }

            Promise.all(promesas).then(() => resolve(true));
        });

        return this._loadingPromise;
    },

    async procesarPDF(file) {
        console.log("[AveLibre::QRPDF] Procesando archivo PDF de identidad:", file.name);
        await this.cargarLibrerias();

        if (!window.pdfjsLib) {
            throw new Error("PDF.js no está inicializado en el sistema.");
        }

        try {
            const buffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
            let textoCompleto = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(" ");
                textoCompleto += pageText + " ";
            }

            console.log("[AveLibre::QRPDF] Texto procesado desde el PDF:", textoCompleto);

            // 1. Extraer Miembro (Nombre)
            const matchMiembro = textoCompleto.match(/Miembro:\s*([^\n\r\t]+?)(?=\s*(Direcci|PGP|Fingerprint|☐|$))/i) ||
                                textoCompleto.match(/Miembro:\s*([a-zA-Z0-9_\-\s]+)/i);

            // 2. Extraer Dirección Nano tolerando saltos de línea y espacios en medio de la clave
            let nanoAddressExtraida = "";
            const regexNanoFragment = /((?:nano|xrb)_[13][13-9a-km-uw-z\s]{59,75})/i;
            const matchRawNano = textoCompleto.match(regexNanoFragment);

            if (matchRawNano) {
                // Remover todos los espacios, saltos de línea y tabulaciones del bloque capturado
                const cleanedAddress = matchRawNano[1].replace(/\s+/g, "").trim();
                // Validar que tras la limpieza cumpla la estructura exacta de 60 caracteres Nano
                if (/^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/i.test(cleanedAddress)) {
                    nanoAddressExtraida = cleanedAddress;
                } else {
                    // Intento de fallback si la subcadena incluye caracteres posteriores
                    const subCleaned = cleanedAddress.substring(0, 65);
                    if (/^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/i.test(subCleaned)) {
                        nanoAddressExtraida = subCleaned;
                    }
                }
            }

            // 3. Extraer Huella PGP Fingerprint
            const matchPGP = textoCompleto.match(/(?:PGP Fingerprint:\s*|Fingerprint:\s*)([A-FA-f0-9\s]{40,50})/i) || 
                             textoCompleto.match(/([A-FA-f0-9]{40})/);

            const resultado = {
                nombre: matchMiembro ? matchMiembro[1].trim() : "",
                nanoAddress: nanoAddressExtraida,
                pgpFingerprint: matchPGP ? matchPGP[1].replace(/\s+/g, "").trim() : ""
            };

            console.log("[AveLibre::QRPDF] Identidad extraída con éxito:", resultado);
            return resultado;
        } catch (error) {
            console.error("[AveLibre::QRPDF] Fallo al parsear el archivo PDF:", error.message);
            throw error;
        }
    }
};

window.QRPDFImporter = QRPDFImporter;