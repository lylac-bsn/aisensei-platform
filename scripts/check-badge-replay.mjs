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

const activityMessages = [];
globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  GC_LEVEL: "beginner",
  GC_LESSON: "part1",
  location: { search: "" },
  parent: {
    postMessage(message) {
      activityMessages.push(message);
    },
  },
};

const lessonEngine = await import("../js/lesson-engine.js");
const badgeEngine = await import("../js/badge-engine.js");

const {
  emptyState,
  claimPendingLessonBadges,
  completeSegment,
  getLesson,
  jumpToSegment,
  loadBadgeRevocations,
  loadEarnedLessonBadges,
  loadLessonState,
  resetLesson,
  saveEarnedLessonBadges,
  saveLessonState,
} = lessonEngine;
const {
  computeAccuracyTier,
  evaluateAndAwardBadges,
  listScorableBeats,
  maybeRecordBadgeFirstTry,
  recordEndingFreetalkEnglish,
  segmentNeedsAccuracyReplay,
} = badgeEngine;

const lesson = getLesson("part1", "beginner");
const fixedBeats = listScorableBeats(lesson);
assert.ok(fixedBeats.length > 0, "fixture must contain fixed scorable beats");

function receive(result) {
  claimPendingLessonBadges(result.newlyEarned || []);
  return result.newlyEarned || [];
}

function freshState() {
  localStorage.clear();
  activityMessages.length = 0;
  const state = emptyState("part1");
  saveLessonState(state);
  return state;
}

function startPlay(state, play) {
  for (const { segmentId } of fixedBeats) {
    state.chapterPlayCounts[segmentId] = play;
    state.mcqBadgePlay[segmentId] = play;
  }
}

function recordFirstTries(state, correctForBeat) {
  fixedBeats.forEach((beat, index) => {
    maybeRecordBadgeFirstTry(state, {
      segmentId: beat.segmentId,
      beatId: beat.beatId,
      correct: correctForBeat(beat, index),
    });
  });
}

// Dashboard retry eligibility is best-across-plays and segment-local.
{
  const target = fixedBeats[0];
  const targetBeats = fixedBeats.filter(
    (beat) => beat.segmentId === target.segmentId
  );

  const missed = freshState();
  missed.completedSegmentIds = [target.segmentId];
  missed.chapterPlayCounts[target.segmentId] = 1;
  missed.mcqBadgePlay[target.segmentId] = 1;
  maybeRecordBadgeFirstTry(missed, {
    segmentId: target.segmentId,
    beatId: target.beatId,
    correct: false,
  });
  assert.equal(
    segmentNeedsAccuracyReplay(missed, lesson, target.segmentId),
    true,
    "a completed chapter with beats never first-click correct needs replay"
  );
  assert.equal(
    segmentNeedsAccuracyReplay(missed, lesson, target.segmentId, {
      earnedAccuracyTier: "gold",
    }),
    false,
    "replay is not prompted when accuracy cannot rank above gold"
  );

  missed.chapterPlayCounts[target.segmentId] = 2;
  missed.mcqBadgePlay[target.segmentId] = 2;
  for (const beat of targetBeats) {
    maybeRecordBadgeFirstTry(missed, {
      segmentId: beat.segmentId,
      beatId: beat.beatId,
      correct: true,
    });
  }
  assert.equal(
    segmentNeedsAccuracyReplay(missed, lesson, target.segmentId),
    false,
    "a clean latest replay removes the retry label"
  );

  const clean = freshState();
  clean.completedSegmentIds = [target.segmentId];
  clean.chapterPlayCounts[target.segmentId] = 1;
  clean.mcqBadgePlay[target.segmentId] = 1;
  for (const beat of targetBeats) {
    maybeRecordBadgeFirstTry(clean, {
      segmentId: beat.segmentId,
      beatId: beat.beatId,
      correct: true,
    });
  }
  assert.equal(
    segmentNeedsAccuracyReplay(clean, lesson, target.segmentId),
    false,
    "a clean chapter is not labeled"
  );

  const irrelevant = freshState();
  irrelevant.completedSegmentIds = ["ch0"];
  irrelevant.chapterPlayCounts.ch0 = 1;
  irrelevant.mcqBadgePlay.ch0 = 1;
  irrelevant.mcqBadgeFirstTry["ch0.not_graded"] = {
    correct: false,
    play: 1,
  };
  assert.equal(
    segmentNeedsAccuracyReplay(irrelevant, lesson, "ch0"),
    false,
    "a segment without graded MCQs is not labeled"
  );

  const legacy = freshState();
  legacy.completedSegmentIds = [target.segmentId];
  legacy.mcqBadgeFirstTry[target.key] = { correct: false };
  assert.equal(
    segmentNeedsAccuracyReplay(legacy, lesson, target.segmentId),
    true,
    "incomplete いっぱつせいかい progress still prompts retry"
  );
}

