const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ─── Notas de pago ────────────────────────────────────────────────────────────

async function registrarNota(datos) {
  const databaseId = process.env.NOTION_DATABASE_ID;

  const headerRow = {
    type: "table_row",
    table_row: {
      cells: [
        [{ type: "text", text: { content: "Cant" } }],
        [{ type: "text", text: { content: "Descripción" } }],
        [{ type: "text", text: { content: "P. Unit" } }],
        [{ type: "text", text: { content: "Importe" } }],
      ],
    },
  };

  const productRows = datos.productos.map((p) => ({
    type: "table_row",
    table_row: {
      cells: [
        [{ type: "text", text: { content: String(p.cantidad) } }],
        [{ type: "text", text: { content: p.descripcion } }],
        [{ type: "text", text: { content: `$${Number(p.precio_unitario).toLocaleString("es-MX")}` } }],
        [{ type: "text", text: { content: `$${Number(p.importe).toLocaleString("es-MX")}` } }],
      ],
    },
  }));

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Folio: {
        title: [{ text: { content: datos.folio || "Sin folio" } }],
      },
      Fecha: {
        date: { start: datos.fecha },
      },
      Cliente: {
        rich_text: [{ text: { content: datos.cliente || "" } }],
      },
      Dirección: {
        rich_text: [{ text: { content: datos.direccion || "" } }],
      },
      Total: {
        number: datos.total || 0,
      },
      Anticipo: {
        number: datos.anticipo || 0,
      },
      Debe: {
        number: datos.debe || 0,
      },
      "Importe con letra": {
        rich_text: [{ text: { content: datos.importe_con_letra || "" } }],
      },
      "Estado de pago": {
        status: { name: datos.pagado ? "Pagado" : "Pendiente" },
      },
      "Fecha de registro": {
        date: { start: new Date().toISOString().split("T")[0] },
      },
    },
    children: [
      {
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Productos" } }],
        },
      },
      {
        type: "table",
        table: {
          table_width: 4,
          has_column_header: true,
          has_row_header: false,
          children: [headerRow, ...productRows],
        },
      },
    ],
  });

  return page.url;
}

// ─── Cotizaciones ─────────────────────────────────────────────────────────────

async function subirArchivo(pdfPath) {
  const filename = path.basename(pdfPath);
  const fileBuffer = fs.readFileSync(pdfPath);

  // Paso 1: crear sesión de subida (single-part para PDFs pequeños)
  const upload = await notion.fileUploads.create({
    mode: "single_part",
    filename,
    content_type: "application/pdf",
  });

  // Paso 2: subir el archivo binario
  await notion.fileUploads.send({
    file_upload_id: upload.id,
    file: { data: fileBuffer, filename },
    part_number: 1,
  });

  return upload.id;
}

async function registrarCotizacion(datos, cotizacionId, pdfUploadId) {
  const databaseId = process.env.NOTION_COTIZACIONES_DATABASE_ID;

  const subtotal = datos.productos.reduce(
    (sum, p) => sum + p.cantidad * p.precioUnitario,
    0
  );
  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  const headerRow = {
    type: "table_row",
    table_row: {
      cells: [
        [{ type: "text", text: { content: "Cant" } }],
        [{ type: "text", text: { content: "Descripción" } }],
        [{ type: "text", text: { content: "P. Unit" } }],
        [{ type: "text", text: { content: "Importe" } }],
      ],
    },
  };

  const productRows = datos.productos.map((p) => ({
    type: "table_row",
    table_row: {
      cells: [
        [{ type: "text", text: { content: String(p.cantidad) } }],
        [{ type: "text", text: { content: p.descripcion } }],
        [
          {
            type: "text",
            text: {
              content: `$${Number(p.precioUnitario).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
            },
          },
        ],
        [
          {
            type: "text",
            text: {
              content: `$${Number(p.cantidad * p.precioUnitario).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
            },
          },
        ],
      ],
    },
  }));

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Folio: {
        title: [{ text: { content: cotizacionId } }],
      },
      Fecha: {
        date: { start: datos.fecha || new Date().toISOString().split("T")[0] },
      },
      Cliente: {
        rich_text: [{ text: { content: datos.cliente || "" } }],
      },
      Subtotal: {
        number: subtotal,
      },
      IVA: {
        number: iva,
      },
      Total: {
        number: total,
      },
      "Condiciones de Pago": {
        rich_text: [{ text: { content: datos.condicionesPago || "" } }],
      },
      "Tiempo de Entrega": {
        rich_text: [{ text: { content: datos.tiempoEntrega || "" } }],
      },
      "Fecha de Registro": {
        date: { start: new Date().toISOString().split("T")[0] },
      },
    },
    children: [
      {
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Productos" } }],
        },
      },
      {
        type: "table",
        table: {
          table_width: 4,
          has_column_header: true,
          has_row_header: false,
        },
        children: [headerRow, ...productRows],
      },
      {
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "PDF de Cotización" } }],
        },
      },
      {
        type: "file",
        file: {
          type: "file_upload",
          file_upload: { id: pdfUploadId },
        },
      },
    ],
  });

  return page.url;
}

module.exports = { registrarNota, subirArchivo, registrarCotizacion };
