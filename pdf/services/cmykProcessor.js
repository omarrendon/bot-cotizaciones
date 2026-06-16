'use strict';
const sharp = require('sharp');

const ICC_PROFILES = {
  FOGRA39: {
    maxTAC: 330, blackGeneration: 'medium', blackInkLimit: 100,
    dotGain: { c: 16, m: 14, y: 14, k: 18 },
    compensationCurves: { c: v => v * 1.05, m: v => v * 1.02, y: v => v * 1.00, k: v => v * 1.08 },
  },
  FOGRA51: {
    maxTAC: 320, blackGeneration: 'medium', blackInkLimit: 95,
    dotGain: { c: 14, m: 12, y: 12, k: 16 },
    compensationCurves: { c: v => v * 1.03, m: v => v * 1.01, y: v => v * 1.00, k: v => v * 1.06 },
  },
  SWOP: {
    maxTAC: 300, blackGeneration: 'medium', blackInkLimit: 95,
    dotGain: { c: 18, m: 16, y: 16, k: 20 },
    compensationCurves: { c: v => v * 1.06, m: v => v * 1.03, y: v => v * 1.01, k: v => v * 1.09 },
  },
  JapanColor2011: {
    maxTAC: 320, blackGeneration: 'light', blackInkLimit: 90,
    dotGain: { c: 15, m: 13, y: 13, k: 17 },
    compensationCurves: { c: v => v * 1.04, m: v => v * 1.02, y: v => v * 1.00, k: v => v * 1.07 },
  },
  UncoatedFOGRA29: {
    maxTAC: 280, blackGeneration: 'heavy', blackInkLimit: 95,
    dotGain: { c: 22, m: 20, y: 20, k: 25 },
    compensationCurves: { c: v => v * 1.08, m: v => v * 1.05, y: v => v * 1.02, k: v => v * 1.12 },
  },
};

const GCR_PERCENTAGES = { none: 0, light: 25, medium: 50, heavy: 75, maximum: 100 };

async function applyRgbToCmyk(inputBuffer, cmykConfig) {
  const { profile: profileName, gcrMethod, customTAC, applyDotGain } = cmykConfig;
  const profile = ICC_PROFILES[profileName] || ICC_PROFILES.FOGRA39;
  const maxTACLimit = customTAC != null ? customTAC : profile.maxTAC;
  const gcrPct = GCR_PERCENTAGES[gcrMethod != null ? gcrMethod : profile.blackGeneration] / 100;

  const meta = await sharp(inputBuffer).metadata();
  const { width, height } = meta;

  const { data } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data.buffer);

  for (let i = 0; i < pixels.length; i += 4) {
    const r1 = pixels[i]     / 255;
    const g1 = pixels[i + 1] / 255;
    const b1 = pixels[i + 2] / 255;
    // alpha (pixels[i+3]) sin modificar

    const k0 = 1 - Math.max(r1, g1, b1);
    const d  = k0 < 1 ? 1 - k0 : 1;
    let c = ((1 - r1 - k0) / d) * 100;
    let m = ((1 - g1 - k0) / d) * 100;
    let y = ((1 - b1 - k0) / d) * 100;
    let k = k0 * 100;

    // GCR
    const minCMY = Math.min(c, m, y);
    const gcrBlack = minCMY * gcrPct;
    c = Math.max(0, c - gcrBlack);
    m = Math.max(0, m - gcrBlack);
    y = Math.max(0, y - gcrBlack);
    k = Math.min(100, k + gcrBlack);

    // TAC limit
    const totalTAC = c + m + y + k;
    if (totalTAC > maxTACLimit) {
      const scale = maxTACLimit / totalTAC;
      c *= scale; m *= scale; y *= scale; k *= scale;
    }

    // Dot gain compensation
    if (applyDotGain) {
      c = Math.min(100, profile.compensationCurves.c(c));
      m = Math.min(100, profile.compensationCurves.m(m));
      y = Math.min(100, profile.compensationCurves.y(y));
      k = Math.min(100, profile.compensationCurves.k(k));
    }

    // CMYK → RGB para almacenar en PNG de salida
    const factor = (100 - k) / 100;
    pixels[i]     = Math.round((100 - c) / 100 * factor * 255);
    pixels[i + 1] = Math.round((100 - m) / 100 * factor * 255);
    pixels[i + 2] = Math.round((100 - y) / 100 * factor * 255);
  }

  return sharp(Buffer.from(pixels.buffer), {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
}

module.exports = { applyRgbToCmyk };
