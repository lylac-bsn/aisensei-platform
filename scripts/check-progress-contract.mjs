#!/usr/bin/env node

import assert from "node:assert/strict";

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
  dispatchEvent() {},
};
globalThis.CustomEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

const lessonEngine = await import("../js/lesson-engine.js");
const badgeEngine = await import("../js/badge-engine.js");
const contract = await import("../js/progress-contract.js");

const {
  buildProgressSnapshot,
  claimPendingLessonBadges,
  emptyState,
  getLesson,
  loadEarnedLessonBadges,
  loadLessonState,
  loadPendingLessonBadges,
  resetLesson,
  saveEarnedLessonBadges,
  saveLessonState,
  savePendingLessonBadges,
} = lessonEngine;
const {
  computeAccuracyTier,
  highestTierByFamily,
  listScorableBeats,
  maybeRecordBadgeFirstTry,
  segmentNeedsAccuracyReplay,
} = badgeEngine;
const {
  currentFreetalkStats,
  resolveClaimedBadgeIds,
  resolvePendingBadgeIds,
  summarizeLifetimeMcq,
} = contract;

const lesson = getLesson("part1", "beginner");
const fixedBeats = listScorableBeats(lesson);
const finalSegment = lesson.segments.find(
  (segment) => segment.type === "final_challenge"
);
const finalBeats = (finalSegment?.items || []).slice(0, 6).map((item) => ({
  segmentId: finalSegment.id,
  beatId: item.id,
  key: `${finalSegment.id}.${item.id}`,
  source: "final",
}));
const beats = [...fixedBeats, ...finalBeats];
assert.equal(
  beats.length,
  27,
  "fixture should model the screenshot's 21 fixed + 6 final questions"
);

function stateWithFirstTries(correctCount, play = 1) {
  const state = emptyState("part1");
  beats.forEach((beat, index) => {
    state.chapterPlayCounts[beat.segmentId] = play;
    state.mcqBadgePlay[beat.segmentId] = play;
    maybeRecordBadgeFirstTry(state, {
      segmentId: beat.segmentId,
      beatId: beat.beatId,
      correct: index < correctCount,
    });
  });
  return state;
}

// Explicit scoped claims beat stale global history; pending gold is not earned.
{
  const user = {
    lessonBadges: ["p1_accuracy_gold"],
    beginnerProgress: {
      claimedLessonBadgeIds: ["p1_accuracy_silver"],
      pendingLessonBadgeIds: ["p1_accuracy_gold"],
    },
  };
  assert.deepEqual(resolveClaimedBadgeIds(user, "beginnerProgress"), [
    "p1_accuracy_silver",
  ]);
  assert.deepEqual(resolvePendingBadgeIds(user, "beginnerProgress"), [
    "p1_accuracy_gold",
  ]);
  assert.equal(
    highestTierByFamily(
      resolveClaimedBadgeIds(user, "beginnerProgress"),
      "p1"
    ).accuracy,
    "silver"
  );
}

// Legacy scoped records are preferred over a stale top-level gold.
{
  const legacy = {
    lessonBadges: ["p1_accuracy_gold"],
    beginnerProgress: { lessonBadges: ["p1_accuracy_silver"] },
  };
  assert.deepEqual(resolveClaimedBadgeIds(legacy, "beginnerProgress"), [
    "p1_accuracy_silver",
  ]);
}

// A revoked stale gold must not outrank the child's re-earned silver.
{
  const replayed = {
    lessonBadges: [
      "p1_accuracy_bronze",
      "p1_accuracy_silver",
      "p1_accuracy_gold",
    ],
    badgeRevocations: ["p1_accuracy_gold"],
    beginnerProgress: {
      lessonBadges: [
        "p1_accuracy_bronze",
        "p1_accuracy_silver",
        "p1_accuracy_gold",
      ],
    },
  };
  assert.equal(
    highestTierByFamily(
      resolveClaimedBadgeIds(replayed, "beginnerProgress"),
      "p1"
    ).accuracy,
    "silver"
  );
}

// 18/27 is 66.7% and maps to bronze for this run, independently of past silver.
{
  const state = stateWithFirstTries(18);
  const accuracy = computeAccuracyTier(state, lesson);
  assert.equal(accuracy.correct, 18);
  assert.equal(accuracy.total, 27);
  assert.equal(Math.round(accuracy.rate * 1000) / 10, 66.7);
  assert.equal(accuracy.tier, "bronze");
  saveEarnedLessonBadges(["p1_accuracy_silver"]);
  assert.equal(
    highestTierByFamily(loadEarnedLessonBadges(), "p1").accuracy,
    "silver",
    "earned silver must not downgrade after a worse replay"
  );
}

// A historical gold remains gold after a worse replay.
{
  saveEarnedLessonBadges(["p1_accuracy_gold"]);
  assert.equal(computeAccuracyTier(stateWithFirstTries(18), lesson).tier, "bronze");
  assert.equal(
    highestTierByFamily(loadEarnedLessonBadges(), "p1").accuracy,
    "gold"
  );
}

