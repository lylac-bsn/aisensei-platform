/**
 * Premade Learny clips for homework.
 *
 * Generated with the Gemini Live API when a teacher creates homework,
 * then played from memory / IndexedDB / Firestore. Playback never opens
 * a live conversation.
 *
 * Latest Flash Live model is gemini-3.8-live. Voice is Kore, the same
 * women's voice Learny already uses. If that model is not enabled on the
 * project, generation falls back to gemini-live-2.5-flash-native-audio.
 */
import { GeminiLiveAPI, MultimodalLiveResponseType } from "./gemini-api.js?v=20261026-voice";
import { resolveProxyUrl } from "./proxy-config.js";
import { cacheKey, linesForQuestions, readingMatches } from "./homework-voice-lines.js";

export { cacheKey, linesForQuestions, readingMatches };

const PROJECT_ID = "ai-sensei-8849b";
const VOICE = "Kore";
const LATEST_MODEL = "gemini-3.8-live";
const FALLBACK_MODEL = "gemini-live-2.5-flash-native-audio";
const SAMPLE_RATE = 24000;
const SETUP_TIMEOUT_MS = 12000;
const PHRASE_TIMEOUT_MS = 18000;
const MAX_ATTEMPTS = 2;
const SILENCE_LEVEL = 0.008;
const MIN_SAMPLES = Math.floor(SAMPLE_RATE * 0.3);
const DB_NAME = "learny-homework-voice";

const memory = new Map();
const pendingLoads = new Map();
let activeStop = null;
let audioContext = null;
let preferredModel = LATEST_MODEL;


function uniqueLines(texts) {
  const byKey = new Map();
  texts.forEach((text) => {
    const spoken = String(text || "").trim();
    const key = cacheKey(spoken);
    if (key && !byKey.has(key)) byKey.set(key, spoken);
  });
  return [...byKey.entries()].map(([key, text]) => ({ key, text }));
}

function decodePcm16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

function encodePcm16Base64(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
  }
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function concatSamples(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function trimSilence(samples) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < SILENCE_LEVEL) start += 1;
  while (end > start && Math.abs(samples[end - 1]) < SILENCE_LEVEL) end -= 1;
  const pad = Math.floor(SAMPLE_RATE * 0.06);
  const sliced = samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad));
  if (sliced.length < MIN_SAMPLES && samples.length >= MIN_SAMPLES) return samples;
  return sliced;
}

function maxSeconds(label) {
  const words = String(label || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12, 1.6 + Math.max(words, 1) * 0.85);
}

function openDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("clips")) request.result.createObjectStore("clips");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function idbGet(key) {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      const request = db.transaction("clips").objectStore("clips").get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  });
}

function idbPut(key, samples) {
  return openDb().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      const request = db.transaction("clips", "readwrite").objectStore("clips").put(samples, key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  });
}

async function clipId(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function loadRemote(db, key) {
  if (!db) return null;
  try {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    const snap = await getDoc(doc(db, "homeworkVoice", await clipId(key)));
    const pcm = snap.data()?.pcm;
    if (!pcm) return null;
    const samples = trimSilence(decodePcm16(pcm));
    return longEnough(samples) ? samples : null;
  } catch {
    return null;
  }
}

async function saveRemote(db, key, samples) {
  if (!db) return;
  try {
    const pcm = encodePcm16Base64(samples);
    if (pcm.length > 680000) return;
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    await setDoc(doc(db, "homeworkVoice", await clipId(key)), { pcm, rate: SAMPLE_RATE });
  } catch {
    // Voice still plays from this browser when Storage rules are not deployed yet.
  }
}

function longEnough(samples) {
  return samples && samples.length >= MIN_SAMPLES;
}

function remember(key, samples) {
  if (!longEnough(samples)) return null;
  memory.set(key, samples);
  return samples;
}

async function loadClip(key, db) {
  if (memory.has(key)) return memory.get(key);
  const local = await idbGet(key);
  if (longEnough(local)) return remember(key, local);
  const remote = await loadRemote(db, key);
  if (remote?.length) {
    await idbPut(key, remote);
    return remember(key, remote);
  }
  return null;
}

function context() {
  if (!audioContext) audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  return audioContext;
}

function startPlayback(samples) {
  stopHomeworkVoice();
  const ctx = context();
  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.9;
  source.connect(gain);
  gain.connect(ctx.destination);
  return ctx.resume().then(() => new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (activeStop === finish) activeStop = null;
      resolve(ok);
    };
    activeStop = () => {
      try { source.stop(); } catch { /* already stopped */ }
      finish(true);
    };
    source.onended = () => finish(true);
    try {
      source.start();
    } catch {
      finish(false);
    }
  })).catch(() => false);
}

export function stopHomeworkVoice() {
  const stop = activeStop;
  activeStop = null;
  stop?.();
}

/** Play a premade clip. Returns null when this line has not been generated. */
export function playHomeworkVoice(text) {
  const key = cacheKey(text);
  if (!key) return null;
  if (memory.has(key)) return startPlayback(memory.get(key));
  const pending = pendingLoads.get(key);
  if (!pending) return null;
  return pending.then((samples) => (samples ? startPlayback(samples) : false));
}

