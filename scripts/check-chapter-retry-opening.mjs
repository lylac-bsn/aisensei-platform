#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");

function functionSource(name) {
  const start = voice.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const params = voice.indexOf("(", start);
  let paramDepth = 0;
  let brace = -1;
  for (let i = params; i < voice.length; i += 1) {
    if (voice[i] === "(") paramDepth += 1;
    if (voice[i] === ")") {
      paramDepth -= 1;
      if (paramDepth === 0) {
        brace = voice.indexOf("{", i);
        break;
      }
    }
  }
  assert.ok(brace >= 0, `${name} body must exist`);
  let depth = 0;
  for (let i = brace; i < voice.length; i += 1) {
    if (voice[i] === "{") depth += 1;
    if (voice[i] === "}") depth -= 1;
    if (depth === 0) return voice.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

assert.match(
  functionSource("segmentHasMcqProgress"),
  /return loadMcqCursor\(segmentId\) > 0;/
);
assert.doesNotMatch(
  functionSource("segmentHasMcqProgress"),
  /mcqSummary/
);

const mid = functionSource("isMidChapterResume");
assert.doesNotMatch(mid, /ch4" && state\.memories\?\.favoriteColor/);
assert.match(mid, /segmentUi\?\.ch2\?\.phase/);
assert.match(mid, /segmentUi\?\.ch4\?\.phase/);

assert.match(voice, /function armOpeningDeliveryWatch/);
assert.match(functionSource("kickOpeningTurn"), /armOpeningDeliveryWatch/);
assert.match(functionSource("armOpeningDeliveryWatch"), /mode: "opening"/);

assert.match(
  functionSource("silentReplyDelivered"),
  /pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"/
);
assert.match(
  functionSource("settlePresentedActionableMcq"),
  /pendingReplyMode !== "mcq" && pendingReplyMode !== "opening"/
);
assert.match(
  functionSource("shouldShowLearnyThinking"),
  /pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"/
);
assert.match(
  functionSource("pokeLearny"),
  /pendingReplyMode === "mcq" \|\| pendingReplyMode === "opening"/
);

const context = {
  loadMcqCursor: (id) => (id === "ch2" ? 0 : 0),
  loadLessonState: () => ({
    segmentIndex: 2,
    mcqCursor: { ch2: 0 },
    mcqSummary: {
      "ch2.place": { attempts: 2 },
      "ch2.direction": { attempts: 1 },
      "ch2.found_sand": { attempts: 1 },
    },
    segmentUi: {},
    memories: { favoriteColor: "red", searchPlace: "mountains" },
  }),
  getCurrentSegment: (state) => {
    const id = state?.segmentIndex === 2 || !state ? "ch2" : "ch4";
    return { id };
  },
};

vm.createContext(context);
vm.runInContext(functionSource("segmentHasMcqProgress"), context);
vm.runInContext(functionSource("isMidChapterResume"), context);

assert.equal(context.segmentHasMcqProgress("ch2"), false);
assert.equal(context.isMidChapterResume(context.loadLessonState()), false);

context.loadMcqCursor = () => 1;
assert.equal(context.segmentHasMcqProgress("ch2"), true);
assert.equal(context.isMidChapterResume(context.loadLessonState()), true);

context.loadMcqCursor = () => 0;
context.loadLessonState = () => ({
  segmentIndex: 2,
  mcqCursor: { ch2: 0 },
  mcqSummary: { "ch2.place": { attempts: 9 } },
  segmentUi: { ch2: { phase: "checking" } },
  memories: {},
});
assert.equal(context.isMidChapterResume(context.loadLessonState()), true);

context.getCurrentSegment = () => ({ id: "ch4" });
context.loadLessonState = () => ({
  segmentIndex: 5,
  mcqCursor: { ch4: 0 },
  mcqSummary: { "ch4.color": { attempts: 1 } },
  segmentUi: {},
  memories: { favoriteColor: "blue" },
});
assert.equal(
  context.isMidChapterResume(context.loadLessonState()),
  false,
  "ch4 retry with stored color alone is not mid-chapter"
);

console.log("check-chapter-retry-opening: ok");
