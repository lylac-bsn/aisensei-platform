import {
  getActiveLevelId,
  getLesson,
  getSegments,
  loadLessonStateFor,
  resetLesson,
  isPart1Complete,
  loadEarnedLessonBadges,
  getBadgeCatalogForLesson,
  getStarCount,
  getTotalStarSlots,
  getSegmentChapterMeta,
  formatSegmentChapter,
} from "./lesson-engine.js";

const PANEL_LABELS = {
  instructions: "使い方",
  missions: "レッスン",
  words: "覚えたフレーズ",
  stars: "スター",
  badges: "バッジ",
};

let activeLessonId = "part1";

export function setActiveHomeworkLesson(lessonId) {
  activeLessonId = lessonId === "part2" ? "part2" : "part1";
  refreshDashboardChrome();
}

function levelId() {
  return getActiveLevelId();
}

function state() {
  return loadLessonStateFor(activeLessonId, levelId());
}

function refreshDashboardChrome() {
  const st = state();
  const total = getTotalStarSlots(activeLessonId);
  const stars = st.stars || 0;
  const countEl = document.getElementById("trophy-star-count");
  if (countEl) countEl.textContent = String(stars);
  const row = document.getElementById("trophy-star-row");
  if (row) {
    row.innerHTML = Array.from({ length: Math.max(total, 1) }, (_, i) => {
      const filled = i < stars ? " filled" : "";
      return `<span class="dashboard-star-icon${filled}">★</span>`;
    }).join("");
  }
  const allBadges = loadEarnedLessonBadges();
  const catalog = getBadgeCatalogForLesson(activeLessonId);
  const catalogIds = new Set(catalog.map((b) => b.id));
  const earned = allBadges.filter((id) => catalogIds.has(id));
  const badgeCount = document.getElementById("trophy-badge-count");
  if (badgeCount) badgeCount.textContent = `${earned.length}/${catalog.length}`;
  const slots = document.getElementById("trophy-badge-slots");
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
  container.innerHTML = `<p class="dashboard-panel-empty" style="margin-bottom:12px">${lesson.title}<br><span class="mission-select-desc">${lesson.weekNote}</span></p>
    <ul class="mission-select-list">${segments
      .map((seg, i) => {
        const done = st.completedSegmentIds.includes(seg.id);
        const current = i === st.segmentIndex && !st.complete;
        const badge = done
          ? '<span class="mission-select-badge mission-select-badge--done">できた</span>'
          : current
            ? '<span class="mission-select-badge">いま</span>'
            : "";
        const meta = getSegmentChapterMeta(seg);
        const chapter = formatSegmentChapter(seg);
        return `<li class="mission-select-item${current ? " selected" : ""}">
          <span class="mission-select-num" title="${chapter}">${meta.num === "" ? meta.label.slice(0, 1) : meta.num}</span>
          <div class="mission-select-body">
            <strong class="mission-select-title">${chapter} · ${seg.title}</strong>
            <span class="mission-select-desc">${seg.titleEn || ""}</span>
            ${badge}
          </div>
        </li>`;
      })
      .join("")}</ul>`;
}

function renderWords(container) {
  const phrases = state().phrasesSpoken || [];
  if (!phrases.length) {
    container.innerHTML =
      '<p class="dashboard-panel-empty">まだフレーズがありません。ラーニー先生と英語で話してみよう！</p>';
    return;
  }
  container.innerHTML = `<ul class="dashboard-phrase-list">${phrases
    .map(
      (p) =>
        `<li class="dashboard-phrase-item"><span class="dashboard-phrase-en">${p}</span></li>`
    )
    .join("")}</ul>`;
}

function renderStars(container) {
  const earned = getStarCount(activeLessonId);
  const total = getTotalStarSlots(activeLessonId);
  container.innerHTML = `
    <div class="dashboard-stars-summary">
      <div class="dashboard-stars-big">${earned} / ${total}</div>
      <p class="dashboard-stars-desc">章をクリアするとスターがたまるよ。</p>
    </div>`;
}

function renderBadges(container) {
  const catalog = getBadgeCatalogForLesson(activeLessonId);
  const earned = new Set(
    loadEarnedLessonBadges().filter((id) => catalog.some((b) => b.id === id))
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

  // Always size the chat to the screen, even if the sidebar panel markup is missing.
  bindDashboardChatResize();

  if (!panel || !panelBody) return;

  let activePanel = null;

  function openPanel(name) {
    activePanel = name;
    panel.hidden = false;
    if (panelTitle) panelTitle.textContent = PANEL_LABELS[name] || name;
    if (name === "missions") renderChapters(panelBody);
    else if (name === "words") renderWords(panelBody);
    else if (name === "stars") renderStars(panelBody);
    else if (name === "badges") renderBadges(panelBody);
    else if (name === "instructions") renderInstructions(panelBody);
    buttons.forEach((b) =>
      b.setAttribute("aria-expanded", b.dataset.panel === name ? "true" : "false")
    );
  }

  function closePanel() {
    activePanel = null;
    panel.hidden = true;
    buttons.forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.panel;
      if (activePanel === name) closePanel();
      else openPanel(name);
    });
  });
  panelClose?.addEventListener("click", closePanel);

  startOverBtn?.addEventListener("click", () => {
    if (!confirm("この Part の宿題を最初からやり直しますか？")) return;
    resetLesson(activeLessonId, levelId());
    refreshDashboardChrome();
    window.dispatchEvent(new CustomEvent("learny-progress-changed"));
    try {
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
  });

  refreshDashboardChrome();
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
