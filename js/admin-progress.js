import { LESSON_1_QUESTS } from "./quests/beginner-lesson1.js";
import { BEGINNER_LESSON_SLOTS } from "./quest-engine.js";

const TOTAL_MISSIONS = LESSON_1_QUESTS.length;
const TOTAL_BADGE_SLOTS = BEGINNER_LESSON_SLOTS.length;

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

export function normalizeStudentProgress(user) {
  const p = user.beginnerProgress;
  if (!p || typeof p !== "object") {
    return {
      hasData: false,
      starsEarned: 0,
      totalQuests: TOTAL_MISSIONS,
      lessonComplete: false,
      missionLabel: "データなし",
      missionDetail: "まだログイン後の学習記録がありません",
      missionStatus: "—",
      phraseCount: 0,
      badgeCount: 0,
      phrases: [],
      lessonBadges: [],
      updatedLabel: formatProgressTimestamp(user.progressUpdatedAt),
    };
  }

  const starsEarned = Number(p.starsEarned) || 0;
  const totalQuests = Number(p.totalQuests) || TOTAL_MISSIONS;
  const lessonComplete = !!p.lessonComplete;
  const missionNumber = p.missionNumber ?? (p.missionIndex != null ? p.missionIndex + 1 : null);

  let missionLabel = "未開始";
  if (lessonComplete) {
    missionLabel = "レッスン1 クリア";
  } else if (missionNumber) {
    missionLabel = `ミッション ${missionNumber} / ${totalQuests}`;
  }

  const missionDetail =
    p.missionTitleEn ||
    (missionNumber ? LESSON_1_QUESTS[missionNumber - 1]?.titleEn : "") ||
    "—";

  const missionGoal =
    p.missionGoal ||
    (missionNumber ? LESSON_1_QUESTS[missionNumber - 1]?.goal : "") ||
    "";

  return {
    hasData: true,
    starsEarned,
    totalQuests,
    lessonComplete,
    missionLabel,
    missionDetail,
    missionGoal,
    missionStatus: p.missionStatus || "—",
    phraseCount: Number(p.phraseCount) || (p.phrases?.length ?? 0),
    badgeCount: Number(p.badgeCount) || (p.lessonBadges?.length ?? 0),
    phrases: Array.isArray(p.phrases) ? p.phrases : [],
    lessonBadges: Array.isArray(p.lessonBadges) ? p.lessonBadges : [],
    updatedLabel: formatProgressTimestamp(user.progressUpdatedAt || p.updatedAt),
  };
}

export function buildProgressSummary(users) {
  const accounts = users;
  const withProgress = accounts.filter((u) => u.beginnerProgress);
  const lessonComplete = accounts.filter((u) => u.beginnerProgress?.lessonComplete).length;
  const totalStars = accounts.reduce(
    (sum, u) => sum + (Number(u.beginnerProgress?.starsEarned) || 0),
    0
  );
  const totalPhrases = accounts.reduce(
    (sum, u) => sum + (Number(u.beginnerProgress?.phraseCount) || 0),
    0
  );

  return {
    studentCount: accounts.filter((u) => u.role !== "admin").length,
    accountCount: accounts.length,
    syncedCount: withProgress.length,
    lessonCompleteCount: lessonComplete,
    totalStars,
    totalPhrases,
  };
}

function renderStarRow(earned, total) {
  return Array.from({ length: total }, (_, i) =>
    `<span class="progress-star${i < earned ? " filled" : ""}">★</span>`
  ).join("");
}

function renderBadgeSlots(badgeCount, lessonComplete) {
  const earned = lessonComplete ? Math.max(badgeCount, 1) : badgeCount;
  return Array.from({ length: TOTAL_BADGE_SLOTS }, (_, i) =>
    `<span class="progress-badge-slot${i < earned ? " filled" : ""}"></span>`
  ).join("");
}

function renderMissionSteps(starsEarned, totalQuests, lessonComplete) {
  const done = lessonComplete ? totalQuests : starsEarned;
  return LESSON_1_QUESTS.map((quest, i) => {
    const cleared = i < done;
    const current = !lessonComplete && i === starsEarned;
    const classes = [
      "progress-mission-step",
      cleared ? "cleared" : "",
      current ? "current" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<div class="${classes}" title="${escapeHtml(quest.titleEn)}">
      <span class="progress-mission-step-num">${i + 1}</span>
      <span class="progress-mission-step-label">${escapeHtml(quest.goal)}</span>
    </div>`;
  }).join("");
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
          const p = normalizeStudentProgress(u);
          const statusClass = p.lessonComplete
            ? "complete"
            : p.hasData
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
              <span class="progress-updated">更新: ${escapeHtml(p.updatedLabel)}</span>
            </header>

            <div class="progress-student-stats">
              <div class="progress-stat">
                <span class="progress-stat-label">スター</span>
                <span class="progress-stat-value">${p.starsEarned} / ${p.totalQuests}</span>
                <div class="progress-stars-row">${renderStarRow(p.starsEarned, p.totalQuests)}</div>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">いまのミッション</span>
                <span class="progress-stat-value progress-mission-title">${escapeHtml(p.missionLabel)}</span>
                <span class="progress-stat-sub">${escapeHtml(p.missionDetail)}</span>
                ${p.missionGoal ? `<span class="progress-stat-sub">${escapeHtml(p.missionGoal)}</span>` : ""}
                <span class="progress-status-pill">${escapeHtml(p.missionStatus)}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">フレーズ</span>
                <span class="progress-stat-value">${p.phraseCount}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">バッジ</span>
                <span class="progress-stat-value">${p.badgeCount} / ${TOTAL_BADGE_SLOTS}</span>
                <div class="progress-badge-row">${renderBadgeSlots(p.badgeCount, p.lessonComplete)}</div>
              </div>
            </div>

            <div class="progress-mission-track">
              <span class="progress-track-label">ミッション進捗</span>
              ${renderMissionSteps(p.starsEarned, p.totalQuests, p.lessonComplete)}
            </div>

            <details class="progress-phrases-details">
              <summary>覚えたフレーズ (${p.phraseCount})</summary>
              ${renderPhrasesList(p.phrases)}
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
        <span class="progress-summary-label">レッスンクリア</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalStars}</span>
        <span class="progress-summary-label">獲得スター合計</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPhrases}</span>
        <span class="progress-summary-label">覚えたフレーズ合計</span>
      </div>
    </div>
    <div class="progress-student-grid">${cardsHtml}</div>`;
}
