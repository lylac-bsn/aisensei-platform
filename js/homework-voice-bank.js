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
const PHRASE_TIMEOUT_MS = 28000;
const MAX_ATTEMPTS = 3;
const SILENCE_LEVEL = 0.008;
/** Generation floor — prefer a clear clip, but short words ("I", "a") are often under 0.3s. */
const MIN_SAMPLES = Math.floor(SAMPLE_RATE * 0.22);
/** Playback floor — never discard shared teacher clips that are merely short after trim. */
const PLAYABLE_MIN_SAMPLES = Math.floor(SAMPLE_RATE * 0.08);
const DB_NAME = "learny-homework-voice";

const memory = new Map();
const pendingLoads = new Map();
const liveClients = new Set();
let activeStop = null;
let audioContext = null;
let preferredModel = LATEST_MODEL;

function abortError(message = "音声生成を停止しました。") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

/** Cut any in-flight Live sessions so prepareHomeworkVoice can unwind quickly. */
export function disconnectHomeworkVoiceSessions() {
  for (const client of [...liveClients]) {
    try { client.disconnect(); } catch { /* already closed */ }
  }
  liveClients.clear();
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

function phraseTimeoutMs(text) {
  const label = speakableText(text);
  const units = /[\u3040-\u30ff\u4e00-\u9fff]/.test(label)
    ? Math.max(1, [...label.replace(/\s+/g, "")].length)
    : Math.max(1, label.split(/\s+/).filter(Boolean).length);
  return Math.min(45000, PHRASE_TIMEOUT_MS + units * 400);
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
export async function forgetHomeworkVoice(texts) {
  const items = uniqueLines(texts);
  await Promise.all(items.map(async (item) => {
    memory.delete(item.key);
    pendingLoads.delete(item.key);
    await idbDelete(item.key);
  }));
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
  let synced = 0;
  let published = 0;
  const missing = [];
  const failed = [];
  for (const item of items) {
    try {
      let samples = memory.get(item.key) || null;
      if (!samples) {
        const local = normalizePlayable(await idbGet(item.key));
        if (local) samples = remember(item.key, local, { playable: true });
      }
      const remote = await loadRemote(db, item.key);
      if (!samples) {
        if (remote) {
          samples = remember(item.key, remote, { playable: true });
          synced += 1;
          continue;
        }
        missing.push(item.text);
        continue;
      }
      // Remote present and playable — skip unless force re-publish from local.
      if (remote && !force) {
        synced += 1;
        continue;
      }
      if (await saveRemote(db, item.key, samples, item.text)) {
        synced += 1;
        published += 1;
      } else {
        failed.push(item.text);
      }
    } catch (error) {
      console.warn("homework voice: sync failed", item.text, error);
      failed.push(item.text);
    }
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
async function saveRemote(db, key, samples, text = "") {
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
    await setDoc(doc(db, "homeworkVoice", await clipId(key)), {
      pcm,
      rate: SAMPLE_RATE,
      key,
      text: String(text || "").slice(0, 160),
      updatedAt: serverTimestamp(),
    }, { merge: true });
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
  memory.set(key, ready);
  return ready;
}

async function loadClip(key, db) {
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
  return Boolean(key && memory.has(key));
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

async function generateOnce(text, model, signal) {
  throwIfAborted(signal);
  const line = speakableText(text);
  const minSamples = generateMinSamples(line);
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
  const onAbort = () => {
    try { client.disconnect(); } catch { /* already closed */ }
    pending?.fail(abortError());
  };
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
  client.onErrorMessage = (message) => pending?.fail(
    signal?.aborted ? abortError() : new Error(String(message || "voice connection error")),
  );
  client.onClose = () => pending?.fail(
    signal?.aborted ? abortError() : new Error("voice connection closed"),
  );

  liveClients.add(client);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    throwIfAborted(signal);
    await client.connect();
    throwIfAborted(signal);
    await waitForSetup(client);
    throwIfAborted(signal);
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      let grace = null;
      let settled = false;
      const chunkSamples = () => chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const stopTimers = () => {
        clearTimeout(timer);
        clearTimeout(grace);
      };
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        stopTimers();
        fn(value);
      };
      const finish = () => {
        if (!chunks.length || chunkSamples() < minSamples) {
          settle(reject, new Error("voice empty"));
          return;
        }
        settle(resolve, concatSamples(chunks));
      };
      const timer = setTimeout(() => {
        // Keep partial audio if the model spoke but never sent TURN_COMPLETE.
        if (chunkSamples() >= minSamples) finish();
        else settle(reject, new Error("voice timeout"));
      }, phraseTimeoutMs(line));
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
          if (error?.name === "AbortError" || signal?.aborted) {
            settle(reject, abortError());
            return;
          }
          if (chunkSamples() >= minSamples) {
            finish();
            return;
          }
          settle(reject, error);
        },
      };
      if (signal?.aborted) {
        pending.fail(abortError());
        return;
      }
      if (!client.sendTextMessage(`<say>${line}</say>`)) pending.fail(new Error("voice send failed"));
    });
    throwIfAborted(signal);
    if (!readingMatches(line, said)) throw new Error(`voice read the wrong line: ${said}`);
    const samples = normalizePlayable(raw) || trimSilence(raw, minSamples);
    if (!longEnough(samples, minSamples) && !longEnough(samples, PLAYABLE_MIN_SAMPLES)) {
      throw new Error("voice too short");
    }
    if (samples.length / SAMPLE_RATE > maxSeconds(line)) throw new Error("voice too long");
    return samples;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    pending = null;
    liveClients.delete(client);
    client.disconnect();
  }
}

