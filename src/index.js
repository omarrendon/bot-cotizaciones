// src/index.js
// Bot principal de Telegram para cotizaciones automáticas

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const { extraerDatosDeCotizacion } = require("./services/claude.service");
const { generarCotizacion } = require("./services/documento.service");

// ─── Validación de variables de entorno ──────────────────────────────────────
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ Falta TELEGRAM_BOT_TOKEN en el archivo .env");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ Falta ANTHROPIC_API_KEY en el archivo .env");
  process.exit(1);
}

// ─── Inicializar bot ──────────────────────────────────────────────────────────
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log("🤖 Bot de cotizaciones iniciado correctamente");
console.log("📱 Esperando imágenes en Telegram...\n");

// ─── Comando /start ───────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const nombre = msg.from.first_name || "amigo";
  bot.sendMessage(
    msg.chat.id,
    `👋 ¡Hola, ${nombre}!\n\n` +
      `Soy el bot de cotizaciones de *Textiles y Acabados San Fernando*.\n\n` +
      `📸 *¿Cómo funciono?*\n` +
      `1. Toma una foto de tus apuntes con la cotización (a mano o impresa)\n` +
      `2. Envíamela aquí directamente\n` +
      `3. En segundos te devuelvo el PDF listo para enviar al cliente\n\n` +
      `✅ Me aseguro de leer: cliente, productos, cantidades y precios.\n\n` +
      `¡Mándame tu primera imagen cuando quieras!`,
    { parse_mode: "Markdown" }
  );
});