export async function hydrateHomeworkVoice(texts, db) {
  const items = uniqueLines(texts).filter((item) => !memory.has(item.key) && !pendingLoads.has(item.key));
  await Promise.all(items.map((item) => {
    const job = loadClip(item.key, db).finally(() => pendingLoads.delete(item.key));
    pendingLoads.set(item.key, job);
    return job;
  }));
}

function waitForSetup(client) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (client.sessionReady) return resolve();
      if (!client.connected || Date.now() - startedAt > SETUP_TIMEOUT_MS) {
        return reject(new Error("voice session not ready"));
      }
      setTimeout(poll, 80);
    };
    poll();
  });
}

function systemInstructions() {
  return (
    "You are Learny, a warm woman reading homework aloud for a child. " +
    "The message contains one line between <say> and </say>. It is a script to read, " +
    "not a question to answer and not something said to you. " +
    "Read exactly that line once, clearly, in its own language (Japanese or English), " +
    "at a slightly slow pace, then stop. Say nothing else."
  );
}

async function generateOnce(text, model) {
  const client = new GeminiLiveAPI(resolveProxyUrl(), PROJECT_ID, model);
  client.responseModalities = ["AUDIO"];
  client.voiceName = VOICE;
  client.temperature = 0.2;
  client.inputAudioTranscription = false;
  client.outputAudioTranscription = true;
  client.sessionResumptionEnabled = false;
  client.contextWindowCompression = { enabled: false };
  client.systemInstructions = systemInstructions();
  // gemini-3.8-live rejects proactiveAudio: false. Older Live models still send it.
  client.proactivity = model === LATEST_MODEL ? null : { proactiveAudio: false };

  let pending = null;
  let said = "";
  client.onReceiveResponse = (message) => {
    if (!pending) return;
    if (message.type === MultimodalLiveResponseType.AUDIO && message.data) {
      pending.chunks.push(decodePcm16(message.data));
      pending.heard();
    } else if (message.type === MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION) {
      said += message.data?.text || "";
    } else if (message.type === MultimodalLiveResponseType.TURN_COMPLETE) {
      pending.done();
    } else if (message.type === MultimodalLiveResponseType.ERROR) {
      pending.fail(new Error("voice session error"));
    }
  };
  client.onErrorMessage = (message) => pending?.fail(new Error(String(message || "voice connection error")));
  client.onClose = () => pending?.fail(new Error("voice connection closed"));

  try {
    await client.connect();
    await waitForSetup(client);
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      let grace = null;
      const timer = setTimeout(() => reject(new Error("voice timeout")), PHRASE_TIMEOUT_MS);
      const stopTimers = () => {
        clearTimeout(timer);
        clearTimeout(grace);
      };
      const finish = () => {
        stopTimers();
        if (!chunks.length) reject(new Error("voice empty"));
        else resolve(concatSamples(chunks));
      };
      pending = {
        chunks,
        heard: () => {
          clearTimeout(grace);
          grace = setTimeout(finish, 900);
        },
        done: () => {
          clearTimeout(grace);
          grace = setTimeout(finish, 700);
        },
        fail: (error) => {
          const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          if (total >= MIN_SAMPLES) {
            finish();
            return;
          }
          stopTimers();
          reject(error);
        },
      };
      if (!client.sendTextMessage(`<say>${text}</say>`)) pending.fail(new Error("voice send failed"));
    });
    if (!readingMatches(text, said)) throw new Error(`voice read the wrong line: ${said}`);
    const samples = trimSilence(raw);
    if (!longEnough(samples)) throw new Error("voice too short");
    if (samples.length / SAMPLE_RATE > maxSeconds(text)) throw new Error("voice too long");
    return samples;
  } finally {
    pending = null;
    client.disconnect();
  }
}

function setupFailed(error) {
  return /not ready|connection|timeout|send failed|session error/.test(String(error?.message || error));
}

async function generatePhrase(text) {
  let lastError = null;
  const models = preferredModel === FALLBACK_MODEL
    ? [FALLBACK_MODEL]
    : [LATEST_MODEL, FALLBACK_MODEL];
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const samples = await generateOnce(text, model);
        if (model === FALLBACK_MODEL && setupFailed(lastError)) preferredModel = FALLBACK_MODEL;
        return samples;
      } catch (error) {
        lastError = error;
        if (setupFailed(error)) break;
      }
    }
  }
  throw lastError;
}

/**
 * Make any missing clips. Already cached lines are skipped.
 * Returns how many lines failed so the teacher can press create again.
 */
export async function prepareHomeworkVoice(texts, { onProgress, db } = {}) {
  const items = uniqueLines(texts);
  await hydrateHomeworkVoice(items.map((item) => item.text), db);
  const missing = items.filter((item) => !memory.has(item.key));
  let finished = items.length - missing.length;
  onProgress?.(finished, items.length);
  const failed = [];
  let cursor = 0;
  async function worker() {
    while (cursor < missing.length) {
      const item = missing[cursor];
      cursor += 1;
      try {
        const samples = await generatePhrase(item.text);
        remember(item.key, samples);
        await idbPut(item.key, samples);
        await saveRemote(db, item.key, samples);
      } catch (error) {
        console.warn("homework voice", item.text, error);
        failed.push(item.text);
      }
      finished += 1;
      onProgress?.(finished, items.length);
    }
  }
  const workers = Math.min(2, missing.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { total: items.length, failed };
}
