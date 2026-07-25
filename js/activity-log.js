/**
 * Student activity events for the admin dashboard (skips, stars, badges, resets).
 * Stored at users/{uid}/activity/{id}. Skip counts also roll up into users.skipStats.
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
  SKIP: "skip",
  STAR: "star",
  BADGE: "badge",
  BADGE_REVOKE: "badge_revoke",
  RESET: "reset",
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

/** Sum skip counts from users.skipStats for one level (or all). */
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

/** Per-mission skip count for a level. */
export function skipCountForMission(skipStats, levelId, questIndex) {
  const n = skipStats?.[levelId]?.[String(questIndex)] ?? skipStats?.[levelId]?.[questIndex];
  return Number(n) || 0;
}
