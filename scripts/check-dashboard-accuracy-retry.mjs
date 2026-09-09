#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const dashboard = readFileSync(
  new URL("js/page1-dashboard.js", root),
  "utf8"
);
const css = readFileSync(new URL("css/style.css", root), "utf8");
const page = readFileSync(new URL("page1.html", root), "utf8");

assert.match(
  dashboard,
  /segmentNeedsAccuracyReplay\(st,\s*lesson,\s*seg\.id,[\s\S]*earnedAccuracyTier/
);
assert.match(
  dashboard,
  /class="mission-select-retry"[\s\S]*aria-label="いっぱつせいかい 再チャレンジ"/
);
assert.match(
  dashboard,
  /mission-select-meta-row">\$\{badge\}\$\{playBadge\}\$\{replayBadge\}/,
  "retry label must share the readable metadata row with completion/play indicators"
);
assert.match(
  dashboard,
  /aria-label="\$\{escapeHtml\(itemAria\)\}"/,
  "the chapter button needs an accessible retry description"
);

const retryRule = css.slice(css.indexOf(".mission-select-retry"));
assert.match(retryRule, /border:\s*1px solid #C62828/);
assert.match(retryRule, /background:\s*#FFEBEE/);
assert.match(retryRule, /color:\s*#B71C1C/);
assert.match(retryRule, /@media \(forced-colors: active\)/);

assert.match(
  page,
  /page1-dashboard\.js\?v=20260910-warmup-no-glass-1/,
  "page1 must load the new dashboard bundle"
);

console.log("Dashboard accuracy retry label checks passed.");
