#!/usr/bin/env node
/**
 * crop-head.mjs — Crop a bg-removed image down to just the head.
 *
 * Finds the bounding box of non-transparent pixels, then takes
 * the top portion as the head (approx top 40% of the figure).
 *
 * Usage:
 *   node scripts/crop-head.mjs <input> [output]
 *
 * Example:
 *   node scripts/crop-head.mjs public/assets/test-photo-clean.png public/assets/test-photo-clean-head.png
 */

import sharp from 'sharp';
import { resolve, basename } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/crop-head.mjs <input> [output]');
  process.exit(1);
}

const inputPath = resolve(args[0]);
const outputPath = resolve(args[1] || inputPath.replace(/\.png$/, '-head.png'));

console.log(`Cropping head from: ${basename(inputPath)}`);

const image = sharp(inputPath);
const { width, height, channels } = await image.metadata();
const { data } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

// Find bounding box of non-transparent pixels
let minX = width, maxX = 0, minY = height, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const figureW = maxX - minX;
const figureH = maxY - minY;
const centerX = minX + figureW / 2;

console.log(`  Figure bounds: ${figureW}x${figureH} at (${minX},${minY})`);

// Head = top ~40% of figure height, centered on figure center X
const headRatio = 0.40;
const headH = Math.round(figureH * headRatio);
const headW = Math.round(headH * 0.9); // heads are roughly as wide as tall
const pad = Math.round(headW * 0.15);  // add some padding

const cropX = Math.max(0, Math.round(centerX - headW / 2) - pad);
const cropY = Math.max(0, minY - pad);
const cropW = Math.min(width - cropX, headW + pad * 2);
const cropH = Math.min(height - cropY, headH + pad * 2);

console.log(`  Head crop: ${cropW}x${cropH} at (${cropX},${cropY})`);

await sharp(inputPath)
  .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
  .toFile(outputPath);

console.log(`  → ${basename(outputPath)}`);
