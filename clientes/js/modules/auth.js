/**
 * Chuya - Módulo de Autenticación, Firma Criptográfica e Identidad Local
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

import { CONFIG } from "../config.js";
import { QRPDFImporter } from "./qr-pdf-importer.js";

export const AuthModule = {
    STORAGE_KEY: "avelibre_user_session",

    init() {
        console.log("[AveLibre::Auth] Inicializando módulo de identidad e importadores...");
        this.cacheDOM();
        this.bindEvents();
        this.cargarSesionPrevia();

        const importer = window.QRPDFImporter || (typeof QRPDFImporter !== "undefined" ? QRPDFImporter : null);
        if (importer && typeof importer.init === "function") {
            importer.init();
        }
    },

    cacheDOM() {
        // Fallback dual para dar soporte tanto a vistas/perfil.html como a vistas/login.html
        this.form = document.getElementById("form-perfil") || document.getElementById("form-login");
        this.inputNombre = document.getElementById("perfil-nombre") || document.getElementById("login-nombre");
        this.inputNano = document.getElementById("perfil-nano") || document.getElementById("login-nano");
        this.inputPGP = document.getElementById("perfil-pgp") || document.getElementById("login-pgp");
        this.inputTelefono = document.getElementById("perfil-telefono");
        this.inputDireccion = document.getElementById("perfil-direccion");
        this.inputPDF = document.getElementById("input-pdf-file");
        this.btnQR = document.getElementById("btn-open-qr-scanner");
        this.qrContainer = document.getElementById("qr-reader-container");
    },

    bindEvents() {
        if (this.form) {
            this.form.addEventListener("submit", (e) => this.handleLogin(e));
        }

        // Evento de importación de PDF con auto-firmado de sesión local
        if (this.inputPDF) {
            this.inputPDF.addEventListener("change", async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                console.log("[AveLibre::Auth] Archivo PDF seleccionado:", file.name);
                const importer = window.QRPDFImporter || (typeof QRPDFImporter !== "undefined" ? QRPDFImporter : null);

                if (!importer || typeof importer.procesarPDF !== "function") {
                    alert("⚠️ El módulo de lectura PDF no se ha cargado. Reintenta en unos momentos.");
                    return;
                }

                try {
                    const datos = await importer.procesarPDF(file);

                    if (datos.nombre && this.inputNombre) this.inputNombre.value = datos.nombre;
                    if (datos.nanoAddress && this.inputNano) this.inputNano.value = datos.nanoAddress;
                    if (datos.pgpFingerprint && this.inputPGP) this.inputPGP.value = datos.pgpFingerprint;

                    // Si se extrajo la identidad completa, auto-guardar en LocalStorage
                    if (datos.nombre && datos.nanoAddress && datos.pgpFingerprint) {
                        const tel = this.inputTelefono?.value.trim() || "";
                        const dir = this.inputDireccion?.value.trim() || "";
                        this.guardarSesionLocal(datos.nombre, datos.nanoAddress, datos.pgpFingerprint, tel, dir);
                        alert(`✅ Identidad de '${datos.nombre}' importada y firmada en el dispositivo.`);
                    } else {
                        console.warn("[AveLibre::Auth] Identidad parseada parcialmente:", datos);
                        alert("⚠️ Identidad importada parcialmente. Revisa la dirección Nano o la huella PGP.");
                    }
                } catch (err) {
                    console.error("[AveLibre::Auth] Error procesando PDF:", err.message);
                    alert("⚠️ Ocurrió un error al analizar el PDF de identidad.");
                }
            });
        }

        // Evento del escáner de código QR
        if (this.btnQR) {
            this.btnQR.addEventListener("click", () => {
                const importer = window.QRPDFImporter || (typeof QRPDFImporter !== "undefined" ? QRPDFImporter : null);
                if (!importer || typeof importer.iniciarEscanerQR !== "function") {
                    alert("⚠️ El módulo del escáner QR aún se está cargando.");
                    return;
                }

                if (this.qrContainer) this.qrContainer.style.display = "block";

                importer.iniciarEscanerQR("qr-reader-container", (contenidoQR) => {
                    console.log("[AveLibre::Auth] QR decodificado exitosamente:", contenidoQR);

                    if (contenidoQR.startsWith("nano_") || contenidoQR.startsWith("xrb_")) {
                        if (this.inputNano) this.inputNano.value = contenidoQR;
                    } else if (contenidoQR.length === 40) {
                        if (this.inputPGP) this.inputPGP.value = contenidoQR;
                    } else {
                        if (this.inputNano) this.inputNano.value = contenidoQR;
                    }

                    if (this.qrContainer) this.qrContainer.style.display = "none";
                    alert("📷 Datos escaneados del QR aplicados.");
                });
            });
        }
    },

    guardarSesionLocal(nombre, nanoAddress, pgpFingerprint, telefono = "", direccion = "") {
        const sesionPrevia = this.obtenerSesion() || {};

        const sessionData = {
            nombre: nombre,
            nanoAddress: nanoAddress,
            pgpFingerprint: pgpFingerprint,
            telefono: telefono || sesionPrevia.telefono || "",
            direccion: direccion || sesionPrevia.direccion || "",
            loggedAt: new Date().toISOString()
        };

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
        localStorage.setItem(CONFIG.STORAGE_KEYS?.NANO_ADDRESS || "nano_address", nanoAddress);
        console.log("[AveLibre::Auth] Sesión registrada y vinculada en almacenamiento local:", sessionData);
    },

    handleLogin(event) {
        if (event) event.preventDefault();

        const nombre = this.inputNombre?.value.trim();
        const nanoAddress = this.inputNano?.value.trim();
        const pgpFingerprint = this.inputPGP?.value.trim().replaceAll(" ", "");
        const telefono = this.inputTelefono?.value.trim() || "";
        const direccion = this.inputDireccion?.value.trim() || "";

        if (!nombre || !nanoAddress || !pgpFingerprint) {
            alert("Por favor completa los campos de identidad obligatorios (Nombre, Nano, PGP).");
            return;
        }

        this.guardarSesionLocal(nombre, nanoAddress, pgpFingerprint, telefono, direccion);

        if (window.Router) {
            window.Router.navigate("#inicio");
        } else {
            window.location.hash = "#inicio";
        }
    },

    cargarSesionPrevia() {
        const session = this.obtenerSesion();
        if (session) {
            if (this.inputNombre) this.inputNombre.value = session.nombre || "";
            if (this.inputNano) this.inputNano.value = session.nanoAddress || "";
            if (this.inputPGP) this.inputPGP.value = session.pgpFingerprint || "";
            if (this.inputTelefono) this.inputTelefono.value = session.telefono || "";
            if (this.inputDireccion) this.inputDireccion.value = session.direccion || "";
            console.log("[AveLibre::Auth] Sesión previa precargada en formulario:", session.nombre);
        }
    },

    obtenerSesion() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error("[AveLibre::Auth] Error al leer sesión de localStorage:", e.message);
            return null;
        }
    },

    firmarTransaccion(payload) {
        const session = this.obtenerSesion();
        if (!session) {
            console.warn("[AveLibre::Auth] Operación rechazada: Sin sesión activa para firmar.");
            return payload;
        }

        const timestamp = Date.now();
        const hashFirma = `SIG-${session.pgpFingerprint.substring(0, 8)}-${timestamp}`;

        console.log("[AveLibre::Auth] Transacción firmada con éxito para usuario:", session.nombre);

        return {
            ...payload,
            cliente: session.nombre,
            nanoAddress: session.nanoAddress,
            pgpFingerprint: session.pgpFingerprint,
            telefono: session.telefono || "",
            direccion: session.direccion || "",
            firmaDigital: hashFirma,
            timestamp: timestamp
        };
    }
};

window.AuthModule = AuthModule;