// Test Nano Banana 2 (gemini-2.5-flash-image-preview) face regen with multi-reference.
// Strategy: send 3 reference images (different angles of Mukund's face) + 1 source-to-fix
// + explicit identity-preservation prompt. Save output silently.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash-image';
const SRC_DIR = path.resolve('./Website/assets/optimized');
const OUT_DIR = path.resolve('./Website/assets/regen');

// Test set — 1 image where regen could meaningfully improve
const TESTS = [
  {
    target: 'mukund_mirror_gym.jpeg',
    references: [
      'mukund_portrait_boss.jpeg',     // strong frontal face
      'mukund_suit_smiling.jpeg',      // half-body smiling
      'mukund_editorial_singapore.jpeg', // tall portrait, urban backdrop
    ],
    prompt:
      `You are editing a single image. The man in the source image is Mukund Venkat — the EXACT person shown in reference images 2, 3, and 4. ` +
      `KEEP HIS FACIAL FEATURES IDENTICAL TO REFERENCE IMAGE 2 (frontal portrait): same eye shape, same nose, same jawline, same skin tone, same short black hair, same beard pattern. ` +
      `Identity preservation is mandatory — do NOT generate a new person, do NOT alter facial structure. ` +
      `Edit task: clean up the framing artifacts in the source image — remove the black letterbox bars at the edges, remove any phone-screenshot UI elements, replace the cluttered gym mirror background with a simple, clean modern gym wall (minimal equipment visible, soft natural lighting, no distracting elements). ` +
      `Keep his clothing, body, and pose IDENTICAL. Output a clean, premium editorial photograph of the same man in a polished gym setting. Aspect ratio: portrait, similar to source.`,
  },
];

async function fileToInline(filepath) {
  const data = await fs.readFile(filepath);
  return { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
}

async function regen(test) {
  console.log(`[nb2] regen target: ${test.target}`);

  const sourceInline = await fileToInline(path.join(SRC_DIR, test.target));

  // Single-image edit (img2img). Nano Banana 2 expects a tight, descriptive edit prompt.
  const editPrompt =
    `Edit this photograph of a fit Indian-British man in a gym. ` +
    `KEEP HIS FACE, BODY, POSE, CLOTHING, AND IDENTITY EXACTLY THE SAME — pixel-perfect on the person. ` +
    `Only change: clean up the background to a polished, minimalist modern gym wall. ` +
    `Remove any phone-screenshot UI elements, black letterbox bars, or app overlays at the edges. ` +
    `Keep the lighting and color grade similar. Premium editorial fitness photography aesthetic.`;

  const parts = [sourceInline, { text: editPrompt }];

  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['Image', 'Text'],
      temperature: 0.3,
    },
  });

  // Extract image bytes from response
  const candidates = resp.candidates || [];
  console.log('  full response keys:', Object.keys(resp || {}));
  console.log('  candidates count:', candidates.length);
  if (candidates.length > 0) {
    console.log('  first candidate finish reason:', candidates[0].finishReason);
    console.log('  first candidate safety:', JSON.stringify(candidates[0].safetyRatings || []).slice(0,200));
  }
  console.log('  prompt feedback:', JSON.stringify(resp.promptFeedback || {}));
  if (!candidates.length) {
    console.log('  raw:', JSON.stringify(resp, null, 2).slice(0, 1000));
    return;
  }
  const cParts = candidates[0].content?.parts || [];
  console.log(`  parts in response: ${cParts.length} (${cParts.map(p => p.inlineData ? 'image' : 'text').join(', ')})`);

  let saved = 0;
  for (let i = 0; i < cParts.length; i++) {
    const p = cParts[i];
    if (p.inlineData?.data) {
      const buf = Buffer.from(p.inlineData.data, 'base64');
      const outName = test.target.replace('.jpeg', `_regen_${i}.jpeg`);
      await fs.writeFile(path.join(OUT_DIR, outName), buf);
      console.log(`  saved → ${outName} (${(buf.length/1024).toFixed(0)} KB)`);
      saved++;
    } else if (p.text) {
      console.log(`  model says: ${p.text.slice(0, 200)}`);
    }
  }
  if (!saved) console.log('  ⚠ no image in response — model may have refused');
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const t of TESTS) {
    try { await regen(t); }
    catch (e) { console.error(`  ! ${t.target}: ${e.message}`); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
