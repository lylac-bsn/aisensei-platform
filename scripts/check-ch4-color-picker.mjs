#!/usr/bin/env node

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
assert.equal(normalizeAllowedFavoriteColor("gold"), "");
assert.equal(colorToJaLabel("rainbow"), colorToJaLabel("orange"));

resetLesson();
assert.equal(recordMemory("favoriteColor", "rainbow").ok, false);
assert.equal(recordMemory("favoriteColor", "rainbow").reason, "invalid_color");
assert.equal(String(loadLessonState().memories?.favoriteColor || ""), "");
assert.equal(recordMemory("favoriteColor", "Blue").ok, true);
assert.equal(loadLessonState().memories.favoriteColor, "blue");

assert.match(part1, /Unknown colour \(rainbow/);
assert.match(voice, /CH4_PICKER_COLORS/);
assert.match(voice, /ch4ColorPickerActive/);
assert.match(voice, /Which colour would you pick out of these\?/);
assert.match(voice, /この中だったらどの色がすき？/);
assert.match(voice, /forceCh4ColorPicker/);
assert.match(voice, /handleCh4ColorPickerClick/);
assert.match(voice, /looksLikeUnknownColorAttempt/);
assert.match(voice, /assistantInventedUnsupportedCh4Color/);
assert.match(voice, /tool-invalid-color/);

const freeTalk = functionBody(voice, "isCh4FreeTalkUi");
assert.match(freeTalk, /ch4ColorPickerActive\(\)\s*\)\s*return false/);

const render = functionBody(voice, "renderChoiceBar");
assert.match(render, /ch4ColorPickerActive\(\)/);
assert.match(render, /handleCh4ColorPickerClick/);
assert.match(render, /withSpeakers:\s*false/);
assert.match(render, /lesson-choice-option--no-speaker/);

const coach = functionBody(voice, "buildCh4OutboundCoach");
assert.match(coach, /looksLikeUnknownColorAttempt/);
assert.match(coach, /Do NOT record_memory that colour/);

console.log("Ch4 colour-picker regression checks passed.");
