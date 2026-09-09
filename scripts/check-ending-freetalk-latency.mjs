#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EndingFreeTalkTurnQueue } from "../js/ending-freetalk-queue.js";

let now = 1000;
const queue = new EndingFreeTalkTurnQueue({ now: () => now });
const first = queue.enqueue("クラゲ", { source: "typed" });

assert.equal(first.text, "クラゲ", "the exact child topic must be retained");
assert.equal(
  queue.flush({ ready: false, send: () => true }),
  false,
  "a child turn must remain queued until the fresh Live session is ready"
);
assert.equal(queue.peek()?.text, "クラゲ");

let sends = 0;
const sentPayloads = [];
assert.equal(
  queue.flush({
    ready: true,
    send(turn) {
      sends += 1;
      sentPayloads.push(turn);
      return false;
    },
  }),
  false,
  "a failed socket send must retain the queued turn for fallback"
);
assert.equal(queue.peek()?.text, "クラゲ");

now = 1450;
assert.equal(
  queue.flush({
    ready: true,
    send(turn) {
      sends += 1;
      sentPayloads.push(turn);
      return true;
    },
  }),
  true
);
assert.equal(queue.peek(), null);
assert.equal(queue.lastDispatched.text, "クラゲ");
assert.equal(queue.lastDispatched.dispatchedAt - queue.lastDispatched.queuedAt, 450);
assert.equal(sends, 2, "one failed attempt and one successful fallback are expected");
assert.equal(sentPayloads[0].requestId, sentPayloads[1].requestId);
assert.equal(
  queue.flush({ ready: true, send: () => (sends += 1) }),
  false,
  "a successful child turn must never dispatch twice"
);
assert.equal(sends, 2);

const duplicateQueue = new EndingFreeTalkTurnQueue({ now: () => 2000 });
const shark = duplicateQueue.enqueue("sharks", { source: "voice" });
const duplicate = duplicateQueue.enqueue("sharks", { source: "typed" });
assert.equal(duplicate.requestId, shark.requestId, "voice/typed duplicates share one request");
assert.equal(
  duplicateQueue.enqueue("dolphins", { source: "typed" }),
  null,
  "a second topic cannot replace the child's already queued answer"
);

const source = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const lessonEngine = readFileSync(new URL("../js/lesson-engine.js", import.meta.url), "utf8");
assert.match(
  source,
  /PART1_HANDOFF_AFTER[\s\S]{0,260}"final1"/,
  "Final Challenge must hand off to a fresh ending Live session"
);
assert.match(
  source,
  /afterSegmentAdvanced\("final1", result, \{[\s\S]*?lastQuote: ""/,
  "client-side Final Challenge completion must use the fresh handoff"
);
assert.match(
  source,
  /prewarmDuringEndingTurnA[\s\S]{0,260}forceEnding1OpeningAfterFinal1\("prewarm-after-final1"\)/,
  "static Turn A must start before the fresh-session reconnect"
);
assert.match(
  source,
  /mode: prewarmDuringEndingTurnA \? "turn-a-prewarm-hard"/,
  "Final1 handoff must be measured as an overlapping Turn A prewarm"
);
assert.doesNotMatch(
  source.slice(
    source.indexOf("function forceEnding1OpeningAfterFinal1"),
    source.indexOf("function maybeEnding1CoachNudge")
  ),
  /setTimeout|delayMs|whenAssistantIdle/,
  "Turn A must have no intentional post-Final1 timer/idle delay"
);
assert.match(
  source,
  /client\?\.connected[\s\S]{0,100}client\.sessionReady[\s\S]{0,160}!isAutoReconnecting/,
  "queued Phase 2 delivery must require a fully ready, uncontended session"
);
assert.match(
  source,
  /turnKey: `ending1-\$\{queued\.requestId\}`[\s\S]{0,180}replaySent: true/,
  "the dispatched turn must arm one-shot audible-response recovery without child replay"
);
assert.match(
  source,
  /Static Turn A already asked which fish to catch/,
  "the fresh session must receive explicit Phase 2 context on the child turn"
);
assert.match(
  source,
  /Ignore stale warmup, quiz, Final Challenge, and generic lesson-retrospective questions/,
  "the first fresh-session response must reject stale Final Challenge context"
);
assert.match(
  source,
  /buildEndingFreeTalkInstructions\(state, LEVEL_INFO\.id\)/,
  "ending setup must use the dedicated short Phase 2 prompt"
);
assert.match(
  source,
  /function teardownLiveForHandoff[\s\S]{0,900}sessionResumeHandle = null/,
  "the Final1 hard handoff must clear stale history before ending setup"
);
assert.match(
  source,
  /sessionResumptionEnabled = true[\s\S]{0,100}resumeHandle = sessionResumeHandle/,
  "the new short-context ending session must remain resumable after drops"
);
assert.match(
  lessonEngine,
  /export function buildEndingFreeTalkInstructions[\s\S]*?ENDING PHASE 2 ONLY/,
  "the dedicated ending system prompt must exist"
);
const promptStart = lessonEngine.indexOf(
  "export function buildEndingFreeTalkInstructions"
);
const promptEnd = lessonEngine.indexOf("function final1StartNudge", promptStart);
const promptSource = lessonEngine.slice(promptStart, promptEnd);
assert.doesNotMatch(
  promptSource,
  /final1Rule|buildLessonInstructions|Quiz\/challenge prompts/,
  "the short Phase 2 prompt must not embed the Final1 lesson prompt"
);
assert.match(
  source,
  /ending1Timing\("first-phase2-outbound"/,
  "debug timing must mark the first child outbound"
);
assert.match(
  source,
  /ending1Timing\("first-phase2-audible"[\s\S]{0,120}responseMs:/,
  "debug timing must measure first rendered audio from outbound"
);

console.log("Ending free-talk latency regression checks passed.");
