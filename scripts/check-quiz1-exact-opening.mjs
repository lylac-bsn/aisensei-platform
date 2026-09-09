#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AQUARIUM_PART1 } from "../js/lessons/aquarium-part1.js";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const engine = readFileSync(new URL("js/lesson-engine.js", root), "utf8");
const required = "くいずたいむ！「がらすが ひつよう」は えいごで？";

function functionBody(source, name, nextMarker = "\nfunction ") {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf(nextMarker, start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

const quiz = AQUARIUM_PART1.segments.find((segment) => segment.id === "quiz1");
assert.ok(quiz, "Beginner Part 1 quiz1 must exist");
assert.equal(quiz.items[0].speak, required, "Q1 lesson script must stay exact");
assert.equal(quiz.items[0].promptHira, "がらすが ひつよう");
assert.equal(quiz.items[0].choices.length, 4, "Q1 must keep four clickable choices");
assert.ok(quiz.items[0].choices.includes("I need glass."));

const handoff = functionBody(engine, "buildHandoffOpeningNudge", "\nexport function getClickChoices");
const quizBranchAt = handoff.indexOf('segment.id === "quiz1"');
const genericBranchAt = handoff.indexOf("if (usesTemplate && line)");
assert.ok(quizBranchAt >= 0 && quizBranchAt < genericBranchAt, "quiz1 needs a dedicated handoff");
const quizBranchEnd = handoff.indexOf('if (usesTemplate && segment.id === "final1")', quizBranchAt);
const quizBranch = handoff.slice(quizBranchAt, quizBranchEnd);
assert.match(quizBranch, /entire audible turn MUST be exactly/);
assert.match(quizBranch, /Start with くいずたいむ/);
assert.match(quizBranch, /do not split it into separate turns/i);
assert.doesNotMatch(quizBranch, /quoteBit/, "quiz1 handoff must not ask Live to react to Ch3");

const exactOpening = functionBody(voice, "forceQuiz1ExactOpening");
assert.match(exactOpening, /quiz1State\.cursor !== 0/);
assert.match(exactOpening, /<exact>\$\{script\}<\/exact>/);
assert.match(exactOpening, /first audible word must be くいずたいむ/i);
assert.match(exactOpening, /Do not split the cue and question into separate turns/i);
assert.match(exactOpening, /Perfect, Great, Let's do a quick quiz, くいずをしよう/);
assert.match(exactOpening, /sendClientText\(outbound, \{ force: true \}\)/);
assert.doesNotMatch(exactOpening, /playQuiz1StaticAudio|quiz1OpeningStaticPending/);
assert.doesNotMatch(voice, /playQuiz1StaticAudio/);
assert.doesNotMatch(voice, /QUIZ1_AUDIO_MANIFEST/);

const kick = functionBody(voice, "kickOpeningTurn");
const exactKickAt = kick.indexOf("forceQuiz1ExactOpening");
const genericSendAt = kick.lastIndexOf("sendClientText");
assert.ok(exactKickAt >= 0 && exactKickAt < genericSendAt, "Q1 exact kick must bypass generic opening");
assert.match(kick, /if \(ok\) \{\s*openingSent = true;/);
assert.match(kick, /if \(openingSent \|\| !client\?\.connected\) return false;/);

const recovery = functionBody(voice, "resumeSessionAfterDrop", "\nasync function handleActionButton");
assert.match(recovery, /if \(pendingRecovery\)/);
assert.match(recovery, /else if \(!chatMessages\.some/);
assert.doesNotMatch(
  recovery,
  /forceQuiz1ExactOpening/,
  "automatic reply recovery must not independently enqueue Q1"
);

console.log("Quiz1 exact-opening regression checks passed.");
