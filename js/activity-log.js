/**
 * Student activity events for the admin dashboard (poke, MCQ, resets).
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
  writeBatch,
  increment,
  serverTimestamp,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { AQUARIUM_PART1 } from "./lessons/aquarium-part1.js";

export const ACTIVITY_TYPES = Object.freeze({
  SKIP: "skip", // legacy — skip button removed
  BADGE: "badge",
  BADGE_REVOKE: "badge_revoke",
  RESET: "reset",
  MCQ_CORRECT: "mcq_correct",
  MCQ_INCORRECT: "mcq_incorrect",
  POKE: "poke",
});

const PART1_SEGMENT_IDS = new Set(
  (AQUARIUM_PART1.segments || []).map((s) => s.id).concat(["part1"])
);

function isBeginnerPart1Activity(ev) {
  if (!ev) return false;
  if (ev.level && ev.level !== "beginner") return false;
  if (ev.badgeId && String(ev.badgeId).startsWith("p1_")) return true;
  if (ev.segmentId && PART1_SEGMENT_IDS.has(String(ev.segmentId))) return true;
  if (ev.questTitle === "part1") return true;
  // MCQ questTitle like "ch1/need_glass"
  const qt = String(ev.questTitle || "");
  const segFromQuest = qt.split("/")[0];
  if (segFromQuest && PART1_SEGMENT_IDS.has(segFromQuest)) return true;
  return false;
}

/**
 * Wipe Beginner Part 1 activity docs + part1 keys from mcqStats.beginner.
 * Then caller should log a fresh reset event.
 */
export async function wipeBeginnerPart1History(db, userId) {
  if (!db || !userId) return;
  const userRef = doc(db, "users", userId);

  // Clear part1 keys from mcqStats.beginner (keep other segment keys if any).
  try {
    const snap = await getDoc(userRef);
    const mcqStats = snap.exists() ? snap.data()?.mcqStats || {} : {};
    const beginnerMap =
      mcqStats.beginner && typeof mcqStats.beginner === "object"
        ? { ...mcqStats.beginner }
        : {};
    for (const key of Object.keys(beginnerMap)) {
      const seg = String(key).split(".")[0];
      if (PART1_SEGMENT_IDS.has(seg)) delete beginnerMap[key];
    }
    await updateDoc(userRef, {
      "mcqStats.beginner": beginnerMap,
    });
  } catch {
    // ignore
  }

  // Delete activity docs for beginner part1 (paginate in batches of 400).
  try {
    const col = collection(db, "users", userId, "activity");
    // Fetch recent large window — enough for homework sessions.
    const q = query(col, orderBy("at", "desc"), limit(500));
    const snap = await getDocs(q);
    const toDelete = snap.docs.filter((d) => isBeginnerPart1Activity(d.data()));
    for (let i = 0; i < toDelete.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of toDelete.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch {
    // ignore — reset event still logs
  }
}
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
      if (event.wipePart1History && payload.level === "beginner") {
        await wipeBeginnerPart1History(db, userId);
      } else {
        // Drop rollup MCQ totals for this level so admin does not resurrect pre-reset clicks.
        await updateDoc(doc(db, "users", userId), {
          [`mcqStats.${payload.level}`]: {},
        });
      }
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
