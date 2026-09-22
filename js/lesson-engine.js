import { PART1_ELICIT_JA, CH6_BEAT1_SPEAK } from "./lessons/aquarium-part1.js?v=20260921-retry-variety";
import {
  PART2_ELICIT_JA,
  PART2_CH1_BEAT1_SPEAK,
  PART2_CH2_BEAT1_SPEAK,
  PART2_CH3_BEAT1_SPEAK,
  PART2_CH4_BEAT1_SPEAK,
  PART2_CH5_BEAT1_SPEAK,
  PART2_CH6_BEAT1_SPEAK,
} from "./lessons/aquarium-part2.js?v=20260922-part2-intro-tts";
import { lessonFor, allLessons } from "./lessons/lesson-catalog.js?v=20260921-ending-autostart";
import { normalizeAllowedFavoriteColor } from "./mcq-audio-config.js?v=20260916-part2-audio";
import {
  buildPartReporting,
  normalizeIdList,
  PROGRESS_CONTRACT_VERSION,
} from "./progress-contract.js?v=20260916-part2-full";

const LEVEL_META = {
  beginner: { id: "beginner", headerLabel: "ビギナー", firestoreField: "beginnerProgress" },
  intermediate: {
    id: "intermediate",
    headerLabel: "中級",
    firestoreField: "intermediateProgress",
  },
  advanced: { id: "advanced", headerLabel: "上級", firestoreField: "advancedProgress" },
};

export const LESSON_BADGES_KEY = "gc_homework_lessonBadges";
export const PENDING_LESSON_BADGES_KEY = "gc_homework_pendingLessonBadges";
export const BADGE_REVOCATIONS_KEY = "gc_hw_badge_revocations";

let learnerDisplayName = "";

export function setLearnerDisplayName(name) {
  learnerDisplayName = String(name || "").trim();
}

export function getLearnerJaName() {
  const raw = learnerDisplayName;
  if (!raw) return "きみ";
  if (/さん$/.test(raw)) return raw;
  return raw + "さん";
}

export function daily1OpenSpeak(name = getLearnerJaName()) {
  return `Oh by the way, do you have a favourite animal? そういえば、${name}は すきな どうぶつとか いるの？`;
}

/** Part 2 daily1 opens with food question instead of animal. */
export function daily1OpenSpeakPart2(name = getLearnerJaName()) {
  return `Oh by the way, ${name}, what did you eat today? そういえば、${name}は きょう なにを たべたの？`;
}

export function daily1BackToTankSpeak() {
  return "Nice! Now let's get back to the tank! いいね！じゃあ すいそう つくりに もどろう！";
}

/** Part 2 uses "aquarium" instead of "tank" in bridge. */
export function daily1BackToAquariumSpeak() {
  return "Nice! Now let's get back to your aquarium! いいね！じゃあ すいぞくかんの はなしに もどろう！";
}

/** Closing Daily English turn: react to their last words, then the exact bridge. */
export function daily1BridgeTurnInstruction(userText = "") {
  const t = String(userText || "").trim();
  const quote = t ? `"${t.slice(0, 40)}"` : "their last words";
  const bridge = usesBeginnerPart2Architecture()
    ? daily1BackToAquariumSpeak()
    : daily1BackToTankSpeak();
  const bridgeLabel = usesBeginnerPart2Architecture() ? "back-to-aquarium" : "back-to-tank";
  return (
    "ONE turn REQUIRED shape: (1) FIRST a short specific reaction that names what they just said (" +
    quote +
    ") — e.g. Curry! / かれー！ / Yummy! — NOT bare Nice alone; " +
    "(2) THEN in the SAME turn speak EXACTLY: " +
    bridge +
    " FORBIDDEN: starting with / only saying the " +
    bridgeLabel +
    " line with no reaction to their last words. " +
    "FORBIDDEN: any NEW everyday question (Was it…? / Do you…? / だった？) in this turn — reaction + bridge ONLY, then WAIT."
  );
}

export function final1OpenSpeak() {
  if (usesBeginnerPart2Architecture()) {
    return "Final challenge time! Let's go! さいごの ちゃれんじだよ！れっつごー！";
  }
  return "Final challenge time! Let's go! さいごのチャレンジだよ！レッツゴー！";
}

function resolveLevelId() {
  try {
    const fromGlobal =
      (typeof window !== "undefined" && window.GC_LEVEL) || globalThis.GC_LEVEL;
    if (fromGlobal && LEVEL_META[fromGlobal]) return fromGlobal;
  } catch {
    // ignore
  }
  return "beginner";
}

function resolveLessonId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("lesson");
    if (fromQuery === "part1" || fromQuery === "part2") return fromQuery;
    const fromGlobal =
      (typeof window !== "undefined" && window.GC_LESSON) || globalThis.GC_LESSON;
    if (fromGlobal === "part1" || fromGlobal === "part2") return fromGlobal;
  } catch {
    // ignore
  }
  return "part1";
}

export const ACTIVE_LEVEL_ID = resolveLevelId();
export const ACTIVE_LESSON_ID = resolveLessonId();

export function getActiveLevelId() {
  return ACTIVE_LEVEL_ID;
}

export function getActiveLessonId() {
  return ACTIVE_LESSON_ID;
}

export function getActiveLevelInfo() {
  return LEVEL_META[ACTIVE_LEVEL_ID];
}

export function getLesson(
  lessonId = ACTIVE_LESSON_ID,
  levelId = ACTIVE_LEVEL_ID
) {
  return lessonFor(levelId, lessonId);
}

export function getActiveLesson() {
  return getLesson(ACTIVE_LESSON_ID, ACTIVE_LEVEL_ID);
}

export function usesBeginnerPart1Architecture(
  lessonId = ACTIVE_LESSON_ID,
  levelId = ACTIVE_LEVEL_ID
) {
  return getLesson(lessonId, levelId)?.architecture === "beginner-part1-v1";
}

export function usesBeginnerPart2Architecture(
  lessonId = ACTIVE_LESSON_ID,
  levelId = ACTIVE_LEVEL_ID
) {
  return getLesson(lessonId, levelId)?.architecture === "beginner-part2-v1";
}

/** Returns true for any beginner architecture (Part 1 or Part 2). */
export function usesBeginnerArchitecture(
  lessonId = ACTIVE_LESSON_ID,
  levelId = ACTIVE_LEVEL_ID
) {
  const arch = getLesson(lessonId, levelId)?.architecture;
  return arch === "beginner-part1-v1" || arch === "beginner-part2-v1";
}

function storageKey(lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  return `gc_hw_${levelId}_${lessonId}_state`;
}

function part1CompleteKey(levelId = ACTIVE_LEVEL_ID) {
  return `gc_hw_${levelId}_part1_complete`;
}

export function emptyState(lessonId = ACTIVE_LESSON_ID) {
  return {
    lessonId,
    segmentIndex: 0,
    completedSegmentIds: [],
    memories: {},
    phrasesSpoken: [],
    badges: [],
    complete: false,
    mcqCursor: {},
    mcqLog: [],
    mcqSummary: {},
    /** In-chapter UI state (e.g. Ch2 free-talk phase) for reconnect resume. */
    segmentUi: {},
    /** How many times the learner started each chapter (jump + natural entry). */
    chapterPlayCounts: {},
    /** Play id used for badge first-try overwrite on chapter retry. */
    mcqBadgePlay: {},
    /** Latest-play first click result per seg.beat for accuracy badges. */
    mcqBadgeFirstTry: {},
    /** Sticky: beat ever first-click correct on any play (いっぱつせいかい). */
    mcqBadgeFirstTryBest: {},
    /** English sentences spoken during ending free-talk only. */
    endingFreetalkEnglishCount: 0,
    /** Ending free-talk sentence counts keyed by ending chapter play id. */
    endingFreetalkEnglishByPlay: {},
    /** Frozen totals from the most recently completed ending. */
    endingFreetalkFinalEnglishCount: 0,
    endingFreetalkFinalRunEnglishCount: 0,
  };
}

/** Drop legacy star-system fields from persisted lesson state. */
function sanitizeLessonState(raw, lessonId) {
  const { stars: _stars, ...rest } = raw && typeof raw === "object" ? raw : {};
  const state = { ...emptyState(lessonId), ...rest, lessonId };
  const objectOrEmpty = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  state.completedSegmentIds = normalizeIdList(state.completedSegmentIds);
  state.phrasesSpoken = Array.isArray(state.phrasesSpoken)
    ? state.phrasesSpoken
    : [];
  state.badges = normalizeIdList(state.badges);
  state.mcqCursor = objectOrEmpty(state.mcqCursor);
  state.mcqLog = Array.isArray(state.mcqLog) ? state.mcqLog : [];
  state.mcqSummary = objectOrEmpty(state.mcqSummary);
  state.segmentUi = objectOrEmpty(state.segmentUi);
  state.chapterPlayCounts = objectOrEmpty(state.chapterPlayCounts);
  state.mcqBadgePlay = objectOrEmpty(state.mcqBadgePlay);
  state.mcqBadgeFirstTry = objectOrEmpty(state.mcqBadgeFirstTry);
  state.mcqBadgeFirstTryBest = objectOrEmpty(state.mcqBadgeFirstTryBest);
  state.endingFreetalkEnglishByPlay = objectOrEmpty(
    state.endingFreetalkEnglishByPlay
  );
  state.endingFreetalkEnglishCount = Math.max(
    0,
    Number(state.endingFreetalkEnglishCount) || 0
  );
  state.endingFreetalkFinalEnglishCount = Math.max(
    0,
    Number(state.endingFreetalkFinalEnglishCount) || 0
  );
  state.endingFreetalkFinalRunEnglishCount = Math.max(
    0,
    Number(state.endingFreetalkFinalRunEnglishCount) || 0
  );
  return state;
}

export function loadLessonState(lessonId = ACTIVE_LESSON_ID) {
  try {
    const raw = localStorage.getItem(storageKey(lessonId));
    if (!raw) return emptyState(lessonId);
    return sanitizeLessonState(JSON.parse(raw), lessonId);
  } catch {
    return emptyState(lessonId);
  }
}

/** Never let a stale parent/iframe write shrink chapter play ids (badge replay). */
function mergeMaxCountMap(primary = {}, secondary = {}) {
  const out = { ...secondary };
  for (const [key, value] of Object.entries(primary || {})) {
    out[key] = Math.max(Number(out[key]) || 0, Number(value) || 0);
  }
  for (const [key, value] of Object.entries(secondary || {})) {
    out[key] = Math.max(Number(out[key]) || 0, Number(value) || 0);
  }
  return out;
}

function mergeFirstTryMaps(incoming = {}, existing = {}) {
  const out = { ...existing };
  for (const [key, entry] of Object.entries(incoming || {})) {
    if (!entry || typeof entry !== "object") continue;
    const prev = out[key];
    if (!prev || typeof prev !== "object") {
      out[key] = entry;
      continue;
    }
    const prevPlay = Number(prev.play) || 0;
    const nextPlay = Number(entry.play) || 0;
    // Newer play overwrites; same play keeps the first click already stored.
    if (nextPlay > prevPlay) out[key] = entry;
  }
  return out;
}

function mergeBestFirstTryMaps(incoming = {}, existing = {}) {
  const out = { ...existing };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value === true || existing?.[key] === true) out[key] = true;
  }
  for (const [key, value] of Object.entries(existing || {})) {
    if (value === true) out[key] = true;
  }
  return out;
}

/** True when a part snapshot has any learner progress worth preserving. */
export function partHasProgress(part) {
  if (!part || typeof part !== "object") return false;
  return (
    Boolean(part.complete) ||
    (Array.isArray(part.completedSegmentIds) &&
      part.completedSegmentIds.length > 0) ||
    (Array.isArray(part.mcqLog) && part.mcqLog.length > 0) ||
    Object.keys(part.chapterPlayCounts || {}).length > 0 ||
    Object.keys(part.mcqBadgeFirstTry || {}).length > 0 ||
    Object.keys(part.mcqBadgeFirstTryBest || {}).length > 0 ||
    (Array.isArray(part.phrasesSpoken) && part.phrasesSpoken.length > 0) ||
    Number(part.endingFreetalkEnglishCount) > 0 ||
    Number(part.segmentIndex) > 0
  );
}

