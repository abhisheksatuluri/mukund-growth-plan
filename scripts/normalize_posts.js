// Normalize raw Instagram posts: derive engagement, classify topic, funnel stage, offer alignment.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');

const TOPIC_RULES = [
  ['mindset_motivation', /mindset|why|purpose|disciplin|grind|hustle|consistency|believe|mental|growth|success/i],
  ['training_strength', /strength|squat|deadlift|press|bench|hypertrophy|reps|sets|muscle|gain|lift|technique|form/i],
  ['hyrox_hybrid', /hyrox|hybrid|conditioning|run|row|sled|wod|crossfit|endurance/i],
  ['transformation', /transformation|before.?after|weight.?loss|fat.?loss|cut|bulk|body.?recomp|abs|results/i],
  ['nutrition', /nutrition|calorie|macro|protein|diet|food|meal|eat|fasting|carbs|sugar/i],
  ['mobility_recovery', /mobility|recover|sleep|stretch|injury|pain|posture|desk/i],
  ['client_story', /client|transform|story|testimonial|journey|case study|review/i],
  ['lifestyle_personal', /life|family|travel|day in|routine|reflect|gratitude|birthday/i],
  ['sales_offer', /apply|dm|coaching|programme|program|sign up|spots|book|elite/i],
];

const CTA_RULES = [
  ['dm', /dm\s*(me)?|message me|inbox/i],
  ['apply', /apply|application|spots|enrol|sign up/i],
  ['link_in_bio', /link in bio|bio link/i],
  ['comment', /comment .* below|comment\s*"|tag a friend/i],
  ['save_share', /save this|share this/i],
  ['follow', /follow for|hit follow/i],
];

function classifyTopic(text) {
  const hits = TOPIC_RULES.filter(([, re]) => re.test(text)).map(([k]) => k);
  return hits[0] || 'lifestyle_personal';
}

function detectCTA(caption) {
  for (const [k, re] of CTA_RULES) if (re.test(caption || '')) return { has_clear_cta: true, cta_type: k };
  return { has_clear_cta: false, cta_type: '' };
}

function offerAlignment(topic, caption) {
  const c = (caption || '').toLowerCase();
  if (/elite|coaching|apply|programme|program|3.month|12.week|997/.test(c)) return 'online';
  if (topic === 'sales_offer') return 'online';
  if (topic === 'client_story' || topic === 'transformation') return 'online';
  if (topic === 'training_strength' || topic === 'hyrox_hybrid') return 'online';
  if (topic === 'mindset_motivation') return 'content';
  if (topic === 'nutrition' || topic === 'mobility_recovery') return 'content';
  return 'none';
}

function funnelStage(topic, hasCTA, ctaType) {
  if (ctaType === 'apply' || ctaType === 'dm') return 'conversion';
  if (topic === 'client_story' || topic === 'transformation') return 'trust';
  if (hasCTA) return 'conversion';
  return 'awareness';
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
  const raw = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'raw_instagram_posts.json'), 'utf8'));
  let profile = {};
  try {
    profile = JSON.parse(await fs.readFile(path.join(OUT_DIR, 'profile.json'), 'utf8'));
  } catch {}
  const followers = profile.followersCount || null;

  const normalized = raw.map((p) => {
    const caption = p.caption || '';
    const topic = classifyTopic(caption);
    const cta = detectCTA(caption);
    const align = offerAlignment(topic, caption);
    const stage = funnelStage(topic, cta.has_clear_cta, cta.cta_type);
    const age = ageDays(p.timestamp);
    const likes = p.likesCount || 0;
    const comments = p.commentsCount || 0;
    const views = p.videoViewCount || p.videoPlayCount || null;
    const er =
      followers && (likes + comments) >= 0
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
      comments_count: comments,
      views_count: views,
      plays_count: p.videoPlayCount || null,
      video_duration_s: p.videoDuration || null,
      video_url: p.videoUrl || null,
      display_url: p.displayUrl || null,
      audio_name: p.musicInfo?.song_name || p.audioUrl || null,
      collaborators: p.coauthorProducers || [],
      is_pinned: !!p.isPinned,
      first_comment: p.firstComment || '',
      top_comments: (p.latestComments || []).slice(0, 5).map((c) => ({
        username: c.ownerUsername,
        text: c.text,
        likes: c.likesCount || 0,
      })),
      engagement_rate_pct: er,
      likes_per_day: +(likes / age).toFixed(2),
      comments_per_day: +(comments / age).toFixed(3),
      views_per_day: views ? +(views / age).toFixed(2) : null,
      comment_to_like_ratio: likes ? +(comments / likes).toFixed(3) : null,
      content_topic_cluster: topic,
      has_clear_cta: cta.has_clear_cta,
      cta_type: cta.cta_type,
      funnel_stage: stage,
      offer_alignment: align,
      scraped_at: new Date().toISOString(),
    };
  });

  await fs.writeFile(
    path.join(OUT_DIR, 'normalized_posts.json'),
    JSON.stringify(normalized, null, 2),
  );

  // CSV
  const cols = [
    'post_id', 'shortcode', 'url', 'type', 'product_type', 'timestamp', 'age_days',
    'caption_length', 'likes_count', 'comments_count', 'views_count', 'plays_count',
    'video_duration_s', 'engagement_rate_pct', 'likes_per_day', 'comments_per_day',
    'views_per_day', 'comment_to_like_ratio', 'content_topic_cluster', 'has_clear_cta',
    'cta_type', 'funnel_stage', 'offer_alignment', 'is_pinned', 'caption',
  ];
  const csv = [cols.join(',')]
    .concat(normalized.map((n) => cols.map((c) => csvEscape(n[c])).join(',')))
    .join('\n');
  await fs.writeFile(path.join(OUT_DIR, 'normalized_posts.csv'), csv);

  // Aggregates
  const agg = {
    follower_count: followers,
    total_posts: normalized.length,
    types: {},
    topic_counts: {},
    funnel_stage_counts: {},
    offer_alignment_counts: {},
    cta_counts: {},
    avg_engagement_rate_pct: null,
    avg_likes: 0,
    avg_comments: 0,
    avg_views_video: 0,
    median_views_video: null,
    top_posts_by_engagement: [],
    top_posts_by_views: [],
    bottom_posts_by_views: [],
    posts_with_cta: 0,
    posts_with_apply_or_dm: 0,
  };

  const ers = normalized.filter((n) => n.engagement_rate_pct != null).map((n) => n.engagement_rate_pct);
  agg.avg_engagement_rate_pct = ers.length ? +(ers.reduce((a, b) => a + b, 0) / ers.length).toFixed(3) : null;
  agg.avg_likes = +(normalized.reduce((a, b) => a + b.likes_count, 0) / normalized.length).toFixed(0);
  agg.avg_comments = +(normalized.reduce((a, b) => a + b.comments_count, 0) / normalized.length).toFixed(1);
  const videoViews = normalized.filter((n) => n.views_count).map((n) => n.views_count);
  agg.avg_views_video = videoViews.length ? +(videoViews.reduce((a, b) => a + b, 0) / videoViews.length).toFixed(0) : 0;
  agg.median_views_video = videoViews.length
    ? videoViews.sort((a, b) => a - b)[Math.floor(videoViews.length / 2)]
    : null;

  for (const n of normalized) {
    agg.types[n.type] = (agg.types[n.type] || 0) + 1;
    agg.topic_counts[n.content_topic_cluster] = (agg.topic_counts[n.content_topic_cluster] || 0) + 1;
    agg.funnel_stage_counts[n.funnel_stage] = (agg.funnel_stage_counts[n.funnel_stage] || 0) + 1;
    agg.offer_alignment_counts[n.offer_alignment] = (agg.offer_alignment_counts[n.offer_alignment] || 0) + 1;
    if (n.cta_type) agg.cta_counts[n.cta_type] = (agg.cta_counts[n.cta_type] || 0) + 1;
    if (n.has_clear_cta) agg.posts_with_cta++;
    if (n.cta_type === 'apply' || n.cta_type === 'dm') agg.posts_with_apply_or_dm++;
  }

  const sortedByEng = [...normalized].sort((a, b) => (b.likes_count + b.comments_count) - (a.likes_count + a.comments_count));
  agg.top_posts_by_engagement = sortedByEng.slice(0, 10).map((p) => ({
    shortcode: p.shortcode,
    url: p.url,
    type: p.type,
    likes: p.likes_count,
    comments: p.comments_count,
    views: p.views_count,
    topic: p.content_topic_cluster,
    caption_preview: (p.caption || '').slice(0, 160),
  }));

  const sortedByViews = [...normalized].filter((p) => p.views_count).sort((a, b) => b.views_count - a.views_count);
  agg.top_posts_by_views = sortedByViews.slice(0, 10).map((p) => ({
    shortcode: p.shortcode,
    url: p.url,
    views: p.views_count,
    likes: p.likes_count,
    comments: p.comments_count,
    topic: p.content_topic_cluster,
    duration_s: p.video_duration_s,
    caption_preview: (p.caption || '').slice(0, 160),
  }));
  agg.bottom_posts_by_views = sortedByViews.slice(-5).map((p) => ({
    shortcode: p.shortcode,
    url: p.url,
    views: p.views_count,
    likes: p.likes_count,
    topic: p.content_topic_cluster,
    caption_preview: (p.caption || '').slice(0, 160),
  }));

  await fs.writeFile(path.join(OUT_DIR, 'post_aggregates.json'), JSON.stringify(agg, null, 2));

  console.log('[normalize] wrote normalized_posts.json, normalized_posts.csv, post_aggregates.json');
  console.log('[normalize] summary:', {
    posts: agg.total_posts,
    types: agg.types,
    avg_er_pct: agg.avg_engagement_rate_pct,
    avg_views: agg.avg_views_video,
    cta_posts: agg.posts_with_cta,
    apply_dm: agg.posts_with_apply_or_dm,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
