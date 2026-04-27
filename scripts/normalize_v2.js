// Normalize merged 136-post dataset with explicit FORMAT-TYPE detection.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');

// Format-type rules (in priority order — first match wins)
const FORMAT_RULES = [
  // Skit / scenario / comedic — strong signals
  ['skit', /\bskit\b|🤣|😂|comedy|scenario|when (you|your|i)|imagine if|pov:|punchline|prank|funny|joke|hilariou|bit of fun|cheeky|light.?hearted|stealth mode|🥷/i],
  // Race / event recap
  ['event_recap', /hyrox|race recap|race day|olympia|excel|finish line|pb|personal best|finishline|race week|wod\b|competition|leader.?board/i],
  // Training demo
  ['training_demo', /technique|demo|how to (do|squat|bench|deadlift|press|lift)|form check|exercise tutorial|sets and reps|programming|wall ball|sled|burpee|workout|drill/i],
  // Transformation reveal
  ['transformation', /transformation|before.?and.?after|before.?after|lost \d+kg|down \d+kg|client of the week|client transformation|results|case study|journey/i],
  // Personal / family / lifestyle
  ['personal_family', /\bson\b|\bdaughter\b|\bwife\b|husband|family|fatherhood|legacy|anniversary|birthday|10 years|love you|gratitude|holiday|travel|namaste/i],
  // Talking-head educational
  ['talking_head', /lesson|principle|truth about|the secret|mistake|stop doing|here.?s why|breakdown|explained|3 reasons|5 ways|formula|framework|the real reason|actually|how (i|we|you)/i],
  // Mindset / motivation
  ['mindset_motivation', /mindset|motivat|grind|hustle|disciplin|consistency|believe|mental|growth|goal|purpose|why|never give up|push|stronger|warrior/i],
];

const TOPIC_RULES = [
  ['hyrox_hybrid', /hyrox|hybrid|conditioning|sled|wod|crossfit|endurance|race/i],
  ['training_strength', /strength|squat|deadlift|press|bench|hypertrophy|reps|sets|muscle|gain|lift|technique|form/i],
  ['transformation', /transformation|before.?after|weight.?loss|fat.?loss|cut|bulk|body.?recomp|abs|results/i],
  ['nutrition', /nutrition|calorie|macro|protein|diet|food|meal|eat|fasting|carbs|sugar/i],
  ['mobility_recovery', /mobility|recover|sleep|stretch|injury|pain|posture|desk/i],
  ['client_story', /client|transform|story|testimonial|journey|review/i],
  ['mindset_motivation', /mindset|why|purpose|disciplin|grind|hustle|consistency|believe|mental|growth|success/i],
  ['lifestyle_personal', /life|family|travel|day in|routine|reflect|gratitude|birthday|son|daughter|wife/i],
  ['sales_offer', /apply|dm|coaching|programme|program|sign up|spots|book|elite/i],
];

const CTA_RULES = [
  ['dm', /\bdm\b\s*(me)?|message me|inbox|comment .* below|comment\s*"[A-Z]+"/i],
  ['apply', /apply|application|spots|enrol|sign up/i],
  ['link_in_bio', /link in bio|bio link/i],
  ['save_share', /save this|share this/i],
  ['follow', /follow for|hit follow/i],
];

function classify(rules, text, fallback = 'unclassified') {
  for (const [k, re] of rules) if (re.test(text)) return k;
  return fallback;
}

function detectCTA(caption) {
  for (const [k, re] of CTA_RULES) if (re.test(caption || '')) return { has_clear_cta: true, cta_type: k };
  return { has_clear_cta: false, cta_type: '' };
}

