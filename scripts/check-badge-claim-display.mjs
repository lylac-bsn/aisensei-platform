#!/usr/bin/env node

/**
 * Reproduces the post-「最初から」 badge claim wipe:
 * re-earn → pending → sync treats pending as still-revoked → うけとる claims nothing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

class MemoryStorage {
  #data = new Map();
  getItem(key) {
    return this.#data.has(String(key)) ? this.#data.get(String(key)) : null;
  }
  setItem(key, value) {
    this.#data.set(String(key), String(value));
  }
  removeItem(key) {
    this.#data.delete(String(key));
  }
  clear() {
    this.#data.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  GC_LEVEL: "beginner",
  GC_LESSON: "part1",
  location: { search: "" },
  parent: { postMessage() {} },
};

const lessonEngine = await import("../js/lesson-engine.js");
const badgeEngine = await import("../js/badge-engine.js");

const {
  claimPendingLessonBadges,
  loadBadgeRevocations,
  loadEarnedLessonBadges,
  loadPendingLessonBadges,
  resetLesson,
  saveEarnedLessonBadges,
  savePendingLessonBadges,
  saveBadgeRevocations,
} = lessonEngine;
const { syncBadgeAwards, highestTierByFamily, familySlotImage, BADGE_IMAGES } =
  badgeEngine;

const root = new URL("../", import.meta.url);
const voice = readFileSync(new URL("js/homework-voice.js", root), "utf8");
const dashboard = readFileSync(new URL("js/page1-dashboard.js", root), "utf8");
const syncSrc = readFileSync(new URL("js/progress-sync.js", root), "utf8");
const badgeSrc = readFileSync(new URL("js/badge-engine.js", root), "utf8");

function mergeBadgeLists(localIds, cloudIds, revocations = []) {
  const revoked = new Set((revocations || []).map(String));
  const merged = new Set();
  for (const id of cloudIds || []) {
    if (!revoked.has(id)) merged.add(String(id));
  }
  for (const id of localIds || []) {
    if (!revoked.has(id)) merged.add(String(id));
  }
  return [...merged];
}

function simulateSyncWipeBugFixed() {
  const localBadges = loadEarnedLessonBadges();
  const localPending = loadPendingLessonBadges();
  const revoked = loadBadgeRevocations();
  const protectedIds = new Set([...localBadges, ...localPending]);
  const stillRevoked = revoked.filter((id) => !protectedIds.has(id));
  const mergedBadges = mergeBadgeLists(localBadges, [], stillRevoked);
  const mergedPending = mergeBadgeLists(localPending, [], stillRevoked).filter(
    (id) => !mergedBadges.includes(id)
  );
  saveEarnedLessonBadges(mergedBadges);
  savePendingLessonBadges(mergedPending);
  saveBadgeRevocations(stillRevoked);
  return { mergedBadges, mergedPending, stillRevoked };
}

// 1) Ceremony claim must work even when pending was wiped.
{
  localStorage.clear();
  saveBadgeRevocations(["p1_chapter_bronze", "p1_chapter_silver"]);
  savePendingLessonBadges([]); // sync wiped pending
  const { newlyClaimed, claimed } = claimPendingLessonBadges([
    "p1_chapter_bronze",
  ]);
  assert.deepEqual(newlyClaimed, ["p1_chapter_bronze"]);
  assert.ok(claimed.includes("p1_chapter_bronze"));
  assert.ok(!loadBadgeRevocations().includes("p1_chapter_bronze"));
  const tiers = highestTierByFamily(claimed, "p1");
  assert.equal(tiers.chapter, "bronze");
  assert.equal(familySlotImage("bronze"), BADGE_IMAGES.bronze);
}

// 2) Re-earn after reset must clear revocations and survive sync merge.
{
  localStorage.clear();
  resetLesson("part1", "beginner");
  assert.ok(loadBadgeRevocations().some((id) => id.startsWith("p1_")));

  const { newlyEarned } = syncBadgeAwards(["p1_chapter_bronze", "p1_freetalk_bronze"]);
  assert.deepEqual(
    newlyEarned.sort(),
    ["p1_chapter_bronze", "p1_freetalk_bronze"].sort()
  );
  assert.deepEqual(
    loadPendingLessonBadges().sort(),
    ["p1_chapter_bronze", "p1_freetalk_bronze"].sort()
  );
  assert.ok(!loadBadgeRevocations().includes("p1_chapter_bronze"));
  assert.ok(!loadBadgeRevocations().includes("p1_freetalk_bronze"));

  const afterSync = simulateSyncWipeBugFixed();
  assert.ok(afterSync.mergedPending.includes("p1_chapter_bronze"));
  assert.ok(afterSync.mergedPending.includes("p1_freetalk_bronze"));

  const claimed = claimPendingLessonBadges(afterSync.mergedPending);
  assert.equal(claimed.newlyClaimed.length, 2);
  const tiers = highestTierByFamily(claimed.claimed, "p1");
  assert.equal(tiers.chapter, "bronze");
  assert.equal(tiers.freetalk, "bronze");
  assert.equal(familySlotImage(tiers.chapter), BADGE_IMAGES.bronze);
}

// 3) Source architecture guards across dashboard / sync / award.
assert.match(dashboard, /claimPendingLessonBadges\(receivedIds\)/);
assert.match(dashboard, /queueBadgeReceipts\(loadPendingLessonBadges\(\)\)/);
assert.match(dashboard, /setActiveHomeworkLesson/);
assert.match(
  syncSrc,
  /protectedIds = new Set\(\[\.\.\.localBadges, \.\.\.localPending\]\)/
);
assert.match(badgeSrc, /saveBadgeRevocations/);
assert.match(
  readFileSync(new URL("js/lesson-engine.js", root), "utf8"),
  /うけとる is authoritative/
);
assert.doesNotMatch(
  readFileSync(new URL("js/lesson-engine.js", root), "utf8"),
  /const claimable = pending\.filter\(\(id\) => requested\.has\(id\)\)/
);

// Dual lesson-engine query strings in voice should not silently diverge forever;
// at least keep badge claim path on the parent dashboard (page1).
assert.match(voice, /lesson-engine\.js\?v=/);

console.log("Badge claim / slot display regression checks passed.");
