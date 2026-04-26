// Pull data from any ABORTED runs I haven't already saved.
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import fs from 'node:fs/promises';
import path from 'node:path';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');

async function main() {
  const runs = await client.runs().list({ desc: true, limit: 50 });
  // Filter to ABORTED runs from the last 24 hours
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const aborted = runs.items.filter(
    (r) => r.status === 'ABORTED' && new Date(r.startedAt).getTime() > cutoff,
  );
  console.log(`aborted runs (last 24h): ${aborted.length}`);

  for (const r of aborted) {
    console.log(`\n--- ABORTED ${r.id} (dataset ${r.defaultDatasetId}) ---`);
    console.log(`  started: ${r.startedAt}`);
    console.log(`  duration: ${((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(0)}s`);
    if (!r.defaultDatasetId) continue;

    try {
      const ds = await client.dataset(r.defaultDatasetId).get();
      console.log(`  dataset itemCount: ${ds?.itemCount}`);
      if (ds?.itemCount > 0) {
        const { items } = await client.dataset(r.defaultDatasetId).listItems();
        console.log(`  pulled ${items.length} items`);

        // Detect what kind of items these are
        const sample = items[0];
        const keys = Object.keys(sample || {}).slice(0, 12).join(',');
        console.log(`  fields: ${keys}`);

        // Save with descriptive name
        const filename = `aborted_run_${r.id.slice(0, 8)}.json`;
        await fs.writeFile(path.join(OUT_DIR, filename), JSON.stringify(items, null, 2));
        console.log(`  saved → ${filename}`);

        // Show what usernames or shortcodes are in there
        const usernames = [...new Set(items.map((i) => i.username || i.ownerUsername || i.owner?.username).filter(Boolean))].slice(0, 10);
        if (usernames.length) console.log(`  usernames: ${usernames.join(', ')}`);
        const shortcodes = [...new Set(items.map((i) => i.shortCode).filter(Boolean))].slice(0, 5);
        if (shortcodes.length) console.log(`  shortcodes (sample): ${shortcodes.join(', ')}`);
        const inputUrls = [...new Set(items.map((i) => i.inputUrl).filter(Boolean))].slice(0, 5);
        if (inputUrls.length) console.log(`  inputUrls: ${inputUrls.join(', ')}`);
      }
    } catch (e) {
      console.log(`  ! error: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
