# CLAUDE.md — cotizador-bot

## Propósito

Bot de Telegram para automatizar la generación de cotizaciones y notas de pago de **Textiles y Acabados San Fernando**, empresa de uniformes y equipamiento policial. Convierte fotos escritas a mano o texto informal en documentos PDF oficiales con cálculo de IVA y los registra en Notion.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js (ES CommonJS) |
| Bots | `node-telegram-bot-api` |
| AI / Vision | `@anthropic-ai/sdk` — Claude Opus 4.5 |
| Base de datos | Notion API (`@notionhq/client`) |
| Documentos | `pizzip` + XML directo sobre DOCX |
| PDF | LibreOffice headless (`soffice`) |
| PDF parsing | `pdf-parse` |
| HTTP | `axios` |
| Deploy | Railway (`nixpacks.toml`) |

---

## Estructura del proyecto

```
cotizador-bot/
├── src/
│   ├── server.js                    # Punto de entrada: arranca ambos bots
│   ├── index.js                     # Bot de cotizaciones
│   ├── notas-pago.bot.js            # Bot de notas de pago
│   └── services/
│       ├── claude.service.js        # Vision + text → JSON con Claude
│       ├── documento.service.js     # DOCX template fill + DOCX→PDF
│       ├── catalogo.service.js      # Carga y cache de lista de precios
│       ├── notion.service.js        # Write a Notion databases y upload PDF
│       └── notaPago.claude.service.js # Extracción de datos de notas de pago
├── data/
│   ├── Lista de precios.pdf         # Fuente de verdad del catálogo
│   ├── catalogo.json                # Cache generado desde el PDF
│   └── counter.json                 # Contador secuencial de cotizaciones
├── template/
│   └── machote_san_fernando.docx   # Plantilla oficial de cotización
├── .env.example                     # Variables de entorno requeridas
└── nixpacks.toml                    # Config Railway (instala LibreOffice)
```

---

## Variables de entorno

Todas son requeridas. Definir en `.env` local o en Railway:

```bash
TELEGRAM_BOT_TOKEN=          # Bot de cotizaciones
TELEGRAM_NOTAS_TOKEN=        # Bot de notas de pago
ANTHROPIC_API_KEY=           # Claude Vision + text
NOTION_TOKEN=                # Notion integration secret
NOTION_DATABASE_ID=          # Database de notas de pago
NOTION_COTIZACIONES_DATABASE_ID=  # Database de cotizaciones
```

---

## Scripts

```bash
npm start             # Producción: ambos bots simultáneos
npm run dev           # Desarrollo con nodemon (hot reload)
npm run start:cotizador  # Solo bot de cotizaciones
npm run start:notas      # Solo bot de notas de pago
```

---

## Funcionalidades

### Bot de Cotizaciones (`TELEGRAM_BOT_TOKEN`)

1. **Foto de cotización** → Claude Vision extrae cliente, productos, cantidades y precios → genera DOCX rellenando la plantilla XML → LibreOffice convierte a PDF → se sube a Notion → se envía el PDF al usuario.
2. **Mensaje de texto** → Claude lee el texto junto con el catálogo completo, hace fuzzy matching de productos y asigna precios del catálogo → mismo pipeline de generación de PDF.
3. **Precio neto** → Si el usuario indica precio neto, Claude desagrega automáticamente el IVA (`precioUnitario = precioNeto / 1.16`).
4. **IDs secuenciales** → Cada cotización recibe un ID autoincremental (`cot-001`, `cot-002`, ...) mantenido en `data/counter.json`.

### Bot de Notas de Pago (`TELEGRAM_NOTAS_TOKEN`)

1. **Foto de nota de pago** → Claude Vision extrae folio, fecha, cliente, dirección, productos, anticipo, debe y total → registra en Notion → devuelve link a la página creada.

---

## Flujos de procesamiento

### Cotización por imagen

```
Usuario envía foto
  → Descarga desde Telegram API
  → claude.service: extraerDatosDeCotizacion(imageBuffer)
  → documento.service: generarCotizacion(datos)
      → Rellena plantilla DOCX editando ZIP/XML
      → soffice --headless → PDF
  → notion.service: subirArchivo(pdf) + registrarCotizacion(datos)
  → Bot envía resumen en texto + archivo PDF
  → Limpieza de /tmp
```

### Cotización por texto

```
Usuario escribe texto informal
  → claude.service: extraerDatosDeCotizacionDeTexto(mensaje)
      → Prompt incluye catalogo.json completo
      → Claude hace fuzzy matching y asigna precios
  → mismo pipeline de generación
```

### Nota de pago

```
Usuario envía foto de nota
  → notaPago.claude.service: extraer datos
  → notion.service: registrarNota(datos)
  → Bot responde con link a Notion
```

---

## Servicios — detalles clave

### `claude.service.js`

- Usa `claude-opus-4-5` con vision.
- Devuelve JSON estricto (sin markdown fences).
- Regla importante: `cantidad` y `precioUnitario` son **números**, nunca strings.
- Comas en precios se interpretan como separadores de miles, no decimales.

### `documento.service.js`

- La plantilla DOCX se manipula como ZIP usando `pizzip`, editando el XML interno directamente (no con docxtemplater).
- Las celdas de totales tienen `paraId` fijos en el XML:
  - SUBTOTAL → `0F820EAE`
  - IVA → `59CC1687`
  - TOTAL → `6C4CBFE8`
- Las filas de productos se generan como bloques XML y se insertan en la tabla.
- Tipografía adaptativa en celdas de importes: ≤9 chars → 10pt, 10-11 chars → 9pt, ≥12 chars → 8pt (previene wrapping).
- Conversión a PDF: `soffice --headless --convert-to pdf --outdir /tmp <archivo.docx>`

### `catalogo.service.js`

- Al iniciar, busca `data/catalogo.json`. Si no existe, procesa `data/Lista de precios.pdf` con `pdf-parse` + Claude y guarda el resultado.
- El catálogo se inyecta en el prompt de texto para que Claude haga matching.

### `notion.service.js`

- Crea páginas en dos databases distintas (cotizaciones y notas de pago).
- Sube PDFs usando Notion Files API (modo single-part).
- Registra productos como child blocks tipo tabla.

---

## Reglas de desarrollo

- No agregar manejo de errores para casos que no pueden ocurrir; los errores se propagan con mensajes amigables al usuario de Telegram.
- No usar `docxtemplater` para modificar la plantilla; se edita el XML del DOCX directamente con `pizzip`.
- El catálogo (`catalogo.json`) es un cache — si se requiere actualizar, borrar el archivo y reiniciar.
- Los archivos temporales (DOCX/PDF generados) van en `/tmp` y se eliminan después de enviarlos.
- Ambos bots corren en el mismo proceso Node.js a través de `server.js`.
- Nunca comitear `.env`; usar `.env.example` como referencia.

---

## Dependencias del sistema (runtime)

Requeridas en el servidor de deploy (ya incluidas en `nixpacks.toml`):

```
libreoffice
libreoffice-writer
default-jre
```

Sin LibreOffice, la conversión DOCX→PDF falla. En desarrollo local, instalar LibreOffice y asegurarse de que `soffice` esté en el PATH.

---

## Modelo de datos

### Cotización (Notion)

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

### Nota de Pago (Notion)

| Propiedad | Tipo |
|-----------|------|
| Folio (título) | Título |
| Fecha | Date |
| Cliente | Text |
| Dirección | Text |
| Total | Number |
| Anticipo | Number |
| Debe | Number |