function setupFailed(error) {
  const message = String(error?.message || error);
  // Phrase "voice timeout" should retry. Only abort a model when the Live session itself failed.
  return /session not ready|voice session not ready|voice connection|voice send failed|voice session error/.test(message);
}

function shouldRetry(error) {
  const message = String(error?.message || error);
  return /voice timeout|voice empty|voice too short|voice connection closed|voice read the wrong line/.test(message);
}

async function generatePhrase(text, signal) {
  let lastError = null;
  const models = preferredModel === FALLBACK_MODEL
    ? [FALLBACK_MODEL]
    : [LATEST_MODEL, FALLBACK_MODEL];
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        throwIfAborted(signal);
        const samples = await generateOnce(text, model, signal);
        if (model === FALLBACK_MODEL && setupFailed(lastError)) preferredModel = FALLBACK_MODEL;
        return samples;
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) throw abortError();
        lastError = error;
        if (setupFailed(error)) break;
        if (!shouldRetry(error) && attempt + 1 >= MAX_ATTEMPTS) break;
        // Brief pause before retrying a timed-out Live turn.
        await new Promise((resolve) => setTimeout(resolve, 350 + attempt * 250));
        throwIfAborted(signal);
      }
    }
  }
  throw lastError;
}

/**
 * Make any missing clips. Already cached lines are skipped unless force is true.
 * Returns how many lines failed so the teacher can press create again.
 *
 * onProgress(done, total, info) where info.cached / info.making describe
 * how much is reused vs newly generated.
 */
export async function prepareHomeworkVoice(texts, { onProgress, db, force = false, signal } = {}) {
  const items = uniqueLines(texts);
  throwIfAborted(signal);
  if (force) {
    // Drop local caches only. Remote is overwritten after a successful remake.
    await forgetHomeworkVoice(items.map((item) => item.text));
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
    cachedLines: cachedItems.map((item) => item.text),
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
  let shared = 0;
  let cursor = 0;
  let makingDone = 0;
  async function worker() {
    while (cursor < missing.length) {
      throwIfAborted(signal);
      const item = missing[cursor];
      cursor += 1;
      currentLines.add(item.text);
      report(cached + makingDone, makingDone);
      try {
        const samples = await generatePhrase(item.text, signal);
        throwIfAborted(signal);
        const kept = remember(item.key, samples, { playable: true });
        if (!kept) throw new Error("voice too short");
        await idbPut(item.key, kept);
        if (await saveRemote(db, item.key, kept, item.text)) shared += 1;
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) throw abortError();
        console.warn("homework voice", item.text, error);
        failed.push(item.text);
      } finally {
        currentLines.delete(item.text);
      }
      makingDone += 1;
      report(cached + makingDone, makingDone);
    }
  }
  try {
    if (missing.length) {
      const workers = Math.min(2, missing.length);
      await Promise.all(Array.from({ length: workers }, () => worker()));
    }
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      disconnectHomeworkVoiceSessions();
      throw abortError();
    }
    throw error;
  }
  throwIfAborted(signal);
  // Cached local-only clips must still be published for students.
  const sync = await syncHomeworkVoiceRemote(items.map((item) => item.text), db, { force: true });
  shared = Math.max(shared, sync.synced);
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
