import { getBadgeCatalog } from "./lesson-engine.js";
import { totalSkipCount } from "./activity-log.js";

const BADGE_CATALOG = getBadgeCatalog();
const TOTAL_BADGE_SLOTS = BADGE_CATALOG.length;
const BADGE_BY_ID = Object.fromEntries(BADGE_CATALOG.map((b) => [b.id, b]));

const LEVEL_META = [
  { id: "beginner", label: "ビギナー", field: "beginnerProgress" },
  { id: "intermediate", label: "中級", field: "intermediateProgress" },
  { id: "advanced", label: "上級", field: "advancedProgress" },
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

export function normalizeLevelProgress(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      hasData: false,
      part1Complete: false,
      starsEarned: 0,
      phraseCount: 0,
      phrases: [],
      lessonBadges: [],
    };
  }
  const p1 = raw.part1 || {};
  const p2 = raw.part2 || {};
  const phrases = [
    ...(Array.isArray(p1.phrasesSpoken) ? p1.phrasesSpoken : []),
    ...(Array.isArray(p2.phrasesSpoken) ? p2.phrasesSpoken : []),
  ];
  return {
    hasData: true,
    part1Complete: Boolean(raw.part1Complete || p1.complete),
    part2Complete: Boolean(p2.complete),
    starsEarned: (Number(p1.stars) || 0) + (Number(p2.stars) || 0),
    phraseCount: phrases.length,
    phrases,
    lessonBadges: Array.isArray(raw.lessonBadges) ? raw.lessonBadges : [],
    part1,
    part2,
  };
}

/** @deprecated */
export function normalizeStudentProgress(user) {
  const p = normalizeLevelProgress(user.beginnerProgress);
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
  const lessonComplete = accounts.filter((u) => u.beginnerProgress?.part1Complete).length;
  const totalStars = accounts.reduce((sum, u) => {
    return (
      sum +
      LEVEL_META.reduce((s, m) => {
        const p = u[m.field];
        return s + (Number(p?.part1?.stars) || 0) + (Number(p?.part2?.stars) || 0);
      }, 0)
    );
  }, 0);
  const totalPhrases = accounts.reduce((sum, u) => {
    return (
      sum +
      LEVEL_META.reduce((s, m) => {
        const p = u[m.field];
        const n =
          (p?.part1?.phrasesSpoken?.length || 0) + (p?.part2?.phrasesSpoken?.length || 0);
        return s + n;
      }, 0)
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

function renderHomeworkParts(meta, raw) {
  const p1 = raw?.part1 || {};
  const p2 = raw?.part2 || {};
  const row = (label, part) => {
    const done = part.complete ? "完了" : `章 ${(part.segmentIndex || 0) + 1}`;
    const mem = Object.entries(part.memories || {})
      .map(([k, v]) => `${k}:${v}`)
      .join("、 ");
    return `<p class="progress-level-now">${escapeHtml(label)} — ${escapeHtml(done)} · ★${Number(part.stars) || 0}${
      mem ? ` · ${escapeHtml(mem)}` : ""
    }</p>`;
  };
  return `<section class="progress-level-block">
    <header class="progress-level-header">
      <h4>${escapeHtml(meta.label)}</h4>
      <span class="progress-level-meta">${raw?.part1Complete ? "Part1完了" : "Part1未完了"}</span>
    </header>
    ${row("Part 1", p1)}
    ${row("Part 2", p2)}
  </section>`;
}

function renderBadgeBoard(earnedIds, userId) {
  const earned = new Set(earnedIds);
  const chips = BADGE_CATALOG.map((b) => {
    const has = earned.has(b.id);
    return `<div class="progress-badge-chip${has ? " earned" : ""}" data-badge-id="${escapeHtml(b.id)}">
      <span class="progress-badge-chip-label">${escapeHtml(b.label)}</span>
      <span class="progress-badge-chip-kind">宿題</span>
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
    const field = user[meta.field] || {};
    for (const part of [field.part1, field.part2]) {
      const list = part?.phrasesSpoken;
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        const english = typeof p === "string" ? p : p.english;
        if (!english || seen.has(english)) continue;
        seen.add(english);
        out.push({ english, japanese: "" });
      }
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
            renderHomeworkParts(meta, u[meta.field] || {})
          ).join("");
          const phrases = collectAllPhrases(u);
          const hasAny = LEVEL_META.some((m) => u[m.field]);
          const statusClass = u.beginnerProgress?.part1Complete
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
