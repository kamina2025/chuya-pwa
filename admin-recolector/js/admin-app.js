/**
 * Chuya Admin - Script Principal de Orquestación
 * Sincroniza UI, pestañas, derivación/asignación PGP/Nano, QR, tickets térmicos y descifrado PII en memoria RAM
 * Stack: JS Vanilla ES6+
 */

import { ADMIN_CONFIG } from "./admin-config.js";
import { AdminAPIService } from "./modules/admin-api.js";
import { ComponentLoader } from "./modules/component-loader.js";
import { AdminUI } from "./modules/admin-ui.js";
import { TicketGeneratorModule } from "./modules/ticket-generator.js";

// Exposición global condicional para depuración en consola DevTools
if (typeof window !== "undefined") {
    window.ADMIN_CONFIG = ADMIN_CONFIG;
    window.AdminAPIService = AdminAPIService;
    window.AdminUI = AdminUI;
    window.TicketGeneratorModule = TicketGeneratorModule;
}

/**
 * Resuelve la dirección Nano del operador activo (LocalStorage o ADMIN_CONFIG por defecto)
 * Incluye respaldo de lectura de clave legacy durante la migración de marca a Chuya
 * @returns {string}
 */
function obtenerOperatorAddressActiva() {
    const walletKey = ADMIN_CONFIG.STORAGE_KEYS?.ADMIN_WALLET || "chuya_admin_address";
    const storedWallet =
        localStorage.getItem(walletKey)?.trim().toLowerCase() ||
        localStorage.getItem("avelibre_admin_address")?.trim().toLowerCase();

    return storedWallet || ADMIN_CONFIG.OPERATOR_ADDRESS;
}

// Captura y silencia errores asíncronos generados por extensiones del navegador
window.addEventListener("unhandledrejection", (event) => {
    if (event.reason && typeof event.reason.message === "string") {
        if (
            event.reason.message.includes("message channel closed") ||
            event.reason.message.includes("listener indicated an asynchronous response")
        ) {
            event.preventDefault();
            console.warn("[Chuya::AdminApp] Excepción de extensión de navegador mitigada.");
        }
    }
});

// Listener global para auto-sincronizar transacciones offline al recuperar conectividad
window.addEventListener("online", async () => {
    console.log("[Chuya::AdminApp] Conexión a internet restablecida. Sincronizando cola offline...");
    try {
        if (typeof AdminAPIService?.sincronizarColaOffline === "function") {
            const res = await AdminAPIService.sincronizarColaOffline();
            if (res && res.procesadas > 0) {
                AdminUI.mostrarToast(`☁️ ${res.procesadas} transacción(es) offline sincronizada(s) con éxito.`, "success");
                await cargarDatosTablas();
            }
        }
    } catch (err) {
        console.error("[Chuya::AdminApp] Error durante la auto-sincronización offline:", err);
    }
});

window.addEventListener("offline", () => {
    console.warn("[Chuya::AdminApp] Dispositivo sin conexión. Operando en modo Local-First Offline.");
    if (typeof AdminUI?.mostrarToast === "function") {
        AdminUI.mostrarToast("📴 Modo Offline activo: las operaciones se guardarán en cola local.", "warning");
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    console.log("[Chuya::AdminApp] Inicializando PWA de Administración y Recolección Chuya...");

    // Garantizar título actualizado de marca para impresiones y exportaciones PDF del navegador
    if (typeof document !== "undefined") {
        document.title = "Chuya | Panel Recolector & Admin";
    }

    try {
        // 1. Cargar e inyectar vistas parciales HTML de forma resiliente
        try {
            await ComponentLoader.cargarComponentes();
            console.log("[Chuya::AdminApp] Componentes HTML parciales cargados.");
        } catch (compErr) {
            console.error("[Chuya::AdminApp] Advertencia cargando componentes parciales:", compErr);
        }

        // 2. Inicializar interfaz visual, navegación por pestañas y menú lateral
        if (typeof AdminUI?.init === "function") {
            AdminUI.init();
            console.log("[Chuya::AdminApp] Interfaz AdminUI inicializada.");
        }

        // 3. Inicializar el módulo generador de tickets promocionales
        if (typeof TicketGeneratorModule?.init === "function") {
            TicketGeneratorModule.init();
            console.log("[Chuya::AdminApp] Módulo TicketGeneratorModule inicializado.");
        }

        // 4. Renderizar badge con dirección y rol del operador activo
        const activeOperator = obtenerOperatorAddressActiva();
        if (typeof AdminUI?.renderOperadorBadge === "function") {
            AdminUI.renderOperadorBadge("OPERADOR: ADMIN", activeOperator);
        }

        // 5. Registrar listeners de eventos, formularios y pestañas
        setupFormularioRegistro();
        setupFormularioRecoleccion();
        setupEventosImpresion();
        setupNavegacionTablas();

        // 6. Si hay conexión al iniciar, vaciar cualquier transacción pendiente en cola offline
        if (navigator.onLine && typeof AdminAPIService?.sincronizarColaOffline === "function") {
            const syncInicial = await AdminAPIService.sincronizarColaOffline();
            if (syncInicial?.procesadas > 0) {
                console.log(`[Chuya::AdminApp] Cola offline inicial sincronizada: ${syncInicial.procesadas} registro(s).`);
                AdminUI.mostrarToast(`☁️ ${syncInicial.procesadas} registro(s) pendiente(s) sincronizado(s).`, "success");
            }
        }

        // 7. Carga inicial de datos (Usuarios, Pedidos e Inventario)
        await cargarDatosTablas();
        console.log("[Chuya::AdminApp] Orquestación inicial de Chuya Admin completada.");
    } catch (err) {
        console.error("[Chuya::AdminApp] Error crítico durante la inicialización de la PWA:", err);
    }
});

/**
 * Escucha cambios de pestañas para actualizar tablas y vistas previas dinámicamente
 */
function setupNavegacionTablas() {
    document.querySelectorAll("[data-target]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-target");
            console.log(`[Chuya::AdminApp] Navegación a sección: ${target}`);

            try {
                if (target === "sec-pedidos" || target === "sec-inventario" || target === "sec-registrar-miembro") {
                    cargarDatosTablas();
                } else if (target === "sec-ticket-generador") {
                    if (typeof TicketGeneratorModule?.actualizarVistaPrevia === "function") {
                        TicketGeneratorModule.actualizarVistaPrevia();
                    }
                }
            } catch (navErr) {
                console.error(`[Chuya::AdminApp] Error al actualizar vista '${target}':`, navErr);
            }
        });
    });
}

