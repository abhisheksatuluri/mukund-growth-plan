// Scrape @chillinwithtj using direct REST API (bypass apify-client SDK).
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.APIFY_TOKEN;
const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');
const BASE = 'https://api.apify.com/v2';

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${method} ${path} → ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

async function runActor(actorSlug, input) {
  const actId = actorSlug.replace('/', '~');
  console.log(`[apify] starting ${actorSlug}...`);
  const startRes = await api('POST', `/acts/${actId}/runs`, input);
  const runId = startRes.data.id;
  const dsId = startRes.data.defaultDatasetId;
  console.log(`  run ${runId}, dataset ${dsId}`);
  // Poll
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const stat = await api('GET', `/actor-runs/${runId}`);
    const s = stat.data.status;
    if (i % 6 === 0) console.log(`  status: ${s} (${i * 5}s elapsed)`);
    if (s === 'SUCCEEDED') break;
    if (s === 'FAILED' || s === 'ABORTED' || s === 'TIMED-OUT') throw new Error(`run ${s}`);
  }
  // Pull dataset
  const items = await api('GET', `/datasets/${dsId}/items?clean=true`);
  console.log(`  pulled ${items.length} items`);
  return items;
}

async function main() {
  await fs.mkdir(path.join(OUT_DIR, 'competitors'), { recursive: true });

  const profItems = await runActor('apify/instagram-profile-scraper', {
    usernames: ['chillinwithtj'],
  });

  const posts = await runActor('apify/instagram-scraper', {
    directUrls: ['https://www.instagram.com/chillinwithtj/'],
    resultsType: 'posts',
    resultsLimit: 30,
    addParentData: false,
  });

  const result = {
    handle: 'chillinwithtj',
    why_selected: '12-week £299 online programme — same offer model, lower price benchmark',
    website: 'https://www.fitnesswithtj.co.uk/online-personal-training/12-week-online-coaching-program',
    scraped_at: new Date().toISOString(),
    profile: profItems[0]
      ? {
          username: profItems[0].username,
          full_name: profItems[0].fullName,
          biography: profItems[0].biography,
          followers: profItems[0].followersCount,
          following: profItems[0].followsCount,
          posts_total: profItems[0].postsCount,
          external_url: profItems[0].externalUrl,
          business_category: profItems[0].businessCategoryName,
          is_verified: profItems[0].verified,
        }
      : null,
    posts,
  };
  await fs.writeFile(path.join(OUT_DIR, 'competitors/chillinwithtj.json'), JSON.stringify(result, null, 2));

  const p = result.profile || {};
  console.log('\n--- @chillinwithtj profile ---');
  console.log('full_name:', p.full_name);
  console.log('followers:', p.followers, '| following:', p.following, '| total posts:', p.posts_total);
  console.log('bio:', (p.biography || '').replace(/\n/g, ' | ').slice(0, 250));
  console.log('external:', p.external_url);
  console.log('verified:', p.is_verified, '| category:', p.business_category);

  if (posts.length) {
    const reels = posts.filter((x) => x.type === 'Video').length;
    const carousels = posts.filter((x) => x.type === 'Sidecar').length;
    const images = posts.filter((x) => x.type === 'Image').length;
    const totalLikes = posts.reduce((s, x) => s + (x.likesCount || 0), 0);
    const totalComments = posts.reduce((s, x) => s + (x.commentsCount || 0), 0);
    const videoViews = posts
      .filter((x) => x.videoViewCount || x.videoPlayCount)
      .map((x) => x.videoViewCount || x.videoPlayCount);
    const avgViews = videoViews.length
      ? Math.round(videoViews.reduce((a, b) => a + b, 0) / videoViews.length)
      : 0;
    const ctaPosts = posts.filter((x) =>
      /dm|apply|link in bio|sign up|book|enquire|comment .* below/i.test(x.caption || ''),
    ).length;
    console.log('--- metrics ---');
    console.log('mix: reels', reels, '| carousels', carousels, '| images', images);
    console.log(
      'avg likes:', Math.round(totalLikes / posts.length),
      '| avg comments:', Math.round(totalComments / posts.length),
      '| avg views:', avgViews,
    );
    console.log('ER%:', p.followers ? +(((totalLikes + totalComments) / posts.length / p.followers) * 100).toFixed(2) : '?');
    console.log('CTA posts:', ctaPosts, '/', posts.length, '=', Math.round((ctaPosts / posts.length) * 100) + '%');
    console.log('--- 5 sample captions ---');
    posts.slice(0, 5).forEach((x, i) =>
      console.log(' ', i + 1 + '.', x.type, '|', x.likesCount + '❤', x.commentsCount + '💬', '|',
        (x.caption || '').replace(/\n/g, ' ').slice(0, 140)),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
