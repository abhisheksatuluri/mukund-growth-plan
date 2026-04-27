// Phase 1: scrape 150 posts (gives us 100+ new ones beyond the existing 50)
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.APIFY_TOKEN;
const USERNAME = process.env.INSTAGRAM_USERNAME || 'mukun69';
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const BASE = 'https://api.apify.com/v2';

async function api(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function runActor(actor, input) {
  const slug = actor.replace('/', '~');
  console.log(`[apify] starting ${actor}...`);
  const start = await api('POST', `/acts/${slug}/runs`, input);
  const runId = start.data.id;
  const dsId = start.data.defaultDatasetId;
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const stat = await api('GET', `/actor-runs/${runId}`);
    if (i % 6 === 0) console.log(`  status: ${stat.data.status}`);
    if (stat.data.status === 'SUCCEEDED') break;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(stat.data.status)) throw new Error(stat.data.status);
  }
  return (await api('GET', `/datasets/${dsId}/items?clean=true`));
}

async function main() {
  console.log(`[scrape] pulling 150 most-recent posts from @${USERNAME}`);
  const posts = await runActor('apify/instagram-scraper', {
    directUrls: [`https://www.instagram.com/${USERNAME}/`],
    resultsType: 'posts',
    resultsLimit: 150,
    addParentData: false,
  });
  console.log(`[scrape] got ${posts.length} posts`);

  await fs.writeFile(path.join(OUT_DIR, 'raw_instagram_posts_150.json'), JSON.stringify(posts, null, 2));

  // De-duplicate against existing 50
  const existing = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'raw_instagram_posts.json'), 'utf8'));
  const existingIds = new Set(existing.map((p) => p.id));
  const newOnes = posts.filter((p) => !existingIds.has(p.id));
  console.log(`[scrape] ${newOnes.length} are new (not in original 50)`);
  await fs.writeFile(path.join(OUT_DIR, 'raw_instagram_posts_new.json'), JSON.stringify(newOnes, null, 2));

  // Combine for analysis
  const merged = [...existing, ...newOnes];
  await fs.writeFile(path.join(OUT_DIR, 'raw_instagram_posts_merged.json'), JSON.stringify(merged, null, 2));
  console.log(`[scrape] merged total: ${merged.length} posts`);

  // Stats
  const types = merged.reduce((a, p) => { a[p.type] = (a[p.type] || 0) + 1; return a; }, {});
  console.log('[stats] type distribution:', types);
  const reels = merged.filter((p) => p.type === 'Video').length;
  const dateOldest = merged.reduce((min, p) => (p.timestamp < min ? p.timestamp : min), '9999');
  const dateNewest = merged.reduce((max, p) => (p.timestamp > max ? p.timestamp : max), '0000');
  console.log(`[stats] ${reels} reels, range: ${dateOldest.slice(0,10)} → ${dateNewest.slice(0,10)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
