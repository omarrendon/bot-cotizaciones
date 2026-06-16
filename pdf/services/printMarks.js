'use strict';
const { rgb } = require('pdf-lib');

const DEFAULT_BLEED_SIZE = 9;
const DEFAULT_MARK_OFFSET = 6;
const MARK_LENGTH = 24;
const MARK_WEIGHT = 0.5;
const REG_RADIUS  = 6;
const BAR_HEIGHT  = 12;

const BLACK = rgb(0, 0, 0);
const GRAY  = rgb(0.5, 0.5, 0.5);

// Swatches CMYK y RGB expresados como colores equivalentes en RGB
const COLOR_BARS = [
  rgb(0, 1, 1),   // Cyan
  rgb(1, 0, 1),   // Magenta
  rgb(1, 1, 0),   // Yellow
  rgb(0, 0, 0),   // Black
  rgb(1, 0, 0),   // Red
  rgb(0, 1, 0),   // Green
  rgb(0, 0, 1),   // Blue
  rgb(1, 1, 1),   // White
];

function drawLine(page, x1, y1, x2, y2, thickness, color) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
}

function drawCropMarks(page, w, h, offset, bleedSize) {
  const start = offset;
  const end   = offset + MARK_LENGTH;

  // Esquina sup-izq
  drawLine(page, -start, h, -end, h, MARK_WEIGHT, BLACK);
  drawLine(page, 0, h + start, 0, h + end, MARK_WEIGHT, BLACK);
  // Esquina sup-der
  drawLine(page, w + start, h, w + end, h, MARK_WEIGHT, BLACK);
  drawLine(page, w, h + start, w, h + end, MARK_WEIGHT, BLACK);
  // Esquina inf-izq
  drawLine(page, -start, 0, -end, 0, MARK_WEIGHT, BLACK);
  drawLine(page, 0, -start, 0, -end, MARK_WEIGHT, BLACK);
  // Esquina inf-der
  drawLine(page, w + start, 0, w + end, 0, MARK_WEIGHT, BLACK);
  drawLine(page, w, -start, w, -end, MARK_WEIGHT, BLACK);
}

function drawRegistrationMark(page, cx, cy) {
  // Círculo exterior
  page.drawCircle({ x: cx, y: cy, size: REG_RADIUS, borderColor: BLACK, borderWidth: MARK_WEIGHT });
  // Cruz
  drawLine(page, cx - REG_RADIUS, cy, cx + REG_RADIUS, cy, MARK_WEIGHT, BLACK);
  drawLine(page, cx, cy - REG_RADIUS, cx, cy + REG_RADIUS, MARK_WEIGHT, BLACK);
}

function drawRegistrationMarks(page, w, h, offset) {
  const dist = offset + MARK_LENGTH / 2 + REG_RADIUS;
  drawRegistrationMark(page, w / 2, h + dist);      // superior
  drawRegistrationMark(page, w / 2, -dist);          // inferior
  drawRegistrationMark(page, -dist, h / 2);          // izquierdo
  drawRegistrationMark(page, w + dist, h / 2);       // derecho
}

function drawColorBars(page, w, h, offset) {
  const barY    = -(offset + MARK_LENGTH + BAR_HEIGHT + 4);
  const swatchW = w / COLOR_BARS.length;

  COLOR_BARS.forEach((color, i) => {
    page.drawRectangle({
      x: i * swatchW, y: barY,
      width: swatchW, height: BAR_HEIGHT,
      color,
      borderColor: BLACK,
      borderWidth: 0.25,
    });
  });
}

function drawBleedMarks(page, w, h, bleedSize) {
  const b = bleedSize;
  // Rectángulo de sangrado como 4 líneas segmentadas
  [
    [-b, -b, w + b, -b],
    [-b, h + b, w + b, h + b],
    [-b, -b, -b, h + b],
    [w + b, -b, w + b, h + b],
  ].forEach(([x1, y1, x2, y2]) => {
    drawLine(page, x1, y1, x2, y2, MARK_WEIGHT, GRAY);
  });
}

function drawJobInfo(page, w, h, config, font, offset) {
  const date = new Date().toISOString().split('T')[0];
  const text  = `Profile: ${config.profile || 'FOGRA39'}  |  ${date}`;
  const infoY = -(offset + MARK_LENGTH + BAR_HEIGHT + 18);

  page.drawText(text, { x: 0, y: infoY, size: 6, font, color: BLACK });
}

function addPrintMarks(pdfPage, widthPts, heightPts, printMarksConfig, helveticaFont) {
  if (!printMarksConfig) return;

  const offset    = printMarksConfig.markOffset  != null ? printMarksConfig.markOffset  : DEFAULT_MARK_OFFSET;
  const bleedSize = printMarksConfig.bleedSize   != null ? printMarksConfig.bleedSize   : DEFAULT_BLEED_SIZE;

  if (printMarksConfig.addCropMarks)         drawCropMarks(pdfPage, widthPts, heightPts, offset, bleedSize);
  if (printMarksConfig.addRegistrationMarks) drawRegistrationMarks(pdfPage, widthPts, heightPts, offset);
  if (printMarksConfig.addColorBars)         drawColorBars(pdfPage, widthPts, heightPts, offset);
  if (printMarksConfig.addBleedMarks)        drawBleedMarks(pdfPage, widthPts, heightPts, bleedSize);
  if (printMarksConfig.addJobInfo && helveticaFont) {
    drawJobInfo(pdfPage, widthPts, heightPts, printMarksConfig, helveticaFont, offset);
  }
}

module.exports = { addPrintMarks };
