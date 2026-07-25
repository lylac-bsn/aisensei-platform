import { LESSON_1_QUESTS } from "./quests/beginner-lesson1.js";
import { INTERMEDIATE_QUESTS } from "./quests/intermediate-lesson1.js";
import { ADVANCED_QUESTS } from "./quests/advanced-lesson1.js";
import {
  MAIN_BADGE_SLOTS,
  HIDDEN_BADGE_SLOT_COUNT,
  getBadgeCatalog,
} from "./quest-engine.js";
import { skipCountForMission, totalSkipCount } from "./activity-log.js";

const TOTAL_BADGE_SLOTS = MAIN_BADGE_SLOTS.length + HIDDEN_BADGE_SLOT_COUNT;
const BADGE_CATALOG = getBadgeCatalog();
const BADGE_BY_ID = Object.fromEntries(BADGE_CATALOG.map((b) => [b.id, b]));

const LEVEL_META = [
  {
    id: "beginner",
    label: "ビギナー",
    field: "beginnerProgress",
    quests: LESSON_1_QUESTS,
  },
  {
    id: "intermediate",
    label: "中級",
    field: "intermediateProgress",
    quests: INTERMEDIATE_QUESTS,
  },
  {
    id: "advanced",
    label: "上級",
    field: "advancedProgress",
    quests: ADVANCED_QUESTS,
  },
];

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatProgressTimestamp(ts) {
  if (!ts) return "—";
  try {
    const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function badgeLabel(id) {
  return BADGE_BY_ID[id]?.label || id;
}

function normalizeIndexArray(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n) && n >= 0)
    ),
  ].sort((a, b) => a - b);
}

export function normalizeLevelProgress(raw, quests) {
  if (!raw || typeof raw !== "object") {
    return {
      hasData: false,
      starsEarned: 0,
      totalQuests: quests.length,
      lessonComplete: false,
      fullyStarred: false,
      questIndex: 0,
      starredQuestIds: [],
      skippedQuestIds: [],
      missionLabel: "データなし",
      missionDetail: "まだ同期されていません",
      missionStatus: "—",
      missionGoal: "",
      phraseCount: 0,
      phrases: [],
      lessonBadges: [],
    };
  }

  const totalQuests = Number(raw.totalQuests) || quests.length;
  const starsEarned = Number(raw.starsEarned) || 0;
  const lessonComplete = !!raw.lessonComplete;
  const starredQuestIds = normalizeIndexArray(
    raw.starredQuestIds ??
      (starsEarned > 0 ? Array.from({ length: starsEarned }, (_, i) => i) : [])
  );
  const skippedQuestIds = normalizeIndexArray(raw.skippedQuestIds);
  const questIndex = Number.isFinite(raw.questIndex) ? raw.questIndex : starredQuestIds.length;
  const missionNumber =
    raw.missionNumber ?? (raw.missionIndex != null ? raw.missionIndex + 1 : null);

  let missionLabel = "未開始";
  if (lessonComplete) missionLabel = "全ミッションクリア";
  else if (missionNumber) missionLabel = `ミッション ${missionNumber} / ${totalQuests}`;

  const missionDetail =
    raw.missionTitleEn ||
    (missionNumber ? quests[missionNumber - 1]?.titleEn : "") ||
    "—";
  const missionGoal =
    raw.missionGoal || (missionNumber ? quests[missionNumber - 1]?.goal : "") || "";

  return {
    hasData: true,
    starsEarned,
    totalQuests,
    lessonComplete,
    fullyStarred: !!raw.fullyStarred,
    questIndex,
    starredQuestIds,
    skippedQuestIds,
    missionLabel,
    missionDetail,
    missionGoal,
    missionStatus: raw.missionStatus || "—",
    phraseCount: Number(raw.phraseCount) || (raw.phrases?.length ?? 0),
    phrases: Array.isArray(raw.phrases) ? raw.phrases : [],
    lessonBadges: Array.isArray(raw.lessonBadges) ? raw.lessonBadges : [],
  };
}

/** @deprecated use per-level normalize — kept for any external callers */
export function normalizeStudentProgress(user) {
  const p = normalizeLevelProgress(user.beginnerProgress, LESSON_1_QUESTS);
  return {
    ...p,
    badgeCount: collectUserBadges(user).length,
    updatedLabel: formatProgressTimestamp(user.progressUpdatedAt),
  };
}

