import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  buildProgressSnapshot,
  getActiveLevelInfo,
  loadEarnedLessonBadges,
  LESSON_BADGES_KEY,
} from "./quest-engine.js";

let syncTimer = null;

function normalizeBadgeList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id)).filter(Boolean))];
}

function readLocalBadges() {
  return normalizeBadgeList(loadEarnedLessonBadges());
}

function writeLocalBadges(ids) {
  try {
    localStorage.setItem(LESSON_BADGES_KEY, JSON.stringify(normalizeBadgeList(ids)));
  } catch {
    // ignore
  }
}

/**
 * Merge cloud badges into localStorage.
 * Revocations strip badges unless the child still has them only via a fresh earn
 * — we drop revoked ids from local, and clear revocation entries for ids the
 * child currently has locally when syncing up (re-earn after revoke).
 */
export function mergeBadgeLists(localIds, cloudIds, revocations = []) {
  const revoked = new Set(normalizeBadgeList(revocations));
  const merged = new Set();
  for (const id of normalizeBadgeList(cloudIds)) {
    if (!revoked.has(id)) merged.add(id);
  }
  for (const id of normalizeBadgeList(localIds)) {
    if (!revoked.has(id)) merged.add(id);
  }
  return [...merged];
}

function collectCloudBadges(userData) {
  if (!userData || typeof userData !== "object") return [];
  const fromTop = normalizeBadgeList(userData.lessonBadges);
  const fromLevels = ["beginnerProgress", "intermediateProgress", "advancedProgress"]
    .map((field) => normalizeBadgeList(userData[field]?.lessonBadges))
    .flat();
  return normalizeBadgeList([...fromTop, ...fromLevels]);
}

/** Pull cloud badges → local (honoring revocations). */
export async function pullAndMergeBadges(db, userId) {
  if (!db || !userId) return readLocalBadges();
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return readLocalBadges();
    const data = snap.data();
    const merged = mergeBadgeLists(
      readLocalBadges(),
      collectCloudBadges(data),
      data.badgeRevocations
    );
    writeLocalBadges(merged);
    return merged;
  } catch {
    return readLocalBadges();
  }
}

export async function syncProgressToFirestore(db, userId) {
  if (!db || !userId) return;

  try {
    const userRef = doc(db, "users", userId);
    let cloudData = {};
    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) cloudData = snap.data();
    } catch {
      // continue with local-only
    }

    const revoked = normalizeBadgeList(cloudData.badgeRevocations);
    const localBadges = readLocalBadges();
    // Re-earn after admin revoke: drop those ids from revocations.
    const stillRevoked = revoked.filter((id) => !localBadges.includes(id));
    const mergedBadges = mergeBadgeLists(
      localBadges,
      collectCloudBadges(cloudData),
      stillRevoked
    );
    writeLocalBadges(mergedBadges);

    const snapshot = buildProgressSnapshot();
    snapshot.lessonBadges = mergedBadges;
    snapshot.badgeCount = mergedBadges.length;

    const field = getActiveLevelInfo().firestoreField;
    const patch = {
      [field]: snapshot,
      lessonBadges: mergedBadges,
      badgeRevocations: stillRevoked,
      progressUpdatedAt: serverTimestamp(),
    };
    await updateDoc(userRef, patch);
  } catch {
    // ignore network / permission errors
  }
}

export function initProgressSync(db, userId) {
  pullAndMergeBadges(db, userId).finally(() => {
    syncProgressToFirestore(db, userId);
  });
}

export function scheduleProgressSync(db, userId) {
  if (!db || !userId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncProgressToFirestore(db, userId);
  }, 1500);
}

/**
 * Admin: grant a badge. Clears any revocation for that id.
 */
export async function adminGrantBadge(db, userId, badgeId) {
  if (!db || !userId || !badgeId) return false;
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return false;
  const data = snap.data();
  const badges = new Set(collectCloudBadges(data));
  badges.add(badgeId);
  const revocations = normalizeBadgeList(data.badgeRevocations).filter(
    (id) => id !== badgeId
  );
  const list = [...badges];
  const patch = {
    lessonBadges: list,
    badgeRevocations: revocations,
    progressUpdatedAt: serverTimestamp(),
  };
  for (const field of ["beginnerProgress", "intermediateProgress", "advancedProgress"]) {
    if (data[field] && typeof data[field] === "object") {
      patch[field] = {
        ...data[field],
        lessonBadges: list,
        badgeCount: list.length,
      };
    }
  }
  await updateDoc(userRef, patch);
  return true;
}

/**
 * Admin: revoke a badge and remember the revocation so student sync won't restore it
 * until they earn it again in-app.
 */
export async function adminRevokeBadge(db, userId, badgeId) {
  if (!db || !userId || !badgeId) return false;
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return false;
  const data = snap.data();
  const badges = collectCloudBadges(data).filter((id) => id !== badgeId);
  const revocations = new Set(normalizeBadgeList(data.badgeRevocations));
  revocations.add(badgeId);
  const list = badges;
  const revoked = [...revocations];
  const patch = {
    lessonBadges: list,
    badgeRevocations: revoked,
    progressUpdatedAt: serverTimestamp(),
  };
  for (const field of ["beginnerProgress", "intermediateProgress", "advancedProgress"]) {
    if (data[field] && typeof data[field] === "object") {
      patch[field] = {
        ...data[field],
        lessonBadges: list,
        badgeCount: list.length,
      };
    }
  }
  await updateDoc(userRef, patch);
  return true;
}
