/**
 * Chuya - Módulo de Renderizado, Filtrado e Inventario Variable del Catálogo
 * Ubicación: chuya-pwa/clientes/js/modules/catalogo.js
 * Stack: JS Vanilla ES6+ (Local-First PWA)
 */

import { APIService } from "./api-service.js";
import { CartService } from "./cart.js";

export const CatalogoView = {
    _productosCache: [],

    /**
     * Inicializa la vista del catálogo cargando productos desde red/caché
     */
    async init() {
        console.log("[Chuya::Catalogo] Cargando productos con inventario variable...");
        const gridContainer = document.getElementById("productos-grid");
        const loadingEl = document.getElementById("catalogo-loading");

        if (!gridContainer) {
            console.error("[Chuya::Catalogo] Contenedor '#productos-grid' no encontrado en el DOM.");
            return;
        }

        this.bindRefreshButton(gridContainer, loadingEl);

        try {
            const productos = await APIService.cargarProductos();
            this._productosCache = Array.isArray(productos) ? productos : [];
            console.log(`[Chuya::Catalogo] ${this._productosCache.length} ítems de inventario recuperados.`);

            if (loadingEl) loadingEl.classList.add("hidden");
            gridContainer.classList.remove("hidden");

            this.renderProductos(this._productosCache);
            this.bindFilters();
        } catch (error) {
            console.error("[Chuya::Catalogo] Error renderizando catálogo:", error.message);
            if (loadingEl) {
                loadingEl.innerHTML = `<p class="error-text">❌ Error actualizando catálogo desde la red.</p>`;
            }
        }
    },

    /**
     * Vincula el botón de actualización manual de inventario (#btn-refresh-catalogo)
     */
    bindRefreshButton(gridContainer, loadingEl) {
        const btnRefresh = document.getElementById("btn-refresh-catalogo");
        if (!btnRefresh || btnRefresh.dataset.bound === "true") return;

        btnRefresh.dataset.bound = "true";
        btnRefresh.addEventListener("click", async () => {
            console.log("[Chuya::Catalogo] Recargando catálogo manualmente desde la red...");
            btnRefresh.disabled = true;
            btnRefresh.classList.add("loading");

            if (loadingEl) {
                loadingEl.innerHTML = `<p class="loading-text">🔄 Actualizando inventario desde la red...</p>`;
                loadingEl.classList.remove("hidden");
            }
            gridContainer.classList.add("hidden");

            try {
                const productos = await APIService.cargarProductos();
                this._productosCache = Array.isArray(productos) ? productos : [];

                // Respetar el filtro activo si existe
                const activeChip = document.querySelector(".filter-chip.active");
                const activeCat = activeChip ? activeChip.getAttribute("data-category") : "todos";
                const listaRender = activeCat === "todos"
                    ? this._productosCache
                    : this._productosCache.filter((p) => p.categoria === activeCat);

                this.renderProductos(listaRender);
            } catch (err) {
                console.error("[Chuya::Catalogo] Error en recarga manual:", err.message);
            } finally {
                if (loadingEl) loadingEl.classList.add("hidden");
                gridContainer.classList.remove("hidden");
                btnRefresh.disabled = false;
                btnRefresh.classList.remove("loading");
            }
        });
    },

    /**
     * Renderiza las tarjetas de productos con indicadores dinámicos de stock
     * @param {Array} productos
     */
    renderProductos(productos) {
        const gridContainer = document.getElementById("productos-grid");
        if (!gridContainer) return;

        if (!Array.isArray(productos) || productos.length === 0) {
            gridContainer.innerHTML = `
                <div class="empty-state text-center py-4">
                    <p>🍃 No hay inventario disponible en esta categoría.</p>
                </div>`;
            return;
        }

        gridContainer.innerHTML = productos.map((prod) => {
            const idSafe = this._escapeHTML(prod.id);
            const nombreSafe = this._escapeHTML(prod.nombre);
            const descSafe = this._escapeHTML(prod.descripcion || "");
            const catSafe = this._escapeHTML(prod.categoria || "general");
            const iconoSafe = this._escapeHTML(prod.icono || "📦");

            const stock = Math.max(0, Number(prod.stock) || 0);
            const precio = Number(prod.precio) || 0;
            const esAgotado = stock <= 0;
            const stockBadgeClass = esAgotado ? "stock-out" : stock <= 3 ? "stock-low" : "stock-ok";
            const stockTexto = esAgotado ? "Agotado" : `Disp: ${stock}`;

            return `
                <article class="product-card ${esAgotado ? "disabled" : ""}" data-id="${idSafe}" data-category="${catSafe}">
                    <div class="product-badge-container">
                        <span class="product-badge">${iconoSafe}</span>
                        <span class="stock-tag ${stockBadgeClass}">${stockTexto}</span>
                    </div>
                    <div class="product-details">
                        <h3 class="product-title">${nombreSafe}</h3>
                        ${descSafe ? `<p class="product-description">${descSafe}</p>` : ""}
                        <p class="product-price">$${precio.toLocaleString("es-CO")} COP</p>
                    </div>
                    <div class="product-actions">
                        ${!esAgotado ? `
                            <div class="quantity-selector">
                                <label for="qty-${idSafe}" class="visually-hidden">Cantidad</label>
                                <input type="number" id="qty-${idSafe}" value="1" min="1" max="${stock}" class="input-qty" />
                            </div>
                            <button type="button" class="btn-add-order" data-id="${idSafe}">🛒 Agregar</button>
                        ` : `<button type="button" class="btn-add-order disabled" disabled>🚫 Agotado</button>`}
                    </div>
                </article>
            `;
        }).join("");

        this.bindAddButtons(productos);
        console.log(`[Chuya::Catalogo] ${productos.length} tarjetas renderizadas en DOM con listeners activos.`);
    },

    /**
     * Vincula eventos de validación de cantidad y agregado al carrito
     * @param {Array} productos
     */
    bindAddButtons(productos) {
        // Clamping en tiempo real para evitar que el usuario digite cantidades superiores al stock
        document.querySelectorAll(".input-qty").forEach((input) => {
            input.addEventListener("change", (e) => {
                const max = Math.max(1, Number(e.target.getAttribute("max")) || 1);
                const val = parseInt(e.target.value, 10);
                if (Number.isNaN(val) || val < 1) {
                    e.target.value = "1";
                } else if (val > max) {
                    e.target.value = String(max);
                }
            });
        });

        const addButtons = document.querySelectorAll(".btn-add-order:not(.disabled)");
        addButtons.forEach((btnElement) => {
            btnElement.addEventListener("click", (e) => {
                const btn = e.currentTarget;
                const prodId = btn.getAttribute("data-id");
                const producto = productos.find((p) => String(p.id) === String(prodId));
                const inputQty = document.getElementById(`qty-${prodId}`);
                const cantidad = inputQty ? Math.max(1, parseInt(inputQty.value, 10) || 1) : 1;

                if (!producto) return;

                const result = CartService.addItem(producto, cantidad);
                if (inputQty) inputQty.value = "1";

                const btnOriginalText = btn.innerHTML;
                if (!result.success) {
                    btn.innerHTML = "🚫 Sin Stock";
                    btn.classList.add("warning");
                } else if (result.maxAlcanzado) {
                    btn.innerHTML = "⚠️ Máx. Stock";
                    btn.classList.add("warning");
                } else {
                    btn.innerHTML = "✅ ¡Agregado!";
                    btn.classList.add("added");
                }

                setTimeout(() => {
                    if (btn && document.body.contains(btn)) {
                        btn.innerHTML = btnOriginalText;
                        btn.classList.remove("added", "warning");
                    }
                }, 1500);
            });
        });
    },

    /**
     * Vincula los chips de filtrado por categoría con protección anti-duplicados
     */
    bindFilters() {
        const chips = document.querySelectorAll(".filter-chip");
        chips.forEach((chip) => {
            if (chip.dataset.filterBound === "true") return;
            chip.dataset.filterBound = "true";

            chip.addEventListener("click", (e) => {
                const targetChip = e.currentTarget;
                const cat = targetChip.getAttribute("data-category");
                console.log(`[Chuya::Catalogo] Filtrando por categoría: '${cat}'`);

                chips.forEach((c) => c.classList.remove("active"));
                targetChip.classList.add("active");

                const filtrados = cat === "todos"
                    ? this._productosCache
                    : this._productosCache.filter((p) => p.categoria === cat);

                this.renderProductos(filtrados);
            });
        });
    },

    /**
     * Escapa caracteres HTML para prevenir inyección XSS desde datos externos
     * @private
     */
    _escapeHTML(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
};

if (typeof window !== "undefined") {
    window.CatalogoView = CatalogoView;
}