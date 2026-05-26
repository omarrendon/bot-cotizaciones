require("dotenv").config();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "❌ Falta ANTHROPIC_API_KEY en el archivo .env, por favor añádelo para continuar.",
  );
  process.exit(1);
}

require("./index");
require("./notas-pago.bot");
