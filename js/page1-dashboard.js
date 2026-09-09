import {
  getActiveLevelId,
  getLesson,
  getSegments,
  loadLessonStateFor,
  resetLesson,
  jumpToSegment,
  isPart1Complete,
  loadEarnedLessonBadges,
  loadPendingLessonBadges,
  claimPendingLessonBadges,
  getBadgeCatalogForLesson,
  getSegmentChapterMeta,
  formatSegmentChapter,
} from "./lesson-engine.js?v=20260910-daily1-latency-1";
import {
  BADGE_FAMILIES,
  FAMILY_LABELS_JA,
  highestTierByFamily,
  familySlotImage,
  parseBadgeId,
  badgePrefixForScope,
  TIER_RANK,
  BADGE_IMAGES,
  segmentNeedsAccuracyReplay,
  evaluateAndAwardBadges,
} from "./badge-engine.js?v=20260910-daily1-latency-1";
import { QuestSfx } from "./quest-sfx.js";

const PANEL_LABELS = {
  instructions: "使い方",
  missions: "レッスン",
  words: "覚えたフレーズ",
  badges: "バッジ",
};

const TIER_LABEL_JA = {
  bronze: "ブロンズ",
  silver: "シルバー",
  gold: "ゴールド",
};

const PHRASE_TRANSLATIONS_JA = Object.freeze({
  glass: "がらす",
  sand: "すな",
  beach: "びーち",
  mountains: "やま",
  left: "ひだり",
  right: "みぎ",
  "i need glass": "がらすが ひつよう",
  "i need sand": "すなが ひつよう",
  "i found some sand": "すなを みつけた",
  "i found sand": "すなを みつけた",
  "i need to make glass": "がらすを つくらないと",
  "i made glass": "がらすを つくった",
  "i put glass here": "ここに がらすを おいた",
  "i'm building a tank": "すいそうを つくっている",
  "i am building a tank": "すいそうを つくっている",
  "i made a tank": "すいそうを つくった",
  "it looks good": "いい かんじに できた",
  "i put the sand on the bottom": "すいそうの そこに すなを おいた",
  "i put sand on the bottom": "すいそうの そこに すなを おいた",
  "i need more sand": "もっと すなが ひつよう",
  "i'm done": "できた",
  "i am done": "できた",
  "my tank is ready": "すいそうの じゅんびが できた",
});

const COLOR_TRANSLATIONS_JA = Object.freeze({
  red: "あか",
  blue: "あお",
  green: "みどり",
  yellow: "きいろ",
  orange: "おれんじ",
  purple: "むらさき",
  pink: "ぴんく",
  black: "くろ",
  white: "しろ",
  brown: "ちゃいろ",
  gray: "はいいろ",
  grey: "はいいろ",
});

const BADGE_GUIDE_JA = Object.freeze({
  chapter: {
    meaning: "レッスンを どこまで すすめたかが わかる バッジだよ。",
    hint: "🥉 Chapter 0をクリア　🥈 ミニクイズ1までクリア　🥇 さいごまでクリア",
  },
  freetalk: {
    meaning: "おしまいの フリートークで はなした えいごの ぶんすうだよ。",
    hint: "🥉 1ぶん　🥈 2ぶん　🥇 3ぶん",
  },
  accuracy: {
    meaning: "4たくを さいしょの 1かいで せいかいできた きろくだよ。やりなおして せいせきを あげられるよ。",
    hint: "🥉 50%より おおく　🥈 75%より おおく　🥇 ぜんぶ せいかい（どの回のプレイでもOK）",
  },
});

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function phraseTranslationJa(phrase) {
  const key = String(phrase || "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.!?。！？]+$/g, "")
    .replace(/\s+/g, " ");
  if (PHRASE_TRANSLATIONS_JA[key]) return PHRASE_TRANSLATIONS_JA[key];

  const colorGlass = key.match(/^i made (.+) glass$/);
  if (colorGlass) {
    const color = COLOR_TRANSLATIONS_JA[colorGlass[1]] || colorGlass[1];
    return `${color}いろの がらすを つくった`;
  }
  return "";
}

function canonicalSearchPlace(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?。！？]+$/g, "")
    .replace(/\s+/g, " ");
  if (["mountain", "mountains", "the mountains", "やま", "山"].includes(key)) {
    return "mountains";
  }
  if (["beach", "the beach", "ocean", "びーち", "ビーチ", "うみ", "海"].includes(key)) {
    return "beach";
  }
  return "";
}

