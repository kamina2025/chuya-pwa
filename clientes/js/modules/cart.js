/**
 * Chuya - Módulo de Gestión del Carrito con Validación de Stock
 * Ubicación: chuya-pwa/clientes/js/modules/cart.js
 * Stack: JS Vanilla ES6+ (Local-First)
 */

import { CONFIG } from "../config.js";

const CART_STORAGE_KEY = CONFIG.STORAGE_KEYS?.CURRENT_CART || "chuya_current_cart";
const LEGACY_CART_KEY = CONFIG.LEGACY_STORAGE_KEYS?.CURRENT_CART || "avelibre_current_cart";

export const CartService = {
    /**
     * Migra un carrito heredado de 'avelibre_current_cart' hacia 'chuya_current_cart' si existe
     * @private
     */
    _migrarCarritoHeredado() {
        try {
            if (!localStorage.getItem(CART_STORAGE_KEY) && localStorage.getItem(LEGACY_CART_KEY)) {
                const legacyRaw = localStorage.getItem(LEGACY_CART_KEY);
                localStorage.setItem(CART_STORAGE_KEY, legacyRaw);
                localStorage.removeItem(LEGACY_CART_KEY);
                console.log(`[Chuya::Cart] Carrito heredado migrado a '${CART_STORAGE_KEY}'.`);
            }
        } catch (e) {
            console.warn("[Chuya::Cart] No se pudo migrar carrito heredado:", e.message);
        }
    },

    /**
     * Obtiene los productos actuales del carrito desde LocalStorage
     * @returns {Array}
     */
    getCart() {
        this._migrarCarritoHeredado();
        try {
            const raw = localStorage.getItem(CART_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("[Chuya::Cart] Error al leer el carrito desde LocalStorage:", e.message);
            return [];
        }
    },

    /**
     * Agrega o actualiza un producto garantizando no superar el stock disponible
     * @param {Object} producto - Objeto del producto ({ id, nombre, precio, stock, icono, categoria })
     * @param {number} cantidad - Cantidad a añadir
     * @returns {Object} Resultado de la operación
     */
    addItem(producto, cantidad = 1) {
        if (!producto || !producto.id) {
            console.error("[Chuya::Cart] Producto inválido recibido en addItem().");
            return { success: false, maxAlcanzado: false, totalEnCarrito: 0, stockDisponible: 0 };
        }

        const stockDisponible = Math.max(0, Number(producto.stock) || 0);
        const cantidadSolicitada = Math.max(1, Number(cantidad) || 1);

        if (stockDisponible <= 0) {
            console.warn(`[Chuya::Cart] Producto '${producto.nombre}' sin stock disponible (${stockDisponible}).`);
            return {
                success: false,
                maxAlcanzado: true,
                totalEnCarrito: 0,
                stockDisponible: 0
            };
        }

        const cart = this.getCart();
        const existingIndex = cart.findIndex((item) => item.id === producto.id);
        const cantidadEnCarrito = existingIndex > -1 ? Number(cart[existingIndex].cantidad) || 0 : 0;
        let nuevaCantidadTotal = cantidadEnCarrito + cantidadSolicitada;

        let maxAlcanzado = false;
        if (nuevaCantidadTotal > stockDisponible) {
            console.warn(`[Chuya::Cart] Solicitud (${nuevaCantidadTotal}) supera el stock (${stockDisponible}) para '${producto.nombre}'. Limitando al stock máximo.`);
            nuevaCantidadTotal = stockDisponible;
            maxAlcanzado = true;
        }

        if (existingIndex > -1) {
            cart[existingIndex].cantidad = nuevaCantidadTotal;
            cart[existingIndex].stock = stockDisponible;
            cart[existingIndex].precio = Number(producto.precio) || cart[existingIndex].precio;
            console.log(`[Chuya::Cart] Cantidad actualizada para '${producto.nombre}': ${nuevaCantidadTotal}`);
        } else {
            cart.push({
                id: producto.id,
                nombre: producto.nombre,
                precio: Number(producto.precio) || 0,
                icono: producto.icono || "📦",
                categoria: producto.categoria || "general",
                stock: stockDisponible,
                cantidad: nuevaCantidadTotal
            });
            console.log(`[Chuya::Cart] Producto '${producto.nombre}' agregado al carrito (${nuevaCantidadTotal} unid.).`);
        }

        this.saveCart(cart);
        this.updateCartBadge();

        return {
            success: true,
            maxAlcanzado,
            totalEnCarrito: nuevaCantidadTotal,
            stockDisponible
        };
    },

    /**
     * Actualiza la cantidad exacta de un ítem en el carrito
     * Si la cantidad es <= 0, elimina el producto del carrito.
     * @param {string} id
     * @param {number} nuevaCantidad
     */
    updateQuantity(id, nuevaCantidad) {
        const parsedQty = Number(nuevaCantidad);
        if (Number.isNaN(parsedQty)) return;

        if (parsedQty <= 0) {
            this.removeItem(id);
            return;
        }

        const cart = this.getCart();
        const item = cart.find((i) => i.id === id);
        if (item) {
            const maxStock = Math.max(1, Number(item.stock) || 99);
            item.cantidad = Math.min(Math.floor(parsedQty), maxStock);
            this.saveCart(cart);
            this.updateCartBadge();
            console.log(`[Chuya::Cart] Cantidad ajustada para '${item.nombre}': ${item.cantidad}/${maxStock}`);
        }
    },

    /**
     * Remueve un ítem del carrito por su ID
     * @param {string} id
     */
    removeItem(id) {
        let cart = this.getCart();
        const prevLength = cart.length;
        cart = cart.filter((item) => item.id !== id);

        if (cart.length !== prevLength) {
            this.saveCart(cart);
            this.updateCartBadge();
            console.log(`[Chuya::Cart] Ítem '${id}' eliminado del carrito.`);
        }
    },

    /**
     * Guarda el arreglo del carrito en LocalStorage
     * @param {Array} cart
     */
    saveCart(cart) {
        try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
        } catch (e) {
            console.error("[Chuya::Cart] Error guardando carrito en LocalStorage:", e.message);
        }
    },

    /**
     * Vacía el carrito activo
     */
    clearCart() {
        localStorage.removeItem(CART_STORAGE_KEY);
        console.log("[Chuya::Cart] Carrito vaciado correctamente.");
        this.updateCartBadge();
    },

    /**
     * Calcula el total acumulado en COP
     * @returns {number}
     */
    getTotalCOP() {
        return this.getCart().reduce((sum, item) => sum + ((Number(item.precio) || 0) * (Number(item.cantidad) || 0)), 0);
    },

    /**
     * Calcula la sumatoria total de unidades en el carrito
     * @returns {number}
     */
    getTotalItems() {
        return this.getCart().reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);
    },

    /**
     * Actualiza los contadores visuales del carrito en el DOM y emite evento reactivo
     */
    updateCartBadge() {
        const cart = this.getCart();
        const totalItems = this.getTotalItems();

        const badgeVistaPedidos = document.getElementById("carrito-count-badge");
        if (badgeVistaPedidos) {
            badgeVistaPedidos.textContent = `${totalItems} ${totalItems === 1 ? "ítem" : "ítems"}`;
        }

        document.querySelectorAll("[data-cart-badge]").forEach((el) => {
            el.textContent = String(totalItems);
            el.classList.toggle("hidden", totalItems === 0);
        });

        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("chuya:cart-updated", {
                detail: { productosDistintos: cart.length, totalItems, totalCOP: this.getTotalCOP() }
            }));
        }

        console.log(`[Chuya::Cart] Estado del carrito: ${cart.length} productos distintos, ${totalItems} ítems totales.`);
    }
};

if (typeof window !== "undefined") {
    window.CartService = CartService;
}