/**
 * Configura la lógica del formulario para registrar nuevos miembros
 */
function setupFormularioRegistro() {
    const formMiembro = document.getElementById("form-registrar-miembro");
    if (!formMiembro) {
        console.warn("[Chuya::AdminApp] Formulario #form-registrar-miembro no encontrado en DOM.");
        return;
    }

    formMiembro.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = document.getElementById("nuevo-nombre")?.value.trim() || "";
        const telefono = document.getElementById("nuevo-telefono")?.value.trim() || "";
        const direccion = document.getElementById("nuevo-direccion")?.value.trim() || "";
        const rol = document.getElementById("nuevo-rol")?.value || "CLIENTE";
        const pgpPublicKey = document.getElementById("nuevo-pgp")?.value.trim() || "";
        const inputAddress = document.getElementById("nuevo-nano-address")?.value.trim() || "";

        if (!nombre) {
            AdminUI.mostrarToast("⚠️ Ingresa el nombre completo del miembro antes de registrar.", "warning");
            return;
        }

        const btnSubmit = document.getElementById("btn-guardar-miembro");
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerText = "⏳ Asignando dirección y PGP del pool...";
        }

        console.log(`[Chuya::Register] Procesando alta de miembro en Chuya: ${nombre} (${rol})`);

        try {
            const res = await AdminAPIService.registrarNuevoMiembro({
                nombre,
                telefono,
                direccion,
                nanoAddress: inputAddress,
                rol,
                pgpPublicKey,
                operatorAddress: obtenerOperatorAddressActiva()
            });

            const esExito = res?.success || res?.status === "success";

            if (esExito) {
                const assignedAddress = res.data?.nanoAddress || res.nanoAddress || inputAddress;
                const assignedFingerprint = res.data?.pgpFingerprint || res.pgpFingerprint || "";
                const assignedPgpKey = res.data?.pgpPublicKey || res.pgpPublicKey || pgpPublicKey;
                const newUserId = res.data?.idUsuario || res.idUsuario || "";

                const previewAddr = assignedAddress ? `${assignedAddress.substring(0, 12)}...` : "En cola offline";
                AdminUI.mostrarToast(`✅ Miembro ${nombre} registrado en Chuya (${previewAddr})`, "success");

                if (!res.offline && typeof AdminUI?.mostrarTarjetaQR === "function") {
                    AdminUI.mostrarTarjetaQR({
                        idUsuario: newUserId,
                        nombre,
                        nanoAddress: assignedAddress,
                        pgpFingerprint: assignedFingerprint,
                        pgpPublicKey: assignedPgpKey
                    });
                }

                formMiembro.reset();
                await cargarDatosTablas();
            } else {
                AdminUI.mostrarToast(
                    "❌ Error al registrar miembro: " + (res?.error || res?.message || "Error desconocido"),
                    "error"
                );
            }
        } catch (err) {
            console.error("[Chuya::Register] Error en registro:", err);
            AdminUI.mostrarToast("❌ Error inesperado: " + err.message, "error");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = "➕ Registrar Miembro y Generar QR";
            }
        }
    });
}

/**
 * Configura la lógica del formulario para procesar recolecciones y recargas
 */
