/**
 * Chuya - Módulo de Gestión de Pedidos, Carrito, Modal y Cifrado PII
 * Ubicación: chuya-pwa/clientes/js/modules/pedidos.js
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

import { CONFIG } from "../config.js";
import { CartService } from "./cart.js";
import { APIService } from "./api-service.js";
import { AuthModule } from "./auth.js";
import { CryptoUtils } from "../../../js/modules/crypto-utils.js";

console.log("[Chuya::Pedidos] Módulo compartido CryptoUtils cargado correctamente:", Boolean(CryptoUtils));

const STORAGE_KEYS = {
    USER_SESSION: CONFIG.STORAGE_KEYS?.USER_SESSION || "chuya_user_session",
    PENDING_ORDERS: CONFIG.STORAGE_KEYS?.PENDING_ORDERS || "chuya_pending_orders",
    ORDER_HISTORY: CONFIG.STORAGE_KEYS?.ORDER_HISTORY || "chuya_order_history",
    LEGACY_ORDER_HISTORY: "avelibre_order_history",
    DISCOUNT_APPLIED: CONFIG.STORAGE_KEYS?.DISCOUNT_APPLIED || "chuya_descuento_aplicado"
};

export const PedidosView = {
    _escapeHandlerBound: false,

    async init() {
        console.log("[Chuya::Pedidos] Inicializando vista de pedidos, carrito y modal cifrado...");
        this.cacheDOM();
        this.renderCarrito();
        this.renderHistorial();
        this.bindModalEvents();
        this.bindHistorialEvents();
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
        this.countBadgeEl = document.getElementById("carrito-count-badge");
    },

    _escapeHTML(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    renderCarrito() {
        const container = document.getElementById("carrito-contenedor");
        if (!container) {
            console.warn("[Chuya::Pedidos] Contenedor '#carrito-contenedor' no encontrado en el DOM.");
            return;
        }

        const cart = CartService.getCart();
        const totalUnidades = cart.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);

        if (this.countBadgeEl) {
            this.countBadgeEl.textContent = `${totalUnidades} ${totalUnidades === 1 ? "ítem" : "ítems"}`;
        }

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
                ${cart
                    .map(
                        (item) => `
                    <div class="cart-item-card" data-id="${this._escapeHTML(item.id)}">
                        <div class="cart-item-info">
                            <span class="cart-item-icon">${this._escapeHTML(item.icono || "📦")}</span>
                            <div>
                                <h4 class="cart-item-title">${this._escapeHTML(item.nombre)}</h4>
                                <p class="cart-item-price">$${Number(item.precio).toLocaleString("es-CO")} COP c/u</p>
                            </div>
                        </div>
                        <div class="cart-item-controls">
                            <input type="number" value="${Number(item.cantidad)}" min="1" max="${Number(item.stock) || 99}" data-id="${this._escapeHTML(item.id)}" class="cart-qty-input" />
                            <span class="cart-item-subtotal">$${(Number(item.precio) * Number(item.cantidad)).toLocaleString("es-CO")} COP</span>
                            <button type="button" class="btn-remove-item" data-id="${this._escapeHTML(item.id)}" aria-label="Eliminar item">&times;</button>
                        </div>
                    </div>
                `
                    )
                    .join("")}
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
        qtyInputs.forEach((input) => {
            input.addEventListener("change", (e) => {
                const id = e.target.getAttribute("data-id");
                const newQty = parseInt(e.target.value, 10) || 1;
                CartService.updateQuantity(id, newQty);
                this.renderCarrito();
            });
        });

        const removeBtns = document.querySelectorAll(".btn-remove-item");
        removeBtns.forEach((btn) => {
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
        console.log("[Chuya::Pedidos] Desplegando modal de resumen y datos de contacto...");

        const cart = CartService.getCart();
        if (cart.length === 0) {
            alert("⚠️ El carrito está vacío.");
            return;
        }

        const auth = window.AuthModule || AuthModule;
        const sesion = auth?.obtenerSesion();

        if (!sesion) {
            console.warn("[Chuya::Pedidos] Requiere sesión activa para continuar.");
            alert("⚠️ Identifica tu dispositivo en el Portal (#perfil) antes de confirmar un pedido.");
            if (window.Router) window.Router.navigate("#perfil");
            else window.location.hash = "#perfil";
            return;
        }

        if (this.resumenItemsBox) {
            this.resumenItemsBox.innerHTML = cart
                .map(
                    (i) => `
                <div class="d-flex justify-content-between text-muted small py-1">
                    <span>${Number(i.cantidad)}x ${this._escapeHTML(i.nombre)}</span>
                    <strong>$${(Number(i.precio) * Number(i.cantidad)).toLocaleString("es-CO")} COP</strong>
                </div>
            `
                )
                .join("");
        }

        if (this.modalTotalEl) {
            this.modalTotalEl.textContent = `$${CartService.getTotalCOP().toLocaleString("es-CO")} COP`;
        }

        const crypto = window.CryptoUtils || CryptoUtils;
        const secret = sesion.pgpFingerprint || sesion.nanoAddress || "";

        if (this.inputTelefono) {
            try {
                this.inputTelefono.value =
                    sesion.telefono && secret && typeof crypto?.descifrar === "function"
                        ? await crypto.descifrar(sesion.telefono, secret)
                        : sesion.telefono || "";
            } catch (e) {
                console.warn("[Chuya::Pedidos] No se pudo descifrar teléfono previo:", e.message);
                this.inputTelefono.value = "";
            }
        }

        if (this.inputDireccion) {
            try {
                this.inputDireccion.value =
                    sesion.direccion && secret && typeof crypto?.descifrar === "function"
                        ? await crypto.descifrar(sesion.direccion, secret)
                        : sesion.direccion || "";
            } catch (e) {
                console.warn("[Chuya::Pedidos] No se pudo descifrar dirección previa:", e.message);
                this.inputDireccion.value = "";
            }
        }

        if (this.modal) {
            this.modal.classList.remove("hidden");
            this.modal.setAttribute("aria-hidden", "false");
            this.modal.removeAttribute("inert");

            // Mover el foco al primer input para accesibilidad WAI-ARIA
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
            if (document.activeElement && this.modal.contains(document.activeElement)) {
                document.activeElement.blur();
            }

            this.modal.classList.add("hidden");
            this.modal.setAttribute("aria-hidden", "true");
            this.modal.setAttribute("inert", "");
            console.log("[Chuya::Pedidos] Modal de resumen cerrado.");
        }
    },

    bindModalEvents() {
        if (this.btnCerrarModal && this.btnCerrarModal.dataset.bound !== "true") {
            this.btnCerrarModal.dataset.bound = "true";
            this.btnCerrarModal.addEventListener("click", () => this.cerrarModal());
        }

        if (this.btnCancelarModal && this.btnCancelarModal.dataset.bound !== "true") {
            this.btnCancelarModal.dataset.bound = "true";
            this.btnCancelarModal.addEventListener("click", () => this.cerrarModal());
        }

        if (this.formDespacho && this.formDespacho.dataset.bound !== "true") {
            this.formDespacho.dataset.bound = "true";
            this.formDespacho.addEventListener("submit", (e) => this.procesarEnvioPedidoModal(e));
        }

        // Registrar listener Escape una sola vez en el ciclo de vida SPA
        if (!this._escapeHandlerBound) {
            this._escapeHandlerBound = true;
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && this.modal && !this.modal.classList.contains("hidden")) {
                    this.cerrarModal();
                }
            });
        }
    },

    async procesarEnvioPedidoModal(event) {
        if (event) event.preventDefault();
        console.log("[Chuya::Pedidos] Procesando envío definitivo desde el modal...");

        const auth = window.AuthModule || AuthModule;
        const sesion = auth?.obtenerSesion();
        if (!sesion) {
            alert("⚠️ Tu sesión expiró. Por favor vuelve a identificarte.");
            return;
        }

        const crypto = window.CryptoUtils || CryptoUtils;
        const secret = sesion.pgpFingerprint || sesion.nanoAddress || "";

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
            const telCifrado =
                secret && typeof crypto?.cifrar === "function"
                    ? await crypto.cifrar(telIngresado, secret)
                    : telIngresado;

            const dirCifrada =
                secret && typeof crypto?.cifrar === "function"
                    ? await crypto.cifrar(dirIngresada, secret)
                    : dirIngresada;

            sesion.telefono = telCifrado;
            sesion.direccion = dirCifrada;
            localStorage.setItem(auth.STORAGE_KEY || STORAGE_KEYS.USER_SESSION, JSON.stringify(sesion));
            console.log("[Chuya::Pedidos] Sesión local actualizada con datos de residencia cifrados.");

            let orderData = {
                items: CartService.getCart(),
                totalCOP: CartService.getTotalCOP(),
                telefonoCifrado: telCifrado,
                direccionCifrada: dirCifrada,
                descuentoAplicado: localStorage.getItem(STORAGE_KEYS.DISCOUNT_APPLIED) === "true",
                timestamp: Date.now()
            };

            orderData = auth.firmarTransaccion(orderData);
            console.log("[Chuya::Pedidos] Pedido firmado digitalmente por usuario:", orderData.cliente);

            const respuesta = await APIService.enviarPedido(orderData);

            if (respuesta && (respuesta.success || respuesta.status === "success")) {
                const idPedido = respuesta.idPedido || "PED-" + Date.now();
                this.guardarEnHistorialLocal({
                    idPedido: idPedido,
                    orderData: orderData,
                    cliente: orderData.cliente || sesion.nombre,
                    syncState: "sincronizado",
                    timestamp: orderData.timestamp || Date.now()
                });

                CartService.clearCart();
                localStorage.removeItem(STORAGE_KEYS.DISCOUNT_APPLIED);
                this.cerrarModal();
                alert(`🎉 ¡Pedido ${idPedido} cifrado, firmado y registrado con éxito!`);
            } else {
                console.warn("[Chuya::Pedidos] Respuesta no exitosa del backend. Pedido encolado localmente.");
                alert("⚠️ Ocurrió un inconveniente con el servidor. Tu pedido fue guardado localmente.");
            }
        } catch (error) {
            console.error("[Chuya::Pedidos] Error crítico durante el envío del pedido:", error.message);
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
            const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDER_HISTORY) || "[]");
            const yaExiste = history.some((item) => item.idPedido === completedOrder.idPedido);
            if (!yaExiste) {
                history.unshift(completedOrder);
                localStorage.setItem(STORAGE_KEYS.ORDER_HISTORY, JSON.stringify(history));
                console.log("[Chuya::Pedidos] Pedido guardado en historial local:", completedOrder.idPedido);
            }
        } catch (e) {
            console.error("[Chuya::Pedidos] Error guardando historial:", e.message);
        }
    },

    renderHistorial() {
        const container = document.getElementById("pedidos-lista");
        if (!container) return;

        try {
            const pendingOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_ORDERS) || "[]");
            const completedOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDER_HISTORY) || "[]");
            const legacyOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEGACY_ORDER_HISTORY) || "[]");

            const todos = [
                ...pendingOrders.map((p) => ({ ...p, syncState: p.syncState || "pendiente" })),
                ...completedOrders.map((c) => ({ ...c, syncState: "sincronizado" })),
                ...legacyOrders.map((l) => ({ ...l, syncState: l.syncState || "sincronizado" }))
            ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            console.log(`[Chuya::Pedidos] Historial renderizado (${todos.length} registros totales).`);

            if (todos.length === 0) {
                container.innerHTML = `<p class="text-center py-3 text-muted">No tienes pedidos en el historial.</p>`;
                return;
            }

            container.innerHTML = todos
                .map((p) => {
                    const orderObj = p.orderData || p;
                    const fecha = p.timestamp ? new Date(p.timestamp).toLocaleString("es-CO") : "Fecha desconocida";
                    const total = orderObj.totalCOP
                        ? `$${Number(orderObj.totalCOP).toLocaleString("es-CO")} COP`
                        : "Total variable";
                    const esSincronizado = p.syncState === "sincronizado";
                    const badgeEstado = esSincronizado
                        ? `<span class="badge bg-success-subtle text-success">🛍️ Compra Registrada</span>`
                        : `<span class="badge bg-warning-subtle text-warning">⏳ Pendiente Offline</span>`;
                    const idLabel = p.idPedido ? `<small class="text-muted ms-2">#${this._escapeHTML(p.idPedido)}</small>` : "";
                    const firmaStr = orderObj.firmaDigital
                        ? `<div class="text-muted small">🔑 Firma: <code>${this._escapeHTML(orderObj.firmaDigital.substring(0, 18))}...</code></div>`
                        : "";

                    return `
                    <article class="pedido-card border rounded p-3 mb-2 shadow-sm">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <div>${badgeEstado}${idLabel}</div>
                            <span class="text-muted small">${fecha}</span>
                        </div>
                        <p class="m-0 mb-1">Monto: <strong>${total}</strong></p>
                        ${firmaStr}
                    </article>
                `;
                })
                .join("");
        } catch (e) {
            console.error("[Chuya::Pedidos] Error renderizando historial:", e.message);
        }
    },

    bindHistorialEvents() {
        const btnSync = document.getElementById("btn-sync-now");
        if (!btnSync || btnSync.dataset.bound === "true") return;

        btnSync.dataset.bound = "true";
        btnSync.addEventListener("click", async () => {
            console.log("[Chuya::Pedidos] Ejecutando sincronización manual de pedidos pendientes...");
            btnSync.disabled = true;
            try {
                if (typeof APIService.sincronizarPedidosPendientes === "function") {
                    await APIService.sincronizarPedidosPendientes();
                }
                console.log("[Chuya::Pedidos] Sincronización manual finalizada.");
            } catch (e) {
                console.error("[Chuya::Pedidos] Error en sincronización manual:", e.message);
            } finally {
                this.renderHistorial();
                btnSync.disabled = false;
            }
        });
    }
};

window.PedidosView = PedidosView;