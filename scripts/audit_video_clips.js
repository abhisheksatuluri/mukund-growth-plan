// Audit candidate IG reels for website fit — does the video have a clean section we can use silently as a background loop?
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';
const VID_DIR = path.resolve('./output/data/videos');
const OUT = path.resolve('./output/data/video_clip_audit.json');

// Retry only the ones that failed last run + a few more candidates.
const CANDIDATES = [
  { shortcode: 'DVtz6SijiHB', goal: 'hero or mindset break — 6s montage of disciplined routine' },
  { shortcode: 'DUEH7-CjCDt', goal: 'hero or method — high box jump action' },
  { shortcode: 'DUQ-nozDNqd', goal: 'story/personal — swinging son by water at golden hour' },
  { shortcode: 'DVIhQzMApAK', goal: 'mindset break / HYROX section — rowing machine partner' },
  { shortcode: 'DVLHA2WjF6x', goal: 'story/personal — son box jump emotional moment' },
];

const PROMPT = `You're auditing this short Instagram Reel for use on a premium personal-trainer website. Strict JSON only:
{
  "video_aspect": "9:16_vertical | 16:9_horizontal | 1:1_square | other",
  "has_text_overlays": true | false,
  "text_overlay_severity": "none | minimal | heavy",
  "has_audio_dialogue": true | false,
  "main_subject": "string — what is in frame most of the time",
  "action_moments_with_timestamps": ["e.g. '0:02-0:05 box jump', '0:08-0:12 deadlift'"],
  "best_clip_for_silent_background_loop": {
    "start_seconds": 0,
    "end_seconds": 0,
    "what_happens": "string",
    "why_this_works": "string"
  },
  "website_fit_score_0_10": 0,
  "recommended_role": "hero_background | story_section | proof_section | mindset_break | skip",
  "blockers": ["any reasons not to use — e.g. heavy text, talking head, low quality"]
}`;

async function uploadVideo(filePath) {
  const file = await ai.files.upload({ file: filePath, config: { mimeType: 'video/mp4' } });
  // Wait for ACTIVE
  let f = file;
  while (f.state === 'PROCESSING') {
    await new Promise((r) => setTimeout(r, 3000));
    f = await ai.files.get({ name: f.name });
  }
  if (f.state !== 'ACTIVE') throw new Error('file state ' + f.state);
  return f;
}

async function audit(shortcode, retries = 4) {
  const vp = path.join(VID_DIR, shortcode + '.mp4');
  await fs.access(vp);
  console.log(`[audit] ${shortcode}.mp4`);
  const file = await uploadVideo(vp);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ fileData: { fileUri: file.uri, mimeType: 'video/mp4' } }, { text: PROMPT }] }],
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      let parsed;
      try { parsed = JSON.parse(resp.text); } catch (e) { parsed = { _err: e.message, _raw: resp.text?.slice(0, 500) }; }
      return { shortcode, ...parsed };
    } catch (e) {
      const isRetryable = /503|429|500|fetch failed/i.test(e.message);
      if (attempt < retries && isRetryable) {
        const wait = attempt * 6000;
        console.log(`  retry ${attempt}/${retries} after ${wait}ms (${e.message.slice(0,60)})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const results = [];
  for (const c of CANDIDATES) {
    try {
      const r = await audit(c.shortcode);
      r.intended_goal = c.goal;
      results.push(r);
      console.log(`  ${c.shortcode} | ${r.video_aspect || '?'} | text=${r.text_overlay_severity || '?'} | score=${r.website_fit_score_0_10 ?? '?'} | role=${r.recommended_role || '?'}`);
      if (r.best_clip_for_silent_background_loop) console.log(`    best clip: ${r.best_clip_for_silent_background_loop.start_seconds}s-${r.best_clip_for_silent_background_loop.end_seconds}s — ${r.best_clip_for_silent_background_loop.what_happens?.slice(0,80)}`);
      await fs.writeFile(OUT, JSON.stringify(results, null, 2));
    } catch (e) {
      console.error('  !', c.shortcode, e.message);
      results.push({ shortcode: c.shortcode, error: e.message });
    }
  }
  console.log('\n--- WINNERS (score >= 7) ---');
  results.filter(r => r.website_fit_score_0_10 >= 7).forEach(r => {
    console.log(`  ${r.shortcode} → ${r.recommended_role} | ${r.best_clip_for_silent_background_loop?.start_seconds}s-${r.best_clip_for_silent_background_loop?.end_seconds}s`);
  });
}
main().catch(e => { console.error(e); process.exit(1); });