export function collectUserBadges(user) {
  const ids = new Set();
  for (const id of user.lessonBadges || []) ids.add(id);
  for (const meta of LEVEL_META) {
    const list = user[meta.field]?.lessonBadges;
    if (Array.isArray(list)) list.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export function buildProgressSummary(users) {
  const accounts = users;
  const withProgress = accounts.filter(
    (u) => u.beginnerProgress || u.intermediateProgress || u.advancedProgress
  );
  const lessonComplete = accounts.filter((u) => u.beginnerProgress?.lessonComplete).length;
  const totalStars = accounts.reduce((sum, u) => {
    return (
      sum +
      LEVEL_META.reduce(
        (s, m) => s + (Number(u[m.field]?.starsEarned) || 0),
        0
      )
    );
  }, 0);
  const totalPhrases = accounts.reduce((sum, u) => {
    return (
      sum +
      LEVEL_META.reduce(
        (s, m) => s + (Number(u[m.field]?.phraseCount) || 0),
        0
      )
    );
  }, 0);
  const totalSkips = accounts.reduce(
    (sum, u) => sum + totalSkipCount(u.skipStats),
    0
  );

  return {
    studentCount: accounts.filter((u) => u.role !== "admin").length,
    accountCount: accounts.length,
    syncedCount: withProgress.length,
    lessonCompleteCount: lessonComplete,
    totalStars,
    totalPhrases,
    totalSkips,
  };
}

function renderMissionGrid(level, progress, skipStats) {
  const { quests, id: levelId, label } = level;
  const starred = new Set(progress.starredQuestIds);
  const skipped = new Set(progress.skippedQuestIds);
  const currentIdx = progress.lessonComplete
    ? -1
    : Number.isFinite(progress.questIndex)
      ? progress.questIndex
      : progress.starredQuestIds.length;

  const rows = quests
    .map((quest, i) => {
      const isStar = starred.has(i);
      const isSkip = skipped.has(i) && !isStar;
      const isCurrent = i === currentIdx && !progress.lessonComplete;
      const skipN = skipCountForMission(skipStats, levelId, i);
      const stateClass = isStar
        ? "starred"
        : isSkip
          ? "skipped"
          : isCurrent
            ? "current"
            : i < (progress.questIndex || 0)
              ? "unlocked"
              : "locked";
      const mark = isStar ? "★" : isSkip ? "↷" : isCurrent ? "●" : i < (progress.questIndex || 0) ? "○" : "·";
      return `<div class="progress-mission-cell ${stateClass}" title="${escapeHtml(quest.titleEn || quest.title)}">
        <span class="progress-mission-cell-mark">${mark}</span>
        <span class="progress-mission-cell-num">M${i + 1}</span>
        <span class="progress-mission-cell-title">${escapeHtml(quest.goal || quest.titleEn || "")}</span>
        ${
          skipN > 0
            ? `<span class="progress-skip-count" title="スキップ回数">↷×${skipN}</span>`
            : ""
        }
      </div>`;
    })
    .join("");

  return `<section class="progress-level-block">
    <header class="progress-level-header">
      <h4>${escapeHtml(label)}</h4>
      <span class="progress-level-meta">★${progress.starsEarned}/${progress.totalQuests}
        · スキップ ${progress.skippedQuestIds.length}件
        · ${escapeHtml(progress.missionStatus)}</span>
    </header>
    <div class="progress-mission-grid">${rows || '<p class="progress-empty-inline">ミッション定義なし</p>'}</div>
    ${
      progress.hasData
        ? `<p class="progress-level-now">${escapeHtml(progress.missionLabel)} — ${escapeHtml(progress.missionDetail)}</p>`
        : `<p class="progress-level-now muted">未同期</p>`
    }
  </section>`;
}

function renderBadgeBoard(earnedIds, userId) {
  const earned = new Set(earnedIds);
  const chips = BADGE_CATALOG.map((b) => {
    const has = earned.has(b.id);
    return `<div class="progress-badge-chip${has ? " earned" : ""}" data-badge-id="${escapeHtml(b.id)}">
      <span class="progress-badge-chip-label">${escapeHtml(b.label)}</span>
      <span class="progress-badge-chip-kind">${b.kind === "main" ? "メイン" : "シークレット"}</span>
      ${
        has
          ? `<button type="button" class="progress-badge-btn revoke" data-action="revoke-badge" data-user-id="${escapeHtml(userId)}" data-badge-id="${escapeHtml(b.id)}">取消</button>`
          : `<button type="button" class="progress-badge-btn grant" data-action="grant-badge" data-user-id="${escapeHtml(userId)}" data-badge-id="${escapeHtml(b.id)}">付与</button>`
      }
    </div>`;
  }).join("");

  return `<div class="progress-badge-board">
    <div class="progress-badge-board-head">
      <span>バッジ ${earnedIds.length} / ${TOTAL_BADGE_SLOTS}</span>
    </div>
    <div class="progress-badge-chip-grid">${chips}</div>
  </div>`;
}

function renderPhrasesList(phrases) {
  if (!phrases.length) {
    return '<p class="progress-phrases-empty">まだフレーズがありません</p>';
  }
  return `<ul class="progress-phrases-list">${phrases
    .map(
      (p) =>
        `<li><strong>${escapeHtml(p.english)}</strong><span>${escapeHtml(p.japanese)}</span></li>`
    )
    .join("")}</ul>`;
}

function collectAllPhrases(user) {
  const seen = new Set();
  const out = [];
  for (const meta of LEVEL_META) {
    const list = user[meta.field]?.phrases;
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      const key = `${p.english}|${p.japanese}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

export function renderActivityTimeline(events) {
  if (!events?.length) {
    return '<p class="progress-activity-empty">まだアクティビティがありません（スキップ等はこれからの学習から記録されます）</p>';
  }

  const typeLabel = {
    skip: "スキップ",
    star: "スター獲得",
    badge: "バッジ獲得",
    badge_revoke: "バッジ取消",
    reset: "最初から",
  };

  return `<ul class="progress-activity-list">${events
    .map((ev) => {
      const when = formatProgressTimestamp(ev.at);
      const level = ev.level ? ` · ${escapeHtml(ev.level)}` : "";
      const detail =
        ev.type === "skip" || ev.type === "star"
          ? `M${(ev.questIndex ?? 0) + 1}${ev.questTitle ? ` ${escapeHtml(ev.questTitle)}` : ""}`
          : ev.badgeId
            ? escapeHtml(badgeLabel(ev.badgeId))
            : "";
      const src = ev.source === "admin" ? "admin" : "生徒";
      return `<li class="progress-activity-item type-${escapeHtml(ev.type)}">
        <span class="progress-activity-type">${escapeHtml(typeLabel[ev.type] || ev.type)}</span>
        <span class="progress-activity-detail">${detail}${level}</span>
        <span class="progress-activity-meta">${escapeHtml(when)} · ${src}</span>
      </li>`;
    })
    .join("")}</ul>`;
}

export function renderProgressDashboard(users, searchQuery = "") {
  const query = searchQuery.trim().toLowerCase();
  const accounts = users.filter((u) => {
    if (!query) return true;
    const name = (u.displayName || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const summary = buildProgressSummary(users);

  const cardsHtml = accounts.length
    ? accounts
        .map((u) => {
          const badges = collectUserBadges(u);
          const skipTotal = totalSkipCount(u.skipStats);
          const levelsHtml = LEVEL_META.map((meta) =>
            renderMissionGrid(
              meta,
              normalizeLevelProgress(u[meta.field], meta.quests),
              u.skipStats || {}
            )
          ).join("");
          const phrases = collectAllPhrases(u);
          const hasAny = LEVEL_META.some((m) => u[m.field]);
          const statusClass = u.beginnerProgress?.lessonComplete
            ? "complete"
            : hasAny
              ? "active"
              : "empty";
          const adminTag =
            u.role === "admin"
              ? '<span class="progress-admin-tag">ADMIN</span>'
              : "";

          return `<article class="progress-student-card ${statusClass}" data-user-id="${escapeHtml(u.id)}">
            <header class="progress-student-header">
              <div>
                <h3 class="progress-student-name">${escapeHtml(u.displayName || "(名前なし)")}${adminTag}</h3>
                <p class="progress-student-email">${escapeHtml(u.email || u.id)}</p>
              </div>
              <div class="progress-header-right">
                <span class="progress-updated">更新: ${escapeHtml(formatProgressTimestamp(u.progressUpdatedAt))}</span>
                <span class="progress-skip-pill" title="累計スキップ回数">↷ スキップ ${skipTotal}回</span>
              </div>
            </header>

            <div class="progress-student-stats">
              <div class="progress-stat">
                <span class="progress-stat-label">バッジ</span>
                <span class="progress-stat-value">${badges.length} / ${TOTAL_BADGE_SLOTS}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">フレーズ</span>
                <span class="progress-stat-value">${phrases.length}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">残り時間</span>
                <span class="progress-stat-value">${formatSeconds(u.remainingTime)}</span>
              </div>
            </div>

            ${levelsHtml}

            <details class="progress-detail-block" open>
              <summary>バッジ管理</summary>
              ${renderBadgeBoard(badges, u.id)}
            </details>

            <details class="progress-detail-block">
              <summary>アクティビティ（スキップ履歴など）</summary>
              <div class="progress-activity-mount" data-activity-user="${escapeHtml(u.id)}">
                <button type="button" class="progress-load-activity" data-action="load-activity" data-user-id="${escapeHtml(u.id)}">履歴を読み込む</button>
              </div>
            </details>

            <details class="progress-phrases-details">
              <summary>覚えたフレーズ (${phrases.length})</summary>
              ${renderPhrasesList(phrases)}
            </details>
          </article>`;
        })
        .join("")
    : `<p class="progress-empty">該当する生徒が見つかりません。</p>`;

  return `
    <div class="progress-summary-grid">
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.accountCount}</span>
        <span class="progress-summary-label">アカウント数</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.studentCount}</span>
        <span class="progress-summary-label">生徒（非管理者）</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.syncedCount}</span>
        <span class="progress-summary-label">進捗データあり</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.lessonCompleteCount}</span>
        <span class="progress-summary-label">ビギナークリア</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalStars}</span>
        <span class="progress-summary-label">スター合計</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalSkips}</span>
        <span class="progress-summary-label">スキップ合計</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPhrases}</span>
        <span class="progress-summary-label">フレーズ合計</span>
      </div>
    </div>
    <p class="progress-legend">凡例: ★クリア · ↷スキップ · ●いまのミッション · ↷×N = スキップした回数</p>
    <div class="progress-student-grid">${cardsHtml}</div>`;
}

function formatSeconds(sec) {
  const s = Math.max(0, parseInt(sec, 10) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

export { BADGE_CATALOG, LEVEL_META };
