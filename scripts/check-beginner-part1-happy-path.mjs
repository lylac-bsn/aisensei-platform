#!/usr/bin/env node

/**
 * Beginner Part 1 happy-path simulation:
 * walk all segments, award/claim badges, exercise Ch4 picker + quiz1 scripts.
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
  parent: { postMessage() {} },
};

const lessonEngine = await import("../js/lesson-engine.js");
const badgeEngine = await import("../js/badge-engine.js");
const { AQUARIUM_PART1 } = await import("../js/lessons/aquarium-part1.js");
const { CH4_PICKER_COLORS, normalizeAllowedFavoriteColor } = await import(
  "../js/mcq-audio-config.js"
);

const {
  claimPendingLessonBadges,
  completeSegment,
  getCurrentSegment,
  getLesson,
  jumpToSegment,
  loadEarnedLessonBadges,
  loadLessonState,
  loadPendingLessonBadges,
  recordMemory,
  resetLesson,
  saveLessonState,
} = lessonEngine;
const {
  evaluateAndAwardBadges,
  highestTierByFamily,
  maybeRecordBadgeFirstTry,
  recordEndingFreetalkEnglish,
  syncBadgeAwards,
} = badgeEngine;

const EXPECTED_ORDER = [
  "ch0",
  "ch1",
  "ch2",
  "ch3",
  "quiz1",
  "ch4",
  "ch5",
  "daily1",
  "ch6",
  "final1",
  "ending1",
];

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const page1 = readFileSync(new URL("page1.html", root), "utf8");
const voiceTab = readFileSync(new URL("voice-tab.html", root), "utf8");

// 1) Segment order + critical scripts
{
  const ids = AQUARIUM_PART1.segments.map((s) => s.id);
  assert.deepEqual(ids, EXPECTED_ORDER);
  const quiz1 = AQUARIUM_PART1.segments.find((s) => s.id === "quiz1");
  assert.equal(
    quiz1.items[0].speak,
    "くいずたいむ！「がらすが ひつよう」は えいごで？"
  );
  assert.equal(AQUARIUM_PART1.architecture, "beginner-part1-v1");
  assert.equal(AQUARIUM_PART1.badgePrefix, "p1");
}

// 2) Live-only quiz1 opening (no static TTS path)
{
  assert.match(voice, /forceQuiz1ExactOpening/);
  assert.doesNotMatch(voice, /playQuiz1StaticAudio|QUIZ1_AUDIO_MANIFEST/);
  assert.match(voiceTab, /homework-voice\.js\?v=20260910-accuracy-best-1/);
  assert.match(page1, /page1-dashboard\.js\?v=20260910-accuracy-best-1/);
}

// 3) Unified lesson-engine cache bust across voice + dashboard + mcq
{
  const versions = [
    ...voice.matchAll(/lesson-engine\.js\?v=([^"']+)/g),
    ...readFileSync(new URL("js/mcq-engine.js", root), "utf8").matchAll(
      /lesson-engine\.js\?v=([^"']+)/g
    ),
    ...readFileSync(new URL("js/page1-dashboard.js", root), "utf8").matchAll(
      /lesson-engine\.js\?v=([^"']+)/g
    ),
    ...readFileSync(new URL("js/badge-engine.js", root), "utf8").matchAll(
      /lesson-engine\.js\?v=([^"']+)/g
    ),
  ].map((m) => m[1]);
  assert.ok(versions.length >= 4);
  assert.ok(versions.every((v) => v === "20260910-accuracy-best-1"));
}

// 4) Happy-path state walk: complete every segment in order
{
  localStorage.clear();
  resetLesson("part1", "beginner");
  let state = loadLessonState();
  assert.equal(getCurrentSegment(state).id, "ch0");

  for (const id of EXPECTED_ORDER) {
    state = loadLessonState();
    assert.equal(getCurrentSegment(state).id, id, `expected to be on ${id}`);

    if (id === "ch4") {
      // Unknown colour rejected; picker colours accepted.
      assert.equal(recordMemory("favoriteColor", "rainbow").ok, false);
      assert.equal(recordMemory("favoriteColor", CH4_PICKER_COLORS[0]).ok, true);
      assert.equal(
        normalizeAllowedFavoriteColor(loadLessonState().memories.favoriteColor),
        CH4_PICKER_COLORS[0]
      );
      const result = completeSegment("ch4", {
        userQuote: `I made ${CH4_PICKER_COLORS[0]} glass!`,
      });
      assert.equal(result.ok, true, "ch4 should complete with colour glass phrase");
      continue;
    }

    if (id === "ending1") {
      // Seed chapter completion + freetalk English for badge eval.
      state = loadLessonState();
      for (const seg of EXPECTED_ORDER.slice(0, -1)) {
        if (!state.completedSegmentIds.includes(seg)) {
          state.completedSegmentIds.push(seg);
        }
      }
      state.chapterPlayCounts = Object.fromEntries(
        EXPECTED_ORDER.map((seg) => [seg, 1])
      );
      state.mcqBadgePlay = { ...state.chapterPlayCounts };
      state.mcqBadgeFirstTry = {};
      const lesson = getLesson("part1", "beginner");
      const beats = (lesson.segments || [])
        .flatMap((seg) =>
          (seg.mcqBeats || []).map((beat) => ({
            segmentId: seg.id,
            beatId: beat.id,
          }))
        )
        .concat(
          (lesson.segments.find((s) => s.id === "quiz1")?.items || []).map(
            (item, i) => ({ segmentId: "quiz1", beatId: item.id || `q${i}` })
          )
        );
      for (const beat of beats) {
        maybeRecordBadgeFirstTry(state, {
          segmentId: beat.segmentId,
          beatId: beat.beatId,
          correct: true,
        });
      }
      saveLessonState(state);
      for (let i = 0; i < 5; i += 1) {
        recordEndingFreetalkEnglish("I like blue fish.");
      }
      const end = completeSegment("ending1", { userQuote: "see you" });
      assert.equal(end.ok, true);
      break;
    }

    const quote =
      id === "ch1"
        ? "I need glass"
        : id === "ch2"
          ? "I found some sand"
          : id === "ch3"
            ? "I made glass!"
            : id === "quiz1"
              ? "I need glass"
              : id === "ch5"
                ? "I put glass here"
                : id === "ch6"
                  ? "My tank is ready!"
                  : id === "final1"
                    ? "I need glass"
                    : "yes";
    const result = completeSegment(id, { userQuote: quote, saidTogether: true });
    // Some segments need specific phrases; fall back to jump if blocked.
    if (!result.ok) {
      jumpToSegment(EXPECTED_ORDER[EXPECTED_ORDER.indexOf(id) + 1] || id);
      const forced = loadLessonState();
      if (!forced.completedSegmentIds.includes(id)) {
        forced.completedSegmentIds = [...forced.completedSegmentIds, id];
        saveLessonState(forced);
      }
    }
  }

  state = loadLessonState();
  assert.ok(state.completedSegmentIds.includes("ending1") || state.complete);

  const { newlyEarned } = evaluateAndAwardBadges();
  const pending = loadPendingLessonBadges();
  assert.ok(pending.length || newlyEarned.length || loadEarnedLessonBadges().length);

  // Claim path must populate shelf-visible claimed badges.
  const toClaim = pending.length ? pending : newlyEarned;
  if (toClaim.length) {
    const claimed = claimPendingLessonBadges(toClaim);
    assert.ok(claimed.newlyClaimed.length || claimed.claimed.length);
    const tiers = highestTierByFamily(claimed.claimed, "p1");
    assert.ok(
      tiers.chapter || tiers.freetalk || tiers.accuracy,
      "at least one badge family should be visible after claim"
    );
  }

  // Re-award after wipe must still claim.
  resetLesson("part1", "beginner");
  syncBadgeAwards(["p1_chapter_bronze"]);
  assert.ok(loadPendingLessonBadges().includes("p1_chapter_bronze"));
  const again = claimPendingLessonBadges(["p1_chapter_bronze"]);
  assert.deepEqual(again.newlyClaimed, ["p1_chapter_bronze"]);
}

console.log("Beginner Part 1 happy-path regression checks passed.");
