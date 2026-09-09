/**
 * Pure normalization helpers shared by student sync and the admin dashboard.
 *
 * Contract v2:
 * - claimedLessonBadgeIds is the only earned/visible badge source of truth.
 * - pendingLessonBadgeIds is reported separately and is never rendered earned.
 * - mcqLog is the canonical lifetime click stream when present.
 * - mcqBadgeFirstTry + mcqBadgePlay are latest-play badge facts.
 * - mcqBadgeFirstTryBest (+ first correct play in mcqLog) is the sticky
 *   いっぱつせいかい score used for accuracy ranks across replays.
 */

export const PROGRESS_CONTRACT_VERSION = 2;

export function normalizeIdList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || "").trim()).filter(Boolean))];
}

function withoutRevoked(ids, revocations) {
  const revoked = new Set(normalizeIdList(revocations));
  return normalizeIdList(ids).filter((id) => !revoked.has(id));
}

/**
 * Resolve claimed badges conservatively. A scoped level snapshot outranks the
 * historical global lessonBadges rollup, which could contain an unclaimed
 * award from the old ceremony flow.
 */
export function resolveClaimedBadgeIds(user, levelField = null) {
  const root = user && typeof user === "object" ? user : {};
  const level =
    levelField && root[levelField] && typeof root[levelField] === "object"
      ? root[levelField]
      : null;
  let ids = [];

  if (level && Array.isArray(level.claimedLessonBadgeIds)) {
    ids = level.claimedLessonBadgeIds;
  } else if (Array.isArray(root.claimedLessonBadgeIds)) {
    ids = root.claimedLessonBadgeIds;
  } else if (level && Array.isArray(level.lessonBadges)) {
    // Legacy scoped snapshots are safer than the stale global rollup.
    ids = level.lessonBadges;
  } else {
    ids = root.lessonBadges;
  }

  return withoutRevoked(ids, [
    ...normalizeIdList(root.badgeRevocations),
    ...normalizeIdList(level?.badgeRevocations),
  ]);
}

/**
 * Resolve pending (unclaimed) badge receipts. Local re-awards after a wipe are
 * protected by sync merging — this helper only normalizes cloud/local lists.
 */
export function resolvePendingBadgeIds(user, levelField = null) {
  const root = user && typeof user === "object" ? user : {};
  const level =
    levelField && root[levelField] && typeof root[levelField] === "object"
      ? root[levelField]
      : null;
  const claimed = new Set(resolveClaimedBadgeIds(root, levelField));
  const revoked = [
    ...normalizeIdList(root.badgeRevocations),
    ...normalizeIdList(level?.badgeRevocations),
  ];
  const raw = Array.isArray(level?.pendingLessonBadgeIds)
    ? level.pendingLessonBadgeIds
    : root.pendingLessonBadgeIds;
  return withoutRevoked(raw, revoked).filter((id) => !claimed.has(id));
}

function normalizedMcqEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const segmentId = String(raw.segmentId || "").trim();
  const beatId = String(raw.beatId || "").trim();
  if (!segmentId || !beatId) return null;
  return {
    ...raw,
    segmentId,
    beatId,
    correct: raw.correct === true,
    playId: Math.max(0, Number(raw.playId ?? raw.play) || 0),
    at: raw.at || null,
  };
}

export function normalizeMcqLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizedMcqEvent).filter(Boolean);
}

function summaryRows(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw).filter((row) => row && typeof row === "object");
}

/** Lifetime clicks. Prefer event evidence; use summary only for legacy state. */
export function summarizeLifetimeMcq(part) {
  const log = normalizeMcqLog(part?.mcqLog);
  if (log.length) {
    const correct = log.filter((event) => event.correct).length;
    const incorrect = log.length - correct;
    return {
      correct,
      incorrect,
      attempts: log.length,
      source: "events",
    };
  }

  let correct = 0;
  let incorrect = 0;
  for (const row of summaryRows(part?.mcqSummary)) {
    correct += Math.max(0, Number(row.correct) || 0);
    incorrect += Math.max(0, Number(row.incorrect) || 0);
  }
  return {
    correct,
    incorrect,
    attempts: correct + incorrect,
    source: "legacy-summary",
  };
}

export function currentFreetalkStats(part) {
  const total = Math.max(0, Number(part?.endingFreetalkEnglishCount) || 0);
  const playId =
    Math.max(
      0,
      Number(part?.mcqBadgePlay?.ending1) ||
        Number(part?.chapterPlayCounts?.ending1) ||
        0
    );
  const byPlay =
    part?.endingFreetalkEnglishByPlay &&
    typeof part.endingFreetalkEnglishByPlay === "object"
      ? part.endingFreetalkEnglishByPlay
      : {};
  const currentRun =
    playId > 0 && Object.prototype.hasOwnProperty.call(byPlay, playId)
      ? Math.max(0, Number(byPlay[playId]) || 0)
      : total;
  return {
    total,
    playId,
    currentRun,
    finalTotal: Math.max(
      0,
      Number(part?.endingFreetalkFinalEnglishCount) || 0
    ),
    finalRun: Math.max(
      0,
      Number(part?.endingFreetalkFinalRunEnglishCount) || 0
    ),
  };
}

export function buildPartReporting(part) {
  const state = part && typeof part === "object" ? part : {};
  return {
    contractVersion: PROGRESS_CONTRACT_VERSION,
    lifetimeMcq: summarizeLifetimeMcq(state),
    freetalk: currentFreetalkStats(state),
    completedSegmentCount: normalizeIdList(state.completedSegmentIds).length,
    chapterPlayCounts: { ...(state.chapterPlayCounts || {}) },
  };
}
