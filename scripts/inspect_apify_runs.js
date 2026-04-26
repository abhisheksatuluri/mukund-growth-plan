// List recent Apify runs (all statuses) and pull data from any I haven't yet.
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import fs from 'node:fs/promises';
import path from 'node:path';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');

async function main() {
  console.log('--- recent runs (all statuses) ---');
  const runs = await client.runs().list({ desc: true, limit: 50 });
  console.log(`got ${runs.items.length} runs`);
  console.log('');

  for (const r of runs.items) {
    const minutes = ((Date.now() - new Date(r.startedAt).getTime()) / 60000).toFixed(1);
    const dur = r.finishedAt
      ? ((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(0) + 's'
      : '(running)';
    console.log(
      `${(r.status||'?').padEnd(11)} | ${(r.actorId||'?').padEnd(22)} | started ${minutes}m ago | dur ${dur} | dsId=${r.defaultDatasetId}`,
    );
  }

  // For each completed/succeeded run, count items in dataset
  console.log('\n--- dataset item counts (completed runs) ---');
  for (const r of runs.items) {
    if (r.status !== 'SUCCEEDED' && r.status !== 'ABORTED') continue;
    if (!r.defaultDatasetId) continue;
    try {
      const ds = await client.dataset(r.defaultDatasetId).get();
      const meta = ds || {};
      console.log(
        `${r.status} ${r.id} | actor ${r.actorId} | dataset items=${meta.itemCount} | finished ${r.finishedAt}`,
      );
      // Pull a small sample of unique fields
      if (meta.itemCount && meta.itemCount > 0 && meta.itemCount < 1000) {
        const { items } = await client.dataset(r.defaultDatasetId).listItems({ limit: 5 });
        if (items.length) {
          const usernames = [...new Set(items.map((i) => i.username || i.ownerUsername).filter(Boolean))];
          if (usernames.length) console.log(`   sample usernames: ${usernames.slice(0, 10).join(', ')}`);
        }
      }
    } catch (e) {
      console.log(`  ! couldn't read dataset for ${r.id}: ${e.message}`);
    }
  }

  // Save the full run list for reference
  await fs.writeFile(path.join(OUT_DIR, 'apify_runs.json'), JSON.stringify(runs.items, null, 2));
  console.log('\n[saved] apify_runs.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
