'use strict';
const { Router }       = require('express');
const { fork }         = require('child_process');
const path             = require('path');

const router      = Router();
const WORKER_PATH = path.resolve(__dirname, '../workers/pageForkWorker.js');

function runPageInFork(page, canvasConfig, cmykConfig) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER_PATH, [], { silent: false });
    const t0 = Date.now();

    let settled = false;

    child.on('message', (msg) => {
      if (settled) return;
      settled = true;
      if (msg.success) {
        console.log(`[export-pdf] Página ${page.pageIndex} OK (${Date.now() - t0}ms)`);
        resolve(msg.result);
      } else {
        console.error(`[export-pdf] Página ${page.pageIndex} ERROR en worker: ${msg.error}`);
        if (msg.stack) console.error(msg.stack);
        reject(new Error(msg.error));
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      console.error(`[export-pdf] Página ${page.pageIndex} error de proceso: ${err.message}`);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      console.error(`[export-pdf] Página ${page.pageIndex} terminó inesperadamente: código=${code} señal=${signal}`);
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

  const totalElements = pages.reduce((sum, p) => sum + (p.elements?.length || 0), 0);
  console.log(`[export-pdf] Solicitud recibida — ${pages.length} página(s), ${totalElements} elemento(s), perfil: ${cmykConfig?.profile || 'FOGRA39'}`);

  const t0 = Date.now();

  try {
    const results = [];
    for (const page of pages) {
      const elCount = page.elements?.length || 0;
      console.log(`[export-pdf] Procesando página ${page.pageIndex} — ${elCount} elemento(s), alto: ${page.heightCm?.toFixed(1)}cm`);
      const result = await runPageInFork(page, canvasConfig, cmykConfig);
      results.push(result);
    }

    results.sort((a, b) => a.pageIndex - b.pageIndex);
    console.log(`[export-pdf] Completado en ${Date.now() - t0}ms — ${results.length} PDF(s) generado(s)`);
    res.json({ pages: results });
  } catch (err) {
    console.error(`[export-pdf] Fallo total después de ${Date.now() - t0}ms: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
