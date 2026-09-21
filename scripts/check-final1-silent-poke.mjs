#!/usr/bin/env node
/**
 * Final1 after a correct tap: silent-watch must not treat the prior cue MCQ as
 * delivered, and stale playback must not block auto-つつく forever.
 * Mid-chapter MCQ: praise-only audio must not cancel auto-つつく.
 * つつく must not fire while Learny is speaking (Part 1 rule).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const voice = readFileSync(new URL("../js/homework-voice.js", import.meta.url), "utf8");
const voiceTab = readFileSync(new URL("../voice-tab.html", import.meta.url), "utf8");

assert.match(voice, /pendingReplyMode === "final1"/);
assert.match(voice, /mode: "final1"/);
assert.match(voice, /function sealStaleAssistantPlaybackEstimate/);
assert.match(voice, /silent-watch stall break/);
assert.match(voice, /stallCount >= 6/);
assert.match(voice, /final1ItemAlreadyAnswered\(item\)/);
assert.match(voice, /staying silent/);

// Praise-only packets must not skip recovery — require confirmed elicit.
assert.match(voice, /auto-poke skipped; mcq elicit already presented/);
assert.match(voice, /silent-watch stall auto-poke/);
assert.match(
  voice,
  /mcqLike && pendingExact && !actionableMcqPresentedSinceUserTurn\(\)/
);

// Part 1 poke-while-speaking rule.
assert.match(voice, /function learnyIsBusySpeaking/);
assert.match(voice, /auto-poke deferred; learny speaking/);
assert.match(voice, /poke blocked; learny speaking/);
assert.match(voice, /function paintPokeButton/);
assert.match(voice, /silent-watch deferred; learny still speaking/);
assert.match(voiceTab, /homework-voice\.js\?v=20260921-ending-autostart/);

console.log("check-final1-silent-poke: ok");
