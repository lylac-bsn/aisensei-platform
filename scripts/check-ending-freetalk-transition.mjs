#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");

const enterStart = source.indexOf("function enterEnding1FreeTalkIfReady()");
const enterEnd = source.indexOf("/** 終わりにする", enterStart);
const enterBody = source.slice(enterStart, enterEnd);

assert.ok(enterStart >= 0 && enterEnd > enterStart, "free-talk transition must exist");
assert.doesNotMatch(
  enterBody,
  /sendTeacherNote|sendClientText/,
  "entering free talk must not trigger an unsolicited model turn"
);

assert.match(
  source,
  /Static Turn A already asked which fish to catch/,
  "the child turn must carry explicit Turn A context"
);
assert.match(
  source,
  /Ignore stale warmup, quiz, Final Challenge, and generic lesson-retrospective questions/,
  "the child turn must override stale scripted history"
);
assert.match(
  source,
  /ending1Beat\.freeTalkTopic = t/,
  "free talk must remember the child's chosen topic"
);
assert.match(
  source,
  /isClarification && topic/,
  "clarification turns must retain the previous child topic"
);
assert.match(
  source,
  /isEnding1FreeTalkActive\(\)[\s\S]{0,120}nudgeEnding1FreeTalkReply/,
  "the reply watchdog must recover free-talk silence without replaying the child turn"
);
assert.match(
  source,
  /ending1Beat\.finaleRequested[\s\S]{0,80}return "ending-finale"/,
  "only the explicit finale may suppress the free-talk reply watchdog"
);
assert.match(
  source,
  /ENDING PHASE 2\|Child said:/,
  "Turn A hard-block must allow Phase 2 free-talk outbound"
);
assert.doesNotMatch(
  source.slice(
    source.indexOf("function buildEnding1FreeTalkOutboundCoach"),
    source.indexOf("function buildEnding1FreeTalkTurn")
  ),
  /What kind of fish should we catch/,
  "Phase 2 coach must not include the blocked Turn A fish-Q string"
);

console.log("Ending free-talk transition regression checks passed.");
