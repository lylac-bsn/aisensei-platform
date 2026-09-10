/**
 * Shared badge evaluation (chapter / freetalk / accuracy).
 * Awards are deterministic — do not use Gemini award_badge.
 */

import {
  getActiveLevelId,
  getActiveLessonId,
  getLesson,
  loadLessonState,
  loadEarnedLessonBadges,
  loadPendingLessonBadges,
  loadBadgeRevocations,
  savePendingLessonBadges,
  saveBadgeRevocations,
  saveLessonState,
} from "./lesson-engine.js?v=20260910-ch6-mcq-show-2";

export const BADGE_IMAGES = Object.freeze({
  bronze: "images/completion-badge-bronze.png",
  silver: "images/completion-badge-silver.png",
  gold: "images/completion-badge-gold.png",
  locked: "images/owl-locked-slot.png",
});

export const BADGE_FAMILIES = Object.freeze(["chapter", "freetalk", "accuracy"]);

export const TIER_RANK = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

/** Every lesson using the cloned Beginner Part 1 architecture supports badges. */
export function isBadgeEnabledScope(
  levelId = getActiveLevelId(),
  lessonId = getActiveLessonId()
) {
  return getLesson(lessonId, levelId)?.architecture === "beginner-part1-v1";
}

export function badgeId(
  family,
  tier,
  lesson = getLesson(getActiveLessonId(), getActiveLevelId())
) {
  return `${lesson.badgePrefix}_${family}_${tier}`;
}

export function badgePrefixForScope(
  levelId = getActiveLevelId(),
  lessonId = getActiveLessonId()
) {
  return getLesson(lessonId, levelId)?.badgePrefix || "";
}

