require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const path = require("path");

const { extraerDatosDeNotaPago } = require("./services/notaPago.claude.service");
const { registrarNota } = require("./services/notion.service");

if (!process.env.TELEGRAM_NOTAS_TOKEN) {
  console.error("❌ Falta TELEGRAM_NOTAS_TOKEN en el archivo .env");
  process.exit(1);
}

const bot = new TelegramBot(process.env.TELEGRAM_NOTAS_TOKEN, { polling: true });

console.log("📋 Bot de notas de pago iniciado correctamente");
console.log("📱 Esperando imágenes de notas en Telegram...\n");

bot.onText(/\/start/, (msg) => {
  const nombre = msg.from.first_name || "amigo";
  bot.sendMessage(
    msg.chat.id,
    `👋 ¡Hola, ${nombre}!\n\n` +
      `Soy el bot de *Notas de Pago* de Omar Vivas.\n\n` +
      `📸 Envíame una foto de la nota de pago y yo:\n` +
      `• Extraigo todos los datos automáticamente\n` +
      `• Registro la nota en Notion\n` +
      `• Te mando el link directo al registro\n\n` +
      `¡Mándame la foto cuando quieras!`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/ayuda/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📖 *Ayuda - Bot de Notas de Pago*\n\n` +
      `*¿Cómo funciona?*\n` +
      `1. Toma una foto clara de la nota de pago\n` +
      `2. Envíala en este chat\n` +
      `3. La IA extrae los datos automáticamente\n` +
      `4. El registro se guarda en Notion\n\n` +
      `*Tips para una buena foto:*\n` +
      `• Buena iluminación 💡\n` +
      `• La nota completa en el encuadre\n` +
      `• Sin sombras ni reflejos\n` +
      `• Foto enfocada y sin movimiento\n\n` +
      `*Comandos:*\n` +
      `/start - Bienvenida\n` +
      `/ayuda - Esta pantalla`,
    { parse_mode: "Markdown" }
  );
});

async function procesarImagenNota(msg) {
  const chatId = msg.chat.id;
  let mensajeEstado = null;

  try {
    mensajeEstado = await bot.sendMessage(
      chatId,
      "📸 Imagen recibida. Analizando nota de pago...\n_Esto puede tomar unos segundos._",
      { parse_mode: "Markdown" }
    );

    const fotos = msg.photo;
    const mejorFoto = fotos[fotos.length - 1];
    const fileInfo = await bot.getFile(mejorFoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_NOTAS_TOKEN}/${fileInfo.file_path}`;

    const respuesta = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(respuesta.data);

    const ext = path.extname(fileInfo.file_path).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const mimeType = mimeMap[ext] || "image/jpeg";

    await bot.editMessageText(
      "🧠 Extrayendo datos de la nota...",
      { chat_id: chatId, message_id: mensajeEstado.message_id }
    );

    const datos = await extraerDatosDeNotaPago(imageBuffer, mimeType);

    console.log("─────────────────────────────────────────");
    console.log("📋 DATOS EXTRAÍDOS DE LA NOTA DE PAGO:");
    console.log(JSON.stringify(datos, null, 2));
    console.log("─────────────────────────────────────────");

    await bot.editMessageText(
      "💾 Guardando en Notion...",
      { chat_id: chatId, message_id: mensajeEstado.message_id }
    );

    const notionUrl = await registrarNota(datos);

    await bot.deleteMessage(chatId, mensajeEstado.message_id);
    await bot.sendMessage(
      chatId,
      `✅ *Nota registrada en Notion*\n\n` +
        `📋 *Folio:* ${datos.folio || "N/A"}\n` +
        `📅 *Fecha:* ${datos.fecha}\n` +
        `👤 *Cliente:* ${datos.cliente || "No especificado"}\n` +
        `💰 *Total:* $${Number(datos.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}\n\n` +
        `🔗 [Ver en Notion](${notionUrl})`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );

    console.log(
      `✅ Nota ${datos.folio || "S/N"} guardada en Notion — Cliente: ${datos.cliente || "Sin cliente"} — Total: $${datos.total}\n   ${notionUrl}`
    );
  } catch (error) {
    console.error("❌ Error procesando nota:", error.message);

    if (mensajeEstado) {
      try {
        await bot.deleteMessage(chatId, mensajeEstado.message_id);
      } catch (_) {}
    }

    let mensajeError = "❌ Ocurrió un error al procesar la nota.\n\n";

    if (
      error.message.includes("No se pudieron identificar") ||
      error.message.includes("No se pudo leer el total")
    ) {
      mensajeError += error.message;
    } else {
      mensajeError +=
        "Verifica que:\n" +
        "• La foto esté bien iluminada y enfocada\n" +
        "• Se vea la nota completa\n" +
        "• Los datos sean legibles\n\n" +
        "Intenta de nuevo con una foto más clara. 📸";
    }

    await bot.sendMessage(chatId, mensajeError);
  }
}

bot.on("photo", procesarImagenNota);

bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const mime = msg.document?.mime_type || "";

  if (!mime.startsWith("image/")) {
    await bot.sendMessage(
      chatId,
      "⚠️ Solo proceso *imágenes* de notas de pago.\n\nManda la foto directamente (no como archivo adjunto).",
      { parse_mode: "Markdown" }
    );
    return;
  }

  bot.emit("photo", {
    ...msg,
    photo: [{ file_id: msg.document.file_id, file_size: msg.document.file_size }],
  });
});

bot.on("text", async (msg) => {
  if (msg.text.startsWith("/")) return;
  await bot.sendMessage(
    msg.chat.id,
    "📸 Para registrar una nota de pago, envíame una *foto* de la nota.\n\nUsa /ayuda para ver instrucciones.",
    { parse_mode: "Markdown" }
  );
});

bot.on("polling_error", (error) => {
  console.error("❌ Error de polling (notas-pago):", error.message);
});
