/**
 * Chuya - Módulo Billetera Nano (XNO) & Consultas RPC
 * Ubicación: chuya-pwa/clientes/js/modules/nano-wallet.js
 * Stack: JS Vanilla ES6+ (Local-First)
 */

import { CONFIG } from "../config.js";

const NANO_ADDRESS_REGEX = /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/;
const RAW_PER_XNO = 1000000000000000000000000000000n; // 10^30 raw = 1 XNO

export const NanoWallet = {
    /**
     * Normaliza una dirección Nano eliminando esquemas URI ('nano:') y espacios
     * @param {string} address
     * @returns {string}
     */
    normalizarDireccion(address) {
        if (!address || typeof address !== "string") return "";
        return address.replace(/^nano:/i, "").trim().toLowerCase();
    },

    /**
     * Valida el formato de una dirección Nano pública (65 caracteres)
     * @param {string} address
     * @returns {boolean}
     */
    esDireccionValida(address) {
        const clean = this.normalizarDireccion(address);
        if (!clean) return false;
        return NANO_ADDRESS_REGEX.test(clean);
    },

    /**
     * Convierte un monto en unidades 'raw' (string/BigInt) a XNO legible (6 decimales)
     * @param {string|number|bigint} rawAmount
     * @returns {number}
     */
    rawToXNO(rawAmount) {
        try {
            const rawBig = BigInt(String(rawAmount || "0").trim());
            if (rawBig <= 0n) return 0;
            // Escalar por 10^6 para conservar 6 decimales sin pérdida de precisión
            const microXNO = (rawBig * 1000000n) / RAW_PER_XNO;
            return Number(microXNO) / 1000000;
        } catch (e) {
            console.warn("[Chuya::Wallet] Error convirtiendo raw a XNO:", e.message);
            return 0;
        }
    },

    /**
     * Recupera o vincula la dirección Nano local (con migración legacy y respaldo desde sesión)
     * @param {string|null} nuevaDireccion
     * @returns {string|null}
     */
    obtenerOVincular(nuevaDireccion = null) {
        const walletKey = CONFIG.STORAGE_KEYS?.NANO_ADDRESS || "chuya_nano_address";
        console.log("[Chuya::Wallet] Consultando dirección Nano en almacenamiento local...");

        if (nuevaDireccion) {
            const cleanNew = this.normalizarDireccion(nuevaDireccion);
            if (this.esDireccionValida(cleanNew)) {
                localStorage.setItem(walletKey, cleanNew);
                localStorage.setItem("nano_address", cleanNew); // Compatibilidad entre módulos
                console.log("[Chuya::Wallet] Nueva dirección Nano guardada:", cleanNew);
                return cleanNew;
            } else {
                console.error("[Chuya::Wallet] Formato de dirección Nano no válido:", nuevaDireccion);
                return null;
            }
        }

        // 1. Buscar en clave principal o claves heredadas
        let address = localStorage.getItem(walletKey)
            || localStorage.getItem("nano_address")
            || localStorage.getItem("avelibre_nano_wallet");

        // 2. Si no existe clave directa, intentar extraer desde la sesión activa de AuthModule
        if (!address) {
            try {
                const sessionRaw = localStorage.getItem(CONFIG.STORAGE_KEYS?.USER_SESSION || "chuya_user_session")
                    || localStorage.getItem("avelibre_user_session");
                if (sessionRaw) {
                    const session = JSON.parse(sessionRaw);
                    if (session?.nanoAddress && this.esDireccionValida(session.nanoAddress)) {
                        address = this.normalizarDireccion(session.nanoAddress);
                        localStorage.setItem(walletKey, address);
                        console.log("[Chuya::Wallet] Dirección Nano sincronizada desde sesión de usuario:", address);
                    }
                }
            } catch (e) {
                console.warn("[Chuya::Wallet] No se pudo leer sesión para sincronizar wallet:", e.message);
            }
        }

        const cleanStored = this.normalizarDireccion(address);
        if (!cleanStored || !this.esDireccionValida(cleanStored)) {
            console.warn("[Chuya::Wallet] No hay dirección Nano vinculada en el dispositivo.");
            return null;
        }

        // Asegurar persistencia unificada en la clave actual
        if (localStorage.getItem(walletKey) !== cleanStored) {
            localStorage.setItem(walletKey, cleanStored);
        }

        console.log("[Chuya::Wallet] Dirección Nano recuperada:", cleanStored);
        return cleanStored;
    },

    /**
     * Alias de compatibilidad requerido por gana-nano.js y auth.js
     * @param {string|null} nuevaDireccion
     * @returns {string|null}
     */
    obtenerOBilleteraNano(nuevaDireccion = null) {
        return this.obtenerOVincular(nuevaDireccion);
    },

    /**
     * Desvincula la billetera Nano local y limpia su caché de saldo
     */
    desvincular() {
        const walletKey = CONFIG.STORAGE_KEYS?.NANO_ADDRESS || "chuya_nano_address";
        localStorage.removeItem(walletKey);
        localStorage.removeItem("nano_address");
        localStorage.removeItem("avelibre_nano_wallet");
        localStorage.removeItem("chuya_wallet_balance_cache");
        console.log("[Chuya::Wallet] Billetera Nano desvinculada del almacenamiento local.");
    },

    /**
     * Consulta el saldo de la cuenta mediante nodo RPC con respaldo Local-First
     * @param {string} address
     * @returns {Promise<Object|null>}
     */
    async consultarSaldo(address) {
        const cleanAddr = this.normalizarDireccion(address || this.obtenerOVincular());
        if (!this.esDireccionValida(cleanAddr)) {
            console.error("[Chuya::Wallet] Dirección inválida. Consulta RPC abortada.");
            return null;
        }

        const cacheKey = "chuya_wallet_balance_cache";
        const cached = this._leerCacheSaldo(cacheKey, cleanAddr);

        if (!navigator.onLine) {
            console.warn("[Chuya::Wallet] Dispositivo offline. Retornando saldo en caché local.");
            return cached || { account: cleanAddr, balanceXNO: 0, pendingXNO: 0, unopened: true, offline: true };
        }

        const rpcUrl = CONFIG.NANO_RPC_URL || "https://rpc.nano.to";
        console.log(`[Chuya::Wallet] Consultando saldo RPC en ${rpcUrl} para:`, cleanAddr);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(rpcUrl, {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "account_balance", account: cleanAddr }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`RPC Status Error: ${response.status}`);

            const data = await response.json();

            // En la red Nano, una cuenta nueva sin transacciones recibidas devuelve "Account not found"
            if (data.error && /account not found/i.test(data.error)) {
                const unopenedResult = {
                    account: cleanAddr,
                    balanceRaw: "0",
                    pendingRaw: "0",
                    balanceXNO: 0,
                    pendingXNO: 0,
                    unopened: true,
                    updatedAt: Date.now()
                };
                localStorage.setItem(cacheKey, JSON.stringify(unopenedResult));
                console.log("[Chuya::Wallet] Cuenta Nano válida aún sin bloques abiertos (saldo 0 XNO).");
                return unopenedResult;
            }

            if (data.error) {
                throw new Error(data.error);
            }

            const balanceRaw = String(data.balance || "0");
            const pendingRaw = String(data.pending || data.receivable || "0");

            const result = {
                account: cleanAddr,
                balanceRaw,
                pendingRaw,
                balanceXNO: this.rawToXNO(balanceRaw),
                pendingXNO: this.rawToXNO(pendingRaw),
                unopened: false,
                updatedAt: Date.now()
            };

            localStorage.setItem(cacheKey, JSON.stringify(result));
            console.log("[Chuya::Wallet] Saldo RPC procesado con éxito:", result);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            console.error("[Chuya::Wallet] Error al consultar nodo RPC de Nano:", error.message);
            return cached || null;
        }
    },

    /**
     * Lee el último saldo cacheado si pertenece a la misma cuenta
     * @private
     */
    _leerCacheSaldo(cacheKey, address) {
        try {
            const raw = localStorage.getItem(cacheKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && parsed.account === address ? { ...parsed, cached: true } : null;
        } catch (e) {
            return null;
        }
    }
};

if (typeof window !== "undefined") {
    window.NanoWallet = NanoWallet;
}