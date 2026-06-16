require("dotenv").config();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "❌ Falta ANTHROPIC_API_KEY en el archivo .env, por favor añádelo para continuar.",
  );
  process.exit(1);
}

require("./index");
require("./notas-pago.bot");

// ─── HTTP Server para export-pdf ────────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const exportPdfRoute = require("../pdf/routes/exportPdf");

const app = express();
const MAX_MB = parseInt(process.env.MAX_PAYLOAD_MB || "400", 10);
app.use(express.json({ limit: `${MAX_MB}mb` }));
app.use(cors({ origin: process.env.FRONTEND_URL, methods: ["POST"] }));
// Nota: Para producción, es recomendable especificar el FRONTEND_URL en lugar de usar '*', para mejorar la seguridad.
// app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['POST'] }));
app.use("/api", exportPdfRoute);

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => console.log(`HTTP server on port ${PORT}`));
