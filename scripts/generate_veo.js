// Generate cinematic 8-sec videos via Veo 3.1 from still images.
// Strategy: SUBJECT-LOCKED cinemagraphs — Mukund holds his pose, only environment animates.
// Prompts use cinematic-direction language + heavy negative-prompt list to avoid AI giveaways.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const ASSETS = path.resolve('./Website/assets');
const OUT_DIR = path.resolve('./Website/assets/video');
const MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview';

const NEGATIVE = 'face morphing, eye distortion, teeth changes, plastic skin, soap-opera effect, body warping, extra limbs, lighting shifts, identity drift, oversaturation, cartoon look, motion blur smearing';

const SHOTS = [
  {
    src: 'mukund_gym_dynamic.jpeg',
    out: 'hero_gym_kick.mp4',
    role: 'hero background loop',
    prompt: `Cinematic 8-second clip from a still photograph. The subject — a fit Indian-British man, athletic build, mid-air kick against a black punching bag in a modern gym — holds his exact pose, frozen mid-action. Body, face, expression, and clothing remain identical to the source frame. Only environmental motion: faint dust particles drift slowly through dramatic side-light beams, the punching bag below sways with 2cm pendulum motion, faint workout chalkboard text in background remains static. Camera: gimbal-stable, very subtle 5% push-in parallax over 8 seconds. Lighting: dramatic side-light, unchanged. Color grade: filmic, slight teal-orange. Aspect 16:9, 1080p, 24fps. Premium personal-brand aesthetic.`,
  },
  {
    src: 'mukund_cycling_triumph.jpeg',
    out: 'mindset_cycling.mp4',
    role: 'mindset break section',
    prompt: `Cinematic 8-second clip from a still photograph. The subject — a fit Indian-British man on a road bike — holds his exact pose, body, face, and expression frozen identical to source. Only environmental motion: subtle wind ripples through clothing fabric, faint atmospheric particles drift, slight dust motes catch the light. Camera: gimbal-locked, 3% push-in parallax. Lighting: golden-hour ambient, unchanged. Color grade: warm filmic, low saturation. Aspect 16:9, 1080p, 24fps. Editorial premium aesthetic.`,
  },
];

async function fileToInline(filepath) {
  const data = await fs.readFile(filepath);
  return { imageBytes: data.toString('base64'), mimeType: 'image/jpeg' };
}

async function generateOne(shot) {
  console.log(`[veo] ${shot.out} ← ${shot.src} (${shot.role})`);
  const inp = await fileToInline(path.join(ASSETS, shot.src));
  let op = await ai.models.generateVideos({
    model: MODEL,
    prompt: shot.prompt,
    image: inp,
    config: {
      numberOfVideos: 1,
      durationSeconds: 8,
      aspectRatio: '16:9',
      negativePrompt: NEGATIVE,
      personGeneration: 'allow_adult',
    },
  });
  console.log(`  op started: ${op.name}`);

  // Poll
  const start = Date.now();
  while (!op.done) {
    if ((Date.now() - start) > 6 * 60 * 1000) throw new Error('timeout after 6 min');
    await new Promise((r) => setTimeout(r, 8000));
    op = await ai.operations.get({ operation: op });
    process.stdout.write(`  …${Math.round((Date.now() - start) / 1000)}s `);
  }
  console.log('\n  done.');

  const videos = op.response?.generateVideoResponse?.generatedSamples
    || op.response?.generatedVideos
    || [];
  if (!videos.length) {
    console.log('  RAW RESPONSE:', JSON.stringify(op.response || op, null, 2).slice(0, 800));
    throw new Error('no videos in response');
  }
  const outPath = path.join(OUT_DIR, shot.out);
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const uri = v.video?.uri;
    if (!uri) { console.log('  no uri on video', i); continue; }
    const final = i === 0 ? outPath : outPath.replace('.mp4', `_${i}.mp4`);
    // Direct fetch with auth header
    const res = await fetch(uri + (uri.includes('?') ? '&' : '?') + 'key=' + process.env.GEMINI_API_KEY);
    if (!res.ok) throw new Error(`download failed ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(final, buf);
    console.log(`  saved → ${final} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const which = process.argv[2];
  const shots = which ? SHOTS.filter((s) => s.out.startsWith(which)) : SHOTS;
  if (!shots.length) { console.log('No matching shots for', which); process.exit(1); }
  for (const shot of shots) {
    try { await generateOne(shot); }
    catch (e) { console.error(`  ! ${shot.out}: ${e.message}`); console.error(e.stack); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
