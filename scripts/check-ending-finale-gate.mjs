#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  ENDING1_FINALE_SPEAK,
  isEnding1FinaleTranscript,
} from "../js/ending-audio-config.js";

for (const casualGoodbye of ["Bye bye! またね！", "See you next time!"]) {
  assert.equal(
    isEnding1FinaleTranscript(casualGoodbye, { finaleRequested: false }),
    false,
    "free-talk goodbye must not count before 終わりにする"
  );
}

assert.equal(
  isEnding1FinaleTranscript(ENDING1_FINALE_SPEAK, { finaleRequested: false }),
  false,
  "even the exact finale must not count before 終わりにする"
);
assert.equal(
  isEnding1FinaleTranscript(ENDING1_FINALE_SPEAK, {
    finaleRequested: true,
    displayLocked: true,
  }),
  false,
  "static Turn C must not complete while local audio is playing"
);
assert.equal(
  isEnding1FinaleTranscript(ENDING1_FINALE_SPEAK, { finaleRequested: true }),
  true,
  "Turn C may count after 終わりにする"
);

console.log("Ending finale gate regression checks passed.");
