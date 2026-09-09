#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");

function functionSource(name) {
  const start = voice.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const params = voice.indexOf("(", start);
  let paramDepth = 0;
  let brace = -1;
  for (let i = params; i < voice.length; i += 1) {
    if (voice[i] === "(") paramDepth += 1;
    if (voice[i] === ")") {
      paramDepth -= 1;
      if (paramDepth === 0) {
        brace = voice.indexOf("{", i);
        break;
      }
    }
  }
  assert.ok(brace >= 0, `${name} body must exist`);
  let depth = 0;
  for (let i = brace; i < voice.length; i += 1) {
    if (voice[i] === "{") depth += 1;
    if (voice[i] === "}") depth -= 1;
    if (depth === 0) return voice.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const render = functionSource("renderChoiceBar");
assert.match(render, /const locked = choicesLocked\(\)/);
assert.match(render, /btn\.disabled = locked/);
assert.match(render, /settlePresentedActionableMcq\("choice-click"\)/);
assert.match(render, /if \(choicesLocked\(\)\) return/);

const choice = functionSource("handleMcqChoiceClick");
assert.ok(
  choice.indexOf("recordMemory(beat.memoryKey, label)") <
    choice.indexOf("advanceMcqCursor(segment.id, beats.length)"),
  "accepted mountains must persist before advancing to direction"
);
assert.match(choice, /const next = getCurrentMcqBeat[\s\S]*buildMcqSpeakCoach\(next\.beat\)/);

const delivered = functionSource("silentReplyDelivered");
assert.match(delivered, /pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"/);
assert.match(delivered, /actionableMcqPresentedSinceUserTurn\(\)/);
const finish = functionSource("finishAssistantTurn");
assert.match(finish, /pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"/);
const poke = functionSource("pokeLearny");
assert.match(poke, /automatic && \(pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"\)/);
assert.match(poke, /buildMcqSpeakCoach\(cur\.beat\)/);
assert.match(poke, /Do not acknowledge or repeat an earlier accepted choice/);

const armWatch = functionSource("armSilentReplyWatch");
assert.match(armWatch, /if \(silentReplyDelivered\(text\)\)[\s\S]*clearPendingReplyWatch/);
assert.match(armWatch, /phase === 0 && !replyWatchAutoPoked/);
assert.match(armWatch, /schedule\(1, REPLY_WATCH_RETRY_MS\)/);

const resume = functionSource("buildMidChapterResumeNudge");
assert.match(resume, /Resume mid-Chapter 2/);
assert.match(resume, /const speak = ch2NextScriptSpeak\(\)/);
const restore = functionSource("restoreCh2SearchState");
assert.match(restore, /syncCh2McqCursorFromPhase\(\)/);

const context = {
  lastUserTurnAt: 100,
  lastTranscriptChunkAt: 101,
  awaitingAssistantReply: true,
  pendingReplyMode: "mcq",
  pendingReplyKey: "mountains",
  chatMessages: [
    { type: "user", text: "mountains" },
    {
      type: "assistant",
      text: "Good try! Do you want to go to the left or right? ひだりと みぎ、どっちに いく？",
    },
  ],
  currentBeat: {
    learnyEn: "Do you want to go to the left or right?",
    learnyJa: "ひだりと みぎ、どっちに いく？",
  },
  cleared: 0,
  thinkingUpdates: 0,
  dbg() {},
  getCurrentSegment: () => ({ id: "ch2" }),
  getCurrentMcqBeat: (_segment, _opts) => ({ beat: context.currentBeat }),
  mcqUnlockFlags: () => ({}),
  isCh2FreeTalkUi: () => false,
  isCh4FreeTalkUi: () => false,
  expandMcqColorPlaceholders: (text) => text,
  loadLessonState: () => ({ memories: { searchPlace: "mountains" } }),
  getCurrentQuiz1Item: () => null,
  getDisplayedFinal1Item: () => null,
  getCurrentFinal1Item: () => null,
  quiz1ItemSpeak: () => "",
  lastAssistantText: () => context.chatMessages.at(-1)?.text || "",
  clearPendingReplyWatch: () => {
    context.cleared += 1;
    context.pendingReplyKey = "";
    context.pendingReplyMode = "";
  },
  updateLearnyThinkingUI: () => {
    context.thinkingUpdates += 1;
  },
  assistantIsSpeaking: () => false,
  whenAssistantIdle: (fn) => fn(),
  scheduleMcqChoiceUnlock: () => {
    context.unlockScheduled += 1;
  },
  clearHandoffOpeningDisplayLock: () => {},
  renderChoiceBar: () => {},
};

context.unlockScheduled = 0;

vm.createContext(context);
for (const name of [
  "normalizePresentedMcqText",
  "currentActionableMcqPrompts",
  "actionableMcqPresentedSinceUserTurn",
  "settlePresentedActionableMcq",
  "choicesLocked",
]) {
  vm.runInContext(`${functionSource(name)}; this.${name} = ${name};`, context);
}

assert.equal(context.actionableMcqPresentedSinceUserTurn(), true);
assert.equal(context.settlePresentedActionableMcq("regression"), true);
assert.equal(context.awaitingAssistantReply, false);
assert.equal(context.cleared, 1, "presented MCQ must cancel auto-poke");
assert.equal(context.unlockScheduled, 1, "presented MCQ must schedule button unlock");
assert.equal(context.choicesLocked(), false, "presented MCQ choices must be clickable");
assert.equal(context.loadLessonState().memories.searchPlace, "mountains");

context.awaitingAssistantReply = true;
context.pendingReplyMode = "mcq";
context.pendingReplyKey = "mountains";
context.lastTranscriptChunkAt = 99;
context.cleared = 0;
assert.equal(context.actionableMcqPresentedSinceUserTurn(), false);
assert.equal(context.settlePresentedActionableMcq("absent"), false);
assert.equal(context.awaitingAssistantReply, true);
assert.equal(context.cleared, 0, "absent delivery must retain one-shot recovery");
assert.equal(context.choicesLocked(), true, "premature next choices stay locked");

assert.match(
  readFileSync(new URL("js/homework-voice.js", root), "utf8"),
  /function scheduleMcqChoiceUnlock/
);
assert.match(
  readFileSync(new URL("js/media-utils.js", root), "utf8"),
  /sealPlaybackEstimate/
);

console.log("Chapter 2 actionable MCQ regression checks passed.");

