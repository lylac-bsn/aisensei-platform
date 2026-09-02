/**
 * Student activity events for the admin dashboard (poke, MCQ, stars, resets).
 * Stored at users/{uid}/activity/{id}. Poke counts roll up into users.pokeStats.
 */
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export const ACTIVITY_TYPES = Object.freeze({
  SKIP: "skip", // legacy — skip button removed
  STAR: "star",
  BADGE: "badge",
  BADGE_REVOKE: "badge_revoke",
  RESET: "reset",
  MCQ_CORRECT: "mcq_correct",
  MCQ_INCORRECT: "mcq_incorrect",
  POKE: "poke",
});

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} userId
 * @param {{
 *   type: string,
 *   level?: string|null,
 *   questIndex?: number|null,
 *   questTitle?: string|null,
 *   badgeId?: string|null,
 *   segmentId?: string|null,
 *   beatId?: string|null,
 *   choice?: string|null,
 *   answer?: string|null,
 *   correct?: boolean|null,
 *   attempt?: number|null,
 *   learnyPrompt?: string|null,
 *   source?: 'client'|'admin',
 * }} event
 */
export async function logUserActivity(db, userId, event) {
  if (!db || !userId || !event?.type) return;

  const payload = {
    type: String(event.type),
    level: event.level || null,
    questIndex: Number.isFinite(event.questIndex) ? event.questIndex : null,
    questTitle: event.questTitle ? String(event.questTitle).slice(0, 120) : null,
    badgeId: event.badgeId ? String(event.badgeId) : null,
    segmentId: event.segmentId ? String(event.segmentId).slice(0, 40) : null,
    beatId: event.beatId ? String(event.beatId).slice(0, 40) : null,
    choice: event.choice ? String(event.choice).slice(0, 120) : null,
    answer: event.answer ? String(event.answer).slice(0, 120) : null,
    correct: typeof event.correct === "boolean" ? event.correct : null,
    attempt: Number.isFinite(event.attempt) ? event.attempt : null,
    learnyPrompt: event.learnyPrompt ? String(event.learnyPrompt).slice(0, 200) : null,
    source: event.source === "admin" ? "admin" : "client",
    at: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "users", userId, "activity"), payload);
  } catch {
    return;
  }

  if (
    payload.type === ACTIVITY_TYPES.SKIP &&
    payload.level &&
    Number.isFinite(payload.questIndex)
  ) {
    try {
      await updateDoc(doc(db, "users", userId), {
        [`skipStats.${payload.level}.${payload.questIndex}`]: increment(1),
      });
    } catch {
      // ignore — event row is enough for timeline
    }
  }

  if (
    (payload.type === ACTIVITY_TYPES.MCQ_CORRECT ||
      payload.type === ACTIVITY_TYPES.MCQ_INCORRECT) &&
    payload.segmentId &&
    payload.beatId
  ) {
    const key = `${payload.segmentId}.${payload.beatId}`;
    const fieldBase = `mcqStats.${payload.level || "beginner"}.${key}`;
    try {
      await updateDoc(doc(db, "users", userId), {
        [`${fieldBase}.attempts`]: increment(1),
        [`${fieldBase}.correct`]: increment(payload.type === ACTIVITY_TYPES.MCQ_CORRECT ? 1 : 0),
        [`${fieldBase}.incorrect`]: increment(payload.type === ACTIVITY_TYPES.MCQ_INCORRECT ? 1 : 0),
        [`${fieldBase}.lastChoice`]: payload.choice || "",
        [`${fieldBase}.lastAt`]: serverTimestamp(),
      });
    } catch {
      // ignore
    }
  }

  if (payload.type === ACTIVITY_TYPES.POKE) {
    const level = payload.level || "beginner";
    const updates = {
      [`pokeStats.${level}.total`]: increment(1),
    };
    if (payload.segmentId) {
      updates[`pokeStats.${level}.${payload.segmentId}`] = increment(1);
    }
    try {
      await updateDoc(doc(db, "users", userId), updates);
    } catch {
      // ignore — event row is enough for timeline
    }
  }

  if (payload.type === ACTIVITY_TYPES.RESET && payload.level) {
    try {
      // Drop rollup MCQ totals for this level so admin does not resurrect pre-reset clicks.
      await updateDoc(doc(db, "users", userId), {
        [`mcqStats.${payload.level}`]: {},
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Recent activity for one student (newest first).
 * @returns {Promise<Array<object>>}
 */
export async function fetchUserActivity(db, userId, max = 80) {
  if (!db || !userId) return [];
  try {
    const q = query(
      collection(db, "users", userId, "activity"),
      orderBy("at", "desc"),
      limit(max)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/** Sum skip counts from users.skipStats for one level (or all). Legacy. */
export function totalSkipCount(skipStats, levelId = null) {
  if (!skipStats || typeof skipStats !== "object") return 0;
  const levels = levelId ? [levelId] : Object.keys(skipStats);
  let sum = 0;
  for (const level of levels) {
    const map = skipStats[level];
    if (!map || typeof map !== "object") continue;
    for (const n of Object.values(map)) {
      sum += Number(n) || 0;
    }
  }
  return sum;
}

/** Per-mission skip count for a level. Legacy. */
export function skipCountForMission(skipStats, levelId, questIndex) {
  const n = skipStats?.[levelId]?.[String(questIndex)] ?? skipStats?.[levelId]?.[questIndex];
  return Number(n) || 0;
}

/** Sum poke counts from users.pokeStats (prefers `.total`, else sums segment keys). */
export function totalPokeCount(pokeStats, levelId = null) {
  if (!pokeStats || typeof pokeStats !== "object") return 0;
  const levels = levelId ? [levelId] : Object.keys(pokeStats);
  let sum = 0;
  for (const level of levels) {
    const map = pokeStats[level];
    if (!map || typeof map !== "object") continue;
    if (Number.isFinite(Number(map.total))) {
      sum += Number(map.total) || 0;
      continue;
    }
    for (const [k, n] of Object.entries(map)) {
      if (k === "total") continue;
      sum += Number(n) || 0;
    }
  }
  return sum;
}
