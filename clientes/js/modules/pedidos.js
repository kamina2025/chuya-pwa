/**
 * Chuya - Módulo de Gestión de Pedidos, Carrito, Modal y Cifrado PII
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

import { CONFIG } from "../config.js";
import { CartService } from "./cart.js";
import { APIService } from "./api-service.js";
import { AuthModule } from "./auth.js";
import { CryptoUtils } from "./crypto-utils.js";

const ORDER_HISTORY_KEY = "avelibre_order_history";

export const PedidosView = {
    async init() {
        console.log("[AveLibre::Pedidos] Inicializando vista de pedidos, carrito y modal cifrado...");
        this.cacheDOM();
        this.renderCarrito();
        this.renderHistorial();
        this.bindModalEvents();
    },

    cacheDOM() {
        this.modal = document.getElementById("modal-resumen-pedido");
        this.btnCerrarModal = document.getElementById("btn-cerrar-modal");
        this.btnCancelarModal = document.getElementById("btn-cancelar-modal");
        this.formDespacho = document.getElementById("form-confirmar-despacho");
        this.inputTelefono = document.getElementById("modal-telefono");
        this.inputDireccion = document.getElementById("modal-direccion");
        this.resumenItemsBox = document.getElementById("modal-resumen-items");
        this.modalTotalEl = document.getElementById("modal-total-amount");
    },

    renderCarrito() {
        const container = document.getElementById("carrito-contenedor");
        if (!container) return;

        const cart = CartService.getCart();

        if (cart.length === 0) {
            container.innerHTML = `
                <div class="empty-state text-center py-4">
                    <p>🛒 Tu carrito de compras está vacío.</p>
                    <a href="#catalogo" class="btn-link-catalogo">📦 Ver productos disponibles</a>
                </div>`;
            return;
        }

        const totalCOP = CartService.getTotalCOP();

        container.innerHTML = `
            <div class="cart-items-list">
                ${cart.map(item => `
                    <div class="cart-item-card" data-id="${item.id}">
                        <div class="cart-item-info">
                            <span class="cart-item-icon">${item.icono || "📦"}</span>
                            <div>
                                <h4 class="cart-item-title">${item.nombre}</h4>
                                <p class="cart-item-price">$${Number(item.precio).toLocaleString("es-CO")} COP c/u</p>
                            </div>
                        </div>
                        <div class="cart-item-controls">
                            <input type="number" value="${item.cantidad}" min="1" max="${item.stock || 99}" data-id="${item.id}" class="cart-qty-input" />
                            <span class="cart-item-subtotal">$${(item.precio * item.cantidad).toLocaleString("es-CO")} COP</span>
                            <button type="button" class="btn-remove-item" data-id="${item.id}" aria-label="Eliminar item">&times;</button>
                        </div>
                    </div>
                `).join("")}
            </div>

            <div class="cart-summary mt-4">
                <div class="cart-total-row">
                    <span>Total Pedido:</span>
                    <strong class="cart-total-amount">$${totalCOP.toLocaleString("es-CO")} COP</strong>
                </div>
                <button type="button" id="btn-confirmar-pedido" class="btn-confirm-order mt-3">
                    🚀 Confirmar y Enviar Pedido
                </button>
            </div>
        `;

        this.bindCartEvents();
    },

    bindCartEvents() {
        const qtyInputs = document.querySelectorAll(".cart-qty-input");
        qtyInputs.forEach(input => {
            input.addEventListener("change", (e) => {
                const id = e.target.getAttribute("data-id");
                const newQty = parseInt(e.target.value, 10) || 1;
                CartService.updateQuantity(id, newQty);
                this.renderCarrito();
            });
        });

        const removeBtns = document.querySelectorAll(".btn-remove-item");
        removeBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                CartService.removeItem(id);
                this.renderCarrito();
            });
        });

        const btnConfirm = document.getElementById("btn-confirmar-pedido");
        if (btnConfirm) {
            btnConfirm.addEventListener("click", () => this.abrirModalResumen());
        }
    },

    /**
     * Despliega el modal flotante de resumen, precargando y descifrando teléfono/dirección
     */
    async abrirModalResumen() {
        console.log("[AveLibre::Pedidos] Desplegando modal de resumen y datos de contacto...");

        const cart = CartService.getCart();
        if (cart.length === 0) {
            alert("⚠️ El carrito está vacío.");
            return;
        }

        const auth = window.AuthModule || AuthModule;
        const sesion = auth?.obtenerSesion();

        if (!sesion) {
            console.warn("[AveLibre::Pedidos] Requiere sesión para continuar.");
            alert("⚠️ Identifica tu dispositivo en el Portal (#perfil) antes de confirmar un pedido.");
            if (window.Router) window.Router.navigate("#perfil");
            else window.location.hash = "#perfil";
            return;
        }

        if (this.resumenItemsBox) {
            this.resumenItemsBox.innerHTML = cart.map(i => `
                <div class="d-flex justify-content-between text-muted small py-1">
                    <span>${i.cantidad}x ${i.nombre}</span>
                    <strong>$${(i.precio * i.cantidad).toLocaleString("es-CO")} COP</strong>
                </div>
            `).join("");
        }

        if (this.modalTotalEl) {
            this.modalTotalEl.textContent = `$${CartService.getTotalCOP().toLocaleString("es-CO")} COP`;
        }

        const crypto = window.CryptoUtils || CryptoUtils;
        const secret = sesion.pgpFingerprint;

        if (sesion.telefono) {
            this.inputTelefono.value = await crypto.descifrar(sesion.telefono, secret);
        } else {
            this.inputTelefono.value = "";
        }

        if (sesion.direccion) {
            this.inputDireccion.value = await crypto.descifrar(sesion.direccion, secret);
        } else {
            this.inputDireccion.value = "";
        }

        if (this.modal) {
            this.modal.classList.remove("hidden");
            this.modal.setAttribute("aria-hidden", "false");
            this.modal.removeAttribute("inert");
            
            // Mover el foco al primer input para accesibilidad ARIA
            if (this.inputTelefono) {
                setTimeout(() => this.inputTelefono.focus(), 50);
            }
        }
    },

    /**
     * Cierra el modal flotante retirando el foco de forma segura para evitar advertencias WAI-ARIA
     */
    cerrarModal() {
        if (this.modal) {
            // Retirar el foco activo para no dejar elementos enfocados dentro de un contenedor aria-hidden="true"
            if (document.activeElement && this.modal.contains(document.activeElement)) {
                document.activeElement.blur();
            }

            this.modal.classList.add("hidden");
            this.modal.setAttribute("aria-hidden", "true");
            this.modal.setAttribute("inert", "");
            console.log("[AveLibre::Pedidos] Modal de resumen cerrado.");
        }
    },

    bindModalEvents() {
        if (this.btnCerrarModal) this.btnCerrarModal.addEventListener("click", () => this.cerrarModal());
        if (this.btnCancelarModal) this.btnCancelarModal.addEventListener("click", () => this.cerrarModal());

        if (this.formDespacho) {
            this.formDespacho.addEventListener("submit", (e) => this.procesarEnvioPedidoModal(e));
        }

        // Cerrar con la tecla Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.modal && !this.modal.classList.contains("hidden")) {
                this.cerrarModal();
            }
        });
    },

    async procesarEnvioPedidoModal(event) {
        if (event) event.preventDefault();
        console.log("[AveLibre::Pedidos] Procesando envío definitivo desde el modal...");

        const auth = window.AuthModule || AuthModule;
        const sesion = auth?.obtenerSesion();
        const crypto = window.CryptoUtils || CryptoUtils;
        const secret = sesion?.pgpFingerprint;

        const telIngresado = this.inputTelefono?.value.trim();
        const dirIngresada = this.inputDireccion?.value.trim();

        if (!telIngresado || !dirIngresada) {
            alert("Por favor ingresa un teléfono y dirección de entrega válidos.");
            return;
        }

        const btnSubmit = document.getElementById("btn-enviar-pedido-modal");
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = "🔒 Cifrando datos y firmando...";
        }

        try {
            const telCifrado = await crypto.cifrar(telIngresado, secret);
            const dirCifrada = await crypto.cifrar(dirIngresada, secret);

            sesion.telefono = telCifrado;
            sesion.direccion = dirCifrada;
            localStorage.setItem(auth.STORAGE_KEY || "avelibre_user_session", JSON.stringify(sesion));
            console.log("[AveLibre::Pedidos] Sesión local actualizada con datos de residencia cifrados.");

            let orderData = {
                items: CartService.getCart(),
                totalCOP: CartService.getTotalCOP(),
                telefonoCifrado: telCifrado,
                direccionCifrada: dirCifrada,
                descuentoAplicado: localStorage.getItem("avelibre_descuento_aplicado") === "true",
                timestamp: Date.now()
            };

            orderData = auth.firmarTransaccion(orderData);
            console.log("[AveLibre::Pedidos] Pedido firmado digitalmente por usuario:", orderData.cliente);

            const respuesta = await APIService.enviarPedido(orderData);

            if (respuesta && (respuesta.success || respuesta.status === "success")) {
                const idPedido = respuesta.idPedido || ("PED-" + Date.now());
                this.guardarEnHistorialLocal({
                    idPedido: idPedido,
                    orderData: orderData,
                    cliente: orderData.cliente || sesion.nombre,
                    syncState: "sincronizado",
                    timestamp: orderData.timestamp || Date.now()
                });

                CartService.clearCart();
                localStorage.removeItem("avelibre_descuento_aplicado");
                this.cerrarModal();
                alert(`🎉 ¡Pedido ${idPedido} cifrado, firmado y registrado con éxito!`);
            } else {
                alert("⚠️ Ocurrió un inconveniente con el servidor. Tu pedido fue guardado localmente.");
            }
        } catch (error) {
            console.error("[AveLibre::Pedidos] Error crítico durante el envío del pedido:", error.message);
            alert("⚠️ Error al conectar con la red. Se encoló la orden de forma local.");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = "🚀 Confirmar y Enviar Pedido";
            }
            this.renderCarrito();
            this.renderHistorial();
        }
    },

    guardarEnHistorialLocal(completedOrder) {
        try {
            const history = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || "[]");
            history.unshift(completedOrder);
            localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            console.error("[AveLibre::Pedidos] Error guardando historial:", e.message);
        }
    },

    renderHistorial() {
        const container = document.getElementById("pedidos-lista");
        if (!container) return;

        try {
            const pendingOrders = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS?.PENDING_ORDERS || "avelibre_pending_orders") || "[]");
            const completedOrders = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || "[]");

            const todos = [...pendingOrders, ...completedOrders].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (todos.length === 0) {
                container.innerHTML = `<p class="text-center py-3 text-muted">No tienes pedidos en el historial.</p>`;
                return;
            }

            container.innerHTML = todos.map(p => {
                const orderObj = p.orderData || p;
                const fecha = p.timestamp ? new Date(p.timestamp).toLocaleString("es-CO") : "Fecha desconocida";
                const total = orderObj.totalCOP ? `$${Number(orderObj.totalCOP).toLocaleString("es-CO")} COP` : "Total variable";
                const firmaStr = orderObj.firmaDigital ? `<div class="text-muted small">🔑 Firma: <code>${orderObj.firmaDigital.substring(0, 18)}...</code></div>` : "";

                return `
                    <article class="pedido-card border rounded p-3 mb-2 shadow-sm">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="badge bg-success-subtle text-success">🛍️ Compra Registrada</span>
                            <span class="text-muted small">${fecha}</span>
                        </div>
                        <p class="m-0 mb-1">Monto: <strong>${total}</strong></p>
                        ${firmaStr}
                    </article>
                `;
            }).join("");
        } catch (e) {
            console.error("[AveLibre::Pedidos] Error renderizando historial:", e.message);
        }
    }
};

window.PedidosView = PedidosView;