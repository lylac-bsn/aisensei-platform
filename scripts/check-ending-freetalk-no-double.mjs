#!/usr/bin/env node
/**
 * Ending free-talk must not use withBeginnerSpeakRule ("One short turn") — that
 * cut bilingual replies mid-line and restarted (A shark! … ア シャーク! ×2).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");
const lessonEngine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");

assert.match(voice, /function withEndingFreeTalkSpeakRule/);
assert.match(voice, /function trimEnding1FreeTalkRestart/);
assert.match(voice, /withEndingFreeTalkSpeakRule\(outbound\)/);
assert.match(voice, /withEndingFreeTalkSpeakRule\(formatTeacherNote\(note\)\)/);
assert.match(voice, /withEndingFreeTalkSpeakRule\(buildEnding1FreeTalkTurn/);
assert.doesNotMatch(
  voice.slice(
    voice.indexOf("function flushEnding1QueuedChildTurn"),
    voice.indexOf("function queueEnding1FreeTalkChildTurn")
  ),
  /withBeginnerSpeakRule\(outbound\)/
);
assert.match(voice, /never restart or repeat the English/);
assert.match(lessonEngine, /never restart or repeat the English/);

function functionSource(name) {
  const start = voice.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  let depth = 0;
  let brace = -1;
  for (let i = start; i < voice.length; i += 1) {
    if (voice[i] === "{") {
      if (brace < 0) brace = i;
      depth += 1;
    } else if (voice[i] === "}") {
      depth -= 1;
      if (depth === 0) return voice.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const context = {
  isEnding1FreeTalkActive: () => true,
};
vm.createContext(context);
vm.runInContext(functionSource("trimEnding1FreeTalkRestart"), context);

const doubled =
  "A shark! That's a cool choice! Are we going to the ocean to find one?" +
  "ア シャーク! That's a cool choice! Are we going to the ocean to find one?" +
  "ア シャーク! すごいチョイスだね!海に探しに行く?";
const cleaned = context.trimEnding1FreeTalkRestart(doubled);
assert.match(cleaned, /A shark! That's a cool choice! Are we going to the ocean to find one\?/);
assert.match(cleaned, /すごいチョイスだね/);
assert.equal(
  (cleaned.match(/Are we going to the ocean to find one\?/gi) || []).length,
  1,
  "English question must appear once"
);
assert.equal(
  (cleaned.match(/ア\s*シャーク/g) || []).length,
  1,
  "katakana echo must appear once"
);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-accuracy-best-1/);

console.log("check-ending-freetalk-no-double: ok");
