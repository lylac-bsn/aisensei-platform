/**
 * Admin 「学習進捗」dashboard — chapter MCQ click stats, phrase checklist, poke counts.
 */
import { lessonFor } from "./lessons/lesson-catalog.js";
import { allLessons } from "./lessons/lesson-catalog.js";
import { normalizeMcqChoice, formatChoiceLabel } from "./mcq-engine.js?v=20260910-warmup-no-glass-1";
import { totalPokeCount } from "./activity-log.js";
import {
  currentFreetalkStats,
  normalizeMcqLog,
  resolveClaimedBadgeIds,
  resolvePendingBadgeIds,
  summarizeLifetimeMcq,
} from "./progress-contract.js?v=20260910-warmup-no-glass-1";
import {
  computeAccuracyTier,
  highestTierByFamily,
  FAMILY_LABELS_JA,
  BADGE_FAMILIES,
  familySlotImage,
} from "./badge-engine.js?v=20260910-warmup-no-glass-1";

const LEVEL_META = [
  { id: "beginner", label: "ビギナー", field: "beginnerProgress" },
  { id: "intermediate", label: "中級", field: "intermediateProgress" },
  { id: "advanced", label: "上級", field: "advancedProgress" },
];

/** Chapters / quizzes that show 4-option MCQ in a lesson. */
function mcqSegmentsForLesson(lesson) {
  return (lesson?.segments || []).filter(
    (s) =>
      (s.mcqBeats && s.mcqBeats.length) ||
      (s.items?.length && (s.type === "quiz" || s.type === "final_challenge"))
  );
}

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

function spokenMatchesPattern(spokenNorm, pattern) {
  const np = normalizePhraseKey(pattern);
  if (!spokenNorm || !np) return false;
  if (spokenNorm === np) return true;
  // Avoid loose "need sand" ⊆ "need more sand" — pattern must cover most of spoken.
  if (spokenNorm.includes(np) && np.length >= Math.max(8, spokenNorm.length * 0.7)) return true;
  return false;
}

function phraseMatchesCatalog(spoken, catalogItem) {
  const phrase = typeof catalogItem === "string" ? catalogItem : catalogItem?.phrase;
  const patterns = typeof catalogItem === "string" ? [] : catalogItem?.patterns || [];
  const a = normalizePhraseKey(spoken);
  const b = normalizePhraseKey(phrase);
  if (!a || !b) return false;
  if (a === b) return true;
  if (patterns.some((p) => spokenMatchesPattern(a, p))) return true;
  // Color / blank templates: "I made ___ glass." ↔ "I made orange glass!"
  if (
    /i made/.test(a) &&
    /glass/.test(a) &&
    /i made/.test(b) &&
    /glass/.test(b) &&
    (/\[color\]|_/.test(String(phrase || "")) || b === "i made glass")
  ) {
    return true;
  }
  return false;
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
          patterns: Array.isArray(t.patterns) ? t.patterns : [],
          chapterId: seg.id,
          chapterTitle: seg.title || seg.id,
          partLabel,
        });
      }
    }
  };
  for (const lesson of allLessons()) {
    pushFrom(
      lesson,
      `${lesson.levelId || "beginner"} · ${lesson.id === "part2" ? "Part 2" : "Part 1"}`
    );
  }
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
    earned: spoken.some((s) => phraseMatchesCatalog(s, item)),
  }));
}

