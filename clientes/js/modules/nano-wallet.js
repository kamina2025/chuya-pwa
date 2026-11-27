/**
 * Chuya - Módulo Billetera Nano (XNO) & Consultas RPC
 * Stack: JS Vanilla ES6+
 */

import { CONFIG } from "../config.js";

export const NanoWallet = {
    /**
     * Valida el formato de una dirección Nano pública
     * @param {string} address 
     * @returns {boolean}
     */
    esDireccionValida(address) {
        if (!address || typeof address !== "string") return false;
        const regexNano = /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/;
        return regexNano.test(address.trim());
    },

    /**
     * Recupera o vincula la dirección Nano local
     * @param {string|null} nuevaDireccion 
     * @returns {string|null}
     */
    obtenerOVincular(nuevaDireccion = null) {
        console.log("[AveLibre::Wallet] Consultando dirección Nano en almacenamiento local...");

        if (nuevaDireccion) {
            if (this.esDireccionValida(nuevaDireccion)) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.NANO_ADDRESS, nuevaDireccion.trim());
                console.log("[AveLibre::Wallet] Nueva dirección Nano guardada:", nuevaDireccion.trim());
                return nuevaDireccion.trim();
            } else {
                console.error("[AveLibre::Wallet] Formato de dirección Nano no válido.");
                return null;
            }
        }

        const address = localStorage.getItem(CONFIG.STORAGE_KEYS.NANO_ADDRESS);
        if (!address) {
            console.warn("[AveLibre::Wallet] No hay dirección Nano vinculada en el dispositivo.");
            return null;
        }

        console.log("[AveLibre::Wallet] Dirección Nano recuperada:", address);
        return address;
    },

    /**
     * Consulta el saldo de la cuenta mediante nodo RPC
     * @param {string} address 
     * @returns {Promise<Object|null>}
     */
    async consultarSaldo(address) {
        if (!this.esDireccionValida(address)) {
            console.error("[AveLibre::Wallet] Dirección inválida. Consulta RPC abortada.");
            return null;
        }

        console.log("[AveLibre::Wallet] Consultando saldo RPC para:", address);
        try {
            const response = await fetch(CONFIG.NANO_RPC_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "account_balance", account: address })
            });

            if (!response.ok) throw new Error(`RPC Status Error: ${response.status}`);

            const data = await response.json();
            console.log("[AveLibre::Wallet] Respuesta de saldo RPC recibida:", data);
            return data;
        } catch (error) {
            console.error("[AveLibre::Wallet] Error al consultar nodo RPC de Nano:", error.message);
            return null;
        }
    }
};