/** Recover the Chapter 2 place from the strongest persisted choice evidence. */
export function resolveSearchPlace(lessonState = {}) {
  const remembered = canonicalSearchPlace(lessonState.memories?.searchPlace);
  if (remembered) return remembered;

  const log = Array.isArray(lessonState.mcqLog) ? lessonState.mcqLog : [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i];
    if (entry?.segmentId !== "ch2" || entry?.beatId !== "place" || !entry?.correct) continue;
    const selected = canonicalSearchPlace(entry.choice);
    if (selected) return selected;
  }

  const placeSummary = lessonState.mcqSummary?.["ch2.place"];
  if (placeSummary?.lastCorrect) {
    const selected = canonicalSearchPlace(placeSummary.lastChoice);
    if (selected) return selected;
  }

  // "mountains" was never the legacy default answer, so it is safe evidence
  // even in a partial state. A lone legacy "beach" is ambiguous and omitted.
  for (const phrase of lessonState.phrasesSpoken || []) {
    const english = typeof phrase === "string" ? phrase : phrase?.english;
    if (canonicalSearchPlace(english) === "mountains") return "mountains";
  }
  return "";
}

/** Reconcile the learned-place row while preserving all other phrase entries. */
export function phrasesForChildDisplay(lessonState = {}, { reconcileSearchPlace = false } = {}) {
  const phrases = Array.isArray(lessonState.phrasesSpoken)
    ? lessonState.phrasesSpoken
    : [];
  if (!reconcileSearchPlace) return phrases;

  const chosenPlace = resolveSearchPlace(lessonState);
  const result = [];
  let placeAdded = false;
  for (const phrase of phrases) {
    const english = typeof phrase === "string" ? phrase : phrase?.english || "";
    if (!canonicalSearchPlace(english)) {
      result.push(phrase);
      continue;
    }
    if (!chosenPlace || placeAdded) continue;
    result.push(
      typeof phrase === "object"
        ? {
            ...phrase,
            english: chosenPlace,
            japanese: phraseTranslationJa(chosenPlace),
          }
        : chosenPlace
    );
    placeAdded = true;
  }
  if (chosenPlace && !placeAdded) result.push(chosenPlace);
  return result;
}

let activeLessonId = "part1";
const badgeSfx = new QuestSfx(0.36);
let badgeCeremonyQueue = [];
let badgeCeremonyRunning = false;
const pendingReceiptBadgeIds = new Set();
const receivedBadgeIdsThisSession = new Set();

function useBadgeShelf() {
  return getLesson(activeLessonId)?.architecture === "beginner-part1-v1";
}

function activeBadgePrefix() {
  return badgePrefixForScope(getActiveLevelId(), activeLessonId);
}

