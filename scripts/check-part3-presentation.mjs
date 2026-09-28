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
  part3BeatSpeak,
  part3PickReaction,
  part3StaticAudioScripts,
  PART3_RETRY_REACTIONS,
  PART3_MISSED_LINE_MAX,
  part3MissedLinesFeedback,
  PART3_PRAISES,
  PART3_REACTIONS,
  PART3_ENDING_TURNS,
} from "../js/lessons/aquarium-presentation.js";
import { ENDING_AUDIO_SCRIPTS } from "../js/ending-audio-config.js";
import { part3RomajiToKana, part3NameTranscriptMatches } from "../js/part3-name-audio.js";

import {
  badgeFamiliesForLesson,
  computePresentationStats,
  evaluateLessonBadges,
  listScorableBeats,
  parseBadgeId,
} from "../js/badge-engine.js";

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

// Part 3 badges: own p3_ prefix, chapter / presentation / accuracy.
assert.equal(AQUARIUM_PART3.badgePrefix, "p3");
assert.deepEqual(badgeFamiliesForLesson(AQUARIUM_PART3), ["chapter", "presentation", "accuracy"]);
assert.equal(AQUARIUM_PART3.badges.length, 9);
for (const b of AQUARIUM_PART3.badges) {
  assert.deepEqual(parseBadgeId(b.id), { prefix: "p3", family: b.family, tier: b.tier });
}
const scorable = listScorableBeats(AQUARIUM_PART3);
assert.equal(scorable.length, 10, "Part 3 accuracy counts Ch1–5 + quiz MCQs only");
assert.ok(scorable.every((b) => b.segmentId !== "p3ch0"), "Chapter 0 picks are not scored");

const allSpoken = {};
for (const seg of AQUARIUM_PART3.segments) {
  for (const set of seg.part3Sets || []) allSpoken[`${seg.id}.${set.id}`] = true;
}
const firstTryAll = Object.fromEntries(scorable.map((b) => [b.key, true]));
assert.deepEqual(evaluateLessonBadges({ completedSegmentIds: [] }, AQUARIUM_PART3), []);
assert.deepEqual(
  evaluateLessonBadges({ completedSegmentIds: ["p3ch0"] }, AQUARIUM_PART3),
  ["p3_chapter_bronze"]
);
assert.deepEqual(
  evaluateLessonBadges(
    {
      completedSegmentIds: ["p3ch0", "p3quiz", "p3ending"],
      complete: true,
      presentationSpokenBest: allSpoken,
      mcqBadgeFirstTryBest: firstTryAll,
    },
    AQUARIUM_PART3
  ).sort(),
  AQUARIUM_PART3.badges.map((b) => b.id).sort()
);
const ch6Only = Object.fromEntries(Object.entries(allSpoken).filter(([k]) => k.startsWith("p3ch6.")));
assert.equal(computePresentationStats({ presentationSpokenBest: ch6Only }, AQUARIUM_PART3).tier, "bronze");
const missingOneSet = { ...allSpoken };
delete missingOneSet["p3final.round2"];
assert.equal(
  computePresentationStats({ presentationSpokenBest: missingOneSet }, AQUARIUM_PART3).tier,
  "silver"
);
assert.match(voice, /if \(said && record\) recordPresentationSpoken\(segment\.id, cur\.set\?\.id\)/);

// {name} choice audio: kana reading hint + reject clips that drop or add words.
assert.equal(part3RomajiToKana("Yuki"), "ゆき");
assert.equal(part3RomajiToKana("Kenta"), "けんた");
assert.equal(part3RomajiToKana("Alex"), "");
assert.ok(part3NameTranscriptMatches("I'm Yu", "I am you.", "Yu"));
assert.ok(part3NameTranscriptMatches("I'm Yu Tanaka", "I'm you tanaka", "Yu Tanaka"));
assert.ok(!part3NameTranscriptMatches("I like Yu", "I like", "Yu"));
assert.ok(!part3NameTranscriptMatches("My aquarium is Yu", "This is Yu, I like Yu, My aquarium is Yu", "Yu"));
assert.ok(!part3NameTranscriptMatches("I'm Yu", "Nice to meet you Yu", "Yu"));

