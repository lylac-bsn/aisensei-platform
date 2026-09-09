#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("js/admin-progress.js", root), "utf8");
const css = readFileSync(new URL("css/admin.css", root), "utf8");
const page = readFileSync(new URL("admin.html", root), "utf8");

const fixtures = [
  { name: "correct clicked", correct: true, count: 1, state: "is-correct" },
  { name: "incorrect clicked", correct: false, count: 2, state: "is-incorrect-clicked" },
  { name: "unclicked distractor", correct: false, count: 0, state: "" },
];

for (const fixture of fixtures) {
  const state = fixture.correct
    ? "is-correct"
    : fixture.count > 0
      ? "is-incorrect-clicked"
      : "";
  assert.equal(state, fixture.state, fixture.name);
}

assert.match(source, /const clickedIncorrect = !ok && count > 0;/);
assert.match(
  source,
  /ok \? " is-correct" : clickedIncorrect \? " is-incorrect-clicked" : ""/
);
assert.match(source, /data-correct="\$\{ok\}" data-click-count="\$\{count\}"/);
assert.match(source, /progress-mcq-option-result" aria-label="不正解">×/);
assert.match(source, /title="\$\{c\.correct \? "正解" : "不正解"\}"/);
assert.match(source, /c\.correct \? " ✓" : " ×"/);

const incorrectOptionStart = css.indexOf(".progress-mcq-option.is-incorrect-clicked");
const incorrectOptionRule = css.slice(
  incorrectOptionStart,
  css.indexOf(".progress-mcq-order", incorrectOptionStart)
);
assert.match(incorrectOptionRule, /background:\s*#ffebee/i);
assert.match(incorrectOptionRule, /border-color:\s*#e57373/i);
assert.match(incorrectOptionRule, /color:\s*#b71c1c/i);

const wrongOrderRule = css.slice(css.indexOf(".progress-mcq-order-list li.is-wrong"));
assert.match(wrongOrderRule, /color:\s*#b71c1c/i);

assert.match(page, /admin\.css\?v=20260910-mcq-errors/);
assert.match(page, /admin-progress\.js\?v=20260910-daily1-latency-1/);

console.log("Admin MCQ click-state checks passed.");
