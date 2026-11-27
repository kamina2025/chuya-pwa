import { APIService } from "./api-service.js";
import { CartService } from "./cart.js";

export const CatalogoView = {
    async init() {
        console.log("[AveLibre::Catalogo] Cargando productos con inventario variable...");
        const gridContainer = document.getElementById("productos-grid");
        const loadingEl = document.getElementById("catalogo-loading");

        if (!gridContainer) return;

        try {
            const productos = await APIService.cargarProductos();
            if (loadingEl) loadingEl.classList.add("hidden");
            gridContainer.classList.remove("hidden");

            this.renderProductos(productos);
            this.bindFilters(productos);
        } catch (error) {
            console.error("[AveLibre::Catalogo] Error renderizando catálogo:", error.message);
        }
    },

    renderProductos(productos) {
        const gridContainer = document.getElementById("productos-grid");
        if (!gridContainer) return;

        if (!productos || productos.length === 0) {
            gridContainer.innerHTML = `<div class="empty-state py-4"><p>🍃 No hay inventario disponible.</p></div>`;
            return;
        }

        gridContainer.innerHTML = productos.map(prod => {
            const stock = Number(prod.stock) || 0;
            const esAgotado = stock <= 0;
            const stockBadgeClass = esAgotado ? "stock-out" : stock <= 3 ? "stock-low" : "stock-ok";

            return `
                <article class="product-card ${esAgotado ? 'disabled' : ''}" data-id="${prod.id}">
                    <div class="product-badge-container">
                        <span class="product-badge">${prod.icono || "📦"}</span>
                        <span class="stock-tag ${stockBadgeClass}">${esAgotado ? "Agotado" : `Disp: ${stock}`}</span>
                    </div>
                    <div class="product-details">
                        <h3 class="product-title">${prod.nombre}</h3>
                        <p class="product-price">$${Number(prod.precio).toLocaleString("es-CO")} COP</p>
                    </div>
                    <div class="product-actions">
                        ${!esAgotado ? `
                            <div class="quantity-selector">
                                <input type="number" id="qty-${prod.id}" value="1" min="1" max="${stock}" class="input-qty" />
                            </div>
                            <button type="button" class="btn-add-order" data-id="${prod.id}">🛒 Agregar</button>
                        ` : `<button type="button" class="btn-add-order disabled" disabled>🚫 Agotado</button>`}
                    </div>
                </article>
            `;
        }).join("");

        this.bindAddButtons(productos);
    },

    bindAddButtons(productos) {
        const addButtons = document.querySelectorAll(".btn-add-order:not(.disabled)");
        addButtons.forEach(btnElement => {
            btnElement.addEventListener("click", (e) => {
                const btn = e.currentTarget;
                const prodId = btn.getAttribute("data-id");
                const producto = productos.find(p => p.id === prodId);
                const inputQty = document.getElementById(`qty-${prodId}`);
                const cantidad = inputQty ? parseInt(inputQty.value, 10) || 1 : 1;

                if (producto) {
                    const result = CartService.addItem(producto, cantidad);

                    const btnOriginalText = btn.innerHTML;
                    if (result.maxAlcanzado) {
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
                }
            });
        });
    },

    bindFilters(todos) {
        const chips = document.querySelectorAll(".filter-chip");
        chips.forEach(chip => {
            chip.addEventListener("click", (e) => {
                const cat = e.target.getAttribute("data-category");
                chips.forEach(c => c.classList.remove("active"));
                e.target.classList.add("active");
                this.renderProductos(cat === "todos" ? todos : todos.filter(p => p.categoria === cat));
            });
        });
    }
};