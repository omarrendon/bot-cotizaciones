// src/services/documento.service.js
// Genera cotización rellenando el template Word oficial con los datos extraídos

const PizZip = require("pizzip");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEMPLATE_PATH = path.join(__dirname, "../../template/machote_san_fernando.docx");
const COUNTER_PATH  = path.join(__dirname, "../../data/counter.json");

// ─── Contador de cotizaciones ─────────────────────────────────────────────────

function getSiguienteCotizacionId() {
  let data = { ultimo: 0 };
  try {
    data = JSON.parse(fs.readFileSync(COUNTER_PATH, "utf8"));
  } catch (_) {
    // primera vez: el archivo aún no existe
  }
  data.ultimo += 1;
  fs.mkdirSync(path.dirname(COUNTER_PATH), { recursive: true });
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(data), "utf8");
  return `cot-${String(data.ultimo).padStart(3, "0")}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatearMoneda(valor) {
  return `$${Number(valor).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Genera un ID hex de 8 chars único por índice y posición
function makeParaId(rowIdx, pos) {
  return ((rowIdx * 100 + pos + 0x10000) >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

// ─── Generación de fila de producto ──────────────────────────────────────────

/**
 * Toma el XML de la fila vacía del template y la rellena con los datos del producto.
 * Procesa las celdas de derecha a izquierda para no alterar posiciones.
 */
function generarFilaProducto(templateRowXml, producto, rowIdx) {
  // Reemplazar paraIds para evitar duplicados
  let counter = 0;
  let rowXml = templateRowXml.replace(/w14:paraId="[^"]*"/g, () => {
    return `w14:paraId="${makeParaId(rowIdx, counter++)}"`;
  });

  // Quitar bookmarks que podrían causar conflictos de ID
  rowXml = rowXml
    .replace(/<w:bookmarkStart[^/]*\/>/g, "")
    .replace(/<w:bookmarkEnd[^/]*\/>/g, "");

  // Localizar las 4 celdas (CANT, DESCRIPCION, P.U., IMPORTE)
  const celdas = [];
  let pos = 0;
  while (true) {
    const inicio = rowXml.indexOf("<w:tc>", pos);
    if (inicio === -1) break;
    const fin = rowXml.indexOf("</w:tc>", inicio) + 7;
    celdas.push({ inicio, fin });
    pos = fin;
  }

  if (celdas.length !== 4) return templateRowXml; // seguridad

  // Textos para cada celda
  const textos = [
    escapeXml(String(producto.cantidad)),
    escapeXml(producto.descripcion),
    escapeXml(formatearMoneda(producto.precioUnitario)),
    escapeXml(formatearMoneda(producto.cantidad * producto.precioUnitario)),
  ];

  // Inyectar texto de derecha a izquierda (para no alterar posiciones previas)
  let resultado = rowXml;
  for (let i = celdas.length - 1; i >= 0; i--) {
    const celdaXml = resultado.substring(celdas[i].inicio, celdas[i].fin);
    const idxPprEnd = celdaXml.lastIndexOf("</w:pPr>");
    if (idxPprEnd !== -1) {
      const insertarEn = idxPprEnd + "</w:pPr>".length;
      const run = `<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${textos[i]}</w:t></w:r>`;
      const nuevaCelda = celdaXml.substring(0, insertarEn) + run + celdaXml.substring(insertarEn);
      resultado =
        resultado.substring(0, celdas[i].inicio) +
        nuevaCelda +
        resultado.substring(celdas[i].fin);
    }
  }

  return resultado;
}

// ─── Inyección de valor en celda de totales ───────────────────────────────────

/**
 * Inserta texto en la celda IMPORTE de las filas SUBTOTAL/IVA/TOTAL,
 * identificadas por el paraId único de esa celda en el template.
 */
function insertarValorEnCelda(docXml, paraId, texto) {
  const marker = `w14:paraId="${paraId}"`;
  const markerPos = docXml.indexOf(marker);
  if (markerPos === -1) return docXml;

  // Buscar </w:pPr> dentro de este mismo párrafo (acotado al siguiente </w:p>)
  const pEnd = docXml.indexOf("</w:p>", markerPos);
  const pprEnd = docXml.indexOf("</w:pPr>", markerPos);
  if (pprEnd === -1 || pprEnd > pEnd) return docXml;

  const insertarEn = pprEnd + "</w:pPr>".length;
  const run = `<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(texto)}</w:t></w:r>`;

  return docXml.substring(0, insertarEn) + run + docXml.substring(insertarEn);
}

// ─── Generador principal ──────────────────────────────────────────────────────

/**
 * Rellena el template Word con los datos de la cotización y lo convierte a PDF.
 * @param {Object} datos - Datos extraídos por Claude
 * @returns {{ docxPath: string, pdfPath: string }}
 */
async function generarCotizacion(datos) {
  // ── 0. Identificador único de cotización ──────────────────────────────────
  const cotizacionId = getSiguienteCotizacionId();

  // Cálculos
  const subtotal = datos.productos.reduce(
    (sum, p) => sum + p.cantidad * p.precioUnitario,
    0
  );
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  // Cargar template como ZIP
  const templateContent = fs.readFileSync(TEMPLATE_PATH, "binary");
  const zip = new PizZip(templateContent);
  let docXml = zip.files["word/document.xml"].asText();

  // ── 1. Nombre del cliente ────────────────────────────────────────────────
  docXml = docXml.replace(
    ">A QUIEN CORRESPONDA<",
    `>${escapeXml(datos.cliente || "A QUIEN CORRESPONDA")}<`
  );

  // ── 1.5. Insertar identificador único justo encima de la tabla ───────────
  // Párrafo alineado a la derecha, sin sangría, para coincidir con el
  // margen derecho de la tabla.
  // indent derecho calculado para que el texto quede alineado
  // con el borde derecho de la tabla (386 twips = margen der. página + diferencia tabla)
  const parrafoId =
    `<w:p>` +
      `<w:pPr>` +
        `<w:pStyle w:val="Sinespaciado"/>` +
        `<w:jc w:val="right"/>` +
        `<w:ind w:right="386"/>` +
        `<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="atLeast"/>` +
        `<w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>` +
      `</w:pPr>` +
      `<w:r>` +
        `<w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>` +
        `<w:t>${escapeXml(cotizacionId)}</w:t>` +
      `</w:r>` +
    `</w:p>`;

  const primeraTblIdx = docXml.indexOf("<w:tbl>");
  docXml =
    docXml.substring(0, primeraTblIdx) +
    parrafoId +
    docXml.substring(primeraTblIdx);

  // ── 2. Localizar todas las filas de la tabla de productos ────────────────
  const filas = [];
  let buscarDesde = 0;
  while (true) {
    const inicio = docXml.indexOf("<w:tr ", buscarDesde);
    if (inicio === -1) break;
    const fin = docXml.indexOf("</w:tr>", inicio) + 7;
    filas.push({ inicio, fin });
    buscarDesde = fin;
  }
  // Fila 0: encabezado (CANT / DESCRIPCION / P.U. / IMPORTE)
  // Fila 1: única fila de datos vacía → la reemplazamos con los productos
  // Filas 2-4: SUBTOTAL, IVA, TOTAL (los llenamos por paraId)

  const filaTemplateXml = docXml.substring(filas[1].inicio, filas[1].fin);
  const filasProductosXml = datos.productos
    .map((p, i) => generarFilaProducto(filaTemplateXml, p, i + 1))
    .join("");

  docXml =
    docXml.substring(0, filas[1].inicio) +
    filasProductosXml +
    docXml.substring(filas[1].fin);

  // ── 3. Insertar totales en celdas IMPORTE de SUBTOTAL / IVA / TOTAL ─────
  // Los paraIds de esas celdas son fijos en el template original:
  docXml = insertarValorEnCelda(docXml, "0F820EAE", formatearMoneda(subtotal)); // SUBTOTAL
  docXml = insertarValorEnCelda(docXml, "59CC1687", formatearMoneda(iva));      // IVA
  docXml = insertarValorEnCelda(docXml, "6C4CBFE8", formatearMoneda(total));    // TOTAL

  // ── 3.5. Prevenir saltos de línea en celdas angostas ─────────────────────
  // LibreOffice usa métricas de fuente distintas a Word; agregar noWrap a
  // todas las celdas evita que la última letra caiga en línea nueva.
  docXml = docXml.replace(/(<w:tcPr>)([\s\S]*?)(<\/w:tcPr>)/g, (match, open, content, close) => {
    if (content.includes("<w:noWrap")) return match;
    return open + content + "<w:noWrap/>" + close;
  });

  // ── 4. Guardar DOCX modificado ───────────────────────────────────────────
  zip.file("word/document.xml", docXml);
  const buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const docxPath = path.join(tmpDir, `cotizacion_${timestamp}.docx`);
  const pdfPath = path.join(tmpDir, `cotizacion_${timestamp}.pdf`);

  fs.writeFileSync(docxPath, buffer);

  // ── 5. Convertir a PDF con LibreOffice ───────────────────────────────────
  execSync(
    `soffice --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`,
    { timeout: 30000 }
  );

  return { docxPath, pdfPath, cotizacionId };
}

module.exports = { generarCotizacion };
