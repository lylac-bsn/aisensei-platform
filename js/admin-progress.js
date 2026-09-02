/**
 * Admin 「学習進捗」dashboard — chapter MCQ click stats, phrase checklist, poke counts.
 */
import { AQUARIUM_PART1 } from "./lessons/aquarium-part1.js";
import { AQUARIUM_PART2 } from "./lessons/aquarium-part2.js";
import { normalizeMcqChoice, formatChoiceLabel } from "./mcq-engine.js";
import { totalPokeCount } from "./activity-log.js";

const LEVEL_META = [
  { id: "beginner", label: "ビギナー", field: "beginnerProgress" },
  { id: "intermediate", label: "中級", field: "intermediateProgress" },
  { id: "advanced", label: "上級", field: "advancedProgress" },
];

/** Chapters / quizzes that show 4-option MCQ in Part 1. */
const PART1_MCQ_SEGMENTS = (AQUARIUM_PART1.segments || []).filter(
  (s) =>
    (s.mcqBeats && s.mcqBeats.length) ||
    (s.items?.length && (s.type === "quiz" || s.type === "final_challenge"))
);

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

function formatSeconds(sec) {
  const s = Math.max(0, parseInt(sec, 10) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

function normalizePhraseKey(text) {
  return normalizeMcqChoice(String(text || ""))
    .replace(/\[color\]/gi, "")
    .replace(/_+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseMatchesCatalog(spoken, catalogPhrase) {
  const a = normalizePhraseKey(spoken);
  const b = normalizePhraseKey(catalogPhrase);
  if (!a || !b) return false;
  if (a === b) return true;
  // Color / blank templates: "I made ___ glass." ↔ "I made orange glass!"
  if (b.includes("glass") && a.includes("glass") && /i made/.test(a) && /i made/.test(b)) {
    return true;
  }
  if (b.includes("fish") && a.includes("fish") && (a.includes(b.slice(0, 8)) || b.includes(a.slice(0, 8)))) {
    return true;
  }
  return a.includes(b) || b.includes(a);
}

/** Unique target phrases across Part 1 + Part 2 chapters. */
export function buildPhraseCatalog() {
  const out = [];
  const seen = new Set();
  const pushFrom = (lesson, partLabel) => {
    for (const seg of lesson.segments || []) {
      for (const t of seg.targets || []) {
        const phrase = String(t.phrase || "").trim();
        if (!phrase) continue;
        const key = normalizePhraseKey(phrase);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: t.id || key,
          phrase,
          chapterId: seg.id,
          chapterTitle: seg.title || seg.id,
          partLabel,
        });
      }
    }
  };
  pushFrom(AQUARIUM_PART1, "Part 1");
  pushFrom(AQUARIUM_PART2, "Part 2");
  return out;
}

const PHRASE_CATALOG = buildPhraseCatalog();

function collectSpokenPhrases(user) {
  const spoken = [];
  for (const meta of LEVEL_META) {
    const field = user[meta.field] || {};
    for (const part of [field.part1, field.part2]) {
      if (!Array.isArray(part?.phrasesSpoken)) continue;
      for (const p of part.phrasesSpoken) {
        const english = typeof p === "string" ? p : p?.english;
        if (english) spoken.push(String(english));
      }
    }
  }
  return spoken;
}

function phraseChecklist(user) {
  const spoken = collectSpokenPhrases(user);
  return PHRASE_CATALOG.map((item) => ({
    ...item,
    earned: spoken.some((s) => phraseMatchesCatalog(s, item.phrase)),
  }));
}

function summarizeUserMcqFromParts(user) {
  let correct = 0;
  let incorrect = 0;
  let attempts = 0;
  for (const meta of LEVEL_META) {
    const field = user[meta.field] || {};
    for (const part of [field.part1, field.part2]) {
      const summary = part?.mcqSummary || {};
      for (const row of Object.values(summary)) {
        if (!row || typeof row !== "object") continue;
        correct += Number(row.correct) || 0;
        incorrect += Number(row.incorrect) || 0;
        attempts += Number(row.attempts) || 0;
      }
    }
  }
  // Fallback: top-level mcqStats rollup
  if (!attempts && user.mcqStats) {
    for (const levelMap of Object.values(user.mcqStats)) {
      if (!levelMap || typeof levelMap !== "object") continue;
      for (const row of Object.values(levelMap)) {
        if (!row || typeof row !== "object") continue;
        correct += Number(row.correct) || 0;
        incorrect += Number(row.incorrect) || 0;
        attempts += Number(row.attempts) || 0;
      }
    }
  }
  return { correct, incorrect, attempts };
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
    badgeCount: 0,
    updatedLabel: formatProgressTimestamp(user.progressUpdatedAt),
  };
}

export function collectUserBadges() {
  return [];
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
  const phraseStats = accounts.reduce(
    (acc, u) => {
      const list = phraseChecklist(u);
      acc.earned += list.filter((p) => p.earned).length;
      return acc;
    },
    { earned: 0 }
  );
  const totalPokes = accounts.reduce((sum, u) => sum + totalPokeCount(u.pokeStats), 0);
  const mcq = accounts.reduce(
    (acc, u) => {
      const s = summarizeUserMcqFromParts(u);
      acc.correct += s.correct;
      acc.incorrect += s.incorrect;
      acc.attempts += s.attempts;
      return acc;
    },
    { correct: 0, incorrect: 0, attempts: 0 }
  );

  return {
    studentCount: accounts.filter((u) => u.role !== "admin").length,
    accountCount: accounts.length,
    syncedCount: withProgress.length,
    lessonCompleteCount: lessonComplete,
    totalStars,
    totalPhrases: phraseStats.earned,
    phraseCatalogSize: PHRASE_CATALOG.length,
    totalPokes,
    mcqCorrect: mcq.correct,
    mcqIncorrect: mcq.incorrect,
    mcqAttempts: mcq.attempts,
  };
}

function renderHomeworkParts(meta, raw) {
  const p1 = raw?.part1 || {};
  const p2 = raw?.part2 || {};
  const row = (label, part) => {
    const done = part.complete
      ? "完了"
      : `章 ${(part.segmentIndex || 0) + 1}/${(AQUARIUM_PART1.segments || []).length || "—"}`;
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
      <span class="progress-level-meta">${raw?.part1Complete ? "Part1完了" : "Part1進行中"}</span>
    </header>
    ${row("Part 1", p1)}
    ${row("Part 2", p2)}
  </section>`;
}

function resolveBeatChoices(beat) {
  return (beat.choices || []).slice(0, 4).map((c) => formatChoiceLabel(String(c)));
}

function resolveBeatAnswer(beat) {
  return formatChoiceLabel(String(beat.answer || ""));
}

function isCorrectChoiceLabel(choice, answer) {
  const c = normalizeMcqChoice(choice);
  const a = normalizeMcqChoice(answer);
  if (!c || !a) return false;
  if (c === a) return true;
  // Color / blank templates: "I made [color] glass!" ↔ "I made orange glass!"
  if (
    /i made/.test(a) &&
    /glass/.test(a) &&
    (/\[color\]|_/.test(a) || a === "i made glass") &&
    /i made/.test(c) &&
    /glass/.test(c)
  ) {
    return true;
  }
  return false;
}

/**
 * Merge mcqSummary + mcqLog for one part into per-beat choice counts and click order.
 */
function beatStatsFromPart(part, segmentId, beatId) {
  const key = `${segmentId}.${beatId}`;
  const summary = part?.mcqSummary?.[key] || null;
  const log = Array.isArray(part?.mcqLog)
    ? part.mcqLog.filter((e) => e.segmentId === segmentId && e.beatId === beatId)
    : [];
  const choiceCounts = { ...(summary?.choiceCounts || {}) };
  // Rebuild counts from log if summary empty
  if (!Object.keys(choiceCounts).length && log.length) {
    for (const e of log) {
      const ck = e.choice || "(blank)";
      choiceCounts[ck] = (choiceCounts[ck] || 0) + 1;
    }
  }
  const clickOrder = log.map((e, i) => ({
    n: i + 1,
    choice: e.choice || "",
    correct: Boolean(e.correct),
    at: e.at || null,
  }));
  return {
    attempts: Number(summary?.attempts) || log.length || 0,
    correct: Number(summary?.correct) || clickOrder.filter((c) => c.correct).length,
    incorrect: Number(summary?.incorrect) || clickOrder.filter((c) => !c.correct).length,
    choiceCounts,
    clickOrder,
  };
}

function pickPrimaryPart(user) {
  // Prefer beginner Part 1 (current homework); fall back to any level with data.
  for (const meta of LEVEL_META) {
    const field = user[meta.field];
    if (field?.part1?.mcqSummary || field?.part1?.mcqLog?.length || field?.part1) {
      return { meta, part: field.part1 || {}, partKey: "part1" };
    }
  }
  return { meta: LEVEL_META[0], part: {}, partKey: "part1" };
}

function renderMcqChapterBlock(seg, part) {
  const beats =
    seg.mcqBeats?.length
      ? seg.mcqBeats
      : (seg.items || []).map((item, i) => ({
          id: item.id || `item-${i}`,
          learnyEn: item.promptJa || item.prompt || item.id || `Q${i + 1}`,
          learnyJa: "",
          choices: item.choices || [],
          answer: item.answer || "",
        }));

  if (!beats.length) return "";

  const beatHtml = beats
    .map((beat, idx) => {
      const stats = beatStatsFromPart(part, seg.id, beat.id);
      const choices = resolveBeatChoices(beat);
      const answer = resolveBeatAnswer(beat);
      const labels = [...choices];
      for (const k of Object.keys(stats.choiceCounts)) {
        if (!labels.some((c) => normalizeMcqChoice(c) === normalizeMcqChoice(k))) {
          labels.push(k);
        }
      }
      const optionsHtml = labels
        .map((label) => {
          const count =
            Number(stats.choiceCounts[label]) ||
            Number(
              Object.entries(stats.choiceCounts).find(
                ([k]) => normalizeMcqChoice(k) === normalizeMcqChoice(label)
              )?.[1]
            ) ||
            0;
          const ok = isCorrectChoiceLabel(label, answer);
          return `<li class="progress-mcq-option${ok ? " is-correct" : ""}">
            <span class="progress-mcq-option-label">${escapeHtml(label)}</span>
            <span class="progress-mcq-option-count">${count}</span>
          </li>`;
        })
        .join("");

      const orderHtml = stats.clickOrder.length
        ? `<ol class="progress-mcq-order-list">${stats.clickOrder
            .map(
              (c) =>
                `<li class="${c.correct ? "is-correct" : "is-wrong"}">${escapeHtml(c.n)}. ${escapeHtml(
                  c.choice || "(blank)"
                )}${c.correct ? " ✓" : ""}</li>`
            )
            .join("")}</ol>`
        : '<p class="progress-empty-inline">まだクリック履歴がありません</p>';

      const prompt = [beat.learnyEn, beat.learnyJa].filter(Boolean).join(" / ");
      return `<div class="progress-mcq-beat">
        <div class="progress-mcq-beat-head">
          <strong>Beat ${idx + 1}</strong>
          <span class="progress-mcq-beat-meta">○${stats.correct} ×${stats.incorrect} · ${stats.attempts}回</span>
        </div>
        <p class="progress-mcq-prompt">${escapeHtml(prompt || beat.id)}</p>
        <ul class="progress-mcq-options">${optionsHtml}</ul>
        <details class="progress-mcq-order">
          <summary>クリック順（詳細）</summary>
          ${orderHtml}
        </details>
      </div>`;
    })
    .join("");

  const completed = Array.isArray(part.completedSegmentIds) && part.completedSegmentIds.includes(seg.id);
  const attemptsOnChapter = beats.reduce((sum, beat) => {
    return sum + (beatStatsFromPart(part, seg.id, beat.id).attempts || 0);
  }, 0);

  return `<details class="progress-mcq-chapter${completed ? " is-done" : ""}">
    <summary>
      <span class="progress-mcq-chapter-title">
        <span>${escapeHtml(seg.title || seg.id)}</span>
        <span class="progress-mcq-chapter-en">${escapeHtml(seg.titleEn || seg.id)} · ${attemptsOnChapter}回</span>
      </span>
      <span class="progress-mcq-chapter-status">${completed ? "クリア" : "未クリア"}</span>
    </summary>
    <div class="progress-mcq-chapter-body">${beatHtml}</div>
  </details>`;
}

function renderMcqActivity(user) {
  const { part } = pickPrimaryPart(user);
  const blocks = PART1_MCQ_SEGMENTS.map((seg) => renderMcqChapterBlock(seg, part)).join("");
  if (!blocks) {
    return '<p class="progress-activity-empty">4択チャプターがありません</p>';
  }
  return `<div class="progress-mcq-board">${blocks}</div>`;
}

function renderPhrasesList(checklist) {
  if (!checklist.length) {
    return '<p class="progress-phrases-empty">フレーズカタログが空です</p>';
  }
  const earned = checklist.filter((p) => p.earned).length;
  const groups = new Map();
  for (const p of checklist) {
    const key = `${p.partLabel} · ${p.chapterTitle}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const body = [...groups.entries()]
    .map(
      ([group, items]) => `<div class="progress-phrase-group">
      <h5 class="progress-phrase-group-title">${escapeHtml(group)}</h5>
      <ul class="progress-phrases-list">${items
        .map(
          (p) =>
            `<li class="${p.earned ? "earned" : "pending"}">
              <span class="progress-phrase-mark" aria-hidden="true">${p.earned ? "✓" : "·"}</span>
              <strong>${escapeHtml(p.phrase)}</strong>
            </li>`
        )
        .join("")}</ul>
    </div>`
    )
    .join("");
  return `<p class="progress-phrases-summary">${earned} / ${checklist.length} フレーズ</p><div class="progress-phrases-scroll">${body}</div>`;
}

export function renderActivityTimeline(events) {
  if (!events?.length) {
    return '<p class="progress-activity-empty">まだアクティビティがありません</p>';
  }

  const typeLabel = {
    poke: "つつく",
    star: "スター獲得",
    badge: "バッジ獲得",
    badge_revoke: "バッジ取消",
    reset: "最初から",
    mcq_correct: "4択正解",
    mcq_incorrect: "4択不正解",
    skip: "スキップ（旧）",
  };

  return `<ul class="progress-activity-list">${events
    .map((ev) => {
      const when = formatProgressTimestamp(ev.at);
      const level = ev.level ? ` · ${escapeHtml(ev.level)}` : "";
      let detail = "";
      if (ev.type === "poke") {
        detail = escapeHtml(ev.segmentId || "つつく");
      } else if (ev.type === "mcq_correct" || ev.type === "mcq_incorrect") {
        detail = `${escapeHtml(ev.segmentId || "")}/${escapeHtml(ev.beatId || "")} → ${escapeHtml(ev.choice || "")}${
          ev.attempt ? ` (${ev.attempt}回目)` : ""
        }`;
      } else if (ev.type === "star" || ev.type === "reset") {
        detail = escapeHtml(ev.questTitle || ev.segmentId || "");
      } else if (ev.badgeId) {
        detail = escapeHtml(ev.badgeId);
      }
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
          const pokeTotal = totalPokeCount(u.pokeStats);
          const mcq = summarizeUserMcqFromParts(u);
          const checklist = phraseChecklist(u);
          const phraseEarned = checklist.filter((p) => p.earned).length;
          const levelsHtml = LEVEL_META.filter((meta) => u[meta.field])
            .map((meta) => renderHomeworkParts(meta, u[meta.field] || {}))
            .join("");
          const hasAny = LEVEL_META.some((m) => u[m.field]);
          const statusClass = u.beginnerProgress?.part1Complete
            ? "complete"
            : hasAny
              ? "active"
              : "empty";
          const statusLabel = u.beginnerProgress?.part1Complete
            ? "クリア"
            : hasAny
              ? "学習中"
              : "未開始";
          const adminTag =
            u.role === "admin" ? '<span class="progress-admin-tag">ADMIN</span>' : "";

          return `<article class="progress-student-card ${statusClass}" data-user-id="${escapeHtml(u.id)}">
            <header class="progress-student-header">
              <div>
                <h3 class="progress-student-name">${escapeHtml(u.displayName || "(名前なし)")}${adminTag}<span class="progress-status-chip">${escapeHtml(statusLabel)}</span></h3>
                <p class="progress-student-email">${escapeHtml(u.email || u.id)}</p>
              </div>
              <div class="progress-header-right">
                <span class="progress-updated">更新 ${escapeHtml(formatProgressTimestamp(u.progressUpdatedAt))}</span>
              </div>
            </header>

            <div class="progress-student-stats" aria-label="学習サマリー">
              <div class="progress-stat">
                <span class="progress-stat-label">フレーズ</span>
                <span class="progress-stat-value">${phraseEarned}/${checklist.length}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">4択</span>
                <span class="progress-stat-value">○${mcq.correct} ×${mcq.incorrect}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">つつく</span>
                <span class="progress-stat-value">${pokeTotal}</span>
              </div>
              <div class="progress-stat">
                <span class="progress-stat-label">残り時間</span>
                <span class="progress-stat-value">${formatSeconds(u.remainingTime)}</span>
              </div>
            </div>

            ${levelsHtml || '<p class="progress-empty-inline">まだ宿題データがありません</p>'}

            <details class="progress-detail-block">
              <summary>4択の詳細（章ごと）</summary>
              ${renderMcqActivity(u)}
              <div class="progress-activity-feed">
                <p class="progress-activity-feed-label">イベント履歴</p>
                <div class="progress-activity-mount" data-activity-user="${escapeHtml(u.id)}">
                  <button type="button" class="progress-load-activity" data-action="load-activity" data-user-id="${escapeHtml(u.id)}">履歴を読み込む</button>
                </div>
              </div>
            </details>

            <details class="progress-phrases-details">
              <summary>フレーズ一覧 (${phraseEarned}/${checklist.length})</summary>
              ${renderPhrasesList(checklist)}
            </details>
          </article>`;
        })
        .join("")
    : `<p class="progress-empty">該当する生徒が見つかりません。検索条件を変えてみてください。</p>`;

  return `
    <div class="progress-summary-grid">
      <div class="progress-summary-card is-primary">
        <span class="progress-summary-num">${summary.studentCount}</span>
        <span class="progress-summary-label">生徒</span>
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
        <span class="progress-summary-num">${summary.mcqCorrect || 0}/${summary.mcqIncorrect || 0}</span>
        <span class="progress-summary-label">4択 正解/不正解</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPhrases}/${summary.phraseCatalogSize}</span>
        <span class="progress-summary-label">フレーズ習得</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPokes || 0}</span>
        <span class="progress-summary-label">つつく合計</span>
      </div>
    </div>
    <p class="progress-legend">緑 = 正解の選択肢 · 数字 = クリック回数 · 章・クリック順は折りたたみで詳細表示</p>
    <div class="progress-student-grid">${cardsHtml}</div>`;
}

export { LEVEL_META, PHRASE_CATALOG, PART1_MCQ_SEGMENTS };
