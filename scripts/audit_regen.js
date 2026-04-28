// Audit a regenerated image for face/identity preservation vs the original.
// Compares the regen output against the source by sending BOTH to Gemini and asking explicit questions.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

const SRC = path.resolve('./Website/assets/optimized/mukund_mirror_gym.jpeg');
const REGEN = path.resolve('./Website/assets/regen/mukund_mirror_gym_regen_0.jpeg');

async function fileToInline(filepath) {
  const data = await fs.readFile(filepath);
  return { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
}

const PROMPT = `Compare these two images. Image 1 is the original. Image 2 is a regenerated version. STRICT JSON only:
{
  "same_person": true | false,
  "face_similarity_0_10": 0,
  "body_similarity_0_10": 0,
  "pose_preserved": true | false,
  "clothing_preserved": true | false,
  "background_changed": true | false,
  "screenshot_artifacts_removed": true | false,
  "regen_quality_0_10": 0,
  "image2_premium_score_0_10": 0,
  "ai_giveaway_visible": "string — describe any obvious AI-generation tells (plastic skin, weird hands, etc.) or 'none'",
  "verdict": "use_regen | use_original | regen_better_face_drift_acceptable | regen_unusable",
  "notes": "1-2 sentence summary"
}`;

async function main() {
  const src = await fileToInline(SRC);
  const regen = await fileToInline(REGEN);
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [
      { text: 'Image 1 (ORIGINAL):' }, src,
      { text: 'Image 2 (REGENERATED):' }, regen,
      { text: PROMPT },
    ] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  const parsed = JSON.parse(resp.text);
  console.log('--- COMPARISON: original vs regenerated ---');
  Object.entries(parsed).forEach(([k, v]) => console.log(`  ${k.padEnd(35)} ${typeof v === 'string' ? v : JSON.stringify(v)}`));
  await fs.writeFile(path.resolve('./output/data/regen_comparison.json'), JSON.stringify(parsed, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
