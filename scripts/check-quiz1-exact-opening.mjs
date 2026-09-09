#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AQUARIUM_PART1 } from "../js/lessons/aquarium-part1.js";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const engine = readFileSync(new URL("js/lesson-engine.js", root), "utf8");
const voiceTab = readFileSync(new URL("voice-tab.html", root), "utf8");
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
assert.match(String(quiz.coach || ""), /くいずたいむ！は英語で？/);

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

assert.match(engine, /くいずたいむ！は英語で？/);
assert.match(voice, /assistantQuiz1SpeakMangled/);
assert.match(voice, /maybeQuiz1ExactSpeakNudge/);
assert.match(voice, /withQuizExactSpeakRule/);
assert.match(voice, /lesson-choice-question-replay/);
assert.match(voice, /forceMcqQuestionExactReplay/);
assert.match(voice, /CHOICE_QUESTION_REPLAY_LABEL = "もういちど聞く"/);
assert.match(voiceTab, /lesson-choice-question-replay/);
assert.match(voiceTab, /\.lesson-choice-title-row/);
assert.doesNotMatch(voice, /CHOICE_QUESTION_REPLAY_ICON/);
assert.doesNotMatch(voiceTab, /lesson-choice-question-replay svg/);

const exactSpeak = functionBody(voice, "forceQuiz1ExactSpeak");
assert.match(exactSpeak, /<exact>\$\{script\}<\/exact>/);
assert.match(exactSpeak, /first audible word must be くいずたいむ|Do not add praise/i);
assert.match(exactSpeak, /くいずたいむ！は英語で？/);
assert.match(exactSpeak, /withQuizExactSpeakRule\(outbound\)/);
assert.match(exactSpeak, /sendClientText\(withQuizExactSpeakRule\(outbound\), \{ force: true \}\)/);
assert.doesNotMatch(exactSpeak, /playQuiz1StaticAudio|quiz1OpeningStaticPending/);

const exactOpening = functionBody(voice, "forceQuiz1ExactOpening");
assert.match(exactOpening, /quiz1State\.cursor !== 0/);
assert.match(exactOpening, /forceQuiz1ExactSpeak\(reason\)/);

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

const quizOutbound = functionBody(voice, "beginnerOutboundSpeakRule");
assert.match(quizOutbound, /Speak EXACTLY once, every mora word-by-word/);
assert.match(quizOutbound, /くいずたいむ！は英語で？/);
assert.doesNotMatch(quizOutbound, /Ask the cue \+ は えいごで？/);

console.log("Quiz1 exact-opening regression checks passed.");
