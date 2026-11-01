/**
 * Premade Learny clips for homework.
 *
 * Generated with Gemini TTS (Vertex generateContent — gemini-2.5-flash-tts,
 * Kore voice) when a teacher creates homework, then played from memory /
 * IndexedDB / Firestore. No Live / WebSocket path.
 */
import { cacheKey, isShortVocabLine, isTrivialVoiceLine, linesForQuestions, readingMatches } from "./homework-voice-lines.js?v=20261101-tts";

export { cacheKey, isShortVocabLine, isTrivialVoiceLine, linesForQuestions, readingMatches };

const SAMPLE_RATE = 24000;
const TTS_FN_URL = "https://asia-northeast1-ai-sensei-8849b.cloudfunctions.net/synthesizeHomeworkVoice";
/** Lines per Cloud Function call (server accepts up to 48). */
const TTS_BATCH_SIZE = 24;
/** How many CF batch requests to run at once. */
const TTS_PARALLEL_BATCHES = 2;
/** Hard ceiling so a hung Cloud Function cannot leave the remake UI spinning forever. */
const TTS_FETCH_TIMEOUT_MS = 45000;
const SILENCE_LEVEL = 0.008;
/** Generation floor — prefer a clear clip, but short words ("I", "a") are often under 0.3s. */
const MIN_SAMPLES = Math.floor(SAMPLE_RATE * 0.22);
/** Playback floor — never discard shared teacher clips that are merely short after trim. */
const PLAYABLE_MIN_SAMPLES = Math.floor(SAMPLE_RATE * 0.08);
const DB_NAME = "learny-homework-voice";

const memory = new Map();
const pendingLoads = new Map();
/** Keys forgotten for remake — block hydrate/remote restore until a new clip is saved. */
const forgottenKeys = new Set();
const activeControllers = new Set();
let activeStop = null;
let audioContext = null;

function abortError(message = "音声生成を停止しました。") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

/** Abort in-flight TTS fetches so prepareHomeworkVoice can unwind quickly. */
export function disconnectHomeworkVoiceSessions() {
  for (const controller of [...activeControllers]) {
    try { controller.abort(); } catch { /* already aborted */ }
  }
  activeControllers.clear();
}


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

function trimSilence(samples, minKeep = PLAYABLE_MIN_SAMPLES) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < SILENCE_LEVEL) start += 1;
  while (end > start && Math.abs(samples[end - 1]) < SILENCE_LEVEL) end -= 1;
  const pad = Math.floor(SAMPLE_RATE * 0.06);
  const sliced = samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad));
  // Keep the untrimmed buffer when trimming would throw away a still-audible short clip.
  if (sliced.length < minKeep && samples.length >= minKeep) return samples;
  return sliced;
}

/** Short English chips ("I", "a", "to") often land under the default generation floor. */
function generateMinSamples(text) {
  const label = speakableText(text);
  if (!label) return MIN_SAMPLES;
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(label);
  if (japanese) {
    const chars = [...label.replace(/\s+/g, "")].length;
    return chars <= 2 ? Math.floor(SAMPLE_RATE * 0.14) : MIN_SAMPLES;
  }
  const words = label.split(/\s+/).filter(Boolean);
  const letters = label.replace(/\s+/g, "").length;
  if (words.length <= 2 && letters <= 8) return Math.floor(SAMPLE_RATE * 0.12);
  return MIN_SAMPLES;
}

function maxSeconds(label) {
  const words = String(label || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12, 1.6 + Math.max(words, 1) * 0.85);
}

function speakableText(text) {
  return String(text || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
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

function samplesFromStored(value) {
  if (!value) return null;
  if (value instanceof Float32Array) return value;
  if (value instanceof ArrayBuffer) return new Float32Array(value);
  if (ArrayBuffer.isView(value)) return new Float32Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (Array.isArray(value)) return Float32Array.from(value);
  if (value.buffer instanceof ArrayBuffer) return new Float32Array(value.buffer);
  return null;
}

function idbGet(key) {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      const request = db.transaction("clips").objectStore("clips").get(key);
      request.onsuccess = () => resolve(samplesFromStored(request.result));
      request.onerror = () => {
        console.warn("homework voice: IndexedDB read failed", key);
        resolve(null);
      };
    });
  });
}

