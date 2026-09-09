#!/usr/bin/env node
/**
 * Daily English must use a short dedicated Live prompt — the full lesson
 * instructions (~14k chars with MCQ scaffolding) made free-chat replies lag.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDaily1Instructions,
  buildLessonInstructions,
  getActiveLesson,
  loadLessonState,
  saveLessonState,
} from "../js/lesson-engine.js";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const lessonEngine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

assert.match(lessonEngine, /export function buildDaily1Instructions/);
assert.match(lessonEngine, /DAILY ENGLISH ONLY/);
assert.match(voice, /buildDaily1Instructions\(state, LEVEL_INFO\.id\)/);
assert.match(voice, /withDaily1SpeakRule/);
assert.match(voice, /withSegmentSpeakRule/);
assert.match(voice, /const daily1Phase = segmentId === "daily1"/);
assert.match(voice, /segId === "daily1" \? 160/);
assert.match(voice, /isDaily1ShortAck[\s\S]*かわいい/);
assert.match(voiceTab, /homework-voice\.js\?v=20260910-daily1-latency-1/);

const lesson = getActiveLesson();
const idx = lesson.segments.findIndex((segment) => segment.id === "daily1");
assert.ok(idx >= 0, "daily1 segment must exist");
const state = loadLessonState();
state.segmentIndex = idx;
saveLessonState(state);
const fresh = loadLessonState();

const slim = buildDaily1Instructions(fresh, "beginner");
const full = buildLessonInstructions(fresh, "beginner");

assert.ok(slim.length < 4500, `slim daily1 prompt too large: ${slim.length}`);
assert.ok(slim.length < full.length * 0.45, `slim (${slim.length}) should be much smaller than full (${full.length})`);
assert.doesNotMatch(slim, /CHAPTER 1 ONLY|hint → word choices|MINI QUIZ 1 ONLY/);
assert.match(slim, /DAILY ENGLISH ONLY/);
assert.match(slim, /complete_segment\(daily1\)/);
assert.match(slim, /English, then matching ひらがな/);

const dailySpeak = voice.slice(
  voice.indexOf("function withDaily1SpeakRule"),
  voice.indexOf("function withSegmentSpeakRule")
);
assert.match(dailySpeak, /ONE short turn/);
assert.doesNotMatch(dailySpeak, /の えいごを 選んでね/);

console.log(
  `Daily1 latency regression checks passed (slim=${slim.length} full=${full.length}).`
);