function summarizeUserMcqFromParts(user) {
  let correct = 0;
  let incorrect = 0;
  let attempts = 0;
  let sawProgressDoc = false;
  for (const meta of LEVEL_META) {
    const field = user[meta.field];
    if (!field) continue;
    sawProgressDoc = true;
    for (const part of [field.part1, field.part2]) {
      const totals = summarizeLifetimeMcq(part);
      correct += totals.correct;
      incorrect += totals.incorrect;
      attempts += totals.attempts;
    }
  }
  // Only use legacy rollup when the student has never synced part progress
  // (after reset, part docs exist with empty mcqSummary — do not resurrect stale mcqStats).
  if (!attempts && !sawProgressDoc && user.mcqStats) {
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

export function collectUserBadges(user, levelField = null) {
  return resolveClaimedBadgeIds(user, levelField);
}

function renderLessonBadgeRow(user, meta, partKey) {
  const lesson = lessonFor(meta.id, partKey);
  const ids = collectUserBadges(user, meta.field);
  const pendingIds = resolvePendingBadgeIds(user, meta.field).filter((id) =>
    String(id).startsWith(`${lesson.badgePrefix}_`)
  );
  const tiers = highestTierByFamily(ids, lesson.badgePrefix);
  const part = user?.[meta.field]?.[partKey] || {};
  const accuracy = computeAccuracyTier(part, lesson);
  const ratePct =
    accuracy.total > 0 ? Math.round(accuracy.rate * 1000) / 10 : null;
  const chips = BADGE_FAMILIES.map((family) => {
    const tier = tiers[family];
    const meta = FAMILY_LABELS_JA[family];
    const src = familySlotImage(tier);
    const label = tier ? `${meta.label} ${tier}` : `${meta.label}（未）`;
    return `<span class="progress-badge-chip${tier ? " is-earned" : ""}" title="${escapeHtml(
      meta.desc
    )}">
      <img src="${src}" alt="" width="28" height="28" />
      ${escapeHtml(label)}
    </span>`;
  }).join("");
  const rateLine =
    ratePct != null
      ? `いっぱつせいかい正解率: <strong>${ratePct}%</strong>（${accuracy.correct}/${accuracy.total}）· 今回判定 ${accuracy.tier || "対象外"} · 章のどのプレイでも初回正解なら加点（コレクションは過去最高を保持）`
      : "バッジ用正解率: まだ4択データなし";
  const freetalk = currentFreetalkStats(part);
  const pendingLine = pendingIds.length
    ? `<p class="progress-badge-rate">受け取り待ち（未獲得）: ${pendingIds
        .map(escapeHtml)
        .join("、")}</p>`
    : "";
  const partLabel = partKey === "part1" ? "Part 1" : "Part 2";
  return `<div class="progress-badge-row" aria-label="${escapeHtml(meta.label)} ${partLabel} バッジ">
    <div class="progress-badge-chip-grid">${chips}</div>
    <p class="progress-badge-rate">${rateLine}</p>
    <p class="progress-badge-rate">おしまいフリートーク英語: 累計 ${freetalk.total} 文 · 今回 ${freetalk.currentRun} 文 · 前回完了時 ${freetalk.finalRun} 文</p>
    ${pendingLine}
  </div>`;
}

export function buildProgressSummary(users) {
  const accounts = (users || []).filter((u) => u.role !== "admin");
  const withProgress = accounts.filter(
    (u) => u.beginnerProgress || u.intermediateProgress || u.advancedProgress
  );
  const lessonComplete = accounts.filter((u) => {
    return LEVEL_META.some((meta) => {
      const progress = u[meta.field];
      return Boolean(
        progress?.part1Complete ||
        progress?.part1?.complete ||
        progress?.part2?.complete
      );
    });
  }).length;
  const phraseEarnedSum = accounts.reduce((sum, u) => {
    return sum + phraseChecklist(u).filter((p) => p.earned).length;
  }, 0);
  const avgPhrases = accounts.length ? Math.round(phraseEarnedSum / accounts.length) : 0;
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
    studentCount: accounts.length,
    accountCount: (users || []).length,
    syncedCount: withProgress.length,
    lessonCompleteCount: lessonComplete,
    totalPhrases: avgPhrases,
    phraseCatalogSize: PHRASE_CATALOG.length,
    totalPokes,
    mcqCorrect: mcq.correct,
    mcqIncorrect: mcq.incorrect,
    mcqAttempts: mcq.attempts,
  };
}

function renderChapterPlayCounts(part, lesson) {
  const segments = lesson?.segments || [];
  if (!segments.length) return "";
  const counts = part?.chapterPlayCounts && typeof part.chapterPlayCounts === "object"
    ? part.chapterPlayCounts
    : {};
  const doneIds = new Set(Array.isArray(part?.completedSegmentIds) ? part.completedSegmentIds : []);
  const items = segments
    .map((seg) => {
      const n = Number(counts[seg.id]) || 0;
      const done = doneIds.has(seg.id);
      return `<li class="progress-chapter-play${done ? " is-done" : ""}">
        <span class="progress-chapter-play-title">${escapeHtml(seg.title || seg.id)}</span>
        <span class="progress-chapter-play-count">${n}回</span>
      </li>`;
    })
    .join("");
  return `<ul class="progress-chapter-plays" aria-label="章プレイ回数">${items}</ul>`;
}

function renderHomeworkParts(meta, raw, user) {
  const p1 = raw?.part1 || {};
  const p2 = raw?.part2 || {};
  const row = (label, part, lesson, partKey) => {
    const segCount = (lesson?.segments || []).length || "—";
    const done = part.complete
      ? "完了"
      : `章 ${(Number(part.segmentIndex) || 0) + 1}/${segCount}`;
    const mem = Object.entries(part.memories || {})
      .map(([k, v]) => `${k}:${v}`)
      .join("、 ");
    return `<div class="progress-part-block">
      <p class="progress-level-now">${escapeHtml(label)} — ${escapeHtml(done)}${
        mem ? ` · ${escapeHtml(mem)}` : ""
      }</p>
      ${renderChapterPlayCounts(part, lesson)}
      ${renderLessonBadgeRow(user, meta, partKey)}
    </div>`;
  };
  return `<details class="progress-level-block">
    <summary class="progress-level-header">
      <h4>${escapeHtml(meta.label)}</h4>
      <span class="progress-level-meta">${raw?.part1Complete ? "Part1完了" : "Part1進行中"}</span>
    </summary>
    <div class="progress-level-content">
      ${row("Part 1", p1, lessonFor(meta.id, "part1"), "part1")}
      ${row("Part 2", p2, lessonFor(meta.id, "part2"), "part2")}
    </div>
  </details>`;
}

function resolveBeatChoices(beat, memories = {}) {
  return (beat.choices || []).slice(0, 4).map((c) => expandChoiceTemplate(String(c), memories));
}

function resolveBeatAnswer(beat, memories = {}) {
  return expandChoiceTemplate(String(beat.answer || ""), memories);
}

function expandChoiceTemplate(label, memories = {}) {
  const color = String(memories?.favoriteColor || "").trim();
  let out = formatChoiceLabel(String(label || ""));
  if (color) {
    out = out.replace(/\[color\]/gi, color).replace(/_{2,}/g, color);
  }
  return out;
}

function isCorrectChoiceLabel(choice, beat, memories = {}) {
  const c = normalizeMcqChoice(choice);
  if (!c || !beat) return false;

  if (Array.isArray(beat.acceptAnyOf) && beat.acceptAnyOf.length) {
    return beat.acceptAnyOf.some((p) => {
      const np = normalizeMcqChoice(p);
      return np && (c === np || c.includes(np) || np.includes(c));
    });
  }

  const answer = resolveBeatAnswer(beat, memories);
  const a = normalizeMcqChoice(answer);
  if (a && c === a) return true;

  const rawAnswer = String(beat.answer || "");
  if (
    /i made/.test(c) &&
    /glass/.test(c) &&
    /i made/.test(normalizeMcqChoice(rawAnswer)) &&
    /glass/.test(normalizeMcqChoice(rawAnswer)) &&
    (/\[color\]|_/.test(rawAnswer) || normalizeMcqChoice(rawAnswer) === "i made glass")
  ) {
    return true;
  }

  const patterns = beat.patterns || [];
  return patterns.some((p) => {
    const np = normalizeMcqChoice(p);
    return np && (c === np || c.includes(np));
  });
}

/**
 * Build per-beat lifetime click stats. Event rows outrank legacy summaries.
 */
function beatStatsFromPart(part, segmentId, beatId) {
  const key = `${segmentId}.${beatId}`;
  const summary = part?.mcqSummary?.[key] || null;
  const log = normalizeMcqLog(part?.mcqLog).filter(
    (e) => e.segmentId === segmentId && e.beatId === beatId
  );
  const choiceCounts = log.length ? {} : { ...(summary?.choiceCounts || {}) };
  if (log.length) {
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
    playId: Number(e.playId) || 0,
    firstTry: e.firstTry === true,
  }));
  const logCorrect = clickOrder.filter((c) => c.correct).length;
  const logIncorrect = clickOrder.filter((c) => !c.correct).length;
  const firstCorrect = clickOrder.find((c) => c.correct);
  const triesUntilCorrect = firstCorrect ? firstCorrect.n : null;
  return {
    attempts: log.length
      ? log.length
      : (Number(summary?.correct) || 0) + (Number(summary?.incorrect) || 0),
    correct: log.length ? logCorrect : Number(summary?.correct) || 0,
    incorrect: log.length ? logIncorrect : Number(summary?.incorrect) || 0,
    choiceCounts,
    clickOrder,
    triesUntilCorrect,
  };
}

