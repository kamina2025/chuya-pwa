/**
 * Chuya Admin - Módulo Controlador de Tickets Promocionales, Recargas & Comprobantes PDF
 * Stack: JS Vanilla ES6+
 * Ubicación: chuya-pwa/admin-recolector/js/modules/ticket-generator.js
 */

import { AdminUI } from "./admin-ui.js";

export const TicketGeneratorModule = {
    _hashTicketActual: null,

    BRAND: {
        NAME: "CHUYA",
        TAGLINE: "Recargas Solarpunk & Economía Circular",
        LOCATION: "Miranda, Cauca, Colombia"
    },

    init() {
        console.log("[Chuya::TicketGenerator] Inicializando controlador de tickets promocionales y PDF...");
        this._bindEvents();
        this.actualizarVistaPrevia();
        console.log("[Chuya::TicketGenerator] Controlador listo.");
    },

    _bindEvents() {
        const form = document.getElementById("form-ticket-datos");
        if (form) {
            form.addEventListener("input", () => this.actualizarVistaPrevia());
            form.addEventListener("change", () => this.actualizarVistaPrevia());
        }

        // Preset comprobante PSE Daviplata (Miranda)
        const btnPreset = document.getElementById("btn-load-preset-pse");
        if (btnPreset) {
            btnPreset.addEventListener("click", () => this.cargarPresetDaviplata());
        }

        // Botón Imprimir Ticket Térmico POS (80mm)
        const btnPrint = document.getElementById("btn-imprimir-ticket-pos");
        if (btnPrint) {
            btnPrint.addEventListener("click", () => {
                console.log("[Chuya::TicketGenerator] Preparando impresión térmica POS 80mm...");
                document.title = "Chuya | Comprobante POS";
                this.actualizarVistaPrevia();
                setTimeout(() => {
                    window.print();
                }, 150);
            });
        }

        // Botón Descargar Comprobante PDF Estructurado (Sin superposición)
        const btnDescargarPdf = document.getElementById("btn-descargar-ticket-pdf");
        if (btnDescargarPdf) {
            btnDescargarPdf.addEventListener("click", () => {
                this.actualizarVistaPrevia();
                this.descargarComprobantePDF();
            });
        }

        // Zona Dropzone + Input oculto para carga de Comprobante PDF / Imagen
        const dropzone = document.getElementById("dropzone-pdf");
        const fileInput = document.getElementById("pdf-file-input");

        if (dropzone && fileInput) {
            dropzone.addEventListener("click", () => fileInput.click());
            dropzone.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInput.click();
                }
            });
            dropzone.addEventListener("dragover", (e) => {
                e.preventDefault();
                dropzone.classList.add("drag-over");
            });
            dropzone.addEventListener("dragleave", () => {
                dropzone.classList.remove("drag-over");
            });
            dropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                dropzone.classList.remove("drag-over");
                const droppedFile = e.dataTransfer?.files?.[0];
                if (droppedFile) {
                    this._procesarArchivoSubido(droppedFile);
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener("change", (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    this._procesarArchivoSubido(file);
                }
            });
        }
    },

    /**
     * Carga de forma segura los datos del comprobante PSE Daviplata de Miranda
     */
    cargarPresetDaviplata() {
        console.log("[Chuya::TicketGenerator] Cargando preset de prueba Daviplata PSE...");
        this._setInputValue("ticket-empresa", "EMPRESAS MUNICIPALES DE MIRANDA");
        this._setInputValue("ticket-monto", "20400");
        this._setInputValue("ticket-cus", "804875072");
        this._setInputValue("ticket-motivo", "Pago a EMPRESAS MUNICIPALES DE MIRANDA, ref: 1170569_1793910079_4390");
        this._setInputValue("ticket-fecha", "Noviembre 05 de 2026 - 03:24 pm");
        this._setInputValue("ticket-nano-user", "nano_3x804875072...miranda");

        this._hashTicketActual = null;
        this.actualizarVistaPrevia();

        if (typeof AdminUI?.mostrarToast === "function") {
            AdminUI.mostrarToast("⚡ Datos del comprobante PSE Daviplata cargados en Chuya.", "success");
        }
    },

    _procesarArchivoSubido(file) {
        console.log(`[Chuya::TicketGenerator] Archivo recibido en dropzone: "${file.name}" (${file.type || "sin MIME"})`);

        if (typeof AdminUI?.mostrarToast === "function") {
            AdminUI.mostrarToast(`📄 Archivo "${file.name}" cargado. Procesando datos...`, "success");
        }

        const lowerName = file.name.toLowerCase();
        if (lowerName.includes("daviplata") || lowerName.includes("pse")) {
            this.cargarPresetDaviplata();
        } else {
            this._setInputValue("ticket-motivo", `Comprobante: ${file.name}`);
            this._hashTicketActual = null;
            this.actualizarVistaPrevia();
        }
    },

    /**
     * Limpia emojis usando propiedades Unicode nativas (ES2018+) para compatibilidad QR y jsPDF
     */
    _limpiarTexto(str = "") {
        try {
            return String(str).replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
        } catch (e) {
            return String(str)
                .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
                .replace(/\s+/g, " ")
                .trim();
        }
    },

    /**
     * Helper defensivo para asignar valores a campos del DOM
     */
    _setInputValue(id, val) {
        const input = document.getElementById(id);
        if (input) input.value = val;
    },

    /**
     * Recolecta y normaliza los datos actuales del formulario de ticket
     */
    obtenerDatosTicketActual() {
        const empresa = document.getElementById("ticket-empresa")?.value.trim() || "EMPRESA DE SERVICIOS";
        const montoRaw = document.getElementById("ticket-monto")?.value || "0";
        const montoNum = Number.isNaN(parseFloat(montoRaw)) ? 0 : parseFloat(montoRaw);
        const cus = document.getElementById("ticket-cus")?.value.trim() || "000000";
        const motivo = document.getElementById("ticket-motivo")?.value.trim() || "Recarga / Servicio";
        const fecha = document.getElementById("ticket-fecha")?.value.trim() || new Date().toLocaleString("es-CO");

        const recompensaEl = document.getElementById("ticket-recompensa");
        const recompensaVal = recompensaEl?.value || "XNO";
        const selectedOption = recompensaEl?.selectedOptions?.[0];
        const recompensaTexto = selectedOption?.dataset?.badge || selectedOption?.text || "0.05 Nano (XNO) al traer cáscaras de huevo / aserrín";
        const nanoUser = document.getElementById("ticket-nano-user")?.value.trim() || "Cliente General";

        if (!this._hashTicketActual || !this._hashTicketActual.startsWith(`CUS-${cus}-`)) {
            this._hashTicketActual = `CUS-${cus}-${Date.now().toString(36)}`;
        }

        return {
            empresa,
            montoNum,
            montoFormatted: montoNum.toLocaleString("es-CO"),
            cus,
            motivo,
            fecha,
            recompensaVal,
            recompensaTexto,
            nanoUser,
            hash: this._hashTicketActual
        };
    },

    /**
     * Sincroniza los campos del formulario con la vista previa e interactúa con el QR
     */
    actualizarVistaPrevia() {
        const datos = this.obtenerDatosTicketActual();

        this._setElementText("lbl-rec-empresa", datos.empresa);
        this._setElementText("lbl-rec-monto", `$${datos.montoFormatted} COP`);
        this._setElementText("lbl-rec-cus", datos.cus);
        this._setElementText("lbl-rec-motivo", datos.motivo);
        this._setElementText("lbl-rec-fecha", datos.fecha);
        this._setElementText("lbl-rec-recompensa", datos.recompensaTexto);
        this._setElementText(
            "lbl-rec-nano-user",
            datos.nanoUser.length > 26 ? `${datos.nanoUser.substring(0, 24)}...` : datos.nanoUser
        );
        this._setElementText("lbl-rec-hash", datos.hash);

        const payloadCompacto = {
            b: "chuya",
            cus: datos.cus,
            v: datos.montoNum,
            r: datos.recompensaVal,
            u: this._limpiarTexto(datos.nanoUser)
        };

        this.renderQrTicket(payloadCompacto);
    },

    /**
     * Genera y descarga el comprobante PDF bajo la marca Chuya con flujo vertical dinámico (sin superposición)
     */
    descargarComprobantePDF() {
        const datos = this.obtenerDatosTicketActual();
        console.log("[Chuya::TicketGenerator] Generando comprobante PDF Chuya...", datos);

        if (window.AdminComprobantePDF && typeof window.AdminComprobantePDF.generarComprobante === "function") {
            window.AdminComprobantePDF.generarComprobante({
                destino: datos.empresa,
                fecha: datos.fecha,
                cus: datos.cus,
                motivo: datos.motivo,
                valorCOP: datos.montoNum,
                recompensaXNO: this._limpiarTexto(datos.recompensaTexto),
                cliente: datos.nanoUser,
                hash: datos.hash
            });
            return;
        }

        const JsPDFConstructor = window.jspdf?.jsPDF || window.jsPDF;
        if (!JsPDFConstructor) {
            console.warn("[Chuya::TicketGenerator] jsPDF no encontrado en window. Ejecutando impresión nativa como respaldo.");
            document.title = `Chuya_Comprobante_${datos.cus}`;
            window.print();
            return;
        }

        const doc = new JsPDFConstructor({
            orientation: "portrait",
            unit: "mm",
            format: [105, 195]
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 8;
        const contentWidth = pageWidth - marginX * 2;
        let cursorY = 12;

        const drawCentered = (text, size, style = "normal", color = [17, 24, 39], gap = 2) => {
            doc.setFont("helvetica", style);
            doc.setFontSize(size);
            doc.setTextColor(...color);
            const lines = doc.splitTextToSize(this._limpiarTexto(text), contentWidth);
            doc.text(lines, pageWidth / 2, cursorY, { align: "center" });
            cursorY += lines.length * (size * 0.42) + gap;
        };

        const drawRow = (label, value) => {
            const labelW = 24;
            const valX = marginX + labelW + 2;
            const valW = contentWidth - labelW - 2;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(75, 85, 99);
            doc.text(label, marginX, cursorY);

            doc.setFont("helvetica", "normal");
            doc.setTextColor(17, 24, 39);
            const lines = doc.splitTextToSize(this._limpiarTexto(value), valW);
            doc.text(lines, valX, cursorY);
            cursorY += Math.max(1, lines.length) * 4.2 + 2.2;
        };

        const drawLine = () => {
            doc.setDrawColor(16, 185, 129);
            doc.setLineWidth(0.3);
            doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
            cursorY += 4;
        };

        // Encabezado Chuya
        drawCentered(this.BRAND.NAME, 16, "bold", [4, 120, 87], 1.5);
        drawCentered(this.BRAND.TAGLINE, 8.5, "normal", [75, 85, 99], 1);
        drawCentered(this.BRAND.LOCATION, 8, "italic", [107, 114, 128], 3);
        drawLine();

        // Datos de Transacción
        drawCentered("COMPROBANTE DE PAGO & PROMOCIÓN", 9.5, "bold", [17, 24, 39], 4);
        drawRow("Destino:", datos.empresa);
        drawRow("Fecha:", datos.fecha);
        drawRow("CUS:", datos.cus);
        drawRow("Motivo:", datos.motivo);
        cursorY += 1;
        drawLine();

        // Valor Recibido
        drawCentered("VALOR RECIBIDO:", 8.5, "bold", [4, 120, 87], 1.5);
        drawCentered(`$${datos.montoFormatted} COP`, 13, "bold", [17, 24, 39], 3);
        drawLine();

        // Recompensa Circular
        drawCentered("INSTRUCCIONES & RECOMPENSA", 8.5, "bold", [180, 83, 9], 2);
        drawCentered("Trae tus cáscaras de huevo o aserrín seco a nuestra tienda y reclama:", 8, "normal", [55, 65, 81], 2);
        drawCentered(datos.recompensaTexto, 8.5, "bold", [4, 120, 87], 2.5);
        drawCentered("¡Construyamos economía sustentable en Miranda!", 8, "italic", [75, 85, 99], 3);
        drawLine();

        // Pie de comprobante
        drawRow("Cliente:", datos.nanoUser);
        cursorY += 1;
        drawCentered("Gracias por apoyar el comercio local sustentable", 8, "normal", [75, 85, 99], 2);
        drawCentered(`Hash: ${datos.hash}`, 7.5, "bold", [107, 114, 128], 2);

        const fileName = `Chuya_Comprobante_${datos.cus}.pdf`;
        doc.save(fileName);
        console.log("[Chuya::TicketGenerator] Comprobante PDF guardado exitosamente:", { fileName, cursorY });

        if (typeof AdminUI?.mostrarToast === "function") {
            AdminUI.mostrarToast(`📄 Comprobante ${fileName} descargado.`, "success");
        }
    },

    /**
     * Helper defensivo para actualizar contenido textual en elementos del DOM
     */
    _setElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    },

    /**
     * Renderiza el código QR usando una cadena compacta con fallback seguro
     */
    renderQrTicket(payloadData) {
        const qrContainer = document.getElementById("receipt-qr-code");
        if (!qrContainer) return;

        qrContainer.innerHTML = "";

        const textPayload = typeof payloadData === "string" ? payloadData : JSON.stringify(payloadData);
        const QRConstructor = window.QRCode || (typeof QRCode !== "undefined" ? QRCode : null);

        if (QRConstructor) {
            try {
                new QRConstructor(qrContainer, {
                    text: textPayload,
                    width: 110,
                    height: 110,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRConstructor.CorrectLevel ? QRConstructor.CorrectLevel.L : 1
                });
            } catch (err) {
                console.error("[Chuya::TicketGenerator] Error al renderizar el código QR:", err);
                qrContainer.innerHTML = `<small style="color:red; font-size:9px;">⚠️ Error QR: Payload extenso</small>`;
            }
        } else {
            console.warn("[Chuya::TicketGenerator] QRCode.js no está disponible globalmente.");
        }
    }
};

window.TicketGeneratorModule = TicketGeneratorModule;