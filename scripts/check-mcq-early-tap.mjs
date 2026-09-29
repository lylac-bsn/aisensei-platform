import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let depth = 0;
  for (let i = src.indexOf(") {", start) + 2; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

assert.match(src, /const MCQ_EARLY_TAP_MS = 3000;/);
assert.match(src, /noteAssistantSpeechChunk\(\);\n\s+lastAssistantAudioAt = Date\.now\(\);/);
assert.match(src, /noteAssistantSpeechChunk\(\);\n\s+endingAudioPlaybackEndAt = Date\.now\(\)/);
assert.match(src, /speaker\.disabled = speakersLocked;/);

const ctx = {
  now: 0,
  speaking: false,
  MCQ_EARLY_TAP_MS: 3000,
  assistantSpeechStartedAt: 0,
  mcqQuestionKey: "",
  mcqQuestionShownAt: 0,
  awaitingAssistantReply: false,
  assistantIsSpeaking() {
    return ctx.speaking;
  },
  actionableMcqPresentedSinceUserTurn: () => true,
  mcqBeatDisplayLocked: false,
  isLastAssistantMcqSeeded: () => false,
  pendingReplyMode: "",
  lastTranscriptChunkAt: 0,
  lastUserTurnAt: 0,
  lastAssistantText: () => "",
};
vm.createContext(ctx);
vm.runInContext(
  `Date.now = () => now;
   ${extractFunction("noteMcqQuestionShown")}
   ${extractFunction("mcqEarlyTapAt")}
   ${extractFunction("choicesLocked")}
   this.api = { noteMcqQuestionShown, choicesLocked };`,
  ctx
);
const { noteMcqQuestionShown, choicesLocked } = ctx.api;

// Question appears, Learny starts speaking it.
ctx.now = 10_000;
noteMcqQuestionShown("q1");
ctx.speaking = true;
ctx.assistantSpeechStartedAt = 10_200;
ctx.now = 12_000;
assert.equal(choicesLocked(), true, "locked during the first 3s of the question");
ctx.now = 13_300;
assert.equal(choicesLocked(), false, "answers open 3s after speech starts");
assert.equal(choicesLocked({ allowEarlyTap: false }), true, "option speakers wait for silence");

// Same question re-rendered (wrong answer retry) — new feedback speech restarts the window.
ctx.assistantSpeechStartedAt = 20_000;
ctx.now = 21_000;
noteMcqQuestionShown("q1");
assert.equal(choicesLocked(), true, "retry feedback locks for 3s again");

// Next question arrives mid-speech (praise + next question in one turn).
ctx.now = 30_000;
noteMcqQuestionShown("q2");
ctx.now = 32_500;
assert.equal(choicesLocked(), true, "new question stays locked 3s from display");
ctx.now = 33_100;
assert.equal(choicesLocked(), false);

// Silence: everything open.
ctx.speaking = false;
assert.equal(choicesLocked({ allowEarlyTap: false }), false);

console.log("check-mcq-early-tap: ok");
