// Run Gemini video analysis on each reel. Uses Files API for upload.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const VIDEO_DIR = path.join(OUT_DIR, 'videos');
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CONCURRENCY = 2;

if (!GEMINI_KEY) {
  console.error('GEMINI_API_KEY missing');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const PROMPT = `You are analysing an Instagram fitness video for Mukund Venkat, a London-based personal trainer and online coach (@mukun69, ~29k followers). His online programme is £997/3 months. He coaches in-person in London and wants to build corporate wellness work.

Analyse this video for content strategy, sales psychology, and revenue conversion potential. Be honest, specific, and concrete — reference timestamps where possible.

Ethics: do not recommend manipulative tactics. Focus on ethical persuasion: clarity, empathy, authority, specificity, trust, proof, self-efficacy. Flag any medical-claim, body-shaming, or compliance risk.

Return STRICT JSON ONLY (no markdown, no commentary), exactly this shape:

{
  "transcript": "string — verbatim spoken words if audible, or 'no spoken audio'",
  "visual_summary": "1-3 sentences",
  "first_3_seconds_hook": "string — exact first words / first visual",
  "hook_type": "question | bold_claim | demo | story | curiosity | mistake_callout | result_reveal | other",
  "hook_clarity_0_10": 0,
  "hook_pattern_interrupt_0_10": 0,
  "audience_implied": ["string"],
  "problem_addressed": "string",
  "promise_made": "string",
  "psychological_triggers": {
    "authority": 0, "social_proof": 0, "aspiration": 0, "pain_agitation": 0,
    "identity": 0, "fear_of_loss": 0, "simplicity": 0, "novelty": 0,
    "relatability": 0, "urgency": 0, "self_efficacy": 0, "community_belonging": 0
  },
  "emotional_tone": ["string"],
  "authority_signals": ["string"],
  "social_proof_signals": ["string"],
  "relatability_signals": ["string"],
  "cta_present": false,
  "cta_text": "",
  "cta_strength_0_10": 0,
  "production_notes": {
    "camera_style": "string", "lighting": "string", "editing_pace": "string",
    "audio_quality": "string", "setting": "string",
    "difficulty_to_reproduce": "low | medium | high"
  },
  "conversion_assessment": {
    "online_coaching_score_0_10": 0,
    "in_person_pt_score_0_10": 0,
    "corporate_wellness_score_0_10": 0,
    "best_matching_offer": "online | in_person | corporate | content | none",
    "lead_potential_0_10": 0,
    "trust_building_0_10": 0,
    "sales_readiness_0_10": 0,
    "recommended_next_cta": "string"
  },
  "content_repurpose_notes": {
    "youtube_longform_potential": "string",
    "shorts_cutdown_potential": "string",
    "linkedin_angle": "string",
    "tiktok_angle": ""
  },
  "improved_hook": "string — one rewritten 5-second hook",
  "improved_cta": "string — one rewritten direct CTA",
  "improved_caption": "string — one rewritten caption under 600 chars",
  "risk_notes": {
    "medical_claim_risk": "none | low | medium | high",
    "body_shaming_risk": "none | low | medium | high",
    "misleading_claim_risk": "none | low | medium | high",
    "needs_disclaimer": false
  },
  "confidence_0_10": 0,
  "confidence_reasons": "string"
}`;

async function downloadVideo(url, filepath) {
  try {
    await fs.access(filepath);
    const stat = await fs.stat(filepath);
    if (stat.size > 1000) return true;
  } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const stream = createWriteStream(filepath);
  await finished(Readable.fromWeb(res.body).pipe(stream));
  return true;
}

async function uploadVideo(filepath, displayName) {
  const file = await ai.files.upload({
    file: filepath,
    config: { mimeType: 'video/mp4', displayName },
  });
  // Wait for ACTIVE
  let info = file;
  for (let i = 0; i < 30; i++) {
    if (info.state === 'ACTIVE') return info;
    if (info.state === 'FAILED') throw new Error('file processing failed');
    await new Promise((r) => setTimeout(r, 4000));
    info = await ai.files.get({ name: info.name });
  }
  throw new Error('file processing timed out');
}

function extractJson(text) {
  // strip code fences
  let t = text.replace(/```json\s*/i, '').replace(/```$/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (e) {
    return { _parse_error: e.message, _raw: text.slice(0, 2000) };
  }
}

async function analyzeOne(reel, idx, total) {
  const filename = `${reel.shortcode}.mp4`;
  const filepath = path.join(VIDEO_DIR, filename);

  const result = {
    post_url: reel.url,
    shortcode: reel.shortcode,
    timestamp: reel.timestamp,
    views_count: reel.views_count,
    likes_count: reel.likes_count,
    comments_count: reel.comments_count,
    video_duration_s: reel.video_duration_s,
    caption: reel.caption,
    error: null,
  };

  try {
    console.log(`[${idx}/${total}] download ${reel.shortcode}`);
    await downloadVideo(reel.video_url, filepath);

    console.log(`[${idx}/${total}] upload ${reel.shortcode}`);
    const uploaded = await uploadVideo(filepath, reel.shortcode);

    console.log(`[${idx}/${total}] analyze ${reel.shortcode}`);
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
            { text: `Caption (for context only):\n${reel.caption || '(no caption)'}\n\n${PROMPT}` },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const text = resp.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    Object.assign(result, extractJson(text));

    // Cleanup remote file
    try { await ai.files.delete({ name: uploaded.name }); } catch {}

    return result;
  } catch (err) {
    result.error = err.message;
    console.error(`[${idx}/${total}] ERROR ${reel.shortcode}: ${err.message}`);
    return result;
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx + 1, items.length);
      // checkpoint after each
      await fs.writeFile(
        path.join(OUT_DIR, 'gemini_post_analysis.json'),
        JSON.stringify(out.filter(Boolean), null, 2),
      );
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

async function main() {
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  const normalized = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'normalized_posts.json'), 'utf8'));
  const reels = normalized.filter((p) => p.type === 'reel' && p.video_url);
  console.log(`[gemini] analyzing ${reels.length} reels with ${MODEL} (concurrency=${CONCURRENCY})`);

  const results = await pool(reels, CONCURRENCY, analyzeOne);
  await fs.writeFile(
    path.join(OUT_DIR, 'gemini_post_analysis.json'),
    JSON.stringify(results, null, 2),
  );

  const ok = results.filter((r) => !r.error).length;
  const failed = results.filter((r) => r.error).length;
  console.log(`[gemini] done. ok=${ok} failed=${failed}`);
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
