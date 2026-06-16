# Bot de Cotizaciones — Textiles y Acabados San Fernando

Bot de Telegram que automatiza la generación de cotizaciones y notas de pago para una empresa de uniformes y equipamiento policial. Convierte fotos escritas a mano o texto informal en PDFs oficiales, calcula IVA automáticamente y registra todo en Notion.

---

## Funcionalidades

### HTTP Server — Exportación PDF de Uniformes

Endpoint REST que genera archivos PDF de alta calidad desde diseños de uniformes deportivos creados en [Uniform Perfect Designer](https://uniform-perfect-designer-t82k.vercel.app).

- Recibe el diseño serializado (uniformes + textos por página) en JSON
- Rasteriza imágenes PNG con **Sharp** y aplica conversión de color **RGB → CMYK** con perfil ICC configurable (FOGRA39 por defecto)
- Genera el PDF con **pdf-lib** embebiendo fuentes y aplicando marcas de corte
- Cada página se procesa en un **child process aislado** — un crash nativo no tumba el servidor
- Las páginas se procesan **secuencialmente** para controlar el uso de memoria

**Endpoint:**

```
POST /api/export-pdf
Content-Type: application/json

{
  "pages": [
    {
      "pageIndex": 0,
      "heightCm": 120.5,
      "elements": [
        {
          "type": "uniform",
          "id": "...",
          "part": "jersey" | "shorts",
          "size": "S" | "M" | "L" | "XL",
          "source": "manual" | "excel",
          "isSvg": false,
          "rotation": 0 | 180,
          "zIndex": 1,
          "visible": true,
          "position": { "x": 50, "y": 80 },
          "dimensions": { "width": 559, "height": 776 },
          "imageDataUrl": "data:image/png;base64,..."
        },
        {
          "type": "textPng",
          "id": "...",
          "rotation": 0 | 180,
          "position": { "x": 100, "y": 200 },
          "dimensions": { "width": 150, "height": 40 },
          "textAlign": "center",
          "pngDataUrl": "data:image/png;base64,...",
          "widthPts": 56.7,
          "heightPts": 14.2,
          "yOffsetPts": 2.1
        }
      ]
    }
  ],
  "canvasConfig": { "width": 158.529, "height": 490, "pixelsPerCm": 10 },
  "cmykConfig": { "profile": "FOGRA39", "applyDotGain": true, "printMarks": { ... } }
}
```

**Respuesta:**

```json
{
  "pages": [
    {
      "pageIndex": 0,
      "pdfBase64": "...",
      "fileName": "uniformes-p1-FOGRA39.pdf"
    }
  ]
}
```

**Variables de entorno necesarias:**

| Variable         | Descripción                              | Default |
| ---------------- | ---------------------------------------- | ------- |
| `FRONTEND_URL`   | URL del frontend para CORS               | `*`     |
| `MAX_PAYLOAD_MB` | Límite del body JSON en MB               | `80`    |
| `NODE_OPTIONS`   | Opciones de Node.js                      | —       |
| `PORT`           | Puerto del servidor (Railway lo inyecta) | `3000`  |

**Desarrollo:**

```bash
npm run dev:http   # Levanta solo el HTTP server con nodemon en :3000
```

---

### Bot de Cotizaciones

- Procesa **fotos** de cotizaciones escritas a mano (Claude Vision extrae los datos)
- Procesa **texto** informal con fuzzy matching contra el catálogo de productos
- Soporta **precios netos** (desagrega IVA automáticamente)
- Genera **PDF** con el formato oficial de la empresa
- Sube el PDF y registra la cotización en **Notion**
- Asigna **IDs secuenciales** (`cot-001`, `cot-002`, ...)

### Bot de Notas de Pago

- Procesa fotos de notas de pago escritas a mano
- Extrae: folio, fecha, cliente, dirección, productos, anticipo, debe, total
- Registra automáticamente en **Notion** y devuelve el link a la página

---

## Stack

| Capa               | Tecnología                                 |
| ------------------ | ------------------------------------------ |
| Runtime            | Node.js                                    |
| HTTP Server        | Express + child_process (workers aislados) |
| Bots               | node-telegram-bot-api                      |
| AI / Vision        | Anthropic SDK — Claude Opus 4.5            |
| Base de datos      | Notion API                                 |
| Documentos         | pizzip + XML (edición directa de DOCX)     |
| PDF (uniformes)    | pdf-lib + Sharp (CMYK via perfiles ICC)    |
| PDF (cotizaciones) | LibreOffice headless                       |
| PDF parsing        | pdf-parse                                  |
| Deploy             | Railway                                    |

---

## Instalación local

### 1. Clonar e instalar dependencias

```bash
git clone <tu-repo>
cd cotizador-bot
npm install
```

### 2. Instalar LibreOffice

Necesario para convertir DOCX a PDF.

**macOS:**

```bash
brew install --cask libreoffice
```

**Ubuntu/Debian:**

```bash
sudo apt-get install -y libreoffice default-jre
```

Verifica que `soffice` esté en el PATH:

```bash
soffice --version
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con los valores reales:

```bash
TELEGRAM_BOT_TOKEN=                   # Bot de cotizaciones (@BotFather)
TELEGRAM_NOTAS_TOKEN=                 # Bot de notas de pago (@BotFather)
ANTHROPIC_API_KEY=                    # console.anthropic.com
NOTION_TOKEN=                         # Notion integration secret
NOTION_DATABASE_ID=                   # ID de la database de notas de pago
NOTION_COTIZACIONES_DATABASE_ID=      # ID de la database de cotizaciones
FRONTEND_URL=http://localhost:5173    # URL del frontend (CORS)
MAX_PAYLOAD_MB=400                    # Límite del body JSON para export-pdf
NODE_OPTIONS=--max-old-space-size=2048
```

### 4. Iniciar

```bash
npm start          # Bots + HTTP server en producción
npm run dev        # Bots con hot reload (nodemon)
npm run dev:http   # Solo HTTP server de PDF con hot reload
```

---

## Scripts disponibles

| Script                    | Descripción                            |
| ------------------------- | -------------------------------------- |
| `npm start`               | Bots + HTTP server (producción)        |
| `npm run dev`             | Bots con hot reload (nodemon)          |
| `npm run dev:http`        | Solo HTTP server de PDF con hot reload |
| `npm run start:cotizador` | Solo bot de cotizaciones               |
| `npm run start:notas`     | Solo bot de notas de pago              |

---

## Comandos del bot

| Comando  | Descripción                           |
| -------- | ------------------------------------- |
| `/start` | Bienvenida e instrucciones            |
| `/ayuda` | Guía de uso y tips para mejores fotos |
| Foto     | Genera cotización desde imagen        |
| Texto    | Genera cotización por descripción     |

---

## Estructura del proyecto

```
cotizador-bot/
├── src/
│   ├── server.js                    # Punto de entrada: bots + HTTP server
│   ├── http-server.js               # HTTP server standalone (solo PDF)
│   ├── index.js                     # Bot de cotizaciones
│   ├── notas-pago.bot.js            # Bot de notas de pago
│   └── services/
│       ├── claude.service.js        # Vision + texto → JSON con Claude
│       ├── documento.service.js     # Rellena DOCX + convierte a PDF
│       ├── catalogo.service.js      # Carga y cache de lista de precios
│       ├── notion.service.js        # Escribe en Notion y sube PDFs
│       └── notaPago.claude.service.js  # Extracción de notas de pago
├── pdf/
│   ├── routes/
│   │   └── exportPdf.js             # Ruta POST /api/export-pdf
│   ├── workers/
│   │   ├── pageForkWorker.js        # Worker aislado por página (child_process)
│   │   └── pageWorker.js            # Worker legacy (worker_threads)
│   └── services/
│       ├── pdfGenerator.js          # Genera PDF de una página con pdf-lib
│       ├── cmykProcessor.js         # Conversión RGB → CMYK con perfiles ICC
│       └── printMarks.js            # Marcas de corte y registro
├── data/
│   ├── Lista de precios.pdf         # Fuente del catálogo de productos
│   ├── catalogo.json                # Cache generado desde el PDF
│   └── counter.json                 # Contador de cotizaciones
├── template/
│   └── machote_san_fernando.docx   # Plantilla oficial de cotización
├── .env.example
├── nixpacks.toml                    # Config Railway (LibreOffice + Java + libvips)
└── package.json
```

---

## Deploy en Railway

1. Sube el proyecto a GitHub
2. En [railway.app](https://railway.app), conecta el repositorio
3. Agrega las variables de entorno:

| Variable                          | Descripción                                   |
| --------------------------------- | --------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`              | Token del bot de cotizaciones                 |
| `TELEGRAM_NOTAS_TOKEN`            | Token del bot de notas de pago                |
| `ANTHROPIC_API_KEY`               | API key de Anthropic                          |
| `NOTION_TOKEN`                    | Integration secret de Notion                  |
| `NOTION_DATABASE_ID`              | ID de la database de notas de pago            |
| `NOTION_COTIZACIONES_DATABASE_ID` | ID de la database de cotizaciones             |
| `FRONTEND_URL`                    | URL del frontend (para CORS del endpoint PDF) |
| `MAX_PAYLOAD_MB`                  | `400`                                         |
| `NODE_OPTIONS`                    | `--max-old-space-size=2048`                   |

4. Railway usa `nixpacks.toml` para instalar LibreOffice y libvips automáticamente
5. El comando de inicio es `node src/server.js` (bots + HTTP server en un solo proceso)

> `PORT` es inyectado automáticamente por Railway — no hace falta configurarlo.

---

## Notion — Modelo de datos

### Database de Cotizaciones

| Propiedad           | Tipo   |
| ------------------- | ------ |
| Nombre (título)     | Título |
| ID Cotización       | Text   |
| Cliente             | Text   |
| Fecha               | Date   |
| Subtotal            | Number |
| IVA                 | Number |
| Total               | Number |
| Condiciones de Pago | Text   |
| Tiempo de Entrega   | Text   |
| PDF                 | Files  |

### Database de Notas de Pago

| Propiedad      | Tipo   |
| -------------- | ------ |
| Folio (título) | Título |
| Fecha          | Date   |
| Cliente        | Text   |
| Dirección      | Text   |
| Total          | Number |
| Anticipo       | Number |
| Debe           | Number |
