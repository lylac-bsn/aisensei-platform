#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CH4_AUDIO_MANIFEST } from "../audio/ch4/manifest.js";
import { CH4_AUDIO_SCRIPTS, ch4MakeTellSpeak } from "../js/ch4-audio-config.js";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const voiceTab = readFileSync(new URL("voice-tab.html", root), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

assert.equal(CH4_AUDIO_SCRIPTS.length, 6);
for (const item of CH4_AUDIO_SCRIPTS) {
  assert.equal(item.text, ch4MakeTellSpeak(item.color));
  assert.ok(CH4_AUDIO_MANIFEST[item.key]?.path, `${item.key} must be in manifest`);
  assert.match(CH4_AUDIO_MANIFEST[item.key].path, /^\/audio\/ch4\/[a-f0-9]{20}\.wav$/);
}

const forceMake = functionBody(voice, "forceCh4LetsMake");
assert.match(forceMake, /playCh4StaticAudio/);
assert.match(forceMake, /ch4MakeTellStaticPending = true/);
assert.match(forceMake, /seedCh4MakeTellBubble/);
assert.match(forceMake, /Do NOT send the script/);
assert.doesNotMatch(forceMake, /sendClientText\([\s\S]*<exact>/);

const viaLive = functionBody(voice, "forceCh4LetsMakeViaLive");
assert.match(viaLive, /withCh4ExactSpeakRule/);
assert.match(viaLive, /<exact>/);

assert.match(voice, /shouldDropCh4MakeTellAudio/);
assert.match(voice, /CH4_AUDIO_MANIFEST/);
assert.match(voice, /drop Live audio during ch4 make\+tell/);
assert.match(voiceTab, /homework-voice\.js\?v=20260910-ch6-mcq-show-2/);

const outbound = functionBody(voice, "buildCh4OutboundCoach");
assert.match(outbound, /colour buttons are on screen/);
assert.match(outbound, /Do NOT speak — client will deliver Beat A2\+B/);
assert.doesNotMatch(outbound, /Child named a color/);

console.log("Ch4 speak/MCQ unlock regression checks passed.");
