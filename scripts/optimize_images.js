// Web-optimize images WITHOUT changing aspect ratio or cutting subjects.
// Just: downsample huge files to reasonable web sizes, mozjpeg compress, strip metadata.
// Outputs to ./Website/assets/optimized/<original>
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('./Website/assets');
const OUT = path.resolve('./Website/assets/optimized');

const MAX_DIM = 1800; // longest edge — plenty for retina at any layout slot
const JPEG_QUALITY = 85;

async function optimize(filename) {
  const inPath = path.join(SRC, filename);
  const outPath = path.join(OUT, filename);
  const meta = await sharp(inPath).metadata();
  const longest = Math.max(meta.width, meta.height);
  const needsResize = longest > MAX_DIM;
  let pipeline = sharp(inPath).rotate(); // auto-orient by EXIF
  if (needsResize) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? MAX_DIM : null,
      height: meta.height > meta.width ? MAX_DIM : null,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  await pipeline.toFile(outPath);

  const inSize = (await fs.stat(inPath)).size;
  const outSize = (await fs.stat(outPath)).size;
  const finalMeta = await sharp(outPath).metadata();
  console.log(
    `  ${filename.padEnd(40)} ${meta.width}x${meta.height} → ${finalMeta.width}x${finalMeta.height} | ` +
    `${(inSize/1024).toFixed(0)}KB → ${(outSize/1024).toFixed(0)}KB ` +
    `(${((1 - outSize/inSize) * 100).toFixed(0)}% smaller)`
  );
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const files = (await fs.readdir(SRC))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();
  console.log(`[optimize] processing ${files.length} top-level images (aspect ratios preserved, subjects untouched)`);
  for (const f of files) {
    try { await optimize(f); }
    catch (e) { console.error(`  ! ${f}: ${e.message}`); }
  }

  // also handle from-v0 sub-folder
  const v0Dir = path.join(SRC, 'from-v0');
  const v0Out = path.join(OUT, 'from-v0');
  await fs.mkdir(v0Out, { recursive: true });
  const v0Files = (await fs.readdir(v0Dir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  console.log(`\n[optimize] from-v0 (${v0Files.length})`);
  for (const f of v0Files) {
    try {
      const inP = path.join(v0Dir, f);
      const outP = path.join(v0Out, f);
      const m = await sharp(inP).metadata();
      const longest = Math.max(m.width, m.height);
      let p = sharp(inP).rotate();
      if (longest > MAX_DIM) {
        p = p.resize({
          width: m.width >= m.height ? MAX_DIM : null,
          height: m.height > m.width ? MAX_DIM : null,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      p = p.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
      await p.toFile(outP);
      const inSize = (await fs.stat(inP)).size;
      const outSize = (await fs.stat(outP)).size;
      const fm = await sharp(outP).metadata();
      console.log(`  ${f.padEnd(20)} ${m.width}x${m.height} → ${fm.width}x${fm.height} | ${(inSize/1024).toFixed(0)}KB → ${(outSize/1024).toFixed(0)}KB`);
    } catch (e) { console.error(`  ! ${f}: ${e.message}`); }
  }

  console.log('\n[optimize] done →', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
