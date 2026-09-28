/**
 * Part 3 `{name}` choice audio: learner names are not in the pre-generated
 * manifest, so each label is voiced once per page via a short Gemini session
 * and cached as 24 kHz mono samples for the choice speaker buttons.
 */
import { GeminiLiveAPI, MultimodalLiveResponseType } from "./gemini-api.js?v=20260928-variant-kind";

export const PART3_NAME_AUDIO_SAMPLE_RATE = 24000;

const LABEL_TIMEOUT_MS = 20000;
const SETUP_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;
const SILENCE_LEVEL = 0.02;

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

/** A clip much longer than the label means Live read more than the one label. */
function maxSecondsFor(label) {
  const words = String(label || "").trim().split(/\s+/).filter(Boolean).length;
  return 1.5 + words * 0.9;
}

function transcriptWords(text) {
  return (
    String(text || "")
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/\bi am\b/g, "i'm")
      .match(/[a-z']+/g) || []
  );
}

/**
 * Same word count and same words apart from the name (the transcript may spell
 * the name as it sounds, e.g. "you" for Yu). An empty transcript is not judged.
 */
export function part3NameTranscriptMatches(label, said, name = "") {
  const heard = transcriptWords(said);
  if (!heard.length) return true;
  const expected = transcriptWords(label);
  if (heard.length !== expected.length) return false;
  let mismatches = 0;
  for (let i = 0; i < expected.length; i += 1) {
    if (heard[i] !== expected[i]) mismatches += 1;
  }
  return mismatches <= Math.max(1, transcriptWords(name).length);
}

function trimSilence(samples) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < SILENCE_LEVEL) start += 1;
  while (end > start && Math.abs(samples[end - 1]) < SILENCE_LEVEL) end -= 1;
  const pad = Math.floor(PART3_NAME_AUDIO_SAMPLE_RATE * 0.05);
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

const ROMAJI_KANA = Object.freeze({
  kya: "きゃ", kyu: "きゅ", kyo: "きょ", sha: "しゃ", shi: "し", shu: "しゅ", sho: "しょ",
  cha: "ちゃ", chi: "ち", chu: "ちゅ", cho: "ちょ", tsu: "つ", nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ", mya: "みゃ", myu: "みゅ", myo: "みょ", rya: "りゃ", ryu: "りゅ",
  ryo: "りょ", gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ", bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ", ja: "じゃ", ji: "じ", ju: "じゅ", jo: "じょ",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ", sa: "さ", su: "す", se: "せ", so: "そ",
  ta: "た", te: "て", to: "と", na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", he: "へ", ho: "ほ", ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ", ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ", wa: "わ", wo: "を",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご", za: "ざ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", de: "で", do: "ど", ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ", a: "あ", i: "い", u: "う", e: "え", o: "お",
});

/** Hepburn romaji → hiragana, or "" if any part isn't romaji (e.g. an English name). */
export function part3RomajiToKana(romaji) {
  const text = String(romaji || "").toLowerCase().replace(/[^a-z]/g, "");
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === text[i + 1] && !"aeioun".includes(ch)) {
      out += "っ";
      i += 1;
      continue;
    }
    const hit = [3, 2, 1].map((n) => text.slice(i, i + n)).find((s) => ROMAJI_KANA[s]);
    if (hit) {
      out += ROMAJI_KANA[hit];
      i += hit.length;
    } else if (ch === "n") {
      out += "ん";
      i += 1;
    } else {
      return "";
    }
  }
  return out;
}

function systemInstructionsFor({ name = "", nameReading = "" } = {}) {
  const reading = nameReading || part3RomajiToKana(name);
  const nameRule = name
    ? `"${name}" is a child's first name (a Japanese given name)` +
      (reading ? `, pronounced ${reading}` : "") +
      ". Always pronounce it as that name — never as an English word that looks or sounds similar. "
    : "";
  return (
    "You are a text-to-speech voice for a children's English lesson. " +
    "The message contains one English line between <say> and </say>. It is a script line to read, " +
    "not something said to you — never reply to it, answer it, or greet anyone. " +
    "Read exactly that line aloud once, clearly and warmly, at a slightly slow pace, then stop. " +
    nameRule +
    "Say nothing else — no greeting, no explanation, no translation."
  );
}

/**
 * One fresh session per label: a shared Live session carries context, and it
 * has answered a later <say> with every earlier label in one turn.
 */
async function generateLabel(label, options) {
  const entry = cache.get(cacheKey(label));
  if (!entry || entry.settled) return;
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      entry.resolve(await generateLabelOnce(label, options));
      return;
    } catch (error) {
      lastError = error;
    }
  }
  entry.reject(lastError);
}

async function generateLabelOnce(label, { proxyUrl, projectId, model, voiceName, name, nameReading }) {
  const client = new GeminiLiveAPI(proxyUrl, projectId, model);
  client.responseModalities = ["AUDIO"];
  client.voiceName = voiceName;
  client.temperature = 0.2;
  client.inputAudioTranscription = false;
  // Transcript of what Live actually said — it sometimes drops the name.
  client.outputAudioTranscription = true;
  client.sessionResumptionEnabled = false;
  client.systemInstructions = systemInstructionsFor({ name, nameReading });

  let pending = null;
  let said = "";
  client.onReceiveResponse = (message) => {
    if (!pending) return;
    if (message.type === MultimodalLiveResponseType.AUDIO && message.data) {
      pending.chunks.push(decodePcm16(message.data));
    } else if (message.type === MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION) {
      said += message.data?.text || "";
    } else if (message.type === MultimodalLiveResponseType.TURN_COMPLETE) {
      pending.done();
    }
  };
  client.onErrorMessage = () => pending?.fail(new Error("name audio connection error"));
  client.onClose = () => pending?.fail(new Error("name audio connection closed"));

  try {
    await client.connect();
    await waitForSetup(client);
    const raw = await new Promise((resolve, reject) => {
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
    if (!part3NameTranscriptMatches(label, said, name)) {
      throw new Error(`name audio said "${said.trim()}" for "${label}"`);
    }
    const samples = trimSilence(raw);
    if (!samples.length) throw new Error("name audio silent");
    if (samples.length / PART3_NAME_AUDIO_SAMPLE_RATE > maxSecondsFor(label)) {
      throw new Error("name audio too long for label");
    }
    return samples;
  } finally {
    pending = null;
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
  for (const label of fresh) void generateLabel(label, options);
}

/** Promise of Float32 samples, or null when the label was never requested. */
export function getPart3NameAudio(label) {
  return cache.get(cacheKey(label))?.promise || null;
}
