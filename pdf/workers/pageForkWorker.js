'use strict';
const { generatePagePdf } = require('../services/pdfGenerator');

process.on('message', async ({ page, canvasConfig, cmykConfig }) => {
  try {
    const result = await generatePagePdf(page, canvasConfig, cmykConfig);
    // Esperar a que el mensaje sea entregado antes de salir (process.send es asíncrono)
    process.send({ success: true, result }, () => process.exit(0));
  } catch (err) {
    process.send({ success: false, error: err.message, stack: err.stack }, () => process.exit(1));
  }
});
