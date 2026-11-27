/**
 * Chuya - Utilitario de Cifrado Simétrico Nativo (Local-First)
 * Stack: JS Vanilla ES6+ (Web Crypto API - AES-GCM + PBKDF2)
 * Descripción: Maneja cifrado y descifrado PII en memoria RAM local
 * protegiendo los parámetros criptográficos contra modificaciones en runtime.
 */

// Configuración criptográfica inmutable
const CRYPTO_CONFIG = Object.freeze({
    SALT: new TextEncoder().encode("avelibre_pii_salt_2026"),
    ITERATIONS: 100000,
    FALLBACK_SECRET: "avelibre_fallback_key_2026"
});

export const CryptoUtils = {
    /**
     * Deriva una clave simétrica AES-GCM (256 bits) a partir de una semilla PGP usando PBKDF2
     * @param {string} secret - Semilla de derivación (pgpFingerprint o clave del admin)
     * @returns {Promise<CryptoKey>} Clave simétrica derivada
     */
    async derivarClave(secret) {
        const encoder = new TextEncoder();
        const secretStr = (secret && String(secret).trim() !== "") 
            ? String(secret).trim() 
            : CRYPTO_CONFIG.FALLBACK_SECRET;

        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            encoder.encode(secretStr),
            "PBKDF2",
            false,
            ["deriveKey"]
        );

        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: CRYPTO_CONFIG.SALT,
                iterations: CRYPTO_CONFIG.ITERATIONS,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    /**
     * Cifra un texto en plano mediante AES-GCM devolviendo un payload en Base64 (IV + Ciphertext)
     * @param {string} textoPlano - PII a cifrar
     * @param {string} secret - Semilla PGP o clave pública
     * @returns {Promise<string>} Cadena cifrada en Base64
     */
    async cifrar(textoPlano, secret) {
        if (!textoPlano || typeof textoPlano !== "string" || textoPlano.trim() === "") {
            return "";
        }

        try {
            const encoder = new TextEncoder();
            const key = await this.derivarClave(secret);
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            const encryptedBuffer = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                key,
                encoder.encode(textoPlano.trim())
            );

            const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encryptedBuffer), iv.length);

            return this._uint8ArrayToBase64(combined);
        } catch (error) {
            console.error("[AveLibre::Crypto] Error al cifrar dato sensible:", error.message || error);
            return textoPlano;
        }
    },

    /**
     * Descifra una cadena en Base64 utilizando la semilla PGP en memoria RAM
     * @param {string} base64Cifrado - Cadena cifrada en formato Base64
     * @param {string} secret - Semilla PGP o clave del administrador
     * @returns {Promise<string>} Texto descifrado o valor original en caso de fallback
     */
    async descifrar(base64Cifrado, secret) {
        if (!base64Cifrado || typeof base64Cifrado !== "string" || base64Cifrado.trim() === "") {
            return "";
        }

        const rawData = base64Cifrado.trim();
        const base64Regex = /^[A-Za-z0-9+/=]+$/;

        // Si no cumple el formato o longitud mínima de un payload IV+Ciphertext, se asume texto plano
        if (rawData.length <= 16 || !base64Regex.test(rawData)) {
            return rawData;
        }

        try {
            const binaryStr = atob(rawData);
            const combined = Uint8Array.from(binaryStr, c => c.charCodeAt(0));

            if (combined.length <= 12) {
                return rawData;
            }

            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const key = await this.derivarClave(secret);

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                ciphertext
            );

            return new TextDecoder().decode(decryptedBuffer);
        } catch (error) {
            // Retorna el dato original si falla el descifrado (clave distinta o texto plano sin cifrar)
            return rawData;
        }
    },

    /**
     * Helper binario seguro para conversión de Uint8Array a Base64 sin desbordamiento de pila
     * @param {Uint8Array} bytes 
     * @returns {string}
     */
    _uint8ArrayToBase64(bytes) {
        let binary = "";
        const len = bytes.byteLength;
        const chunkSize = 0x8000; // Procesamiento seguro en bloques de 32KB
        for (let i = 0; i < len; i += chunkSize) {
            binary += String.fromCharCode.apply(
                null, 
                bytes.subarray(i, Math.min(i + chunkSize, len))
            );
        }
        return btoa(binary);
    }
};

// Exposición global para scripts no modulares
if (typeof window !== "undefined") {
    window.CryptoUtils = CryptoUtils;
}