// Lifetime clicks use canonical events and keep correct/incorrect parity.
{
  const mcqLog = Array.from({ length: 27 }, (_, index) => ({
    segmentId: "ch1",
    beatId: `b${index}`,
    correct: index < 18,
    playId: 2,
    firstTry: true,
  }));
  const totals = summarizeLifetimeMcq({
    mcqLog,
    mcqSummary: { stale: { correct: 999, incorrect: 999, attempts: 1998 } },
  });
  assert.deepEqual(totals, {
    correct: 18,
    incorrect: 9,
    attempts: 27,
    source: "events",
  });
  assert.equal(totals.attempts, totals.correct + totals.incorrect);
}

// A clean ordinary replay removes retry eligibility while preserving claims.
{
  const targetSegment = beats[18].segmentId;
  const first = stateWithFirstTries(18, 1);
  first.completedSegmentIds = [targetSegment];
  assert.equal(segmentNeedsAccuracyReplay(first, lesson, targetSegment), true);
  for (const beat of beats.filter((item) => item.segmentId === targetSegment)) {
    first.chapterPlayCounts[targetSegment] = 2;
    first.mcqBadgePlay[targetSegment] = 2;
    maybeRecordBadgeFirstTry(first, {
      segmentId: beat.segmentId,
      beatId: beat.beatId,
      correct: true,
    });
  }
  assert.equal(segmentNeedsAccuracyReplay(first, lesson, targetSegment), false);
}

// Claimed and pending are separate through snapshot serialization and receipt.
{
  localStorage.clear();
  saveLessonState(stateWithFirstTries(18));
  saveEarnedLessonBadges([
    "p1_chapter_gold",
    "p1_freetalk_gold",
    "p1_accuracy_silver",
  ]);
  savePendingLessonBadges(["p1_accuracy_gold"]);
  const roundTrip = JSON.parse(JSON.stringify(buildProgressSnapshot("beginner")));
  const user = { beginnerProgress: roundTrip };
  assert.equal(roundTrip.progressContractVersion, 2);
  assert.deepEqual(resolveClaimedBadgeIds(user, "beginnerProgress"), [
    "p1_chapter_gold",
    "p1_freetalk_gold",
    "p1_accuracy_silver",
  ]);
  assert.deepEqual(resolvePendingBadgeIds(user, "beginnerProgress"), [
    "p1_accuracy_gold",
  ]);
  const tiers = highestTierByFamily(
    resolveClaimedBadgeIds(user, "beginnerProgress"),
    "p1"
  );
  assert.deepEqual(tiers, {
    chapter: "gold",
    freetalk: "gold",
    accuracy: "silver",
  });
  assert.deepEqual(
    claimPendingLessonBadges(["p1_accuracy_gold"]).newlyClaimed,
    ["p1_accuracy_gold"]
  );
  assert.deepEqual(loadPendingLessonBadges(), []);
}

// Generalized level scopes remain isolated by badge prefix.
{
  const user = {
    intermediateProgress: {
      claimedLessonBadgeIds: [
        "intermediate_p1_chapter_gold",
        "intermediate_p1_freetalk_silver",
        "p1_accuracy_gold",
      ],
    },
  };
  assert.deepEqual(
    highestTierByFamily(
      resolveClaimedBadgeIds(user, "intermediateProgress"),
      "intermediate_p1"
    ),
    { chapter: "gold", freetalk: "silver", accuracy: null }
  );
}

// Legacy malformed state normalizes safely, and destructive reset clears scope.
{
  localStorage.clear();
  localStorage.setItem(
    "gc_hw_beginner_part1_state",
    JSON.stringify({
      lessonId: "part1",
      completedSegmentIds: null,
      badges: null,
      mcqLog: null,
      chapterPlayCounts: null,
      endingFreetalkEnglishCount: "3",
    })
  );
  const legacy = loadLessonState();
  assert.deepEqual(legacy.completedSegmentIds, []);
  assert.deepEqual(legacy.mcqLog, []);
  assert.equal(legacy.endingFreetalkEnglishCount, 3);
  assert.deepEqual(currentFreetalkStats(legacy), {
    total: 3,
    playId: 0,
    currentRun: 3,
    finalTotal: 0,
    finalRun: 0,
  });
  saveEarnedLessonBadges(["p1_chapter_gold", "unrelated_badge"]);
  savePendingLessonBadges(["p1_accuracy_gold", "unrelated_pending"]);
  resetLesson("part1", "beginner");
  assert.deepEqual(loadEarnedLessonBadges(), ["unrelated_badge"]);
  assert.deepEqual(loadPendingLessonBadges(), ["unrelated_pending"]);
}

console.log("Progress contract regression checks passed.");
