'use strict';
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
const sharp = require('sharp');
const { applyRgbToCmyk } = require('./cmykProcessor');
const { addPrintMarks }  = require('./printMarks');

const CM_TO_POINTS  = 28.35;
const SVG_PDF_SCALE = 2;
const SHARP_MAX_PX  = 32767;

function pxToPoints(px, pixelsPerCm) {
  return (px / pixelsPerCm) * CM_TO_POINTS;
}

function generateFileName(cmykConfig, pageIndex) {
  const profile = (cmykConfig && cmykConfig.profile) ? cmykConfig.profile : 'FOGRA39';
  return `uniformes-p${pageIndex + 1}-${profile}.pdf`;
}

async function decodeSvgBuffer(imageDataUrl) {
  const [header, body] = imageDataUrl.split(',');
  if (header.includes('base64')) {
    return Buffer.from(body, 'base64');
  }
  return Buffer.from(decodeURIComponent(body), 'utf-8');
}

async function generatePagePdf(page, canvasConfig, cmykConfig) {
  const { pageIndex, heightCm, elements } = page;
  const pixelsPerCm = canvasConfig.pixelsPerCm || 10;
  const widthPts    = canvasConfig.width * CM_TO_POINTS;
  const heightPts   = heightCm * CM_TO_POINTS;

  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdfDoc.addPage([widthPts, heightPts]);

  // Cache por página: evita reprocesar el mismo SVG+rotation
  const svgEmbedCache = new Map();

  const visibleElements = (elements || [])
    .filter(el => el.visible !== false)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  for (const el of visibleElements) {
    const elWidthPts  = pxToPoints(el.dimensions.width,  pixelsPerCm);
    const elHeightPts = pxToPoints(el.dimensions.height, pixelsPerCm);
    const xPts        = pxToPoints(el.position.x, pixelsPerCm);
    const yPts        = pxToPoints(el.position.y, pixelsPerCm);
    const pdfYBottom  = heightPts - yPts - elHeightPts;
    const rotation    = el.rotation || 0;

    let drawX = xPts;
    let drawY = pdfYBottom;
    if (rotation === 180) {
      drawX = xPts + elWidthPts;
      drawY = pdfYBottom + elHeightPts;
    }

    if (el.type === 'uniform') {
      const cacheKey = `${el.imageDataUrl}:${rotation}`;
      let pdfImage = svgEmbedCache.get(cacheKey);

      if (!pdfImage) {
        let pngBuffer;

        if (el.isSvg) {
          const svgBuffer = await decodeSvgBuffer(el.imageDataUrl);
          // Rasterizar al tamaño del elemento a 4x para calidad de impresión.
          // Usar dimensiones del elemento (no de la página) para evitar el límite
          // de 32767px de Sharp en páginas grandes.
          const rawW = Math.round(elWidthPts  * SVG_PDF_SCALE);
          const rawH = Math.round(elHeightPts * SVG_PDF_SCALE);
          const clamp = Math.min(1, SHARP_MAX_PX / Math.max(rawW, rawH, 1));
          const targetW = Math.max(1, Math.round(rawW * clamp));
          const targetH = Math.max(1, Math.round(rawH * clamp));
          pngBuffer = await sharp(svgBuffer)
            .resize(targetW, targetH, { fit: 'fill' })
            .png()
            .toBuffer();
        } else {
          pngBuffer = Buffer.from(el.imageDataUrl.split(',')[1], 'base64');
        }

        if (cmykConfig) {
          pngBuffer = await applyRgbToCmyk(pngBuffer, cmykConfig);
        }

        pdfImage = await pdfDoc.embedPng(pngBuffer);
        svgEmbedCache.set(cacheKey, pdfImage);
      }

      pdfPage.drawImage(pdfImage, {
        x: drawX, y: drawY,
        width: elWidthPts, height: elHeightPts,
        rotate: degrees(rotation),
      });

      // Texto de talla para elementos del Excel
      if (el.source === 'excel' && el.size) {
        const tallaText   = `Talla ${el.size}`;
        const fontSize    = 9;
        const fontSizePts = (fontSize / pixelsPerCm) * CM_TO_POINTS;
        const textWidth   = helveticaBold.widthOfTextAtSize(tallaText, fontSizePts);
        const centerX     = xPts + elWidthPts / 2;
        const textX       = centerX - textWidth / 2;
        const textY       = pdfYBottom + (11 / pixelsPerCm * CM_TO_POINTS);

        pdfPage.drawRectangle({
          x: textX - 2, y: textY - 2,
          width: textWidth + 4, height: fontSizePts + 4,
          color: rgb(1, 1, 1), opacity: 0.8,
        });
        pdfPage.drawText(tallaText, {
          x: textX, y: textY,
          size: fontSizePts, font: helveticaBold,
          color: rgb(0, 0, 0),
        });
      }

    } else if (el.type === 'textPng') {
      const pngBuffer = Buffer.from(el.pngDataUrl.split(',')[1], 'base64');
      const pdfImage  = await pdfDoc.embedPng(pngBuffer);

      let pdfX = (el.position.x / pixelsPerCm) * CM_TO_POINTS;
      const pdfYTop = (el.position.y / pixelsPerCm) * CM_TO_POINTS;

      // TextElement en Konva rota alrededor de su esquina top-left (sin offset),
      // por lo que element.position es el ancla del texto SIN rotar.
      // Con rotation=180°, la posición visual queda en [pos.x-w, pos.x] × [pos.y-h, pos.y],
      // y el ancla PDF necesaria es (pos.x_pts, heightPts - pos.y_pts + h_pts).
      // Con rotation=0° el ancla es (pos.x_pts, heightPts - pos.y_pts - h_pts) — sin cambio.
      // TextElement en Konva rota alrededor de su esquina top-left (sin offset),
      // por lo que element.position es el ancla del texto SIN rotar.
      // Con rotation=180°, la posición visual queda en [pos.x-w, pos.x] × [pos.y-h, pos.y],
      // y el ancla PDF necesaria es (pos.x_pts, heightPts - pos.y_pts + h_pts).
      // Con rotation=0° el ancla es (pos.x_pts, heightPts - pos.y_pts - h_pts) — sin cambio.
      let pdfY;
      if (rotation === 180) {
        pdfY = heightPts - pdfYTop + el.heightPts;
        if (el.textAlign === 'center' && el.dimensions.width > 450) {
          const containerWidthPts = (el.dimensions.width / pixelsPerCm) * CM_TO_POINTS;
          pdfX -= (containerWidthPts - el.widthPts) / 2;
        }
      } else {
        pdfY = heightPts - pdfYTop - el.heightPts + (el.yOffsetPts || 0);
        if (el.textAlign === 'center' && el.dimensions.width > 450) {
          const containerWidthPts = (el.dimensions.width / pixelsPerCm) * CM_TO_POINTS;
          pdfX += (containerWidthPts - el.widthPts) / 2;
        }
      }

      pdfPage.drawImage(pdfImage, {
        x: pdfX, y: pdfY,
        width: el.widthPts, height: el.heightPts,
        rotate: degrees(rotation),
      });

    } else if (el.type === 'image') {
      let pngBuffer = Buffer.from(el.imageDataUrl.split(',')[1], 'base64');

      if (cmykConfig) {
        pngBuffer = await applyRgbToCmyk(pngBuffer, cmykConfig);
      }

      const pdfImage = await pdfDoc.embedPng(pngBuffer);
      pdfPage.drawImage(pdfImage, {
        x: drawX, y: drawY,
        width: elWidthPts, height: elHeightPts,
        rotate: degrees(rotation),
      });
    }
  }

  if (cmykConfig && cmykConfig.printMarks) {
    const marksConfig = { ...cmykConfig.printMarks, profile: cmykConfig.profile };
    addPrintMarks(pdfPage, widthPts, heightPts, marksConfig, helvetica);
  }

  const pdfBytes  = await pdfDoc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const fileName  = generateFileName(cmykConfig, pageIndex);

  return { pageIndex, pdfBase64, fileName };
}

module.exports = { generatePagePdf };