function setupFormularioRecoleccion() {
    const formRecoleccion = document.getElementById("form-recoleccion");
    if (!formRecoleccion) {
        console.warn("[Chuya::AdminApp] Formulario #form-recoleccion no encontrado en DOM.");
        return;
    }

    formRecoleccion.addEventListener("submit", async (e) => {
        e.preventDefault();

        const targetAddress = document.getElementById("target-address")?.value.trim() || "";
        const tipo = document.getElementById("tipo-transaccion")?.value || "cascaras";
        const cantidad = parseFloat(document.getElementById("cantidad")?.value);

        if (!targetAddress || Number.isNaN(cantidad) || cantidad <= 0) {
            AdminUI.mostrarToast("⚠️ Por favor ingrese una dirección Nano y una cantidad válidas.", "warning");
            return;
        }

        const btnSubmit = document.getElementById("btn-procesar");
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerText = "⏳ Firmando...";
        }

        console.log(`[Chuya::Recoleccion] Enviando ${tipo} (${cantidad}) para ${targetAddress}`);

        try {
            const res = await AdminAPIService.procesarTransaccion(tipo, targetAddress, cantidad);
            const esExito = res?.success || res?.status === "success";

            if (esExito) {
                const mensajeToast = res.offline
                    ? "📱 Registrado offline localmente en Chuya."
                    : "✅ Recompensa confirmada en Google Sheets.";

                AdminUI.mostrarToast(mensajeToast, "success");

                if (typeof AdminUI?.agregarAlHistorial === "function") {
                    AdminUI.agregarAlHistorial({
                        tipo,
                        targetAddress,
                        cantidad,
                        offline: Boolean(res.offline),
                        timestamp: new Date().toISOString()
                    });
                }

                formRecoleccion.reset();

                if (!res.offline) {
                    await cargarDatosTablas();
                }
            } else {
                AdminUI.mostrarToast("❌ Error: " + (res?.error || res?.message || "Error al procesar"), "error");
            }
        } catch (err) {
            console.error("[Chuya::Recoleccion] Error en envío de transacción:", err);
            AdminUI.mostrarToast("❌ Error al procesar transacción: " + err.message, "error");
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = "✍️ Firmar y Asignar Recompensa";
            }
        }
    });
}

/**
 * Configura el listener para imprimir credenciales QR de miembros
 */
function setupEventosImpresion() {
    const btnImprimir = document.getElementById("btn-imprimir-qr");
    if (btnImprimir) {
        btnImprimir.addEventListener("click", () => {
            console.log("[Chuya::AdminApp] Ejecutando impresión de credencial QR Chuya...");
            window.print();
        });
    }
}

/**
 * Consulta la API Backend en paralelo (Usuarios, Pedidos, Inventario) y descifra la PII en RAM
 */
let isFetchingData = false;

async function cargarDatosTablas() {
    if (isFetchingData) {
        console.warn("[Chuya::AdminApp] Consulta en progreso, omitiendo llamada duplicada.");
        return;
    }

    try {
        isFetchingData = true;
        console.log("[Chuya::AdminApp] Consultando datos actualizados del backend Chuya...");

        const [resUsuarios, resPedidos, resInventario] = await Promise.all([
            typeof AdminAPIService?.obtenerUsuarios === "function"
                ? AdminAPIService.obtenerUsuarios()
                : Promise.resolve({ success: false, data: [] }),
            typeof AdminAPIService?.obtenerPedidos === "function"
                ? AdminAPIService.obtenerPedidos()
                : Promise.resolve({ success: false, data: [] }),
            typeof AdminAPIService?.obtenerInventario === "function"
                ? AdminAPIService.obtenerInventario()
                : Promise.resolve({ success: false, data: [] })
        ]);

        const esExitoUsuarios = resUsuarios?.success || resUsuarios?.status === "success";
        const esExitoPedidos = resPedidos?.success || resPedidos?.status === "success";
        const esExitoInventario = resInventario?.success || resInventario?.status === "success";

        const usuarios = esExitoUsuarios ? resUsuarios.data || [] : [];
        const pedidos = esExitoPedidos ? resPedidos.data || [] : [];
        const inventario = esExitoInventario ? resInventario.data || [] : [];

        console.log("[Chuya::AdminApp] Datos recibidos:", {
            usuarios: usuarios.length,
            pedidos: pedidos.length,
            inventario: inventario.length
        });

        if (typeof AdminUI?.renderUsuariosTable === "function") {
            await AdminUI.renderUsuariosTable(usuarios);
        }

        if (typeof AdminUI?.renderPedidosTable === "function") {
            await AdminUI.renderPedidosTable(pedidos, usuarios);
        }

        if (typeof AdminUI?.renderInventarioTable === "function") {
            AdminUI.renderInventarioTable(inventario);
        }
    } catch (err) {
        console.error("[Chuya::AdminApp] Error al cargar y descifrar datos:", err);
    } finally {
        isFetchingData = false;
    }
}