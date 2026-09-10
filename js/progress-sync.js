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
  loadPendingLessonBadges,
  loadBadgeRevocations,
  saveEarnedLessonBadges,
  savePendingLessonBadges,
} from "./lesson-engine.js?v=20260910-ch6-mcq-show-2";
import {
  normalizeIdList,
  resolveClaimedBadgeIds,
  resolvePendingBadgeIds,
} from "./progress-contract.js?v=20260910-ch6-mcq-show-2";

let syncTimer = null;
let syncContext = null;
let storageSyncBound = false;

function normalizeBadgeList(raw) {
  return normalizeIdList(raw);
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
    const field = getActiveLevelInfo().firestoreField;
    const localBadges = loadEarnedLessonBadges();
    const localPending = loadPendingLessonBadges();
    const revoked = [
      ...normalizeBadgeList(data.badgeRevocations),
      ...loadBadgeRevocations(),
    ];
    const protectedIds = new Set([...localBadges, ...localPending]);
    const stillRevoked = revoked.filter((id) => !protectedIds.has(id));
    const merged = mergeBadgeLists(
      localBadges,
      resolveClaimedBadgeIds(data, field),
      stillRevoked
    );
    saveEarnedLessonBadges(merged);
    const pending = mergeBadgeLists(
      localPending,
      resolvePendingBadgeIds(data, field),
      stillRevoked
    ).filter((id) => !merged.includes(id));
    savePendingLessonBadges(pending);
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
    const localPending = loadPendingLessonBadges();
    // Pending うけとる receipts are intentionally re-earned after a wipe.
    // Do not treat them as still-revoked or sync will delete them before claim.
    const protectedIds = new Set([...localBadges, ...localPending]);
    const stillRevoked = revoked.filter((id) => !protectedIds.has(id));
    const mergedBadges = mergeBadgeLists(
      localBadges,
      resolveClaimedBadgeIds(
        cloudData,
        getActiveLevelInfo().firestoreField
      ),
      stillRevoked
    );
    saveEarnedLessonBadges(mergedBadges);
    const mergedPending = mergeBadgeLists(
      localPending,
      resolvePendingBadgeIds(
        cloudData,
        getActiveLevelInfo().firestoreField
      ),
      stillRevoked
    ).filter((id) => !mergedBadges.includes(id));
    savePendingLessonBadges(mergedPending);

    const snapshot = buildProgressSnapshot();
    snapshot.lessonBadges = mergedBadges;
    snapshot.claimedLessonBadgeIds = mergedBadges;
    snapshot.pendingLessonBadgeIds = mergedPending;
    const field = getActiveLevelInfo().firestoreField;
    await updateDoc(userRef, {
      [field]: snapshot,
      claimedLessonBadgeIds: mergedBadges,
      pendingLessonBadgeIds: mergedPending,
      lessonBadges: mergedBadges,
      badgeRevocations: stillRevoked,
      progressUpdatedAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

export function initProgressSync(db, userId) {
  syncContext = { db, userId };
  if (!storageSyncBound && typeof window !== "undefined") {
    storageSyncBound = true;
    window.addEventListener("storage", (event) => {
      if (
        !syncContext ||
        !(
          event.key === "gc_homework_lessonBadges" ||
          event.key === "gc_homework_pendingLessonBadges" ||
          event.key === "gc_hw_badge_revocations" ||
          String(event.key || "").startsWith("gc_hw_")
        )
      ) {
        return;
      }
      scheduleProgressSync(syncContext.db, syncContext.userId);
    });
  }
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
