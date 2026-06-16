# cotizador-bot

Servidor Node.js que combina dos bots de Telegram y un servicio HTTP de exportación PDF en un solo proceso. Desarrollado para **Textiles y Acabados San Fernando**.

---

## Tabla de contenidos

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Instalación local](#instalación-local)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [API — Exportación PDF](#api--exportación-pdf)
- [Bots de Telegram](#bots-de-telegram)
- [Notion — Modelo de datos](#notion--modelo-de-datos)
- [Deploy en Railway](#deploy-en-railway)

---

## Funcionalidades

### Bot de Cotizaciones
- Procesa **fotos** de cotizaciones escritas a mano — Claude Vision extrae los datos
- Procesa **texto** informal con fuzzy matching contra el catálogo de productos
- Soporta **precios netos** (desagrega IVA automáticamente)
- Genera PDF oficial y lo sube a **Notion**
- Asigna IDs secuenciales (`cot-001`, `cot-002`, ...)

### Bot de Notas de Pago
- Procesa fotos de notas de pago escritas a mano
- Extrae: folio, fecha, cliente, dirección, productos, anticipo, debe, total
- Registra en **Notion** y devuelve el link a la página creada

### HTTP Server — Exportación PDF de Uniformes
- Endpoint REST consumido por [Uniform Perfect Designer](https://uniform-perfect-designer-t82k-omarrendons-projects.vercel.app)
- Aplica conversión **RGB → CMYK** con perfiles ICC (FOGRA39, SWOP, Japan Color, etc.)
- Genera PDFs con **pdf-lib** con fuentes embebidas y marcas de corte opcionales
- Cada página se procesa en un **child process aislado** — un crash nativo no tumba el servidor
- Procesamiento **secuencial por página** para mantener el uso de memoria bajo control

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js |
| HTTP Server | Express 4 |
| Aislamiento de workers | `child_process.fork` |
| Bots | node-telegram-bot-api |
| AI / Vision | Anthropic SDK (Claude) |
| PDF — uniformes | pdf-lib + Sharp (CMYK via perfiles ICC) |
| PDF — cotizaciones | LibreOffice headless |
| PDF parsing | pdf-parse |
| Base de datos | Notion API |
| Documentos | pizzip + docxtemplater |
| Deploy | Railway |

---

## Estructura del proyecto

```
cotizador-bot/
│
├── src/
│   ├── server.js                       # Punto de entrada principal
│   │                                   # Arranca bots + HTTP server en un solo proceso
│   ├── http-server.js                  # HTTP server standalone (solo PDF, para desarrollo)
│   ├── index.js                        # Bot de cotizaciones
│   ├── notas-pago.bot.js               # Bot de notas de pago
│   └── services/
│       ├── claude.service.js           # Vision + texto → JSON estructurado con Claude
│       ├── documento.service.js        # Rellena plantilla DOCX y convierte a PDF
│       ├── catalogo.service.js         # Carga y cache del catálogo de productos
│       ├── notion.service.js           # Escribe en Notion y sube archivos PDF
│       └── notaPago.claude.service.js  # Extracción de datos de notas de pago
│
├── pdf/
│   ├── routes/
│   │   └── exportPdf.js                # Ruta POST /api/export-pdf
│   ├── workers/
│   │   └── pageForkWorker.js           # Worker aislado por página (child_process)
│   └── services/
│       ├── pdfGenerator.js             # Genera el PDF de una página con pdf-lib
│       ├── cmykProcessor.js            # Conversión RGB → CMYK con perfiles ICC
│       └── printMarks.js              # Marcas de corte y registro
│
├── data/
│   ├── Lista de precios.pdf            # Fuente del catálogo de productos
│   ├── catalogo.json                   # Cache generado desde el PDF
│   └── counter.json                    # Contador de IDs de cotizaciones
│
├── template/
│   └── machote_san_fernando.docx       # Plantilla oficial de cotización
│
├── .env.example                        # Plantilla de variables de entorno
├── nixpacks.toml                       # Config Railway: instala LibreOffice + libvips
└── package.json
```

---

## Instalación local

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd cotizador-bot
npm install
```

### 2. Instalar LibreOffice

Necesario para convertir DOCX a PDF en el bot de cotizaciones.

**macOS:**
```bash
brew install --cask libreoffice
```

**Ubuntu/Debian:**
```bash
sudo apt-get install -y libreoffice default-jre
```

Verifica que esté en el PATH:
```bash
soffice --version
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales (ver sección [Variables de entorno](#variables-de-entorno)).

### 4. Iniciar

```bash
# Producción: bots + HTTP server juntos
npm start

# Desarrollo bots (hot reload)
npm run dev

# Desarrollo HTTP server PDF (hot reload, solo el servidor)
npm run dev:http
```

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Sí | Token del bot de cotizaciones ([@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_NOTAS_TOKEN` | Sí | Token del bot de notas de pago |
| `ANTHROPIC_API_KEY` | Sí | API key de Anthropic ([console.anthropic.com](https://console.anthropic.com)) |
| `NOTION_TOKEN` | Sí | Integration secret de Notion |
| `NOTION_DATABASE_ID` | Sí | ID de la database de notas de pago |
| `NOTION_COTIZACIONES_DATABASE_ID` | Sí | ID de la database de cotizaciones |
| `FRONTEND_URL` | Sí | URL del frontend para CORS (ej. `https://tu-app.vercel.app`) |
| `MAX_PAYLOAD_MB` | No | Límite del body JSON en MB — default `80`, recomendado `400` |
| `NODE_OPTIONS` | No | Opciones de Node.js — recomendado `--max-old-space-size=2048` |
| `PORT` | No | Puerto del servidor — default `3000` (Railway lo inyecta automáticamente) |

> **Nota:** `PORT` es inyectado automáticamente por Railway. No hace falta configurarlo en producción.

---

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm start` | Bots + HTTP server (producción) |
| `npm run dev` | Bots con hot reload via nodemon |
| `npm run dev:http` | Solo HTTP server PDF con hot reload |
| `npm run start:cotizador` | Solo bot de cotizaciones |
| `npm run start:notas` | Solo bot de notas de pago |

---

## API — Exportación PDF

### `POST /api/export-pdf`

Genera uno o más archivos PDF a partir de un diseño de uniformes serializado.

#### Headers

```
Content-Type: application/json
```

#### Body

```jsonc
{
  "pages": [
    {
      "pageIndex": 0,          // Índice de la página (0-based)
      "heightCm": 120.5,       // Alto de la página en centímetros
      "elements": [

        // Elemento tipo uniform — imagen de plantilla de uniforme
        {
          "type": "uniform",
          "id": "elem-abc123",
          "part": "jersey",        // "jersey" | "shorts"
          "size": "M",             // "S" | "M" | "L" | "XL"
          "source": "excel",       // "manual" | "excel"
          "isSvg": false,          // Siempre false — el frontend pre-rasteriza a PNG
          "rotation": 0,           // 0 | 180
          "zIndex": 1,
          "visible": true,
          "position": { "x": 50, "y": 80 },          // En píxeles (canvas)
          "dimensions": { "width": 559, "height": 776 },
          "imageDataUrl": "data:image/png;base64,..."  // PNG pre-rasterizado
        },

        // Elemento tipo textPng — texto pre-renderizado a PNG en el browser
        {
          "type": "textPng",
          "id": "elem-xyz789",
          "rotation": 0,           // 0 | 180
          "zIndex": 2,
          "visible": true,
          "position": { "x": 100, "y": 200 },
          "dimensions": { "width": 150, "height": 40 },
          "textAlign": "center",
          "pngDataUrl": "data:image/png;base64,...",
          "widthPts": 56.7,        // Ancho real del texto en puntos PDF
          "heightPts": 14.2,       // Alto real del texto en puntos PDF
          "yOffsetPts": 2.1        // Ajuste de baseline
        }

      ]
    }
  ],
  "canvasConfig": {
    "width": 158.529,       // Ancho del canvas en centímetros
    "height": 490,          // Alto máximo del canvas en centímetros
    "pixelsPerCm": 10       // Factor de conversión píxeles → cm
  },
  "cmykConfig": {
    "profile": "FOGRA39",   // "FOGRA39" | "FOGRA51" | "SWOP" | "JapanColor2011" | "UncoatedFOGRA29"
    "gcrMethod": "medium",  // "none" | "light" | "medium" | "heavy" | "maximum"
    "customTAC": null,      // Límite TAC personalizado (null = usar el del perfil)
    "applyDotGain": true,   // Aplicar compensación de dot gain
    "printMarks": {         // null para omitir marcas de corte
      "bleed": 3,           // Sangría en mm
      "markLength": 5       // Largo de marcas de corte en mm
    }
  }
}
```

#### Respuesta exitosa `200`

```json
{
  "pages": [
    {
      "pageIndex": 0,
      "pdfBase64": "JVBERi0xLjQ...",
      "fileName": "uniformes-p1-FOGRA39.pdf"
    }
  ]
}
```

#### Errores

| Código | Causa |
|---|---|
| `400` | `canvasConfig` o `pages` ausentes o vacíos |
| `500` | Error en la generación del PDF (ver logs del servidor) |

#### Perfiles CMYK disponibles

| Perfil | Estándar | Uso recomendado |
|---|---|---|
| `FOGRA39` | ISO 12647-2 | Impresión offset Europa — **default** |
| `FOGRA51` | ISO 12647-2:2013 | Papel sin recubrimiento Europa |
| `SWOP` | CGATS TR 001 | Impresión offset EEUU |
| `JapanColor2011` | Japan Color | Mercado japonés |
| `UncoatedFOGRA29` | FOGRA29 | Papel no estucado Europa |

#### Notas de implementación

- Los SVGs son **pre-rasterizados a PNG en el browser** antes de enviarse. Sharp en el servidor nunca procesa SVGs directamente (evita SIGBUS en librsvg).
- Cada página corre en un **child process independiente** (`child_process.fork`). Si ocurre un crash nativo (OOM, SIGBUS), solo muere el hijo — el servidor HTTP sigue en pie y devuelve un `500` legible.
- Las páginas se procesan **secuencialmente** para limitar el uso de memoria (~200 MB por página máximo).
- Los elementos con `visible: false` se excluyen antes de procesar.
- Para elementos `uniform` con el mismo `imageDataUrl + rotation`, la imagen embebida se **cachea dentro de la página** para no procesar la misma imagen dos veces.

---

## Bots de Telegram

### Comandos

| Comando / Input | Bot | Acción |
|---|---|---|
| `/start` | Cotizaciones | Bienvenida e instrucciones |
| `/ayuda` | Cotizaciones | Guía de uso y tips para fotos |
| Foto | Cotizaciones | Extrae datos con Claude Vision y genera PDF |
| Texto libre | Cotizaciones | Fuzzy match contra catálogo y genera PDF |
| Foto | Notas de pago | Extrae datos y registra en Notion |

### Flujo del bot de cotizaciones

```
Usuario envía foto o texto
        ↓
claude.service.js — Claude Vision extrae JSON estructurado
        ↓
catalogo.service.js — fuzzy match de productos contra Lista de precios.pdf
        ↓
documento.service.js — rellena machote_san_fernando.docx → LibreOffice → PDF
        ↓
notion.service.js — sube PDF a Notion + registra en database de cotizaciones
        ↓
Bot responde con PDF + link a Notion
```

---

## Notion — Modelo de datos

### Database de Cotizaciones

| Propiedad | Tipo |
|---|---|
| Nombre (título) | Título |
| ID Cotización | Text |
| Cliente | Text |
| Fecha | Date |
| Subtotal | Number |
| IVA | Number |
| Total | Number |
| Condiciones de Pago | Text |
| Tiempo de Entrega | Text |
| PDF | Files |

### Database de Notas de Pago

| Propiedad | Tipo |
|---|---|
| Folio (título) | Título |
| Fecha | Date |
| Cliente | Text |
| Dirección | Text |
| Total | Number |
| Anticipo | Number |
| Debe | Number |

---

## Deploy en Railway

### Variables de entorno requeridas en Railway

Agrega todas las variables de la sección [Variables de entorno](#variables-de-entorno) en **Railway → tu servicio → Variables**.

Las más críticas para el HTTP server de PDF:

```
FRONTEND_URL=https://tu-app.vercel.app
MAX_PAYLOAD_MB=400
NODE_OPTIONS=--max-old-space-size=2048
```

### Comando de inicio

```
node src/server.js
```

Declarado en `nixpacks.toml`. Railway lo detecta automáticamente.

### Dependencias del sistema

`nixpacks.toml` instala automáticamente:

```toml
[phases.setup]
aptPkgs = ["libreoffice", "libreoffice-writer", "default-jre", "libvips-dev"]
```

No se necesita configuración adicional — Railway instala LibreOffice y libvips en el build.

### Networking

El servicio expone un solo puerto (`PORT`, inyectado por Railway). En Railway → tu servicio → **Settings → Networking → Public Networking** genera el dominio público (`*.up.railway.app`).

Ese dominio es el que va en `VITE_PDF_SERVER_URL` del frontend.

> El dominio `*.railway.internal` es la red privada de Railway — **no es accesible desde el browser**. Siempre usa el dominio `*.up.railway.app` para peticiones desde el frontend.
