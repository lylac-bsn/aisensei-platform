#!/usr/bin/env node

/**
 * Ch4 Beat A1 is colour MCQ only — opening asks favourite colour with premade
 * buttons; unknown-colour fallback picker speak is removed.
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
  clear() {
    this.#data.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  GC_LEVEL: "beginner",
  GC_LESSON: "part1",
  location: { search: "" },
};

const {
  CH4_PICKER_COLORS,
  MCQ_AUDIO_COLORS,
  normalizeAllowedFavoriteColor,
  colorToJaLabel,
} = await import("../js/mcq-audio-config.js");
const { recordMemory, loadLessonState, resetLesson } = await import("../js/lesson-engine.js");

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const part1 = readFileSync(new URL("js/lessons/aquarium-part1.js", root), "utf8");
const lessonEngine = readFileSync(new URL("js/lesson-engine.js", root), "utf8");
const voiceTab = readFileSync(new URL("voice-tab.html", root), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

assert.ok(CH4_PICKER_COLORS.length >= 4 && CH4_PICKER_COLORS.length <= 6);
for (const color of CH4_PICKER_COLORS) {
  assert.ok(MCQ_AUDIO_COLORS.includes(color), `${color} must be in lesson colour set`);
  assert.equal(normalizeAllowedFavoriteColor(color), color);
  assert.notEqual(colorToJaLabel(color), color);
}

assert.equal(normalizeAllowedFavoriteColor("rainbow"), "");
assert.equal(recordMemory("favoriteColor", "rainbow").ok, false);

resetLesson();
assert.equal(recordMemory("favoriteColor", "Blue").ok, true);
assert.equal(loadLessonState().memories.favoriteColor, "blue");

assert.match(part1, /ONLY button taps choose favoriteColor/);
assert.doesNotMatch(part1, /Unknown colour \(rainbow/);
assert.doesNotMatch(part1, /Which colour would you pick out of these/);

assert.match(lessonEngine, /Colour MCQ buttons are on screen/);
assert.doesNotMatch(
  lessonEngine,
  /Picker line EXACTLY: Which colour would you pick out of these/
);

assert.match(voice, /function ch4ColorChoiceActive/);
assert.match(voice, /CH4_COLOR_ASK_SPEAK/);
assert.match(voice, /What's your favorite color\?/);
assert.match(voice, /すきな いろは？/);
assert.match(voice, /handleCh4ColorPickerClick/);
assert.match(voice, /withSpeakers:\s*false/);
assert.match(voice, /すきな色はボタンで選んでね/);
assert.match(voice, /Beat A1 is colour-button only/);
assert.doesNotMatch(voice, /CH4_COLOR_PICKER_SPEAK_EN/);
assert.doesNotMatch(voice, /この中だったらどの色がすき？/);
assert.doesNotMatch(voice, /function looksLikeUnknownColorAttempt/);
assert.doesNotMatch(voice, /function forceCh4ColorPicker/);
assert.doesNotMatch(voice, /function enterCh4ColorPicker/);
assert.doesNotMatch(voice, /is a cool colour!/);

const freeTalk = functionBody(voice, "isCh4FreeTalkUi");
assert.match(freeTalk, /ch4ColorChoiceActive\(\)\s*\)\s*return false/);

const render = functionBody(voice, "renderChoiceBar");
assert.match(render, /ch4ColorChoiceActive\(\)/);
assert.match(render, /CH4_COLOR_ASK_EN/);
assert.match(render, /CH4_COLOR_ASK_JA/);

const coach = functionBody(voice, "buildCh4OutboundCoach");
assert.match(coach, /colour buttons are on screen/);
assert.doesNotMatch(coach, /looksLikeUnknownColorAttempt/);
assert.doesNotMatch(coach, /Child named a color/);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-daily1-latency-1/);

console.log("Ch4 colour MCQ Beat A1 regression checks passed.");
