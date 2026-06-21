import {
  loadProgress,
  loadCompletedStepIds,
  getQuests,
  PROGRESS_KEY,
  STEP_PROGRESS_KEY,
} from "./quest-engine.js";

const PANEL_LABELS = {
  instructions: "使い方",
  words: "覚えたフレーズ",
  stars: "スター",
  badges: "バッジ",
};

function getCompletedQuestCount() {
  return loadProgress();
}

function getTotalQuests() {
  return getQuests().length;
}

function formatEnglishPhrase(text) {
  if (!text) return "";
  return text
    .split(" ")
    .map((word) => {
      if (word === "i") return "I";
      if (word === "i'm") return "I'm";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function getLearnedPhrases() {
  const quests = getQuests();
  const phrases = [];

  quests.forEach((quest, questIndex) => {
    const doneIds = new Set(loadCompletedStepIds(questIndex));
    quest.steps?.forEach((step) => {
      if (!doneIds.has(step.id)) return;
      const english =
        formatEnglishPhrase(step.patterns?.[0]) ||
        step.coachNote?.match(/「([^」]+)」/)?.[1] ||
        step.label;
      phrases.push({
        questTitle: quest.titleEn || quest.title,
        japanese: step.label,
        english,
      });
    });
  });

  return phrases;
}

function getEarnedBadges() {
  const completed = getCompletedQuestCount();
  const quests = getQuests();
  const badges = [];

  for (let i = 0; i < completed && i < quests.length; i++) {
    badges.push({
      id: quests[i].id,
      title: quests[i].titleEn || quests[i].title,
      subtitle: `${quests[i].title} クリア`,
    });
  }

  return badges;
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

function renderBadgesPanel(container) {
  const badges = getEarnedBadges();
  if (!badges.length) {
    container.innerHTML =
      '<p class="dashboard-panel-empty">まだバッジがありません。クエストをクリアしてバッジを集めよう！</p>';
    return;
  }

  container.innerHTML = `<ul class="dashboard-badge-list">${badges
    .map(
      (b) =>
        `<li class="dashboard-badge-item">
          <span class="dashboard-badge-icon" aria-hidden="true">🏅</span>
          <div>
            <strong>${b.title}</strong>
            <span>${b.subtitle}</span>
          </div>
        </li>`
    )
    .join("")}</ul>`;
}

function renderInstructionsPanel(container, isTab1) {
  const source = document.getElementById(
    isTab1 ? "instructions-server1" : "instructions-default"
  );
  if (!source) return;
  container.innerHTML = source.innerHTML;
}

export function initPage1Dashboard({ isVoiceTab = true } = {}) {
  const panel = document.getElementById("dashboard-panel");
  const panelTitle = document.getElementById("dashboard-panel-title");
  const panelBody = document.getElementById("dashboard-panel-body");
  const panelClose = document.getElementById("dashboard-panel-close");
  const starCountEl = document.getElementById("dashboard-star-count");
  const buttons = document.querySelectorAll(".dashboard-btn[data-panel]");

  if (!panel || !panelBody) return;

  let activePanel = null;

  function updateStarBadge() {
    if (starCountEl) {
      starCountEl.textContent = String(getCompletedQuestCount());
    }
  }

  function closePanel() {
    panel.hidden = true;
    panel.classList.remove("dashboard-panel--instructions");
    activePanel = null;
    buttons.forEach((btn) => {
      btn.classList.remove("active");
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function openPanel(name) {
    if (activePanel === name) {
      closePanel();
      return;
    }

    activePanel = name;
    panel.hidden = false;
    panel.classList.toggle("dashboard-panel--instructions", name === "instructions");
    panelTitle.textContent = PANEL_LABELS[name] || "";

    buttons.forEach((btn) => {
      const isActive = btn.dataset.panel === name;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-expanded", isActive ? "true" : "false");
    });

    if (name === "instructions") {
      renderInstructionsPanel(panelBody, isVoiceTab);
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

  panelClose?.addEventListener("click", closePanel);

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    if (
      panel.contains(e.target) ||
      e.target.closest(".dashboard-btn")
    ) {
      return;
    }
    closePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === PROGRESS_KEY || e.key === STEP_PROGRESS_KEY) {
      updateStarBadge();
      if (activePanel === "words") renderWordsPanel(panelBody);
      if (activePanel === "stars") renderStarsPanel(panelBody);
      if (activePanel === "badges") renderBadgesPanel(panelBody);
    }
  });

  window.addEventListener("focus", updateStarBadge);
  window.addEventListener("message", (e) => {
    if (e.data?.type === "gc_quest_progress_update") {
      updateStarBadge();
      if (activePanel === "words") renderWordsPanel(panelBody);
      if (activePanel === "stars") renderStarsPanel(panelBody);
      if (activePanel === "badges") renderBadgesPanel(panelBody);
    }
  });
  setInterval(updateStarBadge, 3000);

  updateStarBadge();
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