// ─── Comando /ayuda ───────────────────────────────────────────────────────────
bot.onText(/\/ayuda/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📖 *Ayuda - Bot de Cotizaciones*\n\n` +
      `*Comandos disponibles:*\n` +
      `/start - Bienvenida e instrucciones\n` +
      `/ayuda - Esta pantalla de ayuda\n\n` +
      `*Tips para mejores resultados:*\n` +
      `• Escribe claro y con buena iluminación 💡\n` +
      `• Incluye: nombre del cliente, cantidad, descripción y precio de cada producto\n` +
      `• La foto debe estar enfocada y sin sombras\n` +
      `• Puedes mandar foto de papel, pizarrón o pantalla\n\n` +
      `*¿Qué hace el bot automáticamente?*\n` +
      `✅ Lee los datos de tu imagen\n` +
      `✅ Calcula subtotal, IVA (16%) y total\n` +
      `✅ Genera el PDF con el formato oficial\n` +
      `✅ Te lo envía en el mismo chat`,
    { parse_mode: "Markdown" }
  );
});

// ─── Procesamiento de imágenes ────────────────────────────────────────────────
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  let mensajeEstado = null;

  try {
    // Enviar mensaje de espera
    mensajeEstado = await bot.sendMessage(
      chatId,
      "📸 Imagen recibida. Analizando con IA...\n_Esto puede tomar unos segundos._",
      { parse_mode: "Markdown" }
    );

    // ── Descargar la imagen (tomar la de mayor resolución) ──────────────────
    const fotos = msg.photo;
    const mejorFoto = fotos[fotos.length - 1]; // La última es la de mayor resolución
    const fileInfo = await bot.getFile(mejorFoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(response.data);

    // Detectar MIME type según extensión
    const ext = path.extname(fileInfo.file_path).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const mimeType = mimeMap[ext] || "image/jpeg";

    // ── Actualizar estado ──────────────────────────────────────────────────
    await bot.editMessageText(
      "🧠 Extrayendo datos de la cotización...",
      { chat_id: chatId, message_id: mensajeEstado.message_id }
    );

    // ── Extraer datos con Claude ───────────────────────────────────────────
    const datos = await extraerDatosDeCotizacion(imageBuffer, mimeType);

    // ── Actualizar estado ──────────────────────────────────────────────────
    await bot.editMessageText(
      "📄 Generando el PDF de la cotización...",
      { chat_id: chatId, message_id: mensajeEstado.message_id }
    );

    // ── Generar documentos ─────────────────────────────────────────────────
    const { pdfPath, cotizacionId } = await generarCotizacion(datos);

    // ── Construir resumen de lo detectado ──────────────────────────────────
    const resumenProductos = datos.productos
      .map(
        (p) =>
          `• ${p.cantidad}x ${p.descripcion} @ $${Number(p.precioUnitario).toLocaleString("es-MX")}`
      )
      .join("\n");

    const subtotal = datos.productos.reduce(
      (s, p) => s + p.cantidad * p.precioUnitario,
      0
    );
    const iva = subtotal * 0.16;
    const total = subtotal + iva;

    const resumenTexto =
      `✅ *Cotización generada exitosamente*\n\n` +
      `👤 *Cliente:* ${datos.cliente || "No especificado"}\n\n` +
      `📦 *Productos detectados:*\n${resumenProductos}\n\n` +
      `💰 *Subtotal:* $${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}\n` +
      `💰 *IVA (16%):* $${iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}\n` +
      `💰 *Total:* $${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

    // ── Eliminar mensaje de estado y enviar resultado ──────────────────────
    await bot.deleteMessage(chatId, mensajeEstado.message_id);
    await bot.sendMessage(chatId, resumenTexto, { parse_mode: "Markdown" });

    // ── Enviar PDF ─────────────────────────────────────────────────────────
    await bot.sendDocument(chatId, pdfPath, {
      caption: `📄 ${cotizacionId}${datos.cliente ? ` · ${datos.cliente}` : ""} · ${new Date().toLocaleDateString("es-MX")}`,
    });

    // ── Limpiar archivos temporales ────────────────────────────────────────
    fs.unlinkSync(pdfPath);
    // El .docx se puede eliminar también si existe
    const docxPath = pdfPath.replace(".pdf", ".docx");
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath);

    console.log(`✅ Cotización generada para chat ${chatId} - ${datos.cliente || "Sin cliente"}`);
  } catch (error) {
    console.error("❌ Error procesando imagen:", error.message);

    // Eliminar mensaje de espera si existe
    if (mensajeEstado) {
      try {
        await bot.deleteMessage(chatId, mensajeEstado.message_id);
      } catch (_) {}
    }

    // Mensaje de error amigable al usuario
    let mensajeError =
      "❌ Ocurrió un error al procesar tu imagen.\n\n";

    if (error.message.includes("No se pudieron identificar productos")) {
      mensajeError += error.message;
    } else if (error.message.includes("No se encontraron productos")) {
      mensajeError += error.message;
    } else {
      mensajeError +=
        "Por favor verifica que:\n" +
        "• La imagen esté enfocada y bien iluminada\n" +
        "• Los datos sean legibles\n" +
        "• Incluya al menos un producto con cantidad y precio\n\n" +
        "Intenta de nuevo con una foto más clara. 📸";
    }

    await bot.sendMessage(chatId, mensajeError);
  }
});

// ─── Manejo de documentos (por si mandan foto como archivo) ──────────────────
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const mime = msg.document?.mime_type || "";

  if (!mime.startsWith("image/")) {
    await bot.sendMessage(
      chatId,
      "⚠️ Solo proceso *imágenes* de cotizaciones.\n\nManda la foto directamente (no como archivo adjunto).",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Si es imagen enviada como documento, procesarla igual
  bot.emit("photo", {
    ...msg,
    photo: [{ file_id: msg.document.file_id, file_size: msg.document.file_size }],
  });
});

// ─── Mensajes de texto sin imagen ────────────────────────────────────────────
bot.on("text", (msg) => {
  if (msg.text.startsWith("/")) return; // Ignorar comandos (ya manejados arriba)

  bot.sendMessage(
    msg.chat.id,
    "📸 Para generar una cotización, envíame una *foto* con los datos escritos.\n\n" +
      "Usa /ayuda para ver instrucciones completas.",
    { parse_mode: "Markdown" }
  );
});

// ─── Manejo de errores globales del bot ──────────────────────────────────────
bot.on("polling_error", (error) => {
  console.error("❌ Error de polling:", error.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promesa no manejada:", reason);
});
