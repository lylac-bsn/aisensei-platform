#!/usr/bin/env node
/**
 * After "I made [color] glass!" Ch4 → Ch5 handoff, Learny's opening must appear
 * as a chat bubble. A leftover ch4MakeTellDisplayLocked used to swallow all
 * OUTPUT_TRANSCRIPTION on later chapters (audio played, bubble missing).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const voiceTab = readFileSync(new URL("voice-tab.html", root), "utf8");

assert.match(voice, /function seedHandoffOpeningBubble/);
assert.match(voice, /seedHandoffOpeningBubble\(handoffScript\)/);
assert.match(voice, /resetCh4MakeTellSpeechLocks\(\);/);
assert.match(
  voice,
  /Leaving Ch4 mid-lock would mute the next chapter's transcript bubbles/
);

const outIdx = voice.indexOf("case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION");
assert.ok(outIdx >= 0);
const outSlice = voice.slice(outIdx, outIdx + 900);
assert.match(
  outSlice,
  /getCurrentSegment\(\)\?\.id === "ch4" &&\s*\(ch4MakeTellStaticPending \|\| ch4MakeTellDisplayLocked\)/
);
assert.doesNotMatch(
  outSlice,
  /ch4MakeTellStaticPending \|\|\s*ch4MakeTellDisplayLocked\s*\)\s*\{\s*ensureCh4MakeTellBubbleExact/
);

const textIdx = voice.indexOf("case MultimodalLiveResponseType.TEXT:");
const textSlice = voice.slice(textIdx, textIdx + 450);
assert.match(
  textSlice,
  /getCurrentSegment\(\)\?\.id === "ch4" && ch4MakeTellStaticPending/
);

assert.match(voice, /if \(segment\.id === "ch4"\) \{\s*resetCh4MakeTellSpeechLocks/);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-warmup-no-glass-1/);

console.log("check-ch4-ch5-handoff-bubble: ok");
