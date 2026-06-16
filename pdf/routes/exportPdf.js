'use strict';
const { Router }       = require('express');
const { fork }         = require('child_process');
const path             = require('path');

const router      = Router();
const WORKER_PATH = path.resolve(__dirname, '../workers/pageForkWorker.js');

function runPageInFork(page, canvasConfig, cmykConfig) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER_PATH, [], { silent: false });

    let settled = false;

    child.on('message', (msg) => {
      if (settled) return;
      settled = true;
      if (msg.success) resolve(msg.result);
      else reject(new Error(msg.error));
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    // exit antes de recibir message → crash nativo (SIGSEGV, OOM, etc.)
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Proceso terminó inesperadamente: código=${code} señal=${signal}`));
    });

    child.send({ page, canvasConfig, cmykConfig });
  });
}

router.post('/export-pdf', async (req, res) => {
  const { canvasConfig, cmykConfig, pages } = req.body;

  if (!canvasConfig || !pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'canvasConfig y pages son requeridos' });
  }

  try {
    // Procesamiento secuencial: una página a la vez para controlar el uso de memoria
    const results = [];
    for (const page of pages) {
      const result = await runPageInFork(page, canvasConfig, cmykConfig);
      results.push(result);
    }

    results.sort((a, b) => a.pageIndex - b.pageIndex);
    res.json({ pages: results });
  } catch (err) {
    console.error('[export-pdf] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
