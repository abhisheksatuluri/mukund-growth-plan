// Scrape commenter profiles to recover bios / location signals.
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import fs from 'node:fs/promises';
import path from 'node:path';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const MAX_COMMENTERS = 80; // cost control
const client = new ApifyClient({ token: APIFY_TOKEN });

async function main() {
  const comments = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'raw_instagram_comments.json'), 'utf8'));
  const posts = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'raw_instagram_posts.json'), 'utf8'));

  const counts = {};
  const inc = (u) => { if (u && u !== 'mukun69') counts[u] = (counts[u] || 0) + 1; };
  comments.forEach((c) => inc(c.ownerUsername || c.owner?.username));
  posts.forEach((p) =>
    (p.latestComments || []).forEach((c) => {
      inc(c.ownerUsername || c.owner?.username);
      (c.replies || []).forEach((r) => inc(r.ownerUsername || r.owner?.username));
    }),
  );

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`[commenters] unique=${ranked.length}, scraping top ${MAX_COMMENTERS}`);

  const top = ranked.slice(0, MAX_COMMENTERS).map(([u]) => u);
  await fs.writeFile(path.join(OUT_DIR, 'commenter_ranking.json'), JSON.stringify(ranked.slice(0, 200), null, 2));

  console.log('[apify] running profile scraper...');
  const run = await client.actor('apify/instagram-profile-scraper').call({
    usernames: top,
  });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[apify] returned ${items.length} profiles`);

  const slim = items.map((p) => ({
    username: p.username,
    full_name: p.fullName,
    biography: p.biography,
    external_url: p.externalUrl,
    business_category: p.businessCategoryName,
    address: p.address?.city || p.address?.country || null,
    is_verified: p.verified,
    is_private: p.private,
    is_business: p.isBusinessAccount,
    followers: p.followersCount,
    follows: p.followsCount,
    posts: p.postsCount,
    engagement_with_mukund: counts[p.username] || 0,
  }));

  await fs.writeFile(path.join(OUT_DIR, 'commenter_profiles.json'), JSON.stringify(slim, null, 2));
  console.log('[commenters] saved commenter_profiles.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
