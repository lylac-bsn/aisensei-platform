/**
 * Activity feed for the admin progress tab.
 * Aquarium lesson logging was removed with the curriculum; keep a stub so
 * admin.html can load after login without a 404.
 */

/** @returns {Promise<Array>} */
export async function fetchUserActivity(_db, _userId, _limit = 100) {
  return [];
}

export const ACTIVITY_TYPES = Object.freeze({
  SKIP: "skip",
  BADGE: "badge",
  BADGE_REVOKE: "badge_revoke",
  RESET: "reset",
  MCQ_CORRECT: "mcq_correct",
  MCQ_INCORRECT: "mcq_incorrect",
  POKE: "poke",
});
