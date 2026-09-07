/**
 * Beginner Part 1 badge evaluation (chapter / freetalk / accuracy).
 * Awards are deterministic — do not use Gemini award_badge.
 */

import {
  getActiveLevelId,
  getActiveLessonId,
  getLesson,
  loadLessonState,
  recordLessonBadge,
  loadEarnedLessonBadges,
  saveLessonState,
} from "./lesson-engine.js";

export const BADGE_IMAGES = Object.freeze({
  bronze: "images/completion-badge-bronze.png",
  silver: "images/completion-badge-silver.png",
  gold: "images/completion-badge-gold.png",
  locked: "images/owl-locked-slot.png",
});

export const BADGE_FAMILIES = Object.freeze(["chapter", "freetalk", "accuracy"]);

export const TIER_RANK = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

/** Gate: Beginner Part 1 only. */
export function isBeginnerPart1BadgeScope(
  levelId = getActiveLevelId(),
  lessonId = getActiveLessonId()
) {
  return levelId === "beginner" && lessonId === "part1";
}

export function badgeId(family, tier) {
  return `p1_${family}_${tier}`;
}

export function parseBadgeId(id) {
  const m = String(id || "").match(/^p1_(chapter|freetalk|accuracy)_(bronze|silver|gold)$/);
  if (!m) return null;
  return { family: m[1], tier: m[2] };
}

/**
 * Scorable MCQ/quiz/final beats for Part 1 accuracy.
 * Fixed: all mcqBeats + quiz items. Final items: only those attempted (in state).
 */
