// src/services/documento.service.js
// Servicio para generar el documento Word y convertirlo a PDF

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  UnderlineType,
} = require("docx");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Helpers de formato ───────────────────────────────────────────────────────

function formatearMoneda(valor) {
  return `$${Number(valor).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function obtenerFechaActual() {
  return new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const FONT = "Arial";
const COLOR_HEADER = "1F3864"; // Azul oscuro
const COLOR_SUBHEADER = "2E75B6"; // Azul medio
const COLOR_ACCENT = "D6E4F0"; // Azul claro (fondo encabezados tabla)
const COLOR_TOTAL_BG = "1F3864"; // Fondo totales

const borderGris = { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" };
const borderBlancoFino = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "FFFFFF",
};
const sinBorde = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borders = {
  top: borderGris,
  bottom: borderGris,
  left: borderGris,
  right: borderGris,
};
const bordersTotal = {
  top: borderBlancoFino,
  bottom: borderBlancoFino,
  left: sinBorde,
  right: sinBorde,
};

// ─── Funciones de celda ───────────────────────────────────────────────────────

function celdaEncabezado(texto, width, center = true) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLOR_HEADER, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: texto,
            bold: true,
            color: "FFFFFF",
            size: 20,
            font: FONT,
          }),
        ],
      }),
    ],
  });
}

function celdaDato(texto, width, center = false, bold = false) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: texto,
            size: 20,
            font: FONT,
            bold,
          }),
        ],
      }),
    ],
  });
}

function celdaTotal(texto, width, esEtiqueta = false, colorFondo = COLOR_TOTAL_BG) {
  return new TableCell({
    borders: bordersTotal,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: colorFondo, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: esEtiqueta ? AlignmentType.RIGHT : AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: texto,
            bold: true,
            color: "FFFFFF",
            size: 20,
            font: FONT,
          }),
        ],
      }),
    ],
  });
}

// ─── Generador principal ──────────────────────────────────────────────────────

/**
 * Genera un archivo .docx con la cotización y lo convierte a PDF.
 * @param {Object} datos - Datos extraídos por Claude
 * @returns {{ docxPath: string, pdfPath: string }}
 */
async function generarCotizacion(datos) {
  // ── Cálculos ────────────────────────────────────────────────────────────────
  const subtotal = datos.productos.reduce(
    (sum, p) => sum + p.cantidad * p.precioUnitario,
    0
  );
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  // ── Widths (DXA) ────────────────────────────────────────────────────────────
  // Márgenes: izq 720 + der 720 = 1440. Hoja Letter: 12240. Contenido: 10800
  const TW = 10800;
  const W_CANT = 900;
  const W_DESC = 6600;
  const W_PU = 1650;
  const W_IMP = 1650;

  // ── Filas de productos ──────────────────────────────────────────────────────
  const filasProductos = datos.productos.map(
    (p, i) =>
      new TableRow({
        children: [
          celdaDato(String(p.cantidad), W_CANT, true),
          celdaDato(p.descripcion, W_DESC),
          celdaDato(formatearMoneda(p.precioUnitario), W_PU, true),
          celdaDato(
            formatearMoneda(p.cantidad * p.precioUnitario),
            W_IMP,
            true
          ),
        ],
      })
  );

  // Rellenar hasta mínimo 5 filas vacías para estética
  const filasExtra = Math.max(0, 5 - datos.productos.length);
  for (let i = 0; i < filasExtra; i++) {
    filasProductos.push(
      new TableRow({
        children: [
          celdaDato("", W_CANT, true),
          celdaDato("", W_DESC),
          celdaDato("", W_PU, true),
          celdaDato("", W_IMP, true),
        ],
      })
    );
  }

  // ── Filas de totales ────────────────────────────────────────────────────────
  const anchoEtiqueta = W_CANT + W_DESC + W_PU;

  const filaTotales = (etiqueta, valor) =>
    new TableRow({
      children: [
        new TableCell({
          borders: { top: sinBorde, bottom: sinBorde, left: sinBorde, right: sinBorde },
          width: { size: anchoEtiqueta, type: WidthType.DXA },
          columnSpan: 3,
          children: [new Paragraph({ children: [] })],
        }),
        celdaTotal(etiqueta + "   " + formatearMoneda(valor), W_IMP, false),
      ],
    });

  // ── Tabla bancaria ──────────────────────────────────────────────────────────
  const filaBanco = (etiqueta, valor) =>
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 2500, type: WidthType.DXA },
          shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: etiqueta, bold: true, size: 18, font: FONT }),
              ],
            }),
          ],
        }),
        new TableCell({
          borders,
          width: { size: TW - 2500, type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: valor, size: 18, font: FONT }),
              ],
            }),
          ],
        }),
      ],
    });

  // ── Documento ───────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          // ── ENCABEZADO ───────────────────────────────────────────────────
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 60 },
            children: [
              new TextRun({
                text: "TEXTILES Y ACABADOS SAN FERNANDO S. A. DE C. V.",
                bold: true,
                size: 28,
                color: COLOR_HEADER,
                font: FONT,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_SUBHEADER, space: 4 },
            },
            children: [
              new TextRun({
                text: "COTIZACIÓN",
                bold: true,
                size: 36,
                color: COLOR_SUBHEADER,
                font: FONT,
              }),
            ],
          }),

          // ── FECHA Y CLIENTE ──────────────────────────────────────────────
          new Paragraph({
            spacing: { before: 120, after: 60 },
            children: [
              new TextRun({ text: "SANTIAGUITO ETLA, ", size: 20, font: FONT }),
              new TextRun({
                text: `a ${obtenerFechaActual()}`,
                size: 20,
                font: FONT,
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({ text: "AT'N: ", bold: true, size: 20, font: FONT }),
              new TextRun({
                text: datos.cliente || "A QUIEN CORRESPONDA",
                bold: true,
                size: 20,
                font: FONT,
                color: COLOR_SUBHEADER,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 60, after: 240 },
            children: [
              new TextRun({
                text: "RECIBA UN CORDIAL SALUDO. POR MEDIO DE LA PRESENTE LE ENVIAMOS LA SIGUIENTE COTIZACIÓN.",
                size: 18,
                font: FONT,
                italics: true,
              }),
            ],
          }),

          // ── TABLA DE PRODUCTOS ───────────────────────────────────────────
          new Table({
            width: { size: TW, type: WidthType.DXA },
            columnWidths: [W_CANT, W_DESC, W_PU, W_IMP],
            rows: [
              // Encabezado
              new TableRow({
                tableHeader: true,
                children: [
                  celdaEncabezado("CANT", W_CANT),
                  celdaEncabezado("DESCRIPCIÓN", W_DESC, false),
                  celdaEncabezado("P.U.", W_PU),
                  celdaEncabezado("IMPORTE", W_IMP),
                ],
              }),
              // Productos + filas vacías
              ...filasProductos,
              // Totales
              filaTotales("SUBTOTAL", subtotal),
              filaTotales("IVA (16%)", iva),
              filaTotales("TOTAL", total),
            ],
          }),

          // ── CONDICIONES ──────────────────────────────────────────────────
          new Paragraph({ spacing: { before: 240, after: 60 }, children: [] }),
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [
              new TextRun({ text: "CONDICIONES DE PAGO: ", bold: true, size: 18, font: FONT }),
              new TextRun({
                text: datos.condicionesPago || "50% DE ANTICIPO Y 50% CONTRA ENTREGA",
                size: 18,
                font: FONT,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [
              new TextRun({ text: "TIEMPO DE ENTREGA: ", bold: true, size: 18, font: FONT }),
              new TextRun({
                text: datos.tiempoEntrega || "15-20 DÍAS HÁBILES DESPUÉS DE CONFIRMAR TALLAS Y ANTICIPO",
                size: 18,
                font: FONT,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 0, after: 240 },
            children: [
              new TextRun({ text: "VIGENCIA DE COTIZACIÓN: ", bold: true, size: 18, font: FONT }),
              new TextRun({ text: "8 DÍAS NATURALES", size: 18, font: FONT }),
            ],
          }),

          // ── DATOS BANCARIOS ──────────────────────────────────────────────
          new Paragraph({
            spacing: { before: 0, after: 100 },
            children: [
              new TextRun({
                text: "DATOS BANCARIOS",
                bold: true,
                size: 20,
                color: COLOR_SUBHEADER,
                font: FONT,
              }),
            ],
          }),
          new Table({
            width: { size: TW, type: WidthType.DXA },
            columnWidths: [2500, TW - 2500],
            rows: [
              filaBanco("BANCO:", "BANCO MERCANTIL DEL NORTE, S.A. (BANORTE)"),
              filaBanco("RFC:", "TAS091009FM7"),
              filaBanco("No. DE CUENTA:", "0637813561"),
              filaBanco("TRANSFERENCIA:", "072610006378135618"),
            ],
          }),

          // ── FIRMA ────────────────────────────────────────────────────────
          new Paragraph({ spacing: { before: 480, after: 0 }, children: [] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 60 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "555555", space: 4 },
            },
            children: [
              new TextRun({ text: "ATENTAMENTE", size: 18, font: FONT }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 0 },
            children: [
              new TextRun({ text: "ALBERTO VIVAS RIVERA", bold: true, size: 20, font: FONT }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [
              new TextRun({
                text: "Textiles y Acabados San Fernando S.A. de C.V.",
                size: 18,
                font: FONT,
                italics: true,
                color: "888888",
              }),
            ],
          }),

          // ── NOTAS ADICIONALES (solo si hay) ─────────────────────────────
          ...(datos.notas
            ? [
                new Paragraph({ spacing: { before: 240, after: 60 }, children: [] }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "NOTAS: ", bold: true, size: 18, font: FONT }),
                    new TextRun({ text: datos.notas, size: 18, font: FONT, italics: true }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  // ── Guardar DOCX ────────────────────────────────────────────────────────────
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const docxPath = path.join(tmpDir, `cotizacion_${timestamp}.docx`);
  const pdfPath = path.join(tmpDir, `cotizacion_${timestamp}.pdf`);

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);

  // ── Convertir a PDF con LibreOffice ─────────────────────────────────────────
  execSync(`soffice --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`, {
    timeout: 30000,
  });

  return { docxPath, pdfPath };
}

module.exports = { generarCotizacion };