function displayedEarnedBadges() {
  return loadEarnedLessonBadges().filter(
    (id) => !pendingReceiptBadgeIds.has(id)
  );
}
/** In-app confirm (replaces window.confirm) — matches .learny-confirm-* styles. */
function showLearnyConfirm({
  title = "確認",
  message = "",
  note = "",
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
} = {}) {
  return new Promise((resolve) => {
    let overlay = document.getElementById("learny-confirm-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "learny-confirm-overlay";
      overlay.className = "learny-confirm-overlay";
      overlay.setAttribute("role", "presentation");
      overlay.innerHTML = `
        <div class="learny-confirm-card" role="dialog" aria-modal="true" aria-labelledby="learny-confirm-title" aria-describedby="learny-confirm-msg">
          <div class="learny-confirm-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7"/>
              <polyline points="3 4 3 9 8 9"/>
            </svg>
          </div>
          <h2 id="learny-confirm-title"></h2>
          <p id="learny-confirm-msg"></p>
          <div class="learny-confirm-note" id="learny-confirm-note" hidden></div>
          <div class="learny-confirm-actions">
            <button type="button" class="learny-confirm-btn confirm" data-learny-confirm="ok"></button>
            <button type="button" class="learny-confirm-btn cancel" data-learny-confirm="cancel"></button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }

    const titleEl = overlay.querySelector("#learny-confirm-title");
    const msgEl = overlay.querySelector("#learny-confirm-msg");
    const noteEl = overlay.querySelector("#learny-confirm-note");
    const okBtn = overlay.querySelector('[data-learny-confirm="ok"]');
    const cancelBtn = overlay.querySelector('[data-learny-confirm="cancel"]');

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    if (note) {
      noteEl.hidden = false;
      noteEl.textContent = note;
    } else {
      noteEl.hidden = true;
      noteEl.textContent = "";
    }

    const finish = (value) => {
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onKey);
      overlay.removeEventListener("click", onOverlayClick);
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onOverlayClick = (e) => {
      if (e.target === overlay) finish(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKey);

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => cancelBtn.focus());
  });
}

export function setActiveHomeworkLesson(lessonId) {
  activeLessonId = lessonId === "part2" ? "part2" : "part1";
  refreshDashboardChrome();
  if (useBadgeShelf()) queueBadgeReceipts(loadPendingLessonBadges());
}

function levelId() {
  return getActiveLevelId();
}

function state() {
  return loadLessonStateFor(activeLessonId, levelId());
}

function refreshDashboardChrome() {
  const allBadges = displayedEarnedBadges();
  const badgeCount = document.getElementById("trophy-badge-count");
  const slots = document.getElementById("trophy-badge-slots");

  if (useBadgeShelf()) {
    const tiers = highestTierByFamily(allBadges, activeBadgePrefix());
    const earnedFamilies = BADGE_FAMILIES.filter((f) => tiers[f]).length;
    if (badgeCount) badgeCount.textContent = `${earnedFamilies}/3`;
    if (slots) {
      slots.innerHTML = `<div class="trophy-shelf__group trophy-shelf__group--main">${BADGE_FAMILIES.map(
        (family) => {
          const tier = tiers[family];
          const meta = FAMILY_LABELS_JA[family];
          const src = familySlotImage(tier);
          const on = Boolean(tier);
          const title = on
            ? `${meta.label}（${tier}）— ${meta.desc}`
            : `${meta.label} — まだゲットしていないよ`;
          return `<span class="trophy-slot${on ? " earned" : " upcoming"}" data-badge-family="${family}" title="${title}">
            <img src="${src}" alt="${meta.label}" width="64" height="64" decoding="async" />
          </span>`;
        }
      ).join("")}</div>`;
    }
    return;
  }

  const catalog = getBadgeCatalogForLesson(activeLessonId);
  const catalogIds = new Set(catalog.map((b) => b.id));
  const earned = allBadges.filter((id) => catalogIds.has(id));
  if (badgeCount) badgeCount.textContent = `${earned.length}/${catalog.length || 0}`;
  if (slots) {
    const earnedSet = new Set(earned);
    slots.innerHTML = `<div class="trophy-shelf__group trophy-shelf__group--hidden">${catalog
      .map((b) => {
        const on = earnedSet.has(b.id);
        const inner = on
          ? `<span class="trophy-slot-emoji" aria-hidden="true">${b.emoji || "⭐"}</span>`
          : `<span class="trophy-slot-empty" aria-hidden="true">?</span>`;
        return `<span class="trophy-slot${on ? " earned" : " upcoming"}" data-badge-id="${b.id}" title="${b.label} — ${b.desc}">${inner}</span>`;
      })
      .join("")}</div>`;
  }
}

function renderChapters(container) {
  const lesson = getLesson(activeLessonId);
  const st = state();
  const segments = getSegments(activeLessonId);
  const playCounts = st.chapterPlayCounts || {};
  const earnedAccuracyTier = useBadgeShelf()
    ? highestTierByFamily(displayedEarnedBadges(), activeBadgePrefix()).accuracy
    : null;
  container.innerHTML = `<p class="dashboard-panel-empty" style="margin-bottom:12px">${lesson.title}<br><span class="mission-select-desc">${lesson.weekNote}</span></p>
    <p class="mission-select-note">好きな章をタップして、何度でもやりなおせるよ</p>
    <ul class="mission-select-list">${segments
      .map((seg, i) => {
        const done = st.completedSegmentIds.includes(seg.id);
        const current = i === st.segmentIndex && !st.complete;
        const plays = Number(playCounts[seg.id]) || 0;
        const badge = done
          ? '<span class="mission-select-badge mission-select-badge--done">できた</span>'
          : current
            ? '<span class="mission-select-badge">いま</span>'
            : "";
        const playBadge =
          plays > 0
            ? `<span class="mission-select-plays">${plays}回プレイ</span>`
            : "";
        const needsAccuracyReplay = segmentNeedsAccuracyReplay(st, lesson, seg.id, {
          earnedAccuracyTier,
        });
        const replayBadge = needsAccuracyReplay
          ? '<span class="mission-select-retry" title="この章をもういちどプレイして、いっぱつせいかいをめざそう" aria-label="いっぱつせいかい 再チャレンジ">↻ いっぱつせいかい 再チャレンジ</span>'
          : "";
        const meta = getSegmentChapterMeta(seg);
        const chapter = formatSegmentChapter(seg);
        const itemAria = `${chapter} ${seg.title}${needsAccuracyReplay ? "、いっぱつせいかい 再チャレンジ" : ""}`;
        return `<li class="mission-select-item${current ? " selected" : ""}" role="button" tabindex="0" data-segment-id="${seg.id}" aria-label="${escapeHtml(itemAria)}">
          <span class="mission-select-num" title="${chapter}">${meta.num === "" ? meta.label.slice(0, 1) : meta.num}</span>
          <div class="mission-select-body">
            <strong class="mission-select-title">${chapter} · ${seg.title}</strong>
            <span class="mission-select-desc">${seg.titleEn || ""}</span>
            <span class="mission-select-meta-row">${badge}${playBadge}${replayBadge}</span>
          </div>
        </li>`;
      })
      .join("")}</ul>`;
}

function broadcastChapterJump(segmentId) {
  const msg = { type: "gc_jump_segment", lessonId: activeLessonId, segmentId };
  try {
    window.parent?.postMessage?.(msg, "*");
    window.dispatchEvent(new CustomEvent("learny-progress-changed"));
    document
      .querySelectorAll("#iframe-part1, #iframe-part2, #server-iframe-1, #server-iframe-2")
      .forEach((f) => {
        f.contentWindow?.postMessage(msg, "*");
      });
  } catch {
    // ignore
  }
}

function jumpToChapterFromPanel(segmentId) {
  const seg = getSegments(activeLessonId).find((s) => s.id === segmentId);
  if (!seg) return false;
  jumpToSegment(segmentId, activeLessonId, levelId());
  refreshDashboardChrome();
  broadcastChapterJump(segmentId);
  return true;
}

function renderWords(container) {
  const lessonState = state();
  const phrases = phrasesForChildDisplay(lessonState, {
    reconcileSearchPlace: useBadgeShelf() && activeLessonId === "part1",
  });
  if (!phrases.length) {
    container.innerHTML =
      '<p class="dashboard-panel-empty">まだフレーズがありません。ラーニー先生と英語で話してみよう！</p>';
    return;
  }
  container.innerHTML = `<ul class="dashboard-phrase-list">${phrases
    .map((p) => {
      const english = typeof p === "string" ? p : p?.english || "";
      const japanese =
        (typeof p === "object" && p?.japanese) || phraseTranslationJa(english);
      return `<li class="dashboard-phrase-item">
        <span class="dashboard-phrase-en">${escapeHtml(english)}</span>
        ${japanese ? `<span class="dashboard-phrase-ja">${escapeHtml(japanese)}</span>` : ""}
      </li>`;
    })
    .join("")}</ul>`;
}

function renderBadges(container) {
  if (useBadgeShelf()) {
    const tiers = highestTierByFamily(
      displayedEarnedBadges(),
      activeBadgePrefix()
    );
    const earnedFamilies = BADGE_FAMILIES.filter((f) => tiers[f]).length;
    container.innerHTML = `
    <div class="dashboard-badge-board">
      <p class="dashboard-badge-board-desc">${getLesson(activeLessonId).title} のバッジ（${earnedFamilies} / 3）</p>
      <p class="dashboard-badge-help">バッジは がんばった きろく！ じょうけんを クリアすると、ブロンズ → シルバー → ゴールドに ランクアップするよ。</p>
      <div class="dashboard-badge-grid dashboard-badge-grid--main" role="list">
        ${BADGE_FAMILIES.map((family) => {
          const tier = tiers[family];
          const meta = FAMILY_LABELS_JA[family];
          const src = familySlotImage(tier);
          const on = Boolean(tier);
          const label = on
            ? `${meta.label}（${TIER_LABEL_JA[tier] || tier}）`
            : meta.label;
          return `<div class="dashboard-badge-slot${on ? " earned" : ""}" role="listitem" title="${meta.desc}">
            <img class="dashboard-badge-slot-img" src="${src}" alt="" width="72" height="72" decoding="async" />
            <span class="dashboard-badge-slot-label">${label}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="dashboard-badge-guide" aria-label="バッジのとりかた">
        ${BADGE_FAMILIES.map((family) => {
          const meta = FAMILY_LABELS_JA[family];
          const guide = BADGE_GUIDE_JA[family];
          return `<section class="dashboard-badge-guide-item">
            <h3>${meta.label}</h3>
            <p>${guide.meaning}</p>
            <p class="dashboard-badge-guide-hint"><strong>ヒント：</strong>${guide.hint}</p>
          </section>`;
        }).join("")}
      </div>
    </div>`;
    return;
  }

  const catalog = getBadgeCatalogForLesson(activeLessonId);
  const earned = new Set(
    displayedEarnedBadges().filter((id) => catalog.some((b) => b.id === id))
  );
  container.innerHTML = `
    <div class="dashboard-badge-board">
      <p class="dashboard-badge-board-desc">宿題でゲットしたバッジ（${earned.size} / ${catalog.length}）</p>
      <div class="dashboard-badge-grid dashboard-badge-grid--main" role="list">
        ${catalog
          .map((b) => {
            const on = earned.has(b.id);
            return `<div class="dashboard-badge-slot${on ? " earned" : ""}" title="${b.desc}">
              <span class="dashboard-badge-slot-label">${on ? `${b.emoji || ""} ${b.label}` : "？？？"}</span>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderInstructions(container) {
  const source = document.getElementById("instructions-server1");
  if (source) container.innerHTML = source.innerHTML;
}

export function initPage1Dashboard({ isVoiceTab = true } = {}) {
  const panel = document.getElementById("dashboard-panel");
  const panelTitle = document.getElementById("dashboard-panel-title");
  const panelBody = document.getElementById("dashboard-panel-body");
  const panelClose = document.getElementById("dashboard-panel-close");
  const startOverBtn = document.getElementById("dashboard-startover-btn");
  const buttons = document.querySelectorAll("[data-panel]");
  const backdrop = document.getElementById("dashboard-backdrop");

  bindDashboardChatResize();

  if (!panel || !panelBody) return;

  let activePanel = null;

  function setBackdropVisible(visible) {
    if (!backdrop) return;
    backdrop.hidden = !visible;
    backdrop.classList.toggle("is-visible", visible);
    backdrop.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function openPanel(name) {
    activePanel = name;
    panel.hidden = false;
    panel.classList.toggle("dashboard-panel--instructions", name === "instructions");
    panel.classList.toggle("dashboard-panel--missions", name === "missions");
    panel.classList.toggle("dashboard-panel--badges", name === "badges");
    if (panelTitle) panelTitle.textContent = PANEL_LABELS[name] || name;
    if (name === "missions") renderChapters(panelBody);
    else if (name === "words") renderWords(panelBody);
    else if (name === "badges") renderBadges(panelBody);
    else if (name === "instructions") renderInstructions(panelBody);
    buttons.forEach((b) =>
      b.setAttribute("aria-expanded", b.dataset.panel === name ? "true" : "false")
    );
    setBackdropVisible(true);
  }

  function closePanel() {
    activePanel = null;
    panel.hidden = true;
    buttons.forEach((b) => b.setAttribute("aria-expanded", "false"));
    setBackdropVisible(false);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.panel;
      if (activePanel === name) closePanel();
      else openPanel(name);
    });
  });
  panelClose?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !activePanel) return;
    if (document.getElementById("learny-confirm-overlay")?.classList.contains("active")) return;
    closePanel();
  });

  panelBody.addEventListener("click", (e) => {
    if (activePanel !== "missions") return;
    const item = e.target.closest?.(".mission-select-item[data-segment-id]");
    if (!item) return;
    e.preventDefault();
    if (jumpToChapterFromPanel(item.dataset.segmentId)) closePanel();
  });
  panelBody.addEventListener("keydown", (e) => {
    if (activePanel !== "missions") return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest?.(".mission-select-item[data-segment-id]");
    if (!item) return;
    e.preventDefault();
    if (jumpToChapterFromPanel(item.dataset.segmentId)) closePanel();
  });

  startOverBtn?.addEventListener("click", async () => {
    const fullHistoryWipe = useBadgeShelf();
    const ok = await showLearnyConfirm({
      title: "最初からやり直す？",
      message: "この Part の宿題を最初からやり直しますか？",
      note: fullHistoryWipe
        ? "進度・4択のきろく・プレイ回数・バッジも消えて、はじめからとりなおします"
        : "いままでの進度はリセットされます",
      confirmLabel: "最初からやり直す",
      cancelLabel: "やめる",
    });
    if (!ok) return;
    resetLesson(activeLessonId, levelId());
    refreshDashboardChrome();
    window.dispatchEvent(new CustomEvent("learny-progress-changed"));
    const resetEvent = {
      type: "reset",
      level: levelId(),
      lessonId: activeLessonId,
      questTitle: activeLessonId,
      segmentId: activeLessonId,
      source: "client",
      wipeLessonHistory: fullHistoryWipe,
    };
    try {
      // Same window as page1.js — use CustomEvent only (postMessage would double-log).
      window.dispatchEvent(new CustomEvent("learny-activity", { detail: resetEvent }));
      window.parent?.postMessage?.({ type: "gc_reset_lesson", lessonId: activeLessonId }, "*");
      window.parent?.postMessage?.({ type: "gc_quest_progress_update" }, "*");
      document
        .querySelectorAll("#iframe-part1, #iframe-part2, #server-iframe-1, #server-iframe-2")
        .forEach((f) => {
          f.contentWindow?.postMessage({ type: "gc_reset_lesson", lessonId: activeLessonId }, "*");
          f.contentWindow?.postMessage({ type: "gc_quest_progress_update" }, "*");
        });
    } catch {
      // ignore
    }
    if (activePanel) openPanel(activePanel);
  });

  window.addEventListener("message", (e) => {
    if (e.data?.type === "gc_quest_progress_update") {
      refreshDashboardChrome();
      if (activePanel) openPanel(activePanel);
    }
    if (e.data?.type === "gc_badges_earned") {
      const ids = e.data.newlyEarned || [];
      if (ids.length && useBadgeShelf()) {
        queueBadgeReceipts(ids);
      } else {
        refreshDashboardChrome();
      }
    }
  });

  window.addEventListener("learny-badges-earned", (e) => {
    if (useBadgeShelf()) queueBadgeReceipts(e.detail?.newlyEarned || []);
    else refreshDashboardChrome();
  });

  refreshDashboardChrome();
  if (useBadgeShelf()) {
    // Re-score from sticky best / mcqLog so a clean later play awards gold
    // even if the previous session missed the ceremony.
    const { newlyEarned } = evaluateAndAwardBadges();
    queueBadgeReceipts([
      ...loadPendingLessonBadges(),
      ...(newlyEarned || []),
    ]);
  }

  window.addEventListener("storage", (e) => {
    if (
      e.key === "gc_homework_lessonBadges" ||
      e.key === "gc_homework_pendingLessonBadges" ||
      String(e.key || "").startsWith("gc_hw_")
    ) {
      refreshDashboardChrome();
      if (activePanel) openPanel(activePanel);
      if (useBadgeShelf()) queueBadgeReceipts(loadPendingLessonBadges());
    }
  });
}

/** Pick highest newly earned tier per family (bronze+silver in one burst → show silver). */
function awardsFromNewlyEarned(newlyEarned) {
  const best = { chapter: null, freetalk: null, accuracy: null };
  const prefix = activeBadgePrefix();
  for (const id of newlyEarned || []) {
    const parsed = parseBadgeId(id);
    if (!parsed || parsed.prefix !== prefix) continue;
    const rank = TIER_RANK[parsed.tier] || 0;
    const cur = best[parsed.family];
    if (!cur || rank > (TIER_RANK[cur] || 0)) best[parsed.family] = parsed.tier;
  }
  return BADGE_FAMILIES.filter((f) => best[f]).map((family) => ({
    family,
    tier: best[family],
  }));
}

function queueBadgeReceipts(newlyEarned) {
  const prefix = activeBadgePrefix();
  const fresh = (newlyEarned || []).filter((id) => {
    const parsed = parseBadgeId(id);
    return (
      parsed?.prefix === prefix &&
      !pendingReceiptBadgeIds.has(String(id)) &&
      !receivedBadgeIdsThisSession.has(String(id))
    );
  });
  if (!fresh.length) return;
  fresh.forEach((id) => pendingReceiptBadgeIds.add(String(id)));
  // Keep newly persisted awards visually locked until the child receives them.
  refreshDashboardChrome();
  celebrateBadgeAwards(fresh);
}

function markBadgeFamilyReceived(family, tier) {
  const prefix = activeBadgePrefix();
  const receivedRank = TIER_RANK[tier] || 0;
  const receivedIds = [];
  for (const id of [...pendingReceiptBadgeIds]) {
    const parsed = parseBadgeId(id);
    if (
      parsed?.prefix === prefix &&
      parsed.family === family &&
      (TIER_RANK[parsed.tier] || 0) <= receivedRank
    ) {
      pendingReceiptBadgeIds.delete(id);
      receivedBadgeIdsThisSession.add(id);
      receivedIds.push(id);
    }
  }
  const { newlyClaimed } = claimPendingLessonBadges(receivedIds);
  refreshDashboardChrome();
  if (!newlyClaimed.length) return;
  try {
    for (const badgeId of newlyClaimed) {
      window.parent?.postMessage?.(
        {
          type: "gc_activity_event",
          event: {
            type: "badge",
            level: getActiveLevelId(),
            lessonId: activeLessonId,
            badgeId,
            source: "client",
          },
        },
        "*"
      );
    }
    window.dispatchEvent(new CustomEvent("learny-progress-changed"));
    window.parent?.postMessage?.(
      { type: "gc_badges_claimed", newlyClaimed },
      "*"
    );
  } catch {
    // Local claimed state remains authoritative; remote sync is best-effort.
  }
}

function ensureBadgeAwardOverlay() {
  let overlay = document.getElementById("badge-award-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "badge-award-overlay";
  overlay.className = "badge-award-overlay";
  overlay.hidden = true;
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "badge-award-label");
  overlay.innerHTML = `
    <div class="badge-award-backdrop" aria-hidden="true"></div>
    <div class="badge-award-stage">
      <div class="badge-award-rays" aria-hidden="true"></div>
      <img class="badge-award-img" alt="" width="220" height="220" decoding="async" />
    </div>
    <p class="badge-award-label" id="badge-award-label"></p>
    <button type="button" class="badge-award-accept" hidden>うけとる</button>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function celebrateBadgeAwards(newlyEarned) {
  const awards = awardsFromNewlyEarned(newlyEarned);
  if (!awards.length) return;
  badgeCeremonyQueue.push(...awards);
  if (!badgeCeremonyRunning) runNextBadgeCeremony();
}

async function runNextBadgeCeremony() {
  if (badgeCeremonyRunning) return;
  const next = badgeCeremonyQueue.shift();
  if (!next) return;
  badgeCeremonyRunning = true;
  try {
    await playOneBadgeCeremony(next.family, next.tier);
  } catch {
    // ignore animation errors
  }
  badgeCeremonyRunning = false;
  if (badgeCeremonyQueue.length) runNextBadgeCeremony();
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForBadgeReceipt(button) {
  return new Promise((resolve) => {
    button.addEventListener("click", resolve, { once: true });
  });
}

function prefersReducedBadgeMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

async function animateBadgeFlight(img, slot, overlay, reducedMotion) {
  const from = img.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  if (!from.width || !from.height || !to.width || !to.height) return null;

  const flight = img.cloneNode();
  flight.removeAttribute("id");
  flight.alt = "";
  flight.setAttribute("aria-hidden", "true");
  flight.className = "badge-award-flight";
  Object.assign(flight.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  overlay.appendChild(flight);
  img.classList.add("badge-award-img--in-flight");
  overlay.classList.add("flying");

  const targetScale = Math.min(
    (to.width * 0.88) / from.width,
    (to.height * 0.88) / from.height
  );
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const duration = reducedMotion ? 1 : 820;
  const flightAnimation = flight.animate(
    reducedMotion
      ? [
          { transform: "translate3d(0, 0, 0) scale(1)" },
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${targetScale})` },
        ]
      : [
          { transform: "translate3d(0, 0, 0) scale(1)", offset: 0 },
          { transform: "translate3d(0, -8px, 0) scale(1.04)", offset: 0.12 },
          {
            transform: `translate3d(${dx * 0.82}px, ${dy * 0.82}px, 0) scale(${Math.max(targetScale * 1.12, targetScale + 0.02)})`,
            offset: 0.78,
          },
          {
            transform: `translate3d(${dx}px, ${dy}px, 0) scale(${targetScale})`,
            offset: 1,
          },
        ],
    {
      duration,
      easing: "cubic-bezier(0.32, 0.72, 0.22, 1)",
      fill: "forwards",
    }
  );
  try {
    await flightAnimation.finished;
  } catch {
    // The ceremony can still settle if an animation is cancelled by navigation.
  }
  return flight;
}

