// Aggregate Gemini per-post findings into a strategy synthesis.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const SYNTH_PROMPT = `You are now analysing the full dataset of Mukund Venkat's last 50 Instagram posts (Jan 30 → Mar 25, 2026; 31 reels analysed in detail, 19 carousels/images analysed by metrics + caption only).

Mukund's context:
- London-based personal trainer + online coach
- IG @mukun69, ~29,206 followers
- Online programme: £997 / 3 months
- In-person PT: £50-60/session, ~25-30 hrs/week, ~£5,000/month current run-rate
- Goal: reach £10,000/month gross in 90 days
- Bio CTA: "DM ELITE to Apply"

Your job is to identify the patterns that should guide his £10k/month revenue roadmap. Use the per-post Gemini analyses, scraped metrics, and aggregate stats provided.

Return STRICT JSON only, no commentary, exactly this shape:

{
  "top_performing_patterns": [{"pattern": "string", "evidence_shortcodes": ["string"], "why_it_works": "string"}],
  "worst_performing_patterns": [{"pattern": "string", "evidence_shortcodes": ["string"], "why_it_fails": "string"}],
  "triggers_used_well": ["string"],
  "triggers_missing": ["string"],
  "audience_most_responsive": "string",
  "content_offer_alignment": [{"cluster": "string", "best_offer": "online|in_person|corporate|content|none", "reasoning": "string"}],
  "formats_to_repeat": ["string"],
  "formats_to_avoid": ["string"],
  "pillars_recommended": {
    "youtube": ["string"], "instagram": ["string"], "tiktok": ["string"], "linkedin": ["string"]
  },
  "best_youtube_longform_topics": [{"title": "string", "shorts_potential_count": 0, "primary_revenue_goal": "online|in_person|corporate|content"}],
  "best_ctas_online": ["string"],
  "best_ctas_in_person": ["string"],
  "best_ctas_corporate": ["string"],
  "thirty_day_content_plan": [{"week": 0, "theme": "string", "youtube_longform": "string", "ig_reels": ["string"], "linkedin_posts": ["string"]}],
  "ninety_day_content_plan_summary": [{"month": 0, "focus": "string", "key_outcomes": ["string"]}],
  "key_risks": ["string"],
  "key_assumptions": ["string"],
  "verified_from_data": ["string"],
  "inferred_from_data": ["string"],
  "strategic_hypotheses": ["string"],
  "unknown_requires_research": ["string"]
}`;

async function main() {
  const perPost = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'gemini_post_analysis.json'), 'utf8'));
  const aggregates = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'post_aggregates.json'), 'utf8'));
  const normalized = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'normalized_posts.json'), 'utf8'));

  const ok = perPost.filter((p) => !p.error && p.psychological_triggers);

  // Build a compact summary of each analysed post for the model
  const compact = ok.map((p) => ({
    shortcode: p.shortcode,
    views: p.views_count,
    likes: p.likes_count,
    comments: p.comments_count,
    duration_s: p.video_duration_s,
    hook: p.first_3_seconds_hook,
    hook_type: p.hook_type,
    hook_clarity: p.hook_clarity_0_10,
    triggers: p.psychological_triggers,
    audience: p.audience_implied,
    problem: p.problem_addressed,
    promise: p.promise_made,
    cta_present: p.cta_present,
    cta: p.cta_text,
    best_offer: p.conversion_assessment?.best_matching_offer,
    lead_score: p.conversion_assessment?.lead_potential_0_10,
    trust_score: p.conversion_assessment?.trust_building_0_10,
    sales_score: p.conversion_assessment?.sales_readiness_0_10,
    risk: p.risk_notes,
  }));

  const carouselsImages = normalized.filter((n) => n.type !== 'reel').map((n) => ({
    shortcode: n.shortcode,
    type: n.type,
    likes: n.likes_count,
    comments: n.comments_count,
    topic: n.content_topic_cluster,
    cta_type: n.cta_type,
    caption_preview: (n.caption || '').slice(0, 220),
  }));

  const userPayload = {
    aggregate_metrics: aggregates,
    reels_analyzed: compact,
    carousels_and_images: carouselsImages,
  };

  console.log(`[synth] sending ${compact.length} reels + ${carouselsImages.length} carousels/images to ${MODEL}`);

  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYNTH_PROMPT },
          { text: '\n\nDATA:\n' + JSON.stringify(userPayload) },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  const text = resp.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parsed = { _parse_error: e.message, _raw: text };
  }
  parsed._meta = {
    generated_at: new Date().toISOString(),
    reels_analyzed: compact.length,
    carousels_summarized: carouselsImages.length,
    model: MODEL,
  };

  await fs.writeFile(path.join(OUT_DIR, 'gemini_synthesis.json'), JSON.stringify(parsed, null, 2));
  console.log('[synth] wrote gemini_synthesis.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
