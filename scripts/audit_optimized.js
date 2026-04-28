// Re-audit specific images after optimize+trim, comparing to originals.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';
const DIR = path.resolve('./Website/assets/optimized');
const OUT = path.resolve('./output/data/image_audit_optimized.json');

const PROMPT = `Audit this image of Mukund Venkat. STRICT JSON only:
{
  "framing_issues": ["any framing/cropping issues — empty array if clean"],
  "needs_regen": true | false,
  "best_use": "hero | story_section | proof_section | secondary | discard",
  "premium_feel_score_0_10": 0,
  "subject_intact": true | false,
  "screenshot_artifacts_visible": true | false,
  "notes": "1-line note"
}`;

const TARGETS = ['mukund_editorial_singapore.jpeg', 'mukund_mirror_gym.jpeg', 'mukund_suit_smiling.jpeg', 'mukund_suit_portrait.jpeg', 'mukund_suit_fullbody.jpeg', 'mukund_suit_side.jpeg'];

async function audit(filename) {
  const fp = path.join(DIR, filename);
  const data = await fs.readFile(fp);
  const inline = { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [inline, { text: PROMPT }] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  let parsed;
  try { parsed = JSON.parse(resp.text); } catch (e) { parsed = { _err: e.message }; }
  return { filename, ...parsed };
}

async function main() {
  const results = [];
  for (const f of TARGETS) {
    try {
      const r = await audit(f);
      results.push(r);
      console.log(`  ${f.padEnd(38)} | score=${r.premium_feel_score_0_10 ?? '?'} | subject_intact=${r.subject_intact} | screenshot=${r.screenshot_artifacts_visible} | regen=${r.needs_regen}`);
      if (r.framing_issues?.length) console.log(`     issues: ${JSON.stringify(r.framing_issues)}`);
    } catch (e) { console.error('  !', f, e.message); }
  }
  await fs.writeFile(OUT, JSON.stringify(results, null, 2));
  const subjectIntact = results.filter(r => r.subject_intact).length;
  console.log(`\n${subjectIntact}/${results.length} subjects intact after trim`);
}
main().catch(e => { console.error(e); process.exit(1); });
