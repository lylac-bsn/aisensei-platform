#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PART1_ELICIT_JA, CH6_BEAT1_SPEAK } from "../js/lessons/aquarium-part1.js";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const engine = readFileSync(new URL("js/lesson-engine.js", root), "utf8");

for (const [key, value] of Object.entries(PART1_ELICIT_JA)) {
  assert.match(
    value,
    /の\s+えいごを\s+選んでね！/,
    `${key} must keep spaced の えいごを 選んでね！`
  );
  assert.doesNotMatch(value, /の選んでね/, `${key} must not omit えいごを`);
}

assert.match(CH6_BEAT1_SPEAK, /の\s+えいごを\s+選んでね！/);

assert.match(engine, /CRITICAL AUDIO: Pronounce every mora of え・い・ご・を/);
assert.match(engine, /does NOT mean skip the Japanese word えいご/);

assert.match(voice, /function buildMcqSpeakCoach/);
assert.match(voice, /Pronounce every mora of え・い・ご・を/);
assert.match(voice, /function maybeElicitEigoSkipNudge/);
assert.match(voice, /assistantSkippedEigoElicit/);
assert.match(voice, /」\\s\*の\\s\*\(\?!えいごを\)選んでね/);

console.log("Elicit えいご pronunciation regression checks passed.");
