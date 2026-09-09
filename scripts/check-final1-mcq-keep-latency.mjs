#!/usr/bin/env node
/**
 * Final Challenge: keep MCQ panel open after taps, and use a slim Live prompt
 * plus exact next-cue speak so replies are not multi-second stalls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFinal1Instructions,
  buildLessonInstructions,
  emptyState,
  getActiveLesson,
  getCurrentSegment,
} from "../js/lesson-engine.js";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");
const engine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");

assert.match(engine, /export function buildFinal1Instructions/);
assert.match(engine, /FINAL CHALLENGE ONLY — short review quiz/);
assert.match(voice, /buildFinal1Instructions\(state, LEVEL_INFO\.id\)/);
assert.match(voice, /const final1Phase = segmentId === "final1"/);
assert.match(voice, /function forceFinal1NextCueSpeak/);
assert.match(voice, /forceFinal1NextCueSpeak\("after-correct-tap"\)/);
assert.match(voice, /Keep the panel open after a tap/);
assert.doesNotMatch(
  voice,
  /After a correct tap, keep the answered cue off-screen until Learny asks the next one/
);
assert.match(voice, /prefer the advanced quiz cursor so the MCQ panel stays open|already advanced — keep the MCQ panel open/);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-ch6-mcq-show-1/);

const lesson = getActiveLesson();
const idx = lesson.segments.findIndex((segment) => segment.id === "final1");
assert.ok(idx >= 0, "final1 segment must exist");
const state = { ...emptyState("part1"), segmentIndex: idx };
assert.equal(getCurrentSegment(state)?.id, "final1");

const slim = buildFinal1Instructions(state, "beginner");
const full = buildLessonInstructions(state, "beginner");
assert.ok(slim.length < 4500, `slim final1 prompt too large: ${slim.length}`);
assert.ok(
  slim.length < full.length * 0.45,
  `slim (${slim.length}) should be much smaller than full (${full.length})`
);
assert.match(slim, /FINAL CHALLENGE ONLY/);
assert.doesNotMatch(slim, /CHAPTER 1 ONLY|hint → word choices|MINI QUIZ 1 ONLY|DAILY ENGLISH ONLY/);

console.log(
  `Final1 MCQ-keep + latency regression checks passed (slim=${slim.length} full=${full.length}).`
);
