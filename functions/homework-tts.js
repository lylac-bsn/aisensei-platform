/**
 * Homework clip synthesis.
 *
 * Primary: Cloud Text-to-Speech Chirp 3 HD (Kore) — ~0.5–1s/line when warm.
 * Fallback: Vertex Gemini TTS (gemini-2.5-flash-tts) — ~2.5–4s/line.
 *
 * Measured bottleneck was Gemini TTS itself, not Firestore sync.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleAuth } = require("google-auth-library");

const REGION = "asia-northeast1";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "ai-sensei-8849b";
const VERTEX_LOCATION = "us-central1";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-tts";
const VOICE = "Kore";
const MAX_TEXTS = 48;
const MAX_TEXT_LEN = 160;
const CONCURRENCY = 8;
const SAMPLE_RATE = 24000;

let authClient = null;
let cachedToken = null;
let cachedTokenExp = 0;

async function callerUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const { getFirestore } = require("firebase-admin/firestore");
  const snap = await getFirestore().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "アカウントが見つかりません。");
  return {
    uid: request.auth.uid,
    ...snap.data(),
    email: request.auth.token?.email || snap.data()?.email || "",
  };
}

function isTeacher(user) {
  return user.role === "admin" || user.role === "owner";
}

function cleanText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_TEXT_LEN);
}

function voiceLang(text) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text) ? "ja-JP" : "en-US";
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExp - 60_000) return cachedToken;
  if (!authClient) {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    authClient = await auth.getClient();
  }
  const token = await authClient.getAccessToken();
  const value = typeof token === "string" ? token : token?.token;
  if (!value) throw new Error("tts auth failed");
  cachedToken = value;
  // Access tokens are typically ~1h; refresh a bit early.
  cachedTokenExp = now + 50 * 60 * 1000;
  return value;
}

/** Strip RIFF/WAV container if present; return raw PCM16 LE bytes. */
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

/**
 * Prefer the display line's script for voice locale, but if the speak-as
 * override is clearly the other language, follow the spoken form.
 */
function spokenLang(displayText, spokenText) {
  const spoken = spokenText || displayText;
  if (spoken !== displayText && /[\u3040-\u30ff\u4e00-\u9fff]/.test(spoken) !== /[\u3040-\u30ff\u4e00-\u9fff]/.test(displayText)) {
    return voiceLang(spoken);
  }
  return voiceLang(displayText) || voiceLang(spoken);
}

async function synthesizeChirp(spoken, token, { lang } = {}) {
  const languageCode = lang || voiceLang(spoken);
  const started = Date.now();
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text: spoken },
      voice: {
        languageCode,
        name: `${languageCode}-Chirp3-HD-${VOICE}`,
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: SAMPLE_RATE,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const ms = Date.now() - started;
  if (!response.ok) {
    const message = payload?.error?.message || `chirp http ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.engine = "chirp3-hd";
    err.ms = ms;
    throw err;
  }
  const pcm = pcmBytesFromAudio(payload.audioContent);
  if (!pcm || pcm.length < 480) {
    const err = new Error("chirp empty audio");
    err.engine = "chirp3-hd";
    err.ms = ms;
    throw err;
  }
  return { pcm: pcm.toString("base64"), engine: "chirp3-hd", ms, lang: languageCode };
}

async function synthesizeGemini(spoken, token) {
  const started = Date.now();
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${GEMINI_TTS_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: spoken }] }],
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
  const ms = Date.now() - started;
  if (!response.ok) {
    const message = payload?.error?.message || `gemini-tts http ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.engine = GEMINI_TTS_MODEL;
    err.ms = ms;
    throw err;
  }
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const inline = parts.map((part) => part.inlineData || part.inline_data).find(Boolean);
  const pcm = pcmBytesFromAudio(inline?.data);
  if (!pcm || pcm.length < 480) {
    const err = new Error("gemini-tts empty audio");
    err.engine = GEMINI_TTS_MODEL;
    err.ms = ms;
    throw err;
  }
  return { pcm: pcm.toString("base64"), engine: GEMINI_TTS_MODEL, ms };
}

async function synthesizeOne(displayText, spokenText, token) {
  const spoken = spokenText || displayText;
  const lang = spokenLang(displayText, spoken);
  try {
    return await synthesizeChirp(spoken, token, { lang });
  } catch (chirpError) {
    console.warn("[homework-tts] chirp failed → gemini", {
      text: displayText,
      speakAs: spoken !== displayText ? spoken : undefined,
      ms: chirpError?.ms,
      status: chirpError?.status,
      message: chirpError?.message,
    });
    return synthesizeGemini(spoken, token);
  }
}

/** Map display text → cleaned speak-as override (omit when empty / identical). */
function resolveSpoken(displayText, readings) {
  if (!readings || typeof readings !== "object") return displayText;
  const direct = cleanText(readings[displayText]);
  if (direct && direct !== displayText) return direct;
  return displayText;
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

exports.synthesizeHomeworkVoice = onCall(
  {
    region: REGION,
    timeoutSeconds: 180,
    memory: "512MiB",
    minInstances: 1,
  },
  async (request) => {
    const started = Date.now();
    const authStarted = Date.now();
    const user = await callerUser(request);
    const authMs = Date.now() - authStarted;
    if (!isTeacher(user)) {
      throw new HttpsError("permission-denied", "先生だけが音声を作れます。");
    }
    const raw = Array.isArray(request.data?.texts)
      ? request.data.texts
      : [request.data?.text];
    const texts = [...new Set(raw.map(cleanText).filter(Boolean))].slice(0, MAX_TEXTS);
    if (!texts.length) throw new HttpsError("invalid-argument", "読み上げる文がありません。");
    const readings = request.data?.readings && typeof request.data.readings === "object"
      ? request.data.readings
      : {};

    const tokenStarted = Date.now();
    const token = await getAccessToken();
    const tokenMs = Date.now() - tokenStarted;

    const clips = [];
    const failed = [];
    const timings = [];
    await mapPool(texts, CONCURRENCY, async (text) => {
      const spoken = resolveSpoken(text, readings);
      try {
        const result = await synthesizeOne(text, spoken, token);
        const clip = { text, pcm: result.pcm, engine: result.engine };
        if (spoken !== text) clip.speakAs = spoken;
        clips.push(clip);
        timings.push({
          text,
          speakAs: spoken !== text ? spoken : undefined,
          engine: result.engine,
          ms: result.ms,
        });
      } catch (error) {
        console.warn("[homework-tts] failed", text, spoken !== text ? spoken : "", error?.message || error);
        failed.push(text);
        timings.push({ text, engine: "failed", ms: error?.ms || 0, error: String(error?.message || error) });
      }
    });

    const totalMs = Date.now() - started;
    console.info("[homework-tts] done", {
      count: texts.length,
      made: clips.length,
      failed: failed.length,
      authMs,
      tokenMs,
      totalMs,
      avgLineMs: timings.length ? Math.round(timings.reduce((s, row) => s + row.ms, 0) / timings.length) : 0,
      engines: timings.reduce((map, row) => {
        map[row.engine] = (map[row.engine] || 0) + 1;
        return map;
      }, {}),
      slowest: [...timings].sort((a, b) => b.ms - a.ms).slice(0, 5),
    });

    return {
      clips,
      failed,
      model: "chirp3-hd",
      fallbackModel: GEMINI_TTS_MODEL,
      voice: VOICE,
      rate: SAMPLE_RATE,
      timing: {
        authMs,
        tokenMs,
        totalMs,
        lines: timings,
      },
    };
  },
);
