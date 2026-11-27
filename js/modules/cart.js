/**
 * Chuya - Módulo de Gestión del Carrito con Validación de Stock
 * Stack: JS Vanilla ES6+ (Local-First)
 */

const CART_STORAGE_KEY = "avelibre_current_cart";

export const CartService = {
    /**
     * Obtiene los productos actuales del carrito desde LocalStorage
     * @returns {Array}
     */
    getCart() {
        try {
            const raw = localStorage.getItem(CART_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("[AveLibre::Cart] Error al leer el carrito desde LocalStorage:", e.message);
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
        const cart = this.getCart();
        const existingIndex = cart.findIndex(item => item.id === producto.id);
        const stockDisponible = Number(producto.stock) || 0;
        
        const cantidadEnCarrito = existingIndex > -1 ? cart[existingIndex].cantidad : 0;
        let nuevaCantidadTotal = cantidadEnCarrito + Number(cantidad);

        let maxAlcanzado = false;
        if (nuevaCantidadTotal > stockDisponible) {
            console.warn(`[AveLibre::Cart] Solicitud (${nuevaCantidadTotal}) supera el stock (${stockDisponible}) para '${producto.nombre}'. Limitando al stock máximo.`);
            nuevaCantidadTotal = stockDisponible;
            maxAlcanzado = true;
        }

        if (existingIndex > -1) {
            cart[existingIndex].cantidad = nuevaCantidadTotal;
            cart[existingIndex].stock = stockDisponible;
            console.log(`[AveLibre::Cart] Cantidad actualizada para '${producto.nombre}': ${nuevaCantidadTotal}`);
        } else {
            cart.push({
                id: producto.id,
                nombre: producto.nombre,
                precio: Number(producto.precio),
                icono: producto.icono || "📦",
                categoria: producto.categoria,
                stock: stockDisponible,
                cantidad: nuevaCantidadTotal
            });
            console.log(`[AveLibre::Cart] Producto '${producto.nombre}' agregado al carrito.`);
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
     */
    updateQuantity(id, nuevaCantidad) {
        const cart = this.getCart();
        const item = cart.find(i => i.id === id);
        if (item) {
            const maxStock = Number(item.stock) || 99;
            item.cantidad = Math.min(Math.max(1, Number(nuevaCantidad)), maxStock);
            this.saveCart(cart);
            this.updateCartBadge();
        }
    },

    /**
     * Remueve un ítem del carrito por su ID
     */
    removeItem(id) {
        let cart = this.getCart();
        cart = cart.filter(item => item.id !== id);
        this.saveCart(cart);
        this.updateCartBadge();
        console.log(`[AveLibre::Cart] Ítem '${id}' eliminado del carrito.`);
    },

    saveCart(cart) {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    },

    clearCart() {
        localStorage.removeItem(CART_STORAGE_KEY);
        console.log("[AveLibre::Cart] Carrito vaciado correctamente.");
        this.updateCartBadge();
    },

    getTotalCOP() {
        return this.getCart().reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    },

    updateCartBadge() {
        const cart = this.getCart();
        const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0);
        console.log(`[AveLibre::Cart] Estado del carrito: ${cart.length} productos distintos, ${totalItems} ítems totales.`);
    }
};