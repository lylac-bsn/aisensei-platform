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
} from "./lesson-engine.js?v=20260921-admin-part-split";
import {
  normalizeIdList,
  resolveClaimedBadgeIds,
  resolvePendingBadgeIds,
} from "./progress-contract.js?v=20260921-admin-part-split";

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
    const field = getActiveLevelInfo().firestoreField;
    const mergedBadges = mergeBadgeLists(
      localBadges,
      resolveClaimedBadgeIds(cloudData, field),
      stillRevoked
    );
    saveEarnedLessonBadges(mergedBadges);
    const mergedPending = mergeBadgeLists(
      localPending,
      resolvePendingBadgeIds(cloudData, field),
      stillRevoked
    ).filter((id) => !mergedBadges.includes(id));
    savePendingLessonBadges(mergedPending);

    // Merge cloud part1/part2 so a Part-1-only device never blanks Part 2 in admin.
    const cloudLevel =
      cloudData[field] && typeof cloudData[field] === "object"
        ? cloudData[field]
        : {};
    const snapshot = buildProgressSnapshot(
      getActiveLevelInfo().id,
      cloudLevel
    );
    snapshot.lessonBadges = mergedBadges;
    snapshot.claimedLessonBadgeIds = mergedBadges;
    snapshot.pendingLessonBadgeIds = mergedPending;
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

function badgePrefixOf(badgeId) {
  const m = String(badgeId || "").match(
    /^(.*?)_(chapter|freetalk|accuracy)_(bronze|silver|gold)$/
  );
  return m ? m[1] : "";
}

function levelFieldForBadge(badgeId) {
  const prefix = badgePrefixOf(badgeId);
  if (prefix.startsWith("intermediate_")) return "intermediateProgress";
  if (prefix.startsWith("advanced_")) return "advancedProgress";
  return "beginnerProgress";
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
  const field = levelFieldForBadge(badgeId);
  const level = data[field] && typeof data[field] === "object" ? data[field] : {};
  const claimed = new Set(
    normalizeBadgeList(level.claimedLessonBadgeIds || level.lessonBadges)
  );
  claimed.add(badgeId);
  const pending = normalizeBadgeList(level.pendingLessonBadgeIds).filter(
    (id) => id !== badgeId
  );
  await updateDoc(userRef, {
    lessonBadges: [...badges],
    claimedLessonBadgeIds: [...badges],
    badgeRevocations: revocations,
    [`${field}.claimedLessonBadgeIds`]: [...claimed],
    [`${field}.lessonBadges`]: [...claimed],
    [`${field}.pendingLessonBadgeIds`]: pending,
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
  const badges = normalizeBadgeList(data.lessonBadges).filter(
    (id) => id !== badgeId
  );
  const revocations = new Set(normalizeBadgeList(data.badgeRevocations));
  revocations.add(badgeId);
  const field = levelFieldForBadge(badgeId);
  const level = data[field] && typeof data[field] === "object" ? data[field] : {};
  const claimed = normalizeBadgeList(
    level.claimedLessonBadgeIds || level.lessonBadges
  ).filter((id) => id !== badgeId);
  const pending = normalizeBadgeList(level.pendingLessonBadgeIds).filter(
    (id) => id !== badgeId
  );
  await updateDoc(userRef, {
    lessonBadges: badges,
    claimedLessonBadgeIds: badges,
    badgeRevocations: [...revocations],
    [`${field}.claimedLessonBadgeIds`]: claimed,
    [`${field}.lessonBadges`]: claimed,
    [`${field}.pendingLessonBadgeIds`]: pending,
    progressUpdatedAt: serverTimestamp(),
  });
  return true;
}
