// Scrape last N Instagram posts via Apify and save raw JSON.
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import fs from 'node:fs/promises';
import path from 'node:path';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const USERNAME = process.env.INSTAGRAM_USERNAME || 'mukun69';
const POST_LIMIT = parseInt(process.env.POST_LIMIT || '50', 10);
const MAX_COMMENTS = parseInt(process.env.MAX_COMMENTS_PER_POST || '30', 10);
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');

if (!APIFY_TOKEN) {
  console.error('APIFY_TOKEN missing in .env');
  process.exit(1);
}

const client = new ApifyClient({ token: APIFY_TOKEN });

async function runActor(actorId, input) {
  console.log(`[apify] running actor ${actorId}...`);
  const run = await client.actor(actorId).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[apify] actor ${actorId} returned ${items.length} items`);
  return items;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Profile scraper for follower / bio info
  let profile = null;
  try {
    const profileItems = await runActor('apify/instagram-profile-scraper', {
      usernames: [USERNAME],
    });
    profile = profileItems[0] || null;
    await fs.writeFile(
      path.join(OUT_DIR, 'profile.json'),
      JSON.stringify(profile, null, 2),
    );
    console.log(
      `[profile] ${profile?.username} | followers=${profile?.followersCount} | following=${profile?.followsCount}`,
    );
  } catch (err) {
    console.warn(`[profile] failed: ${err.message}`);
  }

  // Posts via instagram-scraper (covers posts + reels with metrics)
  const posts = await runActor('apify/instagram-scraper', {
    directUrls: [`https://www.instagram.com/${USERNAME}/`],
    resultsType: 'posts',
    resultsLimit: POST_LIMIT,
    addParentData: false,
  });

  await fs.writeFile(
    path.join(OUT_DIR, 'raw_instagram_posts.json'),
    JSON.stringify(posts, null, 2),
  );
  console.log(`[posts] saved ${posts.length} -> raw_instagram_posts.json`);

  // Pull top comments for top-engagement posts only (cost control)
  const sorted = [...posts].sort(
    (a, b) =>
      (b.likesCount || b.likes_count || 0) +
      (b.commentsCount || b.comments_count || 0) -
      ((a.likesCount || a.likes_count || 0) +
        (a.commentsCount || a.comments_count || 0)),
  );
  const topUrls = sorted
    .slice(0, 15)
    .map((p) => p.url || p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null)
    .filter(Boolean);

  let comments = [];
  if (topUrls.length) {
    try {
      comments = await runActor('apify/instagram-comment-scraper', {
        directUrls: topUrls,
        resultsLimit: MAX_COMMENTS,
      });
    } catch (err) {
      console.warn(`[comments] failed: ${err.message}`);
    }
  }
  await fs.writeFile(
    path.join(OUT_DIR, 'raw_instagram_comments.json'),
    JSON.stringify(comments, null, 2),
  );
  console.log(`[comments] saved ${comments.length} comments`);
  console.log('[done] scrape complete');
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