function mergeMcqLogs(localLog, cloudLog) {
  const seen = new Set();
  const out = [];
  for (const event of [
    ...(Array.isArray(cloudLog) ? cloudLog : []),
    ...(Array.isArray(localLog) ? localLog : []),
  ]) {
    if (!event || typeof event !== "object") continue;
    const key = [
      event.segmentId,
      event.beatId,
      event.playId,
      event.at,
      event.correct,
      event.choice || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out.slice(-2500);
}

/**
 * Resolve one part for Firestore sync.
 * Missing localStorage key → keep cloud (never wipe Part 2 from a Part-1-only device).
 * Present key (including intentional reset to empty) → local wins as base, with sticky merges.
 */
export function resolvePartForSync(lessonId, levelId, cloudPart) {
  let raw = null;
  try {
    raw = localStorage.getItem(storageKey(lessonId, levelId));
  } catch {
    raw = null;
  }
  const cloud = sanitizeLessonState(cloudPart || {}, lessonId);
  if (raw == null) return cloud;
  let local;
  try {
    local = sanitizeLessonState(JSON.parse(raw), lessonId);
  } catch {
    return cloud;
  }
  if (!partHasProgress(cloud)) return local;
  if (!partHasProgress(local)) return local;
  return {
    ...local,
    complete: Boolean(local.complete || cloud.complete),
    completedSegmentIds: normalizeIdList([
      ...(cloud.completedSegmentIds || []),
      ...(local.completedSegmentIds || []),
    ]),
    phrasesSpoken: [
      ...new Set([
        ...(Array.isArray(cloud.phrasesSpoken) ? cloud.phrasesSpoken : []),
        ...(Array.isArray(local.phrasesSpoken) ? local.phrasesSpoken : []),
      ]),
    ].slice(-80),
    chapterPlayCounts: mergeMaxCountMap(
      local.chapterPlayCounts,
      cloud.chapterPlayCounts
    ),
    mcqBadgePlay: mergeMaxCountMap(local.mcqBadgePlay, cloud.mcqBadgePlay),
    mcqBadgeFirstTry: mergeFirstTryMaps(
      local.mcqBadgeFirstTry,
      cloud.mcqBadgeFirstTry
    ),
    mcqBadgeFirstTryBest: mergeBestFirstTryMaps(
      local.mcqBadgeFirstTryBest,
      cloud.mcqBadgeFirstTryBest
    ),
    mcqLog: mergeMcqLogs(local.mcqLog, cloud.mcqLog),
    endingFreetalkEnglishCount: Math.max(
      Number(local.endingFreetalkEnglishCount) || 0,
      Number(cloud.endingFreetalkEnglishCount) || 0
    ),
    endingFreetalkFinalEnglishCount: Math.max(
      Number(local.endingFreetalkFinalEnglishCount) || 0,
      Number(cloud.endingFreetalkFinalEnglishCount) || 0
    ),
    endingFreetalkFinalRunEnglishCount: Math.max(
      Number(local.endingFreetalkFinalRunEnglishCount) || 0,
      Number(cloud.endingFreetalkFinalRunEnglishCount) || 0
    ),
    endingFreetalkEnglishByPlay: mergeMaxCountMap(
      local.endingFreetalkEnglishByPlay,
      cloud.endingFreetalkEnglishByPlay
    ),
  };
}

function looksLikeLessonWipe(incoming, existing) {
  const incomingEmpty =
    (incoming.completedSegmentIds || []).length === 0 &&
    (incoming.mcqLog || []).length === 0 &&
    Object.keys(incoming.chapterPlayCounts || {}).length === 0 &&
    Object.keys(incoming.mcqBadgeFirstTry || {}).length === 0;
  const existingHadProgress =
    (existing.completedSegmentIds || []).length > 0 ||
    (existing.mcqLog || []).length > 0 ||
    Object.keys(existing.chapterPlayCounts || {}).length > 0 ||
    Object.keys(existing.mcqBadgeFirstTry || {}).length > 0;
  return incomingEmpty && existingHadProgress;
}

export function saveLessonStateFor(state, lessonId, levelId = ACTIVE_LEVEL_ID) {
  const incoming = sanitizeLessonState(state, lessonId);
  let toSave = incoming;
  if (usesBeginnerArchitecture(lessonId, levelId)) {
    try {
      const raw = localStorage.getItem(storageKey(lessonId, levelId));
      if (raw) {
        const existing = sanitizeLessonState(JSON.parse(raw), lessonId);
        if (!looksLikeLessonWipe(incoming, existing)) {
          toSave = {
            ...incoming,
            chapterPlayCounts: mergeMaxCountMap(
              incoming.chapterPlayCounts,
              existing.chapterPlayCounts
            ),
            mcqBadgePlay: mergeMaxCountMap(
              incoming.mcqBadgePlay,
              existing.mcqBadgePlay
            ),
            mcqBadgeFirstTry: mergeFirstTryMaps(
              incoming.mcqBadgeFirstTry,
              existing.mcqBadgeFirstTry
            ),
            mcqBadgeFirstTryBest: mergeBestFirstTryMaps(
              incoming.mcqBadgeFirstTryBest,
              existing.mcqBadgeFirstTryBest
            ),
          };
        }
      }
    } catch {
      // keep incoming
    }
  }
  try {
    localStorage.setItem(
      storageKey(lessonId, levelId),
      JSON.stringify(toSave)
    );
  } catch {
    // ignore
  }
  if (lessonId === "part1" && toSave.complete) {
    try {
      localStorage.setItem(part1CompleteKey(levelId), "1");
    } catch {
      // ignore
    }
  }
}

export function saveLessonState(state, lessonId = ACTIVE_LESSON_ID) {
  saveLessonStateFor(state, lessonId, ACTIVE_LEVEL_ID);
}

export function isPart1Complete(levelId = ACTIVE_LEVEL_ID) {
  try {
    if (localStorage.getItem(part1CompleteKey(levelId)) === "1") return true;
    const s = loadLessonStateFor("part1", levelId);
    if (s.complete) return true;
    // Ending chapter finished (complete_segment(ending1) succeeded).
    return s.completedSegmentIds.includes("ending1");
  } catch {
    return false;
  }
}

export function getLessonBadgeIds(
  lessonId = ACTIVE_LESSON_ID,
  levelId = ACTIVE_LEVEL_ID
) {
  return (getLesson(lessonId, levelId).badges || []).map((b) => b.id);
}

export function loadBadgeRevocations() {
  try {
    const arr = JSON.parse(localStorage.getItem(BADGE_REVOCATIONS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveBadgeRevocations(ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  try {
    localStorage.setItem(BADGE_REVOCATIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function revokeBadgesForLesson(
  lessonId = ACTIVE_LESSON_ID,
  levelId = ACTIVE_LEVEL_ID
) {
  const ids = new Set(getLessonBadgeIds(lessonId, levelId));
  if (!ids.size) return [];
  const cleared = loadEarnedLessonBadges().filter((id) => !ids.has(id));
  saveEarnedLessonBadges(cleared);
  savePendingLessonBadges(
    loadPendingLessonBadges().filter((id) => !ids.has(id))
  );
  saveBadgeRevocations([...loadBadgeRevocations(), ...ids]);
  return [...ids];
}

export function resetLesson(lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  const state = emptyState(lessonId);
  saveLessonStateFor(state, lessonId, levelId);
  if (lessonId === "part1") {
    try {
      localStorage.removeItem(part1CompleteKey(levelId));
    } catch {
      // ignore
    }
  }
  revokeBadgesForLesson(lessonId, levelId);
  return state;
}

/** Increment play count when the learner starts a chapter (jump or natural advance). */
export function recordChapterPlay(segmentId, lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  const id = String(segmentId || "").trim();
  if (!id) return 0;
  const state = loadLessonStateFor(lessonId, levelId);
  const counts = { ...(state.chapterPlayCounts || {}) };
  counts[id] = (Number(counts[id]) || 0) + 1;
  state.chapterPlayCounts = counts;
  if (usesBeginnerArchitecture(lessonId, levelId)) {
    state.mcqBadgePlay = { ...(state.mcqBadgePlay || {}), [id]: counts[id] };
  }
  saveLessonStateFor(state, lessonId, levelId);
  return counts[id];
}

/**
 * Entering a chapter for the first time counts as play 1.
 * Never bump an existing play here — selective accuracy retries (jumpToSegment)
 * own fresh play ids, and auto-incrementing the next chapter after a replay
 * was wiping that chapter's first-try scores.
 */
export function ensureEnteredChapterPlay(state, segmentId, lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  const id = String(segmentId || "").trim();
  if (!id || !state) return 0;
  const counts = { ...(state.chapterPlayCounts || {}) };
  const existing = Number(counts[id]) || 0;
  if (existing > 0) {
    if (
      usesBeginnerArchitecture(lessonId, levelId) &&
      !(Number(state.mcqBadgePlay?.[id]) > 0)
    ) {
      state.mcqBadgePlay = { ...(state.mcqBadgePlay || {}), [id]: existing };
    }
    return existing;
  }
  counts[id] = 1;
  state.chapterPlayCounts = counts;
  if (usesBeginnerArchitecture(lessonId, levelId)) {
    state.mcqBadgePlay = { ...(state.mcqBadgePlay || {}), [id]: 1 };
  }
  return 1;
}

/** Ensure first visit is counted once (session open / kick opening). */
export function ensureChapterPlayCounted(segmentId, lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  const id = String(segmentId || "").trim();
  if (!id) return 0;
  const state = loadLessonStateFor(lessonId, levelId);
  const play = ensureEnteredChapterPlay(state, id, lessonId, levelId);
  saveLessonStateFor(state, lessonId, levelId);
  return play;
}

function emitBadgeAwardsIfNeeded(lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  if (!usesBeginnerArchitecture(lessonId, levelId)) return;
  import("./badge-engine.js?v=20260921-admin-part-split")
    .then((m) => {
      const { newlyEarned } = m.evaluateAndAwardBadges(lessonId, levelId);
      if (newlyEarned?.length) {
        try {
          window.dispatchEvent(
            new CustomEvent("learny-badges-earned", {
              detail: { newlyEarned, lessonId, levelId },
            })
          );
          window.parent?.postMessage?.(
            { type: "gc_badges_earned", newlyEarned, lessonId, levelId },
            "*"
          );
        } catch {
          // ignore
        }
      }
      try {
        window.dispatchEvent(new CustomEvent("learny-progress-changed"));
        window.parent?.postMessage?.({ type: "gc_quest_progress_update" }, "*");
      } catch {
        // ignore
      }
    })
    .catch(() => {});
}

/**
 * Free chapter select / replay — keeps できた history, restarts chapter-local UI.
 */
export function jumpToSegment(segmentId, lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  const lesson = getLesson(lessonId, levelId);
  const idx = (lesson.segments || []).findIndex((s) => s.id === segmentId);
  if (idx < 0) return { ok: false, reason: "unknown_segment" };
  const state = loadLessonStateFor(lessonId, levelId);
  const id = lesson.segments[idx].id;
  state.segmentIndex = idx;
  state.complete = false;
  state.mcqCursor = { ...(state.mcqCursor || {}), [id]: 0 };
  if (state.segmentUi && typeof state.segmentUi === "object") {
    const ui = { ...state.segmentUi };
    delete ui[id];
    // Ch2 stores under segmentUi.ch2 sometimes as nested — clear common keys.
    if (id === "ch2" && ui.ch2) delete ui.ch2;
    state.segmentUi = ui;
  }
  const counts = { ...(state.chapterPlayCounts || {}) };
  counts[id] = (Number(counts[id]) || 0) + 1;
  state.chapterPlayCounts = counts;
  if (usesBeginnerArchitecture(lessonId, levelId)) {
    state.mcqBadgePlay = { ...(state.mcqBadgePlay || {}), [id]: counts[id] };
  }
  saveLessonStateFor(state, lessonId, levelId);
  return { ok: true, state, segmentIndex: idx, segmentId: id, playCount: counts[id] };
}

export function getSegments(lessonId = ACTIVE_LESSON_ID) {
  return getLesson(lessonId).segments;
}

export function getCurrentSegment(state = loadLessonState()) {
  const segments = getSegments(state.lessonId);
  const idx = Math.min(state.segmentIndex, segments.length - 1);
  return segments[idx];
}

export function getSegmentById(id, lessonId = ACTIVE_LESSON_ID) {
  return getSegments(lessonId).find((s) => s.id === id) || null;
}

/** Banner labels from the homework markdown (CHAPTER 0, QUIZ 1, …). */
export function getSegmentChapterMeta(segment) {
  const id = String(segment?.id || "");
  const ch = id.match(/^ch(\d+)$/);
  if (ch) return { label: "CHAPTER", num: ch[1] };
  const quiz = id.match(/^quiz(\d+)$/);
  if (quiz) return { label: "QUIZ", num: quiz[1] };
  if (id.startsWith("daily")) return { label: "DAILY", num: "" };
  if (id.startsWith("final")) return { label: "FINAL", num: "" };
  if (id.startsWith("ending")) return { label: "END", num: "" };
  if (id.startsWith("mix")) return { label: "MIX", num: "" };
  return { label: "CHAPTER", num: "" };
}

export function formatSegmentChapter(segment) {
  const { label, num } = getSegmentChapterMeta(segment);
  return num === "" ? label : `${label} ${num}`;
}

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesPatterns(text, patterns = []) {
  const n = normalizeText(text);
  if (!n) return false;
  return patterns.some((p) => n.includes(normalizeText(p)));
}

/** Chapter 4 requires the child's remembered color, not just "made" or "glass". */
export function matchesChosenColorGlassPhrase(text, color) {
  const n = normalizeText(text);
  const colorName = normalizeText(color);
  if (!n || !colorName) return false;
  const escapedColor = colorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\bi made\\s+(?:a\\s+|some\\s+)?${escapedColor}\\s+(?:(?:coloured|colored)\\s+)?glass\\b`
  ).test(n);
}

export function loadEarnedLessonBadges() {
  try {
    const arr = JSON.parse(localStorage.getItem(LESSON_BADGES_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function loadPendingLessonBadges() {
  try {
    const arr = JSON.parse(
      localStorage.getItem(PENDING_LESSON_BADGES_KEY) || "[]"
    );
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function savePendingLessonBadges(ids) {
  const claimed = new Set(loadEarnedLessonBadges());
  const list = [
    ...new Set((ids || []).map(String).filter((id) => id && !claimed.has(id))),
  ];
  try {
    localStorage.setItem(PENDING_LESSON_BADGES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function saveEarnedLessonBadges(ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  try {
    localStorage.setItem(LESSON_BADGES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function recordLessonBadge(badgeId) {
  if (!badgeId) return loadEarnedLessonBadges();
  const next = saveEarnedLessonBadges([...loadEarnedLessonBadges(), badgeId]);
  savePendingLessonBadges(
    loadPendingLessonBadges().filter((id) => id !== badgeId)
  );
  saveBadgeRevocations(loadBadgeRevocations().filter((id) => id !== badgeId));
  const state = loadLessonState();
  if (!state.badges.includes(badgeId)) {
    state.badges = [...state.badges, badgeId];
    saveLessonState(state);
  }
  return next;
}

/** Move ceremony receipts into the claimed collection.
 * うけとる is authoritative: claim every receipt id even if sync wiped pending.
 */
export function claimPendingLessonBadges(ids) {
  const requested = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!requested.length) {
    return { newlyClaimed: [], claimed: loadEarnedLessonBadges() };
  }
  const before = new Set(loadEarnedLessonBadges());
  for (const id of requested) recordLessonBadge(id);
  const claimed = loadEarnedLessonBadges();
  return {
    newlyClaimed: claimed.filter((id) => !before.has(id)),
    claimed,
  };
}

export function recordPhrase(phrase) {
  const p = String(phrase || "").trim();
  if (!p) return loadLessonState();
  const state = loadLessonState();
  if (!state.phrasesSpoken.includes(p)) {
    state.phrasesSpoken = [...state.phrasesSpoken, p].slice(-80);
    saveLessonState(state);
  }
  return state;
}

export function recordMemory(key, value) {
  const k = String(key || "").trim();
  let v = String(value || "").trim();
  if (!k || !v) return { ok: false, reason: "empty" };
  const lesson = getActiveLesson();
  if (lesson.memories && !lesson.memories.includes(k)) {
    return { ok: false, reason: "unknown_key" };
  }
  if (k === "favoriteColor") {
    const allowed = normalizeAllowedFavoriteColor(v);
    if (!allowed) return { ok: false, reason: "invalid_color" };
    v = allowed;
  }
  const state = loadLessonState();
  state.memories = { ...state.memories, [k]: v };
  saveLessonState(state);
  return { ok: true, memories: state.memories };
}

export function completeSegment(segmentId, { userQuote = "", saidTogether = false } = {}) {
  const state = loadLessonState();
  const lesson = getLesson(state.lessonId);
  const segment = getSegmentById(segmentId, state.lessonId);
  if (!segment) return { ok: false, reason: "unknown_segment" };

  const current = getCurrentSegment(state);
  if (segment.id !== current.id && !state.completedSegmentIds.includes(segment.id)) {
    return { ok: false, reason: "not_current", currentId: current.id };
  }

  // Idempotent: already finished this chapter — advance the banner if needed,
  // but never bump the next chapter's accuracy play id (that wiped clean
  // first-try scores when kids selectively retried a red-label chapter).
  if (state.completedSegmentIds.includes(segment.id)) {
    const idxDone = lesson.segments.findIndex((s) => s.id === segment.id);
    if (idxDone >= 0 && state.segmentIndex <= idxDone) {
      state.segmentIndex = Math.min(idxDone + 1, lesson.segments.length - 1);
      const next = lesson.segments[state.segmentIndex];
      if (next?.id && next.id !== segment.id) {
        ensureEnteredChapterPlay(state, next.id, state.lessonId, ACTIVE_LEVEL_ID);
      }
      saveLessonState(state);
    }
    emitBadgeAwardsIfNeeded(state.lessonId, ACTIVE_LEVEL_ID);
    return {
      ok: true,
      alreadyDone: true,
      state,
      next: getCurrentSegment(state),
      lessonComplete: state.complete,
    };
  }

  const loose = Boolean(segment.completeWithoutEnglish) || saidTogether;
  const quote = userQuote || "";
  if (
    segment.id === "ch4" &&
    usesBeginnerPart1Architecture(state.lessonId, ACTIVE_LEVEL_ID) &&
    !matchesChosenColorGlassPhrase(quote, state.memories?.favoriteColor)
  ) {
    return { ok: false, reason: "no_target_phrase" };
  }
  if (!loose && segment.targets?.length) {
    const hit = segment.targets.some((t) => matchesPatterns(quote, t.patterns));
    if (!hit && segment.items?.length) {
      const itemHit = segment.items.some((it) => matchesPatterns(quote, it.patterns || []));
      if (!itemHit) return { ok: false, reason: "no_target_phrase" };
    } else if (!hit && !segment.items?.length) {
      if (
        segment.id === "ch6" &&
        usesBeginnerPart1Architecture(state.lessonId, ACTIVE_LEVEL_ID)
      ) {
        const tankReady = matchesPatterns(quote, [
          "my tank is ready",
          "tank is ready",
          "my tanks is ready",
        ]);
        if (!tankReady) return { ok: false, reason: "no_target_phrase" };
      } else {
        return { ok: false, reason: "no_target_phrase" };
      }
    }
  }

  if (!state.completedSegmentIds.includes(segment.id)) {
    state.completedSegmentIds = [...state.completedSegmentIds, segment.id];
  }
  if (quote && /[a-zA-Z]/.test(quote)) {
    if (!state.phrasesSpoken.includes(quote.trim())) {
      state.phrasesSpoken = [...state.phrasesSpoken, quote.trim()].slice(-80);
    }
  }

  const idx = lesson.segments.findIndex((s) => s.id === segment.id);
  if (idx >= 0) {
    state.segmentIndex = Math.min(idx + 1, lesson.segments.length - 1);
  }
  if (segment.type === "ending" || idx === lesson.segments.length - 1) {
    state.complete = true;
    state.segmentIndex = lesson.segments.length - 1;
    const endingPlay =
      Number(state.mcqBadgePlay?.[segment.id]) ||
      Number(state.chapterPlayCounts?.[segment.id]) ||
      0;
    state.endingFreetalkFinalEnglishCount =
      Number(state.endingFreetalkEnglishCount) || 0;
    state.endingFreetalkFinalRunEnglishCount =
      Number(state.endingFreetalkEnglishByPlay?.[endingPlay]) || 0;
  } else {
    // First entry into the next chapter counts as play 1 only.
    // Fresh accuracy plays are created by jumpToSegment / recordChapterPlay.
    const next = lesson.segments[state.segmentIndex];
    if (next?.id && next.id !== segment.id) {
      ensureEnteredChapterPlay(state, next.id, state.lessonId, ACTIVE_LEVEL_ID);
    }
  }

  saveLessonState(state);
  emitBadgeAwardsIfNeeded(state.lessonId, ACTIVE_LEVEL_ID);

  return { ok: true, state, next: getCurrentSegment(state), lessonComplete: state.complete };
}

function mapBadgeCatalog(badges) {
  return (badges || []).map((b) => ({
    id: b.id,
    label: b.label,
    desc: b.desc,
    hint: b.desc,
    emoji: "⭐",
    family: b.family || null,
    tier: b.tier || null,
    image: b.image || null,
  }));
}

export function getBadgeCatalogForLesson(lessonId = ACTIVE_LESSON_ID) {
  return mapBadgeCatalog(getLesson(lessonId, ACTIVE_LEVEL_ID).badges);
}

export function getBadgeCatalog() {
  return mapBadgeCatalog(allLessons().flatMap((lesson) => lesson.badges || []));
}

export function buildProgressSnapshot(levelId = ACTIVE_LEVEL_ID, cloudLevel = null) {
  const cloud =
    cloudLevel && typeof cloudLevel === "object" ? cloudLevel : {};
  const part1 = resolvePartForSync("part1", levelId, cloud.part1);
  const part2 = resolvePartForSync("part2", levelId, cloud.part2);
  const claimed = loadEarnedLessonBadges();
  const pending = loadPendingLessonBadges();
  return {
    progressContractVersion: PROGRESS_CONTRACT_VERSION,
    part1,
    part2,
    part1Complete: Boolean(
      part1.complete || cloud.part1Complete || isPart1Complete(levelId)
    ),
    part2Complete: Boolean(part2.complete || cloud.part2Complete),
    claimedLessonBadgeIds: claimed,
    pendingLessonBadgeIds: pending,
    // Backward-compatible alias. It intentionally contains claimed ids only.
    lessonBadges: claimed,
    reporting: {
      part1: buildPartReporting(part1),
      part2: buildPartReporting(part2),
    },
  };
}

export function loadLessonStateFor(lessonId, levelId) {
  try {
    const raw = localStorage.getItem(storageKey(lessonId, levelId));
    if (!raw) return emptyState(lessonId);
    return sanitizeLessonState(JSON.parse(raw), lessonId);
  } catch {
    return emptyState(lessonId);
  }
}

function memoryBlock(memories) {
  const entries = Object.entries(memories || {}).filter(([, v]) => v);
  if (!entries.length) {
    return "Known memories: NONE. Do not invent tank color, fish, decorations, or counts.";
  }
  return (
    "Known memories (ONLY these — never invent extra): " +
    entries.map(([k, v]) => `${k}=${v}`).join("; ")
  );
}

function japaneseOutputRule(levelId) {
  const hiraganaOnly =
    "JAPANESE OUTPUT (mandatory whenever you speak Japanese): Write ONLY in ひらがな — no kanji, no katakana, no romaji. " +
    "This is for TTS pronunciation. Examples: がらす (not ガラス), すな (not 砂), すいそう (not 水槽), とうめい (transparent — NOT みえて), マインクラフト → まいんくらふと. " +
    "LANGUAGE LOCK: Spoken text may use ONLY English (Latin letters) and Japanese (ひらがな). " +
    "FORBIDDEN: Arabic, Bengali, Chinese characters as Chinese, Korean, Cyrillic, Thai, Hindi, or any other script — never mix them into transcriptions.";
  if (levelId === "beginner") {
    return (
      hiraganaOnly +
      " BEGINNER (CRITICAL — NEVER BREAK): EVERY spoken turn MUST pair FULL English sentences with FULL ひらがな sentences of the SAME meaning. " +
      "Pattern: English sentence → matching ひらがな sentence → (optional next English → matching ひらがな). " +
      "English-only turns are FORBIDDEN — including praise, follow-ups, and tank invites. " +
      "Japanese-only half-turns are also FORBIDDEN — never put a long Japanese idea after a short English tag like That's great! alone. " +
      "The child needs BOTH: full English to learn + full Japanese to understand. " +
      "Good: \"Hello! How are you today? こんにちは！きょうは どうですか？\" " +
      "Good: \"A cafe! That sounds fun! What did you drink there? カフェ！たのしそう！なにを のんだの？\" " +
      "BAD: Oh! Today I want to make a fish tank… (jumped topics after the child shared something — react to THEIR words first). " +
      "BAD: Hello! How are you today? … Hello there! How are you today? (doubled). " +
      "BAD: That's great! そうだ！きょうは…つくれる？ (Japanese invite with no matching English). " +
      "BAD: English with no ひらがな after it."
    );
  }
  return hiraganaOnly + " Keep it short and natural for kids. Intermediate/advanced: English first; Japanese gloss in ひらがな only when you add one.";
}

function scaffoldingLine(levelId) {
  if (levelId === "beginner") {
    const part2 = usesBeginnerPart2Architecture(ACTIVE_LESSON_ID, ACTIVE_LEVEL_ID);
    return [
      japaneseOutputRule(levelId),
      "BEGINNER JAPANESE = SAME MEANING AS ENGLISH: Every English sentence needs a full ひらがな sentence that says the same thing — cover ALL of the English, not a one-word tag.",
      "Every Japanese idea also needs a full English sentence before it — never Japanese-only invites or questions after That's great! alone.",
      "FORBIDDEN after English: only いってみて / っていってみて / いいね / そうだね / ばっちり alone — that leaves the child with no translation.",
      part2
        ? "PART 2 ONLY: recall their Minecraft aquarium. FORBIDDEN: What do I need to make a tank / とうめいで かたい / がらすが ひつよう / building a new tank from scratch."
        : "Forbidden JP: わたしの すいそうを てつだってくれますか / すいそうを てつだう. Use すいそうづくりを てつだってほしい / いっしょに すいそうを つくれる？",
      part2
        ? "PART 2 MCQ SCRIPT BEATS (CRITICAL): After each child answer, ONE turn = short praise/reaction + the FULL next beat script " +
          "(English lead + 「…」の えいごを 選んでね！) word-for-word. FORBIDDEN: praise-only turns; skipping the next script; Japanese-only when an English lead exists. " +
          "The 「」 elicit IS the Japanese half — do NOT add a Japanese translation of the English lead. " +
          "FORBIDDEN after the elicit: paraphrases like あなたのすいそうの / かざりつけ / おぼえてるかな / repeating the English lead."
        : "",
      part2 ? "" : "Forbidden JP: みえて for transparent — say とうめいで かたい. Thank-you: ありがとう, not すごいね alone.",
      "Never say English-only. Never stack two English questions before their Japanese. One English + one Japanese pair at a time.",
      "Every line must end with Japanese ひらがな after the English — including praise, hints, and questions.",
      "If they answer in Japanese, praise, then model a short English version and invite them to repeat — still EN then full-meaning ひらがな.",
      "Hints: 2-choice is OK after they are stuck.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (levelId === "intermediate") {
    return [
      japaneseOutputRule(levelId),
      "INTERMEDIATE INPUT (CRITICAL): There are NO on-screen choice / 4-button options. The child answers ONLY by speaking English. " +
        "Never tell them to tap, choose a button, or pick from a list. Wait for their spoken answer. " +
        "When eliciting a phrase, say を えいごで いってみて！ (NOT の えいごを 選んでね！).",
      "Intermediate: elicit English first. If stuck, give a spoken hint or model — still no buttons. A short ひらがな gloss after English is OK, not required on every line.",
    ].join(" ");
  }
  return [
    japaneseOutputRule(levelId),
    "Intermediate/advanced: elicit English first. If stuck, then 2-choice. A short ひらがな gloss after English is OK, not required on every line.",
  ].join(" ");
}

function japaneseElicitBracketRule(levelId = ACTIVE_LEVEL_ID, segment = null) {
  const segId = segment?.id || "";
  const segType = segment?.type || "";
  // Phrase elicits are homework-chapter tools. Seeding them into warmup/daily free chat
  // made Live append 「がらすが ひつよう」の えいごを 選んでね！ after Hello / How are you.
  if (
    segType === "warmup" ||
    segType === "quiz" ||
    segId === "ch0" ||
    segId === "daily1" ||
    segId === "ending1" ||
    segId === "quiz1"
  ) {
    // Quiz uses 「cue」は えいごで？ — never seed 選んでね homework elicits here.
    return "";
  }

  const elicitCue =
    levelId === "intermediate"
      ? "を えいごで いってみて！"
      : "の えいごを 選んでね！";

  // Part 2 beginner — decorate / fish review (never Part 1 glass/sand).
  if (usesBeginnerPart2Architecture(ACTIVE_LESSON_ID, ACTIVE_LEVEL_ID)) {
    const exampleBySegment = {
      ch1: PART2_ELICIT_JA.ch1PutKelp,
      ch2: PART2_ELICIT_JA.ch2GoOcean,
      ch3: PART2_ELICIT_JA.ch3CaughtFish,
      ch4: PART2_ELICIT_JA.ch4PutInTank,
      ch5: PART2_ELICIT_JA.ch5ThreeFish,
      ch6: "「なにいろを えらびましたか？」は どれ？",
      quiz1: "「ここに さんごを おいた」は えいごで？",
      final1: "ここに こんぶを おいた！は えいごで？",
    };
    const segmentElicits = {
      ch1: `Part 2 Ch1 only: ${PART2_ELICIT_JA.ch1PutKelp} / ${PART2_ELICIT_JA.ch1PutCoral} / ${PART2_ELICIT_JA.ch1ChooseThis} / ${PART2_ELICIT_JA.ch1LikeCoral} / ${PART2_ELICIT_JA.ch1LooksCool}`,
      ch2: `Part 2 Ch2 only: ${PART2_ELICIT_JA.ch2GoOcean} / ${PART2_ELICIT_JA.ch2FoundFish} / ${PART2_ELICIT_JA.ch2BlueFish} / ${PART2_ELICIT_JA.ch2WantFish} / ${PART2_ELICIT_JA.ch2ChooseFish}`,
      ch3: `Part 2 Ch3 only: ${PART2_ELICIT_JA.ch3CaughtFish} / ${PART2_ELICIT_JA.ch3HaveFish}`,
      ch4: `Part 2 Ch4 only: ${PART2_ELICIT_JA.ch4PutInTank} / ${PART2_ELICIT_JA.ch4PutItHere} / ${PART2_ELICIT_JA.ch4LookFish}`,
      ch5: `Part 2 Ch5: number picker 1–10 then ${PART2_ELICIT_JA.ch5FishCount} / ${PART2_ELICIT_JA.ch5ThreeFish} / ${PART2_ELICIT_JA.ch5FiveFish}`,
      ch6: "Part 2 Ch6: teacher-question recognition MCQ only — never glass/sand tank-build lines.",
    };
    const exampleCue =
      exampleBySegment[segId] ||
      (levelId === "intermediate"
        ? "「ここに こんぶを おいた」を えいごで いってみて！"
        : PART2_ELICIT_JA.ch1PutKelp);
    return [
      `JAPANESE PHRASE ELICITS (「…」${elicitCue}):`,
      `Always wrap the Japanese phrase in 「」 then say ${elicitCue} — e.g. ${exampleCue}`,
      "FORBIDDEN: Part 1 glass/sand lines (がらすが ひつよう / すなが ひつよう / What do I need to make a tank / とうめいで かたい).",
      "FORBIDDEN old form: 〜って えいごで いってみて！ / って英語で言ってみて — use the form above instead.",
      levelId === "intermediate"
        ? "INTERMEDIATE: Never say 選んでね / tap / button / 4-choice. Child speaks the English."
        : "CRITICAL AUDIO: Pronounce every mora of え・い・ご・を in の えいごを 選んでね！ Never shorten to の選んでね / のを選んでね. The Japanese word えいご is required.",
      segmentElicits[segId] || "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const exampleBySegment = {
    ch1: PART1_ELICIT_JA.needGlass,
    ch2: PART1_ELICIT_JA.foundSand,
    ch3: PART1_ELICIT_JA.ch3NeedGlass,
    ch5: PART1_ELICIT_JA.ch5PutGlass,
    ch6: PART1_ELICIT_JA.ch6PutSand,
    quiz1: "「がらすが ひつよう」は えいごで？",
    final1: "がらすが ひつよう！は えいごで？",
  };
  const exampleCue =
    exampleBySegment[segId] ||
    (levelId === "intermediate"
      ? "「がらすが ひつよう」を えいごで いってみて！"
      : "「がらすが ひつよう」の えいごを 選んでね！");

  const segmentElicits = {
    ch1: `Ch1 only: ${PART1_ELICIT_JA.needGlass} / ${PART1_ELICIT_JA.needSand}`,
    ch2: `Ch2 only: ${PART1_ELICIT_JA.foundSand}`,
    ch3: `Ch3 only: ${PART1_ELICIT_JA.ch3NeedGlass} / ${PART1_ELICIT_JA.ch3MadeGlass}`,
    ch5: `Ch5 only — keep EN/JP beat pairs; NEVER mix Beat3 Are you done making it? with 「すいそうを つくってる」 (that is Beat2). Beat3 JP is ONLY ${PART1_ELICIT_JA.ch5MadeTank}. Beats: ${PART1_ELICIT_JA.ch5PutGlass} / ${PART1_ELICIT_JA.ch5Building} / ${PART1_ELICIT_JA.ch5MadeTank} / ${PART1_ELICIT_JA.ch5LooksGood}`,
    ch6: `Ch6 only: ${PART1_ELICIT_JA.ch6PutSand} / ${PART1_ELICIT_JA.ch6MoreSand} / ${PART1_ELICIT_JA.ch6ImDone} / ${PART1_ELICIT_JA.ch6TankReady}`,
  };

  return [
    `JAPANESE PHRASE ELICITS (「…」${elicitCue}):`,
    `Always wrap the Japanese phrase in 「」 then say ${elicitCue} — e.g. ${exampleCue}`,
    "FORBIDDEN old form: 〜って えいごで いってみて！ / って英語で言ってみて — use the form above instead.",
    levelId === "intermediate"
      ? "INTERMEDIATE: Never say 選んでね / tap / button / 4-choice. Child speaks the English."
      : "CRITICAL AUDIO: Pronounce every mora of え・い・ご・を in の えいごを 選んでね！ Never shorten to の選んでね / のを選んでね. The Japanese word えいご is required.",
    'When coaches say "do not speak the English answer", that means do NOT say the target English phrase (e.g. I made a tank!) — it does NOT mean skip the Japanese word えいご.',
    segmentElicits[segId] || "",
    "FORBIDDEN: ガラスが必要って… / がらすがひつようって… without 「」 around the phrase.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Rewrite button-centric coach text for intermediate voice-only sessions. */
function adaptCoachTextForLevel(text, levelId = ACTIVE_LEVEL_ID) {
  if (levelId !== "intermediate" || !text) return text || "";
  return String(text)
    .replace(/の\s*えいごを\s*選んでね！/g, "を えいごで いってみて！")
    .replace(/4-choice MCQ buttons?/gi, "spoken English answers (no buttons)")
    .replace(/4-button MCQ/gi, "spoken English answers")
    .replace(/4-button tap/gi, "spoken English answer")
    .replace(/4-button choice/gi, "spoken English answer")
    .replace(/on-screen 4-choice buttons/gi, "voice answers only")
    .replace(/use on-screen 4-choice buttons\.?/gi, "child answers by speaking English only.")
    .replace(/WAIT for the button\/tap\.?/gi, "WAIT for the child to speak the English.")
    .replace(/child taps a 4-button choice/gi, "child speaks the English answer")
    .replace(/Then WAIT for a 4-button tap\.?/gi, "Then WAIT for the child to speak the English.");
}

function praiseVariationRule() {
  return [
    "PRAISE VARIATION (every session): Rotate congratulation words — never the same opener twice in a row.",
    "FORBIDDEN loops: すごい！ every correct answer; That's right! every turn; せいかい！ + すごい as a fixed pair; Nice! / Great! / そうだね on repeat.",
    "Good rotation (pick ONE short praise, then move on): Great job! / Nice one! / Yes! / Awesome! / You got it! / やったね！ / ばっちり！ / そのとおり！ / いいね！ / よくできた！",
    "WRONG-ANSWER VARIATION: Rotate soft retries — Nice try! / So close! / Hmm not that one! / Oops! / Good try! / That's okay! / ざんねん！ / ちがうみたい！ / おっと！ / ちかいよ！ — " +
      "NEVER always Almost! Try again! / おしい！もういちど！. Never reveal the correct English answer on a wrong tap.",
    "After praise: echo their correct English OR ask the next question — never stack two praise lines.",
  ].join(" ");
}

function conversationQualityRule() {
  return [
    "SOUND LIKE A REAL TEACHER (not a robot / script reader):",
    praiseVariationRule(),
    "Listen and care. Your reaction must show you understood THEIR exact words — not a generic Nice! / That's great! every time.",
    "Vary your language. Do NOT reuse the same praise + question template every turn (bad loop: You X! What did you X? repeated).",
    "Be curious and specific: if they studied English → ask Was it fun? / Was it hard? / Do you like English? — pick ONE natural follow-up, not a quiz checklist.",
    "If they say nothing / no / not really / I don't know: warm Okay! / そっか！だいじょうぶ！ — then ONE DIFFERENT gentle question (e.g. Do you like Minecraft? — never list two options) OR (when warmup is ready) reaction + the homework invite. NEVER re-ask What did you do today?, Did you play anything fun?, or the same follow-up they just answered. NEVER ask two questions in one turn.",
    "FORBIDDEN: repeating the same English or Japanese question after the child already answered (especially after no / nothing).",
    "Keep kid energy: short, warm, playful — still ONE question per turn, still wait.",
    "FORBIDDEN robotic habits: always starting with That's great!; echoing their sentence then asking the same verb back every time; sounding like a form / FAQ bot.",
  ].join(" ");
}

function leadTheTurnRule(levelId = ACTIVE_LEVEL_ID) {
  const lines = [
    "LEAD THE CONVERSATION (mandatory every spoken turn, including warmup and story):",
    conversationQualityRule(),
    "REACT FIRST: Always respond to what the child JUST said — name their words/topic (cafe, game, food, color…). Hollow Oh! / Nice! / Wow! / すごい alone is NOT enough.",
    "Never end a turn with only a comment, praise, or restatement (bad: \"Sand is right!\" / \"That's cool!\" and then silence).",
    "Same turn: specific reaction to their content + exactly ONE question or phrase-repeat invite. Then wait.",
    "Never change topic in the same turn as reacting to their last answer — especially never jump to homework/tank while they shared everyday news (invite turn is the exception: short reaction + Oh! Today…).",
    "Forbidden: two questions in one utterance. Forbidden: stopping after Nice! / I see! / That's cool! / Sand is right! / That's right! そうだね! alone.",
    "Forbidden: TWO spoken replies in a row without the child speaking — ONE message per child turn, then wait.",
    'Bad end (never do this): "That\'s right! そうだね!" with no next question. Good chat end: "That\'s right! What did you play? そうだね！なにを あそんだの？" — during warmup/chat NEVER append homework 「phrase」の えいごを 選んでね！ elicits.',
    "Forbidden open filler: What should we do next? / つぎは？ alone — always name the next homework step (e.g. make glass → I need to make glass).",
  ];
  if (levelId === "beginner") {
    lines.push(
      "BEGINNER: Same turn = FULL English sentence(s) then FULL matching ひらがな — even praise and every question must be fully translated, not just いってみて.",
      "Speak each idea ONCE only. One English + one Japanese pair per idea. NEVER repeat How are you / Hello there with the same question twice. NEVER say the same Japanese phrase twice."
    );
  }
  return lines.join(" ");
}

function ch4StoryRule() {
  return [
    "CHAPTER 4 ONLY — choose a favorite color and make that coloured glass. ONE beat per turn — never combine beats.",
    "Minecraft note: dye is already at a pre-prepared 花壇 (flower bed). Child just picks it up — do NOT teach I need a dye / I found a flower / flower hunting.",
    "Beat A1: Speak EXACTLY What's your favorite color? / すきな いろは？ Colour MCQ buttons are on screen. WAIT for a button tap only. " +
      "Record favoriteColor only from a button (orange/red/blue/green/yellow/pink). NEVER assume blue. " +
      "FORBIDDEN: accepting spoken/typed colour words / inventing rainbow or gold / free-text colour answers.",
    "Beat A2+B (NEXT turn after colour button): ONE combined client-owned make+tell line, then glass MCQ. " +
      "FORBIDDEN: asking favorite color again.",
    "When child taps/says I made [color] glass!: praise → call complete_segment(ch4) immediately. Next is Chapter 5 walls.",
    "FORBIDDEN on Ch4: I need a dye, I found a flower, I choose ___, Did you make one?, long crafting, I put glass here, walls (Chapter 5).",
  ].join(" ");
}

function ch4StartNudge() {
  return (
    "[Teacher note — do not read aloud] CHAPTER 4 color start NOW. English then ひらがな. " +
    "Beat A1 ONLY: Speak EXACTLY What's your favorite color? すきな いろは？ Then WAIT for a colour button tap. " +
    "Colour MCQ is on screen — do NOT accept spoken/typed colours. " +
    "NEXT (after button): client delivers combined make+tell → glass MCQ. " +
    "Dye is at the pre-prepared 花壇 — do NOT teach I need a dye / I found a flower. " +
    "FORBIDDEN: walls, I put glass here, glass MCQ before make+tell."
  );
}

function ch5StoryRule() {
  return [
    "CHAPTER 5 ONLY — build tank walls with glass. 4 MCQ beats in order (English then Japanese, ONE beat per turn):",
    "Beat 1: Now let's make a tank wall! Where do you want to put the glass? Tell me! すいそうの かべを つくろう！どこに がらすを おく？" +
      PART1_ELICIT_JA.ch5PutGlass +
      " → MCQ I put glass here.",
    `Beat 2: Tell me what you're building! ${PART1_ELICIT_JA.ch5Building} → MCQ I'm building a tank.`,
    `Beat 3: Are you done making it? ${PART1_ELICIT_JA.ch5MadeTank} → MCQ I made a tank!.`,
    `Beat 4: How does it look? ${PART1_ELICIT_JA.ch5LooksGood} → MCQ It looks good! → complete_segment(ch5).`,
    "CRITICAL: Speak EXACTLY each beat line. Wrong MCQ: soft retry, never reveal. Never end on praise alone.",
    "FORBIDDEN Beat 3 mix-up: Are you done making it? with 「すいそうを つくってる」— Beat 3 JP is ONLY すいそうを つくった の えいごを 選んでね！.",
    "FORBIDDEN: Learny saying I put glass here / I'm building a tank / I made a tank! / It looks good! as her own lines.",
    "FORBIDDEN: How big / what shape / Let me know where you put / Can you say, I put glass here (old script).",
    "FORBIDDEN on Ch5: What's your favorite color? / dye / flower bed (color was Chapter 4).",
  ].join(" ");
}

function ch5StartNudge() {
  return (
    "[Teacher note — do not read aloud] CHAPTER 5 walls start NOW. Speak EXACTLY Beat 1: " +
    "Now let's make a tank wall! Where do you want to put the glass? Tell me! すいそうの かべを つくろう！どこに がらすを おく？" +
    PART1_ELICIT_JA.ch5PutGlass +
    " Then WAIT for 4-button tap (I put glass here). FORBIDDEN: How big, Let me know when you put, dye/color restart."
  );
}

function ch3StoryRule() {
  return [
    "CHAPTER 3 ONLY — make glass from sand. Two phrases: I need to make glass → I made glass!",
    `Step 1: Speak EXACTLY: Let's make some glass! ${PART1_ELICIT_JA.ch3NeedGlass} Then WAIT for the 4-button tap. ` +
      "Do NOT say Can you say, I need to make glass / speak the English answer aloud. Hint furnace/bake if stuck.",
    "After the child says I need to make glass: short praise + SAME turn MUST speak EXACTLY: " +
      `Are you done making the glass? ${PART1_ELICIT_JA.ch3MadeGlass} Then WAIT for the 4-button tap. ` +
      "Do NOT say Can you say, I made glass / speak the English answer aloud. Learny cannot see the screen.",
    "Step 2: When child says I made glass!: praise — Great job! Then call complete_segment(ch3) immediately.",
    "CRITICAL: Never end on praise only (Great job! / Perfect! / すごいね！) with no question. Never pretend glass is finished before the child says I made glass!",
    "FORBIDDEN before I made glass!: Now we have glass, we can make the tank, glass is done, ガラスもできた, jumping to quiz/walls/color.",
    "NEXT segment is Mini quiz 1 (NOT Chapter 4 yet). Do NOT say What color do you like, dye, flowers, I put glass here, or build walls — those come AFTER Mini quiz 1.",
    "FORBIDDEN on Chapter 3: What color do you like, dye, flowers, I put glass here, I'm building a tank.",
    "FORBIDDEN on Chapter 3: I put sand here, put sand in the tank, on the bottom, すいそうにいれ — that is Chapter 6 only.",
    "FORBIDDEN: What do you need to do next? after I made glass. You may propose a silly wrong action in Step 1.",
  ].join(" ");
}

function quiz1Rule() {
  return [
    "MINI QUIZ 1 ONLY — exactly 3 items in FIXED order. Never invent questions. Never ask すなが ひつよう.",
    "QUIZ SPEAKING (overrides beginner EN→JP): Speak the quiz in FULL Japanese ひらがな only. Do NOT say English first. Do NOT speak the English choices aloud — child taps a 4-button choice.",
    "Speak EVERY mora of the cue inside 「」 aloud word-by-word — never shorten. " +
      "FORBIDDEN: くいずたいむ！は英語で？ / くいずたいむ！はえいごで？ without the cue inside 「」; がらすが英語で without ひつよう; saying 英語 instead of えいご.",
    "Item 1 EXACT: くいずたいむ！「がらすが ひつよう」は えいごで？ Correct: I need glass.",
    "Item 2 EXACT: じゃあ つぎは 「すなを みつけた」は えいごで？ Correct: I found some sand.",
    "Item 3 EXACT: じゃあ つぎは 「がらすを つくった！」は えいごで？ Correct: I made glass.",
    "Wrong tap: rotate a soft bilingual retry (Nice try / So close / Oops / ざんねん / ちがうみたい — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer; then repeat the SAME speak line and WAIT.",
    "After a correct answer: ONE short varied praise (NOT すごい every time — rotate Great job / Nice one / Amazing / やったね / ばっちり / Yes!) + echo ONLY the answer they just said correctly — then speak the NEXT item's EXACT speak line word-for-word in the SAME turn. NEVER praise the wrong phrase. NEVER skip ahead. NEVER repeat the same item.",
    "After all 3 correct: call complete_segment(quiz1) immediately. Then Chapter 4 starts (What's your favorite color?).",
    "FORBIDDEN on quiz1: What color do you like, dye, flowers, I put glass here, I'm building a tank, すなが ひつよう quiz item, oral どっち 2-choice.",
  ].join(" ");
}

/** Part 2 Mini quiz 1 — coral / want fish / caught fish (never Part 1 glass/sand). */
function quiz1RulePart2() {
  return [
    "MINI QUIZ 1 PART 2 ONLY — exactly 3 items in FIXED order. Never invent questions. Never ask Part 1 glass/sand cues.",
    "QUIZ SPEAKING (overrides beginner EN→JP): Speak the quiz in FULL Japanese ひらがな only. Do NOT say English first. Do NOT speak the English choices aloud — child taps a 4-button choice.",
    "Speak EVERY mora of the cue inside 「」 aloud word-by-word — never shorten. " +
      "FORBIDDEN: くいずたいむ！は英語で？ / くいずたいむ！はえいごで？ without the cue inside 「」; saying 英語 instead of えいご; の えいごを 選んでね on quiz turns.",
    "Item 1 EXACT (must be first audible turn on quiz1): くいずたいむ！「ここに さんごを おいた」は えいごで？ Correct: I put coral here.",
    "Item 2 EXACT: じゃあ つぎは「この おさかなが ほしい」は えいごで？ Correct: I want this fish.",
    "Item 3 EXACT: じゃあ つぎは「おさかなを つかまえた！」は えいごで？ Correct: I caught a fish!",
    "FORBIDDEN on item 1: starting with じゃあ つぎは / skipping to item 2 or 3 / Part 1 がらすが ひつよう.",
    "Wrong tap: rotate a soft bilingual retry (Nice try / So close / Oops / ざんねん / ちがうみたい — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer; then repeat the SAME speak line and WAIT.",
    "After a correct answer: ONE short varied praise (Great! / Amazing! / Nice one! / やったね / ばっちり — rotate) + echo ONLY the answer they just said correctly — then speak the NEXT item's EXACT speak line word-for-word in the SAME turn. NEVER skip ahead. NEVER repeat the same item.",
    "After all 3 correct: call complete_segment(quiz1) immediately. Then Chapter 4 (put fish in tank).",
    "FORBIDDEN on quiz1: Part 1 glass/sand, walls, color/dye, oral どっち 2-choice.",
  ].join(" ");
}

function quiz1StartNudgePart2() {
  return (
    "[Teacher note — do not read aloud] PART 2 MINI QUIZ 1 starts NOW. Speak FULL Japanese ひらがな only (NO English-first). " +
    "Do NOT jump to Chapter 4 yet. Speak EXACTLY item 1 word-by-word (every mora inside 「」): " +
    "くいずたいむ！「ここに さんごを おいた」は えいごで？ Then WAIT for a 4-button tap. " +
    "FORBIDDEN: starting with じゃあ つぎは / item 2 「この おさかなが ほしい」 / item 3 / Part 1 がらすが ひつよう / 英語 instead of えいご. " +
    "Do NOT speak the English choices aloud. Next after correct I put coral here: この おさかなが ほしい. Then おさかなを つかまえた. " +
    "After all 3, complete_segment(quiz1) → Chapter 4."
  );
}

function daily1Rule() {
  return [
    "DAILY ENGLISH ONLY — sudden everyday chat away from the tank. NO intro line.",
    "FIRST line EXACTLY: Oh by the way, do you have a favourite animal? そういえば、[childName]は すきな どうぶつとか いるの？ (child's name + さん in Japanese).",
    "FORBIDDEN openers: Let's practice today's English / きょうの えいごを れんしゅうしよう.",
    "Talk like a friendly real teacher — NOT a quiz bot. After the animal question: at least 4 chat rallies.",
    "EACH TURN: (1) react specifically to WHAT THEY JUST SAID (name their words), (2) ONE follow-up about THAT same topic, (3) WAIT.",
    "Stay on their topic for 1–2 turns before changing topic. Soft bridge when you switch (e.g. Nice! By the way…).",
    "FORBIDDEN: starting every turn with the same echo (A dog! / いぬ！) after you already reacted that way.",
    "FORBIDDEN: asking something they already answered (e.g. Did you have one before? right after 飼ってたよ / I used to; " +
      "Do you like pandas? / パンダは すき？ right after they named パンダ as their favourite animal).",
    "After they name an animal: react + ask something NEW (seen one? zoo? why cute?) — NEVER Do you like [that animal]?",
    "FORBIDDEN: abrupt random jumps (dog → video games) with no link to their last line.",
    "If they only say うん/yes: warm ack + ONE gentle follow-up on the SAME topic (help them say a little more) — do NOT leap to a brand-new topic yet.",
    "FORBIDDEN forever: Are you tired? / つかれた？ / What's your favorite color? / すきな いろは？ — color was already chosen in Chapter 4 (favoriteColor).",
    "FORBIDDEN: stopping after Nice / That's right / そうだね with no next question before 4 rallies.",
    "FORBIDDEN: back to the tank before 4 rallies.",
    "After 4+ rallies, " +
      daily1BridgeTurnInstruction() +
      " Finish speaking that full turn before tools. Then call complete_segment(daily1). " +
      "FORBIDDEN: complete_segment(daily1) before 4 rallies or before the back-to-tank bridge line. Next is Chapter 6 sand.",
    "Never go silent after praise — always lead to the next question or the back-to-tank bridge.",
  ].join(" ");
}

function daily1StartNudge() {
  const open = daily1OpenSpeak();
  return (
    "[Teacher note — do not read aloud] DAILY ENGLISH start NOW. " +
    "Speak EXACTLY (no intro): " +
    open +
    " Then WAIT. " +
    "FORBIDDEN: Let's practice today's English / きょうの えいごを れんしゅうしよう. " +
    "Continue 4+ NATURAL chat rallies: react to their exact words, stay on topic 1–2 turns, ONE new question per turn. " +
    "FORBIDDEN: repeating A dog! every turn / re-asking answered facts / abrupt topic jumps / Are you tired? / favorite color (Ch4). " +
    "After 4+ rallies ONLY: " +
    daily1BridgeTurnInstruction() +
    " then complete_segment(daily1)."
  );
}

function ch2ChoiceRule() {
  return [
    "CHAPTER 2 ONLY — sand search. Learny CANNOT see the child's screen — never say Look! Sand! or I found some sand! as if Learny saw it.",
    "STRICT order — ONE question per turn, then WAIT:",
    "(1) Let's go find some sand! Do you want to go to the beach or the mountains? すなを さがしに いこう！ びーちと やま、どっちに いく？ — record_memory searchPlace.",
    "(2) After they pick: Do you want to go to the left or right? ひだりと みぎ、どっちに いく？",
    "(3) Is it hot outside? そとは あつい？ — REQUIRED after left/right. NEVER skip to We found some sand!",
    "(4) What can you see around you? まわりに なにが みえる？ — after they answer, react briefly then go to (5). FORBIDDEN: Keep looking / Take your time / ゆっくり探して.",
    `(5) Speak EXACTLY: We found some sand! Can you say it in English? ${PART1_ELICIT_JA.foundSand} (do NOT speak the English answer I found some sand aloud). Show found-sand MCQ. Only after the child says I found some sand!, call complete_segment(ch2).`,
    "FORBIDDEN forever in Chapter 2: Let me know when you find some sand / すなを みつけたら おしえてね; Are you tired? / つかれた？ / Can you hear the waves? / inventing other everyday questions.",
    "CRITICAL: After left/right, your NEXT line MUST be Is it hot outside? — NEVER We found some sand right after left/right. " +
      "After they answer hot, your NEXT line MUST be What can you see around you?. " +
      "After they answer see, your NEXT line MUST be We found some sand! elicit — NEVER Keep looking / がんばって.",
    "Do NOT treat earlier Chapter 1 answers (sand / I need sand) as found sand.",
    "Short acks (うん/ok/yes) before the found-sand elicit mean continue the script — do NOT treat that yes as found sand.",
    "If child says not yet / まだ while on the elicit: brief cheer + repeat the elicit line — do NOT restart hot/see.",
    "FORBIDDEN during Ch2: We have sand / すながある before I found some sand!; put sand in tank / on the bottom (Chapter 6); glass (Chapter 3).",
  ].join(" ");
}

function ch6StoryRule() {
  return [
    "CHAPTER 6 ONLY — put sand on the bottom. 4 MCQ beats in order (English then Japanese, ONE beat per turn):",
    "Beat 1: Let's make a basement inside the tank! すいそうの そこに すなを おこう！" +
      PART1_ELICIT_JA.ch6PutSand +
      " → MCQ I put the sand on the bottom.",
    `Beat 2: Do we have enough sand? ${PART1_ELICIT_JA.ch6MoreSand} → MCQ I need more sand.`,
    `Beat 3: Are you done? ${PART1_ELICIT_JA.ch6ImDone} → MCQ I'm done!.`,
    `Beat 4: Is the tank ready for the fishes to swim? ${PART1_ELICIT_JA.ch6TankReady} → MCQ My tank is ready! → complete_segment(ch6).`,
    "I'm done! = sand-on-bottom step finished — NOT the whole aquarium. FORBIDDEN after I'm done!: Almost, おしい, not yet.",
    "My tank is ready! = ready for fish LATER — still ZERO fish.",
    "Accept close variants: put sand on the bottom = I put the sand on the bottom. Praise and move forward — never backtrack.",
    "FORBIDDEN: Learny saying target phrases herself. FORBIDDEN: old Put sand on the bottom / Can you say, I put sand here? / English-in-quotes elicits.",
    "FORBIDDEN: sand color, stuck, inventing off-script phrases.",
  ].join(" ");
}

function ch6StartNudge() {
  return (
    "[Teacher note — do not read aloud] CHAPTER 6 sand bottom start NOW. Speak EXACTLY Beat 1: " +
    CH6_BEAT1_SPEAK +
    " Then WAIT for 4-button tap (I put the sand on the bottom). " +
    "FORBIDDEN: reacting to Daily English / favourite animal / pet names. " +
    "FORBIDDEN: old Put sand on the bottom / I put sand here."
  );
}

function final1Rule() {
  return [
    "FINAL CHALLENGE ONLY — review phrases from the whole Part 1 lesson.",
    "FIRST turn when Final challenge begins (ONE message — no wait for yes): Final challenge time! Let's go! さいごのチャレンジだよ！レッツゴー！ then IMMEDIATELY the first listed 〜は えいごで？ cue (ひらがな ONLY for Japanese — no kanji, no katakana).",
    "FORBIDDEN: Are you ready? / じゅんびは できてる？ / stopping after the opener before the first quiz item.",
    "After the first item: ask ONE listed item per turn — format MUST be the EXACT listed cue + は えいごで？ (ひらがな ONLY for Japanese — no kanji, no katakana).",
    "Examples (speak exactly): がらすが ひつよう！は えいごで？ / すなを みつけた！は えいごで？ / がらすを つくった！は えいごで？",
    "Use ONLY the current listed quiz prompt from coach — do NOT invent questions or say bare は えいごで？ without the cue phrase.",
    "After the child answers correctly: brief praise + NEXT listed cue in the SAME turn (ONE message — FORBIDDEN: praise-only then a second message).",
    "Say さいごの もんだい！ / one more question! ONLY when exactly ONE item remains in the quiz.",
    "After the LAST item is answered: praise briefly, then call complete_segment(final1) immediately — do NOT ask another quiz question.",
    "FORBIDDEN on final1: story mode, inventing quiz prompts, bare は えいごで？, kanji/katakana in Japanese, repeating answered items.",
    "Every turn: English first, then ひらがな with the SAME full meaning.",
  ].join(" ");
}

/** Part 2 Final challenge — random 5–6 from the Part 2 phrase pool. */
function final1RulePart2() {
  return [
    "FINAL CHALLENGE PART 2 ONLY — review phrases from Part 2 (decorations, fish, tank). Random 5–6 items from the client list.",
    "FIRST turn EXACTLY (ONE message — no wait for yes): Final challenge time! Let's go! さいごの ちゃれんじだよ！れっつごー！ " +
      "then IMMEDIATELY the first listed 〜は えいごで？ cue (ひらがな ONLY).",
    "FORBIDDEN: Are you ready? / じゅんびは できてる？ / stopping after the opener before the first quiz item.",
    "Ask ONE listed item per turn — EXACT cue + は えいごで？. Use ONLY the current listed prompt — never invent questions.",
    "After correct: brief praise + NEXT listed cue in the SAME turn. FORBIDDEN: praise-only then a second message.",
    "Say さいごの もんだい！ ONLY when exactly ONE item remains.",
    "After the LAST item: brief praise, then complete_segment(final1) → Ending. FORBIDDEN: another quiz question.",
    "FORBIDDEN: Part 1 glass/sand cues (がらすが ひつよう / すなを みつけた); story mode; bare は えいごで？.",
  ].join(" ");
}

function ending1Rule() {
  return [
    "ENDING — three phases. Do NOT invent How many / なんびき.",
    "Phase 1 Turn A: Stay SILENT until the client sends the exact Turn A script. Then speak that script ONCE (full English + ひらがな) and WAIT. Never start Turn A on your own. Never repeat it.",
    "Phase 2 GENUINE OPEN-ENDED FREE TALK (after Turn A): Be the child's friendly English teacher. React specifically to what the child says, then ask ONE natural, friendly follow-up about their words. ONE complete turn only: English first, then matching ひらがな with the SAME meaning in the SAME turn — English-only is FORBIDDEN; never restart or repeat the English. Follow the child's topic with no scripted progression and no automatic turn limit.",
    "During Phase 2, NEVER steer, suggest, hint, or direct the conversation toward ending; never mention the end button/control. Do NOT say goodbye / Next Minecraft / See you / complete_segment until the child explicitly requests 終わりにする through the UI.",
    "Phase 3 Turn C (ONLY when the client says free talk is over / 終わりにする): ONE goodbye message — Hmm... I can't stop thinking about it! + Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time! + matching ひらがな → call complete_segment(ending1).",
    "FORBIDDEN during free talk: How many / なんびき / premature goodbye / English-only turns. FORBIDDEN ever: inventing how many / splitting Turn A or Turn C / saying Perfect twice.",
    "Keep core child safety and age-appropriate, intelligible language. Every turn: English first, then ひらがな with the SAME full meaning.",
  ].join(" ");
}

/** Part 2 daily1 rule — food free-talk; fun natural conversation. */
function daily1RulePart2() {
  return [
    "DAILY ENGLISH PURPOSE: a natural free-talk session — make English learning FUN. React playfully and have a genuine conversation. NOT a quiz.",
    "DAILY ENGLISH ONLY — sudden everyday chat away from the aquarium. NO intro line like Let's practice.",
    "FIRST line EXACTLY: Oh by the way, [name], what did you eat today? そういえば、[name]さんは きょう なにを たべたの？ (child's name + さん in Japanese).",
    "FORBIDDEN openers: Let's practice today's English / きょうの えいごを れんしゅうしよう.",
    "After the food question: chat naturally for at least 4 rallies. React funly to THEIR exact words, then ONE curious follow-up, then WAIT.",
    "EACH TURN: (1) warm/fun specific reaction to WHAT THEY JUST SAID (name their words), (2) ONE follow-up about THAT same topic, (3) WAIT.",
    "Stay on their topic for 1–2 turns before changing topic. Soft bridge when you switch (e.g. Nice! By the way…).",
    "FORBIDDEN: starting every turn with the same echo (Curry! / かれー！) after you already reacted that way.",
    "FORBIDDEN: asking something they already answered; abrupt random jumps with no link to their last line.",
    "If they only say うん/yes: warm ack + ONE gentle follow-up on the SAME topic — do NOT leap to a brand-new topic yet.",
    "FORBIDDEN forever: Are you tired? / つかれた？ / favorite color.",
    "FORBIDDEN: stopping after Nice / That's right / そうだね with no next question before 4 rallies.",
    "FORBIDDEN: back to the aquarium before 4 child replies after the food opener.",
    "When 4+ child replies are reached: react to their last words, then EXACTLY: Nice! Now let's get back to your aquarium! いいね！じゃあ すいぞくかんの はなしに もどろう！ " +
      "Finish speaking that full turn before tools. Then call complete_segment(daily1) → Chapter 5. " +
      "FORBIDDEN: complete_segment(daily1) before 4 child replies or before the bridge line. " +
      "FORBIDDEN: saying the bridge right after the food opener with no child answer.",
    "Never go silent after praise — always lead to the next question or the back-to-aquarium bridge.",
  ].join(" ");
}

/** Part 2 ending — same structure as Part 1: intro → free talk → 終わりにする → finale. */
function ending1RulePart2() {
  return [
    "ENDING PART 2 — same structure as Part 1. Client owns intro + finale; free talk in between.",
    "Intro EXACT (ONE message, then WAIT): Perfect! You remembered a lot about your aquarium! + decorations/fish + teacher might ask same questions + You'll be ready! + Now, let's chat freely with Teacher Learny!",
    "Then FREE TALK: react to the child, one bilingual follow-up; never steer toward ending; never say goodbye.",
    "ONLY after client says free talk is over / 終わりにする: finale EXACT If you play Minecraft again… See you next time! → complete_segment(ending1).",
    "Freetalk badge (client-counted): English ×3 → gold, ×2 → silver, ×1 → bronze.",
    "FORBIDDEN: Part 1 fish-tank ending lines; How many / なんびき; goodbye before 終わりにする.",
  ].join(" ");
}

/** Part 2 Chapter 5 rule — number picker then MCQ. */
function ch5RulePart2() {
  return [
    "CHAPTER 5 PART 2 — number picker (1–10) then MCQ beats.",
    `Beat A1 (10 number buttons, NO option audio): Speak EXACTLY: ${PART2_CH5_BEAT1_SPEAK} Then WAIT for a number tap.`,
    "When they tap N (1–10) → record_memory(fishCount, N) → unlock Beat A2.",
    "Beat A2 (MCQ after fishCount — dynamic choices; premade option audio for 1–10 OK): short reaction + EXACT " +
      "You had [N] fish! 「おさかなが [N]ひき/びき いる」の えいごを 選んでね！ " +
      "GRAMMAR: fishCount=1 → There is one fish. fishCount>1 → There are [N] fish.",
    `Beat A3 = short reaction + EXACT: How about three fish? ${PART2_ELICIT_JA.ch5ThreeFish} → There are three fish.`,
    `Beat A4 = short reaction + EXACT: How about five fish? ${PART2_ELICIT_JA.ch5FiveFish} → There are five fish. → complete_segment(ch5) → Chapter 6.`,
    "FORBIDDEN: inventing fish counts / skipping A1 / unlocking A2 before a number tap / Part 1 tank-wall lines.",
  ].join(" ");
}

/** Part 2 Chapter 6 rule — teacher questions. */
function ch6RulePart2() {
  return [
    "CHAPTER 6 PART 2 — Teacher QUESTION recognition MCQ. Five beats. Child picks which English question matches the Japanese (は どれ？ — NOT の えいごを 選んでね).",
    `Beat 1 (opening ONLY — no reaction prefix) EXACT: ${PART2_CH6_BEAT1_SPEAK} → What color did you choose?`,
    "Beat 2 = short reaction + EXACT: How about this one? 「どの おさかなを えらびましたか？」は どれ？ → What fish did you choose?",
    "Beat 3 = short reaction + EXACT: Your teacher might ask about the number of fish! 「すいそうに おさかなが なんびき いますか？」は どれ？ → How many fish are in your tank?",
    "Beat 4 = short reaction + EXACT: How about this question? 「すいぞくかんの どんなところが すき？」は どれ？ → What do you like about your aquarium?",
    "Beat 5 = short reaction + EXACT: Last one! 「じぶんの すいぞくかんが すき？」は どれ？ → Do you like your aquarium? → complete_segment(ch6) → Final Challenge.",
    "Every post-answer turn MUST be reaction + full next script in ONE message. FORBIDDEN: praise-only; skipping the script; paraphrasing.",
    "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer.",
    "CRITICAL: Do NOT call complete_segment(ch6) after Beat 1–4. Stay until Do you like your aquarium? is correct.",
    "FORBIDDEN: jumping to Final Challenge early; complete_segment(final1)/Ending before Final Challenge; Part 1 sand/basement lines.",
  ].join(" ");
}

/**
 * Small, phase-specific setup for the fresh Ending Phase 2 Live session.
 * Deliberately excludes lesson/chapter/final-quiz scripts and prompt history.
 */
export function buildEndingFreeTalkInstructions(
  state = loadLessonState(),
  levelId = ACTIVE_LEVEL_ID
) {
  const lesson = getLesson(state.lessonId);
  const instructionLevel = lesson.instructionLevel || levelId;
  const part2 = usesBeginnerPart2Architecture(state.lessonId, levelId);
  const raw = [
    "You are ラーニー先生 (Learny), a warm human Japanese-English teacher talking live with a child.",
    part2
      ? "ENDING PHASE 2 ONLY — genuine open-ended free talk. The client already played the aquarium-remembered intro (Perfect! … You'll be ready!). Stay silent until the child answers. Follow THEIR topic about the aquarium, Minecraft, fish, decorations, school — whatever they bring."
      : "ENDING PHASE 2 ONLY — genuine open-ended free talk. The client already played static Turn A and asked: What kind of fish should we catch? どんな おさかなを つかまえよう？ Stay silent until the child answers.",
    "On every child turn: react specifically to their latest words first, then ask exactly ONE natural, friendly follow-up about that same topic. ONE complete turn only — English first, then matching ひらがな with the SAME meaning in the SAME turn (English-only is FORBIDDEN); never restart or repeat the English. Keep the conversation varied and non-repetitive; follow the child's topic with no scripted progression or turn limit.",
    part2
      ? "The first child answer is authoritative even if it is short or Japanese. Never ignore it or restart the intro Perfect / You'll be ready script."
      : "The first child answer is authoritative even if it is short or Japanese (for example クラゲ). Never ignore it, replace it with an old answer, or ask the Turn A fish question again.",
    "REQUIRED bilingual shape every turn: clear age-appropriate English, then helpful natural ひらがな that matches that English. Never scold pronunciation or grammar. Never reply in English only.",
    "Never steer, suggest, hint, or direct the child toward ending. Never mention an end button/control.",
    "Only the explicit client action 終わりにする can start the client-owned finale goodbye. Before that action, FORBIDDEN: goodbye, See you next time, Next Minecraft, How many / なんびき, complete_segment, lesson review, quiz, Final Challenge, or any previous chapter prompt.",
    noSystemBackendRule(),
    "Never invent facts about the child's tank. Use only what the child says now or these known memories:",
    memoryBlock(state.memories),
    "Tools: record_memory only when the child states a durable fact. Do not call complete_segment and do not mention tools, badges, awards, UI, timers, or technical status.",
  ]
    .filter(Boolean)
    .join("\n");
  return adaptCoachTextForLevel(raw, instructionLevel);
}

/**
 * Small Daily English-only setup for the fresh post-Ch4/Ch5 Live session.
 * Excludes chapter/quiz/MCQ scaffolding that bloated replies (~14k → ~2.5k chars).
 */
export function buildDaily1Instructions(
  state = loadLessonState(),
  levelId = ACTIVE_LEVEL_ID
) {
  const lesson = getLesson(state.lessonId);
  const instructionLevel = lesson.instructionLevel || levelId;
  const childName = getLearnerJaName();
  const isPart2 = usesBeginnerPart2Architecture(state.lessonId, levelId);
  
  // Part 2 asks about food; Part 1 asks about animals
  const openingLine = isPart2
    ? daily1OpenSpeakPart2(childName)
    : daily1OpenSpeak(childName);
  const bridgeLine = isPart2
    ? daily1BackToAquariumSpeak()
    : daily1BackToTankSpeak();
  const topicNote = isPart2
    ? "After the food question: at least 4 natural chat rallies about food. EACH TURN: (1) react to THEIR latest words, (2) ask ONE follow-up on that same topic, (3) WAIT."
    : "After the animal question: at least 4 natural chat rallies. EACH TURN: (1) react to THEIR latest words, (2) ask ONE follow-up on that same topic, (3) WAIT.";
  const nextChapter = isPart2 ? "Chapter 5 fish count" : "Chapter 6";

  const color = String(state?.memories?.favoriteColor || "").trim();
  const colorBit = color
    ? `Favorite color already chosen (${color}) — never ask about color / すきな いろ.`
    : "Never ask What's your favorite color? / すきな いろは？";
  const raw = [
    "You are ラーニー先生 (Learny), a warm human Japanese-English teacher talking live with a child.",
    isPart2
      ? "DAILY ENGLISH ONLY — sudden friendly chat away from the aquarium. Keep every reply SHORT."
      : "DAILY ENGLISH ONLY — sudden friendly chat away from the tank. Keep every reply SHORT.",
    `FIRST line EXACTLY (if not yet spoken): ${openingLine} Then WAIT.`,
    "FORBIDDEN openers: Let's practice today's English / きょうの えいごを れんしゅうしよう.",
    topicNote,
    "Stay on their topic 1–2 turns. Soft-bridge if you change topics. Never re-ask answered facts.",
    "Short answers (うん / かわいい / yes / cute): warm ack + ONE same-topic follow-up — do not jump topics.",
    "Every spoken turn: full English, then matching ひらがな with the SAME meaning. Never English-only.",
    `FORBIDDEN: Are you tired? / つかれた？ / ${colorBit}`,
    `After 4+ rallies, react to their last words then speak EXACTLY: ${bridgeLine}` +
      ` Finish speaking that turn, then call complete_segment(daily1). Never complete early. Next is ${nextChapter}.`,
    noSystemBackendRule(),
    isPart2 ? "Never invent aquarium facts. Known memories:" : "Never invent tank facts. Known memories:",
    memoryBlock(state.memories),
    "Tools: record_memory for durable facts. complete_segment(daily1) only after the back-to-aquarium/tank bridge. Do not mention tools, badges, UI, or timers.",
  ]
    .filter(Boolean)
    .join("\n");
  return adaptCoachTextForLevel(raw, instructionLevel);
}

/**
 * Slim Final Challenge Live prompt — full lesson instructions (~14k) made each
 * tap wait several seconds before Learny praised / asked the next cue.
 */
export function buildFinal1Instructions(
  state = loadLessonState(),
  levelId = ACTIVE_LEVEL_ID
) {
  const lesson = getLesson(state.lessonId);
  const instructionLevel = lesson.instructionLevel || levelId;
  const isPart2 = usesBeginnerPart2Architecture(state.lessonId, levelId);
  const raw = [
    "You are ラーニー先生 (Learny), a warm human Japanese-English teacher talking live with a child.",
    isPart2
      ? "FINAL CHALLENGE PART 2 ONLY — short review quiz from the Part 2 phrase list (5–6 random items). Keep every reply SHORT."
      : "FINAL CHALLENGE ONLY — short review quiz. Keep every reply SHORT.",
    `FIRST turn EXACTLY (if not yet spoken): ${final1OpenSpeak()} then IMMEDIATELY the first 〜は えいごで？ cue the client lists. Then WAIT.`,
    "FORBIDDEN openers: Are you ready? / じゅんびは できてる？ / stopping after the opener before the first cue.",
    isPart2
      ? "Each item: EXACT listed cue + は えいごで？ (ひらがな ONLY). Use ONLY the client-listed cue — never invent; never Part 1 glass/sand."
      : "Each item: EXACT listed cue + は えいごで？ (ひらがな ONLY — no kanji / katakana). Examples: がらすが ひつよう！は えいごで？ / すなを みつけた！は えいごで？",
    "After a correct answer: ONE short message = brief praise + NEXT cue in the SAME turn. FORBIDDEN: praise-only / two messages / inventing cues / bare は えいごで？.",
    "Say This is the last question! / さいごの もんだい！ ONLY when exactly ONE item remains.",
    "After the LAST correct answer: brief praise, then call complete_segment(final1). FORBIDDEN: another quiz question.",
    "Wrong tap: rotate a soft bilingual retry (Nice try / So close / Oops / ざんねん / ちがうみたい — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer; re-ask the SAME cue. Never reveal the English answer.",
    "Every spoken turn: English first, then matching ひらがな with the SAME meaning.",
    noSystemBackendRule(),
    "Never invent tank facts. Known memories:",
    memoryBlock(state.memories),
    "Tools: record_memory for durable facts. complete_segment(final1) only after the last quiz item. Do not mention tools, badges, UI, or timers.",
    "FORBIDDEN: Chapter story mode, aquarium build, Daily English, ending Perfect script.",
  ]
    .filter(Boolean)
    .join("\n");
  return adaptCoachTextForLevel(raw, instructionLevel);
}

function final1StartNudge() {
  return (
    "[Teacher note — do not read aloud] FINAL CHALLENGE starts NOW. " +
    "Speak EXACTLY ONE turn (no wait for yes): " +
    final1OpenSpeak() +
    " then IMMEDIATELY the first listed 〜は えいごで？ cue from coach (ひらがな only). " +
    "FORBIDDEN: Are you ready? / じゅんびは できてる？. " +
    "Never invent questions or bare は えいごで？. After last item answered → complete_segment(final1) immediately."
  );
}

function ending1StartNudge() {
  return (
    "[Teacher note — do not read aloud] Stay SILENT. Client will send Ending Turn A. Do not speak Perfect / Hold on / what kind of fish until then."
  );
}

function ending1StartNudgePart2() {
  return (
    "[Teacher note — do not read aloud] Stay SILENT. Client owns Part 2 Ending Turn A — " +
    "do not speak Perfect / aquarium remembered until the client sends the exact script."
  );
}

function ch1StoryRule() {
  return [
    "CHAPTER 1 ONLY — two separate steps, never skip Step 1.",
    "Do NOT ask How are you in Chapter 1 — warmup chat is already done.",
    "FIRST line when Chapter 1 begins: react briefly to what they JUST said, then Step 1 question ONLY — What do I need to make a tank? Something transparent and hard.",
    "Reaction rules: mood/feeling (good/fine/tired/いい気分/元気) → That's great! / Glad to hear it! JP: よかった！ / いいね！ — NEVER Thank you / ありがとう for mood.",
    "Only after they agreed to HELP with the tank → Thank you! / Great! JP: ありがとう！ / やった！",
    "Step 1: ask What do I need to make a tank? Something transparent and hard — then STOP. NEVER say I need glass or answer glass for the child; THEY must say glass first.",
    "FORBIDDEN as the first Chapter 1 line: Can you say I need glass, I need glass (as your own answer), I need to make glass, sand, glass or sand.",
    "JP ひらがな for Step 1 question (same meaning as English): すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。",
    "Forbidden JP for transparent: みえて — use とうめい. Forbidden for mood: ありがとう / Thank you.",
    `After they say glass (English or ガラス) for the TANK → praise → elicit with Japanese cue (do NOT speak the English answer aloud): Can you say it in English? / ${PART1_ELICIT_JA.needGlass} Then WAIT for the 4-button tap or English.`,
    "Say each teach line ONCE per turn — NEVER repeat the elicit twice in the same message.",
    "FORBIDDEN after tank/glass answer: saying I need glass yourself, Can you say, I need glass?, 「I need glass」いってみて, I put glass here, ガラスを置きたい, なんて言う for placing glass, What do you need to make glass?, sand, Step 2 — those come ONLY after the child says I need glass. Chapter 1 teach phrase is ONLY I need glass — NEVER I put glass here.",
    `If they wrongly say I put glass here in Chapter 1: gently redirect — Nice try! In this step we need glass. ${PART1_ELICIT_JA.needGlass}`,
    "If they say sand in Step 1: Sand comes later! Redirect to transparent/hard/glass — never Almost!",
    `Step 2 ONLY after the child says I need glass: To make glass in Minecraft, what do we need? → sand → elicit with Japanese cue (do NOT speak the English answer aloud): Can you say it in English? / ${PART1_ELICIT_JA.needSand}`,
    "When the child says I need sand: short praise, then call complete_segment(ch1) immediately. NEXT is Chapter 2 sand search — NOT another glass/sand quiz.",
    "FORBIDDEN after I need sand: asking To make glass in Minecraft, what do we need? again, or Can you say, I need sand? / 「I need sand」いってみて again.",
    "Step 2: ONE sand explanation per turn — do NOT say sand twice in different words in the same message.",
    "If stuck in Step 1, hint transparent/hard — never sand as a choice in Step 1.",
    "complete_segment(ch1) only after BOTH I need glass and I need sand from the child.",
    "FORBIDDEN on Ch1: Still looking for sand, Have you found sand, running to find sand, Let me know when you find sand — that gameplay is Chapter 2.",
  ].join(" ");
}

function quiz1StartNudge() {
  return (
    "[Teacher note — do not read aloud] MINI QUIZ 1 starts NOW. Speak FULL Japanese ひらがな only (NO English-first). " +
    "Do NOT jump to Chapter 4 yet. Speak EXACTLY item 1 word-by-word (every mora inside 「」): " +
    "くいずたいむ！「がらすが ひつよう」は えいごで？ Then WAIT for a 4-button tap. " +
    "FORBIDDEN shortcuts: くいずたいむ！は英語で？ / がらすが英語で without ひつよう / 英語 instead of えいご. " +
    "Do NOT speak the English choices aloud. Next after correct I need glass: すなを みつけた (I found some sand). Then がらすを つくった (I made glass). " +
    "FORBIDDEN: すなが ひつよう quiz, oral どっち 2-choice, English Which one means… After all 3, complete_segment(quiz1) → Chapter 4."
  );
}

function ch1StartNudge() {
  return (
    "[Teacher note — do not read aloud] CHAPTER 1 starts NOW. Warmup is DONE — the child already agreed to help. " +
    "Speak EXACTLY this ONE turn (full English then matching ひらがな), then STOP and WAIT: " +
    "Thank you! What do I need to make a tank? Something transparent and hard. " +
    "ありがとう！すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。 " +
    "FORBIDDEN this turn (and forever while on Chapter 1 opening): Oh! Today, Will you help me make it?, " +
    "fish tank invite, いっしょに つくれる？, How are you, sand, I need glass, repeating the tank-help question. " +
    "The child taps glass on the buttons next — do NOT answer for them."
  );
}

/** Part 2 Chapter 1 opening — decorate/kelp, never Part 1 glass/tank Step 1. */
function ch1StartNudgePart2() {
  return (
    "[Teacher note — do not read aloud] PART 2 CHAPTER 1 starts NOW. Warmup aquarium recall is DONE. " +
    "Speak EXACTLY this ONE turn word-for-word — ENGLISH first, then the 「」ひらがな elicit (never Japanese-only), then WAIT for the 4-choice tap: " +
    `${PART2_CH1_BEAT1_SPEAK} ` +
    "FORBIDDEN: skipping the English; starting at 「; translating the English lead into Japanese; あなたのすいそうの; かざりつけ; おぼえてるかな; " +
    "repeating any part of the line; What do I need to make a tank / transparent and hard / とうめいで かたい / " +
    "がらすが ひつよう / I need glass / I need sand / Thank you tank Step 1 / Will you help me make it."
  );
}

function ch1RulePart2() {
  return [
    "CHAPTER 1 PART 2 — decorate the tank with on-screen 4-choice MCQ. One beat at a time.",
    `Beat 1 (opening ONLY — no reaction prefix) EXACT: ${PART2_CH1_BEAT1_SPEAK} → I put kelp here.`,
    `Beat 2 = short reaction + EXACT: How about coral? ${PART2_ELICIT_JA.ch1PutCoral} → I put coral here.`,
    `Beat 3 = short reaction + EXACT: You had different decorations! ${PART2_ELICIT_JA.ch1ChooseThis} → I choose this one.`,
    "Beat 3 CRITICAL AUDIO: say これ・を・えらぶ inside 「」. FORBIDDEN: ここに えらぶ / ここにえらぶ.",
    `Beat 4 = short reaction + EXACT: You found coral you liked! ${PART2_ELICIT_JA.ch1LikeCoral} → I like this coral.`,
    `Beat 5 = short reaction + EXACT: Your tank looked great! ${PART2_ELICIT_JA.ch1LooksCool} → It looks cool! → complete_segment(ch1) → Chapter 2.`,
    "Every post-answer turn MUST be reaction + full next script in ONE message. FORBIDDEN: praise-only; skipping the script; paraphrasing.",
    "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer.",
    "CRITICAL: Do NOT call complete_segment(ch1) after Beat 1–4. Stay on Chapter 1 until It looks cool! is correct.",
    "FORBIDDEN: jumping to Chapter 2 / うみに いこう / fish search before all 5 decoration beats are done.",
    "FORBIDDEN: Part 1 glass/sand/tank-build lines (What do I need to make a tank / とうめいで かたい / がらすが ひつよう).",
  ].join(" ");
}

function ch2RulePart2() {
  return [
    "CHAPTER 2 PART 2 — find fish with on-screen 4-choice MCQ. One beat at a time.",
    `Beat 1 (opening ONLY — no reaction prefix) EXACT: ${PART2_CH2_BEAT1_SPEAK} → Let's go to the ocean!`,
    `Beat 2 = short reaction + EXACT: You found a fish! ${PART2_ELICIT_JA.ch2FoundFish} → I found a fish!`,
    `Beat 3 = short reaction + EXACT: You found a blue fish! ${PART2_ELICIT_JA.ch2BlueFish} → I found a blue fish!`,
    `Beat 4 = short reaction + EXACT: You found a fish you wanted! ${PART2_ELICIT_JA.ch2WantFish} → I want this fish.`,
    `Beat 5 = short reaction + EXACT: You decided which fish you wanted! ${PART2_ELICIT_JA.ch2ChooseFish} → I choose this fish. → complete_segment(ch2) → Chapter 3.`,
    "Every post-answer turn MUST be reaction + full next script in ONE message. FORBIDDEN: praise-only; skipping the script; paraphrasing.",
    "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer.",
    "CRITICAL: Do NOT call complete_segment(ch2) after Beat 1–4. Stay on Chapter 2 until I choose this fish. is correct.",
    "FORBIDDEN: jumping to Chapter 3 / おさかなを つかまえた / bucket catch before all 5 find-fish beats are done.",
    "FORBIDDEN: Part 1 sand/beach search lines (I found some sand / Keep looking).",
  ].join(" ");
}

function ch3RulePart2() {
  return [
    "CHAPTER 3 PART 2 — catch fish with on-screen 4-choice MCQ. Two beats only.",
    `Beat 1 (opening ONLY — no reaction prefix) EXACT: ${PART2_CH3_BEAT1_SPEAK} → I caught a fish!`,
    `Beat 2 = short reaction + EXACT: Now you have the fish! ${PART2_ELICIT_JA.ch3HaveFish} → I have a fish! → complete_segment(ch3) → Mini quiz 1.`,
    "Every post-answer turn MUST be reaction + full next script in ONE message. FORBIDDEN: praise-only; skipping the script; paraphrasing.",
    "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer.",
    "CRITICAL: Do NOT call complete_segment(ch3) after Beat 1. Stay on Chapter 3 until I have a fish! is correct.",
    "FORBIDDEN: jumping to Mini quiz 1 / Chapter 4 put-in-tank before both catch beats are done.",
  ].join(" ");
}

function ch4RulePart2() {
  return [
    "CHAPTER 4 PART 2 — put fish in tank with on-screen 4-choice MCQ. Three beats only.",
    `Beat 1 (opening ONLY — no reaction prefix) EXACT: ${PART2_CH4_BEAT1_SPEAK} → I put the fish in the tank.`,
    `Beat 2 = short reaction + EXACT: How about "ここに いれた"? ${PART2_ELICIT_JA.ch4PutItHere} → I put it in here.`,
    `Beat 3 = short reaction + EXACT: You looked in the tank and saw a fish! ${PART2_ELICIT_JA.ch4LookFish} → Look! There's a fish! → complete_segment(ch4) → Daily English.`,
    "Every post-answer turn MUST be reaction + full next script in ONE message. FORBIDDEN: praise-only; skipping the script; paraphrasing.",
    "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer.",
    "CRITICAL: Do NOT call complete_segment(ch4) after Beat 1–2. Stay on Chapter 4 until Look! There's a fish! is correct.",
    "FORBIDDEN: jumping to Daily English / fish count / What did you eat before all 3 put-in-tank beats are done.",
    "FORBIDDEN: Part 1 color/dye / Let's make coloured glass / walls.",
  ].join(" ");
}

function warmupRules(segment, lessonId) {
  if (segment?.type !== "warmup") return "";
  let must, bridge;
  if (lessonId === "part1") {
    must = "No fixed question list. After the greeting, follow what the child said with natural everyday questions (food, games, colors, etc. are optional — never force What's your favorite summer food?). Stay on their topic 1–2 turns. When they share news (cafe, school, game…): name it, ask ONE follow-up about THAT, WAIT. Do NOT jump to the tank in the same turn as reacting.";
    bridge = "ONLY on a later turn — after enough chat — invite in ONE message: short reaction to their last line, THEN the tank invite with FULL English THEN matching ひらがな. Pattern: \"Okay! Oh! Today I want to make a fish tank. Will you help me make it? そっか！そうだ！きょうは らーにーせんせいの すいそうづくりを てつだってほしいんだ。いっしょに つくれる？\" Never start with bare Oh! Today with no reaction. Never Japanese-only invite. Never すいそうを てつだって. That invite turn must END with the help question — then STOP. FORBIDDEN same turn: Thank you, What do I need to make a tank, glass, sand, complete_segment(ch0). Wait for yes/ok. As soon as they agree on the NEXT turn, call complete_segment(ch0) BEFORE saying anything about glass or sand. While CURRENT SEGMENT is still warmup/ch0, do NOT teach glass, sand, or I need glass.";
  } else if (lessonId === "part2") {
    must =
      "Prioritize natural conversation over a rigid script list. After the greeting, follow what the child said with everyday questions. " +
      "Stay on their topic 1–2 turns. When they share news: name it, ask ONE follow-up about THAT, WAIT. Do NOT jump to the aquarium mid-reaction.";
    bridge =
      "ONLY after ~3 chat exchanges — ending invite in ONE message: short reaction that NAMES their last words, THEN speak EXACTLY: " +
      "\"Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together! " +
      "そうだ！このまえ まいんくらふとで つくった すいぞくかん、おぼえてる？いっしょに おもいだしてみよう！\" " +
      "Example: Grape cake! Yum! グレープケーキ！おいしそう！ then the Oh! invite. " +
      "FORBIDDEN: bare Oh!/Okay!/そっか with no reaction to what they said; Japanese-only invite. Then STOP and WAIT. " +
      "FORBIDDEN same turn: complete_segment(ch0). On the NEXT turn, ANY child reply (yes/no/ok/anything) → call complete_segment(ch0) BEFORE teaching any phrases.";
  } else {
    must = "Do not rush into the aquarium. Chat like a real teacher first. Stay on their topic 1–2 turns before any homework bridge.";
    bridge = "ONLY on a later, separate turn: \"Remember the Minecraft aquarium class? Shall we remember YOUR tank?\" Japanese (ひらがな only): 「このまえの まいんくらふとで つくった すいそう、おもいだそうか？」 Wait for yes/ok, then call complete_segment for warmup before recall questions.";
  }
  return [
    "WARMUP / CHAPTER 0 — natural conversation rules:",
    "Talk like a friendly real teacher who is genuinely interested — NOT a quiz bot reading a script.",
    "First turn ONLY: Hello! How are you today? こんにちは！きょうは どうですか？ Then STOP and WAIT.",
    "FORBIDDEN first turn: That's great! / What did you do today? / Hello there / a second How are you / any follow-up before the child answers. ONE how-are-you only.",
    "FORBIDDEN forever on warmup/ch0: any homework 「phrase」の えいごを 選んでね！ / は えいごで？ elicit, glass/sand teaching, I need glass, I need sand, Mini quiz, Chapter 1+ homework lines.",
    "How are you answers: warm varied reaction (That's great! / Glad to hear it! / Hope you feel better! — rotate, don't always That's great!) + EXACTLY What did you do today? きょうは なにを したの？ — NOT Did you eat lunch yet?, NOT Are you hungry?, NOT Thank you / ありがとう (thank-you is only for help or gifts).",
    "CONTENT answers mid-chat (I studied / I went to the cafe / I played…): show real interest — name their words, add a tiny human comment (Was it fun? / Cool! / Sounds hard!), THEN ONE curious follow-up about THAT topic — then STOP and WAIT. FORBIDDEN mid-chat: hollow Oh! then fish-tank invite; robotic You X! What did you X? every turn.",
    "Follow their answer with ONE everyday follow-up question — then STOP and wait for the child. Never two chat questions in one turn.",
    "If they answer no / nothing / とくにない / not really: acknowledge (Okay! / そっか！) and ask ONE DIFFERENT question OR (when ready) the homework invite — NEVER repeat Did you play anything fun? / Did you do anything fun today? / What did you do today? or any question they just answered.",
    "FORBIDDEN mid-chat: everyday follow-up question + homework invite in one bubble. Chat follow-ups and the final invite are different turns.",
    "Over the warmup, 3–4 real Q&A exchanges before the homework invite. Do not invite right after their first activity answer. Do not read a question list.",
    lessonId === "part2"
      ? "INVITE TURN (after ~3 chat exchanges): short reaction that NAMES their last words, THEN Oh! Do you remember the aquarium… (EN then ひらがな). FORBIDDEN: bare Oh! with no reaction. Then WAIT. ANY reply next → Chapter 1."
      : "INVITE TURN (after enough chat): warm short reaction to their last line + Oh! Today… tank help question in the SAME turn (e.g. Okay! Oh! Today I want…). Then WAIT.",
    must,
    bridge,
  ].join(" ");
}

function quizSpeakException(segment) {
  if (segment?.type !== "quiz") return "";
  return [
    "QUIZ SPEAKING EXCEPTION (overrides BEGINNER English-then-Japanese for this segment only):",
    "Ask every quiz question in FULL Japanese ひらがな. Testing = Japanese cue → child answers in English.",
    "Never open a quiz item in English. Never ask Which one means [English phrase]?",
    "Choices may show English phrases; your spoken question and scaffolding stay Japanese.",
  ].join(" ");
}

function noSystemBackendRule() {
  return [
    "CHARACTER ONLY — you are a human teacher talking to a child. NEVER speak like an app, API, or backend.",
    "FORBIDDEN words/phrases (never say these in English or Japanese): timeout, timed out, たいむあうと, タイムアウト, system, backend, API, websocket, connection error, せつぞくエラー, エラーです, サーバ, アプリの不具合.",
    "If you did not hear the child well: ask warmly to repeat — e.g. Sorry, can you say that again? ごめんね、もういちど いってくれる？ — NEVER say timeout.",
    "Never mention timers, remaining time, the app UI, mic, or technical status.",
  ].join(" ");
}

export function buildLessonInstructions(state = loadLessonState(), levelId = ACTIVE_LEVEL_ID) {
  const lesson = getLesson(state.lessonId);
  const segment = getCurrentSegment(state);
  const usesTemplate = usesBeginnerPart1Architecture(state.lessonId, levelId);
  const usesPart2 = usesBeginnerPart2Architecture(state.lessonId, levelId);
  const usesAnyBeginner = usesTemplate || usesPart2;
  const instructionLevel = lesson.instructionLevel || levelId;
  const targets = (segment.targets || [])
    .map((t) => t.phrase)
    .join(" / ");
  const items = (segment.items || [])
    .map((it) => it.promptJa || it.promptEn || it.answer)
    .join("; ");
  const onQuiz = segment?.type === "quiz";
  // Part 2 ending has no free-talk — handle differently
  const onEndingFreeTalk = segment?.id === "ending1" && usesTemplate;
  const onEndingPart2 = segment?.id === "ending1" && usesPart2;

  const raw = [
    "You are ラーニー先生 (Learny), a warm Japanese-English homework tutor for children — like a real human teacher on a video call, not a chatbot script.",
    "This is HOMEWORK between real Minecraft classes — not live co-play. Do not ask them to share a screen or play Minecraft now.",
    conversationQualityRule(),
    usesAnyBeginner ? japaneseElicitBracketRule(instructionLevel, segment) : "",
    noSystemBackendRule(),
    lesson.weekNote,
    lesson.stopRule,
    (onEndingFreeTalk || onEndingPart2) ? "" : scaffoldingLine(instructionLevel),
    quizSpeakException(segment),
    (onEndingFreeTalk || onEndingPart2) ? "" : leadTheTurnRule(instructionLevel),
    warmupRules(segment, usesTemplate ? "part1" : usesPart2 ? "part2" : state.lessonId),
    // Part 1 chapter rules
    segment.id === "ch1" && usesTemplate ? ch1StoryRule() : "",
    segment.id === "ch2" && usesTemplate ? ch2ChoiceRule() : "",
    segment.id === "ch3" && usesTemplate ? ch3StoryRule() : "",
    segment.id === "ch4" && usesTemplate ? ch4StoryRule() : "",
    segment.id === "ch5" && usesTemplate ? ch5StoryRule() : "",
    segment.id === "quiz1" && usesTemplate ? quiz1Rule() : "",
    segment.id === "daily1" && usesTemplate ? daily1Rule() : "",
    segment.id === "ch6" && usesTemplate ? ch6StoryRule() : "",
    segment.id === "final1" && usesTemplate ? final1Rule() : "",
    segment.id === "final1" && usesPart2 ? final1RulePart2() : "",
    segment.id === "ending1" && usesTemplate ? ending1Rule() : "",
    // Part 2 chapter rules
    segment.id === "ch1" && usesPart2 ? ch1RulePart2() : "",
    segment.id === "ch2" && usesPart2 ? ch2RulePart2() : "",
    segment.id === "ch3" && usesPart2 ? ch3RulePart2() : "",
    segment.id === "ch4" && usesPart2 ? ch4RulePart2() : "",
    segment.id === "quiz1" && usesPart2 ? quiz1RulePart2() : "",
    segment.id === "daily1" && usesPart2 ? daily1RulePart2() : "",
    segment.id === "ch5" && usesPart2 ? ch5RulePart2() : "",
    segment.id === "ch6" && usesPart2 ? ch6RulePart2() : "",
    segment.id === "ending1" && usesPart2 ? ending1RulePart2() : "",
    onEndingFreeTalk
      ? ""
      : "If they forget: " +
        (instructionLevel === "intermediate"
          ? "give a spoken hint or model the English, then wait for them to speak. Never treat forgetting as failure."
          : "hint → word choices → 2–3 options → say the English together. Never treat forgetting as failure."),
    onEndingFreeTalk
      ? ""
      : "If they go off-topic: answer 1–3 turns, then return. Conversation over forcing a phrase.",
    onEndingFreeTalk
      ? ""
      : "After success, echo the correct English once. Do not stall on pronunciation or grammar.",
    "Never invent facts about THEIR tank. Only use Known memories or what they just said.",
    memoryBlock(state.memories),
    `Lesson: ${lesson.title} (${lesson.titleEn})`,
    `CURRENT SEGMENT ${state.segmentIndex + 1}/${lesson.segments.length}: ${segment.id} [${segment.type}] ${segment.title}`,
    segment.goal ? `Goal: ${segment.goal}` : "",
    targets ? `Target phrases: ${targets}` : "",
    items ? `Quiz/challenge prompts: ${items}` : "",
    segment.coach || "",
    onEndingFreeTalk
      ? "Tools: record_memory when the child states a fact. NEVER call complete_segment during free talk; only the explicit client 終わりにする action authorizes the controlled Turn C completion. Do not mention tools, badges, awards, or the end control."
      : "Tools: record_memory when the child states a fact (color, place, count). complete_segment when this segment's goal is met (warmup/recall/daily/ending can complete without English). Do not mention badges or awards.",
    onQuiz
      ? instructionLevel === "intermediate"
        ? "REMINDER (quiz): Speak Japanese ひらがな for questions. Child answers in spoken English only — no buttons. Do not use beginner English-then-Japanese on quiz turns."
        : "REMINDER (quiz): Speak Japanese ひらがな for questions. Child answers in English. Do not use beginner English-then-Japanese on quiz turns."
      : instructionLevel === "beginner"
        ? "REMINDER: Every spoken turn = FULL English sentence then FULL matching ひらがな. Never English-only. Never Japanese-only after a short English tag. Never say How are you twice."
        : instructionLevel === "intermediate"
          ? "REMINDER: Intermediate is voice-only — never mention buttons/taps/4-choice. Wait for spoken English."
          : "Sound like a human teacher, not a system.",
  ]
    .filter(Boolean)
    .join("\n");

  return adaptCoachTextForLevel(raw, instructionLevel);
}

export function buildOpeningNudge(state = loadLessonState()) {
  const segment = getCurrentSegment(state);
  const usesTemplate = usesBeginnerPart1Architecture(
    state.lessonId,
    ACTIVE_LEVEL_ID
  );
  if (segment.type === "warmup") {
    return (
      "[Teacher note — do not read this aloud.] CHAPTER 0: greet the child like a real English teacher. " +
      "THIS TURN ONLY — say EXACTLY once then STOP and WAIT for the child: Hello! How are you today? こんにちは！きょうは どうですか？ " +
      "FORBIDDEN this turn: That's great!, What did you do today?, Hello there, a second How are you, any follow-up, Minecraft, tank, " +
      "homework 「phrase」の えいごを 選んでね！ elicits, glass/sand teaching. " +
      "Do NOT continue speaking until the child answers."
    );
  }
  if (usesTemplate && segment.id === "ch1") {
    return ch1StartNudge();
  }
  if (usesBeginnerPart2Architecture(state.lessonId, ACTIVE_LEVEL_ID) && segment.id === "ch1") {
    return ch1StartNudgePart2();
  }
  if (usesTemplate && segment.id === "ch4") {
    return ch4StartNudge();
  }
  if (usesTemplate && segment.id === "ch5") {
    return ch5StartNudge();
  }
  if (usesTemplate && segment.id === "daily1") {
    return daily1StartNudge();
  }
  if (usesTemplate && segment.id === "ch6") {
    return ch6StartNudge();
  }
  if (usesTemplate && segment.id === "quiz1") {
    return quiz1StartNudge();
  }
  if (usesBeginnerPart2Architecture(state.lessonId, ACTIVE_LEVEL_ID) && segment.id === "quiz1") {
    return quiz1StartNudgePart2();
  }
  if (usesTemplate && segment.id === "final1") {
    return final1StartNudge();
  }
  if (usesTemplate && segment.id === "ending1") {
    return ending1StartNudge();
  }
  if (usesBeginnerPart2Architecture(state.lessonId, ACTIVE_LEVEL_ID) && segment.id === "ending1") {
    return ending1StartNudgePart2();
  }
  return (
    `[Teacher note — do not read this aloud as a script.] Start this segment now: ${segment.title}. ${segment.coach} ` +
    "Open with one short beat that ENDS with a question, then wait. Beginner: English then ひらがな with the same meaning."
  );
}

export function buildAdvanceNudge(state = loadLessonState()) {
  const segment = getCurrentSegment(state);
  const usesTemplate = usesBeginnerPart1Architecture(
    state.lessonId,
    ACTIVE_LEVEL_ID
  );
  if (usesTemplate && segment.id === "ch1") {
    return ch1StartNudge();
  }
  if (usesBeginnerPart2Architecture(state.lessonId, ACTIVE_LEVEL_ID) && segment.id === "ch1") {
    return ch1StartNudgePart2();
  }
  if (usesTemplate && segment.id === "ch2") {
    return (
      "[Teacher note — do not read aloud] Chapter 2 start. Speak ONLY: Let's go find some sand! Do you want to go to the beach or the mountains? " +
      "すなを さがしに いこう！ びーちと やま、どっちに いく？ Then WAIT. " +
      "Next beats later: left or right → Is it hot outside? → What can you see around you? → We found some sand! elicit. " +
      "Beginner: English then ひらがな. FORBIDDEN: Keep looking after see / Let me know when you find some sand / put sand in the tank / Chapter 6 / waves / tired."
    );
  }
  if (usesTemplate && segment.id === "ch3") {
    return (
      `[Teacher note — do not read aloud] Chapter 3 starts NOW. Speak EXACTLY: Let's make some glass! ${PART1_ELICIT_JA.ch3NeedGlass} ` +
      "Then WAIT for I need to make glass (4-button). Do NOT say Can you say, I need to make glass. " +
      "FORBIDDEN: I put sand here, put sand in the tank, on the bottom, すいそうにいれ (Chapter 6). " +
      "FORBIDDEN: I put glass here / walls (Chapter 5) and color/dye (Chapter 4)."
    );
  }
  if (usesTemplate && segment.id === "quiz1") {
    return quiz1StartNudge();
  }
  if (usesBeginnerPart2Architecture(state.lessonId, ACTIVE_LEVEL_ID) && segment.id === "quiz1") {
    return quiz1StartNudgePart2();
  }
  if (usesTemplate && segment.id === "ch4") {
    return ch4StartNudge();
  }
  if (usesTemplate && segment.id === "ch5") {
    return ch5StartNudge();
  }
  if (usesTemplate && segment.id === "daily1") {
    return daily1StartNudge();
  }
  if (usesTemplate && segment.id === "ch6") {
    return ch6StartNudge();
  }
  if (usesTemplate && segment.id === "final1") {
    return final1StartNudge();
  }
  if (usesTemplate && segment.id === "ending1") {
    return ending1StartNudge();
  }
  if (usesBeginnerPart2Architecture(state.lessonId, ACTIVE_LEVEL_ID) && segment.id === "ending1") {
    return ending1StartNudgePart2();
  }
  return (
    `[Teacher note] The previous chapter is done. Move to: ${segment.title} (${segment.type}). ${segment.coach} ` +
    "Do not recap everything. One new beat that ENDS with a question, then wait. Beginner: English then ひらがな with the same meaning."
  );
}

/**
 * Short opening after a chapter-boundary Live reconnect.
 * Keep this TINY — long coach text made next-chapter speech take many seconds.
 */
export function buildHandoffOpeningNudge(
  state = loadLessonState(),
  { lastQuote = "", reason = "handoff" } = {}
) {
  const segment = getCurrentSegment(state);
  const usesTemplate = usesBeginnerPart1Architecture(
    state.lessonId,
    ACTIVE_LEVEL_ID
  );
  const usesPart2 = usesBeginnerPart2Architecture(
    state.lessonId,
    ACTIVE_LEVEL_ID
  );
  // Never re-ack the previous chapter's answer on a fixed hinge opening — that made
  // Live praise "I made yellow glass!" while the client already opened Chapter 5,
  // so STT merged praise into the wall-opening bubble.
  const omitQuote =
    segment?.id === "ch6" ||
    segment?.id === "ch5" ||
    segment?.id === "ch4" ||
    segment?.id === "ch3" ||
    segment?.id === "ch2" ||
    segment?.id === "ch1" ||
    segment?.id === "quiz1" ||
    segment?.id === "final1" ||
    segment?.id === "ending1" ||
    segment?.id === "daily1" ||
    reason === "after-daily1" ||
    String(reason || "").includes("daily1") ||
    /^(?:after-|replay-after-)/.test(String(reason || ""));
  const quote = omitQuote ? "" : String(lastQuote || "").trim().slice(0, 60);
  const quoteBit = quote ? ` Child said "${quote}".` : "";
  const retryBit = reason === "stuck_retry" ? " Stuck-retry." : "";

  if (usesPart2 && segment?.id === "ch1") {
    return (
      `[Coach]${retryBit} PART 2 ch1 Beat 1 ONLY. Speak EXACTLY word-for-word ONCE — ENGLISH first, then 「」ひらがな — then WAIT: ` +
      `${PART2_CH1_BEAT1_SPEAK} ` +
      "FORBIDDEN: Japanese-only; starting at 「; paraphrasing; repeating any part; translating the English lead; " +
      "What do I need to make a tank / glass / sand / Thank you tank Step 1 / previous chapter."
    );
  }
  if (usesPart2 && segment?.id === "ch2") {
    return (
      `[Coach]${retryBit} PART 2 ch2 Beat 1 ONLY. Speak EXACTLY word-for-word ONCE — ENGLISH first, then 「」 — then WAIT: ` +
      `${PART2_CH2_BEAT1_SPEAK} ` +
      "FORBIDDEN: Japanese-only; paraphrasing; adding the ocean! / Let's go to the ocean before the child taps; " +
      "repeating the elicit; restarting the same line; previous chapter praise."
    );
  }
  if (usesPart2 && segment?.id === "ch3") {
    return (
      `[Coach]${retryBit} PART 2 ch3 Beat 1 ONLY. Speak EXACTLY word-for-word ONCE then WAIT: ` +
      `${PART2_CH3_BEAT1_SPEAK} ` +
      "FORBIDDEN: paraphrasing; repeating the elicit; restarting the same line after finishing; previous chapter."
    );
  }
  if (usesPart2 && segment?.id === "ch4") {
    return (
      `[Coach]${retryBit} PART 2 ch4 Beat 1 ONLY. Speak EXACTLY word-for-word ONCE then WAIT: ` +
      `${PART2_CH4_BEAT1_SPEAK} ` +
      "FORBIDDEN: paraphrasing; repeating the elicit; restarting the same line; previous chapter."
    );
  }
  if (usesPart2 && segment?.id === "ch5") {
    return (
      `[Coach]${retryBit} PART 2 ch5 Beat A1 ONLY. Speak EXACTLY word-for-word ONCE then WAIT for a number button (1–10): ` +
      `${PART2_CH5_BEAT1_SPEAK} ` +
      "FORBIDDEN: inventing a count; skipping to There are N fish MCQ; previous chapter."
    );
  }
  if (usesPart2 && segment?.id === "daily1") {
    return (
      `[Coach]${retryBit} PART 2 daily1 ONLY. Speak EXACTLY then WAIT: ${daily1OpenSpeakPart2()} ` +
      "FORBIDDEN: Part 1 favourite animal opener / tank-build lines."
    );
  }

  const speakExact = {
    ch1:
      "Thank you! What do I need to make a tank? Something transparent and hard. " +
      "ありがとう！すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。",
    ch2:
      "Let's go find some sand! Do you want to go to the beach or the mountains? " +
      "すなを さがしに いこう！ びーちと やま、どっちに いく？",
    ch3: `Let's make some glass! ${PART1_ELICIT_JA.ch3NeedGlass}`,
    quiz1:
      "くいずたいむ！「がらすが ひつよう」は えいごで？",
    ch4:
      "What's your favorite color? すきな いろは？",
    ch5:
      "Now let's make a tank wall! Where do you want to put the glass? Tell me! すいそうの かべを つくろう！どこに がらすを おく？" +
      PART1_ELICIT_JA.ch5PutGlass,
    daily1: daily1OpenSpeak(),
    ch6: CH6_BEAT1_SPEAK,
    final1: final1OpenSpeak(),
    ending1: "",
  };

  const line = speakExact[segment.id];
  if (usesPart2 && segment.id === "quiz1") {
    const q1 =
      "くいずたいむ！「ここに さんごを おいた」は えいごで？";
    return (
      `[QUIZ]${retryBit} PART 2 MINI QUIZ 1 item 1 ONLY. Your entire audible turn MUST be exactly: ${q1} ` +
      "Start with くいずたいむ — no praise, acknowledgement, readiness question, English, translation, or generic quiz opener before it. " +
      "End after えいごで？ and WAIT. Speak this script once; do not split it into separate turns. " +
      "FORBIDDEN: じゃあ つぎは / item 2 「この おさかなが ほしい」 / item 3 / Perfect / Great / previous chapter."
    );
  }
  if (usesTemplate && segment.id === "quiz1") {
    return (
      `[QUIZ]${retryBit} MINI QUIZ 1 item 1 ONLY. Your entire audible turn MUST be exactly: ${line} ` +
      "Start with くいずたいむ — no praise, acknowledgement, readiness question, English, translation, or generic quiz opener before it. " +
      "End after えいごで？ and WAIT. Speak this script once; do not split it into separate turns. " +
      "FORBIDDEN: Perfect, Great, Let's do a quick quiz, くいずをしよう, previous chapter."
    );
  }
  if (usesTemplate && segment.id === "final1") {
    return (
      `[Coach]${retryBit} final1 ONLY. Speak EXACTLY ONE turn (no wait): ${final1OpenSpeak()} ` +
      "then IMMEDIATELY the first listed 〜は えいごで？ cue from coach (ひらがな only). " +
      "FORBIDDEN: Are you ready? / じゅんびは できてる？ / praising previous chapter / Child said My tank is ready."
    );
  }
  if (usesTemplate && segment.id === "ch6") {
    return (
      `[Coach]${retryBit} ch6 ONLY. Speak EXACTLY Beat 1 then WAIT: ${CH6_BEAT1_SPEAK} ` +
      "FORBIDDEN: reacting to Daily English / favourite animal / pet names / トイプードル / previous chat. " +
      "FORBIDDEN: previous chapter."
    );
  }
  if (usesTemplate && segment.id === "ending1") {
    return (
      `[Coach]${retryBit} ending1 ONLY. Stay SILENT — client owns Turn A audio. Do not say Perfect / Hold on / what kind of fish.`
    );
  }
  if (usesPart2 && segment.id === "ending1") {
    return (
      `[Coach]${retryBit} ending1 ONLY. Stay SILENT — client owns Part 2 Ending Turn A. ` +
      "Do not say Perfect / aquarium remembered until the client sends the exact script."
    );
  }
  if (usesTemplate && line) {
    return (
      `[Coach]${retryBit}${quoteBit} ${segment.id} ONLY. Speak EXACTLY then WAIT: ${line} ` +
      "FORBIDDEN: previous chapter / tank invite / How are you / praising the previous answer " +
      "(no That's awesome / Great job / I made … glass reaction before this opening)."
    );
  }

  const start = buildOpeningNudge(state).replace(/^\[Teacher note[^\]]*\]\s*/i, "");
  return (
    `[Coach]${retryBit}${quoteBit} ${segment.id} ONLY. One short opening, then WAIT. ${start.slice(0, 280)}`
  );
}

export function getClickChoices(segment) {
  if (!segment || segment.input !== "speak_or_click") return [];
  return (segment.items || []).map((it) => ({
    label: it.promptJa || it.promptEn || it.answer,
    answer: it.answer,
    patterns: it.patterns || [],
    choices: it.choices || [it.answer],
  }));
}
