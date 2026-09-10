#!/usr/bin/env node
/**
 * Replaying Chapter 6 after it is already できた must still hand off to Final
 * challenge on a fresh Live session — otherwise Learny double-speaks praise +
 * Final challenge open on the stale socket.
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

assert.match(voice, /function withFinal1ExactSpeakRule/);
assert.match(voice, /\[FINAL1\] FINAL CHALLENGE EXACT OPENING/);
assert.match(voice, /forceFinal1OpenWithFirstQuestion/);
assert.match(
  voice,
  /getCurrentSegment\(state\)\?\.id === "final1" && final1Quiz\.answered === 0/
);
assert.match(voice, /fromSegmentId === completedId/);
assert.match(voice, /replay-after-\$\{completedId\}/);
assert.match(voice, /justFinishedChapter && shouldHandoffAfter\(sid\)/);
assert.match(voice, /destId === "final1"/);
assert.match(
  voice,
  /Never include lastQuote — praising Ch6 "My tank is ready!"/
);
assert.match(
  voice,
  /result\.ok\) \{\n\s*clearSegmentUi\(segment\.id\);/
);

const lesson = engine.getLesson("part1", "beginner");
const ch6Index = lesson.segments.findIndex((s) => s.id === "ch6");
assert.ok(ch6Index >= 0);
assert.equal(lesson.segments[ch6Index + 1]?.id, "final1");

const state = engine.emptyState("part1");
state.segmentIndex = ch6Index;
state.completedSegmentIds = lesson.segments.slice(0, ch6Index + 1).map((s) => s.id);
engine.saveLessonState(state);

const jump = engine.jumpToSegment("ch6", "part1", "beginner");
assert.equal(jump.ok, true);
assert.equal(engine.getCurrentSegment(engine.loadLessonState()).id, "ch6");
assert.ok(
  engine.loadLessonState().completedSegmentIds.includes("ch6"),
  "replay keeps できた history"
);

const replayDone = engine.completeSegment("ch6", {
  userQuote: "My tank is ready!",
});
assert.equal(replayDone.ok, true);
assert.equal(replayDone.alreadyDone, true);
assert.equal(engine.getCurrentSegment(replayDone.state).id, "final1");

// Mirror afterSegmentAdvanced decision logic (destructuring braces break naive extractors).
function afterSegmentAdvanced(
  completedId,
  result,
  { lastQuote = "", fromSegmentId = null } = {},
  deps
) {
  if (!result?.ok) return false;
  deps.updateLessonBanner();
  const nextId = deps.getCurrentSegment(result.state)?.id || "";
  const justFinishedChapter =
    !result.alreadyDone || fromSegmentId === completedId;
  if (
    justFinishedChapter &&
    deps.shouldHandoffAfter(completedId) &&
    nextId &&
    nextId !== completedId
  ) {
    return deps.scheduleChapterHandoff({
      reason: result.alreadyDone
        ? `replay-after-${completedId}`
        : `after-${completedId}`,
      lastQuote,
    });
  }
  if (result.alreadyDone) return false;
  if (deps.client) deps.configureGeminiClient(deps.client);
  return false;
}

const deps = {
  handoffCalls: [],
  configureCalls: 0,
  bannerCalls: 0,
  getCurrentSegment(state) {
    return state?.next || { id: "final1" };
  },
  updateLessonBanner() {
    deps.bannerCalls += 1;
  },
  shouldHandoffAfter(id) {
    return id === "ch6" || id === "final1";
  },
  scheduleChapterHandoff(opts) {
    deps.handoffCalls.push(opts);
    return true;
  },
  client: {},
  configureGeminiClient() {
    deps.configureCalls += 1;
  },
};

assert.equal(
  afterSegmentAdvanced(
    "ch6",
    { ok: true, alreadyDone: true, state: { next: { id: "final1" } } },
    { lastQuote: "My tank is ready!", fromSegmentId: "ch6" },
    deps
  ),
  true,
  "replay finish must schedule handoff"
);
assert.equal(deps.handoffCalls.length, 1);
assert.equal(deps.handoffCalls[0].reason, "replay-after-ch6");

assert.equal(
  afterSegmentAdvanced(
    "ch6",
    { ok: true, alreadyDone: true, state: { next: { id: "final1" } } },
    { lastQuote: "My tank is ready!", fromSegmentId: "final1" },
    deps
  ),
  false,
  "stale complete while already on final1 must not re-handoff"
);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-ch6-mcq-show-2/);

console.log("check-ch6-replay-final1: ok");