function idbPut(key, samples) {
  return openDb().then((db) => {
    if (!db) return false;
    // Store a detached copy — safer across browsers than a shared TypedArray view.
    const copy = samples instanceof Float32Array
      ? samples.slice().buffer
      : Float32Array.from(samples).buffer;
    return new Promise((resolve) => {
      const request = db.transaction("clips", "readwrite").objectStore("clips").put(copy, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        console.warn("homework voice: IndexedDB write failed", key);
        resolve(false);
      };
    });
  });
}

function idbDelete(key) {
  return openDb().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      const request = db.transaction("clips", "readwrite").objectStore("clips").delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  });
}

/** Drop cached clips so the next prepare call regenerates them. */
export async function forgetHomeworkVoice(texts, { db = null } = {}) {
  const items = uniqueLines(texts);
  // Local forget must be instant — never block remake UI on Firestore delete.
  await Promise.all(items.map(async (item) => {
    forgottenKeys.add(item.key);
    memory.delete(item.key);
    pendingLoads.delete(item.key);
    await idbDelete(item.key);
  }));
  if (!db || !items.length) return;
  // Best-effort remote delete in the background (tombstone already blocks hydrate).
  Promise.all(items.map(async (item) => {
    try {
      const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
      await deleteDoc(doc(db, "homeworkVoice", await clipId(item.key)));
    } catch (error) {
      const code = error?.code || "";
      if (!String(code).includes("permission-denied")) {
        console.warn("homework voice: remote forget failed", item.text, code || error?.message || error);
      }
    }
  })).catch(() => {});
}

