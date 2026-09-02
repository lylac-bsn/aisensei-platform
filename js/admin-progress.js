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

/** Chapters / quizzes that show 4-option MCQ in a lesson. */
function mcqSegmentsForLesson(lesson) {
  return (lesson?.segments || []).filter(
    (s) =>
      (s.mcqBeats && s.mcqBeats.length) ||
      (s.items?.length && (s.type === "quiz" || s.type === "final_challenge"))
  );
}

const PART1_MCQ_SEGMENTS = mcqSegmentsForLesson(AQUARIUM_PART1);
const PART2_MCQ_SEGMENTS = mcqSegmentsForLesson(AQUARIUM_PART2);

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
      const summary = part?.mcqSummary || {};
      for (const row of Object.values(summary)) {
        if (!row || typeof row !== "object") continue;
        correct += Number(row.correct) || 0;
        incorrect += Number(row.incorrect) || 0;
        attempts += Number(row.attempts) || 0;
      }
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
  const accounts = (users || []).filter((u) => u.role !== "admin");
  const withProgress = accounts.filter(
    (u) => u.beginnerProgress || u.intermediateProgress || u.advancedProgress
  );
  const lessonComplete = accounts.filter((u) => {
    const bp = u.beginnerProgress;
    if (!bp) return false;
    return Boolean(bp.part1Complete || (bp.part1?.complete && bp.part2?.complete));
  }).length;
  const totalStars = accounts.reduce((sum, u) => {
    return (
      sum +
      LEVEL_META.reduce((s, m) => {
        const p = u[m.field];
        return s + (Number(p?.part1?.stars) || 0) + (Number(p?.part2?.stars) || 0);
      }, 0)
    );
  }, 0);
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
    totalStars,
    totalPhrases: avgPhrases,
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
  const row = (label, part, lesson) => {
    const segCount = (lesson?.segments || []).length || "—";
    const done = part.complete
      ? "完了"
      : `章 ${(Number(part.segmentIndex) || 0) + 1}/${segCount}`;
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
    ${row("Part 1", p1, AQUARIUM_PART1)}
    ${row("Part 2", p2, AQUARIUM_PART2)}
  </section>`;
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
  const logCorrect = clickOrder.filter((c) => c.correct).length;
  const logIncorrect = clickOrder.filter((c) => !c.correct).length;
  return {
    attempts: summary?.attempts != null ? Number(summary.attempts) : log.length,
    correct: summary?.correct != null ? Number(summary.correct) : logCorrect,
    incorrect: summary?.incorrect != null ? Number(summary.incorrect) : logIncorrect,
    choiceCounts,
    clickOrder,
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
  const sections = [];
  for (const meta of LEVEL_META) {
    const field = user[meta.field];
    if (!field) continue;
    for (const [partKey, segs] of [
      ["part1", PART1_MCQ_SEGMENTS],
      ["part2", PART2_MCQ_SEGMENTS],
    ]) {
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
    const blocks = PART1_MCQ_SEGMENTS.map((seg) => renderMcqChapterBlock(seg, {})).join("");
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

const SEGMENT_LABELS = (() => {
  const map = Object.create(null);
  for (const lesson of [AQUARIUM_PART1, AQUARIUM_PART2]) {
    for (const seg of lesson.segments || []) {
      if (!seg?.id) continue;
      map[seg.id] = seg.title || seg.titleEn || seg.id;
    }
  }
  return map;
})();

const LEVEL_LABEL = {
  beginner: "ビギナー",
  intermediate: "中級",
  advanced: "上級",
};

const ACTIVITY_TYPE_META = {
  poke: { label: "つつく", short: "つつく" },
  star: { label: "スター", short: "★" },
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

function renderActivityDetail(ev) {
  if (ev.type === "poke") {
    const seg = ev.segmentId ? SEGMENT_LABELS[ev.segmentId] || ev.segmentId : "";
    return seg
      ? `<span class="tl-tag">${escapeHtml(seg)}</span>`
      : `<span class="tl-muted">つついた</span>`;
  }
  if (ev.type === "mcq_correct" || ev.type === "mcq_incorrect") {
    const segLabel = SEGMENT_LABELS[ev.segmentId] || ev.segmentId || "章不明";
    const beat = ev.beatId || "";
    const choice = ev.choice || "(未選択)";
    const ok = ev.type === "mcq_correct";
    return `<div class="tl-mcq">
      <span class="tl-tag">${escapeHtml(segLabel)}</span>
      ${beat ? `<span class="tl-tag tl-tag-soft">${escapeHtml(beat)}</span>` : ""}
      <span class="tl-choice ${ok ? "is-ok" : "is-ng"}">${escapeHtml(choice)}</span>
      ${ev.attempt ? `<span class="tl-attempt">${escapeHtml(String(ev.attempt))}回目</span>` : ""}
    </div>`;
  }
  if (ev.type === "star" || ev.type === "reset") {
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
    star: 0,
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
    ["star", `スター ${counts.star}`],
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
        <span class="progress-summary-label">フレーズ習得（平均）</span>
      </div>
      <div class="progress-summary-card">
        <span class="progress-summary-num">${summary.totalPokes || 0}</span>
        <span class="progress-summary-label">つつく合計</span>
      </div>
    </div>
    <p class="progress-legend">緑 = 正解の選択肢 · 数字 = クリック回数 · 章・クリック順は折りたたみで詳細表示</p>
    <div class="progress-student-grid">${cardsHtml}</div>`;
}

export { LEVEL_META, PHRASE_CATALOG, PART1_MCQ_SEGMENTS, PART2_MCQ_SEGMENTS };
