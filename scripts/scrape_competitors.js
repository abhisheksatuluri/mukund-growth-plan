// Scrape 3 direct UK competitor IG profiles + last 30 posts each.
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import fs from 'node:fs/promises';
import path from 'node:path';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const client = new ApifyClient({ token: APIFY_TOKEN });

const COMPETITORS = [
  {
    handle: 'enricoargentin',
    why: 'London PT / Online Coach — direct match (London + online + male)',
    website: null,
  },
  {
    handle: 'fitnesswithtj',
    why: '12-week online program £299 with 15+ transformations — same offer model, lower price point benchmark',
    website: 'https://www.fitnesswithtj.co.uk/online-personal-training/12-week-online-coaching-program',
  },
  {
    handle: 'jamesdeag',
    why: 'HYROX/Hybrid Athlete coach — Mukund\'s strongest pillar; sells via @hybrid.athlete.club',
    website: null,
  },
];

const POST_LIMIT = 30;

async function runActor(actor, input) {
  const run = await client.actor(actor).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items;
}

async function main() {
  await fs.mkdir(path.join(OUT_DIR, 'competitors'), { recursive: true });

  // Profiles in one shot
  console.log('[apify] competitor profiles...');
  const profiles = await runActor('apify/instagram-profile-scraper', {
    usernames: COMPETITORS.map((c) => c.handle),
  });
  console.log(`[apify] got ${profiles.length} profiles`);

  // Posts per competitor
  const all = [];
  for (const c of COMPETITORS) {
    console.log(`[apify] posts for @${c.handle}...`);
    try {
      const posts = await runActor('apify/instagram-scraper', {
        directUrls: [`https://www.instagram.com/${c.handle}/`],
        resultsType: 'posts',
        resultsLimit: POST_LIMIT,
        addParentData: false,
      });
      console.log(`  → ${posts.length} posts`);
      const profile = profiles.find((p) => p.username === c.handle);
      const result = {
        handle: c.handle,
        why_selected: c.why,
        website: c.website,
        scraped_at: new Date().toISOString(),
        profile: profile
          ? {
              username: profile.username,
              full_name: profile.fullName,
              biography: profile.biography,
              followers: profile.followersCount,
              following: profile.followsCount,
              posts_total: profile.postsCount,
              external_url: profile.externalUrl,
              business_category: profile.businessCategoryName,
              is_verified: profile.verified,
            }
          : null,
        posts,
      };
      all.push(result);
      await fs.writeFile(
        path.join(OUT_DIR, 'competitors', `${c.handle}.json`),
        JSON.stringify(result, null, 2),
      );
    } catch (err) {
      console.error(`  ! @${c.handle} error: ${err.message}`);
      all.push({ handle: c.handle, error: err.message });
    }
  }

  await fs.writeFile(path.join(OUT_DIR, 'competitors.json'), JSON.stringify(all, null, 2));
  console.log('[done] competitor scrape complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