function ageDays(timestamp) {
  return Math.max(1, (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24));
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return /[",]/.test(s) ? `"${s}"` : s;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'raw_instagram_posts_merged.json'), 'utf8'));
  let profile = {};
  try {
    profile = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'profile.json'), 'utf8'));
  } catch {}
  const followers = profile.followersCount || null;

  const normalized = raw.map((p) => {
    const caption = p.caption || '';
    const fmt = classify(FORMAT_RULES, caption, 'unclassified');
    const topic = classify(TOPIC_RULES, caption, 'lifestyle_personal');
    const cta = detectCTA(caption);
    const age = ageDays(p.timestamp);
    const likes = p.likesCount === -1 ? null : p.likesCount;
    const comments = p.commentsCount || 0;
    const views = p.videoViewCount || p.videoPlayCount || null;
    const er = followers && likes != null
      ? +(((likes + comments) / followers) * 100).toFixed(3)
      : null;

    return {
      post_id: p.id,
      shortcode: p.shortCode,
      url: p.url,
      type: p.type === 'Video' ? 'reel' : p.type === 'Sidecar' ? 'carousel' : 'image',
      product_type: p.productType || null,
      caption,
      caption_length: caption.length,
      timestamp: p.timestamp,
      age_days: +age.toFixed(1),
      hashtags: p.hashtags || [],
      mentions: p.mentions || [],
      likes_count: likes,
      likes_hidden: p.likesCount === -1,
      comments_count: comments,
      views_count: views,
      plays_count: p.videoPlayCount || null,
      video_duration_s: p.videoDuration || null,
      video_url: p.videoUrl || null,
      display_url: p.displayUrl || null,
      collaborators: (p.coauthorProducers || []).map((c) => c.username || c).filter(Boolean),
      is_pinned: !!p.isPinned,
      first_comment: p.firstComment || '',
      engagement_rate_pct: er,
      likes_per_day: likes != null ? +(likes / age).toFixed(2) : null,
      comments_per_day: +(comments / age).toFixed(3),
      views_per_day: views ? +(views / age).toFixed(2) : null,
      format_type: fmt,
      content_topic_cluster: topic,
      has_clear_cta: cta.has_clear_cta,
      cta_type: cta.cta_type,
      scraped_at: new Date().toISOString(),
    };
  });

  await fs.writeFile(
    path.join(OUT_DIR, 'normalized_posts_v2.json'),
    JSON.stringify(normalized, null, 2),
  );

  // CSV
  const cols = [
    'shortcode', 'url', 'type', 'timestamp', 'age_days', 'caption_length',
    'likes_count', 'likes_hidden', 'comments_count', 'views_count', 'video_duration_s',
    'engagement_rate_pct', 'format_type', 'content_topic_cluster', 'has_clear_cta', 'cta_type',
    'caption',
  ];
  const csv = [cols.join(',')]
    .concat(normalized.map((n) => cols.map((c) => csvEscape(n[c])).join(',')))
    .join('\n');
  await fs.writeFile(path.join(OUT_DIR, 'normalized_posts_v2.csv'), csv);

  // Format-type aggregates
  const byFormat = {};
  for (const n of normalized) {
    if (!byFormat[n.format_type]) {
      byFormat[n.format_type] = { count: 0, total_views: 0, total_likes: 0, total_comments: 0, view_count: 0, like_count: 0 };
    }
    const b = byFormat[n.format_type];
    b.count++;
    if (n.views_count) { b.total_views += n.views_count; b.view_count++; }
    if (n.likes_count != null) { b.total_likes += n.likes_count; b.like_count++; }
    b.total_comments += n.comments_count;
  }
  const formatAgg = Object.entries(byFormat).map(([fmt, b]) => ({
    format_type: fmt,
    posts: b.count,
    avg_views: b.view_count ? Math.round(b.total_views / b.view_count) : null,
    avg_likes: b.like_count ? Math.round(b.total_likes / b.like_count) : null,
    avg_comments: +(b.total_comments / b.count).toFixed(1),
  }));
  formatAgg.sort((a, b) => (b.avg_views || 0) - (a.avg_views || 0));

  // Top performers per format
  const topByFormat = {};
  Object.keys(byFormat).forEach((fmt) => {
    topByFormat[fmt] = normalized
      .filter((n) => n.format_type === fmt && n.views_count)
      .sort((a, b) => b.views_count - a.views_count)
      .slice(0, 5)
      .map((n) => ({
        shortcode: n.shortcode,
        views: n.views_count,
        likes: n.likes_count,
        comments: n.comments_count,
        timestamp: n.timestamp.slice(0, 10),
        topic: n.content_topic_cluster,
        cta: n.cta_type || 'none',
        caption_preview: (n.caption || '').slice(0, 140).replace(/\n/g, ' '),
      }));
  });

  // Top reels overall by views
  const topReelsByViews = normalized
    .filter((n) => n.type === 'reel' && n.views_count)
    .sort((a, b) => b.views_count - a.views_count)
    .slice(0, 30)
    .map((n) => ({
      shortcode: n.shortcode,
      views: n.views_count,
      likes: n.likes_count,
      comments: n.comments_count,
      duration_s: n.video_duration_s,
      timestamp: n.timestamp.slice(0, 10),
      format: n.format_type,
      topic: n.content_topic_cluster,
      cta: n.cta_type || 'none',
      caption_preview: (n.caption || '').slice(0, 200).replace(/\n/g, ' '),
    }));

  const summary = {
    generated_at: new Date().toISOString(),
    total_posts: normalized.length,
    types: normalized.reduce((a, n) => { a[n.type] = (a[n.type] || 0) + 1; return a; }, {}),
    format_aggregates: formatAgg,
    top_reels_by_views: topReelsByViews,
    top_by_format: topByFormat,
    posts_with_cta: normalized.filter((n) => n.has_clear_cta).length,
    cta_rate_pct: +(normalized.filter((n) => n.has_clear_cta).length / normalized.length * 100).toFixed(1),
    likes_hidden_count: normalized.filter((n) => n.likes_hidden).length,
  };
  await fs.writeFile(path.join(OUT_DIR, 'post_aggregates_v2.json'), JSON.stringify(summary, null, 2));

  console.log('[v2] wrote normalized_posts_v2.{json,csv} + post_aggregates_v2.json');
  console.log('=== format aggregates (sorted by avg views desc) ===');
  formatAgg.forEach((f) => console.log(`  ${f.format_type.padEnd(22)} | posts=${String(f.posts).padStart(3)} | avg_views=${String(f.avg_views ?? '-').padStart(6)} | avg_likes=${String(f.avg_likes ?? '-').padStart(4)} | avg_comments=${f.avg_comments}`));
  console.log('=== CTA discipline ===');
  console.log(`  posts with CTA: ${summary.posts_with_cta}/${summary.total_posts} (${summary.cta_rate_pct}%)`);
  console.log(`  posts with hidden likes: ${summary.likes_hidden_count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
