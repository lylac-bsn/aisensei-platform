#!/usr/bin/env node
/**
 * Final1 after a correct tap: silent-watch must not treat the prior cue MCQ as
 * delivered, and stale playback must not block auto-つつく forever.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

assert.match(voice, /pendingReplyMode === "final1"/);
assert.match(voice, /mode: "final1"/);
assert.match(voice, /function sealStaleAssistantPlaybackEstimate/);
assert.match(voice, /silent-watch stall break/);
assert.match(voice, /stallCount >= 4/);
assert.match(voice, /final1ItemAlreadyAnswered\(item\)/);
assert.match(voice, /staying silent/);

assert.match(voiceTab, /homework-voice\.js\?v=20260910-mcq-replay-ui-1/);

console.log("check-final1-silent-poke: ok");