// A bronze first run can become gold on replay without losing bronze.
{
  const state = freshState();
  startPlay(state, 1);
  const bronzeCorrect = Math.floor(fixedBeats.length / 2) + 1;
  recordFirstTries(state, (_beat, index) => index < bronzeCorrect);
  saveLessonState(state);
  assert.equal(computeAccuracyTier(state, lesson).tier, "bronze");
  assert.deepEqual(receive(evaluateAndAwardBadges()), ["p1_accuracy_bronze"]);

  startPlay(state, 2);
  assert.equal(
    computeAccuracyTier(state, lesson).correct,
    bronzeCorrect,
    "a clean earlier play still counts toward いっぱつせいかい on a new play"
  );
  recordFirstTries(state, () => true);
  saveLessonState(state);
  assert.equal(computeAccuracyTier(state, lesson).tier, "gold");
  assert.deepEqual(receive(evaluateAndAwardBadges()), [
    "p1_accuracy_silver",
    "p1_accuracy_gold",
  ]);
  assert.deepEqual(loadEarnedLessonBadges(), [
    "p1_accuracy_bronze",
    "p1_accuracy_silver",
    "p1_accuracy_gold",
  ]);
}

// A wrong first click stays wrong for that play, but a replay gets a new first try.
{
  const state = freshState();
  startPlay(state, 1);
  recordFirstTries(state, () => false);
  recordFirstTries(state, () => true);
  assert.equal(computeAccuracyTier(state, lesson).correct, 0);

  startPlay(state, 2);
  recordFirstTries(state, () => true);
  assert.equal(computeAccuracyTier(state, lesson).tier, "gold");
}

// Natural advance into a never-played chapter starts play 1 only once.
// Replaying an already-completed chapter must NOT bump the next chapter —
// that wiped clean first-try scores during selective いっぱつせいかい retries.
{
  const state = freshState();
  state.completedSegmentIds = ["ch0"];
  state.segmentIndex = 0;
  state.chapterPlayCounts = { ch0: 1 };
  state.mcqBadgePlay = { ch0: 1 };
  saveLessonState(state);
  const firstEnter = completeSegment("ch0");
  assert.equal(firstEnter.alreadyDone, true);
  assert.equal(firstEnter.state.chapterPlayCounts.ch1, 1);
  assert.equal(firstEnter.state.mcqBadgePlay.ch1, 1);

  const again = completeSegment("ch0");
  assert.equal(again.alreadyDone, true);
  assert.equal(
    again.state.chapterPlayCounts.ch1,
    1,
    "re-completing a finished chapter must preserve the next chapter play id"
  );
  assert.equal(again.state.mcqBadgePlay.ch1, 1);
}

// Selective accuracy retry: clean ch2 must raise the tier without invalidating ch3.
{
  const state = freshState();
  startPlay(state, 1);
  const ch2Beats = fixedBeats.filter((beat) => beat.segmentId === "ch2");
  assert.ok(ch2Beats.length > 0);

  // First play: miss every ch2 beat, nail everything else → below gold.
  recordFirstTries(state, (beat) => beat.segmentId !== "ch2");
  state.completedSegmentIds = ["ch2", "ch3"];
  saveLessonState(state);
  assert.ok(computeAccuracyTier(state, lesson).tier !== "gold");
  assert.equal(segmentNeedsAccuracyReplay(state, lesson, "ch2"), true);

  // Explicit chapter retry bumps only ch2.
  jumpToSegment("ch2", "part1", "beginner");
  const afterJump = loadLessonState();
  assert.equal(afterJump.mcqBadgePlay.ch2, 2);
  assert.equal(
    afterJump.mcqBadgePlay.ch3,
    1,
    "jumping to ch2 must not refresh ch3"
  );

  for (const beat of ch2Beats) {
    maybeRecordBadgeFirstTry(afterJump, {
      segmentId: beat.segmentId,
      beatId: beat.beatId,
      correct: true,
    });
  }
  saveLessonState(afterJump);
  const done = completeSegment("ch2");
  assert.equal(done.alreadyDone, true);
  assert.equal(
    done.state.mcqBadgePlay.ch3,
    1,
    "finishing a ch2 replay must leave ch3 first-try scores intact"
  );
  assert.equal(computeAccuracyTier(done.state, lesson).tier, "gold");
  assert.equal(segmentNeedsAccuracyReplay(done.state, lesson, "ch2"), false);
  assert.deepEqual(receive(evaluateAndAwardBadges()), [
    "p1_accuracy_bronze",
    "p1_accuracy_silver",
    "p1_accuracy_gold",
  ]);
}

