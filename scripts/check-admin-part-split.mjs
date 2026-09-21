/**
 * Guard: Part 1 / Part 2 stay separated in progress snapshots and admin sync.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const engine = readFileSync(
  new URL("../js/lesson-engine.js", import.meta.url),
  "utf8"
);
const sync = readFileSync(
  new URL("../js/progress-sync.js", import.meta.url),
  "utf8"
);
const admin = readFileSync(
  new URL("../js/admin-progress.js", import.meta.url),
  "utf8"
);
const badges = readFileSync(
  new URL("../js/badge-engine.js", import.meta.url),
  "utf8"
);
const dashboard = readFileSync(
  new URL("../js/page1-dashboard.js", import.meta.url),
  "utf8"
);

assert.match(engine, /export function resolvePartForSync/);
assert.match(engine, /export function partHasProgress/);
assert.match(
  engine,
  /export function buildProgressSnapshot\(levelId = ACTIVE_LEVEL_ID, cloudLevel = null\)/
);
assert.match(engine, /resolvePartForSync\("part1"/);
assert.match(engine, /resolvePartForSync\("part2"/);
assert.match(engine, /part2Complete/);
assert.match(engine, /evaluateAndAwardBadges\(lessonId, levelId\)/);

assert.match(
  sync,
  /buildProgressSnapshot\(\s*getActiveLevelInfo\(\)\.id,\s*cloudLevel\s*\)/
);
assert.match(sync, /const cloudLevel/);
assert.match(sync, /\$\{field\}\.claimedLessonBadgeIds/);

assert.match(admin, /Part2完了/);
assert.match(admin, /Part2進行中/);
assert.match(admin, /Part2未開始/);
assert.match(admin, /Part2 · \$\{title\}/);
assert.match(admin, /Missing lessonId/);
assert.match(admin, /row\("Part 1"/);
assert.match(admin, /row\("Part 2"/);

assert.match(
  badges,
  /export function evaluateAndAwardBadges\(\s*lessonId = getActiveLessonId\(\)/
);
assert.match(badges, /export function evaluateAndAwardBadgesForAllParts/);
assert.match(badges, /loadLessonStateFor\(lessonId, levelId\)/);

assert.match(dashboard, /evaluateAndAwardBadgesForAllParts/);

// Missing local key must keep cloud part2 (never wipe from a Part-1-only device).
assert.match(engine, /if \(raw == null\) return cloud;/);
// Present empty key (reset) must keep local, not resurrect cloud.
assert.match(engine, /if \(!partHasProgress\(local\)\) return local;/);

console.log("check-admin-part-split: ok");
