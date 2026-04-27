// Re-classify all 150 posts with explicit format detection (skit / talking-head / demo / etc.)
// Uses Gemini 2.5 Flash text-only — fast + cheap.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const PROMPT = `You are a fitness content analyst. For each Instagram post in this batch, classify the format and intent.

Format categories (pick ONE):
- skit_comedy: scripted/performative scenario, comedic timing, often syncs to music, character roles, situational humour
- skit_relatable: scripted but not comedy — relatable scenarios, "things X says" type
- skit_challenge: training challenge, race-style, viral participatory format
- talking_head_education: face-to-camera teaching, explanation, advice
- talking_head_motivation: face-to-camera mindset / inspirational
- training_demo: showing exercise/technique without scripted dialogue
- event_recap: HYROX race, competition, behind-the-scenes
- transformation: before/after, client journey, results focus
- personal_family: family milestone, anniversary, child, life moment
- promo_sales: direct offer push, "DM ELITE", apply now
- mindset_quote: philosophical caption + posed photo, no demo
- collab_sponsored: brand collab, sponsored content
- ambiguous: not enough signal to classify

For each post return strict JSON object:
{
  "post_id": "string",
  "format": "category from list above",
  "confidence_0_10": 0,
  "skit_specifics": "if skit, describe the format: solo/duo/multi-character, tone, music?, length feels?",
  "hook_quality_0_10": 0,
  "icp_relevance_0_10": 0,
  "comment_on_relevance": "1 line on why this content is or isn't matching a high-achieving 35-50 male professional ICP"
}

Return ONLY a JSON array of objects, no commentary.`;

function summary(p) {
  return {
    post_id: p.id,
    shortcode: p.shortCode,
    type: p.type,
    duration_s: p.videoDuration,
    likes: p.likesCount,
    comments: p.commentsCount,
    views: p.videoViewCount,
    timestamp: p.timestamp,
    caption: (p.caption || '').slice(0, 600),
    has_audio: !!p.musicInfo,
    audio_name: p.musicInfo?.song_name,
    hashtags: p.hashtags,
    mentions: p.mentions,
  };
}

async function classifyBatch(batch) {
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: PROMPT + '\n\nPOSTS:\n' + JSON.stringify(batch) }] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  const text = resp.text || '';
  try {
    return JSON.parse(text);
  } catch (e) {
    return batch.map((p) => ({ post_id: p.post_id, _err: e.message }));
  }
}

async function main() {
  const merged = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'raw_instagram_posts_merged.json'), 'utf8'));
  console.log(`[classify] ${merged.length} posts → format classification`);
  const compact = merged.map(summary);
  const results = [];
  const BATCH = 25;
  for (let i = 0; i < compact.length; i += BATCH) {
    const batch = compact.slice(i, i + BATCH);
    console.log(`  batch ${i / BATCH + 1}/${Math.ceil(compact.length / BATCH)} (${batch.length} posts)`);
    const out = await classifyBatch(batch);
    results.push(...out);
  }
  await fs.writeFile(path.join(OUT_DIR, 'format_classification.json'), JSON.stringify(results, null, 2));

  // Aggregate
  const formats = {};
  let totalEng = 0;
  const formatEng = {};
  for (let i = 0; i < merged.length; i++) {
    const p = merged[i];
    const c = results[i] || {};
    const f = c.format || 'unclassified';
    formats[f] = (formats[f] || 0) + 1;
    const eng = (p.likesCount || 0) + (p.commentsCount || 0);
    if (!formatEng[f]) formatEng[f] = { count: 0, totalEng: 0, totalViews: 0, viewCount: 0 };
    formatEng[f].count++;
    formatEng[f].totalEng += eng;
    if (p.videoViewCount) {
      formatEng[f].totalViews += p.videoViewCount;
      formatEng[f].viewCount++;
    }
    totalEng += eng;
  }
  console.log('\n[stats] format distribution:');
  Object.entries(formats).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${f.padEnd(28)} ${n}`));
  console.log('\n[stats] avg engagement by format:');
  Object.entries(formatEng).sort((a, b) => (b[1].totalEng / b[1].count) - (a[1].totalEng / a[1].count)).forEach(([f, v]) => {
    const avgEng = Math.round(v.totalEng / v.count);
    const avgViews = v.viewCount ? Math.round(v.totalViews / v.viewCount) : 'n/a';
    console.log(`  ${f.padEnd(28)} avg eng ${avgEng} | avg views ${avgViews} | n=${v.count}`);
  });
  await fs.writeFile(path.join(OUT_DIR, 'format_aggregates.json'), JSON.stringify({ formats, formatEng }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