async function playOneBadgeCeremony(family, tier) {
  const previousFocus = document.activeElement;
  const overlay = ensureBadgeAwardOverlay();
  const img = overlay.querySelector(".badge-award-img");
  const label = overlay.querySelector(".badge-award-label");
  const acceptButton = overlay.querySelector(".badge-award-accept");
  const meta = FAMILY_LABELS_JA[family] || { label: family };
  const tierJa = TIER_LABEL_JA[tier] || tier;
  const src = BADGE_IMAGES[tier] || familySlotImage(tier);

  img.src = src;
  img.alt = `${meta.label} ${tierJa}`;
  label.textContent = `${meta.label} ${tierJa} ゲット！`;
  acceptButton.hidden = true;
  acceptButton.disabled = false;
  overlay.classList.remove("accepting", "flying", "show", "ready-to-receive");
  img.classList.remove("badge-award-img--in-flight");
  overlay.querySelectorAll(".badge-award-flight").forEach((el) => el.remove());
  overlay.hidden = false;
  try {
    await img.decode();
  } catch {
    // A cached or already-decoded image is ready to animate.
  }
  // Force reflow so .show animations restart
  void overlay.offsetWidth;
  overlay.classList.add("show");

  if (tier === "gold") badgeSfx.playLessonComplete();
  else badgeSfx.playQuestComplete();

  const reducedMotion = prefersReducedBadgeMotion();
  await waitMs(reducedMotion ? 60 : 900);
  acceptButton.hidden = false;
  overlay.classList.add("ready-to-receive");
  acceptButton.focus({ preventScroll: true });
  await waitForBadgeReceipt(acceptButton);
  acceptButton.disabled = true;
  overlay.classList.add("accepting");
  await waitMs(reducedMotion ? 1 : 130);
  overlay.classList.remove("ready-to-receive");

  const slot = document.querySelector(`.trophy-slot[data-badge-family="${family}"]`);
  let flight = null;
  if (slot && img.isConnected) {
    flight = await animateBadgeFlight(img, slot, overlay, reducedMotion);
  } else {
    overlay.classList.add("flying");
    await waitMs(reducedMotion ? 1 : 400);
  }

  markBadgeFamilyReceived(family, tier);
  refreshDashboardChrome();
  const receivedSlot = document.querySelector(
    `.trophy-slot[data-badge-family="${family}"]`
  );
  if (receivedSlot) {
    flashBadgeSlot(family);
  }
  if (flight) {
    const fade = flight.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reducedMotion ? 1 : 220,
      easing: "ease-out",
      fill: "forwards",
    });
    try {
      await fade.finished;
    } catch {
      // Continue cleanup if the crossfade is cancelled.
    }
    flight.remove();
  } else {
    await waitMs(reducedMotion ? 1 : 180);
  }

  overlay.classList.remove("show", "accepting", "flying");
  overlay.hidden = true;
  img.classList.remove("badge-award-img--in-flight");

  // Briefly open badges panel highlight via shelf pulse
  const shelf = document.getElementById("trophy-shelf-badges");
  if (shelf) {
    shelf.classList.add("badge-shelf-pulse");
    setTimeout(() => shelf.classList.remove("badge-shelf-pulse"), 1200);
  }
  if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
    previousFocus.focus({ preventScroll: true });
  }
}