// Presentation speech: every STT chunk is judged (joined), not just the finished piece;
// Live can't talk over a hosted clip; leaked <exact> tags never reach the bubble.
assert.match(voice, /if \(message\.data\.text\?\.trim\(\)\) part3HandleVoiceTranscript\(message\.data\.text\)/);
assert.match(voice, /part3State\.transcript = mergeTranscriptChunk\(part3State\.transcript, text\)/);
assert.match(voice, /if \(part3StaticSpeaking\(\)\) return true;/);
assert.match(voice, /replace\(\/<\\\/\?exact>\?\/gi, ""\)/);

// Presentation retry feedback: which sentence was missed (spoken + ✓/✗ on the card).
const hostedLine = (text) => ENDING_AUDIO_SCRIPTS.some((s) => s.text === text);
for (let n = 1; n <= PART3_MISSED_LINE_MAX; n += 1) assert.ok(hostedLine(part3MissedLinesFeedback([n])), `missed ${n}`);
assert.ok(hostedLine(part3MissedLinesFeedback([1, 3])), "missed many");
assert.match(voice, /part3SpeakRetry\(said, \{ feedback: part3MissedLinesFeedback\(missed\) \}\)/);
assert.match(voice, /アイム\|アイアム/);
assert.match(voice, /きこえた ことば：/);

// Input STT: English + Japanese only (auto-detect produced Korean / Spanish) + presentation vocabulary.
const geminiApi = readFileSync(new URL("js/gemini-api.js", root), "utf8");
assert.match(voice, /INPUT_TRANSCRIPTION_LANGUAGE_CODES = Object\.freeze\(\["en-US", "ja-JP"\]\)/);
assert.match(voice, /geminiClient\.inputTranscriptionVocabulary = part3PresentationVocabulary\(\)/);
assert.match(geminiApi, /transcription\.language_codes = this\.inputTranscriptionLanguageCodes/);
assert.match(geminiApi, /transcription\.custom_vocabulary = this\.inputTranscriptionVocabulary/);

// Presentation: the 2nd attempt always passes, but isn't recorded as fully spoken.
assert.match(voice, /const PART3_PRESENTATION_PASS_AFTER_TRIES = 2;/);
assert.match(voice, /part3AdvancePresentation\(segment, cur, said, \{ record: false \}\)/);
assert.match(voice, /if \(said && record\) recordPresentationSpoken/);

