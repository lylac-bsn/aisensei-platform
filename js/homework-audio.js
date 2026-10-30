import {
  hasHomeworkVoice,
  hydrateHomeworkVoice,
  playHomeworkVoice,
  prepareHomeworkVoice,
  stopHomeworkVoice,
} from "./homework-voice-bank.js?v=20261030-hw-lib85";

let active = null;
let playToken = 0;

export function stopPrompt() {
  playToken += 1;
  active?.stop();
  active = null;
  stopHomeworkVoice();
}

async function playLearnyClip(text) {
  const voice = playHomeworkVoice(text);
  if (!voice) return false;
  active = { stop: () => stopHomeworkVoice() };
  return Boolean(await voice);
}

/**
 * Play a homework line with Learny's Gemini voice only.
 * Never falls back to browser speechSynthesis.
 * If the clip is missing, hydrate from cache / generate via Gemini Live.
 */
export async function playPrompt(text, _lang, options = {}) {
  stopPrompt();
  const spoken = String(text || "").trim();
  if (!spoken) return "none";
  const token = playToken;
  const db = options.db;

  if (await playLearnyClip(spoken)) return "learny";
  if (token !== playToken) return "none";

  await hydrateHomeworkVoice([spoken], db);
  if (token !== playToken) return "none";
  if (await playLearnyClip(spoken)) return "learny";
  if (token !== playToken) return "none";

  // Always synthesize missing lines with Gemini Live — same human voice as Learny.
  if (options.generate === false) return "none";
  try {
    await prepareHomeworkVoice([spoken], { db, force: false });
  } catch (error) {
    console.warn("[homework-audio] gemini voice failed", spoken, error);
    return "none";
  }
  if (token !== playToken) return "none";
  if (!hasHomeworkVoice(spoken)) return "none";
  if (await playLearnyClip(spoken)) return "learny";
  return "none";
}