async function clipId(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function loadRemote(db, key) {
  if (!db) return null;
  if (forgottenKeys.has(key)) return null;
  try {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    const snap = await getDoc(doc(db, "homeworkVoice", await clipId(key)));
    if (!snap.exists()) return null;
    const pcm = snap.data()?.pcm;
    if (!pcm) return null;
    // Use playable threshold — strict gen min was dropping short words like "I" for students.
    return normalizePlayable(decodePcm16(pcm));
  } catch (error) {
    console.warn("homework voice: remote load failed", key, error?.code || error?.message || error);
    return null;
  }
}

/**
 * Upload locally-cached clips to Firestore so students can play them.
 * Teachers often confirm audio from IndexedDB; without this sync, students
 * never receive those clips and playback fails on their devices.
 *
 * force: re-publish every local clip even when a remote doc already exists
 * (repairs short/corrupt remote pcm that would otherwise be skipped).
 */
export async function syncHomeworkVoiceRemote(texts, db, { force = false } = {}) {
  if (!db) return { synced: 0, missing: [], failed: [], published: 0 };
  const items = uniqueLines(texts);
  const missing = [];
  const failed = [];
  let synced = 0;
  let published = 0;
  const syncOne = async (item) => {
    try {
      let samples = memory.get(item.key) || null;
      if (!samples) {
        const local = normalizePlayable(await idbGet(item.key));
        if (local) samples = remember(item.key, local, { playable: true });
      }
      const remote = await loadRemote(db, item.key);
      if (!samples) {
        if (remote) {
          remember(item.key, remote, { playable: true });
          return { synced: 1, published: 0 };
        }
        missing.push(item.text);
        return { synced: 0, published: 0 };
      }
      // Remote present and playable — skip unless force re-publish from local.
      if (remote && !force) return { synced: 1, published: 0 };
      if (await saveRemote(db, item.key, samples, item.text)) {
        return { synced: 1, published: 1 };
      }
      failed.push(item.text);
      return { synced: 0, published: 0 };
    } catch (error) {
      console.warn("homework voice: sync failed", item.text, error);
      failed.push(item.text);
      return { synced: 0, published: 0 };
    }
  };
  // Parallel Firestore checks — sequential sync was a major stall after TTS.
  const SYNC_PARALLEL = 8;
  for (let offset = 0; offset < items.length; offset += SYNC_PARALLEL) {
    const chunk = await Promise.all(items.slice(offset, offset + SYNC_PARALLEL).map(syncOne));
    chunk.forEach((row) => {
      synced += row.synced;
      published += row.published;
    });
  }
  console.info("[homework voice] sync remote", {
    total: items.length,
    synced,
    published,
    force,
    missing: missing.length,
    failed: failed.length,
    failedLines: failed,
    missingLines: missing,
  });
  return { synced, missing, failed, published };
}

/**
 * Shared clip bank: one doc per spoken line (hash id) in `homeworkVoice`.
 * Any signed-in teacher/student can reuse the same clip — no re-generation credit.
 */
async function saveRemote(db, key, samples, text = "", { engine = "", voice = "" } = {}) {
  if (!db) {
    console.warn("homework voice: no Firestore db — clip stays local only", text || key);
    return false;
  }
  try {
    const pcm = encodePcm16Base64(samples);
    // Firestore docs max ~1MB; leave headroom for metadata.
    if (pcm.length > 900000) {
      console.warn("homework voice: clip too large for Firestore share", text || key, pcm.length);
      return false;
    }
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    const payload = {
      pcm,
      rate: SAMPLE_RATE,
      key,
      text: String(text || "").slice(0, 160),
      updatedAt: serverTimestamp(),
    };
    if (engine) payload.engine = String(engine).slice(0, 64);
    if (voice) payload.voice = String(voice).slice(0, 40);
    await setDoc(doc(db, "homeworkVoice", await clipId(key)), payload, { merge: true });
    return true;
  } catch (error) {
    // Local IndexedDB / memory still work for this browser.
    console.warn("homework voice: remote save failed", text || key, error?.code || error?.message || error);
    return false;
  }
}

function longEnough(samples, min = MIN_SAMPLES) {
  return Boolean(samples && samples.length >= min);
}

/**
 * Reject clips that look like squeals / sustained non-speech tones rather than
 * spoken homework lines. Tuned to keep short words ("I", "Fish") while catching
 * high-pitched Gemini Live artifacts.
 */
export function speechLooksOk(samples) {
  if (!samples?.length) return false;
  const n = samples.length;
  let sumSq = 0;
  let peak = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < n; i += 1) {
    const sample = samples[i];
    const mag = Math.abs(sample);
    sumSq += sample * sample;
    if (mag > peak) peak = mag;
    if (i > 0 && (samples[i - 1] >= 0) !== (sample >= 0)) zeroCrossings += 1;
  }
  const rms = Math.sqrt(sumSq / n);
  if (rms < 0.008) return false;
  if (peak < 0.04) return false;
  // Near-silence with a few spikes (clicks / static pops).
  if (peak > 0.25 && rms < 0.018) return false;

  const zcr = zeroCrossings / n;
  // Very high zero-crossing rate ≈ whistle / digital squeal at 24 kHz.
  if (zcr > 0.3 && rms > 0.04) return false;

  const duration = n / SAMPLE_RATE;
  const frame = Math.max(1, Math.floor(SAMPLE_RATE * 0.02));
  if (duration >= 0.55 && n >= frame * 4) {
    const energies = [];
    for (let i = 0; i + frame <= n; i += frame) {
      let energy = 0;
      for (let j = 0; j < frame; j += 1) {
        const sample = samples[i + j];
        energy += sample * sample;
      }
      energies.push(energy / frame);
    }
    const mean = energies.reduce((sum, value) => sum + value, 0) / energies.length;
    let variance = 0;
    for (const energy of energies) variance += (energy - mean) ** 2;
    variance /= energies.length;
    const cv = Math.sqrt(variance) / (mean + 1e-12);
    // Long, steady harmonic tone while speech usually varies frame energy.
    if (cv < 0.1 && zcr > 0.1 && rms > 0.05) return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Prepare stored PCM for playback. Short words often fall under the generation
 * floor after silence trim; keep them playable instead of treating as missing.
 */
function normalizePlayable(samples) {
  if (!samples?.length) return null;
  const trimmed = trimSilence(samples, PLAYABLE_MIN_SAMPLES);
  let out = trimmed;
  if (!longEnough(out, PLAYABLE_MIN_SAMPLES)) {
    if (longEnough(samples, PLAYABLE_MIN_SAMPLES)) out = samples;
    else if (trimmed.length >= Math.floor(SAMPLE_RATE * 0.04)) {
      const padded = new Float32Array(PLAYABLE_MIN_SAMPLES);
      padded.set(trimmed, Math.max(0, Math.floor((PLAYABLE_MIN_SAMPLES - trimmed.length) / 2)));
      out = padded;
    } else {
      return null;
    }
  }
  return out;
}

function remember(key, samples, { playable = false } = {}) {
  const ready = playable
    ? normalizePlayable(samples)
    : (normalizePlayable(samples) || (longEnough(samples) ? samples : null));
  if (!ready) return null;
  forgottenKeys.delete(key);
  memory.set(key, ready);
  return ready;
}

async function loadClip(key, db) {
  if (forgottenKeys.has(key)) return null;
  if (memory.has(key)) return memory.get(key);
  const local = normalizePlayable(await idbGet(key));
  if (local) {
    await idbPut(key, local);
    return remember(key, local, { playable: true });
  }
  // Prefer a valid remote clip when local is missing or too short/corrupt.
  const remote = await loadRemote(db, key);
  if (remote) {
    await idbPut(key, remote);
    return remember(key, remote, { playable: true });
  }
  return null;
}

function context() {
  if (!audioContext) audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  return audioContext;
}

/** Call from a user gesture so later hydrated clips can still start. */
export function unlockHomeworkAudio() {
  try {
    const ctx = context();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function startPlayback(samples) {
  if (!samples?.length) return Promise.resolve(false);
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

/** True when a premade clip for this line is already loaded. */
export function hasHomeworkVoice(text) {
  const key = cacheKey(text);
  if (!key || forgottenKeys.has(key)) return false;
  return memory.has(key);
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

function compactReadings(lines, readings) {
  if (!readings || typeof readings !== "object") return null;
  const out = {};
  lines.forEach((line) => {
    const spoken = speakableText(readings[line] || readings[cacheKey(line)] || "");
    if (spoken && speakableText(spoken) !== speakableText(line)) out[line] = spoken;
  });
  return Object.keys(out).length ? out : null;
}

async function synthesizeBatch(texts, signal, { readings = null } = {}) {
  throwIfAborted(signal);
  const lines = [...new Set((texts || []).map((t) => String(t || "").trim()).filter(Boolean))];
  if (!lines.length) return { clips: [], failed: [] };
  const readingMap = compactReadings(lines, readings);

  const { getAuth } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
  const user = getAuth().currentUser;
  if (!user) throw new Error("ログインが必要です。");
  const token = await user.getIdToken();
  throwIfAborted(signal);

  const controller = new AbortController();
  activeControllers.add(controller);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    console.warn("[homework voice] tts fetch timeout", { lines, ms: TTS_FETCH_TIMEOUT_MS });
    controller.abort();
  }, TTS_FETCH_TIMEOUT_MS);
  const fetchStarted = performance.now();
  try {
    console.info("[homework voice] tts fetch start", {
      lines: lines.length,
      sample: lines.slice(0, 3),
      readings: readingMap ? Object.keys(readingMap).length : 0,
    });
    const response = await fetch(TTS_FN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          texts: lines,
          ...(readingMap ? { readings: readingMap } : {}),
        },
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || "音声をつくれませんでした。");
    }
    const result = body.result || body;
    console.info("[homework voice] tts fetch done", {
      lines: lines.length,
      made: Array.isArray(result.clips) ? result.clips.length : 0,
      failed: Array.isArray(result.failed) ? result.failed.length : 0,
      clientMs: Math.round(performance.now() - fetchStarted),
      serverTotalMs: result?.timing?.totalMs ?? null,
      model: result?.model || "",
    });
    if (result?.timing) {
      console.info("[homework voice] tts server timing", result.timing);
    }
    return {
      clips: Array.isArray(result.clips) ? result.clips : [],
      failed: Array.isArray(result.failed) ? result.failed : [],
      timing: result.timing || null,
      model: result.model || "",
    };
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted || controller.signal.aborted) {
      if (signal?.aborted) throw abortError();
      throw new Error(`音声生成がタイムアウトしました（${Math.round(TTS_FETCH_TIMEOUT_MS / 1000)}秒）。もう一度お試しください。`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    activeControllers.delete(controller);
  }
}

function samplesFromTtsClip(clip) {
  if (!clip?.pcm) return null;
  const raw = decodePcm16(clip.pcm);
  const samples = normalizePlayable(raw) || raw;
  if (!samples?.length) return null;
  if (!longEnough(samples, PLAYABLE_MIN_SAMPLES)) return null;
  // Soft gate: reject only clearly bad long clips (TTS is already scripted).
  if (samples.length / SAMPLE_RATE >= 0.8 && !speechLooksOk(samples)) return null;
  return samples;
}

/**
 * Make any missing clips. Already cached lines are skipped unless force is true.
 * Uses Chirp / Gemini TTS via Cloud Function (no Live API).
 *
 * readings: optional { [displayText]: speakAs } map so Chirp can pronounce a
 * respelling / yomigana while clips stay cached under the display text key.
 */
export async function prepareHomeworkVoice(texts, { onProgress, db, force = false, signal, readings = null } = {}) {
  const startedAt = performance.now();
  const items = uniqueLines(texts);
  const readingMap = compactReadings(items.map((item) => item.text), readings);
  throwIfAborted(signal);
  if (force) {
    await forgetHomeworkVoice(items.map((item) => item.text), { db });
  } else {
    await hydrateHomeworkVoice(items.map((item) => item.text), db);
  }
  throwIfAborted(signal);
  const missing = items.filter((item) => !memory.has(item.key));
  const cachedItems = items.filter((item) => memory.has(item.key));
  const cached = cachedItems.length;
  console.info("[homework voice] prepare", {
    total: items.length,
    cached,
    missing: missing.length,
    hasDb: Boolean(db),
    force,
    readings: readingMap ? Object.keys(readingMap).length : 0,
    engine: "chirp3-hd",
    missingLines: missing.map((item) => item.text),
  });
  const currentLines = new Set();
  const report = (done, makingDone = 0) => {
    onProgress?.(done, items.length, {
      cached,
      making: missing.length,
      makingDone,
      reused: missing.length === 0,
      currentLines: [...currentLines],
      currentLine: [...currentLines][0] || "",
      missingLines: missing.map((item) => item.text),
      cachedLines: cachedItems.map((item) => item.text),
    });
  };
  report(cached, 0);

  const failed = [];
  const persistJobs = [];
  let shared = 0;
  let makingDone = 0;
  let ttsMs = 0;

  async function persistClip(item, kept, meta = {}) {
    await idbPut(item.key, kept);
    if (await saveRemote(db, item.key, kept, item.text, meta)) shared += 1;
  }

  async function runBatch(batch) {
    throwIfAborted(signal);
    batch.forEach((item) => currentLines.add(item.text));
    report(cached + makingDone, makingDone);
    const ttsStarted = performance.now();
    const { clips, failed: batchFailed, timing, model } = await synthesizeBatch(
      batch.map((item) => item.text),
      signal,
      { readings: readingMap },
    );
    ttsMs += performance.now() - ttsStarted;
    console.info("[homework voice] tts batch", {
      lines: batch.length,
      made: clips.length,
      failed: (batchFailed || []).length,
      clientWaitMs: Math.round(performance.now() - ttsStarted),
      serverTotalMs: timing?.totalMs ?? null,
      serverAuthMs: timing?.authMs ?? null,
      engines: (timing?.lines || []).reduce((map, row) => {
        map[row.engine] = (map[row.engine] || 0) + 1;
        return map;
      }, {}),
      model,
      slowest: (timing?.lines || []).slice().sort((a, b) => b.ms - a.ms).slice(0, 3),
    });
    const byText = new Map(clips.map((clip) => [speakableText(clip.text), clip]));
    for (const item of batch) {
      const clip = byText.get(speakableText(item.text));
      const samples = clip ? samplesFromTtsClip(clip) : null;
      if (!samples) {
        failed.push(item.text);
      } else {
        const kept = remember(item.key, samples, { playable: true });
        if (!kept) failed.push(item.text);
        else {
          persistJobs.push(persistClip(item, kept, {
            engine: clip.engine || model || "chirp3-hd",
            voice: "Kore",
          }));
        }
      }
      currentLines.delete(item.text);
      makingDone += 1;
      report(cached + makingDone, makingDone);
    }
    (batchFailed || []).forEach((line) => {
      if (!failed.includes(line)) failed.push(line);
    });
  }

  try {
    const batches = [];
    for (let offset = 0; offset < missing.length; offset += TTS_BATCH_SIZE) {
      batches.push(missing.slice(offset, offset + TTS_BATCH_SIZE));
    }
    for (let offset = 0; offset < batches.length; offset += TTS_PARALLEL_BATCHES) {
      throwIfAborted(signal);
      await Promise.all(
        batches.slice(offset, offset + TTS_PARALLEL_BATCHES).map((batch) => runBatch(batch)),
      );
    }
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      disconnectHomeworkVoiceSessions();
      throw abortError();
    }
    throw error;
  }

  throwIfAborted(signal);
  await Promise.allSettled(persistJobs);

  // Remake can forget a line after this prepare already built its missing list.
  // Catch those orphans in a second pass so the drawer is not left without audio.
  const lateMissing = items.filter((item) => !memory.has(item.key) || forgottenKeys.has(item.key));
  if (lateMissing.length) {
    console.info("[homework voice] late missing after forget race", lateMissing.map((item) => item.text));
    const lateBatches = [];
    for (let offset = 0; offset < lateMissing.length; offset += TTS_BATCH_SIZE) {
      lateBatches.push(lateMissing.slice(offset, offset + TTS_BATCH_SIZE));
    }
    for (let offset = 0; offset < lateBatches.length; offset += TTS_PARALLEL_BATCHES) {
      throwIfAborted(signal);
      await Promise.all(
        lateBatches.slice(offset, offset + TTS_PARALLEL_BATCHES).map((batch) => runBatch(batch)),
      );
    }
    await Promise.allSettled(persistJobs);
  }

  // Freshly made clips were already uploaded in persistClip — do not re-getDoc them.
  // Only sync when we reused cache (nothing generated) and may still need remote publish.
  let sync = { synced: shared, missing: [], failed: [], published: 0 };
  const stillMissing = items.filter((item) => !memory.has(item.key));
  if (!stillMissing.length && !missing.length && !lateMissing.length) {
    sync = await syncHomeworkVoiceRemote(items.map((item) => item.text), db, { force: false });
    shared = Math.max(shared, sync.synced);
  }
  if (sync.failed.length) {
    sync.failed.forEach((line) => {
      if (!failed.includes(line)) failed.push(line);
    });
  }
  if (sync.missing.length) {
    sync.missing.forEach((line) => {
      if (!failed.includes(line)) failed.push(line);
    });
  }
  console.info("[homework voice] done", {
    total: items.length,
    cached,
    made: Math.max(0, missing.length - failed.length),
    failed: failed.length,
    shared,
    syncMissing: sync.missing.length,
    ttsMs: Math.round(ttsMs),
    totalMs: Math.round(performance.now() - startedAt),
    failedLines: failed,
  });
  return {
    total: items.length,
    failed,
    cached,
    shared,
    missingLines: missing.map((item) => item.text),
    syncFailed: sync.failed,
    syncMissing: sync.missing,
  };
}
