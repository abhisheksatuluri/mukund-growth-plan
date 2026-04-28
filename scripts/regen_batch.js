// Batch regen audit-flagged images via Nano Banana 2 (gemini-2.5-flash-image).
// Single-image edit per image, identity-locked prompt, background cleanups.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash-image';
const SRC = path.resolve('./Website/assets/optimized');
const OUT = path.resolve('./Website/assets/regen');

const COMMON_LOCK =
  `KEEP HIS FACE, BODY, POSE, CLOTHING, AND IDENTITY EXACTLY THE SAME — pixel-perfect on the person. ` +
  `Identity preservation is mandatory — do NOT generate a new person, do NOT alter facial structure, eyes, nose, jawline, beard, or skin tone. ` +
  `Premium editorial fitness photography aesthetic. Match original lighting and color grade. `;

const TASKS = [
  {
    src: 'mukund_suit_smiling.jpeg',
    prompt:
      `Edit this photograph of a fit Indian-British man in a light blue blazer + cream trousers, smiling outdoors in front of classical architecture. ` +
      `${COMMON_LOCK}` +
      `Fix only: extend framing slightly so the top of his head has more breathing room and the bottom shows full legs to the shoes (no awkward thigh crop). ` +
      `Keep the same outdoor London architectural backdrop unchanged.`,
  },
  {
    src: 'mukund_suit_portrait.jpeg',
    prompt:
      `Edit this photograph of a fit Indian-British man in a smart-casual suit, half-body portrait. ` +
      `${COMMON_LOCK}` +
      `Fix only: add space at top so head is fully framed, extend bottom so torso isn't awkwardly cropped mid-chest. ` +
      `Keep the same outdoor backdrop.`,
  },
  {
    src: 'mukund_suit_side.jpeg',
    prompt:
      `Edit this photograph of a fit Indian-British man in a light blue blazer + cream trousers, half-body side profile, posed confidently against an outdoor backdrop. ` +
      `${COMMON_LOCK}` +
      `Fix only: extend framing downward so full legs are visible to the shoes (no thigh crop). Soften background slightly to reduce visual clutter.`,
  },
  {
    src: 'mukund_suit_fullbody.jpeg',
    prompt:
      `Edit this photograph of a fit Indian-British man in a light blue blazer + cream trousers, full body, smiling in front of classical architecture. ` +
      `${COMMON_LOCK}` +
      `Fix only: add space at the top so his head has breathing room, extend bottom so shoes are fully visible.`,
  },
  {
    src: 'mukund_portrait_casual.jpeg',
    prompt:
      `Edit this photograph of a fit Indian-British man in casual smart attire, smiling, half-body portrait outdoors. ` +
      `${COMMON_LOCK}` +
      `Fix only: extend top so head has breathing room, extend bottom so the awkward thigh crop is replaced by full legs OR a clean half-body crop at the waist.`,
  },
  {
    src: 'mukund_coaching_client_1.jpeg',
    prompt:
      `Edit this photograph of a fit Indian-British personal trainer with his client (a muscular man flexing) in a gym. ` +
      `${COMMON_LOCK} Also keep the client's face and body unchanged. ` +
      `Fix only: extend framing so neither person has limbs cut at the edges (full hands + feet visible). Soften gym background slightly.`,
  },
  {
    src: 'client_transformation_back.jpeg',
    prompt:
      `Edit this before-and-after body transformation composite of a single male client (back view). ` +
      `KEEP THE PERSON'S BODY, MUSCLE STRUCTURE, AND TRANSFORMATION EXACTLY AS SHOWN. Identity preservation mandatory. ` +
      `Fix only: clean up the cluttered background — replace busy kitchen/gym elements with a simple neutral light grey studio backdrop on both halves. Match lighting between the two halves. Premium clinical fitness aesthetic.`,
  },
  {
    src: 'client_transformation_front.jpeg',
    prompt:
      `Edit this before-and-after body transformation composite of a male client (front view). ` +
      `KEEP THE PERSON'S BODY, FACE, MUSCLE STRUCTURE, AND TRANSFORMATION EXACTLY AS SHOWN. Identity preservation mandatory. ` +
      `Fix only: replace the distracting gym-locker background of the "after" shot with a clean neutral light grey studio backdrop matching the "before" half. Improve lighting consistency between the two halves. Premium clinical fitness aesthetic.`,
  },
];

async function fileToInline(filepath) {
  const data = await fs.readFile(filepath);
  return { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' } };
}

async function regenOne(task) {
  console.log(`[nb2] ${task.src}`);
  const sourceInline = await fileToInline(path.join(SRC, task.src));
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [sourceInline, { text: task.prompt }] }],
    config: { responseModalities: ['Image', 'Text'], temperature: 0.3 },
  });
  const cParts = resp.candidates?.[0]?.content?.parts || [];
  let saved = false;
  for (const p of cParts) {
    if (p.inlineData?.data) {
      const buf = Buffer.from(p.inlineData.data, 'base64');
      const outName = task.src.replace('.jpeg', '_regen.jpeg');
      await fs.writeFile(path.join(OUT, outName), buf);
      console.log(`  saved → ${outName} (${(buf.length/1024).toFixed(0)} KB)`);
      saved = true;
    }
  }
  if (!saved) {
    console.log(`  ⚠ no image — finishReason=${resp.candidates?.[0]?.finishReason}`);
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  for (const t of TASKS) {
    try { await regenOne(t); }
    catch (e) { console.error(`  ! ${t.src}: ${e.message}`); }
  }
  console.log('\n[batch] done →', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
