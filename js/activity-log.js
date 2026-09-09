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

function isLessonActivity(ev, levelId, lessonId) {
  if (!ev) return false;
  if (ev.level && ev.level !== levelId) return false;
  if (ev.lessonId) return ev.lessonId === lessonId;
  // Legacy events can only be attributed safely to Beginner Part 1.
  if (levelId !== "beginner" || lessonId !== "part1") return false;
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
 * Wipe one level/part's activity docs and scoped rollups shown in admin.
 * Then caller should log a fresh reset event.
 */
export async function wipeLessonHistory(db, userId, levelId, lessonId) {
  if (!db || !userId || !levelId || !lessonId) return;
  const userRef = doc(db, "users", userId);

  // Clear only the selected Part while preserving its sibling.
  try {
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() || {} : {};
    const mcqStats = data.mcqStats || {};
    const levelMcq =
      mcqStats[levelId] && typeof mcqStats[levelId] === "object"
        ? { ...mcqStats[levelId] }
        : {};
    delete levelMcq[lessonId];
    if (levelId === "beginner" && lessonId === "part1") {
      for (const key of Object.keys(levelMcq)) {
        if (key === "part2") continue;
        const seg = String(key).split(".")[0];
        if (PART1_SEGMENT_IDS.has(seg)) delete levelMcq[key];
      }
    }
    const levelPokes =
      data.pokeStats?.[levelId] &&
      typeof data.pokeStats[levelId] === "object"
        ? { ...data.pokeStats[levelId] }
        : {};
    delete levelPokes[lessonId];
    levelPokes.total = ["part1", "part2"].reduce(
      (sum, part) => sum + (Number(levelPokes[part]?.total) || 0),
      0
    );
    const levelSkips =
      data.skipStats?.[levelId] &&
      typeof data.skipStats[levelId] === "object"
        ? { ...data.skipStats[levelId] }
        : {};
    delete levelSkips[lessonId];
    if (levelId === "beginner" && lessonId === "part1") {
      for (const key of Object.keys(levelSkips)) {
        if (key !== "part2") delete levelSkips[key];
      }
    }

    await updateDoc(userRef, {
      [`mcqStats.${levelId}`]: levelMcq,
      [`pokeStats.${levelId}`]: levelPokes,
      [`skipStats.${levelId}`]: levelSkips,
    });
  } catch {
    // ignore
  }

  // Delete every activity row belonging to this level/part.
  try {
    const col = collection(db, "users", userId, "activity");
    // Reset means all matching history, not only the most recent page.
    const snap = await getDocs(col);
    const toDelete = snap.docs.filter((d) =>
      isLessonActivity(d.data(), levelId, lessonId)
    );
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
 *   lessonId?: string|null,
 *   questIndex?: number|null,
 *   questTitle?: string|null,
 *   badgeId?: string|null,
 *   segmentId?: string|null,
 *   beatId?: string|null,
 *   choice?: string|null,
 *   answer?: string|null,
 *   correct?: boolean|null,
 *   attempt?: number|null,
 *   playId?: number|null,
 *   firstTry?: boolean|null,
 *   learnyPrompt?: string|null,
 *   source?: 'client'|'admin',
 * }} event
 */
export async function logUserActivity(db, userId, event) {
  if (!db || !userId || !event?.type) return;

  const payload = {
    type: String(event.type),
    level: event.level || null,
    lessonId: event.lessonId === "part1" || event.lessonId === "part2"
      ? event.lessonId
      : null,
    questIndex: Number.isFinite(event.questIndex) ? event.questIndex : null,
    questTitle: event.questTitle ? String(event.questTitle).slice(0, 120) : null,
    badgeId: event.badgeId ? String(event.badgeId) : null,
    segmentId: event.segmentId ? String(event.segmentId).slice(0, 40) : null,
    beatId: event.beatId ? String(event.beatId).slice(0, 40) : null,
    choice: event.choice ? String(event.choice).slice(0, 120) : null,
    answer: event.answer ? String(event.answer).slice(0, 120) : null,
    correct: typeof event.correct === "boolean" ? event.correct : null,
    attempt: Number.isFinite(event.attempt) ? event.attempt : null,
    playId: Number.isFinite(event.playId) ? event.playId : null,
    firstTry: typeof event.firstTry === "boolean" ? event.firstTry : null,
    learnyPrompt: event.learnyPrompt ? String(event.learnyPrompt).slice(0, 200) : null,
    source: event.source === "admin" ? "admin" : "client",
    at: serverTimestamp(),
  };

  // A full lesson reset must wipe old rows before the new reset row is
  // written; otherwise the wipe also deletes the reset event itself.
  const isFullHistoryWipe =
    payload.type === ACTIVITY_TYPES.RESET &&
    event.wipeLessonHistory &&
    payload.level &&
    payload.lessonId;
  if (isFullHistoryWipe) {
    await wipeLessonHistory(db, userId, payload.level, payload.lessonId);
  }

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
    const lessonId = payload.lessonId || "part1";
    const fieldBase = `mcqStats.${payload.level || "beginner"}.${lessonId}.${key}`;
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
    const lessonId = payload.lessonId || "part1";
    const updates = {
      [`pokeStats.${level}.total`]: increment(1),
      [`pokeStats.${level}.${lessonId}.total`]: increment(1),
    };
    if (payload.segmentId) {
      updates[`pokeStats.${level}.${lessonId}.${payload.segmentId}`] = increment(1);
    }
    try {
      await updateDoc(doc(db, "users", userId), updates);
    } catch {
      // ignore — event row is enough for timeline
    }
  }

  if (payload.type === ACTIVITY_TYPES.RESET && payload.level) {
    try {
      if (!isFullHistoryWipe) {
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
