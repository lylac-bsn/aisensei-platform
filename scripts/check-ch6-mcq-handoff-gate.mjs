#!/usr/bin/env node
/**
 * Daily English → Chapter 6: Beat 1 MCQ must stay hidden until Chapter 6's
 * opening actually starts (segmentIndex advances early while bridge speech plays).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

assert.match(voice, /blockMcqUntilChapterOpening/);
assert.match(voice, /function armMcqHandoffGate/);
assert.match(voice, /function shouldHideMcqForHandoffGate/);
assert.match(voice, /armMcqHandoffGate\(request\.destinationId\)/);
assert.match(voice, /clearMcqHandoffGate\("chapter-opening-started"\)/);
assert.match(voice, /pendingHandoffTimer \|\|/);
assert.match(voice, /pendingChapterHandoff \|\|/);
assert.match(voice, /shouldHideMcqForHandoffGate\(segment\)/);
assert.match(
  voice,
  /Keep Ch6 MCQ hidden the whole time \(segmentIndex is already on ch6\)/
);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-daily1-latency-1/);

console.log("check-ch6-mcq-handoff-gate: ok");
