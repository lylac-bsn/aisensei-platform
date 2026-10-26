import { normalizeMcqAudioLabel } from "./mcq-audio-config.js?v=20261026-homework";
import { playHomeworkVoice, stopHomeworkVoice } from "./homework-voice-bank.js?v=20261026-retry";

let manifestPromise;
let active = null;

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = import("../audio/mcq/manifest.js?v=20260927-mcq-v2")
      .then((mod) => mod.MCQ_AUDIO_MANIFEST)
      .catch(() => ({}));
  }
  return manifestPromise;
}

function speak(text, lang) {
  if (!window.speechSynthesis) return "none";
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "ja" ? "ja-JP" : "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  active = { stop() { window.speechSynthesis.cancel(); } };
  return "fallback";
}

export function stopPrompt() {
  active?.stop();
  active = null;
  stopHomeworkVoice();
}

export async function playPrompt(text, lang) {
  stopPrompt();
  const spoken = String(text || "").trim();
  if (!spoken) return "none";
  const voice = playHomeworkVoice(spoken);
  if (voice) {
    const played = await voice;
    if (played) return "learny";
  }
  const table = await loadManifest();
  const clip = table?.[normalizeMcqAudioLabel(spoken)]?.path;
  if (!clip) return speak(spoken, lang);
  const audio = new Audio(clip);
  active = { stop() { audio.pause(); } };
  try {
    await audio.play();
    return "file";
  } catch {
    return speak(spoken, lang);
  }
}
