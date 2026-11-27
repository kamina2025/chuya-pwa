/**
 * Chuya - Módulo de Derivación Criptográfica Nano (XNO)
 * Implementa resolución defensiva multi-namespace para nanocurrency / nanocurrency-web
 */

export const NanoKeyService = {
    /**
     * Resuelve y retorna las funciones criptográficas escaneando posibles nombres de espacio globales
     * @returns {Object} { deriveSecretKey, derivePublicKey, deriveAddress }
     */
    _obtenerFuncionesNano() {
        const fuentes = [
            window.nanocurrency,
            window.Nanocurrency,
            window.nanocurrencyWeb,
            window.NanocurrencyWeb,
            window.Nano,
            window
        ];

        for (const fuente of fuentes) {
            if (fuente && typeof fuente.deriveSecretKey === "function") {
                return {
                    deriveSecretKey: fuente.deriveSecretKey.bind(fuente),
                    derivePublicKey: fuente.derivePublicKey.bind(fuente),
                    deriveAddress: fuente.deriveAddress.bind(fuente)
                };
            }
        }

        throw new Error(
            "No se encontró la función 'deriveSecretKey'. Asegúrate de haber incluido script src='../libs/nanocurrency.min.js' en index.html antes de este módulo."
        );
    },

    /**
     * Deriva una dirección pública Nano dada la semilla y el índice del usuario
     * @param {string} seedHex - Semilla maestra de 64 caracteres hex
     * @param {number} index - Índice único del usuario (0, 1, 2...)
     * @returns {Object} { secretKey, publicKey, address }
     */
    generarDireccionMiembro(seedHex, index) {
        if (!seedHex || seedHex.trim().length !== 64) {
            throw new Error("La semilla debe contener exactamente 64 caracteres hexadecimales.");
        }

        // Extraer defensivamente las funciones de derivación
        const { deriveSecretKey, derivePublicKey, deriveAddress } = this._obtenerFuncionesNano();

        const secretKey = deriveSecretKey(seedHex.trim(), Number(index));
        const publicKey = derivePublicKey(secretKey);
        const address = deriveAddress(publicKey, { useNanoPrefix: true });

        console.log(`[AveLibre::NanoKeys] Dirección derivada localmente para índice ${index}: ${address}`);

        return {
            secretKey,
            publicKey,
            address
        };
    }
};