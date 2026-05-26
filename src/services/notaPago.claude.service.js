const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extraerDatosDeNotaPago(imageBuffer, mimeType = "image/jpeg") {
  const base64Image = imageBuffer.toString("base64");
  const hoy = new Date().toISOString().split("T")[0];

  const prompt = `Eres un asistente especializado en leer notas de pago de la empresa "OMAR VIVAS" (empresa de uniformes y textiles).

La nota tiene este formato:
- Encabezado: "OMAR VIVAS" con número de teléfono
- NOTA: número de folio (ej: 0071)
- FECHA: fecha de la nota
- NOMBRE: nombre del cliente o empresa
- DIRECCIÓN: dirección del cliente (puede estar vacía)
- Tabla con columnas: CANT | DESCRIPCIÓN | P.UNIT | IMPORTE
- IMPORTE CON LETRA: el total escrito en palabras
- ANTICIPO $: monto de anticipo si aplica
- DEBE $: saldo pendiente si aplica
- TOTAL $: monto total

Analiza la imagen y extrae TODOS los datos visibles. Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin texto adicional, sin markdown:

{
  "folio": "número de nota como string (ej: '0071', vacío si no se ve)",
  "fecha": "fecha en formato YYYY-MM-DD (usa ${hoy} si no se puede leer)",
  "cliente": "nombre del cliente o empresa",
  "direccion": "dirección si aparece, vacío si no",
  "productos": [
    {
      "cantidad": número entero,
      "descripcion": "descripción completa del producto",
      "precio_unitario": número decimal,
      "importe": número decimal
    }
  ],
  "importe_con_letra": "el total escrito en palabras, vacío si no aparece",
  "anticipo": número decimal o 0 si no hay,
  "debe": número decimal o 0 si no hay,
  "total": número decimal,
  "estado_pago": "uno de: 'Pagado', 'Cancelada', 'Pendiente'"
}

REGLAS:
- cantidad, precio_unitario, importe, anticipo, debe y total deben ser NÚMEROS, no strings
- Si un número tiene comas como separador de miles (ej: 12,005), conviértelo a número (12005)
- La fecha debe estar en formato YYYY-MM-DD; si el año es de 2 dígitos (ej: 26), interpreta como 20XX (2026)
- folio debe ser string
- Para estado_pago: si hay un sello o texto diagonal que diga "PAGADO" → "Pagado"; si dice "CANCELADA" o "CANCELADO" → "Cancelada"; si no hay ningún sello → "Pendiente"
- Devuelve SOLO el JSON, sin ningún texto antes o después`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: base64Image },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const rawText = response.content[0].text.trim();
  const cleanText = rawText.replace(/```json|```/g, "").trim();
  const datos = JSON.parse(cleanText);

  if (!datos.productos || !Array.isArray(datos.productos) || datos.productos.length === 0) {
    throw new Error("No se pudieron identificar los productos en la nota de pago.");
  }

  if (!datos.total || datos.total === 0) {
    throw new Error("No se pudo leer el total de la nota de pago.");
  }

  return datos;
}

module.exports = { extraerDatosDeNotaPago };
