#!/usr/bin/env node
/**
 * Rewrite Live-era homeworkVoice clips with Vertex gemini-2.5-flash-tts (Kore).
 *
 * Clips with no engine tag (or not chirp/gemini) are treated as Live leftovers.
 *
 * Usage (from repo root):
 *   node scripts/regen-homework-voice-gemini.mjs
 *   node scripts/regen-homework-voice-gemini.mjs --dry-run
 *   node scripts/regen-homework-voice-gemini.mjs --force
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../functions/package.json"));

const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { GoogleAuth } = require("google-auth-library");

const PROJECT_ID = "ai-sensei-8849b";
const VERTEX_LOCATION = "us-central1";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-tts";
const VOICE = "Kore";
const SAMPLE_RATE = 24000;
const CONCURRENCY = 4;
const KEEP_ENGINES = new Set(["gemini-2.5-flash-tts", "chirp3-hd"]);

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

function cleanText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function pcmBytesFromAudio(base64) {
  const buf = Buffer.from(String(base64 || ""), "base64");
  if (buf.length < 12) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF") return buf;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "data") return buf.subarray(start, Math.min(buf.length, start + size));
    offset = start + size + (size % 2);
  }
  return null;
}

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const value = typeof token === "string" ? token : token?.token;
  if (!value) throw new Error("tts auth failed");
  return value;
}

async function synthesizeGemini(text, token) {
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${GEMINI_TTS_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: VOICE },
          },
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `gemini-tts http ${response.status}`);
  }
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const inline = parts.map((part) => part.inlineData || part.inline_data).find(Boolean);
  const pcm = pcmBytesFromAudio(inline?.data);
  if (!pcm || pcm.length < 480) throw new Error("gemini-tts empty audio");
  return pcm.toString("base64");
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}

async function main() {
  const snap = await db.collection("homeworkVoice").get();
  const targets = snap.docs.filter((doc) => {
    const engine = String(doc.get("engine") || "");
    if (!force && KEEP_ENGINES.has(engine)) return false;
    return Boolean(cleanText(doc.get("text") || doc.get("key") || ""));
  });

  console.info("[regen] start", {
    total: snap.size,
    targets: targets.length,
    dryRun,
    force,
    model: GEMINI_TTS_MODEL,
    voice: VOICE,
  });

  if (!targets.length) {
    console.info("[regen] nothing to do");
    return;
  }
  if (dryRun) {
    console.info("[regen] dry-run sample", targets.slice(0, 12).map((d) => d.get("text") || d.get("key")));
    return;
  }

  let token = await getAccessToken();
  let tokenAt = Date.now();
  let made = 0;
  let failed = 0;
  const failures = [];

  await mapPool(targets, CONCURRENCY, async (doc, index) => {
    const text = cleanText(doc.get("text") || doc.get("key") || "");
    const started = Date.now();
    try {
      if (Date.now() - tokenAt > 45 * 60 * 1000) {
        token = await getAccessToken();
        tokenAt = Date.now();
      }
      const pcm = await synthesizeGemini(text, token);
      if (pcm.length > 900000) throw new Error(`pcm too large (${pcm.length})`);
      await doc.ref.set({
        pcm,
        rate: SAMPLE_RATE,
        text,
        key: String(doc.get("key") || text).slice(0, 160),
        engine: GEMINI_TTS_MODEL,
        voice: VOICE,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      made += 1;
      console.info(`[regen] ${index + 1}/${targets.length} ok`, JSON.stringify(text), `${Date.now() - started}ms`);
    } catch (error) {
      failed += 1;
      failures.push({ id: doc.id, text, error: String(error?.message || error) });
      console.warn(`[regen] ${index + 1}/${targets.length} fail`, JSON.stringify(text), error?.message || error);
    }
  });

  console.info("[regen] done", { made, failed, failureSample: failures.slice(0, 20) });
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[regen] fatal", error);
  process.exit(1);
});
