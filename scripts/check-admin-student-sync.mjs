#!/usr/bin/env node
/**
 * Guard: the admin 学習進捗 panel shows the same progress the student sees.
 * - Per-part learned phrases match the child's 「覚えたフレーズ」 list (incl. Part 3).
 * - The cloud merge never truncates phrases the child still sees locally.
 * - The beginner snapshot synced to Firestore carries Part 3.
 */
import assert from "node:assert/strict";
import { register } from "node:module";

const firestoreStub = `
const noop = () => ({});
export const collection = noop, addDoc = noop, getDocs = noop, query = noop,
  orderBy = noop, limit = noop, doc = noop, updateDoc = noop, writeBatch = noop,
  increment = noop, serverTimestamp = noop, getDoc = noop;
`;
register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("https://www.gstatic.com/")) {
    return { url: "stub:firestore", shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === "stub:firestore") {
    return { format: "module", source: ${JSON.stringify(firestoreStub)}, shortCircuit: true };
  }
  return next(url, context);
}
`)
);

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
  dispatchEvent() {},
};
globalThis.CustomEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

const engine = await import("../js/lesson-engine.js");
const admin = await import("../js/admin-progress.js");
const display = await import("../js/phrase-display.js");
const { lessonFor } = await import("../js/lessons/lesson-catalog.js");

// 1. Admin per-part phrase list === the child's list (same rows, same gloss).
const part1 = {
  phrasesSpoken: ["I need glass.", "beach", "I made blue glass!"],
  memories: { searchPlace: "mountains" },
  mcqLog: [],
};
const part3 = {
  phrasesSpoken: ["I'm Taro.", "This is my aquarium.", "The glass is blue."],
  memories: { name: "Taro", glassColor: "blue" },
};
for (const [partKey, part] of [
  ["part1", part1],
  ["part3", part3],
]) {
  const lesson = lessonFor("beginner", partKey);
  const childRows = display
    .phrasesForChildDisplay(part, {
      reconcileSearchPlace: partKey === "part1",
    })
    .map((p) => display.phraseRowForDisplay(p, partKey));
  assert.deepEqual(
    admin.learnedPhrasesForPart(part, lesson, partKey),
    childRows,
    `${partKey}: admin phrases must match the child's list`
  );
}
// Part 1 reconciles the stale "beach" row to the chosen place, like the child view.
assert.deepEqual(
  admin
    .learnedPhrasesForPart(part1, lessonFor("beginner", "part1"), "part1")
    .map((r) => r.english),
  ["I need glass.", "mountains", "I made blue glass!"]
);
// Part 3 phrases (personalised, no catalog targets) are visible with their gloss.
const p3Rows = admin.learnedPhrasesForPart(part3, lessonFor("beginner", "part3"), "part3");
assert.equal(p3Rows.length, 3);
assert.equal(p3Rows[0].japanese, "わたしは Taro です");

// 2. Cloud merge keeps every phrase the child can still see (no 80-row cut).
const many = Array.from({ length: 150 }, (_, i) => `Phrase ${i}`);
localStorage.setItem(
  "gc_hw_beginner_part1_state",
  JSON.stringify({ ...engine.emptyState("part1"), phrasesSpoken: many, segmentIndex: 3 })
);
const merged = engine.resolvePartForSync("part1", "beginner", {
  phrasesSpoken: ["Phrase 0"],
  segmentIndex: 1,
});
assert.equal(merged.phrasesSpoken.length, 150);
assert.equal(engine.PHRASES_SPOKEN_MAX, 200);

// 3. The beginner snapshot synced to Firestore includes Part 3 + its reporting.
const snapshot = engine.buildProgressSnapshot("beginner", {});
assert.ok(snapshot.part3, "snapshot.part3 missing");
assert.ok(snapshot.reporting.part3, "snapshot.reporting.part3 missing");
assert.equal(typeof snapshot.part3Complete, "boolean");

// 4. Admin renders the learned-phrase block for every beginner part.
const html = admin.renderProgressDashboard([
  {
    id: "u1",
    displayName: "Taro",
    email: "t@example.com",
    remainingTime: 600,
    beginnerProgress: { part1, part2: {}, part3 },
  },
]);
assert.equal((html.match(/生徒画面の「覚えたフレーズ」/g) || []).length, 3);
assert.match(html, /This is my aquarium\./);

console.log("check-admin-student-sync: ok");
