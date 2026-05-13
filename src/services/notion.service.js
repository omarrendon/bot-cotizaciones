const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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
      "Importe con Letra": {
        rich_text: [{ text: { content: datos.importe_con_letra || "" } }],
      },
      "Status de Pago": {
        select: { name: "Pendiente" },
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
    ],
  });

  return page.url;
}

module.exports = { registrarNota };
