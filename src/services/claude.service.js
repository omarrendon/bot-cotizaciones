// src/services/claude.service.js
// Servicio para extraer datos de cotización desde imágenes usando Claude

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Extrae los datos de cotización de una imagen usando Claude Vision.
 * @param {Buffer} imageBuffer - Buffer de la imagen recibida por Telegram
 * @param {string} mimeType - Tipo MIME de la imagen (image/jpeg, image/png, etc.)
 * @returns {Object} Datos estructurados de la cotización
 */
async function extraerDatosDeCotizacion(imageBuffer, mimeType = "image/jpeg") {
  const base64Image = imageBuffer.toString("base64");

  const prompt = `Eres un asistente especializado en leer cotizaciones escritas a mano o en papel.

Analiza esta imagen y extrae TODOS los datos de la cotización. Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin texto adicional, sin explicaciones, sin markdown:

{
  "cliente": "nombre del cliente o empresa destinataria (string, vacío si no se ve)",
  "fecha": "fecha de la cotización en formato DD/MM/YYYY (string, usa la fecha de hoy si no se ve)",
  "productos": [
    {
      "cantidad": número entero,
      "descripcion": "descripción completa del producto o servicio",
      "precioUnitario": número decimal
    }
  ],
  "condicionesPago": "condiciones de pago si se mencionan (string, vacío si no hay)",
  "tiempoEntrega": "tiempo de entrega si se menciona (string, vacío si no hay)",
  "notas": "cualquier nota adicional relevante (string, vacío si no hay)"
}

REGLAS IMPORTANTES:
- cantidad y precioUnitario deben ser NÚMEROS, no strings
- Si un precio tiene comas como separador de miles (ej: 1,500), conviértelo a número (1500)
- Si no puedes leer algún valor con certeza, usa 0 para números y "" para strings
- NO incluyas subtotal, IVA ni total, esos se calculan automáticamente
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
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  const rawText = response.content[0].text.trim();

  // Limpiar posibles backticks de markdown por seguridad
  const cleanText = rawText.replace(/```json|```/g, "").trim();

  const datos = JSON.parse(cleanText);

  // Validaciones básicas
  if (!datos.productos || !Array.isArray(datos.productos)) {
    throw new Error(
      "No se pudieron identificar productos en la imagen. Asegúrate de que la imagen sea legible."
    );
  }

  if (datos.productos.length === 0) {
    throw new Error(
      "No se encontraron productos en la imagen. Verifica que la cotización esté completa."
    );
  }

  return datos;
}

/**
 * Extrae datos de cotización desde un mensaje de texto libre usando el catálogo de precios.
 * Usa Claude para hacer fuzzy matching entre el texto informal del usuario y los productos del catálogo.
 * @param {string} mensaje - Mensaje de texto del usuario (ej: "Cliente Omar, 5 chamarras swat")
 * @returns {Object} Datos estructurados de la cotización con precios del catálogo
 */
async function extraerDatosDeCotizacionDeTexto(mensaje) {
  const { getCatalogoComoTexto } = require("./catalogo.service");
  const catalogoTexto = getCatalogoComoTexto();

  const hoy = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const prompt = `Eres un asistente de cotizaciones para una empresa de uniformes y equipamiento policial.

CATÁLOGO OFICIAL DE PRODUCTOS:
${catalogoTexto}

SOLICITUD DEL USUARIO:
${mensaje}

Tu tarea:
1. Extrae el nombre del cliente del mensaje (puede venir como "Cliente X", "Para X", o simplemente al inicio)
2. Identifica los productos solicitados y sus cantidades
3. Para cada producto, encuentra el que mejor coincida en el catálogo aunque el usuario use nombres informales, abreviados o coloquiales
4. Usa la descripción completa del catálogo y el precio oficial del catálogo

Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown, sin explicaciones:
{
  "cliente": "nombre del cliente",
  "fecha": "${hoy}",
  "productos": [
    {
      "cantidad": número entero,
      "descripcion": "descripción completa exacta del catálogo",
      "precioUnitario": número decimal
    }
  ],
  "condicionesPago": "",
  "tiempoEntrega": "",
  "notas": ""
}

Si el mensaje NO parece una solicitud de cotización (es un saludo, pregunta genérica, etc.), devuelve exactamente: {"error": "no_es_cotizacion"}`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content[0].text.trim();
  const cleanText = rawText.replace(/```json|```/g, "").trim();
  const datos = JSON.parse(cleanText);

  if (datos.error === "no_es_cotizacion") {
    throw new Error("no_es_cotizacion");
  }

  if (!datos.productos || !Array.isArray(datos.productos)) {
    throw new Error(
      "No se pudieron identificar productos en el mensaje."
    );
  }

  if (datos.productos.length === 0) {
    throw new Error(
      "No se encontraron productos en el mensaje. Verifica que hayas incluido al menos un producto."
    );
  }

  return datos;
}

module.exports = { extraerDatosDeCotizacion, extraerDatosDeCotizacionDeTexto };
