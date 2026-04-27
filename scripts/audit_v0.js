// Quick audit of v0 high-res images to see if any are upgrades over code/assets/ versions
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DIR = path.resolve('./website/assets/from-v0');
const OUT = path.resolve('./output/data/image_audit_v0.json');

const PROMPT = `Audit this high-res photo of Mukund Venkat — London-based premium personal trainer / Mr. India medallist.
We already have a curated set; we want to know if THIS specific image is hero/story-grade.
Return STRICT JSON only:
{
  "subject": "string",
  "shot_type": "headshot | half_body | full_body | action_shot | environment | composite",
  "expression_pose": "string",
  "setting": "string",
  "premium_feel_score_0_10": 0,
  "framing_issues": ["array of any cropping/framing issues"],
  "best_use": "hero | story_section | proof_section | secondary | discard",
  "ideal_aspect_ratio": "16:9 | 9:16 | 4:5 | 1:1 | 3:2",
  "duplicate_of_curated": "if this looks like a higher-res version of an image in code/assets/, name the likely match (e.g. mukund_portrait_boss). Else 'unique'.",
  "notes": "string"
}`;

async function audit(filename) {
  const fp = path.join(DIR, filename);
  const data = await fs.readFile(fp);
  const stat = await fs.stat(fp);
  console.log(`[v0-audit] ${filename} (${(stat.size/1024).toFixed(0)} KB)`);
  const inline = { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [inline, { text: PROMPT }] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  let parsed;
  try { parsed = JSON.parse(resp.text || ''); }
  catch (e) { parsed = { _err: e.message }; }
  return { filename, size_kb: +(stat.size/1024).toFixed(0), ...parsed };
}

async function main() {
  const files = (await fs.readdir(DIR)).filter(f => /\.jpe?g$/i.test(f)).sort();
  const results = [];
  for (const f of files) {
    try { results.push(await audit(f)); }
    catch (e) { results.push({ filename: f, error: e.message }); }
    await fs.writeFile(OUT, JSON.stringify(results, null, 2));
  }
  console.log('\nDONE — summary:');
  results.forEach(r => {
    console.log(`  ${r.filename} | ${r.shot_type || '?'} | score=${r.premium_feel_score_0_10 || '?'} | use=${r.best_use || '?'} | dup=${r.duplicate_of_curated || '?'}`);
  });
}
main().catch(e => { console.error(e); process.exit(1); });