function flashBadgeSlot(family) {
  const el = document.querySelector(`.trophy-slot[data-badge-family="${family}"]`);
  if (!el) return;
  el.classList.remove("just-earned");
  void el.offsetWidth;
  el.classList.add("just-earned");
  setTimeout(() => el.classList.remove("just-earned"), 1600);
}

function flashBadgeSlots(newlyEarned) {
  // Kept for callers that only want a shelf pulse without the full ceremony.
  const families = new Set();
  for (const id of newlyEarned || []) {
    const parsed = parseBadgeId(id);
    if (parsed) families.add(parsed.family);
  }
  for (const family of families) flashBadgeSlot(family);
}

let dashboardChatResizeBound = false;

function bindDashboardChatResize() {
  syncDashboardChatSize();
  if (dashboardChatResizeBound) return;
  dashboardChatResizeBound = true;
  window.addEventListener("resize", syncDashboardChatSize);
  window.visualViewport?.addEventListener("resize", syncDashboardChatSize);
  window.visualViewport?.addEventListener("scroll", syncDashboardChatSize);
  if (typeof ResizeObserver !== "undefined") {
    const header = document.querySelector("header.app-header");
    const appView = document.getElementById("app-view");
    const ro = new ResizeObserver(() => syncDashboardChatSize());
    if (header) ro.observe(header);
    if (appView) ro.observe(appView);
  }
  requestAnimationFrame(() => syncDashboardChatSize());
}

