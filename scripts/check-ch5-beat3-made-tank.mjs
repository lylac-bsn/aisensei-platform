#!/usr/bin/env node
/**
 * Ch5 Beat 3 must pair Are you done making it? with すいそうを つくった
 * — never Beat2's 「すいそうを つくってる」.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PART1_ELICIT_JA, AQUARIUM_PART1 } from "../js/lessons/aquarium-part1.js";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

assert.equal(PART1_ELICIT_JA.ch5Building, "「すいそうを つくってる」の えいごを 選んでね！");
assert.equal(PART1_ELICIT_JA.ch5MadeTank, "すいそうを つくった の えいごを 選んでね！");

const ch5 = AQUARIUM_PART1.segments.find((s) => s.id === "ch5");
assert.ok(ch5);
const made = ch5.mcqBeats.find((b) => b.id === "made_tank");
assert.equal(made.learnyEn, "Are you done making it?");
assert.equal(made.learnyJa, PART1_ELICIT_JA.ch5MadeTank);
assert.equal(made.answer, "I made a tank!");

assert.match(engine, /FORBIDDEN Beat 3 mix-up/);
assert.match(engine, /Are you done making it\? with 「すいそうを つくってる」/);
assert.match(engine, /NEVER mix Beat3 Are you done making it\? with 「すいそうを つくってる」/);

assert.match(voice, /function assistantCh5Beat3Mangled/);
assert.match(voice, /function fixCh5Beat3Bubble/);
assert.match(voice, /function forceCh5Beat3ExactSpeak/);
assert.match(voice, /function maybeCh5Beat3ExactSpeakNudge/);
assert.match(voice, /maybeCh5Beat3ExactSpeakNudge\(\)/);
assert.match(voice, /fixCh5Beat3Bubble\(t\)/);
assert.match(voice, /FORBIDDEN: 「すいそうを つくってる」 on Beat 3/);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-ch6-mcq-show-1/);

console.log("Ch5 Beat3 made-tank elicit regression checks passed.");
