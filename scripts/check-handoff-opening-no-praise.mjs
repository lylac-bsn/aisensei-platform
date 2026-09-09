#!/usr/bin/env node
/**
 * Ch4 → Ch5 handoff must not feed "I made yellow glass!" into the next opening,
 * and the seeded wall-opening bubble must ignore late praise STT.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class MemoryStorage {
  #data = new Map();
  getItem(key) {
    return this.#data.has(String(key)) ? this.#data.get(String(key)) : null;
  }
  setItem(key, value) {
    this.#data.set(String(key), String(value));
  }
  removeItem(key) {
    this.#data.delete(String(key));
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  GC_LEVEL: "beginner",
  GC_LESSON: "part1",
  location: { search: "" },
  parent: { postMessage() {} },
};

const engine = await import("../js/lesson-engine.js");
const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

const lesson = engine.getLesson("part1", "beginner");
const ch5Index = lesson.segments.findIndex((s) => s.id === "ch5");
assert.ok(ch5Index >= 0);
const state = engine.emptyState("part1");
state.segmentIndex = ch5Index;
engine.saveLessonState(state);

const nudge = engine.buildHandoffOpeningNudge(engine.loadLessonState(), {
  lastQuote: "I made yellow glass!",
  reason: "after-ch4",
});
assert.doesNotMatch(nudge, /Child said/);
assert.doesNotMatch(nudge, /I made yellow glass/i);
assert.match(nudge, /tank wall|すいそうの\s*かべ/);
assert.match(nudge, /praising the previous answer/);

assert.match(voice, /function looksLikePriorAnswerPraiseStt/);
assert.match(voice, /handoffOpeningDisplayLocked/);
assert.match(voice, /drop prior-answer praise STT during handoff open/);
assert.match(voice, /destId === "ch5"/);
assert.match(voice, /\^\(\?:after-\|replay-after-\)/);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-accuracy-best-1/);

console.log("check-handoff-opening-no-praise: ok");