// Wrong answer: rotating reaction + the same question again.
assert.ok(PART3_RETRY_REACTIONS.length >= 5);
assert.equal(new Set(PART3_RETRY_REACTIONS.map((r) => r.speak)).size, PART3_RETRY_REACTIONS.length);
assert.ok(PART3_RETRY_REACTIONS.every((r) => r.title && /[A-Za-z]/.test(r.speak) && /[\u3040-\u30ff]/.test(r.speak)));
assert.match(voice, /part3Speak\(\[reaction\.speak, feedback, part3PromptScript\(\)\]\.filter\(Boolean\)/);
assert.match(voice, /next === part3State\.retryIndex/);

// Hosted Part 3 audio: every fixed line (and every Chapter 0-answer variant) has a clip.
const hostedTexts = new Set(ENDING_AUDIO_SCRIPTS.map((s) => s.text));
const part3Scripts = part3StaticAudioScripts();
assert.equal(new Set(ENDING_AUDIO_SCRIPTS.map((s) => s.key)).size, ENDING_AUDIO_SCRIPTS.length);
assert.ok(part3Scripts.every((s) => s.key.startsWith("beginner-part3-") && hostedTexts.has(s.text)));
const hosted = (text, what) => assert.ok(hostedTexts.has(text), `${what}: no hosted clip for "${text}"`);
const segById = (id) => AQUARIUM_PART3.segments.find((s) => s.id === id);
for (const beat of segById("p3ch0").part3Beats) hosted(part3BeatSpeak(beat), `p3ch0/${beat.id}`);
for (const text of [
  ...PART3_RETRY_REACTIONS.map((r) => r.speak),
  ...PART3_PRAISES,
  ...PART3_REACTIONS.map((r) => `${r.en} ${r.ja}`),
  ...PART3_ENDING_TURNS,
]) {
  hosted(text, "fixed line");
}
for (const id of ["p3ch6", "p3ch7", "p3final"]) {
  for (const set of segById(id).part3Sets) hosted(part3BeatSpeak(set), `${id}/${set.id}`);
}
let hostedCombos = 0;
for (const glassColor of PART3_GLASS_COLORS) {
  for (const decoration1 of PART3_DECORATION1_CHOICES) {
    for (const decoration2 of PART3_DECORATION2_POOL.filter((d) => d !== decoration1)) {
      for (const fish of memorySets) {
        const memories = {
          name: "Yuki",
          glassColor,
          decoration1: decoration1.toLowerCase(),
          decoration2: decoration2.toLowerCase(),
          fishType: fish.fishType.toLowerCase(),
          fishColor: fish.fishColor,
          presentationFish: fish.presentationFish.toLowerCase(),
        };
        for (const key of ["glassColor", "decoration1", "decoration2", "fishType", "fishColor"]) {
          if (key === "fishColor" && !memories.fishColor) continue;
          hosted(part3PickReaction(key, memories), `reaction ${key}`);
        }
        for (const id of ["p3ch1", "p3ch2", "p3ch3", "p3ch4", "p3ch5", "p3quiz"]) {
          for (const raw of segById(id).part3Beats) {
            const text = part3BeatSpeak(resolvePart3Beat(raw, memories), memories, extras);
            if (text.includes("Yuki")) continue;
            hosted(text, `${id}/${raw.id}`);
          }
        }
        hostedCombos += 1;
      }
    }
  }
}
// Only the Chapter 1 opening (it says the learner's name) is left to Live.
assert.ok(!part3Scripts.some((s) => s.key.startsWith("beginner-part3-ch1-imName")));
assert.match(voice, /function part3SpeakStatic\(/);
assert.match(voice, /part3KickOpening\(\{ staticOnly: true \}\)/);
assert.match(voice, /part3Speak\(\[nextBeat\.noPraise \? "" : reaction, script\]/);
assert.match(voice, /function usesPart3Architecture\(/);
assert.match(voice, /lesson-engine\.js\?v=20260928-variant-kind/);
assert.doesNotMatch(voice, /lesson-engine\.js\?v=(?!20260928-variant-kind)/);
assert.match(page1, /id="iframe-part3"/);
assert.match(page1, /voice-tab\.html\?level=beginner&lesson=part3/);
assert.match(voiceTab, /\.part3-presentation-card/);

// Fish-variant beats must stay scored MCQs, or taps never reach recordMcqAttempt.
for (const fishType of ["salmon", "cod", "puffer fish", "tropical fish"]) {
  const memories = { fishType, fishColor: "blue" };
  for (const segId of ["p3ch4", "p3quiz"]) {
    for (const raw of AQUARIUM_PART3.segments.find((s) => s.id === segId).part3Beats) {
      const beat = resolvePart3Beat(raw, memories);
      assert.equal(beat?.kind, "mcq", `${segId}.${raw.id} (${fishType}) must resolve to kind mcq`);
      assert.equal(beat?.id, raw.id);
    }
  }
}

console.log(
  `check-part3-presentation: ok (${memorySets.length} memory combos, ` +
    `${part3Scripts.length} hosted lines checked over ${hostedCombos} answer combos)`
);
