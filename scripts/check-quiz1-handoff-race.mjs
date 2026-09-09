#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

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
const lesson = engine.getLesson("part1", "beginner");
const quizIndex = lesson.segments.findIndex((segment) => segment.id === "quiz1");
assert.equal(lesson.segments[quizIndex + 1]?.id, "ch4", "Quiz 1 must lead to Chapter 4");
assert.equal(lesson.segments[quizIndex + 2]?.id, "ch5", "Chapter 5 must follow Chapter 4");

const state = engine.emptyState("part1");
state.segmentIndex = quizIndex;
state.completedSegmentIds = lesson.segments.slice(0, quizIndex).map((segment) => segment.id);
engine.saveLessonState(state);
const completed = engine.completeSegment("quiz1", { userQuote: "I made glass." });
assert.equal(completed.ok, true);
assert.equal(completed.state.segmentIndex, quizIndex + 1);
assert.equal(engine.getCurrentSegment(completed.state).id, "ch4");
assert.match(
  engine.buildHandoffOpeningNudge(completed.state, { reason: "after-quiz1" }),
  /What's your favorite color\?/,
  "Chapter 4 handoff must ask the intended opening"
);
const prematureCh5 = engine.completeSegment("ch4", { userQuote: "blue" });
assert.equal(prematureCh5.ok, false, "color alone must not complete Chapter 4");
assert.equal(engine.getCurrentSegment(engine.loadLessonState()).id, "ch4");

function functionBody(source, name, nextMarker = "\nfunction ") {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf(nextMarker, start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

const click = functionBody(voice, "handleQuiz1ChoiceClick");
assert.match(click, /sendUserText\(label\)/, "correct clicks must use the shared completion route");
const voiceRoute = voice.slice(
  voice.indexOf("// Voice path has no typed outbound coach"),
  voice.indexOf("if (!fromVoice) maybeCompleteCh1FromClient")
);
assert.match(
  voiceRoute,
  /maybeCompleteQuiz1FromClient\(t\)/,
  "voice answers must use Quiz 1 completion"
);
assert.match(voiceRoute, /quiz1Advance === HANDOFF_MARKER/);
const afterAdvance = functionBody(voice, "afterSegmentAdvanced");
assert.match(
  afterAdvance,
  /return scheduleChapterHandoff\(/,
  "handoff scheduling failure must propagate"
);

const coordinatorStart = voice.indexOf("function clearChapterHandoffState");
const coordinatorEnd = voice.indexOf("/**\n * @deprecated Soft same-socket handoff", coordinatorStart);
assert.ok(coordinatorStart >= 0 && coordinatorEnd > coordinatorStart);
const coordinator = voice.slice(coordinatorStart, coordinatorEnd);

async function exercise({ reconnecting }) {
  const calls = [];
  const context = {
    pendingHandoffTimer: null,
    handoffKickWatchId: null,
    pendingChapterHandoff: null,
    pendingHandoffQuote: "",
    skipOutboundForHandoff: false,
    chapterTransitionActive: false,
    isAutoReconnecting: reconnecting,
    isHandoffRunning: false,
    actionState: "active",
    awaitingAssistantReply: true,
    HANDOFF_DELAY_MS: 0,
    currentSegment: { id: "ch4" },
    clearTimeout() {},
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearPendingHandoffTimer() {
      context.pendingHandoffTimer = null;
      context.handoffKickWatchId = null;
    },
    audioPlayer: { interrupt() {} },
    closeOpenAudioTurn() {},
    clearPendingReplyWatch() {},
    clearLeadWatch() {},
    pruneTrailingIncompleteAssistants() {},
    bumpIdleGeneration() {},
    whenAssistantIdle(fn) {
      fn();
    },
    estimateSpeechMs() {
      return 0;
    },
    lastAssistantText() {
      return "";
    },
    getCurrentSegment() {
      return context.currentSegment;
    },
    beginChapterTransition() {
      context.chapterTransitionActive = true;
    },
    endChapterTransition() {
      context.chapterTransitionActive = false;
    },
    dbg() {},
    async handoffToCurrentSegment(request) {
      calls.push(request);
      context.skipOutboundForHandoff = false;
      context.chapterTransitionActive = false;
      return true;
    },
  };
  vm.runInNewContext(
    `${coordinator}
this.api = {
  scheduleChapterHandoff,
  flushPendingChapterHandoff,
  getState: () => ({
    pending: pendingChapterHandoff,
    skip: skipOutboundForHandoff,
    transition: chapterTransitionActive
  }),
  settleReconnect: () => { isAutoReconnecting = false; }
};`,
    context
  );

  assert.equal(
    context.api.scheduleChapterHandoff({
      reason: "after-quiz1",
      lastQuote: "I made glass.",
    }),
    true
  );
  if (reconnecting) {
    assert.equal(context.api.getState().pending.destinationId, "ch4");
    assert.equal(context.api.getState().skip, true);
    assert.equal(context.api.getState().transition, true);
    context.api.scheduleChapterHandoff({
      reason: "after-quiz1",
      lastQuote: "I made glass.",
    });
    assert.equal(calls.length, 0, "reconnect contention must defer, not start");
    context.api.settleReconnect();
    await context.api.flushPendingChapterHandoff();
  } else {
    await Promise.resolve();
  }

  assert.equal(calls.length, 1, "exactly one fresh handoff/opening may run");
  assert.equal(calls[0].destinationId, "ch4");
  assert.equal(context.api.getState().pending, null);
  assert.equal(context.api.getState().skip, false);
  assert.equal(context.api.getState().transition, false);
}

await exercise({ reconnecting: false }); // final correct button click
await exercise({ reconnecting: true }); // final correct voice answer during recovery

console.log("Quiz1 handoff race regression checks passed.");
