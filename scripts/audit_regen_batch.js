// Batch-audit all regenerated images vs originals — face preservation check.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';
const OPT = path.resolve('./Website/assets/optimized');
const REGEN = path.resolve('./Website/assets/regen');
const OUT = path.resolve('./output/data/regen_batch_audit.json');

const PROMPT = `Compare these two images. Image 1 = original. Image 2 = regenerated. STRICT JSON only:
{
  "same_person": true | false,
  "face_similarity_0_10": 0,
  "body_similarity_0_10": 0,
  "pose_preserved": true | false,
  "framing_improved": true | false,
  "background_improved": true | false,
  "regen_premium_score_0_10": 0,
  "ai_giveaway_visible": "string — describe AI tells (plastic skin, weird hands, wrong fingers, eye distortion) or 'none'",
  "verdict": "use_regen | use_original | regen_unusable",
  "notes": "1 short sentence"
}`;

async function inline(filepath) {
  const data = await fs.readFile(filepath);
  return { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
}

async function compare(orig, regen) {
  const o = await inline(orig);
  const r = await inline(regen);
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [
      { text: 'Image 1 (ORIGINAL):' }, o,
      { text: 'Image 2 (REGEN):' }, r,
      { text: PROMPT },
    ] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  return JSON.parse(resp.text);
}

async function main() {
  const regens = (await fs.readdir(REGEN)).filter(f => /_regen(_0)?\.jpeg$/.test(f)).sort();
  const results = [];
  console.log(`[audit] ${regens.length} regen pairs`);
  for (const f of regens) {
    const orig = f.replace(/_regen(_0)?\.jpeg$/, '.jpeg');
    const origPath = path.join(OPT, orig);
    const regenPath = path.join(REGEN, f);
    try {
      await fs.access(origPath);
      const r = await compare(origPath, regenPath);
      results.push({ original: orig, regen: f, ...r });
      console.log(`  ${orig.padEnd(38)} face=${r.face_similarity_0_10}/10 | premium=${r.regen_premium_score_0_10}/10 | verdict=${r.verdict} | AI tells: ${r.ai_giveaway_visible.slice(0,50)}`);
    } catch (e) {
      console.error(`  ! ${f}: ${e.message}`);
    }
  }
  await fs.writeFile(OUT, JSON.stringify(results, null, 2));
  console.log('\n--- SUMMARY ---');
  const useRegen = results.filter(r => r.verdict === 'use_regen').map(r => r.original);
  const useOrig = results.filter(r => r.verdict === 'use_original').map(r => r.original);
  const unusable = results.filter(r => r.verdict === 'regen_unusable').map(r => r.original);
  console.log(`use_regen: ${useRegen.length} →`, useRegen.join(', '));
  console.log(`use_original: ${useOrig.length} →`, useOrig.join(', '));
  console.log(`unusable: ${unusable.length} →`, unusable.join(', '));
}
main().catch(e => { console.error(e); process.exit(1); });
