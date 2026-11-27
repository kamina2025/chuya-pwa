/**
 * Chuya Admin - Módulo de Interfaz de Usuario y Renderizado (UI)
 * Stack: JS Vanilla ES6+
 * Descripción: Controla navegación por pestañas, menú lateral (Sidebar),
 * descifrado local PII en memoria RAM, renderizado de tablas dinámicas,
 * notificaciones toast y generación de tarjetas QR PGP.
 */

import { CryptoUtils } from "../../../js/modules/crypto-utils.js";
import { ADMIN_CONFIG } from "../admin-config.js";

export const AdminUI = {
    /**
     * Inicializa los controladores de interfaz, navegación por pestañas, sidebar y delegación de eventos
     */
    init() {
        console.log("[Chuya::AdminUI] Inicializando controladores de interfaz...");
        this.crearContenedorToast();
        this._setupTabNavigation();
        this._setupSidebarEvents();
        this._setupPedidosTableEvents();
        console.log("[Chuya::AdminUI] Interfaz inicializada correctamente.");
    },

    /**
     * Configura la alternancia entre pestañas/vistas principales sin destruir listeners externos
     */
    _setupTabNavigation() {
        const navButtons = document.querySelectorAll("[data-target]");
        navButtons.forEach((btn) => {
            if (btn.dataset.tabBound === "true") return;

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const targetId = btn.getAttribute("data-target");
                this.cambiarPestaña(targetId);
            });

            btn.dataset.tabBound = "true";
        });
        console.log(`[Chuya::AdminUI] Navegación por pestañas vinculada (${navButtons.length} disparadores).`);
    },

    /**
     * Conmuta la visibilidad de las pestañas (.tab-content)
     * @param {string} targetId - ID del elemento section a mostrar
     */
    cambiarPestaña(targetId) {
        if (!targetId) return;

        const tabs = document.querySelectorAll(".tab-content");
        tabs.forEach((tab) => tab.classList.remove("active"));

        const selectedTab = document.getElementById(targetId);
        if (selectedTab) {
            selectedTab.classList.add("active");
        }

        const navElements = document.querySelectorAll("[data-target]");
        navElements.forEach((el) => {
            if (el.getAttribute("data-target") === targetId) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        });

        console.log(`[Chuya::AdminUI] Vista activa conmutada a: #${targetId}`);
        this.cerrarSidebar();
    },

    /**
     * Asigna eventos de apertura y cierre para el menú lateral
     */
    _setupSidebarEvents() {
        const btnToggle = document.getElementById("btn-toggle-sidebar");
        const btnClose = document.getElementById("btn-close-sidebar");
        const overlay = document.getElementById("sidebar-overlay");

        if (btnToggle) btnToggle.onclick = () => this.abrirSidebar();
        if (btnClose) btnClose.onclick = () => this.cerrarSidebar();
        if (overlay) overlay.onclick = () => this.cerrarSidebar();
    },

    abrirSidebar() {
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        if (sidebar) sidebar.classList.add("active");
        if (overlay) overlay.classList.add("active");
    },

    cerrarSidebar() {
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        if (sidebar) sidebar.classList.remove("active");
        if (overlay) overlay.classList.remove("active");
    },

    /**
     * Configura la delegación de eventos para los botones de acción en la tabla de pedidos
     */
    _setupPedidosTableEvents() {
        const tbody = document.getElementById("tabla-pedidos-body");
        if (!tbody || tbody.dataset.hasListener === "true") return;

        tbody.addEventListener("click", (e) => {
            const btnDespachar = e.target.closest('[data-action="despachar"]');
            if (btnDespachar) {
                const idPedido = btnDespachar.getAttribute("data-id");
                console.log(`[Chuya::AdminUI] Solicitud de despacho para pedido: ${idPedido}`);

                btnDespachar.disabled = true;
                btnDespachar.textContent = "✅ Despachando...";

                const row = btnDespachar.closest("tr");
                const badge = row?.querySelector(".badge");
                if (badge) {
                    badge.className = "badge badge-success";
                    badge.textContent = "En Ruta / Despachado";
                }

                this.mostrarToast(`🚚 Pedido ${idPedido} marcado para despacho en Chuya.`, "success");

                document.dispatchEvent(
                    new CustomEvent("chuya:despachar-pedido", {
                        detail: { idPedido }
                    })
                );
            }
        });

        tbody.dataset.hasListener = "true";
    },

    /**
     * Actualiza la etiqueta del operador con su dirección/rol
     * @param {string} rol
     * @param {string} address
     */
    renderOperadorBadge(rol, address) {
        const roleEl = document.getElementById("operator-role");
        if (roleEl) {
            const rawAddr = address || "";
            const shortAddr = rawAddr.length > 10 ? `${rawAddr.substring(0, 10)}...` : rawAddr;
            roleEl.innerHTML = `<strong>${this._escapeHTML(rol)}</strong> <small>(${this._escapeHTML(shortAddr)})</small>`;
            console.log(`[Chuya::AdminUI] Badge de operador actualizado: ${rol}`);
        }
    },

    /**
     * Inyecta un registro en el historial de transacciones en pantalla
     * @param {Object} txData - { tipo, targetAddress, cantidad, offline, timestamp }
     */
    agregarAlHistorial(txData = {}) {
        const historyList = document.getElementById("history-list");
        if (!historyList) return;

        const emptyMsg = historyList.querySelector(".empty-msg");
        if (emptyMsg) emptyMsg.remove();

        const li = document.createElement("li");
        li.className = `history-item ${txData.offline ? "item-offline" : "item-online"}`;

        const hora = txData.timestamp
            ? new Date(txData.timestamp).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
            : "Ahora";
        const badgeEstado = txData.offline ? "📱 Local" : "☁️ Sincronizado";

        const tipoStr = (txData.tipo || "").toUpperCase();
        const targetRaw = txData.targetAddress || "";
        const targetShort = targetRaw.length > 12 ? `${targetRaw.substring(0, 12)}...` : targetRaw;

        li.innerHTML = `
            <div class="history-info">
                <span class="history-type"><strong>${this._escapeHTML(tipoStr)}</strong></span>
                <span class="history-target">${this._escapeHTML(targetShort)}</span>
                <small class="history-time">${hora} • ${badgeEstado}</small>
            </div>
            <div class="history-amount">
                +${this._escapeHTML(String(txData.cantidad || 0))}
            </div>
        `;

        historyList.prepend(li);
        console.log("[Chuya::AdminUI] Transacción renderizada en el historial:", {
            tipo: tipoStr,
            cantidad: txData.cantidad,
            offline: Boolean(txData.offline)
        });
    },

    /**
     * Renderiza la tabla de pedidos pendientes descifrando en memoria RAM los datos PII (Teléfono y Dirección)
     * Coincide exactamente con la estructura de 6 columnas del HTML
     * @param {Array} pedidos - Lista de objetos de pedido recibidos del backend
     * @param {Array} usuarios - Lista de usuarios registrados para resolver pgpFingerprint
     */
    async renderPedidosTable(pedidos = [], usuarios = []) {
        const tbody = document.getElementById("tabla-pedidos-body");
        if (!tbody) return;

        if (!Array.isArray(pedidos) || pedidos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">No hay pedidos pendientes por entregar.</td></tr>`;
            return;
        }

        console.log(`[Chuya::AdminUI] Procesando y descifrando ${pedidos.length} pedido(s) en RAM...`);

        const mapUsuarios = new Map(
            usuarios.map((u) => [String(u.nanoAddress || "").trim().toLowerCase(), u])
        );

        const pedidosProcesados = await Promise.all(
            pedidos.map(async (p) => {
                const cleanNano = String(p.nanoAddress || "").trim().toLowerCase();
                const cliente = mapUsuarios.get(cleanNano);

                // Semillas de descifrado ordenadas por prioridad (Cliente -> Admin -> Fallbacks)
                const semillas = [];

                if (
                    cliente?.pgpFingerprint &&
                    String(cliente.pgpFingerprint).trim() !== "" &&
                    cliente.pgpFingerprint !== "SIN_FINGERPRINT"
                ) {
                    semillas.push(String(cliente.pgpFingerprint).trim());
                }
                if (
                    cliente?.pgpPublicKey &&
                    String(cliente.pgpPublicKey).trim() !== "" &&
                    cliente.pgpPublicKey !== "KEY_PGP_NO_ASIGNADA"
                ) {
                    semillas.push(String(cliente.pgpPublicKey).trim());
                }

                semillas.push("FINGERPRINT_ADMIN");
                semillas.push("KEY_PGP_PUBLIC_ADMIN");
                if (ADMIN_CONFIG?.OPERATOR_ADDRESS) {
                    semillas.push(ADMIN_CONFIG.OPERATOR_ADDRESS);
                }

                if (p.nanoAddress && String(p.nanoAddress).trim() !== "") {
                    semillas.push(String(p.nanoAddress).trim());
                }

                const telCifrado = p.telefonoCifrado || p.telefono || "";
                const dirCifrada = p.direccionCifrada || p.direccion || "";

                let telefonoPlano = telCifrado;
                let direccionPlana = dirCifrada;
                let telResuelto = !telCifrado;
                let dirResuelta = !dirCifrada;

                for (const seed of semillas) {
                    if (telResuelto && dirResuelta) break;

                    const [resTel, resDir] = await Promise.all([
                        !telResuelto ? CryptoUtils.descifrar(telCifrado, seed) : Promise.resolve(telefonoPlano),
                        !dirResuelta ? CryptoUtils.descifrar(dirCifrada, seed) : Promise.resolve(direccionPlana)
                    ]);

                    if (!telResuelto && resTel !== telCifrado) {
                        telefonoPlano = resTel;
                        telResuelto = true;
                    }
                    if (!dirResuelta && resDir !== dirCifrada) {
                        direccionPlana = resDir;
                        dirResuelta = true;
                    }
                }

                return {
                    ...p,
                    nombreCliente: cliente?.nombre || "",
                    telefonoPlano: telefonoPlano || "Sin teléfono",
                    direccionPlana: direccionPlana || "Sin dirección"
                };
            })
        );

        tbody.innerHTML = pedidosProcesados
            .map((p) => {
                let itemsFormateados = "Sin especificar";
                try {
                    const itemsRaw = typeof p.items === "string" ? p.items.trim() : p.items;
                    if (typeof itemsRaw === "string" && itemsRaw.startsWith("[")) {
                        const parsed = JSON.parse(itemsRaw);
                        itemsFormateados = parsed.map((i) => `${i.nombre || i.id} (x${i.cantidad || 1})`).join(", ");
                    } else if (typeof itemsRaw === "string") {
                        itemsFormateados = itemsRaw;
                    } else if (Array.isArray(itemsRaw)) {
                        itemsFormateados = itemsRaw.map((i) => `${i.nombre || i.id} (x${i.cantidad || 1})`).join(", ");
                    }
                } catch (e) {
                    itemsFormateados = String(p.items || "");
                }

                const rawAddr = p.nanoAddress || "Anónimo";
                const shortAddr = rawAddr.length > 14 ? `${rawAddr.substring(0, 12)}...` : rawAddr;
                const clienteTag = p.nombreCliente ? `<strong>${this._escapeHTML(p.nombreCliente)}</strong> · ` : "";

                return `
                    <tr>
                        <td><strong>${this._escapeHTML(p.idPedido || "PED-N/A")}</strong></td>
                        <td>
                            ${clienteTag}<span title="${this._escapeHTML(rawAddr)}">${this._escapeHTML(shortAddr)}</span><br>
                            <small>📞 ${this._escapeHTML(p.telefonoPlano)}</small><br>
                            <small>📍 ${this._escapeHTML(p.direccionPlana)}</small>
                        </td>
                        <td><small>${this._escapeHTML(itemsFormateados)}</small></td>
                        <td>$${Number(p.totalCOP || 0).toLocaleString("es-CO")}</td>
                        <td><span class="badge badge-warning">${this._escapeHTML(p.estado || "Pendiente")}</span></td>
                        <td>
                            <button class="btn-submit btn-sm" data-action="despachar" data-id="${this._escapeHTML(p.idPedido || "")}">
                                🚚 Despachar
                            </button>
                        </td>
                    </tr>
                `;
            })
            .join("");

        console.log("[Chuya::AdminUI] Tabla de pedidos renderizada.");
    },

    /**
     * Renderiza la tabla de inventario
     * @param {Array} productos - Lista de productos registrados
     */
    renderInventarioTable(productos = []) {
        const tbody = document.getElementById("tabla-inventario-body");
        if (!tbody) return;

        if (!Array.isArray(productos) || productos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-msg">No hay productos en inventario.</td></tr>`;
            return;
        }

        tbody.innerHTML = productos
            .map(
                (prod) => `
                <tr>
                    <td><code>${this._escapeHTML(prod.id || "")}</code></td>
                    <td>${this._escapeHTML(prod.icono || "")} ${this._escapeHTML(prod.nombre || "")}</td>
                    <td>${this._escapeHTML(prod.categoria || "")}</td>
                    <td>$${Number(prod.precio || 0).toLocaleString("es-CO")}</td>
                    <td><strong>${this._escapeHTML(String(prod.stock || 0))}</strong></td>
                </tr>
            `
            )
            .join("");

        console.log(`[Chuya::AdminUI] Tabla de inventario renderizada (${productos.length} productos).`);
    },

    /**
     * Despliega una notificación flotante Toast
     * @param {string} mensaje
     * @param {string} tipo - 'success' | 'error' | 'warning'
     */
    mostrarToast(mensaje, tipo = "success") {
        let container = document.getElementById("toast-container");
        if (!container) container = this.crearContenedorToast();

        const toast = document.createElement("div");
        toast.className = `toast toast-${tipo}`;
        toast.innerText = mensaje;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("show");
        }, 10);

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    /**
     * Helper interno para crear el contenedor global de notificaciones
     */
    crearContenedorToast() {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            container.className = "toast-container";
            document.body.appendChild(container);
        }
        return container;
    },

    /**
     * Escapa caracteres HTML para evitar vulnerabilidades XSS
     */
    _escapeHTML(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    /**
     * Renderiza la tarjeta pública del miembro con su dirección Nano y Fingerprint PGP
     * @param {Object} datos - { idUsuario, nombre, nanoAddress, pgpFingerprint, pgpPublicKey }
     */
    mostrarTarjetaQR(datos = {}) {
        const qrContainer = document.getElementById("qrcode-box") || document.getElementById("qrcode-container");
        const lblNano = document.getElementById("qr-nano-address") || document.getElementById("qr-res-nano");
        const lblPgp = document.getElementById("qr-pgp-fingerprint") || document.getElementById("qr-res-pgp");
        const lblNombre = document.getElementById("qr-res-nombre");
        const contenedorTarjeta = document.getElementById("resultado-registro-qr") || document.getElementById("tarjeta-qr-registro");

        if (!qrContainer) {
            console.warn("[Chuya::AdminUI] No se encontró el contenedor del código QR en el DOM.");
            return;
        }

        let fingerprint = "SIN_FINGERPRINT";
        if (datos.pgpFingerprint && datos.pgpFingerprint.trim() !== "") {
            fingerprint = datos.pgpFingerprint.trim();
        } else if (datos.pgpPublicKey && datos.pgpPublicKey.trim() !== "") {
            const cleanKey = datos.pgpPublicKey.trim();
            fingerprint = cleanKey.length > 25 ? `${cleanKey.substring(0, 20)}...` : cleanKey;
        }

        if (lblNombre) lblNombre.innerText = datos.nombre || "Miembro Chuya";
        if (lblNano) lblNano.innerText = datos.nanoAddress || "-";
        if (lblPgp) lblPgp.innerText = `PGP Fingerprint: ${fingerprint}`;

        qrContainer.innerHTML = "";

        const qrPayload = JSON.stringify({
            brand: "chuya",
            id: datos.idUsuario || "",
            name: datos.nombre || "",
            nano: datos.nanoAddress || "",
            pgp: fingerprint
        });

        const QRConstructor = window.QRCode || (typeof QRCode !== "undefined" ? QRCode : null);

        if (QRConstructor) {
            try {
                new QRConstructor(qrContainer, {
                    text: qrPayload,
                    width: 180,
                    height: 180,
                    colorDark: "#0f766e",
                    colorLight: "#ffffff",
                    correctLevel: QRConstructor.CorrectLevel ? QRConstructor.CorrectLevel.M : 2
                });
                console.log("[Chuya::AdminUI] Tarjeta QR de miembro generada para:", datos.nombre || datos.nanoAddress);
            } catch (err) {
                console.error("[Chuya::AdminUI] Error generando código QR con la librería:", err);
                qrContainer.innerHTML = `<p style="color:red; font-size:0.8rem;">❌ Error al renderizar gráfico QR.</p>`;
            }
        } else {
            console.error("[Chuya::AdminUI] La librería QRCode no se encuentra cargada globalmente.");
            qrContainer.innerHTML = `<p style="color:orange; font-size:0.8rem;">⚠️ QRCode.js no disponible</p>`;
        }

        if (contenedorTarjeta) {
            contenedorTarjeta.style.display = "block";
            contenedorTarjeta.classList.remove("hidden");
        }
    }
};