function renderMcqChapterBlock(seg, part) {
  const memories = part?.memories || {};
  const beats =
    seg.mcqBeats?.length
      ? seg.mcqBeats
      : (seg.items || []).map((item, i) => ({
          id: item.id || `item-${i}`,
          learnyEn: item.promptEn || item.promptJa || item.prompt || item.id || `Q${i + 1}`,
          learnyJa: item.promptJa || "",
          choices: item.choices || [],
          answer: item.answer || "",
          acceptAnyOf: item.acceptAnyOf || [],
          patterns: item.patterns || [],
        }));

  if (!beats.length) return "";

  const beatHtml = beats
    .map((beat, idx) => {
      const stats = beatStatsFromPart(part, seg.id, beat.id);
      const choices = resolveBeatChoices(beat, memories);
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
          const ok = isCorrectChoiceLabel(label, beat, memories);
          const clickedIncorrect = !ok && count > 0;
          return `<li class="progress-mcq-option${ok ? " is-correct" : clickedIncorrect ? " is-incorrect-clicked" : ""}" data-correct="${ok}" data-click-count="${count}"${clickedIncorrect ? ` title="不正解: ${count}回クリック"` : ""}>
            <span class="progress-mcq-option-label">${clickedIncorrect ? '<span class="progress-mcq-option-result" aria-label="不正解">×</span>' : ""}${escapeHtml(label)}</span>
            <span class="progress-mcq-option-count">${count}</span>
          </li>`;
        })
        .join("");

      const orderHtml = stats.clickOrder.length
        ? `<ol class="progress-mcq-order-list">${stats.clickOrder
            .map(
              (c) =>
                `<li class="${c.correct ? "is-correct" : "is-wrong"}" title="${c.correct ? "正解" : "不正解"}">${escapeHtml(c.n)}. ${escapeHtml(
                  c.choice || "(blank)"
                )}${c.correct ? " ✓" : " ×"}${
                  c.playId ? ` · プレイ${escapeHtml(c.playId)}` : ""
                }${c.firstTry ? " · 初回" : ""}</li>`
            )
            .join("")}</ol>`
        : '<p class="progress-empty-inline">まだクリック履歴がありません</p>';

      const triesLabel =
        stats.triesUntilCorrect != null
          ? `初回正解まで ${stats.triesUntilCorrect} 回`
          : stats.attempts
            ? "まだ正解なし"
            : "未回答";

      const prompt = [beat.learnyEn, beat.learnyJa].filter(Boolean).join(" / ");
      return `<div class="progress-mcq-beat">
        <div class="progress-mcq-beat-head">
          <strong>Beat ${idx + 1}</strong>
          <span class="progress-mcq-beat-meta">累計クリック ○${stats.correct} ×${stats.incorrect} · ${stats.attempts}回 · ${escapeHtml(
            triesLabel
          )}</span>
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
  const plays = Number(part?.chapterPlayCounts?.[seg.id]) || 0;

  return `<details class="progress-mcq-chapter${completed ? " is-done" : ""}">
    <summary>
      <span class="progress-mcq-chapter-title">
        <span>${escapeHtml(seg.title || seg.id)}</span>
        <span class="progress-mcq-chapter-en">${escapeHtml(seg.titleEn || seg.id)} · プレイ${plays}回 · 4択${attemptsOnChapter}回</span>
      </span>
      <span class="progress-mcq-chapter-status">${completed ? "クリア" : "未クリア"}</span>
    </summary>
    <div class="progress-mcq-chapter-body">${beatHtml}</div>
  </details>`;
}

function renderMcqActivity(user) {
  const sections = [];
  for (const meta of LEVEL_META) {
    const field = user[meta.field];
    if (!field) continue;
    for (const partKey of ["part1", "part2"]) {
      const segs = mcqSegmentsForLesson(lessonFor(meta.id, partKey));
      const part = field[partKey];
      if (!part) continue;
      const attempts = segs.reduce((sum, seg) => {
        const beats = seg.mcqBeats?.length
          ? seg.mcqBeats
          : (seg.items || []).map((item, i) => ({ id: item.id || `item-${i}` }));
        return (
          sum +
          beats.reduce((s, beat) => s + (beatStatsFromPart(part, seg.id, beat.id).attempts || 0), 0)
        );
      }, 0);
      const hasLog = Array.isArray(part.mcqLog) && part.mcqLog.length > 0;
      if (!attempts && !part.complete && !hasLog) continue;

      const blocks = segs.map((seg) => renderMcqChapterBlock(seg, part)).join("");
      if (!blocks) continue;
      sections.push(
        `<h4 class="progress-mcq-part-title">${escapeHtml(meta.label)} · ${
          partKey === "part1" ? "Part 1" : "Part 2"
        }</h4>
        <div class="progress-mcq-board">${blocks}</div>`
      );
    }
  }
  if (!sections.length) {
    const blocks = mcqSegmentsForLesson(lessonFor("beginner", "part1"))
      .map((seg) => renderMcqChapterBlock(seg, {}))
      .join("");
    if (!blocks) return '<p class="progress-activity-empty">4択チャプターがありません</p>';
    return `<div class="progress-mcq-board">${blocks}</div>`;
  }
  return sections.join("");
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

function eventDate(ts) {
  if (!ts) return null;
  try {
    const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function formatDayHeading(date) {
  if (!date) return "日時不明";
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatTimeOnly(date) {
  if (!date) return "—";
  return date.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKeyJst(date) {
  if (!date) return "unknown";
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD
}

const LEVEL_LABEL = {
  beginner: "ビギナー",
  intermediate: "中級",
  advanced: "上級",
};

const ACTIVITY_TYPE_META = {
  poke: { label: "つつく", short: "つつく" },
  badge: { label: "バッジ", short: "バッジ" },
  badge_revoke: { label: "バッジ取消", short: "取消" },
  reset: { label: "最初から", short: "リセット" },
  mcq_correct: { label: "4択 正解", short: "正解" },
  mcq_incorrect: { label: "4択 不正解", short: "不正解" },
  skip: { label: "スキップ（旧）", short: "スキップ" },
};

function activityTypeMeta(type) {
  return ACTIVITY_TYPE_META[type] || { label: type || "その他", short: type || "?" };
}

function segmentLabelForEvent(ev) {
  const segmentId = String(ev?.segmentId || "");
  if (!segmentId) return "";
  const lesson = lessonFor(
    ev?.level || "beginner",
    ev?.lessonId || "part1"
  );
  const segment = (lesson?.segments || []).find((item) => item.id === segmentId);
  return segment?.title || segment?.titleEn || segmentId;
}

function renderActivityDetail(ev) {
  if (ev.type === "poke") {
    const seg = segmentLabelForEvent(ev);
    return seg
      ? `<span class="tl-tag">${escapeHtml(seg)}</span>`
      : `<span class="tl-muted">つついた</span>`;
  }
  if (ev.type === "mcq_correct" || ev.type === "mcq_incorrect") {
    const segLabel = segmentLabelForEvent(ev) || "章不明";
    const beat = ev.beatId || "";
    const choice = ev.choice || "(未選択)";
    const ok = ev.type === "mcq_correct";
    return `<div class="tl-mcq">
      <span class="tl-tag">${escapeHtml(segLabel)}</span>
      ${beat ? `<span class="tl-tag tl-tag-soft">${escapeHtml(beat)}</span>` : ""}
      <span class="tl-choice ${ok ? "is-ok" : "is-ng"}">${escapeHtml(choice)}</span>
      ${ev.attempt ? `<span class="tl-attempt">${escapeHtml(String(ev.attempt))}回目</span>` : ""}
      ${ev.playId ? `<span class="tl-attempt">プレイ${escapeHtml(String(ev.playId))}</span>` : ""}
      ${ev.firstTry ? '<span class="tl-attempt">初回</span>' : ""}
    </div>`;
  }
  if (ev.type === "reset") {
    return `<span class="tl-tag">${escapeHtml(ev.questTitle || ev.segmentId || "—")}</span>`;
  }
  if (ev.badgeId) {
    return `<span class="tl-tag">${escapeHtml(ev.badgeId)}</span>`;
  }
  if (ev.learnyPrompt) {
    return `<span class="tl-muted">${escapeHtml(String(ev.learnyPrompt).slice(0, 80))}</span>`;
  }
  return "";
}

export function renderActivityTimeline(events) {
  if (!events?.length) {
    return '<p class="progress-activity-empty">まだアクティビティがありません</p>';
  }

  const counts = {
    all: events.length,
    mcq_correct: 0,
    mcq_incorrect: 0,
    poke: 0,
    reset: 0,
    other: 0,
  };
  for (const ev of events) {
    if (ev.type in counts && ev.type !== "all") counts[ev.type] += 1;
    else counts.other += 1;
  }

  const filterChips = [
    ["all", `すべて ${counts.all}`],
    ["mcq_correct", `正解 ${counts.mcq_correct}`],
    ["mcq_incorrect", `不正解 ${counts.mcq_incorrect}`],
    ["poke", `つつく ${counts.poke}`],
    ["reset", `リセット ${counts.reset}`],
  ]
    .filter(([key]) => key === "all" || counts[key] > 0)
    .map(
      ([key, label], i) =>
        `<button type="button" class="tl-filter${i === 0 ? " is-active" : ""}" data-action="filter-activity" data-filter="${escapeHtml(
          key
        )}">${escapeHtml(label)}</button>`
    )
    .join("");

  const byDay = new Map();
  for (const ev of events) {
    const d = eventDate(ev.at);
    const key = dayKeyJst(d);
    if (!byDay.has(key)) byDay.set(key, { date: d, items: [] });
    byDay.get(key).items.push(ev);
  }

  const daysHtml = [...byDay.entries()]
    .map(([, group]) => {
      const itemsHtml = group.items
        .map((ev) => {
          const d = eventDate(ev.at);
          const meta = activityTypeMeta(ev.type);
          const level = ev.level
            ? `<span class="tl-level">${escapeHtml(LEVEL_LABEL[ev.level] || ev.level)}</span>`
            : "";
          const src = ev.source === "admin" ? '<span class="tl-src">admin</span>' : "";
          return `<li class="progress-timeline-item type-${escapeHtml(ev.type || "other")}" data-type="${escapeHtml(
            ev.type || "other"
          )}">
            <span class="tl-rail" aria-hidden="true"><span class="tl-dot"></span></span>
            <div class="tl-card">
              <div class="tl-card-head">
                <span class="tl-badge type-${escapeHtml(ev.type || "other")}">${escapeHtml(meta.label)}</span>
                ${level}
                ${src}
                <time class="tl-time" datetime="${escapeHtml(d ? d.toISOString() : "")}">${escapeHtml(
                  formatTimeOnly(d)
                )}</time>
              </div>
              <div class="tl-card-body">${renderActivityDetail(ev)}</div>
            </div>
          </li>`;
        })
        .join("");

      return `<section class="progress-timeline-day" data-day="${escapeHtml(dayKeyJst(group.date))}">
        <h5 class="progress-timeline-day-title">${escapeHtml(formatDayHeading(group.date))}<span class="tl-day-count">${group.items.length}</span></h5>
        <ol class="progress-timeline-list">${itemsHtml}</ol>
      </section>`;
    })
    .join("");

  return `<div class="progress-timeline">
    <div class="progress-timeline-filters" role="toolbar" aria-label="イベントの種類で絞り込み">${filterChips}</div>
    <div class="progress-timeline-scroll">${daysHtml}</div>
  </div>`;
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
            .map((meta) => renderHomeworkParts(meta, u[meta.field] || {}, u))
            .join("");
          const hasAny = LEVEL_META.some((m) => u[m.field]);
          const hasCompletedLesson = LEVEL_META.some((meta) => {
            const progress = u[meta.field];
            return Boolean(
              progress?.part1Complete ||
              progress?.part1?.complete ||
              progress?.part2?.complete
            );
          });
          const statusClass = hasCompletedLesson
            ? "complete"
            : hasAny
              ? "active"
              : "empty";
          const statusLabel = hasCompletedLesson
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
                <span class="progress-stat-label">4択 累計クリック</span>
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
        <span class="progress-summary-label">レッスンクリア</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.mcqCorrect || 0}/${summary.mcqIncorrect || 0}</span>
        <span class="progress-summary-label">4択 累計クリック 正解/不正解</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPhrases}/${summary.phraseCatalogSize}</span>
        <span class="progress-summary-label">フレーズ習得（平均）</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPokes || 0}</span>
        <span class="progress-summary-label">つつく合計</span>
      </div>
    </div>
    <p class="progress-legend">章プレイ回数 = その章を開始した回数 · 緑 = 正解の選択肢 · 赤い× = クリックした不正解 · 4択の数字 = 生涯クリック回数 · いっぱつせいかい正解率はどのプレイでも初回正解なら加点（獲得済みランクは下がりません）</p>
    <div class="progress-student-grid">${cardsHtml}</div>`;
}

export { LEVEL_META, PHRASE_CATALOG };
