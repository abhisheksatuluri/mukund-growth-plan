// Pre-crop audit-flagged images to fix framing issues identified in image_audit.json.
// Crops are conservative — preserve subject identity, just trim awkward edges + reframe to clean aspect ratios.
// Output: ./Website/assets/cropped/<original>
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('./Website/assets');
const OUT = path.resolve('./Website/assets/cropped');

// Crop instructions per image. % values from edges.
// Designed from the audit: tight tops, awkward bottoms, distracting backgrounds, screenshot UI removal.
const CROPS = [
  // sharp position keywords: 'north', 'south', 'east', 'west', 'centre', 'north east', etc.
  // 'center top' = 'north', 'center 40%' = use top/north for "tighter top" framing
  // Hero candidates (already strong) — light cleanups
  { src: 'mukund_portrait_boss.jpeg', crop: { left:'2%', top:'4%', right:'2%', bottom:'2%' }, target: { width:1600, height:2000, fit:'cover', position:'north' }, note:'BOSS HUGO BOSS shot — slight top crop only' },
  { src: 'mukund_competition_stage.jpeg', crop: { left:'0%', top:'2%', right:'0%', bottom:'2%' }, target: { width:1800, height:1200, fit:'cover', position:'centre' }, note:'Stage shot — minimal cleanup' },
  { src: 'mukund_gym_dynamic.jpeg', crop: { left:'0%', top:'2%', right:'0%', bottom:'5%' }, target: { width:1920, height:1080, fit:'cover', position:'north' }, note:'Gym kick — trim screenshot UI bottom' },
  { src: 'mukund_editorial_singapore.jpeg', crop: { left:'2%', top:'0%', right:'2%', bottom:'5%' }, target: { width:1280, height:1920, fit:'cover', position:'north' }, note:'Singapore editorial — keep tall portrait, trim watermark text bottom' },

  // Story-section candidates — moderate reframing
  { src: 'mukund_mirror_gym.jpeg', crop: { left:'5%', top:'5%', right:'5%', bottom:'8%' }, target: { width:1200, height:1500, fit:'cover', position:'centre' }, note:'Mirror gym — trim black bars + screenshot UI' },
  { src: 'mukund_portrait_casual.jpeg', crop: { left:'5%', top:'2%', right:'5%', bottom:'12%' }, target: { width:1200, height:1500, fit:'cover', position:'north' }, note:'Casual portrait — trim mid-thigh awkward crop, tighten' },
  { src: 'mukund_suit_smiling.jpeg', crop: { left:'4%', top:'2%', right:'4%', bottom:'8%' }, target: { width:1200, height:1500, fit:'cover', position:'north' }, note:'Suit smiling — improve framing' },
  { src: 'mukund_suit_fullbody.jpeg', crop: { left:'4%', top:'2%', right:'4%', bottom:'4%' }, target: { width:1200, height:1800, fit:'cover', position:'centre' }, note:'Suit full-body' },
  { src: 'mukund_suit_portrait.jpeg', crop: { left:'4%', top:'4%', right:'4%', bottom:'8%' }, target: { width:1200, height:1500, fit:'cover', position:'north' }, note:'Suit portrait — fix tight top crop' },
  { src: 'mukund_suit_side.jpeg', crop: { left:'5%', top:'4%', right:'5%', bottom:'15%' }, target: { width:1200, height:1500, fit:'cover', position:'north' }, note:'Suit side — fix mid-thigh crop' },

  // Family
  { src: 'mukund_family.jpeg', crop: { left:'2%', top:'2%', right:'2%', bottom:'4%' }, target: { width:1600, height:1200, fit:'cover', position:'centre' }, note:'Family selfie — preserve all subjects' },

  // Cycling
  { src: 'mukund_cycling_triumph.jpeg', crop: { left:'0%', top:'0%', right:'0%', bottom:'2%' }, target: { width:1920, height:1080, fit:'cover', position:'north' }, note:'Cycling triumph — already strong' },

  // Coaching shots
  { src: 'mukund_coaching_client_1.jpeg', crop: { left:'4%', top:'4%', right:'4%', bottom:'4%' }, target: { width:1200, height:1500, fit:'cover', position:'centre' }, note:'Coaching client 1 — clean up edges' },

  // Transformations (proof) — keep them factual, just clean up
  { src: 'client_transformation_front.jpeg', crop: { left:'0%', top:'0%', right:'0%', bottom:'5%' }, target: { width:1200, height:1800, fit:'cover', position:'centre' }, note:'Client transformation front — trim distracting bottom' },
  { src: 'client_transformation_back.jpeg', crop: { left:'0%', top:'0%', right:'0%', bottom:'5%' }, target: { width:1200, height:1800, fit:'cover', position:'centre' }, note:'Client transformation back' },

  // Medals
  { src: 'mukund_medals.jpeg', crop: { left:'4%', top:'4%', right:'4%', bottom:'4%' }, target: { width:1500, height:1500, fit:'cover', position:'centre' }, note:'Medals' },
];

function pctToPx(pct, total) { return Math.round((parseFloat(pct) / 100) * total); }

async function cropOne(item) {
  const inPath = path.join(SRC, item.src);
  const outPath = path.join(OUT, item.src);
  const meta = await sharp(inPath).metadata();
  const { width: w, height: h } = meta;

  const left = pctToPx(item.crop.left, w);
  const top = pctToPx(item.crop.top, h);
  const right = pctToPx(item.crop.right, w);
  const bottom = pctToPx(item.crop.bottom, h);
  const newW = w - left - right;
  const newH = h - top - bottom;

  let pipeline = sharp(inPath).extract({ left, top, width: newW, height: newH });
  if (item.target) {
    pipeline = pipeline.resize({
      width: item.target.width,
      height: item.target.height,
      fit: item.target.fit || 'cover',
      position: item.target.position || 'center',
      withoutEnlargement: false,
    });
  }
  pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });

  await pipeline.toFile(outPath);
  const stat = await fs.stat(outPath);
  console.log(`  ${item.src.padEnd(40)} ${w}x${h} → ${item.target.width}x${item.target.height} (${(stat.size/1024).toFixed(0)} KB) — ${item.note}`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`[crop] processing ${CROPS.length} images`);
  for (const c of CROPS) {
    try { await cropOne(c); }
    catch (e) { console.error(`  ! ${c.src}: ${e.message}`); }
  }
  console.log('[crop] done →', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
