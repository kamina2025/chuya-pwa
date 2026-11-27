🌱 Chuya PWA — Economía Circular, Agroecología y Micro-recompensas (XNO)

Chuya (vocablo de origen indígena colombiano que evoca frescura, limpieza y transparencia) es una Progressive Web App (PWA) Local-First diseñada bajo una estética Solarpunk para conectar productores avícolas campesinos y hogares en Miranda, Cauca (Colombia) mediante economía circular, trazabilidad criptográfica y pagos/recompensas sin comisiones con Nano (XNO).

📋 Tabla de Contenidos

Visión y Propósito

Arquitectura del Sistema

Stack Tecnológico

Estructura de Directorios

Módulos Principales

Configuración e Instalación Local

Convenciones de Desarrollo y Auditoría

Control de Versiones (Conventional Commits)

🌿 Visión y Propósito

El proyecto transforma residuos orgánicos domiciliarios en insumos productivos dentro de un circuito cerrado y transparente:

Recolección Circular: Los hogares entregan cáscaras de huevo secas (30 unidades por meta) y aserrín (3 bultos por meta) al recolector en campo.

Recompensas Instantáneas: Al cumplir cada meta, el usuario acumula 0.083 XNO o $100 COP en descuentos canjeables por productos campesinos frescos (huevos, pollo empaquetado, abono orgánico enriquecido).

Operación en Campo Sin Internet (Local-First): Tanto la app de clientes como el panel del recolector/administrador funcionan offline mediante Service Workers y colas persistentes en LocalStorage, sincronizando automáticamente al recuperar conectividad.

Privacidad y Criptografía: Los datos personales sensibles (teléfono y dirección de entrega) se cifran extremo a extremo mediante OpenPGP antes de salir del dispositivo, mientras que las identidades y saldos se vinculan a direcciones Nano (nano_...).

🏗️ Arquitectura del Sistema

┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND PWA (LOCAL-FIRST)                       │
│                                                                         │
│  ┌──────────────────────────────┐   ┌────────────────────────────────┐  │
│  │   PWA Cliente (chuya-pwa/)   │   │  Panel Admin & Recolector      │  │
│  │  • Catálogo & Carrito        │   │  (chuya-pwa/admin-recolector/) │  │
│  │  • Metas & Gamificación      │   │  • Alta Miembros (Pool Nano/PGP│  │
│  │  • Billetera Nano (RPC)      │   │  • Registro de Recolección     │  │
│  │  • Importador QR / PDF       │   │  • Generador Tickets POS/PDF   │  │
│  │  • Cifrado PII (OpenPGP)     │   │  • Descifrado PII en RAM       │  │
│  └──────────────┬───────────────┘   └───────────────┬────────────────┘  │
│                 │                                   │                   │
│                 └─────────────────┬─────────────────┘                   │
│                                   ▼                                     │
│             Service Workers (sw.js) + Cache API + LocalStorage          │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTPS (REST / JSON / text/plain)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   BACKEND SERVERLESS (GOOGLE APPS SCRIPT)               │
│                                                                         │
│  • Code.gs (V8 Engine): Control RBAC, LockService, CRUD Transaccional   │
│  • Base de Datos en Vivo: Google Sheets                                 │
│    ├── Productos           ├── Pedidos (PII Cifrado)                    │
│    ├── Usuarios            ├── pool_direcciones (Nano XNO)              │
│    └── Gamificacion_Metas  └── pool_pgp (Claves Públicas & Fingerprints)│
└─────────────────────────────────────────────────────────────────────────┘


🛠️ Stack Tecnológico

Frontend: HTML5 Semántico, CSS3 (Diseño Responsivo Mobile-First & Estilos Térmicos POS 80mm), JavaScript Vanilla (ES6+ Modules).

Capacidades PWA: Web App Manifest (manifest.json), Service Workers (sw.js con estrategias Stale-While-Revalidate y precaché resiliente), instalación diferida (beforeinstallprompt).

Criptografía y Utilidades (Locales en libs/):

openpgp.min.js: Cifrado y descifrado asimétrico de información personal (PII) en memoria RAM.

nanocurrency.min.js + RPC (https://rpc.nano.to): Validación y consulta de cuentas Nano (XNO).

qrcode.min.js: Generación de credenciales Solarpunk y tickets QR.

jspdf.umd.min.js: Generación dinámica de comprobantes PDF (Chuya_Comprobante_<CUS>.pdf) sin superposición de texto.

Backend & Persistencia en la Nube: Google Apps Script (Code.gs) conectado a Google Sheets como API REST desacoplada.

📁 Estructura de Directorios

chuya-pwa/
├── index.html                        # App Shell principal de la PWA Cliente
├── manifest.json                     # Manifiesto instalable de la PWA Cliente
├── sw.js                             # Service Worker offline de la PWA Cliente
├── README.md                         # Documentación técnica del proyecto
│
├── assets/
│   └── icons/                        # Íconos PWA (favicon.png, icon-192.png, icon-512.png)
│
├── css/
│   └── styles.css                    # Hoja de estilos principal (Estética Solarpunk)
│
├── libs/                             # Dependencias locales offline
│   ├── jspdf.umd.min.js
│   ├── nanocurrency.min.js
│   ├── openpgp.min.js
│   └── qrcode.min.js
│
├── js/
│   ├── config.js                     # Constantes inmutables (API_URL, RPC_URL, STORAGE_KEYS)
│   ├── app.js                        # Orquestador principal de la PWA Cliente
│   └── modules/
│       ├── api-service.js            # Cliente REST + Caché Local-First + Cola de pedidos offline
│       ├── component-loader.js       # Inyector asíncrono de vistas parciales HTML
│       ├── crypto-utils.js           # Utilidades OpenPGP para cifrado/descifrado PII
│       ├── gana-nano.js              # Lógica de metas de cáscaras/aserrín y recompensas
│       ├── nano-wallet.js            # Gestión y validación de dirección Nano del usuario
│       ├── pwa-manager.js            # Ciclo de vida SW, conectividad y prompt de instalación
│       ├── qr-pdf-importer.js        # Lector de credenciales desde PDF/QR
│       ├── router.js                 # Enrutador SPA basado en hash (#inicio, #catalogo, etc.)
│       └── ui-controls.js            # Control del Sidebar Drawer, barras y navegación
│
├── admin-recolector/                 # Sub-aplicación PWA Operativa para Admin y Recolectores
│   ├── index.html                    # App Shell del Panel Administrativo y Recolección
│   ├── manifest.json                 # Manifiesto instalable ("Chuya Admin")
│   ├── sw.js                         # Service Worker operativo Local-First en campo
│   ├── print-ticket.html             # Plantilla imprimible de credencial Solarpunk (80mm POS)
│   ├── css/
│   │   ├── admin-styles.css          # Estilos del panel operativo y tablas responsivas
│   │   └── ticket-styles.css         # Estilos de vista previa térmica 80mm y @media print
│   ├── components/                   # Parciales HTML modulares
│   │   ├── header.html
│   │   ├── sidebar.html
│   │   ├── bottom-nav.html
│   │   ├── sec-registrar-miembro.html
│   │   ├── sec-usuarios.html         # Directorio de miembros registrados (tabla Usuarios)
│   │   ├── sec-recompensar.html      # Registro de entrega de cáscaras y aserrín
│   │   ├── sec-ticket-generador.html # Generador de comprobantes PDF / POS
│   │   ├── sec-pedidos.html          # Gestión de pedidos y descifrado PII en RAM
│   │   └── sec-inventario.html       # Control de stock en vivo
│   └── js/
│       ├── admin-config.js           # Configuración operativa congelada (Object.freeze)
│       ├── admin-app.js              # Orquestador principal del panel operativo
│       └── modules/
│           ├── admin-api.js          # API REST, asignación de Pools y cola offline resiliente
│           ├── admin-ui.js           # Renderizado de tablas, toasts, QR y filtros en RAM
│           ├── component-loader.js   # Cargador modular con caché en memoria
│           └── ticket-generator.js   # Motor de exportación PDF con cursorY dinámico
│
└── backend/
    └── Code.gs                       # Backend REST API en Google Apps Script (V8)


🧩 Módulos Principales

1. PWA Cliente (chuya-pwa/)

Catálogo y Stock en Vivo: Sincroniza precios y disponibilidad directamente desde la hoja Productos de Google Sheets, manteniendo respaldo en chuya_products_cache para navegación sin conexión.

Inicio de Sesión por Credencial QR/PDF: Permite a los miembros importar su identidad (Nombre, dirección nano_... y huella PGP) escaneando o subiendo su credencial PDF emitida por el recolector.

Pedidos con Privacidad: Cifra dirección y teléfono con la clave pública PGP del administrador antes de transmitir el pedido.

2. Panel Recolector & Admin (chuya-pwa/admin-recolector/)

Alta de Miembros con Asignación Automática: Registra nuevos participantes asignando atómicamente (LockService) una dirección Nano disponible desde pool_direcciones y un par/clave pública desde pool_pgp.

Directorio de Usuarios (sec-usuarios.html): Consulta y filtra en memoria RAM los miembros registrados por nombre, ID, dirección Nano o rol (CLIENTE, RECOLECTOR, ADMIN).

Generador de Tickets y Comprobantes PDF: Permite imprimir recibos térmicos de 80mm o descargar comprobantes PDF (Chuya_Comprobante_<CUS>.pdf) con cálculo dinámico de altura (cursorY + splitTextToSize) para evitar superposición de textos largos.

Resiliencia Offline en Campo: Si el recolector pierde señal en zonas rurales, las recolecciones y registros se almacenan en chuya_admin_pending_txs y se sincronizan automáticamente al volver en línea.

🚀 Configuración e Instalación Local

Requisitos Previos

Un servidor web local (Apache/XAMPP, Nginx, VS Code Live Server o npx serve) para habilitar ES6 Modules y Service Workers (no abrir mediante file://).

Una hoja de cálculo de Google Sheets vinculada al script Code.gs desplegado como Aplicación Web (Acceso: Cualquier usuario).

Pasos de Despliegue

Clonar o ubicar el proyecto en el directorio raíz de tu servidor local (por ejemplo, http://localhost/chuya-pwa/).

Verificar endpoints en configuración:

Cliente: chuya-pwa/js/config.js → propiedad CONFIG.API_URL.

Admin: chuya-pwa/admin-recolector/js/admin-config.js → propiedad ADMIN_CONFIG.API_URL.

Preparar Pools en Google Sheets:

En la pestaña pool_direcciones, asegúrate de contar con direcciones nano_... cuyo estado sea DISPONIBLE.

En la pestaña pool_pgp, carga las claves públicas y fingerprints con estado DISPONIBLE.

Abrir en el navegador:

PWA Cliente: http://localhost/chuya-pwa/index.html

Panel Admin & Recolector: http://localhost/chuya-pwa/admin-recolector/index.html

🔍 Convenciones de Desarrollo y Auditoría

Trazabilidad Estructurada en Consola: Todos los módulos emiten logs estandarizados bajo el espacio de nombres [Chuya::<Módulo>] (ej. [Chuya::Config], [Chuya::AdminApp], [Chuya::AdminAPI], [Chuya::AdminSW]) para facilitar la depuración en DevTools.

Cero Dependencias de Build: Código JavaScript Vanilla ES6+ nativo sin empaquetadores externos, garantizando auditoría directa y mantenimiento ligero en campo.

Inmutabilidad de Configuración: Los objetos CONFIG y ADMIN_CONFIG utilizan Object.freeze() para evitar mutaciones accidentales en tiempo de ejecución.

📝 Control de Versiones (Conventional Commits)

Para mantener un historial limpio en GitHub Desktop / Git, se utiliza el estándar Conventional Commits:

<tipo>(<módulo>): <descripción corta en imperativo>

- Detalle técnico del cambio 1
- Detalle técnico del cambio 2


Tipos habituales: feat, fix, refactor, docs, style, perf, chore.

🌱 Desarrollado con enfoque de soberanía tecnológica, economía circular y resiliencia comunitaria — Chuya.