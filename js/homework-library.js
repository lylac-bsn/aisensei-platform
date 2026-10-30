import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { generateHomework } from "./homework-engine.js?v=20261030-hw-lib129";

const CACHE = "20261030-hw-lib129";
const RESUME_KEY = "gc-hw-resume";
const HUB_ACTION_KEY = "gc-hub-action";

function readHwResume() {
  try {
    return JSON.parse(sessionStorage.getItem(RESUME_KEY) || "null");
  } catch {
    return null;
  }
}

function writeHwResume(patch) {
  try {
    const prev = readHwResume() || {};
    const next = {
      ...prev,
      ...patch,
      action: "assign-homework",
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(next));
    sessionStorage.setItem(HUB_ACTION_KEY, "assign-homework");
  } catch {
    /* ignore quota / private mode */
  }
}

const LEVEL_LABEL = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const QUESTION_TYPE_LABEL = {
  multipleChoice: "4択",
  matching: "線つなぎ",
  spelling: "スペリング",
  sentence: "文づくり",
};

const ICONS = {
  books: `<svg class="hw-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" fill="currentColor" opacity=".22"/><path d="M13 3h4.5A2.5 2.5 0 0 1 20 5.5v16a2.5 2.5 0 0 0-2.5-2.5H13V3Z" fill="currentColor" opacity=".38"/><path d="M6.5 3H11v16H6.5A2.5 2.5 0 0 1 4 16.5v-11A2.5 2.5 0 0 1 6.5 3Zm6.5 0h4.5A2.5 2.5 0 0 1 20 5.5v11a2.5 2.5 0 0 1-2.5 2.5H13V3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 5.5H6.8M11 9H6.8M20 5.5h-4.2M20 9h-4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  chart: `<svg class="hw-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="12" width="3.5" height="7" rx="1.2" fill="currentColor" opacity=".35"/><rect x="10.25" y="8" width="3.5" height="11" rx="1.2" fill="currentColor" opacity=".55"/><rect x="16.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/><path d="M3.5 20.5h17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  book: `<svg class="hw-ico hw-ico-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.8A2.8 2.8 0 0 1 7.8 3H19v15.5H7.8A2.8 2.8 0 0 0 5 21.3V5.8Z" fill="currentColor" opacity=".18"/><path d="M7.8 3H19v15.5H7.8A2.8 2.8 0 0 1 5 15.7V5.8A2.8 2.8 0 0 1 7.8 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 7.2h7.2M9 10.4h5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  layers: `<svg class="hw-ico hw-ico-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.2 3.8 8.5 12 12.8l8.2-4.3L12 4.2Z" fill="currentColor" opacity=".2"/><path d="M12 4.2 3.8 8.5 12 12.8l8.2-4.3L12 4.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3.8 12.2 12 16.5l8.2-4.3M3.8 15.8 12 20.1l8.2-4.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  person: `<svg class="hw-ico hw-ico-sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.2" fill="currentColor" opacity=".25"/><circle cx="12" cy="8.2" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 18.8c1.4-3 3.7-4.5 6.5-4.5s5.1 1.5 6.5 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};

const TYPE_FILTERS = [
  { id: "all", label: "すべての形式" },
  { id: "4択", label: "4択" },
  { id: "線つなぎ", label: "線つなぎ" },
  { id: "スペリング", label: "スペリング" },
  { id: "文づくり", label: "文づくり" },
];

const OFFICIAL_SEEDS = [
  {
    id: "official-animals",
    title: "どうぶつ単語セット",
    description: "身近などうぶつの英単語を楽しく学びましょう！",
    level: "beginner",
    pairs: [
      ["さかな", "Fish"], ["ねこ", "Cat"], ["いぬ", "Dog"],
      ["とり", "Bird"], ["うさぎ", "Rabbit"], ["くま", "Bear"],
    ],
  },
  {
    id: "official-food",
    title: "たべもの・のみもの",
    description: "食事の場面で使う基本単語と短い文をつくります。",
    level: "beginner",
    pairs: [
      ["りんご", "Apple"], ["みず", "Water"], ["パン", "Bread"],
      ["ミルク", "Milk"], ["ごはん", "Rice"], ["たまご", "Egg"],
    ],
  },
  {
    id: "official-school",
    title: "がっこうのことば",
    description: "教室でよく使う単語を確認して、短い文もつくります。",
    level: "intermediate",
    pairs: [
      ["ほん", "Book"], ["えんぴつ", "Pencil"], ["かばん", "Bag"],
      ["いす", "Chair"], ["つくえ", "Desk"], ["せんせい", "Teacher"],
    ],
  },
];