export function listScorableBeats(lesson, state = null) {
  const out = [];
  const seen = new Set();
  const push = (segmentId, beatId, source) => {
    const key = `${segmentId}.${beatId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ segmentId, beatId, key, source });
  };

  for (const seg of lesson?.segments || []) {
    if (Array.isArray(seg.mcqBeats)) {
      for (const beat of seg.mcqBeats) {
        if (beat?.id) push(seg.id, beat.id, "mcq");
      }
    }
    if (seg.type === "quiz" && Array.isArray(seg.items)) {
      for (const item of seg.items) {
        if (item?.id) push(seg.id, item.id, "quiz");
      }
    }
    if (seg.type === "final_challenge" && Array.isArray(seg.items)) {
      // Final is a random subset — only count items the learner actually faced.
      if (!state) continue;
      const firstTry = state.mcqBadgeFirstTry || {};
      const summary = state.mcqSummary || {};
      for (const item of seg.items) {
        if (!item?.id) continue;
        const key = `${seg.id}.${item.id}`;
        if (!(key in firstTry) && !(key in summary)) continue;
        push(seg.id, item.id, "final");
      }
    }
  }
  return out;
}

export function computeChapterTier(state) {
  const done = new Set(state?.completedSegmentIds || []);
  if (state?.complete || done.has("ending1")) return "gold";
  if (done.has("quiz1")) return "silver";
  if (done.has("ch0")) return "bronze";
  return null;
}

export function computeFreetalkTier(count) {
  const n = Number(count) || 0;
  if (n >= 3) return "gold";
  if (n >= 2) return "silver";
  if (n >= 1) return "bronze";
  return null;
}

/**
 * Accuracy from latest-play first-try map.
 * Unattempted fixed beats count as incorrect; final only if attempted.
 */
export function computeAccuracyTier(state, lesson) {
  const beats = listScorableBeats(lesson, state);
  const firstTry = state?.mcqBadgeFirstTry || {};
  let correct = 0;
  for (const b of beats) {
    if (firstTry[b.key]?.correct === true) correct += 1;
  }
  const total = beats.length;
  const rate = total > 0 ? correct / total : 0;
  let tier = null;
  if (total > 0 && rate === 1) tier = "gold";
  else if (rate > 0.75) tier = "silver";
  else if (rate > 0.5) tier = "bronze";
  return { rate, correct, total, tier };
}

/** All tier ids unlocked up to and including `tier`. */
export function tierIdsForFamily(family, tier) {
  if (!tier || !BADGE_FAMILIES.includes(family)) return [];
  const order = ["bronze", "silver", "gold"];
  const idx = order.indexOf(tier);
  if (idx < 0) return [];
  return order.slice(0, idx + 1).map((t) => badgeId(family, t));
}

export function evaluateLessonBadges(state, lesson) {
  if (!isBeginnerPart1BadgeScope()) return [];
  const ids = [];
  const chapter = computeChapterTier(state);
  ids.push(...tierIdsForFamily("chapter", chapter));
  const freetalk = computeFreetalkTier(state?.endingFreetalkEnglishCount);
  ids.push(...tierIdsForFamily("freetalk", freetalk));
  const { tier: accuracy } = computeAccuracyTier(state, lesson);
  ids.push(...tierIdsForFamily("accuracy", accuracy));
  return [...new Set(ids)];
}

/**
 * Award any desired ids not yet earned. Returns newly earned ids.
 */
export function syncBadgeAwards(desiredIds) {
  if (!isBeginnerPart1BadgeScope()) return { newlyEarned: [] };
  const desired = [...new Set((desiredIds || []).map(String).filter(Boolean))];
  const have = new Set(loadEarnedLessonBadges());
  const newlyEarned = [];
  for (const id of desired) {
    if (have.has(id)) continue;
    recordLessonBadge(id);
    have.add(id);
    newlyEarned.push(id);
  }
  return { newlyEarned };
}

/** Evaluate current lesson state and award. */
export function evaluateAndAwardBadges() {
  if (!isBeginnerPart1BadgeScope()) return { newlyEarned: [], desired: [] };
  const state = loadLessonState();
  const lesson = getLesson("part1");
  const desired = evaluateLessonBadges(state, lesson);
  const { newlyEarned } = syncBadgeAwards(desired);
  return { newlyEarned, desired };
}

/**
 * Mark chapter play boundary for badge first-try (beginner part1 only).
 * Call when chapterPlayCounts[segmentId] is set/incremented.
 */
export function markMcqBadgePlay(segmentId, playCount, state = null) {
  if (!isBeginnerPart1BadgeScope()) return state;
  const id = String(segmentId || "").trim();
  if (!id || !(Number(playCount) > 0)) return state;
  const s = state || loadLessonState();
  s.mcqBadgePlay = { ...(s.mcqBadgePlay || {}), [id]: Number(playCount) };
  if (!state) saveLessonState(s);
  return s;
}

/**
 * Update badge first-try if this is the first click for the beat on the current play.
 * Mutates and saves state when not passed in.
 */
export function maybeRecordBadgeFirstTry(state, { segmentId, beatId, correct }) {
  if (!isBeginnerPart1BadgeScope()) return { updated: false, state };
  const seg = String(segmentId || "");
  const beat = String(beatId || "");
  if (!seg || !beat) return { updated: false, state };

  const play =
    Number(state.mcqBadgePlay?.[seg]) ||
    Number(state.chapterPlayCounts?.[seg]) ||
    1;
  const key = `${seg}.${beat}`;
  const prev = state.mcqBadgeFirstTry?.[key];
  if (prev && Number(prev.play) === play) {
    return { updated: false, state };
  }

  state.mcqBadgeFirstTry = {
    ...(state.mcqBadgeFirstTry || {}),
    [key]: {
      correct: Boolean(correct),
      play,
      at: new Date().toISOString(),
    },
  };
  return { updated: true, state };
}

/** True if text looks like an English sentence for freetalk counting. */
export function isEnglishSentence(text) {
  const t = String(text || "").trim();
  if (t.length < 3) return false;
  return /[A-Za-z]/.test(t);
}

/**
 * Increment ending freetalk English count (beginner part1, ending free-talk only).
 * Caller must ensure freeTalk phase is active.
 */
export function recordEndingFreetalkEnglish(text) {
  if (!isBeginnerPart1BadgeScope()) return { counted: false, count: 0, newlyEarned: [] };
  if (!isEnglishSentence(text)) {
    const state = loadLessonState();
    return {
      counted: false,
      count: Number(state.endingFreetalkEnglishCount) || 0,
      newlyEarned: [],
    };
  }
  const state = loadLessonState();
  const prev = Number(state.endingFreetalkEnglishCount) || 0;
  state.endingFreetalkEnglishCount = prev + 1;
  saveLessonState(state);
  const { newlyEarned } = evaluateAndAwardBadges();
  return {
    counted: true,
    count: state.endingFreetalkEnglishCount,
    newlyEarned,
  };
}

/** Highest earned tier per family from earned id list. */
export function highestTierByFamily(earnedIds) {
  const out = { chapter: null, freetalk: null, accuracy: null };
  for (const id of earnedIds || []) {
    const parsed = parseBadgeId(id);
    if (!parsed) continue;
    const rank = TIER_RANK[parsed.tier] || 0;
    const cur = out[parsed.family];
    if (!cur || rank > (TIER_RANK[cur] || 0)) out[parsed.family] = parsed.tier;
  }
  return out;
}

export function familySlotImage(tier) {
  if (tier === "bronze" || tier === "silver" || tier === "gold") {
    return BADGE_IMAGES[tier];
  }
  return BADGE_IMAGES.locked;
}

export const FAMILY_LABELS_JA = Object.freeze({
  chapter: { label: "チャプター", desc: "章をクリアするとランクアップ" },
  freetalk: { label: "フリートーク", desc: "おしまいの英会話でランクアップ" },
  accuracy: { label: "せいとうりつ", desc: "4択のいちばんさいしょの正解率" },
});
