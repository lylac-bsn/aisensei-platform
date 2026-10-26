/**
 * Homework sound effects. Clips are fetched once, decoded into cached
 * AudioBuffers, and played through one gain node so every cue has the same
 * level. Playback goes through the device mixer, so system and tab mute apply.
 * A correct, incorrect, streak, or completion cue replaces whatever is playing.
 * The select cue does not restart while it is already playing.
 */

const FILES = {
  correct: "sound-effect/correct-answer.wav",
  incorrect: "sound-effect/incorrect-answer.wav",
  select: "sound-effect/answer-select.wav",
  streak: "sound-effect/correct-streak.wav",
  complete: "sound-effect/homework-complete.wav",
};

const STORAGE_KEY = "learny-sfx";
const VOLUME = 0.55;

let clips = null;
let loading = null;
let context = null;
let gain = null;
const decoded = new Map();
let active = null;
let activeName = "";

export function sfxEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSfxEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private browsing can refuse storage. The switch still updates this session.
  }
  if (!on) stopHomeworkSfx();
  window.dispatchEvent(new CustomEvent("learny-sfx"));
}

export function preloadHomeworkSfx() {
  if (!loading) {
    loading = Promise.all(Object.entries(FILES).map(async ([name, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(url);
      return [name, await response.arrayBuffer()];
    })).then((rows) => {
      clips = new Map(rows);
    }).catch(() => {
      clips = new Map();
    });
  }
  return loading;
}

export function stopHomeworkSfx() {
  if (!active) return;
  const source = active;
  active = null;
  activeName = "";
  try { source.stop(); } catch { /* already stopped */ }
}

async function audioContext() {
  if (!context) {
    context = new AudioContext();
    gain = context.createGain();
    gain.gain.value = VOLUME;
    gain.connect(context.destination);
  }
  if (context.state === "suspended") await context.resume();
  return context;
}

async function bufferFor(name) {
  await preloadHomeworkSfx();
  const bytes = clips?.get(name);
  if (!bytes) return null;
  if (decoded.has(name)) return decoded.get(name);
  const audio = await audioContext();
  const buffer = await audio.decodeAudioData(bytes.slice(0));
  decoded.set(name, buffer);
  return buffer;
}

export function playHomeworkSfx(name) {
  if (!sfxEnabled() || !FILES[name]) return Promise.resolve();
  if (name === "select" && activeName === "select") return Promise.resolve();
  return bufferFor(name).then((buffer) => {
    if (!buffer || !sfxEnabled()) return;
    if (name === "select" && activeName === "select") return;
    const audio = context;
    stopHomeworkSfx();
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    active = source;
    activeName = name;
    return new Promise((resolve) => {
      source.onended = () => {
        if (active === source) {
          active = null;
          activeName = "";
        }
        resolve();
      };
      try {
        source.start();
      } catch {
        if (active === source) {
          active = null;
          activeName = "";
        }
        resolve();
      }
    });
  }).catch(() => {});
}

export function resultSound(streak, correct) {
  if (!correct) return { streak: 0, name: "incorrect" };
  const next = streak + 1;
  return { streak: next, name: next % 5 === 0 ? "streak" : "correct" };
}
