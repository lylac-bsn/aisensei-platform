#!/usr/bin/env node
/**
 * Part 2 ending matches Part 1 structure with hosted static audio:
 * intro clip once → free talk → 終わりにする → finale clip once.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { ENDING_AUDIO_MANIFEST } from "../audio/ending/manifest.js";
import { ENDING_AUDIO_SCRIPTS } from "../js/ending-audio-config.js";

const voice = readFileSync(
  new URL("../js/homework-voice.js", import.meta.url),
  "utf8"
);
const part2 = readFileSync(
  new URL("../js/lessons/aquarium-part2.js", import.meta.url),
  "utf8"
);
const engine = readFileSync(
  new URL("../js/lesson-engine.js", import.meta.url),
  "utf8"
);
const voiceTab = readFileSync(
  new URL("../voice-tab.html", import.meta.url),
  "utf8"
);

assert.match(part2, /export const PART2_ENDING_INTRO_SPEAK/);
assert.match(part2, /export const PART2_ENDING_FINALE_SPEAK/);
assert.match(part2, /Now, let's chat freely with Teacher Learny!/);
assert.match(part2, /それじゃあラーニー先生と自由に会話してみよう！/);
assert.doesNotMatch(part2, /THREE FIXED TURNS|noFreeTalk:\s*true/);

assert.match(engine, /same structure as Part 1/);

assert.ok(ENDING_AUDIO_MANIFEST["beginner-part2-intro"]?.path);
assert.ok(ENDING_AUDIO_MANIFEST["beginner-part2-finale"]?.path);
assert.ok(
  existsSync(
    new URL(".." + ENDING_AUDIO_MANIFEST["beginner-part2-intro"].path, import.meta.url)
  ),
  "part2 intro wav missing"
);
assert.ok(
  existsSync(
    new URL(".." + ENDING_AUDIO_MANIFEST["beginner-part2-finale"].path, import.meta.url)
  ),
  "part2 finale wav missing"
);
assert.ok(ENDING_AUDIO_SCRIPTS.some((s) => s.key === "beginner-part2-intro"));
assert.ok(ENDING_AUDIO_SCRIPTS.some((s) => s.key === "beginner-part2-finale"));

assert.match(voice, /function ending1StaticIntroKey/);
assert.match(voice, /function ending1StaticFinaleKey/);
assert.match(voice, /beginner-part2-intro/);
assert.match(voice, /beginner-part2-finale/);
assert.match(voice, /playEndingStaticAudio\(staticKey\)/);
assert.doesNotMatch(voice, /Part 2 has no hosted static clip yet/);
assert.doesNotMatch(voice, /Part 2: no hosted Turn C clip/);

// Part 1 and Part 2 both prewarm hosted Turn A after Final Challenge.
assert.match(voice, /const prewarmDuringEndingTurnA = isFinal1ToEnding/);
assert.match(voice, /handoff-safety/);
assert.match(voice, /Stale Perfect \/ ばっちり bubbles/);
assert.doesNotMatch(
  voice,
  /Part 2 Turn A is Live-spoken \(not static\)\. Prewarm \+ hard reconnect/
);

assert.match(voice, /usesBeginnerHomeworkArchitecture\(state\)/);
assert.match(voice, /maybeHealPart2EndingChapterBadge/);
assert.match(voiceTab, /homework-voice\.js\?v=20260922-part2-intro-tts/);

console.log("check-part2-ending-after-final1: ok");
