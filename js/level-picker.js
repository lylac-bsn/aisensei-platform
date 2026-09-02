/** Shared level selection UI for login and in-app level switching. */

export const LEVELS = [
  {
    id: "beginner",
    page: "page1.html",
    labelJa: "ビギナー",
    labelEn: "Beginner",
    desc: "英語をはじめたばかりの子ども向け",
    btnClass: "level-btn--beginner",
  },
  {
    id: "intermediate",
    page: "page2.html",
    labelJa: "ちゅうきゅう",
    labelEn: "Intermediate",
    desc: "基本的な単語やフレーズがわかる",
    btnClass: "level-btn--intermediate",
  },
  {
    id: "advanced",
    page: "page3.html",
    labelJa: "じょうきゅう",
    labelEn: "Advanced",
    desc: "もっと長い会話にチャレンジ",
    btnClass: "level-btn--advanced",
  },
];

const STORAGE_KEY = "gc_last_level";

export function rememberLevel(levelId) {
  try {
    localStorage.setItem(STORAGE_KEY, levelId);
  } catch {
    // ignore
  }
}

export function getRememberedLevel() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return LEVELS.find((l) => l.id === id) || null;
  } catch {
    return null;
  }
}

function levelButtonsHtml(currentPage = "") {
  return LEVELS.map((level) => {
    const isCurrent = currentPage && level.page === currentPage;
    return `<button type="button" class="level-btn ${level.btnClass}${isCurrent ? " is-current" : ""}" data-page="${level.page}" data-level-id="${level.id}"${isCurrent ? ' aria-current="true"' : ""}>
      <span class="level-btn__main">
        <span class="level-btn__label">${level.labelJa}</span>
        <span class="level-btn__en">${level.labelEn}</span>
      </span>
      <span class="level-btn__desc">${level.desc}</span>
      ${isCurrent ? '<span class="level-btn__badge">いまここ</span>' : ""}
    </button>`;
  }).join("");
}

function continueBannerHtml(remembered) {
  if (!remembered) return "";
  return `<div class="level-continue-banner" id="level-continue-banner">
    <p class="level-continue-banner__text">前回のレベル：<strong>${remembered.labelJa}</strong></p>
    <button type="button" class="level-continue-btn" id="level-continue-btn" data-page="${remembered.page}">つづきから始める</button>
  </div>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.currentPage] - e.g. "page1.html" when switching levels in-app
 * @param {boolean} [opts.showLogout]
 * @param {() => void} [opts.onLogout]
 * @param {boolean} [opts.closable] - click backdrop to dismiss (level switcher only)
 */
export function buildLevelPickerContent({
  currentPage = "",
  showLogout = false,
  showContinue = true,
} = {}) {
  const remembered = showContinue ? getRememberedLevel() : null;
  const skipContinue =
    remembered && currentPage && remembered.page === currentPage;

  return `<div class="level-selection-content" role="dialog" aria-labelledby="level-selection-title" aria-modal="true">
    <div class="level-selection-header">
      <h2 id="level-selection-title">${currentPage ? "レベルを切り替える" : "レベルを選んでね"}</h2>
      <p class="level-selection-subtitle">${currentPage ? "別のレベルに移動できます" : "自分に合ったレベルを選んで、ラーニー先生と宿題を始めよう"}</p>
    </div>
    ${skipContinue ? "" : continueBannerHtml(remembered)}
    <div class="level-buttons">${levelButtonsHtml(currentPage)}</div>
    ${
      showLogout
        ? `<div class="level-selection-footer">
            <button type="button" class="level-selection-logout" id="level-selection-logout">別のアカウントでログイン</button>
          </div>`
        : currentPage
          ? `<div class="level-selection-footer level-selection-footer--switch">
              <button type="button" class="level-selection-cancel" id="level-selection-cancel">キャンセル</button>
            </div>`
          : ""
    }
  </div>`;
}

export function mountLevelPicker(overlayEl, opts = {}) {
  const { currentPage = "", onNavigate, onClose, onLogout } = opts;
  overlayEl.innerHTML = buildLevelPickerContent({
    currentPage,
    showLogout: Boolean(onLogout),
    showContinue: !currentPage,
  });
  overlayEl.hidden = false;
  overlayEl.classList.add("is-open");

  const navigate = (page) => {
    const level = LEVELS.find((l) => l.page === page);
    if (level) rememberLevel(level.id);
    if (onNavigate) onNavigate(page);
    else window.location.href = page;
  };

  overlayEl.querySelector("#level-continue-btn")?.addEventListener("click", (e) => {
    navigate(e.currentTarget.getAttribute("data-page"));
  });

  overlayEl.querySelectorAll(".level-btn:not(.is-current)").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.getAttribute("data-page")));
  });

  overlayEl.querySelector("#level-selection-logout")?.addEventListener("click", () => {
    onLogout?.();
  });

  overlayEl.querySelector("#level-selection-cancel")?.addEventListener("click", () => {
    onClose?.();
  });

  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl && currentPage) onClose?.();
  });

  const firstBtn =
    overlayEl.querySelector(".level-btn:not(.is-current)") ||
    overlayEl.querySelector(".level-continue-btn");
  firstBtn?.focus();
}

export function openLevelSwitcher(currentPage) {
  let overlay = document.getElementById("level-switcher-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "level-switcher-overlay";
    overlay.className = "level-selection-overlay";
    document.body.appendChild(overlay);
  }

  mountLevelPicker(overlay, {
    currentPage,
    onNavigate: (page) => {
      overlay.hidden = true;
      overlay.classList.remove("is-open");
      if (page !== currentPage) window.location.href = page;
    },
    onClose: () => {
      overlay.hidden = true;
      overlay.classList.remove("is-open");
    },
  });
}
