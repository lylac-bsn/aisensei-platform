#!/usr/bin/env node
/**
 * Ch5→Daily and Daily→Ch6 must wait for Learny to finish speaking before reconnect,
 * and Ch6 Beat 1 MCQ must not stay hidden after the opening is on screen.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PART1_ELICIT_JA, CH6_BEAT1_SPEAK, AQUARIUM_PART1 } from "../js/lessons/aquarium-part1.js";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");
const engine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");

assert.equal(PART1_ELICIT_JA.ch6PutSand, "「すなを そこに おいた」の えいごを 選んでね！");
assert.match(CH6_BEAT1_SPEAK, /「すなを そこに おいた」の\s*えいごを\s*選んでね！/);
assert.doesNotMatch(CH6_BEAT1_SPEAK, /おこう！の\s*えいごを/);

const ch6 = AQUARIUM_PART1.segments.find((s) => s.id === "ch6");
assert.ok(ch6);
assert.equal(ch6.mcqBeats[0].learnyJa, "すいそうの そこに すなを おこう！" + PART1_ELICIT_JA.ch6PutSand);
assert.equal(ch6.mcqBeats[0].answer, "I put the sand on the bottom.");

assert.match(voice, /reason === "after-daily1"/);
assert.match(voice, /reason === "after-ch5"/);
assert.match(voice, /resetMcqCursor\(request\.destinationId\)/);
assert.match(voice, /Always clear the MCQ gate/);
assert.match(voice, /markChapterTransitionSpeaking\(\);/);
assert.match(voice, /seedHandoffOpeningBubble/);

assert.match(engine, /PART1_ELICIT_JA\.ch6PutSand/);
assert.match(voiceTab, /homework-voice\.js\?v=20260910-final1-mcq-keep-1/);

console.log("Ch5/Ch6 handoff + Beat1 MCQ regression checks passed.");
