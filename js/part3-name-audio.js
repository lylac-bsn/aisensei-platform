/**
 * Part 3 `{name}` choice audio: learner names are not in the pre-generated
 * manifest, so each label is voiced once per page via a short Gemini session
 * and cached as 24 kHz mono samples for the choice speaker buttons.
 */
import { GeminiLiveAPI, MultimodalLiveResponseType } from "./gemini-api.js";

export const PART3_NAME_AUDIO_SAMPLE_RATE = 24000;

const LABEL_TIMEOUT_MS = 20000;
const SETUP_TIMEOUT_MS = 10000;

const cache = new Map();

function cacheKey(label) {
  return String(label || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .toLocaleLowerCase("en-US");
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

function concatSamples(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function waitForSetup(client) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (client.sessionReady) return resolve();
      if (!client.connected || Date.now() - startedAt > SETUP_TIMEOUT_MS) {
        return reject(new Error("name audio session not ready"));
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function generateLabels(labels, { proxyUrl, projectId, model, voiceName }) {
  const client = new GeminiLiveAPI(proxyUrl, projectId, model);
  client.responseModalities = ["AUDIO"];
  client.voiceName = voiceName;
  client.temperature = 0.2;
  client.inputAudioTranscription = false;
  client.outputAudioTranscription = false;
  client.sessionResumptionEnabled = false;
  client.systemInstructions =
    "You are a text-to-speech voice for a children's English lesson. " +
    "Each message contains English text between <say> and </say>. " +
    "Read exactly that text aloud once, clearly and warmly, at a slightly slow pace. " +
    "Say nothing else — no greeting, no explanation, no translation.";

  let pending = null;
  client.onReceiveResponse = (message) => {
    if (!pending) return;
    if (message.type === MultimodalLiveResponseType.AUDIO && message.data) {
      pending.chunks.push(decodePcm16(message.data));
    } else if (message.type === MultimodalLiveResponseType.TURN_COMPLETE) {
      pending.done();
    }
  };
  client.onErrorMessage = () => pending?.fail(new Error("name audio connection error"));
  client.onClose = () => pending?.fail(new Error("name audio connection closed"));

  try {
    await client.connect();
    await waitForSetup(client);
    for (const label of labels) {
      const entry = cache.get(cacheKey(label));
      if (!entry || entry.settled) continue;
      try {
        const samples = await new Promise((resolve, reject) => {
          const chunks = [];
          const timer = setTimeout(() => reject(new Error("name audio timeout")), LABEL_TIMEOUT_MS);
          pending = {
            chunks,
            done: () => {
              clearTimeout(timer);
              if (!chunks.length) reject(new Error("name audio empty"));
              else resolve(concatSamples(chunks));
            },
            fail: (error) => {
              clearTimeout(timer);
              reject(error);
            },
          };
          if (!client.sendTextMessage(`<say>${label}</say>`)) {
            pending.fail(new Error("name audio send failed"));
          }
        });
        entry.resolve(samples);
      } catch (error) {
        entry.reject(error);
      } finally {
        pending = null;
      }
    }
  } catch (error) {
    for (const label of labels) cache.get(cacheKey(label))?.reject(error);
  } finally {
    client.disconnect();
  }
}

/** Start (or reuse) generation for every label; failed labels retry next call. */
export function ensurePart3NameAudio(labels, options) {
  const fresh = [];
  for (const label of labels) {
    const key = cacheKey(label);
    if (!key) continue;
    const existing = cache.get(key);
    if (existing && !existing.failed) continue;
    const entry = { settled: false, failed: false };
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = (samples) => {
        if (entry.settled) return;
        entry.settled = true;
        resolve(samples);
      };
      entry.reject = (error) => {
        if (entry.settled) return;
        entry.settled = true;
        entry.failed = true;
        reject(error);
      };
    });
    entry.promise.catch(() => {});
    cache.set(key, entry);
    fresh.push(label);
  }
  if (fresh.length) void generateLabels(fresh, options);
}

/** Promise of Float32 samples, or null when the label was never requested. */
export function getPart3NameAudio(label) {
  return cache.get(cacheKey(label))?.promise || null;
}
