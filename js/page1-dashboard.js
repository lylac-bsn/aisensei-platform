import {
  loadProgress,
  loadCompletedStepIds,
  getQuests,
  getSelectedQuestIndex,
  setSelectedQuestIndex,
  clearSelectedQuest,
  ensureDefaultMissionSelected,
  isQuestUnlocked,
  isLessonComplete,
  resetProgress,
  getLearnedPhrases,
  getMainBadgeSlots,
  getHiddenBadgeSlots,
  getActiveLevelInfo,
  HIDDEN_BADGES,
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

// Badges the user has already "seen" in the collection panel. Earned badges
// not in this list show a notification dot and get a reveal animation on the
// next panel open. Shared across levels (the badge collection is shared).
const BADGES_SEEN_KEY = "gc_beginner_badgesSeenIds";

/** Badge ids belonging to the active level (main + its hidden badges). */
function getActiveLevelBadgeIds() {
  const level = getActiveLevelInfo();
  return new Set([
    level.mainBadgeId,
    ...HIDDEN_BADGES.filter((b) => b.level === level.id).map((b) => b.id),
  ]);
}

function loadSeenBadgeIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(BADGES_SEEN_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveSeenBadgeIds(ids) {
  try {
    localStorage.setItem(BADGES_SEEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // storage unavailable — dot just stays until next visit
  }
}

function getEarnedBadgeIds() {
  return [...getMainBadgeSlots(), ...getHiddenBadgeSlots()]
    .filter((s) => s.earned)
    .map((s) => s.id);
}

function getUnseenEarnedBadgeIds() {
  const seen = new Set(loadSeenBadgeIds());
  return getEarnedBadgeIds().filter((id) => !seen.has(id));
}

// ---------------------------------------------------------------------------
// Badge hint bubble — tapping any badge slot (trophy shelf or badge panel)
// shows how to earn it: earned badges show their story, unearned show a hint.
// ---------------------------------------------------------------------------
let badgeHintBubbleEl = null;
let badgeHintBubbleForId = null;
let badgeHintBubbleTimer = null;

function hideBadgeHintBubble() {
  if (badgeHintBubbleTimer) {
    clearTimeout(badgeHintBubbleTimer);
    badgeHintBubbleTimer = null;
  }
  badgeHintBubbleForId = null;
  if (badgeHintBubbleEl) {
    badgeHintBubbleEl.remove();
    badgeHintBubbleEl = null;
  }
}

function findBadgeSlotById(id) {
  return [...getMainBadgeSlots(), ...getHiddenBadgeSlots()].find((s) => s.id === id) || null;
}

function showBadgeHintBubble(anchorEl, slot) {
  hideBadgeHintBubble();

  const title = slot.earned ? slot.label : "どうやってゲットする？";
  const text = slot.earned ? slot.desc || slot.label : slot.hint || "？？？";
  const icon = slot.earned ? "🏆" : "🔎";

  const bubble = document.createElement("div");
  bubble.className = "badge-hint-bubble";
  bubble.setAttribute("role", "tooltip");
  bubble.innerHTML = `
    <span class="badge-hint-bubble-title">${icon} ${title}</span>
    <span class="badge-hint-bubble-text">${text}</span>`;
  document.body.appendChild(bubble);

  // Position: centered under the slot, clamped to the viewport; flip above
  // when there is no room below.
  const rect = anchorEl.getBoundingClientRect();
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const margin = 8;
  let left = rect.left + rect.width / 2 - bw / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
  let top = rect.bottom + 10;
  let above = false;
  if (top + bh > window.innerHeight - margin) {
    top = rect.top - bh - 10;
    above = true;
  }
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;

  const arrowX = rect.left + rect.width / 2 - left;
  bubble.style.setProperty("--arrow-x", `${Math.max(14, Math.min(arrowX, bw - 14))}px`);
  bubble.classList.add(above ? "badge-hint-bubble--above" : "badge-hint-bubble--below");

  badgeHintBubbleEl = bubble;
  badgeHintBubbleForId = slot.id;
  badgeHintBubbleTimer = setTimeout(hideBadgeHintBubble, 8000);
}

let badgeHintClicksBound = false;

function setupBadgeHintClicks() {
  if (badgeHintClicksBound) return;
  badgeHintClicksBound = true;

  document.addEventListener("click", (event) => {
    const slotEl = event.target.closest?.(
      ".trophy-slot[data-badge-id], .dashboard-badge-slot[data-badge-id]"
    );
    if (!slotEl) {
      hideBadgeHintBubble();
      return;
    }
    const id = slotEl.dataset.badgeId;
    if (badgeHintBubbleForId === id) {
      hideBadgeHintBubble();
      return;
    }
    const slot = findBadgeSlotById(id);
    if (slot) showBadgeHintBubble(slotEl, slot);
  });

  window.addEventListener("resize", hideBadgeHintBubble);
  window.addEventListener("scroll", hideBadgeHintBubble, true);
}

/** revealIndex >= 0: play the reveal pop, staggered one badge at a time. */
function renderBadgeSlotHtml(slot, revealIndex = -1) {
  const classes = [
    "dashboard-badge-slot",
    slot.earned ? "earned" : "",
    slot.upcoming && !slot.earned ? "upcoming" : "",
    revealIndex >= 0 ? "reveal" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const revealStyle = revealIndex >= 0 ? ` style="animation-delay: ${revealIndex * 0.8}s"` : "";
  const inner = slot.earned
    ? `<img src="${slot.image || "images/completion-badge-bronze.png"}" alt="" class="dashboard-badge-slot-img" decoding="async">`
    : slot.upcoming
      ? `<span class="dashboard-badge-slot-empty" aria-hidden="true">?</span>`
      : `<span class="dashboard-badge-slot-empty" aria-hidden="true"></span>`;
  return `<div class="${classes}"${revealStyle} role="listitem" data-badge-id="${slot.id}" title="${slot.label}${slot.desc ? ` — ${slot.desc}` : ""}">
    ${inner}
    <span class="dashboard-badge-slot-label">${slot.label}</span>
  </div>`;
}

function renderBadgesPanel(container) {
  const mainSlots = getMainBadgeSlots();
  const hiddenSlots = getHiddenBadgeSlots();
  const earnedCount =
    mainSlots.filter((s) => s.earned).length +
    hiddenSlots.filter((s) => s.earned).length;
  const totalCount = mainSlots.length + hiddenSlots.length;

  // Newly earned badges reveal one at a time on this open, then count as seen.
  const unseen = new Set(getUnseenEarnedBadgeIds());
  let revealIdx = 0;
  const slotHtml = (slot) =>
    renderBadgeSlotHtml(slot, slot.earned && unseen.has(slot.id) ? revealIdx++ : -1);

  container.innerHTML = `
    <div class="dashboard-badge-board">
      <p class="dashboard-badge-board-desc">
        レベルクリアでメインバッジ、かくしチャレンジでシークレットバッジをゲット！（${earnedCount} / ${totalCount}）
      </p>
      <p class="dashboard-badge-section-title">メインバッジ</p>
      <div class="dashboard-badge-grid dashboard-badge-grid--main" role="list">
        ${mainSlots.map(slotHtml).join("")}
      </div>
      <p class="dashboard-badge-section-title">シークレットバッジ</p>
      <div class="dashboard-badge-grid dashboard-badge-grid--hidden" role="list">
        ${hiddenSlots.map(slotHtml).join("")}
      </div>
    </div>`;

  if (unseen.size) {
    saveSeenBadgeIds([...loadSeenBadgeIds(), ...getEarnedBadgeIds()]);
  }
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
  const startOverBtn = document.getElementById("dashboard-startover-btn");
  const buttons = document.querySelectorAll("[data-panel]");

  if (!panel || !panelBody) return;

  setupBadgeHintClicks();

  let activePanel = null;
  let callState = "idle";
  let pendingMissionSelect = null;

  // Earned badge ids from the previous shelf render — lets us animate only
  // freshly earned badges (null = first render, nothing animates on page load).
  let shelfEarnedIds = null;

  // Badges currently mid "award ceremony": their shelf slot stays empty until
  // the flying badge lands in it.
  const pendingAwardIds = new Set();
  const badgeAwardQueue = [];
  let badgeAwardPlaying = false;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function ensureBadgeAwardOverlay() {
    let overlay = document.getElementById("badge-award-overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "badge-award-overlay";
    overlay.className = "badge-award-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="badge-award-backdrop"></div>
      <div class="badge-award-stage">
        <div class="badge-award-rays" aria-hidden="true"></div>
        <img class="badge-award-img" alt="" decoding="async">
      </div>
      <div class="badge-award-label"></div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function popShelfSlot(slot) {
    const el = document.querySelector(`.trophy-slot[data-badge-id="${slot.id}"]`);
    if (!el) return;
    el.classList.add("just-earned");
    if (slot.secret) el.classList.add("just-earned--secret");
  }

  /** Center-screen reveal, then the badge flies into its shelf slot. */
  async function runBadgeAwardAnimation(slot) {
    const overlay = ensureBadgeAwardOverlay();
    const img = overlay.querySelector(".badge-award-img");
    const label = overlay.querySelector(".badge-award-label");
    img.src = slot.image || "images/completion-badge-bronze.png";
    label.textContent = slot.secret
      ? "✨ シークレットバッジゲット！ ✨"
      : "🏆 バッジゲット！ 🏆";

    overlay.hidden = false;
    overlay.classList.remove("show", "flying");
    void overlay.offsetWidth; // restart CSS animations
    overlay.classList.add("show");

    // Center celebration: spin-in pop, light rays, sparkles, label.
    await wait(1800);

    // Fly into the (still empty) shelf slot.
    const target =
      document.querySelector(`.trophy-slot[data-badge-id="${slot.id}"]`) ||
      document.getElementById("trophy-shelf-badges");
    let flight = null;
    if (target && typeof img.animate === "function") {
      const from = img.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      if (from.width > 0 && to.width > 0) {
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const scale = Math.max(to.width / from.width, 0.05);
        overlay.classList.add("flying");
        flight = img.animate(
          [
            { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(360deg)`,
              opacity: 0.85,
            },
          ],
          { duration: 750, easing: "cubic-bezier(0.45, -0.15, 0.25, 1)", fill: "forwards" }
        );
      }
    }
    if (flight) await flight.finished.catch(() => {});

    overlay.classList.remove("show", "flying");
    overlay.hidden = true;
    if (flight) flight.cancel();

    // Land: reveal the badge in its slot with the pop/glow animation.
    pendingAwardIds.delete(slot.id);
    renderTrophyShelf();
    popShelfSlot(slot);
    await wait(350);
  }

  function playNextBadgeAward() {
    if (badgeAwardPlaying || !badgeAwardQueue.length) return;
    badgeAwardPlaying = true;
    const slot = badgeAwardQueue.shift();
    runBadgeAwardAnimation(slot)
      .catch(() => {
        pendingAwardIds.delete(slot.id);
        renderTrophyShelf();
      })
      .finally(() => {
        badgeAwardPlaying = false;
        playNextBadgeAward();
      });
  }

  function queueBadgeAward(slot) {
    badgeAwardQueue.push(slot);
    playNextBadgeAward();
  }

  /** Always-visible trophy shelf: mini badge slots + star row. */
  function renderTrophyShelf() {
    const slotsEl = document.getElementById("trophy-badge-slots");
    const badgeCountEl = document.getElementById("trophy-badge-count");
    const starRowEl = document.getElementById("trophy-star-row");
    const starCountEl = document.getElementById("trophy-star-count");

    const mainSlots = getMainBadgeSlots();
    const hiddenSlots = getHiddenBadgeSlots();
    const allSlots = [...mainSlots, ...hiddenSlots];
    const earnedBadges = allSlots.filter((s) => s.earned).length;
    if (badgeCountEl) {
      badgeCountEl.textContent = `${earnedBadges}/${allSlots.length}`;
    }

    // Freshly earned badges get the full award ceremony (queued one at a
    // time); their slot renders empty until the flying badge lands.
    if (shelfEarnedIds !== null) {
      for (const slot of allSlots) {
        if (slot.earned && !shelfEarnedIds.has(slot.id) && !pendingAwardIds.has(slot.id)) {
          pendingAwardIds.add(slot.id);
          queueBadgeAward(slot);
        }
      }
    }

    if (slotsEl) {
      const slotHtml = (slot) => {
        const awaiting = pendingAwardIds.has(slot.id);
        if (!slot.earned || awaiting) {
          const showQ = slot.upcoming || awaiting;
          return `<span class="trophy-slot${showQ ? " upcoming" : ""}" data-badge-id="${slot.id}" title="${slot.label}">${showQ ? "?" : ""}</span>`;
        }
        return `<span class="trophy-slot earned" data-badge-id="${slot.id}" title="${slot.label}"><img src="${slot.image || "images/completion-badge-bronze.png"}" alt="" decoding="async"></span>`;
      };
      slotsEl.innerHTML =
        `<span class="trophy-shelf__group trophy-shelf__group--main">${mainSlots.map(slotHtml).join("")}</span>` +
        `<span class="trophy-shelf__group trophy-shelf__group--hidden">${hiddenSlots.map(slotHtml).join("")}</span>`;
    }
    shelfEarnedIds = new Set(allSlots.filter((s) => s.earned).map((s) => s.id));

    const notifEl = document.getElementById("trophy-badge-notif");
    if (notifEl) notifEl.hidden = getUnseenEarnedBadgeIds().length === 0;

    const earned = getCompletedQuestCount();
    const total = getTotalQuests();
    if (starCountEl) starCountEl.textContent = String(earned);
    if (starRowEl) {
      starRowEl.innerHTML = Array.from(
        { length: total },
        (_, i) => `<span class="trophy-star${i < earned ? " filled" : ""}">★</span>`
      ).join("");
    }
  }

  function updateStarBadge() {
    renderTrophyShelf();
  }

  function setPanelModeClass(name) {
    panel.classList.toggle("dashboard-panel--instructions", name === "instructions");
    panel.classList.toggle("dashboard-panel--missions", name === "missions");
    panel.classList.toggle("dashboard-panel--badges", name === "badges");
  }

  function closePanel() {
    panel.hidden = true;
    panel.classList.remove(
      "dashboard-panel--instructions",
      "dashboard-panel--missions",
      "dashboard-panel--badges"
    );
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
    try {
      // Seen-list is shared across levels — forget only this level's badges
      // so other levels' earned badges don't replay their reveal animation.
      const levelIds = getActiveLevelBadgeIds();
      saveSeenBadgeIds(loadSeenBadgeIds().filter((id) => !levelIds.has(id)));
    } catch {
      // ignore
    }
    postToVoiceTab({ type: "gc_progress_reset", questIndex: 0 });
    refreshProgressPanels();
    closePanel();
    window.dispatchEvent(new Event("learny-progress-changed"));
  }

  function requestStartOver() {
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
    if (panel.contains(e.target) || e.target.closest("[data-panel]")) {
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
  ensureDefaultMissionSelected();

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