// Stale iframe saves must not shrink a chapter play bump (parent jump race).
{
  const state = freshState();
  state.chapterPlayCounts = { ch1: 2 };
  state.mcqBadgePlay = { ch1: 2 };
  state.mcqBadgeFirstTryBest = { "ch1.need_glass": true };
  saveLessonState(state);

  const stale = loadLessonState();
  stale.chapterPlayCounts = { ch1: 1 };
  stale.mcqBadgePlay = { ch1: 1 };
  stale.mcqBadgeFirstTryBest = {};
  saveLessonState(stale);

  const merged = loadLessonState();
  assert.equal(merged.chapterPlayCounts.ch1, 2);
  assert.equal(merged.mcqBadgePlay.ch1, 2);
  assert.equal(merged.mcqBadgeFirstTryBest["ch1.need_glass"], true);
}

// mcqLog first-click on a later play still raises the badge when the map is stale.
{
  const state = freshState();
  startPlay(state, 1);
  recordFirstTries(state, () => false);
  saveLessonState(state);
  assert.equal(computeAccuracyTier(state, lesson).correct, 0);

  state.mcqLog = fixedBeats.map((beat) => ({
    segmentId: beat.segmentId,
    beatId: beat.beatId,
    correct: true,
    playId: 2,
    at: "2026-09-10T00:00:00.000Z",
  }));
  // Simulate a wiped / stale first-try map after a successful second play.
  state.mcqBadgeFirstTry = {};
  state.mcqBadgeFirstTryBest = {};
  startPlay(state, 2);
  saveLessonState(state);
  assert.equal(
    computeAccuracyTier(loadLessonState(), lesson).tier,
    "gold",
    "best-across-plays must recover gold from mcqLog play-2 first clicks"
  );
}

// Ending free-talk accumulates across ordinary replays and awards each tier once.
{
  freshState();
  assert.deepEqual(receive(recordEndingFreetalkEnglish("I like fish.")), [
    "p1_freetalk_bronze",
  ]);
  assert.deepEqual(receive(recordEndingFreetalkEnglish("My tank is blue.")), [
    "p1_freetalk_silver",
  ]);
  assert.deepEqual(receive(recordEndingFreetalkEnglish("I found some sand.")), [
    "p1_freetalk_gold",
  ]);
  assert.equal(loadLessonState().endingFreetalkEnglishCount, 3);
  assert.deepEqual(evaluateAndAwardBadges().newlyEarned, []);
  const badgeEvents = activityMessages.filter(
    (message) => message.type === "gc_activity_event"
  );
  assert.equal(
    badgeEvents.length,
    0,
    "pending awards must not emit earned activity before the UI receipt"
  );
}

// Chapter progress ranks up while ordinary replay preserves earned history.
{
  const state = freshState();
  state.completedSegmentIds = ["ch0"];
  saveLessonState(state);
  assert.deepEqual(receive(evaluateAndAwardBadges()), ["p1_chapter_bronze"]);
  jumpToSegment("ch0", "part1", "beginner");
  assert.ok(loadEarnedLessonBadges().includes("p1_chapter_bronze"));

  const replayed = loadLessonState();
  replayed.completedSegmentIds = ["ch0", "quiz1", "ending1"];
  replayed.complete = true;
  saveLessonState(replayed);
  assert.deepEqual(receive(evaluateAndAwardBadges()), [
    "p1_chapter_silver",
    "p1_chapter_gold",
  ]);
}

// 「最初から」 remains the destructive Part 1 wipe, including badge history.
{
  const state = freshState();
  state.completedSegmentIds = ["ch0", "quiz1", "ending1"];
  state.complete = true;
  state.chapterPlayCounts = { ch0: 2, ch1: 3 };
  state.mcqLog = [{ segmentId: "ch1", beatId: "need_glass" }];
  state.mcqSummary = { "ch1.need_glass": { attempts: 2 } };
  state.endingFreetalkEnglishCount = 3;
  saveLessonState(state);
  saveEarnedLessonBadges(["p1_chapter_gold", "unrelated_badge"]);

  resetLesson("part1", "beginner");
  const reset = loadLessonState();
  assert.deepEqual(reset.completedSegmentIds, []);
  assert.deepEqual(reset.chapterPlayCounts, {});
  assert.deepEqual(reset.mcqLog, []);
  assert.deepEqual(reset.mcqSummary, {});
  assert.equal(reset.endingFreetalkEnglishCount, 0);
  assert.deepEqual(loadEarnedLessonBadges(), ["unrelated_badge"]);
  assert.ok(loadBadgeRevocations().includes("p1_chapter_gold"));
}

console.log("Badge replay regression checks passed.");
