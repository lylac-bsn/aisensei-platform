#!/usr/bin/env node
/**
 * Chapter 0 / warmup must never be seeded with homework phrase elicits
 * (Live was appending 「がらすが ひつよう」の えいごを 選んでね！ after How are you).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLessonInstructions,
  emptyState,
  getActiveLesson,
  getCurrentSegment,
} from "../js/lesson-engine.js";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

assert.match(engine, /function japaneseElicitBracketRule\(levelId = ACTIVE_LEVEL_ID, segment = null\)/);
assert.match(engine, /segType === "warmup"/);
assert.match(engine, /FORBIDDEN forever on warmup\/ch0: any homework/);
assert.match(engine, /during warmup\/chat NEVER append homework/);
assert.match(voice, /function assistantWarmupHomeworkLeak/);
assert.match(voice, /function maybeWarmupHomeworkLeakNudge/);
assert.match(voice, /maybeWarmupHomeworkLeakNudge\(\)/);
assert.match(voiceTab, /homework-voice\.js\?v=20260910-ch6-mcq-show-2/);

const lesson = getActiveLesson();
const warmupIdx = lesson.segments.findIndex(
  (segment) => segment.type === "warmup" || segment.id === "ch0"
);
const ch1Idx = lesson.segments.findIndex((segment) => segment.id === "ch1");
assert.ok(warmupIdx >= 0, "warmup/ch0 segment must exist");
assert.ok(ch1Idx >= 0, "ch1 segment must exist");

const warmupState = { ...emptyState("part1"), segmentIndex: warmupIdx };
assert.equal(getCurrentSegment(warmupState)?.type, "warmup");
const warmupPrompt = buildLessonInstructions(warmupState, "beginner");

assert.match(warmupPrompt, /WARMUP \/ CHAPTER 0/);
assert.match(warmupPrompt, /Hello! How are you today/);
assert.doesNotMatch(warmupPrompt, /JAPANESE PHRASE ELICITS/);
assert.doesNotMatch(warmupPrompt, /Ch1 glass:|Ch1 only:/);
// Exact glass elicit string must not appear as a speakable example.
assert.doesNotMatch(warmupPrompt, /「がらすが ひつよう」/);
assert.doesNotMatch(warmupPrompt, /「すなが ひつよう」/);

const ch1State = { ...emptyState("part1"), segmentIndex: ch1Idx };
assert.equal(getCurrentSegment(ch1State)?.id, "ch1");
const ch1Prompt = buildLessonInstructions(ch1State, "beginner");
assert.match(ch1Prompt, /JAPANESE PHRASE ELICITS/);
assert.match(ch1Prompt, /「がらすが ひつよう」の\s*えいごを\s*選んでね/);
assert.match(ch1Prompt, /Ch1 only:/);
assert.doesNotMatch(ch1Prompt, /Ch5 only:/);
assert.doesNotMatch(ch1Prompt, /WARMUP \/ CHAPTER 0/);

console.log("Warmup no-homework-leak regression checks passed.");
