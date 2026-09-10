#!/usr/bin/env node
/**
 * Daily English → Chapter 6: Beat 1 MCQ must stay hidden until Chapter 6's
 * opening actually starts (segmentIndex advances early while bridge speech plays).
 * Also: never leave Beat 1 hidden after a duplicate client+tool schedule.
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
assert.match(voice, /Always clear the MCQ gate/);
assert.match(voice, /reason === "after-ch5"/);
assert.match(
  voice,
  /Keep next-chapter MCQ hidden the whole time/
);
assert.match(
  voice,
  /Refresh after those flags clear so Daily→Ch6/
);
assert.match(voice, /renderChoiceBar\(getCurrentSegment\(\)\);\s*\n\s*\}\s*\n\}/);

assert.match(voice, /chapterHandoffArmedFor/);
assert.match(voice, /skip duplicate chapter handoff schedule/);
assert.match(voice, /function shouldForceShowMcqAfterOpening/);
assert.match(voice, /function chapterOpeningLooksPresented/);
assert.match(voice, /opening-already-presented/);
assert.match(voice, /function clearHandoffKickWatch/);
assert.match(
  voice,
  /clearPendingHandoffTimer\(\) \{\s*\n\s*if \(pendingHandoffTimer\)/
);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-ch6-mcq-show-2/);

console.log("check-ch6-mcq-handoff-gate: ok");
