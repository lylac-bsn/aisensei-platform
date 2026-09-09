#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const media = readFileSync(new URL("js/media-utils.js", root), "utf8");
const worklet = readFileSync(
  new URL("audio-processors/playback.worklet.js", root),
  "utf8"
);

function functionBody(source, name, nextMarker = "\nfunction ") {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf(nextMarker, start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

// Transcript and TURN_COMPLETE are progress, not audible delivery.
const activity = functionBody(voice, "hasAnyAssistantActivitySinceUserTurn");
assert.match(activity, /lastAssistantRenderedAt >= lastUserTurnAt/);
assert.doesNotMatch(activity, /hasAssistantReplySinceUser|lastTranscriptChunkAt/);
const finish = functionBody(voice, "finishAssistantTurn");
assert.match(finish, /!pendingReplyKey \|\|/);
assert.match(
  finish,
  /pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"[\s\S]*silentReplyDelivered\(\)[\s\S]*hasAnyAssistantActivitySinceUserTurn\(\)/
);

// Real local voice activity must arm a no-transcript watchdog without a bubble.
const gate = functionBody(voice, "bindVoiceGateActivity");
assert.match(gate, /signalActivityEnd[\s\S]*armSilentReplyWatch\("",/);
assert.match(gate, /turnKey: `voice-activity-\$\{voiceActivitySequence\}`/);
assert.doesNotMatch(gate, /addMessage/);

// Disconnect recovery preserves identity/mode/outbound and either replays once
// when the original send never landed or simply re-arms a sent/resumed turn.
const capture = functionBody(voice, "capturePendingRecovery");
assert.match(capture, /key: pendingReplyKey/);
assert.match(capture, /mode: pendingReplyMode/);
assert.match(capture, /replayOutbound: pendingReplyReplayOutbound/);
const restore = functionBody(voice, "restorePendingRecovery");
assert.match(restore, /!snapshot\.replaySent[\s\S]*snapshot\.replayOutbound/);
assert.match(restore, /initialPhase: snapshot\.autoPoked \? 1 : 0/);
const resume = voice.slice(
  voice.indexOf("async function resumeSessionAfterDrop"),
  voice.indexOf("async function handleActionButton")
);
assert.match(resume, /const pendingRecovery = capturePendingRecovery\(\)/);
assert.match(resume, /restorePendingRecovery\(pendingRecovery, \{ afterReconnect: true \}\)/);

// First setup has the same bounded one-shot opening fallback as handoffs.
const openingFallback = functionBody(voice, "armOpeningKickFallback");
assert.match(openingFallback, /openingSent \|\| actionState !== "active"/);
assert.match(openingFallback, /client\.sessionReady = true/);
assert.match(voice, /armOpeningKickFallback\(\);\s*kickOpeningTurn\(\);/);

// INTERRUPTED only clears recovery after useful audio actually rendered.
const interrupted = voice.slice(
  voice.indexOf("case MultimodalLiveResponseType.INTERRUPTED"),
  voice.indexOf("default:", voice.indexOf("case MultimodalLiveResponseType.INTERRUPTED"))
);
assert.match(interrupted, /capturePendingRecovery\(\)/);
assert.match(interrupted, /silentReplyDelivered\(\)/);
assert.match(interrupted, /restorePendingRecovery\(interruptedRecovery\)/);
assert.match(interrupted, /assistant-interrupted-after-audio/);

// Destructive reset cannot resurrect stale Ch2 segmentUi.
const persist = functionBody(voice, "persistCh2SearchState");
assert.match(persist, /if \(destructiveResetInProgress\)[\s\S]*return/);
const destructive = functionBody(voice, "resetVoiceSessionUI");
assert.ok(
  destructive.indexOf("resetCh2Search();") < destructive.indexOf("disconnectAPI();"),
  "Ch2 runtime must clear before disconnect persistence"
);

// Replay reset cancels timers/IDs/cooldowns and invalidates delayed callbacks.
const reset = functionBody(voice, "resetSessionScopedReliabilityState");
for (const required of [
  "clearOpeningKickFallback",
  "clearPendingReplyWatch",
  "cancelScheduledRepairIncompleteAssistantBubble",
  "clearPendingHandoffTimer",
  "ending1FinaleSpeechWatchId",
  "childTurnRequestId += 1",
  "choiceSpeechRequestId += 1",
  "endingAudioRequestId += 1",
  "pokeCooldownAt = 0",
  "lastOutboundText = \"\"",
  "lastUserTurnAt = 0",
]) {
  assert.ok(reset.includes(required), `replay reset must include ${required}`);
}
const jump = voice.slice(
  voice.indexOf("async function applyChapterJumpFromParent"),
  voice.indexOf("function shouldHandoffAfter")
);
assert.match(jump, /resetSessionScopedReliabilityState\(\)/);
assert.match(voice, /generation !== idleGeneration/);

// MCQ taps use the same delivery watch; failure unlocks choices/manual poke.
const dispatch = functionBody(voice, "dispatchChildTurn");
assert.match(dispatch, /mode = "mcq"/);
assert.match(dispatch, /mode: watchMode/);
assert.match(dispatch, /replayOutbound: outbound/);
const expose = functionBody(voice, "exposeSilentRetry");
assert.match(expose, /awaitingAssistantReply = false/);
assert.match(expose, /btnRetry\.disabled = false/);
assert.match(voice, /clearPendingReplyWatch\("manual-poke"\)[\s\S]*pokeLearny\(\)/);
const poke = functionBody(voice, "pokeLearny");
assert.match(poke, /turnKey: `manual-poke-\$\{lastUserTurnAt\}`/);
assert.match(poke, /mode: "manual-poke"/);

// Runtime worklet check: stale epochs are rejected and cannot emit "rendered".
let Processor;
class MockProcessor {
  constructor() {
    this.port = {
      onmessage: null,
      posted: [],
      postMessage: (message) => this.port.posted.push(message),
    };
  }
}
vm.runInNewContext(worklet, {
  AudioWorkletProcessor: MockProcessor,
  registerProcessor: (_name, klass) => {
    Processor = klass;
  },
  Float32Array,
  Set,
  Number,
});
const processor = new Processor();
processor.port.onmessage({ data: { type: "interrupt", epoch: 7 } });
processor.port.onmessage({
  data: { type: "audio", epoch: 6, chunkId: 1, samples: new Float32Array([0.5]) },
});
assert.equal(processor.audioQueue.length, 0, "prior epoch packet must be dropped");
processor.port.onmessage({
  data: { type: "audio", epoch: 7, chunkId: 2, samples: new Float32Array([0.5]) },
});
processor.process([], [[new Float32Array(8)]], {});
assert.ok(
  processor.port.posted.some((message) => message.type === "rendered" && message.epoch === 7),
  "accepted epoch must acknowledge actual rendered samples"
);
assert.match(media, /audioAcceptAfter = Date\.now\(\) \+ 180/);
assert.match(media, /finishTurnIngress\(\)[\s\S]*_clearQuarantinedAudio\(\)/);
assert.match(media, /requestedEpoch !== this\.playbackEpoch/);

console.log("Recovery reliability regression checks passed.");
