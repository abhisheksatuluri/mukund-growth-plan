// Re-audit the cropped images to see if cropping alone fixed audit-flagged issues.
// Same prompt + structure as audit_assets.js, just pointed at ./Website/assets/cropped
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ASSETS_DIR = path.resolve('./Website/assets/cropped');
const OUT = path.resolve('./output/data/image_audit_cropped.json');

const PROMPT = `Audit this image of Mukund Venkat — London-based premium personal trainer. STRICT JSON only:
{
  "shot_type": "headshot | half_body | full_body | action_shot | environment | composite | screenshot",
  "framing_issues": ["any remaining framing/cropping issues — if none, empty array"],
  "needs_regen": true | false,
  "regen_reason": "why or why not",
  "best_use": "hero | story_section | proof_section | secondary | discard",
  "premium_feel_score_0_10": 0,
  "improvement_vs_original": "much_better | better | same | worse",
  "notes": "string"
}`;

async function audit(filename) {
  const fp = path.join(ASSETS_DIR, filename);
  const data = await fs.readFile(fp);
  const stat = await fs.stat(fp);
  console.log(`[audit-crop] ${filename} (${(stat.size/1024).toFixed(0)} KB)`);
  const inline = { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [inline, { text: PROMPT }] }],
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      let parsed;
      try { parsed = JSON.parse(resp.text || ''); } catch (e) { parsed = { _err: e.message }; }
      return { filename, size_kb: +(stat.size/1024).toFixed(0), ...parsed };
    } catch (e) {
      const isRetryable = /503|429|500/.test(e.message);
      if (attempt < 3 && isRetryable) {
        console.log(`  retry ${attempt}/3 after ${attempt*4}s: ${e.message.slice(0,60)}`);
        await new Promise(r => setTimeout(r, attempt * 4000));
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const files = (await fs.readdir(ASSETS_DIR)).filter(f => /\.jpe?g$/i.test(f)).sort();
  const results = [];
  for (const f of files) {
    try { results.push(await audit(f)); }
    catch (e) { results.push({ filename: f, error: e.message }); }
    await fs.writeFile(OUT, JSON.stringify(results, null, 2));
  }
  console.log('\n--- CROPPED AUDIT SUMMARY ---');
  results.forEach(r => {
    if (r.error) { console.log(`  ${r.filename} | ERROR: ${r.error}`); return; }
    console.log(`  ${r.filename.padEnd(38)} | ${(r.shot_type || '?').padEnd(12)} | score=${r.premium_feel_score_0_10 ?? '?'} | regen=${r.needs_regen ? 'YES' : 'no'} | vs orig: ${r.improvement_vs_original || '?'}`);
  });
  const avgScore = +(results.filter(r => r.premium_feel_score_0_10).reduce((s,r) => s + r.premium_feel_score_0_10, 0) / results.length).toFixed(1);
  const stillNeedRegen = results.filter(r => r.needs_regen).map(r => r.filename);
  console.log(`\nAvg score: ${avgScore}/10 (was 6.8 on originals)`);
  console.log(`Still need regen: ${stillNeedRegen.length} (was 12)`);
  if (stillNeedRegen.length) console.log('  →', stillNeedRegen.join(', '));
}
main().catch(e => { console.error(e); process.exit(1); });
