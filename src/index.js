// src/index.js
// Bot principal de Telegram para cotizaciones automáticas

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const { extraerDatosDeCotizacion, extraerDatosDeCotizacionDeTexto } = require("./services/claude.service");
const { generarCotizacion } = require("./services/documento.service");
const { inicializarCatalogo } = require("./services/catalogo.service");

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

// ─── Inicializar catálogo de productos ───────────────────────────────────────
inicializarCatalogo().catch((err) => {
  console.error("❌ Error al inicializar catálogo:", err.message);
});

console.log("🤖 Bot de cotizaciones iniciado correctamente");
console.log("📱 Esperando mensajes en Telegram...\n");

// ─── Comando /start ───────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const nombre = msg.from.first_name || "amigo";
  bot.sendMessage(
    msg.chat.id,
    `👋 ¡Hola, ${nombre}!\n\n` +
      `Soy el bot de cotizaciones de *Textiles y Acabados San Fernando*.\n\n` +
      `Puedo generar cotizaciones de *dos maneras*:\n\n` +
      `📸 *Por imagen:* Toma una foto de tus apuntes y envíamela\n\n` +
      `✏️ *Por texto:* Escríbeme directamente el pedido, por ejemplo:\n` +
      `_Cliente Omar Rendón, 5 chamarras swat_\n\n` +
      `✅ Calculo subtotal, IVA (16%) y total automáticamente.\n\n` +
      `¡Mándame tu primer pedido cuando quieras!`,
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
      `*Por imagen 📸*\n` +
      `• Escribe claro y con buena iluminación 💡\n` +
      `• Incluye: nombre del cliente, cantidad, descripción y precio\n` +
      `• La foto debe estar enfocada y sin sombras\n\n` +
      `*Por texto ✏️*\n` +
      `• Escribe el nombre del cliente y los productos con sus cantidades\n` +
      `• Ejemplo: _Cliente Juan Pérez, 10 polos manga corta, 3 gorras ripstop_\n` +
      `• Los precios se toman automáticamente de la lista oficial\n\n` +
      `*¿Qué hace el bot automáticamente?*\n` +
      `✅ Lee los datos de tu imagen o texto\n` +
      `✅ Busca los productos en la lista de precios\n` +
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

// ─── Mensajes de texto: intenta generar cotización ───────────────────────────
bot.on("text", async (msg) => {
  if (msg.text.startsWith("/")) return; // Ignorar comandos (ya manejados arriba)

  const chatId = msg.chat.id;
  let mensajeEstado = null;

  try {
    mensajeEstado = await bot.sendMessage(
      chatId,
      "✏️ Procesando tu solicitud...\n_Buscando productos en el catálogo._",
      { parse_mode: "Markdown" }
    );

    const datos = await extraerDatosDeCotizacionDeTexto(msg.text);

    await bot.editMessageText(
      "📄 Generando el PDF de la cotización...",
      { chat_id: chatId, message_id: mensajeEstado.message_id }
    );

    const { pdfPath, cotizacionId } = await generarCotizacion(datos);

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
      `📦 *Productos:*\n${resumenProductos}\n\n` +
      `💰 *Subtotal:* $${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}\n` +
      `💰 *IVA (16%):* $${iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}\n` +
      `💰 *Total:* $${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

    await bot.deleteMessage(chatId, mensajeEstado.message_id);
    await bot.sendMessage(chatId, resumenTexto, { parse_mode: "Markdown" });

    await bot.sendDocument(chatId, pdfPath, {
      caption: `📄 ${cotizacionId}${datos.cliente ? ` · ${datos.cliente}` : ""} · ${new Date().toLocaleDateString("es-MX")}`,
    });

    fs.unlinkSync(pdfPath);
    const docxPath = pdfPath.replace(".pdf", ".docx");
    if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath);

    console.log(`✅ Cotización por texto generada para chat ${chatId} - ${datos.cliente || "Sin cliente"}`);
  } catch (error) {
    if (mensajeEstado) {
      try {
        await bot.deleteMessage(chatId, mensajeEstado.message_id);
      } catch (_) {}
    }

    if (error.message === "no_es_cotizacion") {
      await bot.sendMessage(
        chatId,
        "✏️ Puedes escribirme el pedido directamente, por ejemplo:\n\n" +
          "_Cliente Omar Rendón, 5 chamarras swat_\n\n" +
          "También puedes enviarme una 📸 *foto* con los datos escritos.\n\n" +
          "Usa /ayuda para más instrucciones.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    console.error("❌ Error procesando texto:", error.message);

    let mensajeError = "❌ Ocurrió un error al procesar tu solicitud.\n\n";
    if (
      error.message.includes("No se pudieron identificar productos") ||
      error.message.includes("No se encontraron productos")
    ) {
      mensajeError += error.message;
    } else {
      mensajeError +=
        "Asegúrate de incluir el nombre del cliente y al menos un producto con cantidad.\n\n" +
        "Ejemplo: _Cliente Juan Pérez, 10 polos manga corta_";
    }

    await bot.sendMessage(chatId, mensajeError, { parse_mode: "Markdown" });
  }
});

// ─── Manejo de errores globales del bot ──────────────────────────────────────
bot.on("polling_error", (error) => {
  console.error("❌ Error de polling:", error.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promesa no manejada:", reason);
});