const THEME_ART = {
  animals: {
    label: "どうぶつ",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="42" r="22" fill="#FFF9F0"/><circle cx="26" cy="24" r="9" fill="#FFF9F0"/><circle cx="54" cy="24" r="9" fill="#FFF9F0"/><circle cx="33" cy="40" r="3.2" fill="#5B463C"/><circle cx="47" cy="40" r="3.2" fill="#5B463C"/><ellipse cx="40" cy="49" rx="5" ry="3.5" fill="#F3B5A0"/><path d="M30 54c4 5 16 5 20 0" fill="none" stroke="#5B463C" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  },
  food: {
    label: "たべもの",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><ellipse cx="40" cy="48" rx="18" ry="16" fill="#FFF5E6"/><path d="M28 38c0-10 6-18 12-18s12 8 12 18" fill="#F6C4A6"/><circle cx="40" cy="20" r="4" fill="#8FCF9A"/><path d="M40 24v8" stroke="#6BA978" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  },
  school: {
    label: "がっこう",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="24" y="28" width="32" height="28" rx="4" fill="#FFF9F0"/><path d="M20 34l20-12 20 12" fill="none" stroke="#FFF9F0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="36" y="40" width="8" height="16" rx="1.5" fill="#7EB6E8"/><circle cx="40" cy="24" r="3" fill="#F6C4A6"/></svg>`,
  },
  transport: {
    label: "のりもの",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="16" y="34" width="48" height="20" rx="8" fill="#FFF9F0"/><path d="M28 34v-6a8 8 0 0 1 8-8h8a8 8 0 0 1 8 8v6" fill="#D7ECFF"/><circle cx="28" cy="56" r="5" fill="#5B463C"/><circle cx="52" cy="56" r="5" fill="#5B463C"/><rect x="34" y="38" width="8" height="6" rx="1.5" fill="#7EB6E8"/></svg>`,
  },
  colors: {
    label: "いろ・かたち",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="32" cy="34" r="12" fill="#FFD6E5"/><circle cx="48" cy="34" r="12" fill="#D7ECFF"/><circle cx="40" cy="48" r="12" fill="#E5F6ED"/></svg>`,
  },
  talk: {
    label: "かいわ",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="18" y="22" width="36" height="26" rx="12" fill="#FFF9F0"/><path d="M28 48l-6 10 14-8" fill="#FFF9F0"/><circle cx="30" cy="35" r="2.5" fill="#8A7468"/><circle cx="40" cy="35" r="2.5" fill="#8A7468"/><path d="M48 28h10a10 10 0 0 1 10 10v2a10 10 0 0 1-10 10h-2" fill="#EEE8FF"/></svg>`,
  },
  default: {
    label: "宿題",
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="22" y="20" width="36" height="42" rx="8" fill="#FFF9F0"/><path d="M30 32h20M30 40h20M30 48h12" stroke="#C9B8AE" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="54" r="10" fill="#FFE4D6"/><path d="M52 49v10M47 54h10" stroke="#F27B65" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  },
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function themeFor(item) {
  const hay = `${item.id} ${item.title} ${item.description}`.toLowerCase();
  if (/どうぶつ|動物|animal|ねこ|いぬ|くま|うさぎ/.test(hay)) return "animals";
  if (/たべもの|食べ|のみもの|food|りんご|ごはん|パン/.test(hay)) return "food";
  if (/がっこう|学校|school|えんぴつ|教室|つくえ/.test(hay)) return "school";
  if (/のりもの|車|バス|電車|transport|train/.test(hay)) return "transport";
  if (/いろ|色|かたち|color|形/.test(hay)) return "colors";
  if (/かいわ|会話|あいさつ|daily|会話/.test(hay)) return "talk";
  return "default";
}

function friendlyLoadError(error) {
  const msg = String(error?.message || "");
  console.error("[homework-library] list failed", error);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return "宿題の読み込みに失敗しました。もう一度お試しください。";
  }
  return msg || "宿題の読み込みに失敗しました。もう一度お試しください。";
}

function officialCards() {
  return OFFICIAL_SEEDS.map((seed) => {
    const pack = generateHomework(seed.pairs.map(([ja, en]) => ({ ja, en })), {
      seed: seed.id.length * 97,
      level: seed.level,
      count: "",
      hints: true,
      sentenceDirection: "ja-to-en",
      types: { multipleChoice: true, matching: true, spelling: true, sentence: true },
    });
    const questions = (pack.questions || []).map((question) => ({ ...question, approved: true, review: false }));
    return {
      id: seed.id,
      title: seed.title,
      description: seed.description,
      level: seed.level,
      status: "draft",
      published: true,
      libraryReady: true,
      official: true,
      teacherId: "learny",
      creatorName: "Learny",
      questionCount: questions.length,
      types: ["4択", "線つなぎ", "スペリング", "文づくり"],
      dueOn: "",
      updatedAt: 0,
      _seed: { ...seed, questions, vocab: seed.pairs.map(([ja, en]) => ({ ja, en })) },
    };
  });
}

function questionPrompt(question) {
  return String(
    question?.promptJa
    || question?.promptEn
    || question?.prompt
    || question?.question
    || question?.text
    || question?.ja
    || "問題"
  ).trim();
}

function questionSummaryRows(questions) {
  return (questions || []).map((question, index) => {
    const type = QUESTION_TYPE_LABEL[question.type] || "問題";
    const prompt = questionPrompt(question).slice(0, 72);
    let detail = "";
    if (question.type === "matching" && Array.isArray(question.pairs) && question.pairs.length) {
      detail = `${question.pairs.length}組`;
    } else if (question.type === "multipleChoice" && question.answer) {
      detail = `正解: ${question.answer}`;
    } else if (question.type === "spelling" && question.answer) {
      detail = question.answer;
    } else if (question.type === "sentence" && (question.answer || question.accept?.[0])) {
      detail = question.answer || question.accept[0];
    }
    return {
      index: index + 1,
      type,
      prompt,
      detail: String(detail || "").slice(0, 48),
    };
  });
}

function sampleLines(item) {
  if (item._seed?.questions?.length) {
    return item._seed.questions.slice(0, 3).map((q, index) => {
      const prompt = questionPrompt(q);
      return `${index + 1}. ${prompt.slice(0, 60)}`;
    });
  }
  if (item._seed?.vocab?.length) {
    return item._seed.vocab.slice(0, 4).map((row) => `${row.ja} → ${row.en}`);
  }
  return [];
}

export async function mountHomeworkHub(root, options) {
  // Flush/tear down an open studio so leave-save can finish and listeners detach.
  try { root._confirmLeave?.(); } catch { /* ignore */ }
  root._stopHomeworkStudio?.();

  const resume = options.skipResume ? null : readHwResume();
  const resumeView = resume?.view;
  const startView = options.initialView === "library"
    || options.initialView === "assign"
    || options.initialView === "landing"
    ? options.initialView
    : (resumeView === "library" || resumeView === "assign" || resumeView === "studio"
      ? "library"
      : "landing");
  const startTab = ["all", "official", "mine", "sent"].includes(options.initialTab)
    ? options.initialTab
    : "all";
  const state = {
    view: startView,
    tab: startTab,
    query: "",
    level: "all",
    type: "all",
    sort: "recent",
    items: [],
    selected: null,
    previewId: null,
    loadError: "",
    classes: [],
    classStudents: {},
    sentItems: [],
    sentClasses: [],
    sentClassFilter: "all",
    sentDetail: null,
    sentLoading: false,
    sentError: "",
  };

  const hub = document.createElement("div");
  hub.className = "hw-hub hw-studio hw-switch-shell";
  root.replaceChildren(hub);

  const rememberView = (view, extra = {}) => {
    writeHwResume({
      view,
      pack: view === "studio" ? (extra.pack ?? readHwResume()?.pack ?? null) : null,
      selectedId: view === "assign" ? (extra.selectedId || state.selected?.id || null) : null,
      ...extra,
    });
  };

  const paint = async () => {
    if (state.view === "landing") {
      rememberView("landing");
      hub.innerHTML = landingHtml();
      bindLanding();
      return;
    }
    if (state.view === "assign" && state.selected) {
      rememberView("assign", { selectedId: state.selected.id });
      hub.innerHTML = assignHtml(state.selected);
      await bindAssign(state.selected);
      return;
    }
    if (state.view === "sent-detail" && state.sentDetail?.assignment?.id) {
      rememberView("library");
      hub.innerHTML = sentDetailHtml(state.sentDetail);
      bindSentDetail();
      return;
    }
    rememberView("library");
    hub.innerHTML = libraryHtml();
    bindLibrary();
    await Promise.all([refreshLibrary(), refreshSent({ quiet: true })]);
  };

  function landingHtml() {
    return `
      <header class="hw-page-head">
        <div>
          <h2>宿題とレポート</h2>
          <p class="hw-lead">宿題ライブラリで配信するか、レポートで学習の様子を確認しましょう。</p>
        </div>
      </header>
      <div class="hw-hub-cards">
        <button type="button" class="hw-hub-card is-homework" data-hub-go="library">
          <span class="hw-hub-card-icon" aria-hidden="true">${ICONS.books}</span>
          <strong>宿題</strong>
          <small>宿題の作成・管理・配信</small>
        </button>
        <button type="button" class="hw-hub-card is-report" data-hub-go="report">
          <span class="hw-hub-card-icon" aria-hidden="true">${ICONS.chart}</span>
          <strong>レポート</strong>
          <small>生徒の学習状況を確認</small>
        </button>
      </div>`;
  }

  function tabCounts() {
    const all = state.items.filter((item) => item.official || item.teacherId === options.uid || item.published);
    const official = state.items.filter((item) => item.official);
    const mine = state.items.filter((item) => !item.official && item.teacherId === options.uid);
    return {
      all: all.length,
      official: official.length,
      mine: mine.length,
      sent: state.sentItems.length,
    };
  }

  function libraryHtml() {
    const counts = tabCounts();
    return `
      <div class="hw-lib">
        <nav class="hw-lib-crumb" aria-label="パンくず">
          <button type="button" class="hw-lib-crumb-link" data-lib="landing">宿題・レポート</button>
          <span aria-hidden="true">/</span>
          <span>宿題</span>
        </nav>
        <header class="hw-lib-hero">
          <div class="hw-lib-hero-copy">
            <h2><span class="hw-lib-hero-icon" aria-hidden="true">${ICONS.books}</span>宿題ライブラリ</h2>
            <p>お気に入りの宿題を見つけて、生徒に届けましょう！</p>
          </div>
          <button type="button" class="hw-lib-create-btn" data-lib="create">
            <span class="hw-lib-create-plus" aria-hidden="true">＋</span>
            新しい宿題を作成
          </button>
        </header>
        <div class="hw-lib-toolbar">
          <label class="hw-lib-search">
            <span class="hw-lib-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </span>
            <input id="hw-lib-q" type="search" placeholder="宿題のタイトルやキーワードで検索..." aria-label="宿題を検索" autocomplete="off">
            <button type="button" class="hw-lib-search-clear" id="hw-lib-clear" hidden aria-label="検索をクリア">×</button>
          </label>
          <div class="hw-lib-filters">
            <label class="hw-lib-filter">
              <span class="visually-hidden">レベル</span>
              <select id="hw-lib-level" aria-label="難易度で絞り込み">
                <option value="all">すべてのレベル</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label class="hw-lib-filter">
              <span class="visually-hidden">問題形式</span>
              <select id="hw-lib-type" aria-label="問題形式で絞り込み">
                ${TYPE_FILTERS.map((row) => `<option value="${row.id}">${escapeHtml(row.label)}</option>`).join("")}
              </select>
            </label>
            <label class="hw-lib-filter">
              <span class="visually-hidden">並び替え</span>
              <select id="hw-lib-sort" aria-label="並び替え">
                <option value="recent">新しい順</option>
                <option value="alpha">名前順</option>
              </select>
            </label>
          </div>
        </div>
        <div class="hw-lib-tabs" role="tablist" aria-label="宿題ライブラリ">
          <button type="button" class="hw-lib-tab${state.tab === "all" ? " is-current" : ""}" data-tab="all" role="tab">すべて <em>${counts.all}</em></button>
          <button type="button" class="hw-lib-tab${state.tab === "official" ? " is-current" : ""}" data-tab="official" role="tab">公式テンプレート <em>${counts.official}</em></button>
          <button type="button" class="hw-lib-tab${state.tab === "mine" ? " is-current" : ""}" data-tab="mine" role="tab">マイライブラリ <em>${counts.mine}</em></button>
          <button type="button" class="hw-lib-tab${state.tab === "sent" ? " is-current" : ""}" data-tab="sent" role="tab">送信済み <em>${counts.sent}</em></button>
        </div>
        <div class="hw-sent-toolbar" id="hw-sent-toolbar" ${state.tab === "sent" ? "" : "hidden"}>
          <label class="hw-lib-filter">
            <span class="visually-hidden">クラス</span>
            <select id="hw-sent-class" aria-label="クラスで絞り込み">
              <option value="all">すべてのクラス</option>
              ${state.sentClasses.map((row) => `
                <option value="${escapeHtml(row.id)}"${state.sentClassFilter === row.id ? " selected" : ""}>${escapeHtml(row.title)}</option>
              `).join("")}
            </select>
          </label>
          <p class="hw-sent-hint">クラスごとの送信済み宿題と、生徒の正誤・進捗を確認できます。</p>
        </div>
        <div id="hw-lib-banner" class="hw-lib-banner" hidden></div>
        <div id="hw-lib-grid" class="hw-lib-grid${state.tab === "sent" ? " is-sent" : ""}" aria-live="polite"></div>
        <p id="hw-lib-status" class="hw-lib-status" hidden></p>
        <div id="hw-lib-preview" class="hw-lib-preview" hidden></div>
      </div>`;
  }

  function assignHtml(item) {
    return `
      <div class="hw-lib hw-lib-assign">
        <nav class="hw-lib-crumb" aria-label="パンくず">
          <button type="button" class="hw-lib-crumb-link" data-lib="library">宿題ライブラリ</button>
          <span aria-hidden="true">/</span>
          <span>配信</span>
        </nav>
        <header class="hw-lib-hero hw-lib-hero-compact">
          <div class="hw-lib-hero-copy">
            <h2>宿題を配信</h2>
            <p>「${escapeHtml(item.title)}」をクラスに出します。音声の作り直しは不要です。</p>
          </div>
        </header>
        <section class="hw-flow-card hw-assign-card">
          <div class="hw-assign-grid">
            <div class="hw-assign-pane">
              <div class="hw-assign-pane-head">
                <h4>1. クラスを選ぶ</h4>
                <p>複数選ぶと、それぞれの生徒に出ます。</p>
              </div>
              <div id="hw-lib-classes" class="hw-classes"></div>
            </div>
            <div class="hw-assign-pane">
              <div class="hw-assign-pane-head">
                <h4>2. 提出期日</h4>
                <p>この日までに終わらせます。</p>
              </div>
              <label class="hw-field hw-assign-due">
                <span class="hw-assign-due-label">期日</span>
                <input id="hw-lib-due" type="date">
              </label>
              <div class="hw-assign-pane-head hw-assign-students-head">
                <h4>選んだクラスの生徒</h4>
                <p id="hw-lib-students-summary">クラスを選ぶと表示されます</p>
              </div>
              <div id="hw-lib-students" class="hw-assign-students">
                <p class="hw-assign-students-empty">クラスにチェックを入れると、予約している生徒が出ます。</p>
              </div>
            </div>
          </div>
          <div class="hw-lib-summary" id="hw-lib-assign-summary"></div>
          <div class="hw-actions hw-actions-foot">
            <button type="button" class="hw-quiet" data-lib="library">キャンセル</button>
            <button type="button" class="hw-lib-create-btn" id="hw-lib-send">宿題を配信する</button>
          </div>
          <p id="hw-lib-assign-status" class="hw-lib-status" hidden></p>
        </section>
      </div>`;
  }

  function bindLanding() {
    hub.querySelector('[data-hub-go="library"]').onclick = () => {
      state.view = "library";
      paint();
    };
    hub.querySelector('[data-hub-go="report"]').onclick = () => {
      options.openReport?.();
    };
  }

  function bindLibrary() {
    hub.querySelectorAll('[data-lib="landing"]').forEach((btn) => {
      btn.onclick = () => {
        state.view = "landing";
        paint();
      };
    });
    hub.querySelector('[data-lib="create"]').onclick = () => openCreate();
    hub.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.onclick = async () => {
        state.tab = btn.dataset.tab || "all";
        updateTabs();
        syncSentToolbar();
        if (state.tab === "sent") await refreshSent();
        else paintLibraryGrid();
      };
    });
    const sentClass = hub.querySelector("#hw-sent-class");
    if (sentClass) {
      sentClass.value = state.sentClassFilter;
      sentClass.onchange = () => {
        state.sentClassFilter = sentClass.value || "all";
        paintLibraryGrid();
      };
    }
    const search = hub.querySelector("#hw-lib-q");
    const clear = hub.querySelector("#hw-lib-clear");
    search.value = state.query;
    clear.hidden = !state.query;
    search.oninput = () => {
      state.query = search.value.trim();
      clear.hidden = !search.value;
      paintLibraryGrid();
    };
    clear.onclick = () => {
      search.value = "";
      state.query = "";
      clear.hidden = true;
      paintLibraryGrid();
      search.focus();
    };
    const level = hub.querySelector("#hw-lib-level");
    const type = hub.querySelector("#hw-lib-type");
    const sort = hub.querySelector("#hw-lib-sort");
    level.value = state.level;
    type.value = state.type;
    sort.value = state.sort;
    level.onchange = () => { state.level = level.value; paintLibraryGrid(); };
    type.onchange = () => { state.type = type.value; paintLibraryGrid(); };
    sort.onchange = () => { state.sort = sort.value; paintLibraryGrid(); };
  }

  function updateTabs() {
    const counts = tabCounts();
    hub.querySelectorAll(".hw-lib-tab").forEach((tab) => {
      const id = tab.dataset.tab;
      tab.classList.toggle("is-current", id === state.tab);
      const em = tab.querySelector("em");
      if (em && counts[id] != null) em.textContent = String(counts[id]);
    });
  }

  function skeletonHtml() {
    return Array.from({ length: 6 }, () => `
      <article class="hw-lib-card is-skeleton" aria-hidden="true">
        <div class="hw-lib-card-art"></div>
        <div class="hw-lib-card-body">
          <div class="hw-skel-line" style="width:40%"></div>
          <div class="hw-skel-line" style="width:78%"></div>
          <div class="hw-skel-line" style="width:92%"></div>
          <div class="hw-skel-line" style="width:55%"></div>
          <div class="hw-skel-btn"></div>
        </div>
      </article>`).join("");
  }

  function showBanner(message, { retry = false } = {}) {
    const banner = hub.querySelector("#hw-lib-banner");
    if (!banner) return;
    if (!message) {
      banner.hidden = true;
      banner.innerHTML = "";
      return;
    }
    banner.hidden = false;
    banner.innerHTML = `
      <div class="hw-lib-banner-inner">
        <p>${escapeHtml(message)}</p>
        ${retry ? `<button type="button" class="hw-lib-banner-retry" id="hw-lib-retry">再読み込み</button>` : ""}
      </div>`;
    banner.querySelector("#hw-lib-retry")?.addEventListener("click", () => {
      if (state.tab === "sent") refreshSent();
      else refreshLibrary();
    });
  }

  async function refreshLibrary() {
    const grid = hub.querySelector("#hw-lib-grid");
    if (grid && state.tab !== "sent") grid.innerHTML = skeletonHtml();
    showBanner("");
    state.loadError = "";
    try {
      const remote = await options.callFunction("listHomeworkLibrary", {});
      const mineAndShared = Array.isArray(remote.items) ? remote.items : [];
      state.items = [...officialCards(), ...mineAndShared];
      updateTabs();
      if (state.tab !== "sent") paintLibraryGrid();
    } catch (error) {
      state.loadError = friendlyLoadError(error);
      state.items = officialCards();
      updateTabs();
      if (state.tab !== "sent") {
        paintLibraryGrid();
        showBanner(state.loadError, { retry: true });
      }
    }
  }

  function syncSentToolbar() {
    const toolbar = hub.querySelector("#hw-sent-toolbar");
    const grid = hub.querySelector("#hw-lib-grid");
    if (toolbar) toolbar.hidden = state.tab !== "sent";
    if (grid) grid.classList.toggle("is-sent", state.tab === "sent");
    const select = hub.querySelector("#hw-sent-class");
    if (select) {
      const current = state.sentClassFilter;
      select.innerHTML = `
        <option value="all">すべてのクラス</option>
        ${state.sentClasses.map((row) => `
          <option value="${escapeHtml(row.id)}">${escapeHtml(row.title)}</option>
        `).join("")}`;
      select.value = state.sentClasses.some((row) => row.id === current) ? current : "all";
      state.sentClassFilter = select.value;
    }
  }

  async function refreshSent({ quiet = false } = {}) {
    if (!quiet && state.tab === "sent") {
      const grid = hub.querySelector("#hw-lib-grid");
      if (grid) grid.innerHTML = skeletonHtml();
    }
    state.sentLoading = true;
    state.sentError = "";
    try {
      const remote = await options.callFunction("listSentHomework", {});
      state.sentItems = Array.isArray(remote.items) ? remote.items : [];
      state.sentClasses = Array.isArray(remote.classes) ? remote.classes : [];
      updateTabs();
      syncSentToolbar();
      if (state.tab === "sent") paintLibraryGrid();
    } catch (error) {
      state.sentError = friendlyLoadError(error);
      if (!quiet && state.tab === "sent") {
        showBanner(state.sentError, { retry: true });
        paintLibraryGrid();
      }
    } finally {
      state.sentLoading = false;
    }
  }

  function filteredItems() {
    const q = state.query.toLowerCase();
    let rows = state.items.filter((item) => {
      if (state.tab === "official" && !item.official) return false;
      if (state.tab === "mine" && (item.official || item.teacherId !== options.uid)) return false;
      if (state.tab === "all" && !item.official && item.teacherId !== options.uid && !item.published) return false;
      if (state.level !== "all" && item.level !== state.level) return false;
      if (state.type !== "all" && !(item.types || []).includes(state.type)) return false;
      if (!q) return true;
      const hay = `${item.title} ${item.description} ${item.creatorName} ${(item.types || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (state.sort === "alpha") {
      rows = [...rows].sort((a, b) => String(a.title).localeCompare(String(b.title), "ja"));
    } else {
      rows = [...rows].sort((a, b) => {
        if (a.official && !b.official) return -1;
        if (!a.official && b.official) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    }
    return rows;
  }

  function filteredSentItems() {
    const q = state.query.toLowerCase();
    let rows = state.sentItems.filter((item) => {
      if (state.sentClassFilter !== "all" && !(item.classIds || []).includes(state.sentClassFilter)) return false;
      if (state.level !== "all" && item.level !== state.level) return false;
      if (!q) return true;
      const hay = `${item.title} ${(item.classNames || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (state.sort === "alpha") {
      rows = [...rows].sort((a, b) => String(a.title).localeCompare(String(b.title), "ja"));
    } else {
      rows = [...rows].sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
    }
    return rows;
  }

  function emptyHtml() {
    if (state.tab === "sent") {
      const filtering = Boolean(state.query || state.sentClassFilter !== "all" || state.level !== "all");
      return `
        <div class="hw-lib-empty-state">
          <div class="hw-lib-empty-art" aria-hidden="true">${THEME_ART.default.svg}</div>
          <h3>${filtering ? "条件に合う送信済み宿題がありません" : "まだ送信した宿題がありません"}</h3>
          <p>${filtering ? "クラスや検索条件を変えてみてください。" : "ライブラリから宿題を配信すると、ここに結果が集まります。"}</p>
        </div>`;
    }
    const searching = Boolean(state.query || state.level !== "all" || state.type !== "all");
    if (searching) {
      return `
        <div class="hw-lib-empty-state">
          <div class="hw-lib-empty-art" aria-hidden="true">${THEME_ART.default.svg}</div>
          <h3>該当する宿題が見つかりませんでした</h3>
          <p>キーワードやフィルターを変えてみてください。</p>
          <button type="button" class="hw-quiet" id="hw-lib-reset-filters">条件をクリア</button>
        </div>`;
    }
    if (state.tab === "mine") {
      return `
        <div class="hw-lib-empty-state">
          <div class="hw-lib-empty-art" aria-hidden="true">${THEME_ART.default.svg}</div>
          <h3>まだ宿題がありません</h3>
          <p>新しい宿題をつくると、ここに保存されます。</p>
          <button type="button" class="hw-lib-create-btn" data-lib="create-empty">＋ 新しい宿題を作成</button>
        </div>`;
    }
    return `
      <div class="hw-lib-empty-state">
        <div class="hw-lib-empty-art" aria-hidden="true">${THEME_ART.default.svg}</div>
        <h3>まだ宿題がありません</h3>
        <p>公式テンプレートか、新しくつくった宿題がここに並びます。</p>
      </div>`;
  }

  function formatSentDate(ms) {
    if (!ms) return "";
    try {
      return new Date(ms).toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  function formatDueShort(dueOn) {
    if (!dueOn) return "期日なし";
    try {
      return `${new Date(`${dueOn}T12:00:00+09:00`).toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "short",
        day: "numeric",
      })}まで`;
    } catch {
      return dueOn;
    }
  }

  function sentCardHtml(item) {
    const classes = (item.classNames || []).join("・") || "クラス未設定";
    const sentOn = formatSentDate(item.createdAt || item.updatedAt);
    return `
      <article class="hw-sent-card" data-sent-open="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}の進捗を見る">
        <div class="hw-sent-card-top">
          <span class="hw-lib-badge is-level-${escapeHtml(item.level || "beginner")}">${escapeHtml(LEVEL_LABEL[item.level] || item.level || "Beginner")}</span>
          <small>${escapeHtml(sentOn ? `${sentOn} 配信` : "配信済み")}</small>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="hw-sent-card-classes">${escapeHtml(classes)}</p>
        <div class="hw-sent-card-stats">
          <span>${ICONS.person}<em>${item.assigneeCount || 0}人</em></span>
          <span>${ICONS.book}<em>${item.questionCount || 0}問</em></span>
          <span><em>${escapeHtml(formatDueShort(item.dueOn))}</em></span>
        </div>
        <div class="hw-sent-card-actions">
          <button type="button" class="hw-lib-use" data-sent-open="${escapeHtml(item.id)}">進捗・分析を見る →</button>
          <button type="button" class="hw-sent-delete" data-sent-del="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)}を削除">削除</button>
        </div>
      </article>`;
  }

  function paintLibraryGrid() {
    const grid = hub.querySelector("#hw-lib-grid");
    if (!grid) return;
    closeMenus();
    syncSentToolbar();
    if (state.tab === "sent") {
      const items = filteredSentItems();
      if (!items.length) {
        grid.innerHTML = emptyHtml();
        return;
      }
      grid.innerHTML = items.map((item) => sentCardHtml(item)).join("");
      grid.querySelectorAll("[data-sent-open]").forEach((node) => {
        const open = () => openSentDetail(node.dataset.sentOpen);
        if (node.tagName === "BUTTON") node.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          open();
        };
        else {
          node.onclick = open;
          node.onkeydown = (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              open();
            }
          };
        }
      });
      grid.querySelectorAll("[data-sent-del]").forEach((btn) => {
        btn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteSentItem(btn.dataset.sentDel);
        };
      });
      return;
    }
    const items = filteredItems();
    if (!items.length) {
      grid.innerHTML = emptyHtml();
      grid.querySelector("#hw-lib-reset-filters")?.addEventListener("click", () => {
        state.query = "";
        state.level = "all";
        state.type = "all";
        const search = hub.querySelector("#hw-lib-q");
        const clear = hub.querySelector("#hw-lib-clear");
        if (search) search.value = "";
        if (clear) clear.hidden = true;
        const level = hub.querySelector("#hw-lib-level");
        const type = hub.querySelector("#hw-lib-type");
        if (level) level.value = "all";
        if (type) type.value = "all";
        paintLibraryGrid();
      });
      grid.querySelector('[data-lib="create-empty"]')?.addEventListener("click", () => openCreate());
      return;
    }
    grid.innerHTML = items.map((item) => cardHtml(item)).join("");
    bindCardActions(grid);
  }

  function statusLabel(status) {
    if (status === "completed") return "完了";
    if (status === "in_progress") return "進行中";
    return "未着手";
  }

  function typeLabel(type) {
    return QUESTION_TYPE_LABEL[type] || type || "問題";
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(Number(ms) / 1000));
    if (!total) return "—";
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes < 1) return `${seconds}秒`;
    if (minutes < 60) return `${minutes}分`;
    return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
  }

  async function openSentDetail(id) {
    if (!id) return;
    state.view = "sent-detail";
    hub.innerHTML = `
      <div class="hw-lib hw-sent-detail">
        <p class="hw-lib-status is-loading">進捗を読み込み中…</p>
      </div>`;
    try {
      const detail = await options.callFunction("getSentHomeworkDetail", { id });
      state.sentDetail = detail;
      hub.innerHTML = sentDetailHtml(detail);
      bindSentDetail();
    } catch (error) {
      state.view = "library";
      state.tab = "sent";
      hub.innerHTML = libraryHtml();
      bindLibrary();
      await refreshSent();
      showBanner(friendlyLoadError(error), { retry: true });
      setLibStatus("送信済み宿題の詳細を開けませんでした。");
    }
  }

  function sentDetailHtml(detail) {
    const assignment = detail.assignment || {};
    const summary = detail.summary || {};
    const students = Array.isArray(detail.students) ? detail.students : [];
    const questions = Array.isArray(detail.questions) ? detail.questions : [];
    const classes = (assignment.classNames || []).join("・") || "クラス未設定";
    return `
      <div class="hw-lib hw-sent-detail">
        <nav class="hw-lib-crumb" aria-label="パンくず">
          <button type="button" class="hw-lib-crumb-link" data-sent-back>送信済み</button>
          <span aria-hidden="true">/</span>
          <span>進捗・分析</span>
        </nav>
        <header class="hw-lib-hero hw-lib-hero-compact">
          <div class="hw-lib-hero-copy">
            <h2>${escapeHtml(assignment.title || "宿題")}</h2>
            <p>${escapeHtml(classes)} · ${escapeHtml(formatDueShort(assignment.dueOn))} · ${assignment.questionCount || 0}問</p>
          </div>
          <div class="hw-sent-detail-actions">
            <button type="button" class="hw-quiet" data-sent-back>一覧にもどる</button>
            <button type="button" class="hw-sent-delete is-solid" data-sent-del="${escapeHtml(assignment.id || "")}">この配信を削除</button>
          </div>
        </header>
        <section class="hw-sent-summary" aria-label="まとめ">
          <article><strong>${summary.assigneeCount || 0}</strong><span>配信人数</span></article>
          <article><strong>${summary.completedCount || 0}</strong><span>完了</span></article>
          <article><strong>${summary.startedCount || 0}</strong><span>着手</span></article>
          <article><strong>${summary.avgPercent || 0}%</strong><span>平均正答率</span></article>
        </section>
        <section class="hw-sent-panel">
          <div class="hw-sent-panel-head">
            <h3>生徒の進捗</h3>
            <p>名前を開くと、問題ごとの正誤が確認できます。</p>
          </div>
          <div class="hw-sent-students">
            ${students.length ? students.map((student) => `
              <details class="hw-sent-student tone-${escapeHtml(student.status)}">
                <summary>
                  <span class="hw-sent-student-name">${escapeHtml(student.name)}</span>
                  <span class="hw-sent-student-status">${escapeHtml(statusLabel(student.status))}</span>
                  <span class="hw-sent-student-score">${student.correctCount || 0}/${student.total || 0}</span>
                  <span class="hw-sent-student-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, student.percent || 0))}%"></i></span>
                  <span class="hw-sent-student-pct">${student.percent || 0}%</span>
                </summary>
                <div class="hw-sent-student-body">
                  <p class="hw-sent-student-meta">学習時間 ${escapeHtml(formatDuration(student.timeSpentMs))}${student.struggleVocab?.length ? ` · 苦戦単語: ${escapeHtml(student.struggleVocab.join(", "))}` : ""}</p>
                  <ul class="hw-sent-attempt-list">
                    ${(student.attempts || []).map((attempt) => `
                      <li class="${attempt.tried ? (attempt.correct ? "is-ok" : "is-ng") : "is-pending"}">
                        <span class="hw-sent-attempt-mark" aria-hidden="true">${attempt.tried ? (attempt.correct ? "○" : "×") : "–"}</span>
                        <span class="hw-sent-attempt-main">
                          <strong>${escapeHtml(typeLabel(attempt.type))}</strong>
                          <small>${escapeHtml(attempt.prompt || "（問題文なし）")}</small>
                        </span>
                        <span class="hw-sent-attempt-side">
                          ${attempt.tried
                            ? `${attempt.firstCorrect === false ? "初回ミス · " : ""}${attempt.tries || 0}回`
                            : "未回答"}
                        </span>
                      </li>
                    `).join("")}
                  </ul>
                </div>
              </details>
            `).join("") : `<p class="hw-sent-empty">この宿題に割り当てられた生徒がいません。</p>`}
          </div>
        </section>
        <section class="hw-sent-panel">
          <div class="hw-sent-panel-head">
            <h3>問題別の正誤分析</h3>
            <p>どの問題でつまずいているかを確認できます。</p>
          </div>
          <div class="hw-sent-questions">
            ${questions.length ? `
              <div class="hw-sent-q-table" role="table" aria-label="問題別分析">
                <div class="hw-sent-q-row is-head" role="row">
                  <span role="columnheader">問題</span>
                  <span role="columnheader">正答</span>
                  <span role="columnheader">誤答</span>
                  <span role="columnheader">正答率</span>
                  <span role="columnheader">初回正解</span>
                </div>
                ${questions.map((question) => `
                  <div class="hw-sent-q-row" role="row">
                    <span class="hw-sent-q-prompt" role="cell">
                      <strong>${escapeHtml(typeLabel(question.type))}</strong>
                      <small>${escapeHtml(question.prompt || "（問題文なし）")}</small>
                      ${question.struggles ? `<em class="hw-sent-q-warn">苦戦 ${question.struggles}人</em>` : ""}
                    </span>
                    <span role="cell">${question.correct || 0}</span>
                    <span role="cell">${question.incorrect || 0}</span>
                    <span role="cell">${question.correctRate == null ? "—" : `${question.correctRate}%`}</span>
                    <span role="cell">${question.firstCorrectRate == null ? "—" : `${question.firstCorrectRate}%`}</span>
                  </div>
                `).join("")}
              </div>
            ` : `<p class="hw-sent-empty">問題データがありません。</p>`}
          </div>
        </section>
      </div>`;
  }

  async function backToSentList() {
    state.view = "library";
    state.tab = "sent";
    state.sentDetail = null;
    hub.innerHTML = libraryHtml();
    bindLibrary();
    updateTabs();
    syncSentToolbar();
    paintLibraryGrid();
    if (!state.sentItems.length) await refreshSent();
  }

  function bindSentDetail() {
    hub.querySelectorAll("[data-sent-back]").forEach((btn) => {
      btn.onclick = () => { backToSentList(); };
    });
    hub.querySelectorAll("[data-sent-del]").forEach((btn) => {
      btn.onclick = () => deleteSentItem(btn.dataset.sentDel, { fromDetail: true });
    });
  }

  async function deleteSentItem(id, { fromDetail = false } = {}) {
    if (!id) return;
    const item = state.sentItems.find((row) => row.id === id);
    const title = item?.title || state.sentDetail?.assignment?.title || "この宿題";
    const people = item?.assigneeCount || state.sentDetail?.summary?.assigneeCount || 0;
    const ok = window.confirm(
      `「${title}」の配信を削除しますか？\n\n生徒側の宿題と進捗も消えます${people ? `（${people}人分）` : ""}。この操作は取り消せません。`
    );
    if (!ok) return;
    try {
      await options.callFunction("deleteHomeworkPack", { id });
      state.sentItems = state.sentItems.filter((row) => row.id !== id);
      state.sentDetail = null;
      updateTabs();
      if (fromDetail || state.view === "sent-detail") {
        await backToSentList();
      } else {
        paintLibraryGrid();
      }
      setLibStatus("送信済み宿題を削除しました。", "ok");
    } catch (error) {
      setLibStatus(error.message || "削除できませんでした。");
    }
  }

  function bindCardActions(grid) {
    const stopAnd = (handler) => (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    };
    grid.querySelectorAll("[data-open]").forEach((card) => {
      card.onclick = () => openPreview(card.dataset.open);
      card.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPreview(card.dataset.open);
        }
      };
    });
    grid.querySelectorAll("[data-use]").forEach((btn) => {
      btn.onclick = stopAnd(() => useItem(btn.dataset.use));
    });
    grid.querySelectorAll("[data-preview]").forEach((btn) => {
      btn.onclick = stopAnd(() => openPreview(btn.dataset.preview));
    });
    grid.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = stopAnd(() => openEdit(btn.dataset.edit));
    });
    grid.querySelectorAll("[data-dup]").forEach((btn) => {
      btn.onclick = stopAnd(() => duplicateItem(btn.dataset.dup));
    });
    grid.querySelectorAll("[data-pub]").forEach((btn) => {
      btn.onclick = stopAnd(() => togglePublished(btn.dataset.pub, btn.dataset.on !== "1"));
    });
    grid.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = stopAnd(() => deleteItem(btn.dataset.del));
    });
    grid.querySelectorAll("[data-more]").forEach((btn) => {
      btn.onclick = stopAnd(() => {
        const menu = btn.parentElement?.querySelector(".hw-lib-menu");
        const open = menu && !menu.hidden;
        closeMenus();
        if (menu && !open) menu.hidden = false;
      });
    });
  }

  function closeMenus() {
    hub.querySelectorAll(".hw-lib-menu").forEach((menu) => { menu.hidden = true; });
  }

  hub.addEventListener("click", (event) => {
    if (!event.target.closest(".hw-lib-more")) closeMenus();
  });

  function useItem(id) {
    const item = state.items.find((row) => row.id === id);
    if (!item) return;
    if (!item.libraryReady && !item.official) {
      setLibStatus("この宿題はまだ音声確認が終わっていません。編集して完成させてから配信してください。");
      return;
    }
    state.selected = item;
    state.view = "assign";
    paint();
  }

  function cardHtml(item) {
    const theme = themeFor(item);
    const art = THEME_ART[theme] || THEME_ART.default;
    const mine = !item.official && item.teacherId === options.uid;
    const originBadge = item.official
      ? `<span class="hw-lib-badge is-official">公式</span>`
      : (mine
        ? `<span class="hw-lib-badge is-mine">先生が作成</span>`
        : `<span class="hw-lib-badge is-shared">公開</span>`);
    const levelBadge = `<span class="hw-lib-badge is-level-${escapeHtml(item.level || "beginner")}">${escapeHtml(LEVEL_LABEL[item.level] || item.level || "Beginner")}</span>`;
    const privacy = mine
      ? `<span class="hw-lib-badge ${item.published ? "is-shared" : "is-private"}">${item.published ? "公開中" : "非公開"}</span>`
      : "";
    const typeCount = (item.types || []).length;
    const menuItems = mine ? `
      <button type="button" data-edit="${escapeHtml(item.id)}">編集</button>
      <button type="button" data-dup="${escapeHtml(item.id)}">複製</button>
      <button type="button" data-pub="${escapeHtml(item.id)}" data-on="${item.published ? "1" : "0"}">${item.published ? "非公開にする" : "公開する"}</button>
      <button type="button" class="is-danger" data-del="${escapeHtml(item.id)}">削除</button>`
      : `<button type="button" data-dup="${escapeHtml(item.id)}">マイライブラリに複製</button>`;

    return `
      <article class="hw-lib-card theme-${theme}" data-open="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}をプレビュー">
        <div class="hw-lib-card-art" aria-hidden="true">
          <span class="hw-lib-card-art-label">${escapeHtml(art.label)}</span>
          ${art.svg}
        </div>
        <div class="hw-lib-card-body">
          <div class="hw-lib-card-badges">${originBadge}${levelBadge}${privacy}</div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="hw-lib-card-desc">${escapeHtml(item.description || "単語とクイズの宿題パックです。")}</p>
          <div class="hw-lib-card-stats">
            <span title="問題数">${ICONS.book}<em>${item.questionCount || 0}問</em></span>
            <span title="問題の種類">${ICONS.layers}<em>${typeCount ? `${typeCount}種類` : "問題パック"}</em></span>
            <span title="作成者">${ICONS.person}<em>${escapeHtml(item.creatorName || "先生")}</em></span>
          </div>
          <div class="hw-lib-card-actions">
            <button type="button" class="hw-lib-use" data-use="${escapeHtml(item.id)}">この宿題を使う →</button>
            <div class="hw-lib-card-secondary">
              <button type="button" class="hw-lib-preview-btn" data-preview="${escapeHtml(item.id)}">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                プレビュー
              </button>
              <div class="hw-lib-more">
                <button type="button" class="hw-lib-more-btn" data-more aria-label="その他の操作">⋯</button>
                <div class="hw-lib-menu" hidden>${menuItems}</div>
              </div>
            </div>
          </div>
        </div>
      </article>`;
  }

  function previewQuestionsHtml(rows) {
    if (!rows.length) {
      return `<p class="hw-lib-preview-muted">表示できる問題がありません。</p>`;
    }
    const typeCounts = rows.reduce((map, row) => {
      map[row.type] = (map[row.type] || 0) + 1;
      return map;
    }, {});
    const typeLine = Object.entries(typeCounts)
      .map(([type, n]) => `${type} ${n}`)
      .join(" · ");
    return `
      <p class="hw-lib-preview-types">${escapeHtml(typeLine)}</p>
      <ol class="hw-lib-preview-qlist">
        ${rows.map((row) => `
          <li>
            <span class="hw-lib-qsum-type">${escapeHtml(row.type)}</span>
            <div class="hw-lib-qsum-copy">
              <strong>${row.index}. ${escapeHtml(row.prompt)}</strong>
              ${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ""}
            </div>
          </li>`).join("")}
      </ol>`;
  }

  async function loadPreviewQuestions(item) {
    if (Array.isArray(item._questions) && item._questions.length) return item._questions;
    if (item._seed?.questions?.length) {
      item._questions = item._seed.questions;
      return item._questions;
    }
    if (options.lab || String(item.id || "").startsWith("official-")) {
      item._questions = item._questions || [];
      return item._questions;
    }
    const pack = await options.callFunction("getHomeworkEditor", { id: item.id });
    item._questions = Array.isArray(pack.questions) ? pack.questions : [];
    if (pack.libraryReady) item.libraryReady = true;
    if (!item.questionCount) item.questionCount = item._questions.length;
    return item._questions;
  }

  async function openPreview(id) {
    const item = state.items.find((row) => row.id === id);
    const host = hub.querySelector("#hw-lib-preview");
    if (!item || !host) return;
    state.previewId = id;
    let audioNote = item.official || item.libraryReady
      ? "音声確認済み（そのまま配信できます）"
      : "音声確認が未完了です";
    host.hidden = false;
    host.innerHTML = previewShell(item, `<p class="hw-lib-preview-loading">問題を読み込み中…</p>`, audioNote);
    bindPreview(item);
    let rows = [];
    try {
      const questions = await loadPreviewQuestions(item);
      rows = questionSummaryRows(questions);
      if (item.official || item.libraryReady) {
        audioNote = "音声確認済み（そのまま配信できます）";
      }
    } catch (error) {
      console.warn("[homework-library] preview load", error);
      host.innerHTML = previewShell(
        item,
        `<p class="hw-lib-preview-muted">問題一覧を読み込めませんでした。</p>`,
        audioNote
      );
      bindPreview(item);
      return;
    }
    host.innerHTML = previewShell(item, previewQuestionsHtml(rows), audioNote);
    bindPreview(item);
  }

  function canEditPreviewMeta(item) {
    return Boolean(item && !item.official && item.teacherId === options.uid && item.status !== "assigned");
  }

  function previewShell(item, questionsHtml, audioNote) {
    const theme = themeFor(item);
    const art = THEME_ART[theme] || THEME_ART.default;
    const count = item.questionCount || item._questions?.length || 0;
    const editable = canEditPreviewMeta(item);
    const titleBlock = editable
      ? `<label class="hw-lib-preview-edit">
            <span class="visually-hidden">タイトル</span>
            <input id="hw-preview-title" class="hw-lib-preview-title-input" type="text" maxlength="80" value="${escapeHtml(item.title || "")}" placeholder="宿題のタイトル">
          </label>`
      : `<h3>${escapeHtml(item.title)}</h3>`;
    const descValue = item.description || "";
    const descBlock = editable
      ? `<label class="hw-lib-preview-edit">
            <span class="visually-hidden">サブタイトル</span>
            <textarea id="hw-preview-desc" class="hw-lib-preview-desc-input" maxlength="160" rows="2" placeholder="単語とクイズの宿題パックです。">${escapeHtml(descValue)}</textarea>
          </label>
          <p id="hw-preview-save" class="hw-lib-preview-save" hidden role="status" aria-live="polite"></p>`
      : `<p class="hw-lib-card-desc">${escapeHtml(descValue || "単語とクイズの宿題パックです。")}</p>`;
    return `
      <div class="hw-lib-preview-backdrop" data-preview-close></div>
      <aside class="hw-lib-preview-panel" role="dialog" aria-modal="true" aria-label="宿題プレビュー">
        <button type="button" class="hw-lib-preview-close" data-preview-close aria-label="閉じる">×</button>
        <div class="hw-lib-preview-scroll">
          <div class="hw-lib-preview-art theme-${theme}" aria-hidden="true">${art.svg}</div>
          <div class="hw-lib-card-badges">
            <span class="hw-lib-badge ${item.official ? "is-official" : "is-mine"}">${item.official ? "公式" : "先生が作成"}</span>
            <span class="hw-lib-badge is-level-${escapeHtml(item.level || "beginner")}">${escapeHtml(LEVEL_LABEL[item.level] || item.level)}</span>
          </div>
          ${titleBlock}
          ${descBlock}
          <dl class="hw-lib-preview-meta">
            <div><dt>作成者</dt><dd>${escapeHtml(item.creatorName || "先生")}</dd></div>
            <div><dt>問題数</dt><dd>${count}問</dd></div>
            <div><dt>問題形式</dt><dd>${escapeHtml((item.types || []).join("・") || "問題パック")}</dd></div>
            <div><dt>音声</dt><dd>${escapeHtml(audioNote)}</dd></div>
          </dl>
          <h4>プレビュー <em>${count ? `${count}問` : ""}</em></h4>
          ${questionsHtml}
        </div>
        <div class="hw-lib-preview-foot">
          <button type="button" class="hw-lib-use" data-preview-use="${escapeHtml(item.id)}">この宿題を使う →</button>
        </div>
      </aside>`;
  }

  function syncCardMeta(item) {
    const grid = hub.querySelector("#hw-lib-grid");
    const card = grid?.querySelector(`[data-open="${CSS.escape(item.id)}"]`);
    if (!card) return;
    const h3 = card.querySelector("h3");
    const desc = card.querySelector(".hw-lib-card-desc");
    if (h3) h3.textContent = item.title || "";
    if (desc) desc.textContent = item.description || "単語とクイズの宿題パックです。";
    card.setAttribute("aria-label", `${item.title || "宿題"}をプレビュー`);
  }

  function setPreviewSaveStatus(kind, message) {
    const el = hub.querySelector("#hw-preview-save");
    if (!el) return;
    el.hidden = !message;
    el.className = `hw-lib-preview-save${kind ? ` is-${kind}` : ""}`;
    el.textContent = message || "";
  }

  function bindPreviewMeta(item) {
    if (!canEditPreviewMeta(item)) return;
    const titleInput = hub.querySelector("#hw-preview-title");
    const descInput = hub.querySelector("#hw-preview-desc");
    if (!titleInput || !descInput) return;
    let timer = 0;
    let seq = 0;
    const flush = (immediate = false) => {
      window.clearTimeout(timer);
      const run = () => {
        const token = ++seq;
        autosavePreviewMeta(item, titleInput.value, descInput.value)
          .then((ok) => {
            if (token !== seq) return;
            if (ok) setPreviewSaveStatus("ok", "自動保存しました");
          })
          .catch((error) => {
            if (token !== seq) return;
            setPreviewSaveStatus("bad", error?.message || "保存に失敗しました");
          });
      };
      if (immediate) {
        setPreviewSaveStatus("", "保存しています…");
        run();
        return;
      }
      setPreviewSaveStatus("", "保存しています…");
      timer = window.setTimeout(run, 550);
    };
    titleInput.addEventListener("input", () => flush(false));
    descInput.addEventListener("input", () => flush(false));
    titleInput.addEventListener("blur", () => flush(true));
    descInput.addEventListener("blur", () => flush(true));
  }

  async function autosavePreviewMeta(item, rawTitle, rawDesc) {
    const title = String(rawTitle || "").trim().slice(0, 80) || "きょうのしゅくだい";
    const description = String(rawDesc || "").trim().slice(0, 160);
    if (title === (item.title || "") && description === (item.description || "")) {
      setPreviewSaveStatus("", "");
      return false;
    }
    if (!options.callFunction) throw new Error("保存できませんでした。");
    let result = null;
    try {
      result = await options.callFunction("updateHomeworkPackMeta", {
        id: item.id,
        title,
        description,
      });
    } catch (error) {
      const message = String(error?.message || error?.code || "");
      // Fallback when the lightweight meta endpoint is not deployed yet.
      if (!/not-found|NOT_FOUND|not found|internal|INTERNAL|unimplemented|UNIMPLEMENTED/i.test(message)
        && !/does not exist|not been deployed|404/i.test(message)) {
        throw error;
      }
      const pack = await options.callFunction("getHomeworkEditor", { id: item.id });
      if (pack?.readOnly) throw new Error("この宿題は編集できません。");
      await options.callFunction("saveHomeworkPack", {
        id: item.id,
        status: "draft",
        title,
        description,
        level: pack.level || item.level || "beginner",
        published: pack.published !== false,
        libraryReady: Boolean(pack.libraryReady ?? item.libraryReady),
        vocab: pack.vocab || [],
        questions: pack.questions || [],
        settings: pack.settings || {},
        dueOn: pack.dueOn || "",
        classIds: [],
      });
      result = { title, description };
    }
    item.title = result?.title || title;
    item.description = result?.description ?? description;
    const listed = state.items.find((row) => row.id === item.id);
    if (listed && listed !== item) {
      listed.title = item.title;
      listed.description = item.description;
    }
    syncCardMeta(item);
    return true;
  }

  function bindPreview(item) {
    const host = hub.querySelector("#hw-lib-preview");
    if (!host) return;
    host.querySelectorAll("[data-preview-close]").forEach((el) => {
      el.onclick = () => {
        host.hidden = true;
        host.innerHTML = "";
        state.previewId = null;
      };
    });
    host.querySelector("[data-preview-use]")?.addEventListener("click", () => {
      host.hidden = true;
      useItem(item.id);
    });
    bindPreviewMeta(item);
  }

  function setLibStatus(message, kind = "bad") {
    const el = hub.querySelector("#hw-lib-status") || hub.querySelector("#hw-lib-assign-status");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.className = `hw-lib-status${kind ? ` is-${kind}` : ""}`;
  }

  async function openCreate() {
    try {
      await openStudio(null);
    } catch (error) {
      setLibStatus(friendlyLoadError(error) || error.message || "編集画面を開けませんでした。");
    }
  }

  async function openStudio(pack) {
    let mountTeacherHomework;
    try {
      ({ mountTeacherHomework } = await import(`./homework-studio.js?v=${CACHE}`));
    } catch (error) {
      console.error("[homework-library] studio import failed", error);
      throw new Error("編集画面を開けませんでした。ページを再読み込みしてからもう一度お試しください。");
    }
    rememberView("studio", { pack: pack || null });
    await mountTeacherHomework(root, {
      ...options,
      ...(pack ? { initialPack: pack } : {}),
      onStudioSnapshot: (snapshot) => rememberView("studio", { pack: snapshot }),
      openLibrary: (opts = {}) => {
        rememberView("library");
        return mountHomeworkHub(root, {
          ...options,
          initialView: "library",
          initialTab: opts.tab || "all",
          libNotice: opts.notice || "",
          skipResume: true,
        });
      },
      openReport: options.openReport,
    });
  }

  async function openEdit(id) {
    if (!id) return;
    const item = state.items.find((row) => row.id === id);
    if (String(id).startsWith("official-")) {
      const seed = item?._seed;
      if (!seed) {
        setLibStatus("公式テンプレートを開けませんでした。");
        return;
      }
      try {
        await openStudio({
          id: "",
          status: "draft",
          title: seed.title,
          description: seed.description,
          level: seed.level,
          published: true,
          libraryReady: true,
          vocab: seed.vocab,
          questions: seed.questions,
          settings: {
            hints: true,
            sentenceDirection: "ja-to-en",
            types: { multipleChoice: true, matching: true, spelling: true, sentence: true },
          },
        });
      } catch (error) {
        setLibStatus(friendlyLoadError(error));
      }
      return;
    }
    if (item && item.teacherId && item.teacherId !== options.uid) {
      openPreview(id);
      return;
    }
    try {
      const pack = await options.callFunction("getHomeworkEditor", { id });
      await openStudio(pack);
    } catch (error) {
      setLibStatus(friendlyLoadError(error));
    }
  }

  async function duplicateItem(id) {
    setLibStatus("複製しています…", "");
    try {
      if (String(id).startsWith("official-")) {
        const seed = state.items.find((item) => item.id === id)?._seed;
        if (!seed) throw new Error("公式テンプレートが見つかりません。");
        const title = `${seed.title}（コピー）`;
        const settings = {
          hints: true,
          sentenceDirection: "ja-to-en",
          types: { multipleChoice: true, matching: true, spelling: true, sentence: true },
        };
        const questions = (seed.questions || []).map((question) => ({
          ...question,
          approved: true,
          review: false,
        }));
        const result = await options.callFunction("saveHomeworkPack", {
          status: "draft",
          title,
          description: seed.description,
          level: seed.level,
          published: false,
          libraryReady: true,
          vocab: seed.vocab,
          questions,
          settings,
        });
        const newId = result?.id || result?.result?.id;
        if (!newId) throw new Error("複製に失敗しました。");
        // Open immediately with local pack data (no second fetch).
        setLibStatus("");
        await openStudio({
          id: newId,
          status: "draft",
          title,
          description: seed.description || "",
          level: seed.level || "beginner",
          published: false,
          libraryReady: true,
          vocab: seed.vocab || [],
          questions,
          settings,
        });
        return;
      }
      const result = await options.callFunction("duplicateHomeworkPack", { id });
      const newId = result?.id || result?.result?.id;
      if (!newId) throw new Error("複製に失敗しました。");
      let pack = null;
      try {
        pack = await options.callFunction("getHomeworkEditor", { id: newId });
      } catch (error) {
        console.warn("[homework-library] getHomeworkEditor after duplicate", error);
      }
      setLibStatus("");
      if (pack?.questions) {
        await openStudio(pack);
        return;
      }
      await openEdit(newId);
    } catch (error) {
      console.error("[homework-library] duplicate failed", error);
      const message = String(error?.message || "");
      if (/編集画面|studio import|failed to fetch|load failed|network/i.test(message)) {
        setLibStatus(message.includes("編集画面")
          ? message
          : "複製はできましたが、編集画面を開けませんでした。マイライブラリから開いてください。");
        return;
      }
      setLibStatus(friendlyLoadError(error) || message || "複製に失敗しました。");
    }
  }

  async function togglePublished(id, published) {
    try {
      await options.callFunction("setHomeworkPublished", { id, published });
      await refreshLibrary();
      setLibStatus(published ? "公開しました。" : "非公開にしました。", "ok");
    } catch (error) {
      setLibStatus(error.message || "公開設定を変更できませんでした。");
    }
  }

  async function deleteItem(id) {
    if (!window.confirm("この宿題を削除しますか？この操作は取り消せません。")) return;
    try {
      await options.callFunction("deleteHomeworkPack", { id });
      await refreshLibrary();
      setLibStatus("削除しました。", "ok");
    } catch (error) {
      setLibStatus(error.message || "削除できませんでした。");
    }
  }

  async function ensureAssignQuestions(item) {
    if (Array.isArray(item._questions)) return item._questions;
    if (item._seed?.questions?.length) {
      item._questions = item._seed.questions;
      return item._questions;
    }
    if (options.lab || String(item.id || "").startsWith("official-")) {
      item._questions = [];
      return item._questions;
    }
    try {
      const pack = await options.callFunction("getHomeworkEditor", { id: item.id });
      item._questions = Array.isArray(pack.questions) ? pack.questions : [];
      if (!item.questionCount) item.questionCount = item._questions.length;
    } catch (error) {
      console.warn("[homework-library] assign questions", error);
      item._questions = [];
    }
    return item._questions;
  }

  async function bindAssign(item) {
    hub.querySelectorAll('[data-lib="library"]').forEach((btn) => {
      btn.onclick = () => {
        state.view = "library";
        state.selected = null;
        paint();
      };
    });
    await loadAssignClasses();
    paintAssignSummary(item);
    ensureAssignQuestions(item).then(() => paintAssignSummary(item));
    hub.querySelector("#hw-lib-classes")?.addEventListener("change", async (event) => {
      if (!event.target.matches("[data-class]")) return;
      event.target.closest(".hw-class-card")?.classList.toggle("is-on", event.target.checked);
      await paintAssignStudents();
      paintAssignSummary(item);
    });
    hub.querySelector("#hw-lib-due")?.addEventListener("change", () => paintAssignSummary(item));
    hub.querySelector("#hw-lib-send").onclick = () => sendAssignment(item);
  }

  function selectedClassIds() {
    return [...hub.querySelectorAll("[data-class]:checked")].map((input) => input.value);
  }

  function paintAssignSummary(item) {
    const host = hub.querySelector("#hw-lib-assign-summary");
    if (!host) return;
    const wasOpen = host.querySelector(".hw-lib-qsum")?.open === true;
    const classIds = selectedClassIds();
    const names = classIds.map((id) => state.classes.find((row) => row.id === id)?.title || id);
    const due = hub.querySelector("#hw-lib-due")?.value || "";
    const people = classIds.reduce((sum, id) => sum + (state.classStudents[id]?.length || 0), 0);
    const questions = Array.isArray(item._questions) ? item._questions : null;
    const rows = questionSummaryRows(questions || []);
    const count = item.questionCount || rows.length || 0;
    let questionBlock = "";
    if (questions === null) {
      questionBlock = `
        <details class="hw-lib-qsum"${wasOpen ? " open" : ""}>
          <summary>
            <span>問題の一覧</span>
            <em>読み込み中…</em>
          </summary>
          <p class="hw-lib-qsum-empty">問題を読み込んでいます…</p>
        </details>`;
    } else if (!rows.length) {
      questionBlock = `
        <details class="hw-lib-qsum"${wasOpen ? " open" : ""}>
          <summary>
            <span>問題の一覧</span>
            <em>0問</em>
          </summary>
          <p class="hw-lib-qsum-empty">表示できる問題がありません。</p>
        </details>`;
    } else {
      const typeCounts = rows.reduce((map, row) => {
        map[row.type] = (map[row.type] || 0) + 1;
        return map;
      }, {});
      const typeLine = Object.entries(typeCounts)
        .map(([type, n]) => `${type} ${n}`)
        .join(" · ");
      questionBlock = `
        <details class="hw-lib-qsum"${wasOpen ? " open" : ""}>
          <summary>
            <span>問題の一覧</span>
            <em>${rows.length}問 · タップして表示</em>
          </summary>
          <p class="hw-lib-qsum-types">${escapeHtml(typeLine)}</p>
          <ol class="hw-lib-qsum-list">
            ${rows.map((row) => `
              <li>
                <span class="hw-lib-qsum-type">${escapeHtml(row.type)}</span>
                <div class="hw-lib-qsum-copy">
                  <strong>${escapeHtml(row.prompt)}</strong>
                  ${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ""}
                </div>
              </li>`).join("")}
          </ol>
        </details>`;
    }
    host.innerHTML = `
      <h4>3. 内容を確認</h4>
      <dl class="hw-summary-list">
        <div><dt>タイトル</dt><dd>${escapeHtml(item.title)}</dd></div>
        <div><dt>問題</dt><dd>${count}問</dd></div>
        <div><dt>クラス</dt><dd>${names.length ? names.map(escapeHtml).join("、") : "未選択"}</dd></div>
        <div><dt>提出期日</dt><dd>${due ? escapeHtml(due) : "なし"}</dd></div>
        <div><dt>配信先</dt><dd>${people ? `${people}人` : "—"}</dd></div>
      </dl>
      ${questionBlock}`;
  }

  async function studentsForClass(classId) {
    if (state.classStudents[classId]) return state.classStudents[classId];
    if (options.lab || !options.db || classId === "lab-class") {
      const demo = [
        { id: "lab-1", name: "プレビュー生徒 A" },
        { id: "lab-2", name: "プレビュー生徒 B" },
      ];
      state.classStudents[classId] = demo;
      return demo;
    }
    try {
      const snap = await getDocs(query(collection(options.db, "bookings"), where("classId", "==", classId)));
      const rows = [];
      const seen = new Set();
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.status !== "booked" || !data.studentId || seen.has(data.studentId)) continue;
        seen.add(data.studentId);
        let name = data.studentName;
        if (!name) {
          try {
            const user = await getDoc(doc(options.db, "users", data.studentId));
            name = user.data()?.displayName || "生徒";
          } catch {
            name = "生徒";
          }
        }
        rows.push({ id: data.studentId, name: String(name || "生徒") });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      state.classStudents[classId] = rows;
      return rows;
    } catch {
      state.classStudents[classId] = [];
      return [];
    }
  }

  async function paintAssignStudents() {
    const host = hub.querySelector("#hw-lib-students");
    const summary = hub.querySelector("#hw-lib-students-summary");
    if (!host) return;
    const selected = selectedClassIds();
    if (!selected.length) {
      if (summary) summary.textContent = "クラスを選ぶと表示されます";
      host.innerHTML = `<p class="hw-assign-students-empty">クラスにチェックを入れると、予約している生徒が出ます。</p>`;
      return;
    }
    host.innerHTML = `<p class="hw-assign-students-loading">生徒を読み込み中…</p>`;
    const groups = [];
    for (const classId of selected) {
      const students = await studentsForClass(classId);
      groups.push({
        title: state.classes.find((row) => row.id === classId)?.title || classId,
        students,
      });
    }
    const total = groups.reduce((sum, group) => sum + group.students.length, 0);
    if (summary) summary.textContent = `${groups.length}クラス · ${total}人`;
    host.innerHTML = groups.map((group) => `
      <section class="hw-student-group">
        <div class="hw-student-group-head">
          <strong>${escapeHtml(group.title)}</strong>
          <span>${group.students.length}人</span>
        </div>
        ${group.students.length
          ? `<ul class="hw-student-list">${group.students.map((student, index) => `
              <li class="hw-student-chip">
                <span class="hw-student-avatar" aria-hidden="true">${escapeHtml((student.name || "?").slice(0, 1))}</span>
                <span class="hw-student-name">${escapeHtml(student.name)}</span>
                <span class="hw-student-index">${index + 1}</span>
              </li>`).join("")}</ul>`
          : `<p class="hw-assign-students-empty">このクラスに予約している生徒はまだいません。</p>`}
      </section>`).join("");
  }

  async function loadAssignClasses() {
    const host = hub.querySelector("#hw-lib-classes");
    if (!host) return;
    if (options.lab || !options.db) {
      state.classes = [{ id: "lab-class", title: "プレビューのクラス" }];
      host.innerHTML = `<label class="hw-class-card">
        <input data-class type="checkbox" value="lab-class">
        <span class="hw-class-card-body"><strong>プレビューのクラス</strong><small>2人</small></span>
      </label>`;
      return;
    }
    const me = await getDoc(doc(options.db, "users", options.uid));
    const role = me.data()?.role;
    const classQuery = role === "owner"
      ? query(collection(options.db, "classes"), where("status", "==", "open"))
      : query(collection(options.db, "classes"), where("teacherId", "==", options.uid));
    const snap = await getDocs(classQuery);
    state.classes = snap.docs.map((item) => ({ id: item.id, title: item.data().title || "クラス" }));
    host.innerHTML = state.classes.length
      ? state.classes.map((item) => `<label class="hw-class-card">
          <input data-class type="checkbox" value="${escapeHtml(item.id)}">
          <span class="hw-class-card-body"><strong>${escapeHtml(item.title)}</strong><small>…</small></span>
        </label>`).join("")
      : `<p class="hw-note">担当クラスがまだありません。</p>`;
    state.classes.forEach((item) => {
      studentsForClass(item.id).then((students) => {
        const card = [...host.querySelectorAll(".hw-class-card")].find((el) => el.querySelector(`[data-class][value="${item.id}"]`));
        const small = card?.querySelector("small");
        if (small) small.textContent = `${students.length}人`;
      }).catch(() => {});
    });
  }

  async function sendAssignment(item) {
    const classIds = selectedClassIds();
    const dueOn = hub.querySelector("#hw-lib-due")?.value || "";
    const sendBtn = hub.querySelector("#hw-lib-send");
    if (!classIds.length) {
      setLibStatus("出すクラスを選んでください。");
      return;
    }
    sendBtn.disabled = true;
    setLibStatus("配信しています…", "");
    try {
      if (item.official && item._seed) {
        await options.callFunction("saveHomeworkPack", {
          status: "assigned",
          title: item.title,
          description: item.description,
          level: item.level,
          dueOn,
          classIds,
          vocab: item._seed.vocab,
          questions: item._seed.questions,
          published: false,
          libraryReady: false,
          settings: {
            hints: true,
            sentenceDirection: "ja-to-en",
            types: { multipleChoice: true, matching: true, spelling: true, sentence: true },
          },
        });
      } else {
        await options.callFunction("assignHomeworkFromTemplate", {
          templateId: item.id,
          classIds,
          dueOn,
        });
      }
      setLibStatus("宿題を配信しました。ライブラリにもどれます。", "ok");
      setTimeout(() => {
        state.view = "library";
        state.selected = null;
        paint();
      }, 900);
    } catch (error) {
      setLibStatus(error.message || "配信に失敗しました。");
      sendBtn.disabled = false;
    }
  }

  root._confirmLeave = () => true;
  await paint();

  if (options.libNotice) {
    setLibStatus(options.libNotice, "ok");
  }

  if (!options.skipResume && resumeView === "studio" && resume?.pack) {
    try {
      await openStudio(resume.pack);
    } catch (error) {
      console.warn("[homework-library] resume studio failed", error);
    }
  } else if (!options.skipResume && resumeView === "assign" && resume?.selectedId) {
    const item = state.items.find((row) => row.id === resume.selectedId);
    if (item) {
      state.selected = item;
      state.view = "assign";
      await paint();
    }
  }
}
