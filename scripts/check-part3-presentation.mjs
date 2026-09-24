#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lessonFor } from "../js/lessons/lesson-catalog.js";
import {
  AQUARIUM_PART3,
  PART3_GLASS_COLORS,
  PART3_FISH_COLORS,
  PART3_DECORATION1_CHOICES,
  PART3_DECORATION2_POOL,
  PART3_FISH_CHOICES,
  resolvePart3Beat,
  resolvePart3Text,
  part3EnglishName,
  part3FishVariantKey,
  PART3_RETRY_SPEAK,
} from "../js/lessons/aquarium-presentation.js";
import {
  ENDING_AUDIO_SCRIPTS,
  PART3_RETRY_AUDIO_KEY,
  PART3_RETRY_AUDIO_TEXT,
} from "../js/ending-audio-config.js";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const page1 = readFileSync(new URL("page1.html", root), "utf8");
const voiceTab = readFileSync(new URL("voice-tab.html", root), "utf8");

assert.equal(lessonFor("beginner", "part3").architecture, AQUARIUM_PART3.architecture);
assert.equal(lessonFor("beginner", "part1").id, "part1");
assert.equal(lessonFor("beginner", "part2").id, "part2");

const ids = AQUARIUM_PART3.segments.map((s) => s.id);
assert.deepEqual(ids, [
  "p3ch0", "p3ch1", "p3ch2", "p3ch3", "p3ch4", "p3ch5",
  "p3quiz", "p3ch6", "p3ch7", "p3final", "p3ending",
]);

const extras = { otherColor: "red" };
const memorySets = [];
for (const fishType of PART3_FISH_CHOICES) {
  const fishColors = fishType.toLowerCase() === "tropical fish" ? PART3_FISH_COLORS : [""];
  for (const fishColor of fishColors) {
    const presentationFish = fishColor ? `${fishColor} ${fishType}` : fishType;
    memorySets.push({
      name: "Yuki",
      glassColor: PART3_GLASS_COLORS[0],
      decoration1: PART3_DECORATION1_CHOICES[0],
      decoration2: PART3_DECORATION2_POOL.find((d) => d !== PART3_DECORATION1_CHOICES[0]),
      fishType,
      fishColor,
      presentationFish,
    });
  }
}

const leftover = /\{\w+\}/;
for (const memories of memorySets) {
  assert.ok(part3FishVariantKey(memories), `variant key for ${memories.fishType}`);
  for (const segment of AQUARIUM_PART3.segments) {
    for (const raw of segment.part3Beats || []) {
      const beat = resolvePart3Beat(raw, memories);
      assert.ok(beat, `${segment.id}/${raw.id} resolves for ${memories.presentationFish}`);
      for (const text of [beat.learnyEn, beat.learnyJa, beat.answer, ...(beat.choices || [])]) {
        if (!text) continue;
        const out = resolvePart3Text(text, memories, extras);
        assert.ok(!leftover.test(out), `${segment.id}/${raw.id}: unresolved token in "${out}"`);
      }
      if (beat.kind === "mcq") {
        const answer = resolvePart3Text(beat.answer, memories, extras);
        const choices = beat.choices.map((c) => resolvePart3Text(c, memories, extras));
        assert.equal(choices.length, 4, `${segment.id}/${raw.id} has 4 choices`);
        assert.equal(new Set(choices).size, 4, `${segment.id}/${raw.id} choices are distinct`);
        assert.ok(choices.includes(answer), `${segment.id}/${raw.id} answer is a choice`);
      }
    }
    for (const set of segment.part3Sets || []) {
      assert.ok(set.lines?.length, `${segment.id}/${set.id} has lines`);
      for (const line of set.lines) {
        const out = resolvePart3Text(line.text, memories, extras);
        assert.ok(!leftover.test(out), `${segment.id}/${set.id}: unresolved token in "${out}"`);
        if (line.blank) {
          const blank = resolvePart3Text(line.blank, memories, extras);
          assert.ok(out.toLowerCase().includes(blank.toLowerCase()), `${set.id} blank "${blank}" in "${out}"`);
        }
      }
    }
  }
}

assert.equal(
  resolvePart3Text("I chose {presentationFishWithArticle}.", {
    fishType: "tropical fish",
    fishColor: "orange",
    presentationFish: "orange tropical fish",
  }),
  "I chose an orange tropical fish."
);

assert.equal(part3EnglishName("ゆうき"), "Yuki");
assert.equal(part3EnglishName("しょうた"), "Shota");
assert.equal(part3EnglishName("yuki.tanaka@example.com"), "Yuki Tanaka");
assert.equal(part3EnglishName("田中"), "田中");
assert.equal(part3EnglishName(""), "");

assert.equal(PART3_RETRY_AUDIO_TEXT, PART3_RETRY_SPEAK);
assert.ok(ENDING_AUDIO_SCRIPTS.some((s) => s.key === PART3_RETRY_AUDIO_KEY));
assert.doesNotMatch(voice, /part3Speak\(PART3_RETRY_SPEAK, \{ childLabel: (label|said) \}\)/);

assert.match(voice, /function usesPart3Architecture\(/);
assert.match(voice, /lesson-engine\.js\?v=20260924-part3/);
assert.doesNotMatch(voice, /lesson-engine\.js\?v=(?!20260924-part3)/);
assert.match(page1, /id="iframe-part3"/);
assert.match(page1, /voice-tab\.html\?level=beginner&lesson=part3/);
assert.match(voiceTab, /\.part3-presentation-card/);

console.log(`check-part3-presentation: ok (${memorySets.length} memory combos)`);
