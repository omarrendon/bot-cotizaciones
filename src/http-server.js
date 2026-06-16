require('dotenv').config();

process.on('uncaughtException',  (err) => console.error('[CRASH uncaughtException]', err));
process.on('unhandledRejection', (err) => console.error('[CRASH unhandledRejection]', err));

const express        = require('express');
const cors           = require('cors');
const exportPdfRoute = require('../pdf/routes/exportPdf');

const app    = express();
const MAX_MB = parseInt(process.env.MAX_PAYLOAD_MB || '80', 10);
app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: `${MAX_MB}mb` }));
app.use('/api', exportPdfRoute);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = parseInt(process.env.PORT || '3000', 10);
const server = app.listen(PORT, () => console.log(`HTTP server (solo export-pdf) en puerto ${PORT}`));
server.on('error', (err) => console.error('[CRASH server.error]', err));