/**
 * Size the chat iframe to whatever space is left under the header on this screen.
 * Replaces guessed rem/vh math that breaks with long names, OS scaling, or short laptops.
 */
export function syncDashboardChatSize() {
  const root = document.documentElement;
  const appView = document.getElementById("app-view");
  const header = document.querySelector("header.app-header");
  const grid = document.querySelector(".main-content-grid--dashboard");
  if (!appView || !grid) return;

  const headerH = header?.getBoundingClientRect().height || 0;
  const styles = getComputedStyle(grid);
  const padTop = parseFloat(styles.paddingTop) || 0;
  const padBottom = parseFloat(styles.paddingBottom) || 0;
  const vv = window.visualViewport;
  const viewportH = Math.round(vv?.height || window.innerHeight || appView.clientHeight || 0);
  const stacked = window.matchMedia("(max-width: 860px)").matches;

  let chatH;
  if (stacked) {
    chatH = Math.min(Math.round(viewportH * 0.7), Math.max(360, viewportH - headerH - 48));
  } else {
    chatH = viewportH - headerH - padTop - padBottom;
  }

  const minH = stacked ? 360 : 280;
  const maxH = Math.max(minH, viewportH - (stacked ? 48 : headerH));
  chatH = Math.round(Math.min(maxH, Math.max(minH, chatH)));

  root.style.setProperty("--dashboard-chat-height", `${chatH}px`);
  root.style.setProperty("--dashboard-header-measured", `${Math.round(headerH)}px`);
}

export function setDashboardInstructionsTab() {
  // Homework is always the voice tab.
}
