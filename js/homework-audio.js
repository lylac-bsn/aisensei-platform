import { playHomeworkVoice, stopHomeworkVoice } from "./homework-voice-bank.js?v=20261030-hw-lib26";

let active = null;

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
  return speak(spoken, lang);
}
