#!/usr/bin/env node
/**
 * Part 2 beginner sessions must never be coached with Part 1 glass/tank-build lines.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = {
  GC_LEVEL: "beginner",
  GC_LESSON: "part2",
  location: { search: "?lesson=part2" },
};
globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
};

const {
  buildLessonInstructions,
  buildOpeningNudge,
  buildAdvanceNudge,
  buildHandoffOpeningNudge,
  emptyState,
  usesBeginnerPart2Architecture,
} = await import("../js/lesson-engine.js");

assert.equal(usesBeginnerPart2Architecture("part2", "beginner"), true);

const state = emptyState("part2");
state.segmentIndex = 1; // ch1 decorate

const open = buildOpeningNudge(state);
const adv = buildAdvanceNudge(state);
const hand = buildHandoffOpeningNudge(state, { reason: "handoff" });
const instr = buildLessonInstructions(state);

for (const [name, text] of [
  ["opening", open],
  ["advance", adv],
  ["handoff", hand],
]) {
  assert.match(text, /decorated your tank|こんぶを おいた/, `${name} should open Part 2 kelp beat`);
  assert.doesNotMatch(
    text,
    /Speak EXACTLY[^F]{0,200}What do I need to make a tank/i,
    `${name} must not force Part 1 tank Step 1`
  );
}

assert.match(instr, /CHAPTER 1 PART 2/);
assert.match(instr, /FORBIDDEN: Part 1 glass\/sand/);

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
assert.match(voice, /function maybeCh1InviteLoopNudge[\s\S]*?if \(!usesTemplateArchitecture\(\)\) return/);
assert.match(voice, /function buildCh1OutboundCoach[\s\S]*?if \(!usesTemplateArchitecture\(\)\) return/);
assert.match(voice, /HANDOFF_SPEAK_LINES_PART2/);
assert.match(voice, /PART2_CH1_BEAT1_SPEAK/);
assert.match(voice, /maybePart2Ch1Beat1ExactSpeakNudge/);
assert.match(voice, /seedMcqBeatSpeakBubble/);
assert.match(voice, /mcqBeatDisplayLocked/);
assert.match(voice, /ensureMcqBeatSpeakBubbleExact/);
assert.match(voice, /PART2_CH2_BEAT1_SPEAK/);
assert.match(voice, /maybePart2HandoffOpeningExactSpeakNudge/);
assert.match(voice, /gateHandoffOpeningAudioPacket/);
assert.match(voice, /sealHandoffOpeningSpeech/);
assert.match(voice, /opening-already-heard/);
assert.match(voice, /assistantHeardSinceUserTurn/);
assert.match(voice, /isLastAssistantMcqSeeded/);
assert.match(voice, /seedQuiz1SpeakBubble/);
assert.match(voice, /function buildQuiz1OutboundCoach[\s\S]*?usesBeginnerHomeworkArchitecture/);
assert.match(voice, /function maybeCompleteQuiz1FromClient[\s\S]*?usesBeginnerHomeworkArchitecture/);
const engine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");
assert.match(engine, /function quiz1RulePart2/);
assert.match(engine, /quiz1StartNudgePart2/);
assert.match(engine, /segment\.id === "quiz1" && usesPart2 \? quiz1RulePart2/);
assert.match(voice, /function canCompleteQuiz1Part1[\s\S]*?usesBeginnerHomeworkArchitecture/);
assert.match(voice, /function canCompleteQuiz1Part1[\s\S]*?quiz1State\.answered >= total/);
assert.doesNotMatch(
  voice,
  /function canCompleteQuiz1Part1\(\) \{\s*if \(getActiveLessonId\(\) !== "part1"\) return true/
);
assert.match(voice, /function ch4ColorChoiceActive[\s\S]*?usesTemplateArchitecture/);
assert.match(
  voice,
  /function isCh4FreeTalkUi\(\) \{\s*if \(!usesTemplateArchitecture\(\)\) return false;/
);
assert.match(voice, /function assistantLiveIncludesScript/);
assert.match(voice, /function mergeMcqPraiseWithSeededScript/);
assert.match(voice, /function preferMcqTranscriptWithPraise/);
assert.match(voice, /mcqBeatSeededExact/);
assert.match(voice, /nextMcqTranscriptPraise/);
assert.match(voice, /seedMcqBeatSpeakBubble\(next\.beat, \{ praise: advancePraise \}\)/);
assert.match(voice, /Past the chapter opening/);
assert.match(voice, /resetHandoffOpeningSpeechGate\(\)/);
assert.match(voice, /live-stt-accepted/);
assert.match(voice, /function canCompletePart2McqSegment/);
assert.match(voice, /part2McqCompleteBlockedMessage/);
assert.match(voice, /\["ch1", "ch2", "ch3", "ch4", "ch5", "ch6"\]\.includes\(sid\)/);
assert.match(voice, /ch5 must be included/);
assert.match(engine, /Do NOT call complete_segment\(ch1\) after Beat 1–4/);
const part2Lesson = readFileSync(
  new URL("../js/lessons/aquarium-part2.js", import.meta.url),
  "utf8"
);
assert.match(
  part2Lesson,
  /PART2_CH2_BEAT1_SPEAK\s*=\s*\n?\s*"Do you remember going to find fish\? " \+ PART2_ELICIT_JA\.ch2GoOcean/
);
assert.match(
  part2Lesson,
  /PART2_CH1_BEAT1_SPEAK\s*=\s*\n?\s*"Let's remember how you decorated your tank! " \+ PART2_ELICIT_JA\.ch1PutKelp/
);
assert.match(part2Lesson, /ch1PutKelp: "「ここに こんぶを おいた」の えいごを 選んでね！"/);
// Part 2 Ch0 must require the aquarium invite before complete_segment(ch0).
assert.match(voice, /usesBeginnerHomeworkArchitecture\(\)/);
assert.match(
  voice,
  /Do you remember the aquarium you made in Minecraft\? Let's remember it together!/
);
assert.match(
  voice,
  /function isCh2SandSearchContext\(\) \{\s*[\s\S]*?if \(!usesTemplateArchitecture\(\)\) return false/
);
assert.match(
  voice,
  /function isCh2FreeTalkUi\(\) \{\s*if \(!usesTemplateArchitecture\(\)\) return false/
);
assert.match(voice, /Part 1 Ch2 sand search — NEVER use this for Part 2/);
assert.match(voice, /Part 1 Ch4 colour \/ make\+tell — NEVER use for Part 2/);
assert.match(
  voice,
  /function maybeCh1DoneLoopNudge\(\) \{\s*[\s\S]*?if \(!usesTemplateArchitecture\(\)\) return/
);
assert.match(voice, /function assistantHasHandoffOpeningEnglish/);
assert.match(voice, /function scheduleHandoffOpeningMissingEnglishRepair/);
assert.match(voice, /WRONG: you skipped the ENGLISH lead-in/);
assert.match(voice, /handoffOpeningLiveStt/);

console.log("Part 2 no-Part-1-leak regression checks passed.");
