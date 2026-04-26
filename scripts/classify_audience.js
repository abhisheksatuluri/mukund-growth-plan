// Classify commenter profiles via Gemini for geography / occupation / persona signals.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const PROMPT = `You are analysing public Instagram profiles of users who comment on Mukund Venkat's fitness content (London-based PT, target ICP "busy London professional 30-50").

For each profile, infer the most likely:
- geography (UK / India / SE Asia / North America / EU / Africa / Other / Unknown)
- london_likelihood (0-10) — based on bio language, flags, location keywords
- occupation_class (fitness_pro | corporate_professional | creator_influencer | student | tradesperson | hospitality_service | tech | finance | healthcare | unknown)
- gender_inference (m | f | unknown)
- age_band (teen_20s | 30s | 40s | 50plus | unknown)
- icp_fit_score (0-10) — how well this person matches "busy London professional 30-50 looking to transform"
- evidence — short string of what tipped you off

Be honest about uncertainty. Many will be 'unknown'. Ethically: only use the public bio + name + biz category. Do not deanonymise or speculate beyond bio cues.

Return STRICT JSON only — array of objects, one per input profile, in same order:

[{"username":"...", "geography":"...", "london_likelihood":0, "occupation_class":"...", "gender_inference":"...", "age_band":"...", "icp_fit_score":0, "evidence":"..."}]`;

async function classifyBatch(batch) {
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          { text: '\n\nPROFILES:\n' + JSON.stringify(batch) },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });
  const text = resp.text || '';
  try {
    return JSON.parse(text);
  } catch (e) {
    return batch.map((p) => ({ username: p.username, _err: e.message }));
  }
}

async function main() {
  const profs = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'commenter_profiles.json'), 'utf8'));
  // strip noisy fields, keep what matters
  const clean = profs.map((p) => ({
    username: p.username,
    full_name: p.full_name,
    biography: p.biography,
    business_category: p.business_category,
    address: p.address,
    is_business: p.is_business,
    followers: p.followers,
    posts: p.posts,
  }));

  console.log(`[classify] ${clean.length} profiles, batches of 20`);
  const results = [];
  for (let i = 0; i < clean.length; i += 20) {
    const batch = clean.slice(i, i + 20);
    const out = await classifyBatch(batch);
    results.push(...out);
    console.log(`  batch ${i / 20 + 1}: ${out.length} classified`);
  }

  await fs.writeFile(path.join(OUT_DIR, 'audience_classification.json'), JSON.stringify(results, null, 2));

  // Aggregate
  const agg = {
    total: results.length,
    geography: {}, occupation_class: {}, age_band: {}, gender: {},
    london_likelihood_avg: 0, icp_fit_avg: 0, london_likely_high: 0, icp_fit_high: 0,
  };
  let llSum = 0, fitSum = 0;
  for (const r of results) {
    agg.geography[r.geography || 'Unknown'] = (agg.geography[r.geography || 'Unknown'] || 0) + 1;
    agg.occupation_class[r.occupation_class || 'unknown'] = (agg.occupation_class[r.occupation_class || 'unknown'] || 0) + 1;
    agg.age_band[r.age_band || 'unknown'] = (agg.age_band[r.age_band || 'unknown'] || 0) + 1;
    agg.gender[r.gender_inference || 'unknown'] = (agg.gender[r.gender_inference || 'unknown'] || 0) + 1;
    llSum += r.london_likelihood || 0;
    fitSum += r.icp_fit_score || 0;
    if ((r.london_likelihood || 0) >= 6) agg.london_likely_high++;
    if ((r.icp_fit_score || 0) >= 6) agg.icp_fit_high++;
  }
  agg.london_likelihood_avg = +(llSum / results.length).toFixed(2);
  agg.icp_fit_avg = +(fitSum / results.length).toFixed(2);

  await fs.writeFile(path.join(OUT_DIR, 'audience_aggregate.json'), JSON.stringify(agg, null, 2));
  console.log('[classify] aggregate:', JSON.stringify(agg, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
