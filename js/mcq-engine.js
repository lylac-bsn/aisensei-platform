/**
 * 4-option MCQ beats for Part 1 chapters (excludes free-talk segments/beats).
 * Stats persist in lesson state for admin analysis.
 */

import { loadLessonState, saveLessonState, getCurrentSegment } from "./lesson-engine.js";
import {
  isBeginnerPart1BadgeScope,
  maybeRecordBadgeFirstTry,
  evaluateAndAwardBadges,
} from "./badge-engine.js";

/** @typedef {{
 *   id: string,
 *   learnyEn: string,
 *   learnyJa: string,
 *   choices: string[],
 *   answer: string,
 *   patterns?: string[],
 *   memoryKey?: string,
 *   memoryFromChoice?: boolean,
 *   completeSegmentOnCorrect?: boolean,
 * }} McqBeat */

export function normalizeMcqChoice(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!.。！]+$/g, "")
    .replace(/\s+/g, " ");
}

/** Soften button labels — trailing periods look stiff for kids. Keep ! */
export function formatChoiceLabel(text) {
  return String(text || "")
    .trim()
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ");
}

/** Fisher–Yates shuffle (copy). */
export function shuffleChoices(choices) {
  const arr = (choices || []).map((c) => String(c));
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Stable shuffle for one beat while it is on screen (re-renders keep the same order). */
const choiceOrderCache = new Map();

export function getShuffledChoiceLabels(cacheKey, labels) {
  const key = String(cacheKey || "");
  const list = (labels || []).map((c) => String(c));
  if (!key || !list.length) return list;
  const fingerprint = list.join("\u0001");
  const cached = choiceOrderCache.get(key);
  if (cached && cached.fingerprint === fingerprint) return cached.labels;
  const shuffled = shuffleChoices(list);
  choiceOrderCache.set(key, { fingerprint, labels: shuffled });
  return shuffled;
}

export function clearShuffledChoiceCache(prefix = "") {
  if (!prefix) {
    choiceOrderCache.clear();
    return;
  }
  const p = String(prefix);
  for (const key of [...choiceOrderCache.keys()]) {
    if (key === p || key.startsWith(`${p}:`)) choiceOrderCache.delete(key);
  }
}

export function isMcqCorrect(choice, beat) {
  if (!beat) return false;
  const n = normalizeMcqChoice(choice);
  if (Array.isArray(beat.acceptAnyOf) && beat.acceptAnyOf.length) {
    return beat.acceptAnyOf.some((p) => n.includes(normalizeMcqChoice(p)) || normalizeMcqChoice(p) === n);
  }
  const ans = normalizeMcqChoice(beat.answer);
  if (n === ans) return true;
  const patterns = beat.patterns || [];
  return patterns.some((p) => n.includes(normalizeMcqChoice(p)));
}

export function getSegmentMcqBeats(segment = getCurrentSegment()) {
  if (!segment?.mcqBeats?.length) return [];
  return segment.mcqBeats;
}

export function loadMcqCursor(segmentId) {
  const state = loadLessonState();
  const map = state.mcqCursor || {};
  return Number(map[segmentId]) || 0;
}

export function setMcqCursor(segmentId, index) {
  const state = loadLessonState();
  state.mcqCursor = { ...(state.mcqCursor || {}), [segmentId]: Math.max(0, index) };
  saveLessonState(state);
  clearShuffledChoiceCache(segmentId);
  return state.mcqCursor[segmentId];
}

export function resetMcqCursor(segmentId) {
  return setMcqCursor(segmentId, 0);
}

export function getCurrentMcqBeat(segment = getCurrentSegment(), { unlocked = {} } = {}) {
  const beats = getSegmentMcqBeats(segment);
  if (!beats.length) return null;
  let idx = loadMcqCursor(segment.id);
  if (idx < 0) idx = 0;
  if (idx >= beats.length) return null;
  const beat = beats[idx];
  if (beat.afterFreeTalk && !unlocked.freeTalk) return null;
  if (beat.afterFreeAsk && !unlocked.freeAsk) return null;
  return { beat, index: idx, total: beats.length };
}

/** Advance cursor after a correct answer. Returns { done, nextBeat }. */
export function advanceMcqCursor(segmentId, beatsLength) {
  const next = loadMcqCursor(segmentId) + 1;
  setMcqCursor(segmentId, next);
  if (next >= beatsLength) return { done: true, nextIndex: next };
  return { done: false, nextIndex: next };
}

export function mcqBeatsRemaining(segment = getCurrentSegment()) {
  const beats = getSegmentMcqBeats(segment);
  if (!beats.length) return 0;
  return Math.max(0, beats.length - loadMcqCursor(segment.id));
}

/**
 * Record one MCQ attempt into lesson state + return event payload for Firestore.
 */
export function recordMcqAttempt({
  segmentId,
  beatId,
  learnyPrompt = "",
  choice = "",
  correct = false,
  choices = [],
  answer = "",
}) {
  const state = loadLessonState();
  const at = new Date().toISOString();
  const entry = {
    segmentId: String(segmentId || ""),
    beatId: String(beatId || ""),
    learnyPrompt: String(learnyPrompt || "").slice(0, 200),
    choice: String(choice || "").slice(0, 120),
    correct: Boolean(correct),
    answer: String(answer || "").slice(0, 120),
    choices: (choices || []).slice(0, 4).map((c) => String(c).slice(0, 80)),
    at,
  };

  state.mcqLog = [...(state.mcqLog || []), entry].slice(-400);

  const key = `${entry.segmentId}.${entry.beatId}`;
  const summary = { ...(state.mcqSummary || {}) };
  const row = summary[key] || {
    segmentId: entry.segmentId,
    beatId: entry.beatId,
    correct: 0,
    incorrect: 0,
    attempts: 0,
    choiceCounts: {},
  };
  row.attempts += 1;
  if (correct) row.correct += 1;
  else row.incorrect += 1;
  const ck = entry.choice || "(blank)";
  row.choiceCounts[ck] = (row.choiceCounts[ck] || 0) + 1;
  row.lastChoice = entry.choice;
  row.lastCorrect = correct;
  row.lastAt = at;
  summary[key] = row;
  state.mcqSummary = summary;

  // Feed admin phrase checklist — correct taps count as spoken phrases.
  if (correct) {
    const spoken = String(entry.answer || entry.choice || "").trim();
    if (spoken) {
      const list = Array.isArray(state.phrasesSpoken) ? state.phrasesSpoken.slice() : [];
      if (!list.some((p) => String(typeof p === "string" ? p : p?.english || "").trim() === spoken)) {
        list.push(spoken);
        state.phrasesSpoken = list.slice(-200);
      }
    }
  }

  let newlyEarned = [];
  if (isBeginnerPart1BadgeScope()) {
    const play =
      Number(state.mcqBadgePlay?.[entry.segmentId]) ||
      Number(state.chapterPlayCounts?.[entry.segmentId]) ||
      0;
    if (!(play > 0)) {
      state.mcqBadgePlay = {
        ...(state.mcqBadgePlay || {}),
        [entry.segmentId]: Number(state.chapterPlayCounts?.[entry.segmentId]) || 1,
      };
    }
    maybeRecordBadgeFirstTry(state, {
      segmentId: entry.segmentId,
      beatId: entry.beatId,
      correct,
    });
    saveLessonState(state);
    newlyEarned = evaluateAndAwardBadges().newlyEarned || [];
    if (newlyEarned.length) {
      try {
        window.dispatchEvent(
          new CustomEvent("learny-badges-earned", { detail: { newlyEarned } })
        );
        window.parent?.postMessage?.(
          { type: "gc_badges_earned", newlyEarned },
          "*"
        );
      } catch {
        // ignore
      }
    }
  } else {
    saveLessonState(state);
  }

  return {
    type: correct ? "mcq_correct" : "mcq_incorrect",
    level: null,
    questTitle: `${entry.segmentId}/${entry.beatId}`,
    segmentId: entry.segmentId,
    beatId: entry.beatId,
    choice: entry.choice,
    answer: entry.answer,
    correct,
    learnyPrompt: entry.learnyPrompt,
    attempt: row.attempts,
    source: "client",
    newlyEarned,
  };
}

export function summarizeMcqForAdmin(mcqSummary = {}) {
  const rows = Object.values(mcqSummary || {});
  let correct = 0;
  let incorrect = 0;
  let attempts = 0;
  for (const r of rows) {
    correct += Number(r.correct) || 0;
    incorrect += Number(r.incorrect) || 0;
    attempts += Number(r.attempts) || 0;
  }
  return { correct, incorrect, attempts, beatsTouched: rows.length };
}
