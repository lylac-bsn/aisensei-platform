import {
  loadProgress,
  loadCompletedStepIds,
  getQuests,
  getSelectedQuestIndex,
  setSelectedQuestIndex,
  clearSelectedQuest,
  isQuestUnlocked,
  isLessonComplete,
  resetProgress,
  getLearnedPhrases,
  getLessonBadgeSlots,
  PROGRESS_KEY,
  STEP_PROGRESS_KEY,
  SELECTED_QUEST_KEY,
  LEARNED_PHRASES_KEY,
  LESSON_BADGES_KEY,
} from "./quest-engine.js";

const PANEL_LABELS = {
  instructions: "使い方",
  missions: "ミッション",
  words: "覚えたフレーズ",
  stars: "スター",
  badges: "バッジ",
};

function getVoiceIframe() {
  return document.getElementById("server-iframe-1");
}

function postToVoiceTab(message) {
  try {
    getVoiceIframe()?.contentWindow?.postMessage(message, "*");
  } catch {
    // ignore cross-origin
  }
}

function getCompletedQuestCount() {
  return loadProgress();
}

function getTotalQuests() {
  return getQuests().length;
}

function renderBadgesPanel(container) {
  const slots = getLessonBadgeSlots();
  const earnedCount = slots.filter((s) => s.earned).length;

  container.innerHTML = `
    <div class="dashboard-badge-board">
      <p class="dashboard-badge-board-desc">
        レッスンを全部クリアするとバッジがもらえる！（${earnedCount} / ${slots.length}）
      </p>
      <div class="dashboard-badge-grid" role="list">
        ${slots
          .map((slot) => {
            const classes = [
              "dashboard-badge-slot",
              slot.earned ? "earned" : "",
              slot.upcoming && !slot.earned ? "upcoming" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const inner = slot.earned
              ? `<img src="images/mission-complete-badge.png" alt="" class="dashboard-badge-slot-img" decoding="async">`
              : slot.upcoming
                ? `<span class="dashboard-badge-slot-empty" aria-hidden="true">?</span>`
                : `<span class="dashboard-badge-slot-empty" aria-hidden="true"></span>`;
            return `<div class="${classes}" role="listitem" title="${slot.label}${slot.desc ? ` — ${slot.desc}` : ""}">
              ${inner}
              <span class="dashboard-badge-slot-label">${slot.label}</span>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderWordsPanel(container) {
  const phrases = getLearnedPhrases();
  if (!phrases.length) {
    container.innerHTML =
      '<p class="dashboard-panel-empty">まだフレーズがありません。クエストを進めて英語を覚えよう！</p>';
    return;
  }

  container.innerHTML = `<ul class="dashboard-phrase-list">${phrases
    .map(
      (p) =>
        `<li class="dashboard-phrase-item">
          <span class="dashboard-phrase-en">${p.english}</span>
          <span class="dashboard-phrase-ja">${p.japanese}</span>
          <span class="dashboard-phrase-quest">${p.questTitle}</span>
        </li>`
    )
    .join("")}</ul>`;
}

function renderStarsPanel(container) {
  const earned = getCompletedQuestCount();
  const total = getTotalQuests();
  container.innerHTML = `
    <div class="dashboard-stars-summary">
      <div class="dashboard-stars-big">${earned} / ${total}</div>
      <p class="dashboard-stars-desc">クリアしたクエスト数がスターになります！</p>
      <div class="dashboard-stars-row" aria-hidden="true">
        ${Array.from({ length: total }, (_, i) =>
          `<span class="dashboard-star-icon${i < earned ? " filled" : ""}">★</span>`
        ).join("")}
      </div>
    </div>`;
}

function renderInstructionsPanel(container, isTab1) {
  const source = document.getElementById(
    isTab1 ? "instructions-server1" : "instructions-default"
  );
  if (!source) return;
  container.innerHTML = source.innerHTML;
}

function buildMissionStepSummary(quest, questIndex) {
  const done = new Set(loadCompletedStepIds(questIndex));
  const total = quest.steps?.length || 0;
  const completed = quest.steps?.filter((s) => done.has(s.id)).length || 0;
  return `${completed}/${total} ステップ`;
}

function missionLockIconHtml() {
  return `<span class="mission-select-lock" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <rect x="5" y="11" width="14" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  </span>`;
}

function renderMissionsPanel(container) {
  const quests = getQuests();
  const progress = loadProgress();
  const selected = getSelectedQuestIndex();
  const lessonDone = isLessonComplete();

  let html = `<ul class="mission-select-list">`;

  html += `<li class="mission-select-item${
    selected === null ? " selected" : ""
  }" data-mission-select="free">
    <span class="mission-select-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.97-1.16a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    </span>
    <div class="mission-select-body">
      <strong class="mission-select-title">自由におしゃべり</strong>
      <span class="mission-select-desc">ミッションなし。英語やマイクラについてなんでも聞こう！</span>
    </div>
  </li>`;

  quests.forEach((quest, index) => {
    const unlocked = isQuestUnlocked(index);
    const isSelected = selected === index;
    const isCurrent = !lessonDone && index === progress;
    const isCompleted = index < progress || lessonDone;

    let statusClass = "";
    let badge = "";
    if (!unlocked) {
      statusClass = " locked";
    } else if (isSelected) {
      statusClass = " selected";
    }
    if (isCurrent && !lessonDone) {
      badge = '<span class="mission-select-badge">いまのミッション</span>';
    } else if (isCompleted) {
      badge = '<span class="mission-select-badge mission-select-badge--done">クリア</span>';
    }

    html += `<li class="mission-select-item${statusClass}"${
      unlocked ? ` data-mission-select="${index}"` : ""
    }${unlocked ? "" : ' aria-disabled="true"'}>
      ${!unlocked ? missionLockIconHtml() : ""}
      <span class="mission-select-num">${quest.id}</span>
      <div class="mission-select-body">
        <strong class="mission-select-title">${quest.titleEn || quest.title}</strong>
        <span class="mission-select-desc">${quest.goal}</span>
        <span class="mission-select-steps">${buildMissionStepSummary(quest, index)}</span>
        ${badge}
      </div>
    </li>`;
  });

  html += `</ul>`;
  if (lessonDone) {
    html += `<p class="mission-select-note">すべてのミッションをクリアしました！</p>`;
  }

  container.innerHTML = html;
}

export function initPage1Dashboard({ isVoiceTab = true } = {}) {
  const panel = document.getElementById("dashboard-panel");
  const panelTitle = document.getElementById("dashboard-panel-title");
  const panelBody = document.getElementById("dashboard-panel-body");
  const panelClose = document.getElementById("dashboard-panel-close");
  const starCountEl = document.getElementById("dashboard-star-count");
  const startOverBtn = document.getElementById("dashboard-startover-btn");
  const buttons = document.querySelectorAll(".dashboard-btn[data-panel]");

  if (!panel || !panelBody) return;

  let activePanel = null;
  let callState = "idle";
  let pendingMissionSelect = null;

  function updateStarBadge() {
    if (starCountEl) {
      starCountEl.textContent = String(getCompletedQuestCount());
    }
    updateStartOverButton();
  }

  function updateStartOverButton() {
    if (!startOverBtn) return;
    const show = isLessonComplete();
    startOverBtn.hidden = !show;
  }

  function setPanelModeClass(name) {
    panel.classList.toggle("dashboard-panel--instructions", name === "instructions");
    panel.classList.toggle("dashboard-panel--missions", name === "missions");
  }

  function closePanel() {
    panel.hidden = true;
    panel.classList.remove("dashboard-panel--instructions", "dashboard-panel--missions");
    activePanel = null;
    buttons.forEach((btn) => {
      btn.classList.remove("active");
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function applyMissionSelection(questIndex) {
    if (questIndex === null || questIndex === "free") {
      clearSelectedQuest();
      postToVoiceTab({ type: "gc_quest_clear" });
    } else {
      const index = Number(questIndex);
      if (!setSelectedQuestIndex(index)) return;
      postToVoiceTab({ type: "gc_quest_select", questIndex: index });
    }
    if (activePanel === "missions") {
      renderMissionsPanel(panelBody);
    }
    updateStarBadge();
  }

  function refreshProgressPanels() {
    updateStarBadge();
    if (activePanel === "missions") renderMissionsPanel(panelBody);
    if (activePanel === "words") renderWordsPanel(panelBody);
    if (activePanel === "stars") renderStarsPanel(panelBody);
    if (activePanel === "badges") renderBadgesPanel(panelBody);
  }

  function applyStartOver() {
    resetProgress();
    clearSelectedQuest();
    setSelectedQuestIndex(0);
    postToVoiceTab({ type: "gc_progress_reset", questIndex: 0 });
    refreshProgressPanels();
    closePanel();
    window.dispatchEvent(new Event("learny-progress-changed"));
  }

  function requestStartOver() {
    if (!isLessonComplete()) return;

    const ok = window.confirm(
      "最初からやり直しますか？スターとフレーズの記録もリセットされます。"
    );
    if (!ok) return;

    const onCall = callState === "active" || callState === "connecting";
    if (onCall) {
      pendingMissionSelect = "startover";
      postToVoiceTab({ type: "gc_end_call_and_reset" });
      return;
    }

    applyStartOver();
  }

  function requestMissionSelection(questIndex) {
    const selected = getSelectedQuestIndex();
    const targetIsFree = questIndex === null || questIndex === "free";
    const targetIndex = targetIsFree ? null : Number(questIndex);

    if (targetIsFree && selected === null) return;
    if (!targetIsFree && selected === targetIndex) return;

    const onCall = callState === "active" || callState === "connecting";
    if (onCall) {
      const ok = window.confirm(
        "電話を切ってミッションを変えますか？"
      );
      if (!ok) return;
      pendingMissionSelect = targetIsFree ? "free" : targetIndex;
      postToVoiceTab({ type: "gc_end_call_and_select", questIndex: pendingMissionSelect });
      return;
    }

    applyMissionSelection(targetIsFree ? "free" : targetIndex);
  }

  function openPanel(name) {
    if (activePanel === name) {
      closePanel();
      return;
    }

    activePanel = name;
    panel.hidden = false;
    setPanelModeClass(name);
    panelTitle.textContent = PANEL_LABELS[name] || "";

    buttons.forEach((btn) => {
      const isActive = btn.dataset.panel === name;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-expanded", isActive ? "true" : "false");
    });

    if (name === "instructions") {
      renderInstructionsPanel(panelBody, isVoiceTab);
    } else if (name === "missions") {
      renderMissionsPanel(panelBody);
    } else if (name === "words") {
      renderWordsPanel(panelBody);
    } else if (name === "stars") {
      renderStarsPanel(panelBody);
    } else if (name === "badges") {
      renderBadgesPanel(panelBody);
    }

    updateStarBadge();
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPanel(btn.dataset.panel);
    });
  });

  startOverBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    requestStartOver();
  });

  panelBody.addEventListener("click", (e) => {
    const item = e.target.closest("[data-mission-select]");
    if (!item || activePanel !== "missions") return;
    e.stopPropagation();
    requestMissionSelection(item.dataset.missionSelect);
  });

  panelClose?.addEventListener("click", closePanel);

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    if (panel.contains(e.target) || e.target.closest(".dashboard-btn")) {
      return;
    }
    closePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  window.addEventListener("storage", (e) => {
    if (
      e.key === PROGRESS_KEY ||
      e.key === STEP_PROGRESS_KEY ||
      e.key === SELECTED_QUEST_KEY ||
      e.key === LEARNED_PHRASES_KEY ||
      e.key === LESSON_BADGES_KEY
    ) {
      updateStarBadge();
      if (activePanel === "words") renderWordsPanel(panelBody);
      if (activePanel === "stars") renderStarsPanel(panelBody);
      if (activePanel === "badges") renderBadgesPanel(panelBody);
      if (activePanel === "missions") renderMissionsPanel(panelBody);
    }
  });

  window.addEventListener("focus", updateStarBadge);

  window.addEventListener("message", (e) => {
    if (e.data?.type === "gc_open_panel" && e.data.panel) {
      openPanel(e.data.panel);
      return;
    }

    if (e.data?.type === "gc_call_state") {
      callState = e.data.state || "idle";
      if (
        callState === "idle" &&
        pendingMissionSelect !== null &&
        e.data.selectionApplied
      ) {
        if (pendingMissionSelect === "startover") {
          applyStartOver();
        }
        pendingMissionSelect = null;
        if (activePanel === "missions") renderMissionsPanel(panelBody);
      }
      return;
    }

    if (e.data?.type === "gc_selected_quest_update") {
      if (activePanel === "missions") renderMissionsPanel(panelBody);
      return;
    }

    if (e.data?.type === "gc_quest_progress_update") {
      updateStarBadge();
      if (activePanel === "words") renderWordsPanel(panelBody);
      if (activePanel === "stars") renderStarsPanel(panelBody);
      if (activePanel === "badges") renderBadgesPanel(panelBody);
      if (activePanel === "missions") renderMissionsPanel(panelBody);
    }
  });

  setInterval(updateStarBadge, 3000);
  updateStarBadge();

  const voiceIframe = getVoiceIframe();
  voiceIframe?.addEventListener("load", () => {
    const idx = getSelectedQuestIndex();
    if (idx !== null) {
      postToVoiceTab({ type: "gc_quest_select", questIndex: idx });
    } else {
      postToVoiceTab({ type: "gc_quest_clear" });
    }
  });
}

export function setDashboardInstructionsTab(isVoiceTab) {
  const panel = document.getElementById("dashboard-panel");
  const panelBody = document.getElementById("dashboard-panel-body");
  const instructionsBtn = document.querySelector(
    '.dashboard-btn[data-panel="instructions"]'
  );
  if (
    panel &&
    !panel.hidden &&
    instructionsBtn?.classList.contains("active")
  ) {
    renderInstructionsPanel(panelBody, isVoiceTab);
  }
}
