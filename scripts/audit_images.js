// Silently audit all images in website/public/ using Gemini vision.
// Outputs structured JSON describing each image. No display in chat.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PUBLIC_DIR = path.resolve('./website/public');
const OUT_FILE = path.resolve('./website/image_audit.json');

const PROMPT = `Audit this image of Mukund Venkat — a London-based premium personal trainer / Mr. India medallist.

Return STRICT JSON only, no markdown:

{
  "subject": "string — what's in the image (Mukund alone, with client, training scene, posed portrait, etc.)",
  "shot_type": "headshot | half_body | full_body | action_shot | environment | composite | screenshot",
  "expression_pose": "string — describe the energy/pose",
  "setting": "string — gym, studio, outdoor, home, etc.",
  "lighting": "natural | studio | mixed | poor | dramatic",
  "image_quality": "high | medium | low",
  "composition_quality": "premium | good | average | poor",
  "framing_issues": ["array of any framing/cropping issues — e.g. 'too tight on top', 'awkward bottom crop', 'subject off-centre poorly'"],
  "needs_regen": true | false,
  "regen_reason": "string — why or why not",
  "best_use": "hero | story_section | proof_section | secondary | discard",
  "premium_feel_score_0_10": 0,
  "ideal_aspect_ratio": "16:9 | 9:16 | 4:5 | 1:1 | 3:2",
  "regeneration_prompt_if_needed": "string — exact prompt to use for Gemini image regen, preserving Mukund's face/body identity, only fixing framing/lighting/background. Be VERY specific about: he is a fit Indian-British man, ~5'9\\", muscular athletic build, short black hair, clean-shaven or short beard, dark brown eyes. NEVER change his identity. Only adjust framing/lighting/setting/composition.",
  "notes": "string — anything else worth noting"
}`;

async function fileToInline(filepath) {
  const data = await fs.readFile(filepath);
  const ext = path.extname(filepath).toLowerCase().slice(1);
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { inlineData: { data: data.toString('base64'), mimeType } };
}

async function auditOne(filename) {
  const filepath = path.join(PUBLIC_DIR, filename);
  const stat = await fs.stat(filepath);
  console.log(`[audit] ${filename} (${(stat.size/1024).toFixed(0)} KB)`);
  const inline = await fileToInline(filepath);
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [inline, { text: PROMPT }] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  const text = resp.text || '';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { parsed = { _parse_error: e.message, _raw: text.slice(0, 1000) }; }
  return {
    filename,
    size_kb: +(stat.size/1024).toFixed(0),
    ...parsed,
  };
}

async function main() {
  const files = (await fs.readdir(PUBLIC_DIR))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();
  console.log(`[audit] processing ${files.length} images sequentially`);
  const results = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const r = await auditOne(files[i]);
      results.push(r);
      // Save progress after each
      await fs.writeFile(OUT_FILE, JSON.stringify(results, null, 2));
    } catch (e) {
      console.error(`  ! ${files[i]}: ${e.message}`);
      results.push({ filename: files[i], error: e.message });
    }
  }
  // Aggregate
  const summary = {
    total: results.length,
    by_shot_type: {},
    by_best_use: {},
    needs_regen_count: results.filter((r) => r.needs_regen).length,
    avg_premium_score: +(results.filter((r) => r.premium_feel_score_0_10).reduce((s,r) => s + r.premium_feel_score_0_10, 0) / results.length).toFixed(1),
    discard_candidates: results.filter((r) => r.best_use === 'discard').map((r) => r.filename),
    hero_candidates: results.filter((r) => r.best_use === 'hero').map((r) => ({ file: r.filename, score: r.premium_feel_score_0_10 })),
  };
  results.forEach((r) => {
    if (r.shot_type) summary.by_shot_type[r.shot_type] = (summary.by_shot_type[r.shot_type] || 0) + 1;
    if (r.best_use) summary.by_best_use[r.best_use] = (summary.by_best_use[r.best_use] || 0) + 1;
  });
  await fs.writeFile(path.resolve('./website/image_audit_summary.json'), JSON.stringify(summary, null, 2));
  console.log('[audit] done →', OUT_FILE);
  console.log('[audit] summary:', JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
