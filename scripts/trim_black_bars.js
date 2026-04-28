// Auto-detect and trim black bars (screenshot letterboxing) on images.
// Reads pixel data — only trims bands that are >95% near-black for >5% of image height.
// Conservative: never cuts subject, only removes the black edges.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('./Website/assets/optimized');
const OUT = path.resolve('./Website/assets/optimized'); // overwrite optimized
const BLACK_THRESHOLD = 18; // pixel value 0-255; below this counts as "black"
const MIN_BAND_PCT = 0.03;  // band must be >=3% of height to count
const ROW_BLACK_RATIO = 0.97; // row must be 97% black pixels

async function detectBlackBars(filePath) {
  const img = sharp(filePath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // For each row, compute % of black pixels
  function rowBlackness(y) {
    let blackCount = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r < BLACK_THRESHOLD && g < BLACK_THRESHOLD && b < BLACK_THRESHOLD) blackCount++;
    }
    return blackCount / width;
  }

  // Find top band — consecutive black-ish rows from top
  let topBand = 0;
  for (let y = 0; y < Math.floor(height / 2); y++) {
    if (rowBlackness(y) >= ROW_BLACK_RATIO) topBand = y + 1;
    else break;
  }
  // Find bottom band
  let bottomBand = 0;
  for (let y = height - 1; y > Math.floor(height / 2); y--) {
    if (rowBlackness(y) >= ROW_BLACK_RATIO) bottomBand = (height - 1) - y + 1;
    else break;
  }

  const minBandPx = Math.floor(height * MIN_BAND_PCT);
  if (topBand < minBandPx) topBand = 0;
  if (bottomBand < minBandPx) bottomBand = 0;

  return { width, height, topBand, bottomBand };
}

async function trimOne(filename) {
  const fp = path.join(SRC, filename);
  const { width, height, topBand, bottomBand } = await detectBlackBars(fp);
  if (topBand === 0 && bottomBand === 0) {
    return { filename, action: 'no-bars', topBand, bottomBand };
  }
  const newH = height - topBand - bottomBand;
  await sharp(fp)
    .extract({ left: 0, top: topBand, width, height: newH })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(fp + '.tmp');
  await fs.rename(fp + '.tmp', fp);
  return { filename, action: 'trimmed', topBand, bottomBand, newH };
}

async function main() {
  const files = (await fs.readdir(SRC)).filter(f => /\.jpe?g$/i.test(f)).sort();
  console.log(`[trim] scanning ${files.length} images for screenshot black bars`);
  for (const f of files) {
    try {
      const r = await trimOne(f);
      if (r.action === 'trimmed') {
        console.log(`  ✂️  ${f.padEnd(40)} top:${r.topBand}px bottom:${r.bottomBand}px → new height ${r.newH}px`);
      }
    } catch (e) { console.error(`  ! ${f}: ${e.message}`); }
  }
  console.log('[trim] done');
}
main().catch(e => { console.error(e); process.exit(1); });
