// One-shot cleanup: replace "Prompt N" research refs with descriptive labels.
// Only matches capital-P "Prompt[ -]N" — preserves snake_case JS names like positioning_validation_prompt10.
import fs from 'node:fs';

const MAP = {
  '1': 'PT-market research',
  '2': 'online-coaching benchmarks',
  '3': 'corporate-wellness research',
  '4': 'creator-monetisation research',
  '5': 'HYROX research',
  '6': 'buyer-psychology research',
  '7': 'paid-acquisition research',
  '8': 'UK compliance research',
  '9': 'audience-geography research',
  '10': 'positioning research',
};

const FILES = [
  './output/data/revenue_model.json',
  './output/data/research_sources.json',
  './output/data/competitor_analysis.json',
];

for (const f of FILES) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  // "Prompt 1" / "Prompt-1" / "Prompts 1" / "Prompts 1-10" / "GPT Prompt 10" / etc.
  s = s.replace(/Prompts?[ -](\d+)/g, (m, n) => MAP[n] ? MAP[n] : m);
  s = s.replace(/Prompts 1-10/g, 'the deep-research stack'); // safety
  if (s !== before) {
    fs.writeFileSync(f, s);
    const diffCount = (before.match(/Prompts?[ -]\d+/g) || []).length;
    console.log(`[${f}] replaced ${diffCount} occurrences`);
  }
}
