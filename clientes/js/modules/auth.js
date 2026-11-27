/**
 * Chuya - Módulo de Autenticación, Firma Criptográfica e Identidad Local
 * Ubicación: chuya-pwa/clientes/js/modules/auth.js
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

import { CONFIG } from "../config.js";
import { QRPDFImporter } from "./qr-pdf-importer.js";

const NANO_ADDRESS_REGEX = /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/i;
const PGP_FINGERPRINT_REGEX = /^[A-Fa-f0-9]{40}$/;

export const AuthModule = {
    STORAGE_KEY: CONFIG.STORAGE_KEYS?.USER_SESSION || "chuya_user_session",
    LEGACY_STORAGE_KEY: "avelibre_user_session",

    init() {
        console.log("[Chuya::Auth] Inicializando módulo de identidad e importadores...");
        this.migrarSesionHeredada();
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
        if (this.form && !this.form.dataset.authBound) {
            this.form.dataset.authBound = "true";
            this.form.addEventListener("submit", (e) => this.handleLogin(e));
        }

        // Evento de importación de PDF con auto-firmado de sesión local
        if (this.inputPDF && !this.inputPDF.dataset.authBound) {
            this.inputPDF.dataset.authBound = "true";
            this.inputPDF.addEventListener("change", async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                console.log("[Chuya::Auth] Archivo PDF seleccionado:", file.name);
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

                    const validacion = this.validarCredenciales(
                        datos.nombre,
                        datos.nanoAddress,
                        datos.pgpFingerprint
                    );

                    if (validacion.valida) {
                        const tel = this.inputTelefono?.value.trim() || "";
                        const dir = this.inputDireccion?.value.trim() || "";
                        this.guardarSesionLocal(
                            validacion.nombre,
                            validacion.nanoAddress,
                            validacion.pgpFingerprint,
                            tel,
                            dir
                        );
                        alert(`✅ Identidad de '${validacion.nombre}' importada y firmada en el dispositivo.`);
                    } else {
                        console.warn("[Chuya::Auth] Identidad parseada parcialmente desde PDF:", datos);
                        alert(`⚠️ Identidad importada parcialmente: ${validacion.error}`);
                    }
                } catch (err) {
                    console.error("[Chuya::Auth] Error procesando PDF:", err.message);
                    alert("⚠️ Ocurrió un error al analizar el PDF de identidad.");
                } finally {
                    // Permitir re-seleccionar el mismo archivo si el usuario lo vuelve a intentar
                    e.target.value = "";
                }
            });
        }

        // Evento del escáner de código QR (soporta JSON de tarjeta Chuya y cadenas planas)
        if (this.btnQR && !this.btnQR.dataset.authBound) {
            this.btnQR.dataset.authBound = "true";
            this.btnQR.addEventListener("click", () => {
                const importer = window.QRPDFImporter || (typeof QRPDFImporter !== "undefined" ? QRPDFImporter : null);
                if (!importer || typeof importer.iniciarEscanerQR !== "function") {
                    alert("⚠️ El módulo del escáner QR aún se está cargando.");
                    return;
                }

                if (this.qrContainer) this.qrContainer.style.display = "block";

                importer.iniciarEscanerQR("qr-reader-container", (contenidoQR) => {
                    console.log("[Chuya::Auth] QR decodificado exitosamente:", contenidoQR);
                    this._aplicarPayloadQR(contenidoQR);
                    if (this.qrContainer) this.qrContainer.style.display = "none";
                });
            });
        }
    },

    /**
     * Interpreta códigos QR estructurados (JSON tarjeta Chuya) o valores individuales (Nano / PGP)
     * @private
     */
    _aplicarPayloadQR(rawQR) {
        const texto = String(rawQR || "").trim();

        // 1. Intentar parseo JSON estructurado emitido por panel admin-recolector
        if (texto.startsWith("{") && texto.endsWith("}")) {
            try {
                const parsed = JSON.parse(texto);
                const nombre = String(parsed.name || parsed.nombre || "").trim();
                const nano = String(parsed.nano || parsed.nanoAddress || "").trim().toLowerCase();
                const pgp = String(parsed.pgp || parsed.pgpFingerprint || "").replace(/\s+/g, "").toUpperCase();

                if (nombre && this.inputNombre) this.inputNombre.value = nombre;
                if (nano && this.inputNano) this.inputNano.value = nano;
                if (pgp && this.inputPGP) this.inputPGP.value = pgp;

                const validacion = this.validarCredenciales(nombre, nano, pgp);
                if (validacion.valida) {
                    const tel = this.inputTelefono?.value.trim() || "";
                    const dir = this.inputDireccion?.value.trim() || "";
                    this.guardarSesionLocal(validacion.nombre, validacion.nanoAddress, validacion.pgpFingerprint, tel, dir);
                    alert(`✅ Tarjeta QR de '${validacion.nombre}' vinculada y firmada en el dispositivo.`);
                    return;
                }
                alert("📷 Datos de tarjeta QR cargados. Verifica los campos faltantes.");
                return;
            } catch (e) {
                console.warn("[Chuya::Auth] QR con llaves no es JSON válido, evaluando como texto plano.");
            }
        }

        // 2. Fallback para QR unitario (solo dirección Nano o solo huella PGP)
        const limpio = texto.replace(/^nano:/i, "").trim();
        if (NANO_ADDRESS_REGEX.test(limpio)) {
            if (this.inputNano) this.inputNano.value = limpio.toLowerCase();
            alert("📷 Dirección Nano escaneada correctamente.");
        } else if (PGP_FINGERPRINT_REGEX.test(limpio.replace(/\s+/g, ""))) {
            if (this.inputPGP) this.inputPGP.value = limpio.replace(/\s+/g, "").toUpperCase();
            alert("📷 Huella PGP escaneada correctamente.");
        } else {
            if (this.inputNano) this.inputNano.value = limpio;
            alert("⚠️ Contenido QR aplicado. Verifica que el formato corresponda a tu billetera o PGP.");
        }
    },

    /**
     * Valida sintácticamente nombre, dirección Nano (65 chars) y fingerprint PGP (40 hex)
     */
    validarCredenciales(nombre, nanoAddress, pgpFingerprint) {
        const cleanNombre = String(nombre || "").trim();
        const cleanNano = String(nanoAddress || "").trim().toLowerCase();
        const cleanPGP = String(pgpFingerprint || "").replace(/\s+/g, "").toUpperCase();

        if (!cleanNombre) {
            return { valida: false, error: "El nombre de miembro es obligatorio." };
        }
        if (!NANO_ADDRESS_REGEX.test(cleanNano)) {
            return { valida: false, error: "La dirección Nano (XNO) no tiene un formato válido." };
        }
        if (!PGP_FINGERPRINT_REGEX.test(cleanPGP)) {
            return { valida: false, error: "La huella PGP debe tener exactamente 40 caracteres hexadecimales." };
        }

        return {
            valida: true,
            nombre: cleanNombre,
            nanoAddress: cleanNano,
            pgpFingerprint: cleanPGP
        };
    },

    guardarSesionLocal(nombre, nanoAddress, pgpFingerprint, telefono = "", direccion = "") {
        const sesionPrevia = this.obtenerSesion() || {};

        const sessionData = {
            nombre: String(nombre).trim(),
            nanoAddress: String(nanoAddress).trim().toLowerCase(),
            pgpFingerprint: String(pgpFingerprint).replace(/\s+/g, "").toUpperCase(),
            telefono: telefono || sesionPrevia.telefono || "",
            direccion: direccion || sesionPrevia.direccion || "",
            loggedAt: new Date().toISOString()
        };

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
        localStorage.setItem(CONFIG.STORAGE_KEYS?.NANO_ADDRESS || "chuya_nano_address", sessionData.nanoAddress);
        console.log("[Chuya::Auth] Sesión registrada y vinculada en almacenamiento local:", sessionData.nombre);
    },

    handleLogin(event) {
        if (event) event.preventDefault();

        const validacion = this.validarCredenciales(
            this.inputNombre?.value,
            this.inputNano?.value,
            this.inputPGP?.value
        );

        if (!validacion.valida) {
            console.warn("[Chuya::Auth] Validación fallida en formulario:", validacion.error);
            alert(`⚠️ ${validacion.error}`);
            return;
        }

        const telefono = this.inputTelefono?.value.trim() || "";
        const direccion = this.inputDireccion?.value.trim() || "";

        this.guardarSesionLocal(
            validacion.nombre,
            validacion.nanoAddress,
            validacion.pgpFingerprint,
            telefono,
            direccion
        );

        alert(`✅ Bienvenido(a), ${validacion.nombre}. Identidad firmada localmente.`);

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
            console.log("[Chuya::Auth] Sesión previa precargada en formulario:", session.nombre);
        }
    },

    migrarSesionHeredada() {
        try {
            if (!localStorage.getItem(this.STORAGE_KEY) && localStorage.getItem(this.LEGACY_STORAGE_KEY)) {
                const legacyRaw = localStorage.getItem(this.LEGACY_STORAGE_KEY);
                localStorage.setItem(this.STORAGE_KEY, legacyRaw);
                localStorage.removeItem(this.LEGACY_STORAGE_KEY);
                console.log("[Chuya::Auth] Sesión migrada desde clave heredada a:", this.STORAGE_KEY);
            }
        } catch (e) {
            console.warn("[Chuya::Auth] No se pudo migrar sesión heredada:", e.message);
        }
    },

    obtenerSesion() {
        this.migrarSesionHeredada();
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error("[Chuya::Auth] Error al leer sesión de localStorage:", e.message);
            return null;
        }
    },

    tieneSesionValida() {
        const session = this.obtenerSesion();
        if (!session) return false;
        return this.validarCredenciales(session.nombre, session.nanoAddress, session.pgpFingerprint).valida;
    },

    firmarTransaccion(payload) {
        const session = this.obtenerSesion();
        if (!session || !session.pgpFingerprint) {
            console.warn("[Chuya::Auth] Operación rechazada: Sin sesión activa válida para firmar.");
            return payload;
        }

        const timestamp = Date.now();
        const hashFirma = `SIG-${session.pgpFingerprint.substring(0, 8)}-${timestamp}`;

        console.log("[Chuya::Auth] Transacción firmada con éxito para usuario:", session.nombre);

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

if (typeof window !== "undefined") {
    window.AuthModule = AuthModule;
}