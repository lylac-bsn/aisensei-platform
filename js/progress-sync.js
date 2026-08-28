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
  loadBadgeRevocations,
  saveEarnedLessonBadges,
} from "./lesson-engine.js";

let syncTimer = null;

function normalizeBadgeList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id)).filter(Boolean))];
}

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

export async function pullAndMergeBadges(db, userId) {
  if (!db || !userId) return loadEarnedLessonBadges();
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return loadEarnedLessonBadges();
    const data = snap.data();
    const merged = mergeBadgeLists(
      loadEarnedLessonBadges(),
      normalizeBadgeList(data.lessonBadges),
      [...normalizeBadgeList(data.badgeRevocations), ...loadBadgeRevocations()]
    );
    saveEarnedLessonBadges(merged);
    return merged;
  } catch {
    return loadEarnedLessonBadges();
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
      // continue
    }
    const revoked = [
      ...new Set([
        ...normalizeBadgeList(cloudData.badgeRevocations),
        ...loadBadgeRevocations(),
      ]),
    ];
    const localBadges = loadEarnedLessonBadges();
    const stillRevoked = revoked.filter((id) => !localBadges.includes(id));
    const mergedBadges = mergeBadgeLists(
      localBadges,
      normalizeBadgeList(cloudData.lessonBadges),
      stillRevoked
    );
    saveEarnedLessonBadges(mergedBadges);

    const snapshot = buildProgressSnapshot();
    snapshot.lessonBadges = mergedBadges;
    const field = getActiveLevelInfo().firestoreField;
    await updateDoc(userRef, {
      [field]: snapshot,
      lessonBadges: mergedBadges,
      badgeRevocations: stillRevoked,
      progressUpdatedAt: serverTimestamp(),
    });
  } catch {
    // ignore
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

export async function adminGrantBadge(db, userId, badgeId) {
  if (!db || !userId || !badgeId) return false;
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return false;
  const data = snap.data();
  const badges = new Set(normalizeBadgeList(data.lessonBadges));
  badges.add(badgeId);
  const revocations = normalizeBadgeList(data.badgeRevocations).filter(
    (id) => id !== badgeId
  );
  await updateDoc(userRef, {
    lessonBadges: [...badges],
    badgeRevocations: revocations,
    progressUpdatedAt: serverTimestamp(),
  });
  return true;
}

export async function adminRevokeBadge(db, userId, badgeId) {
  if (!db || !userId || !badgeId) return false;
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return false;
  const data = snap.data();
  const badges = normalizeBadgeList(data.lessonBadges).filter((id) => id !== badgeId);
  const revocations = new Set(normalizeBadgeList(data.badgeRevocations));
  revocations.add(badgeId);
  await updateDoc(userRef, {
    lessonBadges: badges,
    badgeRevocations: [...revocations],
    progressUpdatedAt: serverTimestamp(),
  });
  return true;
}
