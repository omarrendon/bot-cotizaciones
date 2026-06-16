'use strict';
const { workerData, parentPort } = require('worker_threads');
const { generatePagePdf } = require('../services/pdfGenerator');

(async () => {
  try {
    const { page, canvasConfig, cmykConfig } = workerData;
    const result = await generatePagePdf(page, canvasConfig, cmykConfig);
    parentPort.postMessage({ success: true, result });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err.message, stack: err.stack });
  }
})();
