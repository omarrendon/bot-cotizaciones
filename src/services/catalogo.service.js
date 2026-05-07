// src/services/catalogo.service.js
// Servicio para cargar y consultar el catálogo de productos desde la lista de precios PDF

const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const CATALOGO_PATH = path.join(__dirname, "../../data/catalogo.json");
const PDF_PATH = path.join(__dirname, "../../data/Lista de precios.pdf");

let catalogoCache = null;

/**
 * Inicializa el catálogo. Si existe catalogo.json lo carga; si no, procesa el PDF.
 * Debe llamarse una sola vez al arrancar el bot.
 */
async function inicializarCatalogo() {
  if (fs.existsSync(CATALOGO_PATH)) {
    const data = fs.readFileSync(CATALOGO_PATH, "utf-8");
    catalogoCache = JSON.parse(data);
    console.log(`📋 Catálogo cargado: ${catalogoCache.length} productos`);
    return;
  }

  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(
      `No se encontró el archivo de lista de precios en: ${PDF_PATH}`
    );
  }

  console.log("📋 Generando catálogo desde lista de precios (primera vez)...");
  await _procesarPDF();
}

/**
 * Extrae los productos del PDF usando pdf-parse y Claude para estructurarlos.
 * Guarda el resultado en data/catalogo.json para usos futuros.
 */
async function _procesarPDF() {
  const pdfParse = require("pdf-parse");
  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfData = await pdfParse(pdfBuffer);
  const pdfText = pdfData.text;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Aquí está el texto extraído de un catálogo de productos de uniformes y equipamiento policial:

${pdfText}

Convierte todos los productos en un array JSON. Cada objeto debe tener exactamente estos campos:
- "id": número de producto (entero)
- "unidad": unidad de medida (PZA, PZAS, PAR, JGO, etc.)
- "descripcion": descripción completa del producto, exactamente como aparece en el catálogo
- "costo": precio como número decimal (sin signo $, sin comas de miles)

Devuelve SOLO el array JSON, sin markdown, sin texto adicional.`,
      },
    ],
  });

  const rawText = response.content[0].text.trim();
  const cleanText = rawText.replace(/```json|```/g, "").trim();

  catalogoCache = JSON.parse(cleanText);
  fs.writeFileSync(CATALOGO_PATH, JSON.stringify(catalogoCache, null, 2), "utf-8");
  console.log(`✅ Catálogo generado y guardado: ${catalogoCache.length} productos`);
}

/**
 * Devuelve el catálogo completo como array de objetos.
 */
function getCatalogo() {
  if (!catalogoCache) {
    throw new Error("El catálogo no está inicializado. Llama a inicializarCatalogo() primero.");
  }
  return catalogoCache;
}

/**
 * Devuelve el catálogo como texto plano para incluir en prompts de Claude.
 */
function getCatalogoComoTexto() {
  return getCatalogo()
    .map((p) => `${p.id}. [${p.unidad}] ${p.descripcion} - $${p.costo}`)
    .join("\n");
}

module.exports = { inicializarCatalogo, getCatalogo, getCatalogoComoTexto };