export function parseBadgeId(id) {
  const m = String(id || "").match(
    /^(.*?)_(chapter|freetalk|accuracy)_(bronze|silver|gold)$/
  );
  if (!m) return null;
  return { prefix: m[1], family: m[2], tier: m[3] };
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
      // Final is a random subset — only count items faced on the current play.
      if (!state) continue;
      const firstTry = state.mcqBadgeFirstTry || {};
      const summary = state.mcqSummary || {};
      const currentPlay =
        Number(state.mcqBadgePlay?.[seg.id]) ||
        Number(state.chapterPlayCounts?.[seg.id]) ||
        0;
      for (const item of seg.items) {
        if (!item?.id) continue;
        const key = `${seg.id}.${item.id}`;
        const entry = firstTry[key];
        const facedOnCurrentPlay =
          entry &&
          (!(currentPlay > 0) || Number(entry.play) === currentPlay);
        // Keep pre-play-id legacy data readable until the chapter is replayed.
        const legacyFaced = !(currentPlay > 0) && key in summary;
        if (!facedOnCurrentPlay && !legacyFaced) continue;
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
 * Accuracy from best first-try across plays (いっぱつせいかい).
 * A beat counts once the learner gets first-click correct on ANY play of its
 * chapter — later replays can raise the rank; a bad later play does not erase
 * a clean earlier play. Unattempted fixed beats count as incorrect; final only
 * if attempted.
 */
export function resolveBestFirstTryMap(state) {
  const best = {};
  for (const [key, value] of Object.entries(state?.mcqBadgeFirstTryBest || {})) {
    if (value === true) best[key] = true;
  }
  for (const [key, entry] of Object.entries(state?.mcqBadgeFirstTry || {})) {
    if (entry?.correct === true) best[key] = true;
  }
  // Lifetime log backup: first click per (beat, play). Survives map wipe races.
  const seenPlay = new Set();
  for (const event of state?.mcqLog || []) {
    const segmentId = String(event?.segmentId || "").trim();
    const beatId = String(event?.beatId || "").trim();
    if (!segmentId || !beatId) continue;
    const key = `${segmentId}.${beatId}`;
    const play = Number(event.playId ?? event.play) || 0;
    const stamp = `${key}|${play}`;
    if (seenPlay.has(stamp)) continue;
    seenPlay.add(stamp);
    if (event.correct === true) best[key] = true;
  }
  return best;
}

export function computeAccuracyTier(state, lesson) {
  const beats = listScorableBeats(lesson, state);
  const best = resolveBestFirstTryMap(state);
  let correct = 0;
  for (const b of beats) {
    if (best[b.key] === true) correct += 1;
  }
  const total = beats.length;
  const rate = total > 0 ? correct / total : 0;
  let tier = null;
  if (total > 0 && rate === 1) tier = "gold";
  else if (rate > 0.75) tier = "silver";
  else if (rate > 0.5) tier = "bronze";
  return { rate, correct, total, tier };
}

/**
 * Whether a completed segment still has beats that have never been first-click
 * correct on any play (and accuracy can still rank up).
 */
export function segmentNeedsAccuracyReplay(
  state,
  lesson,
  segmentId,
  { earnedAccuracyTier = null } = {}
) {
  const id = String(segmentId || "").trim();
  if (
    !id ||
    lesson?.architecture !== "beginner-part1-v1" ||
    earnedAccuracyTier === "gold" ||
    !(state?.completedSegmentIds || []).includes(id)
  ) {
    return false;
  }

  const best = resolveBestFirstTryMap(state);
  return listScorableBeats(lesson, state).some((beat) => {
    if (beat.segmentId !== id) return false;
    return best[beat.key] !== true;
  });
}

/** All tier ids unlocked up to and including `tier`. */
export function tierIdsForFamily(family, tier, lesson) {
  if (!tier || !BADGE_FAMILIES.includes(family)) return [];
  const order = ["bronze", "silver", "gold"];
  const idx = order.indexOf(tier);
  if (idx < 0) return [];
  return order.slice(0, idx + 1).map((t) => badgeId(family, t, lesson));
}

export function evaluateLessonBadges(state, lesson) {
  if (lesson?.architecture !== "beginner-part1-v1") return [];
  const ids = [];
  const chapter = computeChapterTier(state);
  ids.push(...tierIdsForFamily("chapter", chapter, lesson));
  const freetalk = computeFreetalkTier(state?.endingFreetalkEnglishCount);
  ids.push(...tierIdsForFamily("freetalk", freetalk, lesson));
  const { tier: accuracy } = computeAccuracyTier(state, lesson);
  ids.push(...tierIdsForFamily("accuracy", accuracy, lesson));
  return [...new Set(ids)];
}

/**
 * Award any desired ids not yet claimed/pending. Returns newly pending ids.
 * Re-earn after 「最初から」 clears wipe revocations so sync cannot delete
 * awaiting うけとる receipts.
 */
export function syncBadgeAwards(desiredIds) {
  if (!isBadgeEnabledScope()) return { newlyEarned: [] };
  const desired = [...new Set((desiredIds || []).map(String).filter(Boolean))];
  const claimed = new Set(loadEarnedLessonBadges());
  const pending = new Set(loadPendingLessonBadges());
  const newlyPending = [];
  for (const id of desired) {
    if (claimed.has(id) || pending.has(id)) continue;
    pending.add(id);
    newlyPending.push(id);
  }
  if (newlyPending.length) {
    savePendingLessonBadges([...pending]);
    const revoked = loadBadgeRevocations();
    if (revoked.length) {
      const keepPending = new Set(pending);
      saveBadgeRevocations(revoked.filter((id) => !keepPending.has(id)));
    }
  }
  // Keep the legacy result key because it drives the receipt ceremony.
  return { newlyEarned: newlyPending, newlyPending };
}

/** Evaluate current lesson state and award. */
export function evaluateAndAwardBadges() {
  if (!isBadgeEnabledScope()) return { newlyEarned: [], desired: [] };
  const state = loadLessonState();
  const lesson = getLesson(getActiveLessonId(), getActiveLevelId());
  const desired = evaluateLessonBadges(state, lesson);
  const { newlyEarned } = syncBadgeAwards(desired);
  return { newlyEarned, desired };
}

/**
 * Mark chapter play boundary for badge first-try.
 * Call when chapterPlayCounts[segmentId] is set/incremented.
 */
export function markMcqBadgePlay(segmentId, playCount, state = null) {
  if (!isBadgeEnabledScope()) return state;
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
  if (!isBadgeEnabledScope()) return { updated: false, state };
  const seg = String(segmentId || "");
  const beat = String(beatId || "");
  if (!seg || !beat) return { updated: false, state };

  const play = Math.max(
    Number(state.mcqBadgePlay?.[seg]) || 0,
    Number(state.chapterPlayCounts?.[seg]) || 0,
    1
  );
  const key = `${seg}.${beat}`;
  const prev = state.mcqBadgeFirstTry?.[key];
  if (prev && Number(prev.play) === play) {
    // Same play: first click is locked, but promote sticky best if this click
    // somehow arrives as the recorded first-try correct (already handled above).
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
  if (correct) {
    state.mcqBadgeFirstTryBest = {
      ...(state.mcqBadgeFirstTryBest || {}),
      [key]: true,
    };
  }
  return { updated: true, state };
}

/** True if text looks like an English sentence for freetalk counting. */
export function isEnglishSentence(text) {
  const t = String(text || "").trim();
  if (t.length < 3) return false;
  return /[A-Za-z]/.test(t);
}

/**
 * Increment ending free-talk English count for the active lesson.
 * Caller must ensure freeTalk phase is active.
 */
export function recordEndingFreetalkEnglish(text) {
  if (!isBadgeEnabledScope()) return { counted: false, count: 0, newlyEarned: [] };
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
  const playId =
    Number(state.mcqBadgePlay?.ending1) ||
    Number(state.chapterPlayCounts?.ending1) ||
    1;
  state.endingFreetalkEnglishByPlay = {
    ...(state.endingFreetalkEnglishByPlay || {}),
    [playId]:
      (Number(state.endingFreetalkEnglishByPlay?.[playId]) || 0) + 1,
  };
  saveLessonState(state);
  const { newlyEarned } = evaluateAndAwardBadges();
  return {
    counted: true,
    count: state.endingFreetalkEnglishCount,
    newlyEarned,
  };
}

/** Highest earned tier per family from earned id list. */
export function highestTierByFamily(earnedIds, badgePrefix = null) {
  const out = { chapter: null, freetalk: null, accuracy: null };
  for (const id of earnedIds || []) {
    const parsed = parseBadgeId(id);
    if (!parsed) continue;
    if (badgePrefix && parsed.prefix !== badgePrefix) continue;
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
  accuracy: {
    label: "いっぱつせいかい",
    desc: "4択を各章でさいしょの1かいで正解するとランクアップ（やりなおしOK）",
  },
});
