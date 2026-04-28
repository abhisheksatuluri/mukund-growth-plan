// Build final asset set: use regen where approved, optimized original where not.
// Output: ./Website/assets/final/<name>.jpeg
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const OPT = path.resolve('./Website/assets/optimized');
const REGEN = path.resolve('./Website/assets/regen');
const FINAL = path.resolve('./Website/assets/final');

// From regen_batch_audit.json verdicts
const USE_REGEN = [
  'client_transformation_front.jpeg',
  'mukund_coaching_client_1.jpeg',
  'mukund_mirror_gym.jpeg',
  'mukund_suit_portrait.jpeg',
  'mukund_suit_smiling.jpeg',
];

async function main() {
  await fs.mkdir(FINAL, { recursive: true });

  const optFiles = (await fs.readdir(OPT)).filter(f => /\.jpe?g$/i.test(f));
  console.log(`[finalize] processing ${optFiles.length} images`);

  for (const f of optFiles) {
    let src;
    if (USE_REGEN.includes(f)) {
      const regenName = f.replace('.jpeg', '_regen.jpeg');
      const regenPath = path.join(REGEN, regenName);
      try { await fs.access(regenPath); src = regenPath; console.log(`  ⭐ ${f.padEnd(40)} ← regen`); }
      catch { src = path.join(OPT, f); console.log(`  ${f.padEnd(40)}    ← optimized (no regen file)`); }
    } else {
      src = path.join(OPT, f);
      console.log(`     ${f.padEnd(40)} ← optimized`);
    }
    // Re-compress (regen files are 1.8-2.3 MB raw — need optimization)
    const meta = await sharp(src).metadata();
    let p = sharp(src).rotate();
    if (Math.max(meta.width, meta.height) > 1800) {
      p = p.resize({ width: meta.width >= meta.height ? 1800 : null, height: meta.height > meta.width ? 1800 : null, fit: 'inside' });
    }
    await p.jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(FINAL, f));
  }

  // Copy v0 directory unchanged
  const v0Src = path.join(OPT, 'from-v0');
  const v0Dst = path.join(FINAL, 'from-v0');
  await fs.mkdir(v0Dst, { recursive: true });
  const v0Files = (await fs.readdir(v0Src)).filter(f => /\.jpe?g$/i.test(f));
  for (const f of v0Files) {
    await fs.copyFile(path.join(v0Src, f), path.join(v0Dst, f));
  }
  console.log(`  copied ${v0Files.length} v0 images`);

  // Total size
  let totalSize = 0;
  const all = (await fs.readdir(FINAL)).filter(f => /\.jpe?g$/i.test(f));
  for (const f of all) totalSize += (await fs.stat(path.join(FINAL, f))).size;
  for (const f of v0Files) totalSize += (await fs.stat(path.join(v0Dst, f))).size;
  console.log(`\n[finalize] ${all.length + v0Files.length} files, total ${(totalSize/1024/1024).toFixed(2)} MB → ${FINAL}`);
}
main().catch(e => { console.error(e); process.exit(1); });
