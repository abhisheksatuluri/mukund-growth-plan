// Generate /output/index.html — single self-contained interactive roadmap.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.env.OUTPUT_DIR || './output');
const DATA = path.join(ROOT, 'data');

async function readJson(name, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, name), 'utf8'));
  } catch (e) {
    console.warn(`[html] missing ${name}: ${e.message}`);
    return fallback;
  }
}

async function readMd(name) {
  try {
    return await fs.readFile(path.join(ROOT, 'reports', name), 'utf8');
  } catch {
    return '';
  }
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const profile = await readJson('profile.json', {});
  const aggregates = await readJson('post_aggregates.json', {});
  const normalized = await readJson('normalized_posts.json', []);
  const gemini = await readJson('gemini_post_analysis.json', []);
  const synthesis = await readJson('gemini_synthesis.json', {});
  const revenue = await readJson('revenue_model.json', {});
  const sources = await readJson('research_sources.json', {});
  const audienceAgg = await readJson('audience_aggregate.json', {});
  const audienceCls = await readJson('audience_classification.json', []);
  const competitors = await readJson('competitor_analysis.json', {});

  const followers = aggregates.follower_count || profile?.followersCount || null;

  // Pre-compute a few datasets for charts
  const triggerKeys = [
    'authority', 'social_proof', 'aspiration', 'pain_agitation',
    'identity', 'fear_of_loss', 'simplicity', 'novelty',
    'relatability', 'urgency', 'self_efficacy', 'community_belonging',
  ];
  const triggerAvg = {};
  for (const k of triggerKeys) {
    const vals = gemini
      .filter((g) => g && g.psychological_triggers && typeof g.psychological_triggers[k] === 'number')
      .map((g) => g.psychological_triggers[k]);
    triggerAvg[k] = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0;
  }

  // Topic vs avg views chart data
  const topicGroups = {};
  for (const n of normalized) {
    const t = n.content_topic_cluster;
    if (!topicGroups[t]) topicGroups[t] = { count: 0, total_views: 0, total_eng: 0, view_count: 0 };
    topicGroups[t].count++;
    topicGroups[t].total_eng += (n.likes_count || 0) + (n.comments_count || 0);
    if (n.views_count) {
      topicGroups[t].total_views += n.views_count;
      topicGroups[t].view_count++;
    }
  }
  const topicChartData = Object.entries(topicGroups).map(([topic, v]) => ({
    topic,
    posts: v.count,
    avg_views: v.view_count ? Math.round(v.total_views / v.view_count) : null,
    avg_engagement: Math.round(v.total_eng / v.count),
  }));

  // Top reels with hook + improved hook from Gemini
  const reelTable = normalized
    .filter((n) => n.type === 'reel')
    .map((n) => {
      const g = gemini.find((x) => x && x.shortcode === n.shortcode) || {};
      return {
        shortcode: n.shortcode,
        url: n.url,
        views: n.views_count,
        likes: n.likes_count,
        comments: n.comments_count,
        duration_s: n.video_duration_s,
        topic: n.content_topic_cluster,
        cta_present: g.cta_present ?? n.has_clear_cta,
        hook: g.first_3_seconds_hook || '',
        hook_type: g.hook_type || '',
        hook_clarity: g.hook_clarity_0_10 ?? null,
        best_offer: g.conversion_assessment?.best_matching_offer || n.offer_alignment,
        lead_score: g.conversion_assessment?.lead_potential_0_10 ?? null,
        improved_hook: g.improved_hook || '',
        improved_cta: g.improved_cta || '',
      };
    })
    .sort((a, b) => (b.views || 0) - (a.views || 0));

  // Bundle data
  const bundle = {
    generated_at: new Date().toISOString(),
    profile: {
      username: profile?.username || 'mukun69',
      full_name: profile?.fullName || 'Mukund Venkat',
      followers,
      following: profile?.followsCount,
      posts_total: profile?.postsCount,
      bio: profile?.biography || '',
      external_url: profile?.externalUrl,
    },
    aggregates,
    revenue,
    synthesis,
    sources,
    triggerAvg,
    topicChartData,
    reelTable,
    geminiCount: gemini.filter((g) => g && !g.error).length,
    geminiErrors: gemini.filter((g) => g && g.error).length,
    normalizedCount: normalized.length,
    audienceAgg,
    audienceCls,
    competitors,
  };

  const dataScript = `<script id="bundle">window.__DATA__ = ${JSON.stringify(bundle)};</script>`;

  const TEMPLATE = await loadTemplate();
  const html = TEMPLATE.replace('{{DATA_SCRIPT}}', dataScript);
  await fs.writeFile(path.join(ROOT, 'index.html'), html);
  console.log(`[html] wrote index.html (${(html.length / 1024).toFixed(1)} kB)`);
  console.log(`[html] reels w/ Gemini: ${bundle.geminiCount}, errors: ${bundle.geminiErrors}`);
}

// Replace the inline TEMPLATE placeholder with the actual template file
async function loadTemplate() {
  return fs.readFile(path.resolve('./scripts/template.html'), 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
