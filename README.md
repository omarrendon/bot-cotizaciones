# Bot de Cotizaciones — Textiles y Acabados San Fernando

Bot de Telegram que automatiza la generación de cotizaciones y notas de pago para una empresa de uniformes y equipamiento policial. Convierte fotos escritas a mano o texto informal en PDFs oficiales, calcula IVA automáticamente y registra todo en Notion.

---

## Funcionalidades

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

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js |
| Bots | node-telegram-bot-api |
| AI / Vision | Anthropic SDK — Claude Opus 4.5 |
| Base de datos | Notion API |
| Documentos | pizzip + XML (edición directa de DOCX) |
| PDF | LibreOffice headless |
| PDF parsing | pdf-parse |
| Deploy | Railway |

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
TELEGRAM_BOT_TOKEN=          # Bot de cotizaciones (@BotFather)
TELEGRAM_NOTAS_TOKEN=        # Bot de notas de pago (@BotFather)
ANTHROPIC_API_KEY=           # console.anthropic.com
NOTION_TOKEN=                # Notion integration secret
NOTION_DATABASE_ID=          # ID de la database de notas de pago
NOTION_COTIZACIONES_DATABASE_ID=  # ID de la database de cotizaciones
```

### 4. Iniciar

```bash
npm start        # Ambos bots en producción
npm run dev      # Desarrollo con hot reload (nodemon)
```

---

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm start` | Ambos bots simultáneos |
| `npm run dev` | Desarrollo con nodemon |
| `npm run start:cotizador` | Solo bot de cotizaciones |
| `npm run start:notas` | Solo bot de notas de pago |

---

## Comandos del bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Bienvenida e instrucciones |
| `/ayuda` | Guía de uso y tips para mejores fotos |
| Foto | Genera cotización desde imagen |
| Texto | Genera cotización por descripción |

---

## Estructura del proyecto

```
cotizador-bot/
├── src/
│   ├── server.js                    # Punto de entrada: ambos bots simultáneos
│   ├── index.js                     # Bot de cotizaciones
│   ├── notas-pago.bot.js            # Bot de notas de pago
│   └── services/
│       ├── claude.service.js        # Vision + texto → JSON con Claude
│       ├── documento.service.js     # Rellena DOCX + convierte a PDF
│       ├── catalogo.service.js      # Carga y cache de lista de precios
│       ├── notion.service.js        # Escribe en Notion y sube PDFs
│       └── notaPago.claude.service.js  # Extracción de notas de pago
├── data/
│   ├── Lista de precios.pdf         # Fuente del catálogo de productos
│   ├── catalogo.json                # Cache generado desde el PDF
│   └── counter.json                 # Contador de cotizaciones
├── template/
│   └── machote_san_fernando.docx   # Plantilla oficial de cotización
├── .env.example
├── nixpacks.toml                    # Config Railway (LibreOffice + Java)
└── package.json
```

---

## Deploy en Railway

1. Sube el proyecto a GitHub
2. En [railway.app](https://railway.app), conecta el repositorio
3. Agrega todas las variables de entorno del `.env.example`
4. Railway usa `nixpacks.toml` para instalar LibreOffice automáticamente
5. El comando de inicio es `node src/server.js`

> LibreOffice y Java ya están declarados en `nixpacks.toml` — no se necesita configuración adicional.

---

## Notion — Modelo de datos

### Database de Cotizaciones

| Propiedad | Tipo |
|-----------|------|
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
|-----------|------|
| Folio (título) | Título |
| Fecha | Date |
| Cliente | Text |
| Dirección | Text |
| Total | Number |
| Anticipo | Number |
| Debe | Number |
