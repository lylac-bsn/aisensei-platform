import { doc, getDoc, getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  parseVocabulary,
  generateHomework,
  regenerateAt,
  updateSentence,
  updateQuestion,
  gradeAnswer,
  toPublic,
} from "./homework-engine.js?v=20261030-hw-lib129";
import { mountHomeworkPlayer } from "./homework-play.js?v=20261030-hw-lib129";
import { playPrompt, stopPrompt } from "./homework-audio.js?v=20261030-hw-lib129";
import { hasHomeworkVoice, hydrateHomeworkVoice, linesForQuestions, prepareHomeworkVoice, syncHomeworkVoiceRemote } from "./homework-voice-bank.js?v=20261030-hw-lib129";
import { cacheKey, RETRY_LINES } from "./homework-voice-lines.js?v=20261030-hw-lib129";

const SAMPLE = [
  ["さかな", "Fish"],
  ["ねこ", "Cat"],
  ["いぬ", "Dog"],
  ["りんご", "Apple"],
  ["みず", "Water"],
  ["ほん", "Book"],
];

const TYPE_LABEL = {
  multipleChoice: "4択",
  matching: "線つなぎ",
  spelling: "スペリング",
  sentence: "文づくり",
};

const RETRY_WORD_KEY = "__retry_voice__";
const RETRY_TAB_LABEL = "間違えた時の音声";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export async function mountTeacherHomework(root, options) {
  const state = {
    pairs: [],
    questions: [],
    warnings: [],
    draftId: "",
    status: "draft",
    dirty: false,
    classes: [],
    filter: "all",
    wordKey: "",
    wordFilters: {},
    audioReady: false,
    audioBuilding: false,
    editor: null,
    offerNext: false,
    flowStep: "build", // build | assign | confirm
    classStudents: {},
  };
  const voiceBusy = new Map();
  const audioReviewed = new Map();
  const heardLines = new Set();
  const lineBusy = new Set();
  const retryNeedsRecheck = new Set();
  const lineKey = (text) => cacheKey(text);
  const markLinesHeard = (lines = []) => {
    lines.forEach((line) => {
      const text = String(line || "").trim();
      if (text) heardLines.add(lineKey(text));
    });
  };
  /** Retry clips are shared across homework packs — treat ready ones as already confirmed. */
  const acceptReusableRetryLines = () => {
    RETRY_LINES.forEach((line) => {
      const key = lineKey(line);
      if (retryNeedsRecheck.has(key)) return;
      if (hasHomeworkVoice(line)) heardLines.add(key);
    });
  };
  const allLinesHeard = (lines = []) => (
    lines.length > 0 && lines.every((line) => heardLines.has(lineKey(line)))
  );
  const editorDirty = () => {
    if (!state.editor) return false;
    const question = state.questions[state.editor.index];
    if (!question) return Boolean(state.editor.dirty);
    if (question.type !== "sentence") return Boolean(state.editor.dirty);
    return state.editor.promptJa !== (question.promptJa || "")
      || state.editor.sentence !== (question.display || "")
      || Boolean(state.editor.dirty);
  };
  root.replaceChildren();
  const studio = document.createElement("div");
  const stage = document.createElement("div");
  stage.className = "hw-play-stage";
  stage.hidden = true;
  root.append(studio, stage);

  studio.className = "hw-studio hw-switch-shell";
  studio.innerHTML = `
    <header class="hw-page-head">
      <div class="hw-page-head-row">
        ${options.openLibrary ? `<button type="button" class="hw-lib-back" data-hw="library" aria-label="ライブラリにもどる" title="ライブラリにもどる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
        <div class="hw-page-head-copy">
          <h2><span class="hw-page-head-ico" aria-hidden="true">${ICON.book}</span>単語から宿題をつくる</h2>
        </div>
        <div class="hw-page-head-actions">
          <button type="button" class="hw-quiet hw-ico-btn hw-head-draft" id="hw-draft" disabled title="マイライブラリに保存。生徒には送られず、他の先生にも公開されません">
            <span class="hw-btn-ico" aria-hidden="true">${ICON.save}</span>下書き
          </button>
          <p id="hw-draft-status" class="hw-head-draft-status" hidden role="status" aria-live="polite"></p>
        </div>
      </div>
    </header>
    <nav class="hw-flow-steps" id="hw-flow-steps" aria-label="宿題づくりの手順">
      <button type="button" class="hw-flow-step is-current" data-flow-goto="build" aria-current="step">
        <span class="hw-flow-ico" aria-hidden="true">${ICON.pencil}</span>
        <span class="hw-flow-copy"><strong>つくる</strong></span>
        <span class="hw-flow-mark" aria-hidden="true"></span>
      </button>
      <button type="button" class="hw-flow-step" data-flow-goto="build" data-flow-need="questions">
        <span class="hw-flow-ico" aria-hidden="true">${ICON.speaker}</span>
        <span class="hw-flow-copy"><strong>確認</strong></span>
        <span class="hw-flow-mark" aria-hidden="true"></span>
      </button>
      <button type="button" class="hw-flow-step" data-flow-goto="assign" data-flow-need="ready">
        <span class="hw-flow-ico" aria-hidden="true">${ICON.users}</span>
        <span class="hw-flow-copy"><strong>配信設定</strong></span>
        <span class="hw-flow-mark" aria-hidden="true"></span>
      </button>
      <button type="button" class="hw-flow-step" data-flow-goto="confirm" data-flow-need="ready">
        <span class="hw-flow-ico" aria-hidden="true">${ICON.send}</span>
        <span class="hw-flow-copy"><strong>送信</strong></span>
        <span class="hw-flow-mark" aria-hidden="true"></span>
      </button>
    </nav>
    <div class="hw-layout" id="hw-build-layout">
      <form class="hw-composer" id="hw-form">
        <section class="hw-section hw-section-basic" aria-label="宿題の設定">
          <div class="hw-fields hw-fields-basic">
            <label class="hw-field hw-field-title">宿題名
              <input id="hw-title" class="hw-title-input" type="text" maxlength="80" value="きょうのしゅくだい" placeholder="きょうのしゅくだい">
            </label>
            <div class="hw-fields-meta">
            <label class="hw-field">レベル
              <select id="hw-level">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
              <label class="hw-field">問題数 <input id="hw-count" type="number" min="1" max="100" placeholder="おまかせ"></label>
            </div>
          </div>
        </section>

        <section class="hw-section" aria-labelledby="hw-sec-words">
          <div class="hw-section-head hw-section-head-row">
            <div>
              <h3 id="hw-sec-words"><span class="hw-sec-ico" aria-hidden="true">${ICON.tags}</span>単語リスト</h3>
            </div>
            <div class="hw-actions hw-actions-inline">
              <button type="button" class="hw-quiet hw-ico-btn hw-ico-only" id="hw-paste" aria-label="貼り付け" title="貼り付け"><span class="hw-btn-ico" aria-hidden="true">${ICON.paste}</span><span class="hw-btn-label">貼り付け</span></button>
              <button type="button" class="hw-quiet hw-ico-btn hw-ico-only" id="hw-sample" aria-label="例を入れる" title="例を入れる"><span class="hw-btn-ico" aria-hidden="true">${ICON.sparkle}</span><span class="hw-btn-label">例を入れる</span></button>
            </div>
          </div>
          <div class="hw-words">
            <div class="hw-word-head" aria-hidden="true"><span></span><span>日本語</span><span>英語</span><span></span></div>
            <div id="hw-words"></div>
            <button type="button" class="hw-quiet hw-add-word" id="hw-add-word">＋ 単語を追加</button>
            <label class="hw-word-shuffle" for="hw-shuffle-words">
              <input id="hw-shuffle-words" type="checkbox" checked>
              <span>単語をランダムに使う</span>
              <small>オフにすると、リストの上から順に問題をつくります。ドラッグで並べ替えできます。</small>
            </label>
          </div>
        </section>

        <section class="hw-section" aria-labelledby="hw-sec-types">
          <div class="hw-section-head">
            <h3 id="hw-sec-types"><span class="hw-sec-ico" aria-hidden="true">${ICON.grid}</span>問題タイプ</h3>
          </div>
          <div class="hw-type-grid" role="group" aria-label="問題タイプ">
            <label class="hw-type-card is-mcq">
              <input type="checkbox" data-type="multipleChoice" checked>
              <span class="hw-type-icon" aria-hidden="true">${ICON.mcq}</span>
              <span class="hw-type-copy"><strong>4択</strong></span>
            </label>
            <label class="hw-type-card is-match">
              <input type="checkbox" data-type="matching" checked>
              <span class="hw-type-icon" aria-hidden="true">${ICON.match}</span>
              <span class="hw-type-copy"><strong>線つなぎ</strong></span>
            </label>
            <label class="hw-type-card is-spell">
              <input type="checkbox" data-type="spelling" checked>
              <span class="hw-type-icon" aria-hidden="true">${ICON.spell}</span>
              <span class="hw-type-copy"><strong>スペリング</strong></span>
            </label>
            <label class="hw-type-card is-sentence">
              <input type="checkbox" data-type="sentence" checked>
              <span class="hw-type-icon" aria-hidden="true">${ICON.sentence}</span>
              <span class="hw-type-copy"><strong>文づくり</strong></span>
            </label>
          </div>
        </section>

        <section class="hw-section hw-options-section" aria-labelledby="hw-sec-options">
          <div class="hw-section-head">
            <h3 id="hw-sec-options"><span class="hw-sec-ico" aria-hidden="true">${ICON.sliders}</span>オプション</h3>
          </div>
          <div class="hw-option-grid">
            <label class="hw-option-card" for="hw-hints">
              <span class="hw-option-kicker">ヒント</span>
              <span class="hw-option-row">
                <input id="hw-hints" type="checkbox" checked>
                <span class="hw-option-text">最初の1文字を見せる</span>
            </span>
            </label>
            <label class="hw-option-card" for="hw-direction">
              <span class="hw-option-kicker">文づくり</span>
              <select id="hw-direction" class="hw-option-select">
                <option value="ja-to-en">日 → 英</option>
                <option value="en-to-ja">英 → 日</option>
              </select>
            </label>
            <label class="hw-option-card" for="hw-published">
              <span class="hw-option-kicker">公開</span>
              <span class="hw-option-row">
                <input id="hw-published" type="checkbox">
                <span class="hw-option-text">他の先生にも公開（完成して送信するときだけ）</span>
              </span>
            </label>
          </div>
        </section>

        <div class="hw-composer-foot">
          <div class="hw-actions hw-actions-foot">
            <button type="button" class="hw-primary hw-ico-btn" id="hw-generate"><span class="hw-btn-ico" aria-hidden="true">${ICON.sparkle}</span>宿題をつくる</button>
          </div>
        </div>
      </form>

      <aside class="hw-sidepane" aria-label="つくった問題">
        <div id="hw-warnings"></div>
        <div id="hw-side-status" class="hw-side-status" hidden role="status" aria-live="polite"></div>
        <div class="hw-tools" id="hw-tools" hidden>
          <div id="hw-voice" class="hw-voice-panel" hidden role="status" aria-live="polite">
            <p class="hw-voice-panel-label">音声の進捗</p>
            <p class="hw-voice-panel-text"><span id="hw-voice-text"></span><span class="hw-voice-dots" aria-hidden="true"><span></span><span></span><span></span></span></p>
            <p class="hw-voice-panel-now" id="hw-voice-now" hidden></p>
            <p class="hw-voice-panel-note">待っている間に生成済みの音声を確認してください。</p>
          </div>
          <div class="hw-actions hw-toolbar">
            <p class="hw-toolbar-lead" id="hw-toolbar-lead">問題文と答えを確認してください。</p>
            <div class="hw-toolbar-actions" id="hw-toolbar-actions">
              <button type="button" class="hw-quiet hw-preview-btn hw-ico-btn" id="hw-preview"><span class="hw-preview-ico" aria-hidden="true">${ICON.eye}</span><span class="hw-preview-label">生徒画面</span></button>
              <button type="button" class="hw-primary hw-ico-btn" id="hw-make-voice">
                <span class="hw-btn-ico" data-make-voice-ico aria-hidden="true">${ICON.checkCircle}</span>
                <span class="hw-make-voice-label">確認完了</span>
                <span class="hw-make-voice-help" hidden title="音声は一度ですべて作れないことがあります。残りの音声ができるまで、このボタンを何度か押してください。">${ICON.help}</span>
              </button>
              <button type="button" class="hw-primary hw-ico-btn" id="hw-goto-assign" hidden><span class="hw-btn-ico" aria-hidden="true">${ICON.checkCircle}</span>配信設定へ</button>
            </div>
          </div>
        </div>
        <div id="hw-empty" class="hw-empty">
          <strong>まだ問題がありません</strong>
          <p>左で単語を入れて「宿題をつくる」を押すと、ここにプレビューが出ます。</p>
        </div>
        <div id="hw-review" class="hw-review" hidden>
          <div class="hw-word-bar" id="hw-word-bar" hidden>
            <p class="hw-word-bar-label">単語</p>
            <div id="hw-word-tabs" class="hw-word-tabs" role="tablist" aria-label="単語"></div>
            <div class="hw-word-subfilters">
              <p class="hw-word-bar-label" id="hw-word-filter-label">フィルタ</p>
              <div class="hw-word-filter-row">
                <div class="hw-filters" role="tablist" aria-label="問題フィルタ">
                  <button type="button" class="hw-filter is-current" data-filter="all" role="tab" aria-selected="true"><span class="hw-filter-ico" aria-hidden="true">${ICON.grid}</span>すべて</button>
                  <button type="button" class="hw-filter" data-filter="needs" role="tab" aria-selected="false"><span class="hw-filter-ico" aria-hidden="true">${ICON.clock}</span>未確認</button>
                  <button type="button" class="hw-filter" data-filter="done" role="tab" aria-selected="false"><span class="hw-filter-ico" aria-hidden="true">${ICON.check}</span>確認済</button>
                </div>
                <button type="button" class="hw-confirm-all-word" id="hw-confirm-all-word" hidden><span class="hw-btn-ico" aria-hidden="true">${ICON.checkCircle}</span>全て確認済</button>
              </div>
            </div>
          </div>
          <div id="hw-list" class="hw-list"></div>
        </div>
      </aside>
    </div>

    <section class="hw-flow-panel" id="hw-flow-assign" hidden>
      <div class="hw-flow-card hw-assign-card">
        <div class="hw-section-head">
          <h3><span class="hw-sec-ico" aria-hidden="true">${ICON.users}</span>配信設定</h3>
          <p class="hw-section-hint">クラスと提出期日を決めます</p>
        </div>
        <div class="hw-assign-grid">
          <div class="hw-assign-pane">
            <div class="hw-assign-pane-head">
              <h4>クラス</h4>
            </div>
            <div id="hw-classes" class="hw-classes"></div>
          </div>
          <div class="hw-assign-pane">
            <div class="hw-assign-pane-head">
              <h4><span class="hw-sec-ico" aria-hidden="true">${ICON.calendar}</span>提出期日</h4>
            </div>
            <label class="hw-field hw-assign-due">
              <span class="hw-assign-due-label">期日</span>
              <input id="hw-due" type="date">
            </label>
            <div class="hw-assign-pane-head hw-assign-students-head">
              <h4>生徒</h4>
              <p id="hw-students-summary">クラスを選ぶと表示</p>
            </div>
            <div id="hw-class-students" class="hw-assign-students">
              <p class="hw-assign-students-empty">クラスを選ぶと生徒が出ます。</p>
            </div>
          </div>
        </div>
        <p id="hw-assign-status" class="hw-flow-status" hidden role="status" aria-live="polite"></p>
        <div class="hw-actions hw-actions-foot">
          <button type="button" class="hw-quiet hw-ico-btn" data-flow="back-build"><span class="hw-btn-ico" aria-hidden="true">${ICON.left}</span>戻る</button>
          <button type="button" class="hw-primary hw-ico-btn" id="hw-goto-confirm"><span class="hw-btn-ico" aria-hidden="true">${ICON.next}</span>最終確認へ</button>
        </div>
      </div>
    </section>

    <section class="hw-flow-panel" id="hw-flow-confirm" hidden>
      <div class="hw-flow-card">
        <div class="hw-section-head">
          <h3><span class="hw-sec-ico" aria-hidden="true">${ICON.send}</span>送信</h3>
          <p class="hw-section-hint">内容を確認してクラスに出します</p>
        </div>
        <div id="hw-confirm-summary" class="hw-confirm-summary"></div>
        <p id="hw-confirm-status" class="hw-flow-status" hidden role="status" aria-live="polite"></p>
        <div class="hw-actions hw-actions-foot">
          <button type="button" class="hw-quiet hw-ico-btn" data-flow="back-assign"><span class="hw-btn-ico" aria-hidden="true">${ICON.left}</span>戻る</button>
          <button type="button" class="hw-primary hw-ico-btn" id="hw-assign"><span class="hw-btn-ico" aria-hidden="true">${ICON.send}</span>クラスに出す</button>
        </div>
      </div>
    </section>
    <div class="hw-drawer" id="hw-drawer" hidden>
      <button type="button" class="hw-drawer-backdrop" data-drawer="cancel" aria-label="編集を閉じる"></button>
      <div class="hw-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="hw-drawer-title">
        <div class="hw-drawer-head">
          <div class="hw-drawer-head-copy">
            <p class="hw-drawer-kicker" id="hw-drawer-kicker">問題を編集</p>
            <h3 id="hw-drawer-title">編集・確認</h3>
            <p class="hw-drawer-sub" id="hw-drawer-sub">内容を確認して、宿題を完成させよう！</p>
          </div>
          <button type="button" class="hw-drawer-close" data-drawer="cancel" aria-label="閉じる">${ICON.close}</button>
        </div>
        <div class="hw-drawer-body" id="hw-drawer-body"></div>
        <footer class="hw-drawer-foot">
          <p class="hw-drawer-block" id="hw-drawer-block" hidden></p>
          <div class="hw-drawer-foot-row">
            <div class="hw-drawer-foot-sec">
              <button type="button" class="hw-drawer-skip" data-drawer="prev" id="hw-drawer-prev" aria-label="前の確認へ" title="前の確認へ">${ICON.left}</button>
              <button type="button" class="hw-drawer-skip" data-drawer="next" id="hw-drawer-skip" aria-label="次の確認へ" title="次の確認へ">${ICON.right}</button>
            </div>
            <div class="hw-drawer-foot-main">
              <button type="button" class="hw-drawer-confirm" data-drawer="confirm" id="hw-drawer-confirm"><span class="hw-drawer-confirm-ico" aria-hidden="true"></span><span class="hw-drawer-confirm-label">音声を確認</span></button>
            </div>
          </div>
        </footer>
      </div>
    </div>
    <dialog class="hw-dialog" id="hw-paste-dialog">
      <form method="dialog" class="hw-dialog-card" id="hw-paste-form">
        <h3>単語リストを貼る</h3>
        <p class="hw-help">1行に「日本語 - English」の形で貼ると、自動で分けて入ります。</p>
        <textarea id="hw-paste-text" rows="10" placeholder="さかな - Fish&#10;ねこ - Cat&#10;いぬ - Dog"></textarea>
        <div class="hw-actions hw-actions-foot">
          <button type="submit" class="hw-quiet" value="cancel">キャンセル</button>
          <button type="submit" class="hw-primary" value="apply" id="hw-paste-apply">入れる</button>
        </div>
      </form>
    </dialog>`;

  studio.querySelector("#hw-form").addEventListener("submit", (event) => event.preventDefault());
  const wordsEl = studio.querySelector("#hw-words");
  const sideStatus = studio.querySelector("#hw-side-status");
  const reviewEl = studio.querySelector("#hw-review");
  const listEl = studio.querySelector("#hw-list");
  const warningsEl = studio.querySelector("#hw-warnings");
  const tools = studio.querySelector("#hw-tools");
  const preview = studio.querySelector("#hw-preview");
  const voiceNote = studio.querySelector("#hw-voice");
  const voiceNoteText = studio.querySelector("#hw-voice-text");
  const voiceNoteNow = studio.querySelector("#hw-voice-now");
  const drawer = studio.querySelector("#hw-drawer");
  const drawerBody = studio.querySelector("#hw-drawer-body");
  const drawerPanel = studio.querySelector(".hw-drawer-panel");
  let voicePlaying = false;
  let voicePlayToken = 0;
  const previewLabel = "生徒画面";
  const lineFromButton = (el) => {
    const encoded = el?.closest("[data-line]")?.dataset.line;
    if (!encoded) return "";
    try {
      return decodeURIComponent(encoded);
    } catch {
      return "";
    }
  };
  const setVoiceWait = (message, kind = "", currentLines = []) => {
    const waiting = Boolean(message);
    const active = (Array.isArray(currentLines) ? currentLines : [currentLines])
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    preview.disabled = kind === "busy" || message.includes("つくり");
    const previewLabelEl = preview.querySelector(".hw-preview-label");
    const previewIco = preview.querySelector(".hw-preview-ico");
    const nextLabel = preview.disabled ? "音声をつくっています…" : previewLabel;
    if (previewLabelEl) previewLabelEl.textContent = nextLabel;
    else preview.textContent = nextLabel;
    if (previewIco) previewIco.hidden = preview.disabled;
    preview.setAttribute("aria-busy", preview.disabled ? "true" : "false");
    if (!voiceNote || !voiceNoteText) return;
    voiceNote.hidden = !waiting;
    voiceNote.classList.toggle("is-busy", kind === "busy" || (waiting && !kind));
    voiceNote.classList.toggle("is-ok", kind === "ok");
    voiceNote.classList.toggle("is-bad", kind === "bad");
    voiceNoteText.textContent = message || "";
    if (voiceNoteNow) {
      if (waiting && active.length) {
        voiceNoteNow.hidden = false;
        voiceNoteNow.textContent = active.length === 1
          ? `いまつくっている音声：${active[0]}`
          : `いまつくっている音声：${active.join(" ／ ")}`;
      } else {
        voiceNoteNow.hidden = true;
        voiceNoteNow.textContent = "";
      }
    }
  };
  const speakLinesFor = (question, draft) => {
    const lines = [];
    const push = (value) => {
      const text = String(value || "").trim();
      if (text) lines.push(text);
    };
    if (draft && question?.type === "sentence") {
      push(draft.promptJa);
      push(draft.sentence);
      return [...new Set(lines)];
    }
    if (draft && question?.type === "multipleChoice") {
      push(draft.promptJa);
      (draft.choices || []).forEach(push);
      push(draft.answer);
      return [...new Set(lines)];
    }
    if (draft && question?.type === "spelling") {
      push(draft.promptJa);
      push(draft.answer);
      return [...new Set(lines)];
    }
    if (draft && question?.type === "matching") {
      push(draft.promptJa);
      (draft.pairs || []).forEach((pair) => {
        push(pair.ja);
        push(pair.en);
      });
      return [...new Set(lines)];
    }
    push(question?.speak?.prompt?.text);
    push(question?.promptJa);
    push(question?.promptEn);
    (question?.choices || []).forEach(push);
    (question?.left || []).forEach((item) => push(item?.text));
    (question?.right || []).forEach((item) => push(item?.text));
    (question?.tiles || []).forEach(push);
    push(question?.display);
    if (Array.isArray(question?.answer)) push(question.answer.join(" "));
    else push(question?.answer);
    return [...new Set(lines)];
  };
  const voiceKeyFor = (question, draft) => speakLinesFor(question, draft).join("\n");
  const syncReviewedFromHeard = (question, draft) => {
    const lines = speakLinesFor(question, draft);
    if (!lines.length) return;
    if (allLinesHeard(lines) && lines.every((line) => hasHomeworkVoice(line))) {
      audioReviewed.set(question.id, voiceKeyFor(question, draft));
    }
  };
  const voiceStateFor = (question, draft) => {
    if (!state.audioReady) return "locked";
    const id = question?.id;
    if (voiceBusy.get(id) === "error") return "error";
    if (voiceBusy.get(id) === "busy") return "busy";
    const lines = speakLinesFor(question, draft);
    if (!lines.length) return "missing";
    if (!lines.every((line) => hasHomeworkVoice(line))) return "missing";
    syncReviewedFromHeard(question, draft);
    if (audioReviewed.get(id) === voiceKeyFor(question, draft)) return "ready";
    if (allLinesHeard(lines)) return "ready";
    return "stale";
  };
  const sentenceTotals = () => {
    const total = state.questions.length;
    const confirmed = state.questions.filter((question) => question.approved).length;
    return { total, confirmed, pending: total - confirmed };
  };
  const retryLinesPending = () => RETRY_LINES.some((line) => !heardLines.has(lineKey(line)));
  const firstPendingIndex = (from = 0) => {
    for (let index = from; index < state.questions.length; index += 1) {
      if (needsConfirm(state.questions[index])) return index;
    }
    for (let index = 0; index < from; index += 1) {
      if (needsConfirm(state.questions[index])) return index;
    }
    return -1;
  };
  const prevPendingIndex = (from = 0) => {
    for (let index = from - 1; index >= 0; index -= 1) {
      if (needsConfirm(state.questions[index])) return index;
    }
    for (let index = state.questions.length - 1; index > from; index -= 1) {
      if (needsConfirm(state.questions[index])) return index;
    }
    return -1;
  };
  let dragWord = null;
  const addWord = (pair = {}) => {
    const row = document.createElement("div");
    row.className = "hw-word";
    row.innerHTML = `
      <button type="button" class="hw-word-drag" draggable="true" aria-label="並べ替え" title="ドラッグで並べ替え">${ICON.grip}</button>
      <input type="text" data-ja maxlength="40" placeholder="日本語" aria-label="日本語" value="${escapeHtml(pair.ja || "")}" autocomplete="off" enterkeyhint="next">
      <input type="text" data-en maxlength="40" placeholder="English" aria-label="英語" value="${escapeHtml(pair.en || "")}" autocomplete="off" enterkeyhint="next">
      <button type="button" class="hw-word-x" aria-label="この単語を消す">${ICON.remove}</button>`;
    if (pair.sentenceJa) row.dataset.sentenceJa = pair.sentenceJa;
    if (pair.sentenceEn) row.dataset.sentenceEn = pair.sentenceEn;
    const jaInput = row.querySelector("[data-ja]");
    const enInput = row.querySelector("[data-en]");
    const dragHandle = row.querySelector(".hw-word-drag");
    dragHandle.addEventListener("dragstart", (event) => {
      dragWord = row;
      row.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "word");
    });
    dragHandle.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      wordsEl.querySelectorAll(".hw-word.is-drop").forEach((item) => item.classList.remove("is-drop"));
      dragWord = null;
      state.dirty = true;
      scheduleStudioResume();
    });
    row.addEventListener("dragover", (event) => {
      if (!dragWord || dragWord === row) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      wordsEl.querySelectorAll(".hw-word.is-drop").forEach((item) => item.classList.remove("is-drop"));
      row.classList.add("is-drop");
      row.dataset.dropBefore = before ? "1" : "0";
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("is-drop");
      delete row.dataset.dropBefore;
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!dragWord || dragWord === row) return;
      const before = row.dataset.dropBefore !== "0";
      row.classList.remove("is-drop");
      delete row.dataset.dropBefore;
      if (before) wordsEl.insertBefore(dragWord, row);
      else wordsEl.insertBefore(dragWord, row.nextSibling);
    });
    row.querySelector(".hw-word-x").onclick = () => {
      row.remove();
      if (!wordsEl.querySelector(".hw-word")) addWord();
    };
    const focusNext = (current) => {
      const rows = [...wordsEl.querySelectorAll(".hw-word")];
      const index = rows.indexOf(row);
      if (current === jaInput) {
        enInput.focus();
        return;
      }
      const next = rows[index + 1] || addWord();
      next.querySelector("[data-ja]").focus();
    };
    [jaInput, enInput].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        focusNext(input);
      });
      input.addEventListener("paste", (event) => {
        const text = event.clipboardData?.getData("text") || "";
        if (!/[\n\t]/.test(text) && !/ [-–—－] /.test(text)) return;
        const parsed = parseVocabulary(text);
        if (!parsed.pairs.length) return;
        event.preventDefault();
        const rows = [...wordsEl.querySelectorAll(".hw-word")];
        const start = Math.max(0, rows.indexOf(row));
        parsed.pairs.forEach((item, offset) => {
          const target = rows[start + offset] || addWord();
          target.querySelector("[data-ja]").value = item.ja;
          target.querySelector("[data-en]").value = item.en;
          target.dataset.sentenceJa = item.sentenceJa || "";
          target.dataset.sentenceEn = item.sentenceEn || "";
        });
      });
    });
    wordsEl.appendChild(row);
    return row;
  };
  const setWords = (pairs) => {
    wordsEl.replaceChildren();
    const list = pairs.length ? pairs : [{}, {}, {}, {}];
    list.forEach((pair) => addWord(pair));
  };
  const readWords = () => {
    const errors = [];
    const lines = [];
    const rowNumbers = [];
    [...wordsEl.querySelectorAll(".hw-word")].forEach((row, index) => {
      const ja = row.querySelector("[data-ja]").value.trim();
      const en = row.querySelector("[data-en]").value.trim();
      if (!ja && !en) return;
      if (!ja || !en) {
        errors.push(`${index + 1}行目は、日本語と英語の両方を入れてください。`);
        return;
      }
      const sentenceJa = row.dataset.sentenceJa || "";
      const sentenceEn = row.dataset.sentenceEn || "";
      lines.push(sentenceEn ? `${ja} - ${en} | ${sentenceJa} | ${sentenceEn}` : `${ja} - ${en}`);
      rowNumbers.push(index + 1);
    });
    const parsed = parseVocabulary(lines.join("\n"));
    const remapped = parsed.errors.map((message) => {
      const match = message.match(/^(\d+)行目/);
      if (!match) return message;
      const visual = rowNumbers[Number(match[1]) - 1];
      return visual ? message.replace(/^\d+行目/, `${visual}行目`) : message;
    });
    return { pairs: parsed.pairs, errors: [...errors, ...remapped], warnings: parsed.warnings };
  };
  setWords([]);
  studio.querySelector("#hw-add-word").onclick = () => {
    addWord().querySelector("[data-ja]").focus();
  };
  studio.querySelector("#hw-sample").onclick = () => {
    setWords(SAMPLE.map(([ja, en]) => ({ ja, en })));
  };
  const pasteDialog = studio.querySelector("#hw-paste-dialog");
  const pasteText = studio.querySelector("#hw-paste-text");
  studio.querySelector("#hw-paste").onclick = () => {
    pasteText.value = "";
    if (typeof pasteDialog.showModal === "function") pasteDialog.showModal();
    else pasteDialog.setAttribute("open", "");
    pasteText.focus();
  };
  studio.querySelector("#hw-paste-form").addEventListener("submit", (event) => {
    const action = event.submitter?.value || "cancel";
    if (action !== "apply") return;
    event.preventDefault();
    const parsed = parseVocabulary(pasteText.value);
    if (!parsed.pairs.length) {
      setStatus("bad", parsed.errors[0] || "貼れる単語がありません。");
      return;
    }
    setWords(parsed.pairs);
    state.dirty = true;
    if (parsed.warnings.length) setStatus("", parsed.warnings.join(" "));
    else setStatus("ok", `${parsed.pairs.length}語を入れました。`);
    pasteDialog.close?.();
    pasteDialog.removeAttribute("open");
  });
  studio.querySelector('[data-hw="library"]')?.addEventListener("click", async () => {
    if (state.editor) commitDrawerEdits({ quiet: true });
    if (state.questions.length && state.status !== "assigned") {
      setDraftHeadStatus("", "下書きを保存しています…");
      try {
        await persistDraftQuietly({ silent: true });
      } catch (error) {
        if (!window.confirm("下書きの保存に失敗しました。ライブラリに戻りますか？")) return;
      }
    }
    state.dirty = false;
    options.openLibrary?.({
      tab: "mine",
      notice: state.questions.length
        ? "下書きをマイライブラリに保存しました（非公開・未配信）"
        : "",
    });
  });
  const missingVoiceLines = () => {
    // Same set the generator builds — avoid false positives from draft-only variants.
    const lines = [...linesForQuestions(state.questions), ...RETRY_LINES];
    const seen = new Set();
    return lines.filter((line) => {
      const text = String(line || "").trim();
      if (!text) return false;
      const key = lineKey(text);
      if (seen.has(key)) return false;
      seen.add(key);
      return !hasHomeworkVoice(text);
    });
  };

  /** True only when the teacher UI itself would show a missing/error clip. */
  const hasVisibleMissingVoice = () => state.questions.some((question) => {
    const voice = voiceStateFor(question);
    return voice === "missing" || voice === "error";
  }) || RETRY_LINES.some((line) => !hasHomeworkVoice(line));

  const makeAllVoice = async ({ force = false } = {}) => {
    if (!state.questions.length) {
      setStatus("bad", "先に「宿題をつくる」で問題をつくってください。");
      return;
    }
    const button = studio.querySelector("#hw-make-voice");
    const lines = [...linesForQuestions(state.questions), ...RETRY_LINES];
    if (!lines.length) {
      setStatus("bad", "音声にする文がありません。");
      return;
    }
    const waitLine = (done, total, info = {}) => {
      if (info.reused || (info.making === 0 && done >= total)) {
        return `保存してあるLearnyの音声を使います（${info.cached || total}件）。生成済みの音声はいま確認できます。`;
      }
      if (info.making > 0) {
        const ready = info.cached || Math.max(0, total - info.making);
        return `新しい音声を ${info.makingDone || 0} / ${info.making} 作成中（ほか ${ready} は生成済み）`;
      }
      return `Learnyの音声をつくっています ${done} / ${total}。生成済みの音声はいま確認できます。`;
    };
    const actionButtons = studio.querySelector("#hw-tools .hw-toolbar-actions")
      || studio.querySelector("#hw-tools .hw-actions");
    const refreshVoiceUi = () => {
      paintQuestions();
      // Don't rebuild the open drawer while a clip is playing — that would cut off listening.
      if (state.editor && !voicePlaying) paintDrawer();
    };
    button.disabled = true;
    studio.querySelector("#hw-generate").disabled = true;
    if (actionButtons) actionButtons.hidden = true;
    tools.hidden = false;
    state.audioBuilding = true;
    // Progress lives only in the voice panel — avoid duplicating it in side status.
    setStatus("", "");
    setVoiceWait("保存済みの音声を読み込んでいます…", "busy");
    try {
      // Unlock cached clips first so teachers can listen while the rest generate.
      if (!force) {
        await hydrateHomeworkVoice(lines, options.db);
        acceptReusableRetryLines();
      } else {
        // Full remake includes retry lines — they need a fresh listen-check.
        RETRY_LINES.forEach((line) => {
          const key = lineKey(line);
          heardLines.delete(key);
          retryNeedsRecheck.add(key);
        });
      }
      state.audioReady = true;
      refreshVoiceUi();
      setVoiceWait("Learnyの音声をつくっています。生成済みの音声はいま確認できます。", "busy");
      const voice = await prepareHomeworkVoice(lines, {
        db: options.db,
        force,
        onProgress: (_done, _total, info = {}) => {
          if (!force) acceptReusableRetryLines();
          setVoiceWait(
            waitLine(_done, _total, info),
            info.reused ? "ok" : "busy",
            info.currentLines || (info.currentLine ? [info.currentLine] : []),
          );
          refreshVoiceUi();
        },
      });
      const made = voice.total - voice.failed.length;
      const newlyMade = Math.max(0, (voice.missingLines?.length || 0) - voice.failed.length);
      if (voice.failed.length || voice.syncFailed?.length || voice.syncMissing?.length) {
        state.audioReady = made > 0 && !(voice.syncFailed?.length || voice.syncMissing?.length);
        const shareFail = (voice.syncFailed?.length || 0) + (voice.syncMissing?.length || 0);
        const line = shareFail
          ? `音声の共有保存に問題があります（未共有 ${shareFail}件 / 共有 ${voice.shared || 0}件）。もう一度「確認完了」を押すか、問題を開いて作り直してください。`
          : `音声は ${made} / ${voice.total} できました（新規 ${newlyMade}・再利用 ${voice.cached}・共有保存 ${voice.shared || 0}）。足りない音声は問題を開いて1つずつ作り直してください。`;
        setVoiceWait("", "");
        setStatus("bad", line);
      } else {
        state.audioReady = true;
        state.filter = "needs";
        if (state.wordKey) state.wordFilters[state.wordKey] = "needs";
        // Keep already-approved questions marked as heard after voice hydrate.
        state.questions.forEach((question) => {
          if (!question.approved) return;
          const lines = speakLinesFor(question);
          markLinesHeard(lines);
          audioReviewed.set(question.id, voiceKeyFor(question));
        });
        if (!force) acceptReusableRetryLines();
        const line = `音声が表示されました（${voice.total}件・共有保存 ${voice.shared || 0}件）。`;
        setVoiceWait("", "");
        setStatus("ok", line);
      }
      refreshVoiceUi();
    } catch (error) {
      const line = `音声をつくれませんでした。${error.message || ""}`;
      setVoiceWait("", "");
      setStatus("bad", line);
      paintQuestions();
    } finally {
      state.audioBuilding = false;
      if (actionButtons) actionButtons.hidden = false;
      button.disabled = false;
      studio.querySelector("#hw-generate").disabled = false;
      refreshVoiceUi();
    }
  };

  studio.querySelector("#hw-generate").onclick = () => {
    const parsed = readWords();
    const countValue = studio.querySelector("#hw-count").value;
    const types = {};
    studio.querySelectorAll("[data-type]").forEach((input) => {
      types[input.dataset.type] = input.checked;
    });
    const result = generateHomework(parsed.pairs, {
      seed: Date.now(),
      level: studio.querySelector("#hw-level").value,
      count: countValue === "" ? "" : Number(countValue),
      hints: studio.querySelector("#hw-hints").checked,
      sentenceDirection: studio.querySelector("#hw-direction").value,
      shuffleWords: studio.querySelector("#hw-shuffle-words")?.checked !== false,
      types,
      warnings: parsed.warnings,
    });
    state.pairs = parsed.pairs;
    // Fresh packs always start unconfirmed, even if audio clips already exist from earlier homework.
    state.questions = result.questions.map((question) => ({
      ...question,
      approved: false,
      review: true,
    }));
    state.warnings = [...parsed.errors, ...result.warnings]
      .filter((warning) => !String(warning).includes("文をつくる問題は提案"))
      .filter((warning) => !/^最大\d+問です/.test(String(warning)));
    state.status = "draft";
    state.dirty = true;
    state.offerNext = false;
    state.audioReady = false;
    state.audioBuilding = false;
    state.filter = "all";
    state.wordKey = "";
    state.wordFilters = {};
    audioReviewed.clear();
    heardLines.clear();
    retryNeedsRecheck.clear();
    lineBusy.clear();
    voiceBusy.clear();
    if (state.editor) closeEditor(true);
    if (result.error) state.warnings.unshift(result.error);
    const countInput = studio.querySelector("#hw-count");
    const requestedCount = countValue === "" ? null : Number(countValue);
    if (
      countInput
      && result.questions.length
      && Number.isFinite(requestedCount)
      && requestedCount > result.questions.length
    ) {
      countInput.value = String(result.questions.length);
    }
    paintQuestions();
    if (result.error || !result.questions.length) {
      setStatus("bad", result.error || "問題がつくれませんでした。");
      return;
    }
    setStatus("ok", `${result.questions.length}問作成しました。`);
  };
  studio.querySelector("#hw-make-voice").onclick = () => makeAllVoice();
  studio.querySelector("#hw-preview").onclick = () => openPreview();
  studio.querySelector("#hw-draft").onclick = () => save("draft");
  studio.querySelector("#hw-assign").onclick = () => save("assigned");
  studio.querySelector("#hw-goto-assign")?.addEventListener("click", () => {
    if (!readyForAssign()) {
      setStatus("bad", assignBlockReason());
      return;
    }
    setFlowStep("assign");
  });
  studio.querySelector("#hw-goto-confirm")?.addEventListener("click", () => {
    if (!readyForAssign()) {
      setStatus("bad", assignBlockReason());
      return;
    }
    if (!selectedClasses().length) {
      setStatus("bad", "出すクラスを選んでください。");
      return;
    }
    setFlowStep("confirm");
  });
  studio.querySelectorAll("[data-flow='back-build']").forEach((btn) => {
    btn.addEventListener("click", () => setFlowStep("build"));
  });
  studio.querySelectorAll("[data-flow='back-assign']").forEach((btn) => {
    btn.addEventListener("click", () => setFlowStep("assign"));
  });
  studio.querySelector("#hw-flow-steps")?.addEventListener("click", (event) => {
    const stepBtn = event.target.closest("[data-flow-goto]");
    if (!stepBtn || stepBtn.disabled) return;
    const target = stepBtn.dataset.flowGoto;
    const need = stepBtn.dataset.flowNeed || "";
    if (need === "questions" && !state.questions.length) {
      setStatus("bad", "先に宿題をつくってください。");
      return;
    }
    if (need === "ready" && !readyForAssign()) {
      setStatus("bad", assignBlockReason());
      return;
    }
    if (target === "confirm" && !selectedClasses().length && state.flowStep !== "confirm") {
      setStatus("bad", "先にクラスを選んでください。");
      setFlowStep("assign");
      return;
    }
    setFlowStep(target === "build" ? "build" : target);
  });
  const clampCountInput = () => {
    const input = studio.querySelector("#hw-count");
    if (!input || input.value === "") return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = "";
      return;
    }
    const capped = Math.min(100, Math.max(1, Math.round(value)));
    if (String(capped) !== input.value) input.value = String(capped);
  };
  studio.querySelector("#hw-count")?.addEventListener("change", clampCountInput);
  studio.querySelector("#hw-count")?.addEventListener("blur", clampCountInput);

  studio.addEventListener("change", (event) => {
    if (!event.target.closest("[data-class], #hw-due")) return;
    paintFlow();
    const assignBtn = studio.querySelector("#hw-assign");
    if (assignBtn) {
      assignBtn.disabled = !readyForAssign() || !selectedClasses().length || state.status === "assigned";
    }
    if (event.target.matches("[data-class]")) {
      event.target.closest(".hw-class-card")?.classList.toggle("is-on", event.target.checked);
      paintClassStudents();
    }
    if (state.flowStep === "confirm") paintConfirmSummary();
  });
  studio.querySelectorAll("[data-filter]").forEach((button) => {
    button.onclick = () => {
      const nextFilter = button.dataset.filter || "all";
      state.filter = nextFilter;
      if (state.wordKey) state.wordFilters[state.wordKey] = nextFilter;
      paintQuestions();
    };
  });

  function confirmAllInCurrentWord() {
    if (state.status === "assigned") {
      setStatus("bad", "出した宿題は変更できません。");
      return;
    }
    if (!state.audioReady) {
      setStatus("bad", "先に「すべての文と問題を確認した。」を押して声を用意してください。");
      return;
    }
    if (!state.wordKey || state.wordKey === RETRY_WORD_KEY) return;

    const wordLabel = wordTabs().find((tab) => tab.key === state.wordKey)?.ja || state.wordKey;
    const scoped = questionsForWord(state.wordKey);
    let confirmed = 0;
    let skipped = 0;
    scoped.forEach(({ question, index }) => {
      if (question.approved) return;
      const lines = speakLinesFor(question);
      if (!lines.length || !lines.every((line) => hasHomeworkVoice(line))) {
        skipped += 1;
        return;
      }
      markLinesHeard(lines);
      audioReviewed.set(question.id, voiceKeyFor(question));
      state.questions[index] = { ...question, approved: true, review: false };
      confirmed += 1;
    });

    if (!confirmed && !skipped) {
      setStatus("ok", `「${wordLabel}」はすでに全て確認済みです。`);
      return;
    }
    if (!confirmed && skipped) {
      setStatus("bad", `「${wordLabel}」の音声がまだ揃っていません。先に音声を用意してください。`);
      return;
    }

    state.dirty = true;
    state.filter = "done";
    state.wordFilters[state.wordKey] = "done";
    if (state.editor && questionsForWord(state.wordKey).some(({ index }) => index === state.editor.index)) {
      paintDrawer();
    }
    paintQuestions();
    setStatus("ok", skipped
      ? `「${wordLabel}」を ${confirmed} 件確認済みにしました（音声未生成 ${skipped} 件は残しています）。`
      : `「${wordLabel}」の音声を全て確認済みにしました。`);
  }

  studio.querySelector("#hw-confirm-all-word")?.addEventListener("click", () => {
    confirmAllInCurrentWord();
  });
  reviewEl.addEventListener("click", (event) => {
    const wordBtn = event.target.closest("[data-word]");
    if (!wordBtn || !reviewEl.contains(wordBtn)) return;
    if (wordBtn.closest(".hw-filters")) return;
    const nextWord = wordBtn.dataset.word || "";
    if (!nextWord) return;
    state.wordKey = nextWord;
    state.filter = state.wordFilters[nextWord] || (state.audioReady ? "needs" : "all");
    paintQuestions();
  });

  const closeMenus = () => {
    studio.querySelectorAll(".hw-menu[open]").forEach((menu) => menu.removeAttribute("open"));
  };

  reviewEl.addEventListener("click", async (event) => {
    const filterBtn = event.target.closest("[data-filter]");
    if (filterBtn) return;
    const card = event.target.closest(".hw-card[data-index]");
    const button = event.target.closest("[data-act]");
    if (!card && !button) return;
    const index = Number((button || card)?.closest("[data-index]")?.dataset.index);
    if (!Number.isInteger(index)) return;
    const question = state.questions[index];
    if (!question) return;
    const act = button?.dataset.act;
    if (act === "edit" || (!act && card && !event.target.closest(".hw-menu"))) {
      closeMenus();
      openEditor(index);
      return;
    }
    if (!act) return;
    if (act === "remove") {
      if (state.editor?.index === index) closeEditor(true);
      state.questions.splice(index, 1);
      if (state.editor && state.editor.index > index) state.editor.index -= 1;
      state.dirty = true;
      paintQuestions();
      return;
    }
    if (act === "up" && index > 0) {
      [state.questions[index - 1], state.questions[index]] = [state.questions[index], state.questions[index - 1]];
      if (state.editor?.index === index) state.editor.index = index - 1;
      else if (state.editor?.index === index - 1) state.editor.index = index;
    }
    if (act === "down" && index < state.questions.length - 1) {
      [state.questions[index + 1], state.questions[index]] = [state.questions[index], state.questions[index + 1]];
      if (state.editor?.index === index) state.editor.index = index + 1;
      else if (state.editor?.index === index + 1) state.editor.index = index;
    }
    if (act === "regen") {
      const next = regenerateAt(state.questions, index, state.pairs, {
        seed: Date.now(),
        level: studio.querySelector("#hw-level").value,
        hints: studio.querySelector("#hw-hints").checked,
        sentenceDirection: studio.querySelector("#hw-direction").value,
      });
      if (next.error) {
        setStatus("bad", next.error);
        return;
      }
      const oldId = question.id;
      state.questions = next.questions;
      audioReviewed.delete(oldId);
      voiceBusy.delete(oldId);
      if (state.editor?.index === index) openEditor(index);
    }
    state.dirty = true;
    closeMenus();
    paintQuestions();
  });

  reviewEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".hw-card[data-index]");
    if (!card || event.target.closest(".hw-menu, button, summary")) return;
    event.preventDefault();
    const index = Number(card.dataset.index);
    if (!Number.isInteger(index) || !state.questions[index]) return;
    closeMenus();
    openEditor(index);
  });

  drawer.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-drawer]")?.dataset.drawer
      || event.target.closest("[data-act]")?.dataset.act;
    if (!action || !state.editor) return;
    const index = state.editor.index;
    const question = state.questions[index];
    if (!question) return;
    if (action === "cancel") {
      closeEditor();
      return;
    }
    if (action === "play-voice" || action === "play-line") {
      if (!state.audioReady) {
        setStatus("bad", "先に右の「すべての文と問題を確認した。」を押してください。");
        return;
      }
      const draft = readDraft();
      const lines = speakLinesFor(question, draft);
      // Prefer the exact text on the clicked row — index can drift vs draft/question order.
      const clicked = lineFromButton(event.target);
      const selected = action === "play-line"
        ? [clicked].filter(Boolean)
        : lines;
      if (!selected.length) {
        setStatus("bad", "きく文がありません。");
        return;
      }
      if (selected.some((line) => !hasHomeworkVoice(line))) {
        setStatus("bad", "先に音声を生成してください。");
        return;
      }
      stopPrompt();
      const myToken = ++voicePlayToken;
      voicePlaying = true;
      try {
        for (const line of selected) {
          if (myToken !== voicePlayToken) break;
          await playPrompt(line, /[\u3040-\u30ff\u4e00-\u9fff]/.test(line) ? "ja" : "en", { db: options.db });
          if (myToken === voicePlayToken) heardLines.add(lineKey(line));
        }
        if (myToken === voicePlayToken) syncReviewedFromHeard(question, draft);
      } finally {
        if (myToken === voicePlayToken) {
          voicePlaying = false;
          paintDrawer();
          paintQuestions();
        }
      }
      return;
    }
    if (action === "regen-line" || action === "regen-voice") {
      if (!state.audioReady) {
        setStatus("bad", "先に右の「すべての文と問題を確認した。」を押してください。");
        return;
      }
      const draft = readDraft();
      const allLines = speakLinesFor(question, draft);
      const clicked = lineFromButton(event.target);
      const targets = action === "regen-line"
        ? [clicked].filter(Boolean)
        : allLines;
      if (!targets.length) {
        setStatus("bad", "作り直す音声がありません。");
        return;
      }
      const targetKeys = targets.map(lineKey);
      if (targetKeys.some((key) => lineBusy.has(key))) return;
      stopPrompt();
      voicePlaying = false;
      targetKeys.forEach((key) => {
        lineBusy.add(key);
        heardLines.delete(key);
      });
      audioReviewed.delete(question.id);
      if (question.approved) {
        state.questions[index] = { ...question, approved: false, review: true };
      }
      paintDrawer();
      paintQuestions();
      const creating = targets.some((line) => !hasHomeworkVoice(line));
      setStatus("", targets.length === 1
        ? (creating ? `「${targets[0]}」を Generate しています…` : `「${targets[0]}」の音声を作り直しています…`)
        : (creating ? "音声を Generate しています…" : "音声を作り直しています…"));
      try {
        const voice = await prepareHomeworkVoice(targets, {
          db: options.db,
          force: true,
          onProgress: (_done, _total, info = {}) => {
            if (info.making > 0) {
              const now = (info.currentLines || []).filter(Boolean);
              const label = now.length
                ? `「${now.join("」「")}」`
                : (info.currentLine ? `「${info.currentLine}」` : "音声");
              setStatus("", creating
                ? `${label} を Generate しています ${info.makingDone || 0} / ${info.making}…`
                : `${label} を作り直しています ${info.makingDone || 0} / ${info.making}…`);
            }
          },
        });
        if (voice.failed.length) {
          setStatus("bad", targets.length === 1
            ? "この音声をつくれませんでした。もう一度試してください。"
            : "一部の音声をつくれませんでした。もう一度試してください。");
        } else {
          targetKeys.forEach((key) => heardLines.delete(key));
          audioReviewed.delete(question.id);
          setStatus("ok", targets.length === 1
            ? (creating
              ? "音声を Generate しました。きいて確認してください。"
              : "この音声を作り直しました。未確認なので、もう一度きいてください。")
            : (creating
              ? "音声を Generate しました。きいて確認してください。"
              : "音声を作り直しました。未確認の音声をもう一度きいてください。"));
        }
      } catch (error) {
        setStatus("bad", error.message || "音声の再生成に失敗しました。");
      } finally {
        targetKeys.forEach((key) => lineBusy.delete(key));
      }
      paintDrawer();
      paintQuestions();
      return;
    }
    if (action === "move-up" || action === "move-down") {
      const target = action === "move-up" ? index - 1 : index + 1;
      if (target < 0 || target >= state.questions.length) return;
      if ((state.editor.dirty || editorDirty()) && !window.confirm("未保存の編集があります。並べ替えてもよいですか？")) return;
      [state.questions[index], state.questions[target]] = [state.questions[target], state.questions[index]];
      state.editor = { ...state.editor, index: target, dirty: false };
      state.dirty = true;
      paintQuestions();
      paintDrawer();
      setStatus("ok", "順番を変えました。");
      return;
    }
    if (action === "remove") {
      if (!window.confirm("この問題をけしますか？")) return;
      const oldId = question.id;
      state.questions.splice(index, 1);
      audioReviewed.delete(oldId);
      voiceBusy.delete(oldId);
      state.dirty = true;
      if (!state.questions.length) {
        closeEditor(true);
        paintQuestions();
        setStatus("ok", "問題をけしました。");
      return;
    }
      const nextIndex = Math.min(index, state.questions.length - 1);
      openEditor(nextIndex);
      paintQuestions();
      setStatus("ok", "問題をけしました。");
      return;
    }
    if (action === "regen") {
      const next = regenerateAt(state.questions, index, state.pairs, {
        seed: Date.now(),
        level: studio.querySelector("#hw-level").value,
        hints: studio.querySelector("#hw-hints").checked,
        sentenceDirection: studio.querySelector("#hw-direction").value,
      });
      if (next.error) {
        setStatus("bad", next.error);
        return;
      }
      const oldId = question.id;
      state.questions = next.questions.map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, approved: false, review: true }
          : item
      ));
      audioReviewed.delete(oldId);
      voiceBusy.delete(oldId);
    state.dirty = true;
      openEditor(index);
    paintQuestions();
      setStatus("ok", "問題を作り直しました。");
      return;
    }
    if (action === "save") {
      window.clearTimeout(autoCommitTimer);
      const result = commitDrawerEdits({ quiet: false });
      if (result.error) return;
      if (result.removed) {
        closeEditor(true);
        paintQuestions();
        setStatus("ok", "この文を宿題からはずしました。");
        return;
      }
      setStatus("ok", "保存しました。");
      paintDrawer();
      return;
    }
    if (action === "confirm") {
      const confirmBtn = studio.querySelector("#hw-drawer-confirm");
      if (confirmBtn?.disabled) {
        paintDrawerChrome();
        return;
      }
      confirmBtn.disabled = true;
      window.clearTimeout(autoCommitTimer);
      // Flush any pending field edits before approving.
      commitDrawerEdits({ quiet: true });
      const result = commitDraft({ approve: true });
      if (result.error) {
        setStatus("bad", result.error);
        paintDrawer();
        return;
      }
      const nextPending = firstPendingIndex(index + 1);
      state.offerNext = false;
      setStatus("ok", "音声を確認しました。");
      drawerPanel?.classList.add("is-confirmed-flash");
      paintQuestions();
      paintDrawer();
      await new Promise((resolve) => setTimeout(resolve, 280));
      drawerPanel?.classList.remove("is-confirmed-flash");
      if (nextPending >= 0) {
        openEditor(nextPending);
        setStatus("ok", "次の音声をチェックしましょう。");
      } else if (retryLinesPending()) {
        closeEditor(true);
        state.wordKey = RETRY_WORD_KEY;
        paintQuestions();
        setStatus("ok", readyForAssign()
          ? "すべての音声を確認しました。「つぎへ：クラスと期日」へ進めます。"
          : `問題の確認は終わりました。「${RETRY_TAB_LABEL}」で作り直した声があればきいてください。`);
      } else {
        closeEditor(true);
        paintQuestions();
        setStatus("ok", readyForAssign()
          ? "すべての音声を確認しました。「つぎへ：クラスと期日」へ進めます。"
          : "すべての音声を確認しました。");
      }
      return;
    }
    if (action === "next" || action === "prev") {
      if ((state.editor.dirty || editorDirty()) && !window.confirm("編集中の内容を捨てて移動しますか？")) return;
      const target = action === "next"
        ? firstPendingIndex(index + 1)
        : prevPendingIndex(index);
      if (target < 0 || target === index) {
        setStatus("ok", action === "next" ? "次の確認待ちはありません。" : "前の確認待ちはありません。");
        state.offerNext = false;
        return;
      }
      state.offerNext = false;
      openEditor(target);
      setStatus("ok", action === "next" ? "次の問題をチェックしましょう。" : "前の問題をチェックしましょう。");
    }
  });

  let autoCommitTimer = 0;
  let autoPersistTimer = 0;
  let autoPersistSeq = 0;
  let resumeSnapTimer = 0;

  function creationComplete() {
    return Boolean(
      state.questions.length
      && state.questions.every((question) => question.approved)
      && state.audioReady
      && !missingVoiceLines().length
      && !retryLinesPending()
    );
  }

  function studioSnapshot() {
    return {
      id: state.draftId || "",
      status: state.status || "draft",
      title: studio.querySelector("#hw-title")?.value || "",
      level: studio.querySelector("#hw-level")?.value || "beginner",
      dueOn: studio.querySelector("#hw-due")?.value || "",
      vocab: state.pairs,
      questions: state.questions,
      // Resume snapshots never mark packs public — publish only on send / library toggle.
      published: false,
      libraryReady: creationComplete(),
      flowStep: state.flowStep || "build",
      classIds: selectedClasses(),
      settings: settings(),
      audioReady: Boolean(state.audioReady),
      heardLines: [...heardLines],
    };
  }

  function rememberStudio() {
    try {
      options.onStudioSnapshot?.(studioSnapshot());
    } catch {
      /* ignore */
    }
  }

  function scheduleStudioResume() {
    window.clearTimeout(resumeSnapTimer);
    resumeSnapTimer = window.setTimeout(rememberStudio, 250);
  }

  async function persistDraftQuietly({ silent = false } = {}) {
    if (state.status === "assigned") return;
    if (!state.questions.length) return;
    if (options.lab && !options.callFunction) return;
    const seq = ++autoPersistSeq;
    try {
      const result = await options.callFunction("saveHomeworkPack", {
        id: state.draftId || "",
        status: "draft",
        title: studio.querySelector("#hw-title").value,
        level: studio.querySelector("#hw-level").value,
        dueOn: studio.querySelector("#hw-due").value,
        classIds: [],
        vocab: state.pairs,
        questions: state.questions,
        settings: settings(),
        // Never publish from auto-save / leave — only explicit send may share.
        published: false,
        libraryReady: creationComplete(),
      });
      if (seq !== autoPersistSeq) return;
      if (result?.id) state.draftId = result.id;
      state.dirty = false;
      if (!silent) setStatus("ok", "自動保存しました。");
    } catch (error) {
      if (seq !== autoPersistSeq) return;
      console.warn("[homework-studio] auto-save failed", error);
      if (!silent) setStatus("bad", error.message || "自動保存に失敗しました。");
      throw error;
    }
  }

  function schedulePersist() {
    scheduleStudioResume();
    if (state.status === "assigned") return;
    window.clearTimeout(autoPersistTimer);
    autoPersistTimer = window.setTimeout(() => {
      persistDraftQuietly({ silent: true }).catch(() => { /* surfaced in persistDraftQuietly */ });
    }, 900);
  }

  function flushDraftForLeave() {
    if (state.editor) {
      try { commitDrawerEdits({ quiet: true }); } catch { /* ignore */ }
    }
    if (state.questions.length && state.status !== "assigned") {
      void persistDraftQuietly({ silent: true });
    }
  }

  // Leaving mid-create: keep work as an unpublished My Library draft (never discard / never publish).
  root._stopHomeworkStudio?.();
  const onStudioPageHide = () => { flushDraftForLeave(); };
  root._confirmLeave = () => {
    flushDraftForLeave();
    return true;
  };
  root._stopHomeworkStudio = () => {
    window.clearTimeout(autoPersistTimer);
    window.clearTimeout(resumeSnapTimer);
    window.removeEventListener("pagehide", onStudioPageHide);
    window.removeEventListener("beforeunload", onStudioPageHide);
    if (root._confirmLeave) root._confirmLeave = null;
    root._stopHomeworkStudio = null;
  };
  window.addEventListener("pagehide", onStudioPageHide);
  window.addEventListener("beforeunload", onStudioPageHide);

  function commitDrawerEdits({ quiet = true } = {}) {
    if (!state.editor || state.status === "assigned") return { error: "" };
    const before = state.questions[state.editor.index];
    if (!before) return { error: "" };
    const result = commitDraft({ approve: false });
    if (result.error) {
      // Keep typing mid-edit (empty choice, short spelling, etc.) without flashing errors.
      if (!quiet) setStatus("bad", result.error);
      state.editor.dirty = true;
      return result;
    }
    paintQuestions();
    schedulePersist();
    return result;
  }

  const syncDraftFromDrawer = () => {
    if (!state.editor) return;
    const question = state.questions[state.editor.index];
    if (!question) return;
    if (state.status === "assigned") return;
    const draft = readDraft();
    const key = voiceKeyFor(question, draft);
    if (audioReviewed.get(question.id) !== key) audioReviewed.delete(question.id);
    state.editor.dirty = true;
    state.dirty = true;
    if (question.type === "sentence") {
      state.editor.promptJa = draft.promptJa;
      state.editor.sentence = draft.sentence;
      state.editor.include = draft.include;
    }
    paintDrawerChrome();
    // Rebuild audio checklist so line labels/counts stay in sync while editing.
    const audioCard = drawerBody.querySelector("[data-status-audio]")?.closest(".hw-review-card");
    const voice = voiceStateFor(question, draft);
    const nextAudio = audioLinesHtml(question, draft, voice);
    if (audioCard) {
      const wrap = document.createElement("div");
      wrap.innerHTML = nextAudio.trim();
      const next = wrap.firstElementChild;
      if (next) audioCard.replaceWith(next);
    }
    const textDone = Boolean(question.approved) && !editorDirty();
    const textBadge = drawerBody.querySelector("[data-status-text]");
    if (textBadge) {
      textBadge.className = `hw-soft-badge ${textDone ? "is-ok" : "is-wait"}`;
      textBadge.textContent = textDone ? "完了" : "確認待ち";
    }
    window.clearTimeout(autoCommitTimer);
    autoCommitTimer = window.setTimeout(() => {
      commitDrawerEdits({ quiet: true });
    }, 350);
  };
  drawerBody.addEventListener("input", syncDraftFromDrawer);
  drawerBody.addEventListener("change", syncDraftFromDrawer);

  studio.addEventListener("click", async (event) => {
    const playRetry = event.target.closest("[data-act='play-retry']");
    const regenRetry = event.target.closest("[data-act='regen-retry']");
    if (!playRetry && !regenRetry) return;
    event.preventDefault();
    if (!state.audioReady) {
      setStatus("bad", "先に「すべての文と問題を確認した。」を押してください。");
      return;
    }
    const line = lineFromButton(playRetry || regenRetry)
      || RETRY_LINES[Number((playRetry || regenRetry).dataset.retryIndex)]
      || "";
    if (!line) return;
    const key = lineKey(line);

    if (regenRetry) {
      if (lineBusy.has(key)) return;
      stopPrompt();
      voicePlayToken += 1;
      voicePlaying = false;
      lineBusy.add(key);
      heardLines.delete(key);
      retryNeedsRecheck.add(key);
      paintQuestions();
      setStatus("", `「${line}」の音声を作り直しています…`);
      try {
        const voice = await prepareHomeworkVoice([line], { db: options.db, force: true });
        if (voice.failed.length) {
          setStatus("bad", "この音声をつくれませんでした。もう一度試してください。");
        } else {
          heardLines.delete(key);
          retryNeedsRecheck.add(key);
          setStatus("ok", "この音声を作り直しました。未確認なので、もう一度きいてください。");
        }
      } catch (error) {
        setStatus("bad", error.message || "音声の再生成に失敗しました。");
      } finally {
        lineBusy.delete(key);
      }
      paintQuestions();
      return;
    }

    if (!hasHomeworkVoice(line)) {
      setStatus("bad", "先に音声を生成してください。");
      return;
    }
    if (lineBusy.has(key)) return;
    stopPrompt();
    const myToken = ++voicePlayToken;
    voicePlaying = true;
    const wasBlocked = !readyForAssign();
    try {
      await playPrompt(line, /[\u3040-\u30ff\u4e00-\u9fff]/.test(line) ? "ja" : "en", { db: options.db });
      if (myToken === voicePlayToken) {
        heardLines.add(key);
        retryNeedsRecheck.delete(key);
      }
    } finally {
      if (myToken === voicePlayToken) {
        voicePlaying = false;
        paintQuestions();
        if (wasBlocked && readyForAssign()) {
          setStatus("ok", "音声の確認が終わりました。「つぎへ：クラスと期日」へ進めます。");
        }
      }
    }
  });

  function setDraftHeadStatus(kind, message) {
    const target = studio.querySelector("#hw-draft-status");
    if (!target) return;
    const text = message || "";
    target.hidden = !text;
    target.className = `hw-head-draft-status${kind ? ` is-${kind}` : ""}`;
    target.textContent = text;
  }

  function setStatus(kind, message) {
    const text = message || "";
    const flowStatus = state.flowStep === "assign"
      ? studio.querySelector("#hw-assign-status")
      : (state.flowStep === "confirm"
        ? studio.querySelector("#hw-confirm-status")
        : null);
    const target = flowStatus || sideStatus;
    if (!target) return;
    if (sideStatus && sideStatus !== target) {
      sideStatus.hidden = true;
      sideStatus.textContent = "";
    }
    studio.querySelectorAll(".hw-flow-status").forEach((el) => {
      if (el !== target) {
        el.hidden = true;
        el.textContent = "";
      }
    });
    target.hidden = !text;
    target.className = `${flowStatus ? "hw-flow-status" : "hw-side-status"}${kind ? ` is-${kind}` : ""}`;
    target.textContent = text;
  }

  function selectedClasses() {
    return [...studio.querySelectorAll("[data-class]:checked")].map((input) => input.value);
  }

  function settings() {
    const types = {};
    studio.querySelectorAll("[data-type]").forEach((input) => {
      types[input.dataset.type] = input.checked;
    });
    return {
      level: studio.querySelector("#hw-level").value,
      hints: studio.querySelector("#hw-hints").checked,
      sentenceDirection: studio.querySelector("#hw-direction").value,
      shuffleWords: studio.querySelector("#hw-shuffle-words")?.checked !== false,
      types,
    };
  }

  function readDraft() {
    const question = state.questions[state.editor.index];
    if (!question) return { promptJa: "", sentence: "", include: true };
    if (question.type === "sentence") {
      return {
        promptJa: drawerBody.querySelector('[data-field="promptJa"]')?.value.trim() || "",
        sentence: drawerBody.querySelector('[data-field="sentence"]')?.value.trim() || "",
        include: drawerBody.querySelector('[data-field="include"]')?.checked ?? true,
      };
    }
    if (question.type === "multipleChoice") {
      const choices = [...drawerBody.querySelectorAll('[data-field="choice"]')].map((input) => input.value.trim());
      const answerIndex = Number(drawerBody.querySelector('[data-field="answer"]:checked')?.value ?? 0);
      return {
        promptJa: drawerBody.querySelector('[data-field="promptJa"]')?.value.trim() || "",
        choices,
        answer: choices[answerIndex] || "",
        include: true,
      };
    }
    if (question.type === "spelling") {
      return {
        promptJa: drawerBody.querySelector('[data-field="promptJa"]')?.value.trim() || "",
        answer: drawerBody.querySelector('[data-field="answer"]')?.value.trim() || "",
        include: true,
      };
    }
    if (question.type === "matching") {
      return {
        promptJa: drawerBody.querySelector('[data-field="promptJa"]')?.value.trim() || "",
        pairs: [...drawerBody.querySelectorAll("[data-match-row]")].map((row) => ({
          leftId: row.dataset.leftId || "",
          rightId: row.dataset.rightId || "",
          ja: row.querySelector('[data-field="pair-ja"]')?.value.trim() || "",
          en: row.querySelector('[data-field="pair-en"]')?.value.trim() || "",
        })),
        include: true,
      };
    }
    return {
      promptJa: question.promptJa || "",
      sentence: question.display || "",
      include: true,
    };
  }

  function commitDraft({ approve }) {
    const index = state.editor.index;
    const question = state.questions[index];
    const draft = readDraft();
    if (question.type !== "sentence") {
      if (approve) {
        const voice = voiceStateFor(question, draft);
        if (voice === "locked") return { error: "先に右の「すべての文と問題を確認した。」を押してください。" };
        if (voice === "missing" || voice === "busy") {
          return { error: "先に音声を生成し、1つずつきいて確認してください。" };
        }
        if (voice === "error") return { error: "音声エラーがあります。作り直してから確認してください。" };
        if (voice === "stale") return { error: "すべての音声をきいてから「音声を確認」を押してください。" };
      }
      const updated = updateQuestion(question, draft);
      if (updated.error) return updated;
      const nextKey = voiceKeyFor(updated.question);
      const prevKey = voiceKeyFor(question);
      let nextApproved = Boolean(question.approved);
      if (approve) nextApproved = true;
      else if (nextKey !== prevKey) nextApproved = false;
      if (nextKey !== prevKey) audioReviewed.delete(question.id);
      if (approve) {
        markLinesHeard(speakLinesFor(updated.question));
        audioReviewed.set(updated.question.id, nextKey);
      }
      state.questions[index] = {
        ...updated.question,
        approved: nextApproved,
        review: !nextApproved,
      };
      state.editor.dirty = false;
      state.dirty = true;
      return { error: "" };
    }
    if (!draft.include) {
      if (approve) return { error: "宿題に入れる場合だけ確認できます。チェックを入れてください。" };
      audioReviewed.delete(question.id);
      voiceBusy.delete(question.id);
      state.questions.splice(index, 1);
      state.editor = null;
      state.dirty = true;
      return { error: "", removed: true };
    }
    if (approve) {
      const voice = voiceStateFor(question, draft);
      if (voice === "locked") return { error: "先に右の「すべての文と問題を確認した。」を押してください。" };
      if (voice === "missing" || voice === "busy") {
        return { error: "先にフレーズ音声を生成し、きいて確認してください。" };
      }
      if (voice === "error") return { error: "音声エラーがあります。作り直してから確認してください。" };
      if (voice === "stale") return { error: "音声をきいて確認してから「音声を確認」を押してください。" };
    }
    const textChanged = draft.promptJa !== (question.promptJa || "") || draft.sentence !== (question.display || "");
    let nextApproved = Boolean(question.approved);
    if (approve) nextApproved = true;
    else if (textChanged) nextApproved = false;
    const updated = updateSentence(question, {
      promptJa: draft.promptJa,
      sentence: draft.sentence,
      approved: nextApproved,
    }, state.pairs, Date.now());
    if (updated.error) return updated;
    if (textChanged) {
      audioReviewed.delete(question.id);
      if (question.approved) nextApproved = false;
    }
    if (approve) {
      markLinesHeard(speakLinesFor(updated.question));
      audioReviewed.set(question.id, voiceKeyFor(updated.question));
    }
    state.questions[index] = {
      ...updated.question,
      approved: nextApproved,
      review: !nextApproved,
    };
    state.editor = {
      ...state.editor,
      promptJa: draft.promptJa,
      sentence: draft.sentence,
      include: draft.include,
      dirty: false,
    };
    state.dirty = true;
    return { error: "" };
  }

  function openEditor(index) {
    const question = state.questions[index];
    if (!question) return;
    if (state.editor && state.editor.index !== index && (state.editor.dirty || editorDirty())
      && !window.confirm("編集中の内容を捨てますか？")) return;
    voicePlaying = false;
    stopPrompt();
    state.editor = {
      index,
      promptJa: question.promptJa || "",
      sentence: question.display || "",
      include: true,
      dirty: false,
    };
    drawer.hidden = false;
    document.body.classList.add("hw-drawer-open");
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    paintDrawer();
    paintQuestions();
    drawerBody.querySelector("textarea, input, button")?.focus();
  }

  function closeEditor(force = false) {
    if (!force && state.editor && (state.editor.dirty || editorDirty())
      && !window.confirm("編集中の内容を捨てますか？")) return;
    stopPrompt();
    voicePlaying = false;
    state.editor = null;
    state.offerNext = false;
    drawer.classList.remove("is-open");
    drawer.hidden = true;
    document.body.classList.remove("hw-drawer-open");
    drawerPanel?.classList.remove("is-confirmed-flash");
    paintQuestions();
  }

  function confirmBlockReason(question, draft, voice) {
    if (question.type === "sentence") {
      if (!draft.include) return "宿題に含める場合だけ確認できます。スイッチをオンにしてください。";
      if (!draft.promptJa || !draft.sentence) return "日本語と英語の文を入れてください。";
    }
    if (voice === "locked") return "内容を確認したら、右の「確認完了」を押してください。";
    // Only block this question while ITS clips are still missing — other questions may still be generating.
    if (voice === "missing" && state.audioBuilding) {
      return "この問題の残りの音声ができてから確認できます。生成済みのものはいま聞けます。";
    }
    if (voice === "missing") return "先に音声を生成してください。";
    if (voice === "busy") return "この問題の音声の生成が終わるまでお待ちください。";
    if (voice === "error") return "音声エラーがあります。作り直してから確認してください。";
    if (voice === "stale") {
      return "この問題の音声をすべてきいてから「音声を確認」を押してください。";
    }
    if (question.approved && voice === "ready") return "";
    return "";
  }

  function paintDrawerChrome() {
    if (!state.editor) return;
    const question = state.questions[state.editor.index];
    const draft = readDraft();
    const voice = voiceStateFor(question, draft);
    const confirmBtn = studio.querySelector("#hw-drawer-confirm");
    const skipBtn = studio.querySelector("#hw-drawer-skip");
    const prevBtn = studio.querySelector("#hw-drawer-prev");
    const blockEl = studio.querySelector("#hw-drawer-block");
    const alreadyDone = question.approved && voice === "ready" && !editorDirty();
    // Confirm is per-question: ready once this question's clips are heard, even while others generate.
    const canConfirm = voice === "ready"
      && !alreadyDone
      && (question.type !== "sentence" || (draft.include && Boolean(draft.promptJa && draft.sentence)));
    const blockReason = alreadyDone
      ? ""
      : (canConfirm ? "" : confirmBlockReason(question, draft, voice));
    const nextPending = firstPendingIndex(state.editor.index + 1);
    const prevPending = prevPendingIndex(state.editor.index);
    const hasNext = nextPending >= 0 && nextPending !== state.editor.index;
    const hasPrev = prevPending >= 0 && prevPending !== state.editor.index;
    confirmBtn.hidden = alreadyDone;
    confirmBtn.disabled = !canConfirm;
    const confirmLabel = confirmBtn.querySelector(".hw-drawer-confirm-label");
    if (confirmLabel) confirmLabel.textContent = "音声を確認";
    else confirmBtn.textContent = "音声を確認";
    if (skipBtn) {
      skipBtn.hidden = !hasNext;
      skipBtn.disabled = !hasNext;
    }
    if (prevBtn) {
      prevBtn.hidden = !hasPrev;
      prevBtn.disabled = !hasPrev;
    }
    if (blockEl) {
      blockEl.hidden = alreadyDone || canConfirm || !blockReason;
      blockEl.textContent = blockReason;
    }
    const atStart = state.editor.index <= 0;
    const atEnd = state.editor.index >= state.questions.length - 1;
    drawerBody.querySelector('[data-act="move-up"]')?.toggleAttribute("disabled", atStart);
    drawerBody.querySelector('[data-act="move-down"]')?.toggleAttribute("disabled", atEnd);
    studio.querySelector("#hw-drawer-kicker").textContent = `Q${state.editor.index + 1} · ${TYPE_LABEL[question.type] || "問題"}`;
    studio.querySelector("#hw-drawer-title").textContent = question.type === "sentence"
      ? "文と音声をチェック"
      : "問題と音声をチェック";
    studio.querySelector("#hw-drawer-sub").textContent = alreadyDone
      ? "この問題は確認済みです。次の確認へ進めます。"
      : (voice === "ready"
        ? "この問題の音声はそろっています。確認できます。"
        : (state.audioBuilding
          ? "生成済みの音声はいま確認できます。まだのものは準備中です。"
          : (state.audioReady
            ? "内容を見直して、使っている音声をすべてきいてから確認しましょう。"
            : "内容を編集できます。確認できたら閉じて「確認完了」を押してください。")));
  }

  function audioLinesHtml(question, draft, voice) {
    const lines = speakLinesFor(question, draft);
    const audioLocked = !state.audioReady || voice === "locked";
    const heardCount = lines.filter((line) => heardLines.has(lineKey(line))).length;
    const readyCount = lines.filter((line) => hasHomeworkVoice(line)).length;
    if (audioLocked) {
      return `
        <section class="hw-review-card">
          <div class="hw-review-card-head">
            <span class="hw-review-ico is-audio" aria-hidden="true">${ICON.speaker}</span>
            <h4>音声を確認</h4>
            <span class="hw-soft-badge is-wait" data-status-audio="">未作成</span>
          </div>
          <p class="hw-help">問題文や選択肢はここで編集できます（自動保存）。内容がよければ閉じて「確認完了」を押してください。</p>
        </section>`;
    }
    return `
      <section class="hw-review-card">
        <div class="hw-review-card-head">
          <span class="hw-review-ico is-audio" aria-hidden="true">${ICON.speaker}</span>
          <h4>音声を確認</h4>
          ${state.audioBuilding && readyCount < lines.length
            ? `<span class="hw-soft-badge is-wait" data-status-audio="">準備中 ${readyCount}/${lines.length}</span>`
            : voiceBadge(voice).replace("class=\"hw-voice-badge", "data-status-audio=\"\" class=\"hw-voice-badge")}
        </div>
        <p class="hw-help">${state.audioBuilding && readyCount < lines.length
          ? `生成済みの音声（${readyCount}/${lines.length}）はいま確認できます。残りができたら続けてきいてください。`
          : `この問題で使う音声です。1つずつきいて確認してください。壊れているものだけ作り直せます。（${heardCount} / ${lines.length}）`}</p>
        <div class="hw-audio-lines" role="list">
          ${lines.map((line) => {
            const key = lineKey(line);
            const heard = heardLines.has(key);
            const ready = hasHomeworkVoice(line);
            const making = state.audioBuilding && !ready;
            const busy = lineBusy.has(key) || voice === "busy" || making;
            const encoded = encodeURIComponent(line);
            const unconfirmed = ready && !heard && !busy && !making;
            const needsGenerate = !ready && !busy && !making;
            const cap = lineBusy.has(key)
              ? (ready ? "作り直し中…" : "Generate…")
              : making ? "生成中…"
                : needsGenerate ? "Generate"
                  : heard ? "確認済み"
                    : "未確認";
            return `<div class="hw-audio-line${heard ? " is-heard" : ""}${unconfirmed ? " is-unconfirmed" : ""}${needsGenerate ? " is-generate" : ""}${!ready ? " is-missing" : ""}${busy ? " is-busy" : ""}" role="listitem" data-line="${encoded}">
              <button type="button" class="hw-audio-line-play" data-act="play-line" data-line="${encoded}" aria-label="${escapeHtml(line)} をきく" ${!ready || lineBusy.has(key) ? "disabled" : ""}>
                ${ICON.play}
              </button>
              <div class="hw-audio-line-copy">
                <p class="hw-audio-line-text">${escapeHtml(line)}</p>
                <p class="hw-audio-line-cap">${cap}</p>
              </div>
              <button type="button" class="hw-audio-line-regen${needsGenerate ? " is-generate" : ""}" data-act="regen-line" data-line="${encoded}" aria-label="${needsGenerate ? `${escapeHtml(line)} の音声を Generate` : `${escapeHtml(line)} の音声を作り直す`}" title="${needsGenerate ? "Generate" : "この音声だけ作り直す"}" ${lineBusy.has(key) || state.audioBuilding ? "disabled" : ""}>${needsGenerate ? "Generate" : ICON.regen}</button>
              <span class="hw-audio-line-mark" aria-hidden="true">${heard && ready && !lineBusy.has(key) ? "✓" : unconfirmed ? "!" : ""}</span>
            </div>`;
          }).join("")}
        </div>
      </section>`;
  }

  function questionEditHtml(question) {
    const index = state.editor.index;
    const tools = `
      <div class="hw-edit-tools" role="toolbar" aria-label="問題の操作">
        <button type="button" class="hw-drawer-ghost" data-act="move-up" ${index <= 0 ? "disabled" : ""}>上へ</button>
        <button type="button" class="hw-drawer-ghost" data-act="move-down" ${index >= state.questions.length - 1 ? "disabled" : ""}>下へ</button>
        <button type="button" class="hw-drawer-ghost hw-drawer-icon-btn" data-act="regen" aria-label="最初から" title="最初から">${ICON.repeat}</button>
        <button type="button" class="hw-drawer-danger" data-act="remove">けす</button>
      </div>`;
    if (question.type === "multipleChoice") {
      const choices = question.choices || [];
      return `
        ${tools}
        <section class="hw-review-card">
          <div class="hw-review-card-head">
            <span class="hw-review-ico" aria-hidden="true">${ICON.pencil}</span>
            <h4>4択を編集</h4>
          </div>
          <label class="hw-soft-field">問題文（日本語）
            <textarea data-field="promptJa" rows="2" spellcheck="false">${escapeHtml(question.promptJa || "")}</textarea>
          </label>
          <div class="hw-choice-edit">
            ${(choices.length ? choices : ["", "", "", ""]).map((choice, choiceIndex) => `
              <label class="hw-choice-edit-row">
                <input type="radio" name="hw-answer" data-field="answer" value="${choiceIndex}" ${normChoice(choice) === normChoice(question.answer) || (!question.answer && choiceIndex === 0) ? "checked" : ""} aria-label="正解${choiceIndex + 1}">
                <input type="text" data-field="choice" maxlength="40" value="${escapeHtml(choice)}" placeholder="選択肢 ${choiceIndex + 1}" aria-label="選択肢 ${choiceIndex + 1}">
              </label>`).join("")}
          </div>
          <p class="hw-help">正解の左○を選んでください。変更は自動保存されます。</p>
        </section>`;
    }
    if (question.type === "spelling") {
      return `
        ${tools}
        <section class="hw-review-card">
          <div class="hw-review-card-head">
            <span class="hw-review-ico" aria-hidden="true">${ICON.pencil}</span>
            <h4>スペリングを編集</h4>
          </div>
          <label class="hw-soft-field">問題文（日本語）
            <textarea data-field="promptJa" rows="2" spellcheck="false">${escapeHtml(question.promptJa || "")}</textarea>
          </label>
          <label class="hw-soft-field">正解の英語
            <input type="text" data-field="answer" maxlength="40" value="${escapeHtml(question.display || question.answer || "")}" spellcheck="false">
          </label>
        </section>`;
    }
    if (question.type === "matching") {
      const correctPairs = (question.pairs || []).map((pair, pairIndex) => ({
        leftId: pair.leftId,
        rightId: pair.rightId,
        ja: question.left?.find((item) => item.id === pair.leftId)?.text || "",
        en: question.right?.find((item) => item.id === pair.rightId)?.text || "",
        index: pairIndex,
      }));
      return `
        ${tools}
        <section class="hw-review-card">
          <div class="hw-review-card-head">
            <span class="hw-review-ico" aria-hidden="true">${ICON.pencil}</span>
            <h4>線つなぎを編集</h4>
          </div>
          <label class="hw-soft-field">問題文（日本語）
            <textarea data-field="promptJa" rows="2" spellcheck="false">${escapeHtml(question.promptJa || "")}</textarea>
          </label>
          <div class="hw-match-guide">
            <strong>正しい組み合わせ</strong>
            <p>ここは正解のペアです。生徒の画面では左右がバラバラに並びます。</p>
          </div>
          <div class="hw-match-edit">
            ${correctPairs.map((pair, pairIndex) => `
              <div class="hw-match-edit-row" data-match-row data-left-id="${escapeHtml(pair.leftId || "")}" data-right-id="${escapeHtml(pair.rightId || "")}">
                <span class="hw-match-num">${pairIndex + 1}</span>
                <input type="text" data-field="pair-ja" maxlength="40" value="${escapeHtml(pair.ja)}" placeholder="日本語" aria-label="正解ペア ${pairIndex + 1} の日本語">
                <span class="hw-match-eq" aria-hidden="true">=</span>
                <input type="text" data-field="pair-en" maxlength="40" value="${escapeHtml(pair.en)}" placeholder="English" aria-label="正解ペア ${pairIndex + 1} の英語">
              </div>`).join("")}
          </div>
          <p class="hw-help">入力すると自動保存されます。生徒画面では左右の並びがシャッフルされます。</p>
        </section>`;
    }
    return `${tools}<p class="hw-help">この問題タイプはプレビューのみです。</p>`;
  }

  function normChoice(value) {
    return String(value || "").trim().toLowerCase();
  }

  function sectionStatus(done, pendingLabel, doneLabel, attr = "") {
    return done
      ? `<span class="hw-soft-badge is-ok" ${attr}>${doneLabel}</span>`
      : `<span class="hw-soft-badge is-wait" ${attr}>${pendingLabel}</span>`;
  }

  function paintDrawer() {
    if (!state.editor) return;
    const question = state.questions[state.editor.index];
    const audioFirst = Boolean(state.audioReady);
    if (question.type === "sentence") {
      const draft = state.editor;
      const voice = voiceStateFor(question, draft);
      const textDone = Boolean(question.approved) && !editorDirty();
      const toolsHtml = `
        <div class="hw-edit-tools" role="toolbar" aria-label="問題の操作">
          <button type="button" class="hw-drawer-ghost" data-act="move-up" ${state.editor.index <= 0 ? "disabled" : ""}>上へ</button>
          <button type="button" class="hw-drawer-ghost" data-act="move-down" ${state.editor.index >= state.questions.length - 1 ? "disabled" : ""}>下へ</button>
          <button type="button" class="hw-drawer-ghost hw-drawer-icon-btn" data-act="regen" aria-label="最初から" title="最初から">${ICON.repeat}</button>
          <button type="button" class="hw-drawer-danger" data-act="remove">けす</button>
        </div>`;
      const textHtml = `
        <section class="hw-review-card">
          <div class="hw-review-card-head">
            <span class="hw-review-ico" aria-hidden="true">${ICON.pencil}</span>
            <h4>文章を確認</h4>
            ${sectionStatus(textDone, "確認待ち", "完了", 'data-status-text=""')}
          </div>
          <label class="hw-soft-field">日本語
            <textarea data-field="promptJa" rows="3" spellcheck="false">${escapeHtml(draft.promptJa)}</textarea>
          </label>
          <label class="hw-soft-field">英語
            <textarea data-field="sentence" rows="3" spellcheck="false">${escapeHtml(draft.sentence)}</textarea>
          </label>
        </section>`;
      const includeHtml = `
        <label class="hw-soft-switch">
          <span class="hw-soft-switch-copy">
            <strong>この文を宿題に含める</strong>
            <small>オフにすると出題されません</small>
          </span>
          <input data-field="include" type="checkbox" role="switch" ${draft.include ? "checked" : ""} aria-label="この文を宿題に含める">
        </label>`;
      const audioHtml = audioLinesHtml(question, draft, voice);
      drawerBody.innerHTML = audioFirst
        ? `${audioHtml}${toolsHtml}${textHtml}${includeHtml}`
        : `${toolsHtml}${textHtml}${audioHtml}${includeHtml}`;
    } else {
      // Build fields first so readDraft() matches the audio list order/labels.
      drawerBody.innerHTML = questionEditHtml(question);
      const draft = readDraft();
      const voice = voiceStateFor(question, draft);
      const audioHtml = audioLinesHtml(question, draft, voice);
      if (audioFirst) drawerBody.insertAdjacentHTML("afterbegin", audioHtml);
      else drawerBody.insertAdjacentHTML("beforeend", audioHtml);
    }
    paintDrawerChrome();
  }

  function wordTabs({ usedOnly = false } = {}) {
    const tabs = [];
    const seen = new Set();
    const addTab = (pair = {}) => {
      const key = vocabNorm(pair.en || pair.key);
      if (!key || seen.has(key)) return;
      seen.add(key);
      tabs.push({
        key,
        ja: String(pair.ja || pair.en || pair.key || key).trim() || key,
        en: String(pair.en || pair.key || key).trim() || key,
      });
    };
    (state.pairs || []).forEach(addTab);
    try {
      readWords().pairs.forEach(addTab);
    } catch (_) {
      /* form may be empty while painting */
    }
    for (const question of state.questions) {
      for (const key of questionVocabKeys(question)) {
        if (seen.has(key)) continue;
        let ja = key;
        if (question.type === "matching") {
          const right = (question.right || []).find((item) => vocabNorm(item.text) === key);
          const pair = (question.pairs || []).find((item) => item.rightId === right?.id);
          ja = (question.left || []).find((item) => item.id === pair?.leftId)?.text || key;
        } else {
          ja = String(question.promptJa || "")
            .replace(/は英語で[？?]?$/, "")
            .replace(/[。．\s]+$/g, "")
            .trim() || key;
        }
        addTab({ key, en: key, ja });
      }
    }
    if (usedOnly && state.questions.length) {
      return tabs.filter((tab) => state.questions.some((question) => questionBelongsToWord(question, tab.key)));
    }
    return tabs;
  }

  function questionsForWord(wordKey = state.wordKey) {
    return state.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => questionBelongsToWord(question, wordKey));
  }

  function readyForAssign() {
    if (!state.questions.length || state.status === "assigned") return false;
    if (state.questions.some((question) => !question.approved)) return false;
    if (!state.audioReady) return false;
    if (hasVisibleMissingVoice()) return false;
    if (retryLinesPending()) return false;
    return true;
  }

  function assignBlockReason() {
    if (!state.questions.length) return "先に宿題をつくってください。";
    if (state.status === "assigned") return "出した宿題は変更できません。";
    if (state.questions.some((question) => !question.approved)) {
      return "すべての問題の音声を確認してから次へ進んでください。";
    }
    if (!state.audioReady) {
      return "内容を確認したら「確認完了」を押して声を用意してください。";
    }
    if (hasVisibleMissingVoice()) {
      return "まだ音声ができていない問題があります。問題を開いて、足りない音声だけ作り直してください。";
    }
    if (retryLinesPending()) {
      return `「${RETRY_TAB_LABEL}」もすべてきいて確認してください。`;
    }
    return "まだ次へ進めません。";
  }

  function setFlowStep(step) {
    if (!["build", "assign", "confirm"].includes(step)) step = "build";
    if ((step === "assign" || step === "confirm") && !readyForAssign()) {
      setStatus("bad", assignBlockReason());
      step = "build";
    }
    if (step === "confirm" && !selectedClasses().length) {
      setStatus("bad", "出すクラスを選んでください。");
      step = "assign";
    }
    state.flowStep = step;
    if (step !== "build" && state.editor) closeEditor(true);
    paintFlow();
    paintQuestions();
    if (step === "assign") paintClassStudents();
    if (step === "confirm") paintConfirmSummary();
    if (step === "assign" || step === "confirm") {
      studio.querySelector(step === "assign" ? "#hw-flow-assign" : "#hw-flow-confirm")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    scheduleStudioResume();
  }

  function paintFlow() {
    const buildLayout = studio.querySelector("#hw-build-layout");
    const assignPanel = studio.querySelector("#hw-flow-assign");
    const confirmPanel = studio.querySelector("#hw-flow-confirm");
    const step = state.flowStep || "build";
    if (buildLayout) buildLayout.hidden = step !== "build";
    if (assignPanel) assignPanel.hidden = step !== "assign";
    if (confirmPanel) confirmPanel.hidden = step !== "confirm";

    const hasQuestions = state.questions.length > 0;
    const ready = readyForAssign();
    const sent = state.status === "assigned";
    // Keep prior steps ticked even after send (readyForAssign becomes false when assigned).
    const pastCreate = hasQuestions || step === "assign" || step === "confirm" || sent;
    const pastReview = Boolean(
      (ready || step === "assign" || step === "confirm" || sent)
      && hasQuestions
      && state.audioReady
    );
    const pastAssign = step === "confirm" || sent;
    const activeKey = step === "build"
      ? (hasQuestions && state.audioReady ? "review" : "build")
      : step;

    studio.querySelectorAll(".hw-flow-step").forEach((btn, index) => {
      const goto = btn.dataset.flowGoto;
      const need = btn.dataset.flowNeed || "";
      const isReviewChip = index === 1;
      const current = !sent && (
        activeKey === "build" && index === 0
        || activeKey === "review" && isReviewChip
        || activeKey === goto
      );
      const done = (index === 0 && pastCreate)
        || (index === 1 && pastReview)
        || (index === 2 && pastAssign)
        || (index === 3 && sent);
      const locked = !sent && (
        (need === "questions" && !hasQuestions)
        || (need === "ready" && !ready && !pastReview)
        || (goto === "confirm" && !selectedClasses().length && step !== "confirm")
      );
      btn.classList.toggle("is-current", Boolean(current));
      btn.classList.toggle("is-done", Boolean(done) && !current);
      btn.classList.toggle("is-locked", Boolean(locked) && !current && !done);
      btn.setAttribute("aria-current", current ? "step" : "false");
      btn.disabled = Boolean(locked) && !current;
      const mark = btn.querySelector(".hw-flow-mark");
      if (mark) mark.innerHTML = done && !current ? ICON.check : "";
    });
  }

  function paintConfirmSummary() {
    const host = studio.querySelector("#hw-confirm-summary");
    if (!host) return;
    const title = studio.querySelector("#hw-title")?.value || "きょうのしゅくだい";
    const level = studio.querySelector("#hw-level")?.value || "beginner";
    const levelLabel = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" }[level] || level;
    const due = studio.querySelector("#hw-due")?.value || "";
    const classIds = selectedClasses();
    const classNames = classIds.map((id) => {
      const found = state.classes.find((item) => item.id === id);
      if (found) return found.title;
      const input = [...studio.querySelectorAll("[data-class]")].find((el) => el.value === id);
      return input?.closest("label")?.textContent?.trim() || id;
    });
    const { total, confirmed } = sentenceTotals();
    const words = state.pairs.length || readWords().pairs.length;
    const sharePublic = studio.querySelector("#hw-published")?.checked !== false;
    host.innerHTML = `
      <dl class="hw-summary-list">
        <div><dt>タイトル</dt><dd>${escapeHtml(title)}</dd></div>
        <div><dt>レベル</dt><dd>${escapeHtml(levelLabel)}</dd></div>
        <div><dt>単語</dt><dd>${words}語</dd></div>
        <div><dt>問題</dt><dd>${confirmed} / ${total}問（音声確認済み）</dd></div>
        <div><dt>クラス</dt><dd>${classNames.length ? classNames.map((name) => escapeHtml(name)).join("、") : "未選択"}</dd></div>
        <div><dt>提出期日</dt><dd>${due ? escapeHtml(due) : "なし"}</dd></div>
        <div><dt>公開</dt><dd>${sharePublic ? "他の先生にも公開" : "非公開（自分だけ）"}</dd></div>
      </dl>`;
  }

  function paintQuestions() {
    scheduleStudioResume();
      state.warnings = state.warnings.filter((warning) => !warning.includes("文をつくる問題は提案"));
    warningsEl.innerHTML = state.warnings.map((warning) => `<p class="hw-note">${escapeHtml(warning)}</p>`).join("");
    tools.hidden = !state.questions.length;
    const empty = studio.querySelector("#hw-empty");
    if (empty) empty.hidden = state.questions.length > 0;
    reviewEl.hidden = !state.questions.length;
    const draftBtn = studio.querySelector("#hw-draft");
    if (draftBtn) draftBtn.disabled = !state.questions.length || state.status === "assigned";
    const assignBtn = studio.querySelector("#hw-assign");
    if (assignBtn) {
      assignBtn.disabled = !readyForAssign() || !selectedClasses().length || state.status === "assigned";
    }
    const gotoAssign = studio.querySelector("#hw-goto-assign");
    if (gotoAssign) {
      const showNext = readyForAssign() && state.status !== "assigned";
      gotoAssign.hidden = !showNext;
      gotoAssign.disabled = !showNext;
    }
    const toolbarLead = studio.querySelector("#hw-toolbar-lead");
    if (toolbarLead) {
      if (!state.audioReady) {
        toolbarLead.textContent = "問題文と答えを確認してください。";
      } else if (!readyForAssign() && retryLinesPending()) {
        toolbarLead.textContent = `「${RETRY_TAB_LABEL}」もきいて確認してください。`;
      } else {
        toolbarLead.textContent = "音声を確認してください。";
      }
    }
    const makeVoiceBtn = studio.querySelector("#hw-make-voice");
    if (makeVoiceBtn) {
      // Only 「確認完了」 before first voice pass. Missing/broken clips are remade one-by-one in the drawer.
      const showMakeVoice = state.questions.length > 0
        && state.status !== "assigned"
        && !state.audioReady
        && !readyForAssign();
      makeVoiceBtn.hidden = !showMakeVoice;
      makeVoiceBtn.disabled = makeVoiceBtn.hidden || state.audioBuilding;
      const toolbarActions = studio.querySelector("#hw-toolbar-actions");
      // Content check: 生徒画面 | 確認完了. Audio check: 配信設定へ | 生徒画面.
      toolbarActions?.classList.toggle("is-audio-check", Boolean(state.audioReady && !showMakeVoice));
      const label = makeVoiceBtn.querySelector(".hw-make-voice-label");
      const ico = makeVoiceBtn.querySelector("[data-make-voice-ico]");
      const help = makeVoiceBtn.querySelector(".hw-make-voice-help");
      if (label) label.textContent = "確認完了";
      if (ico) ico.innerHTML = ICON.checkCircle;
      if (help) {
        help.hidden = true;
        help.setAttribute("aria-hidden", "true");
      }
      makeVoiceBtn.title = "";
      makeVoiceBtn.classList.toggle("is-needed", !state.audioReady);
      makeVoiceBtn.classList.remove("is-retry-voice");
    }
    paintFlow();

    const tabs = wordTabs({ usedOnly: true });
    const onRetryTab = state.wordKey === RETRY_WORD_KEY;
    const retryTabAvailable = state.audioReady && state.questions.length > 0 && state.status !== "assigned";
    if (onRetryTab && !retryTabAvailable) {
      state.wordKey = tabs[0]?.key || "";
    } else if (!onRetryTab && !tabs.some((tab) => tab.key === state.wordKey)) {
      state.wordKey = tabs[0]?.key || "";
    }
    if (state.wordKey && state.wordKey !== RETRY_WORD_KEY) {
      const fallbackFilter = state.audioReady ? "needs" : "all";
      state.filter = state.wordFilters[state.wordKey] || state.filter || fallbackFilter;
      state.wordFilters[state.wordKey] = state.filter;
    }

    const wordBarEl = studio.querySelector("#hw-word-bar");
    const wordTabsEl = studio.querySelector("#hw-word-tabs");
    const wordFilterLabel = studio.querySelector("#hw-word-filter-label");
    const wordSubfilters = studio.querySelector(".hw-word-subfilters");
    const retryPending = retryTabAvailable && retryLinesPending();
    if (wordBarEl && wordTabsEl) {
      const showWords = state.questions.length > 0 && tabs.length > 0;
      wordBarEl.hidden = !showWords;
      const wordButtons = showWords
        ? tabs.map((tab) => {
          // Show pending dots in both text-confirm and audio-confirm phases.
          const pendingHere = state.questions.some((question) => (
            questionBelongsToWord(question, tab.key) && needsConfirm(question)
          ));
          const confirmedHere = !pendingHere
            && state.questions.some((question) => questionBelongsToWord(question, tab.key));
          const on = state.wordKey === tab.key;
          const statusIco = confirmedHere
            ? `<span class="hw-word-status" aria-hidden="true">${ICON.check}</span>`
            : "";
          const pendingDot = pendingHere
            ? `<span class="hw-word-dot" aria-hidden="true"></span>`
            : "";
          return `<button type="button" class="hw-word-tab${on ? " is-current" : ""}${pendingHere ? " has-pending" : ""}${confirmedHere ? " is-confirmed" : ""}" data-word="${escapeHtml(tab.key)}" role="tab" aria-selected="${on ? "true" : "false"}" title="${escapeHtml(tab.en)}${pendingHere ? "（未確認あり）" : confirmedHere ? "（確認済）" : ""}">${escapeHtml(tab.ja)}${statusIco}${pendingDot}</button>`;
        }).join("")
        : "";
      const retryButton = showWords && retryTabAvailable
        ? `<button type="button" class="hw-word-tab is-retry${state.wordKey === RETRY_WORD_KEY ? " is-current" : ""}${retryPending ? " has-pending" : ""}${!retryPending ? " is-confirmed" : ""}" data-word="${RETRY_WORD_KEY}" role="tab" aria-selected="${state.wordKey === RETRY_WORD_KEY ? "true" : "false"}" title="${RETRY_TAB_LABEL}${retryPending ? "（未確認あり）" : ""}">${RETRY_TAB_LABEL}${!retryPending ? `<span class="hw-word-status" aria-hidden="true">${ICON.check}</span>` : `<span class="hw-word-dot" aria-hidden="true"></span>`}</button>`
        : "";
      wordTabsEl.innerHTML = `${wordButtons}${retryButton}`;
    }

    if (wordSubfilters) wordSubfilters.hidden = state.wordKey === RETRY_WORD_KEY;

    if (state.wordKey === RETRY_WORD_KEY) {
      if (wordFilterLabel) wordFilterLabel.textContent = RETRY_TAB_LABEL;
      listEl.innerHTML = retryVoicePanelHtml();
      const staleRetry = studio.querySelector("#hw-retry-voice");
      if (staleRetry) {
        staleRetry.hidden = true;
        staleRetry.innerHTML = "";
      }
      return;
    }

    const scoped = questionsForWord(state.wordKey);
    const wordLabel = tabs.find((tab) => tab.key === state.wordKey)?.ja || state.wordKey || "この単語";
    if (wordFilterLabel) {
      wordFilterLabel.textContent = `「${wordLabel}」のフィルタ`;
    }

    const needsCount = state.audioReady
      ? scoped.filter(({ question }) => needsConfirm(question)).length
      : 0;
    const doneCount = state.audioReady
      ? scoped.filter(({ question }) => Boolean(question.approved)).length
      : 0;
    studio.querySelectorAll("[data-filter]").forEach((button) => {
      const key = button.dataset.filter;
      const on = key === state.filter;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
      if (key === "all") {
        button.classList.remove("has-pending");
        button.innerHTML = `<span class="hw-filter-ico" aria-hidden="true">${ICON.grid}</span>すべて<span class="hw-filter-count">${scoped.length}</span>`;
      } else if (key === "needs") {
        button.classList.toggle("has-pending", needsCount > 0);
        button.innerHTML = `<span class="hw-filter-ico" aria-hidden="true">${ICON.clock}</span>未確認<span class="hw-filter-count">${needsCount}</span>${needsCount > 0 ? `<span class="hw-filter-dot" aria-hidden="true"></span>` : ""}`;
      } else if (key === "done") {
        button.classList.remove("has-pending");
        button.innerHTML = `<span class="hw-filter-ico" aria-hidden="true">${ICON.check}</span>確認済<span class="hw-filter-count">${doneCount}</span>`;
      }
    });
    const confirmAllBtn = studio.querySelector("#hw-confirm-all-word");
    if (confirmAllBtn) {
      const canBulk = state.audioReady && state.status !== "assigned" && needsCount > 0;
      confirmAllBtn.hidden = !state.audioReady || state.status === "assigned";
      confirmAllBtn.disabled = !canBulk;
    }

    const visible = scoped.filter(({ question }) => {
      if (!state.audioReady) return state.filter === "all" ? true : false;
      if (state.filter === "needs") return needsConfirm(question);
      if (state.filter === "done") return Boolean(question.approved);
      return true;
    });
    listEl.innerHTML = visible.length
      ? visible.map(({ question, index }) => collapsedCardHtml(question, index, {
        voice: voiceStateFor(question),
        active: state.editor?.index === index,
        wordKey: state.wordKey,
        audioReady: state.audioReady,
      })).join("")
      : `<p class="hw-note">${!state.audioReady && state.filter !== "all"
        ? "文と問題を確認したら「すべての文と問題を確認した。」を押してください。"
        : state.filter === "needs"
          ? `「${escapeHtml(wordLabel)}」の音声は全て確認済みです。`
          : `「${escapeHtml(wordLabel)}」には、この条件の問題はありません。`}</p>`;

    const staleRetry = studio.querySelector("#hw-retry-voice");
    if (staleRetry) {
      staleRetry.hidden = true;
      staleRetry.innerHTML = "";
    }
  }

  function retryVoicePanelHtml() {
    const heard = RETRY_LINES.filter((line) => heardLines.has(lineKey(line))).length;
    return `
      <section class="hw-retry-panel">
        <div class="hw-retry-panel-head">
          <h3>${RETRY_TAB_LABEL}</h3>
          <span class="hw-soft-badge ${heard >= RETRY_LINES.length ? "is-ok" : "is-wait"}">${heard} / ${RETRY_LINES.length}</span>
        </div>
        <p class="hw-help">どの宿題でも使う共有の声です。作り直したときだけ、もう一度きいて確認してください。</p>
        <div class="hw-audio-lines" role="list">
          ${RETRY_LINES.map((line, index) => {
            const key = lineKey(line);
            const ok = heardLines.has(key);
            const ready = hasHomeworkVoice(line);
            const busy = lineBusy.has(key);
            const encoded = encodeURIComponent(line);
            const unconfirmed = ready && !ok && !busy;
            return `<div class="hw-audio-line${ok ? " is-heard" : ""}${unconfirmed ? " is-unconfirmed" : ""}${!ready ? " is-missing" : ""}${busy ? " is-busy" : ""}" role="listitem" data-line="${encoded}">
              <button type="button" class="hw-audio-line-play" data-act="play-retry" data-retry-index="${index}" data-line="${encoded}" aria-label="${escapeHtml(line)} をきく" ${!ready || busy ? "disabled" : ""}>
                ${ICON.play}
              </button>
              <div class="hw-audio-line-copy">
                <p class="hw-audio-line-text">${escapeHtml(line)}</p>
                <p class="hw-audio-line-cap">${busy ? "作り直し中…" : !ready ? "未生成" : ok ? "確認済み" : "未確認"}</p>
              </div>
              <button type="button" class="hw-audio-line-regen" data-act="regen-retry" data-retry-index="${index}" data-line="${encoded}" aria-label="${escapeHtml(line)} の音声を作り直す" title="この音声だけ作り直す" ${!ready || busy || state.audioBuilding ? "disabled" : ""}>${ICON.regen}</button>
              <span class="hw-audio-line-mark" aria-hidden="true">${ok && ready && !busy ? "✓" : unconfirmed ? "!" : ""}</span>
            </div>`;
          }).join("")}
        </div>
      </section>`;
  }

  async function save(mode) {
    const pending = state.questions.some((question) => !question.approved);
    if (!state.questions.length) {
      setStatus("bad", "先に宿題をつくってください。");
      return;
    }
    if (mode === "assigned" && pending) {
      setStatus("bad", "すべての問題の音声を確認してから出してください。");
      return;
    }
    if (mode === "assigned" && (!state.audioReady || missingVoiceLines().length)) {
      setStatus("bad", "先に「すべての文と問題を確認した。」を押して声を用意してから出してください。");
      return;
    }
    if (mode === "assigned" && retryLinesPending()) {
      setStatus("bad", `「${RETRY_TAB_LABEL}」もすべてきいて確認してから出してください。`);
      return;
    }
    const classIds = selectedClasses();
    if (mode === "assigned" && !classIds.length) {
      setStatus("bad", "出すクラスを選んでください。");
      return;
    }
    if (!options.callFunction) {
      setStatus("bad", "保存できませんでした。ページを再読み込みしてからもう一度お試しください。");
      return;
    }
    const draftButtons = [studio.querySelector("#hw-draft")].filter(Boolean);
    const assignBtn = studio.querySelector("#hw-assign");
    if (mode === "draft") draftButtons.forEach((btn) => { btn.disabled = true; });
    if (mode === "assigned" && assignBtn) assignBtn.disabled = true;
    if (mode === "draft") setDraftHeadStatus("", "保存しています…");
    else setStatus("", "出しています…");
    try {
      const allApproved = state.questions.length > 0 && state.questions.every((question) => question.approved);
      const voiceReady = Boolean(allApproved && state.audioReady && !missingVoiceLines().length);
      const sharePublic = studio.querySelector("#hw-published")?.checked !== false;
      const packBase = {
        id: state.draftId || "",
        title: studio.querySelector("#hw-title").value,
        level: studio.querySelector("#hw-level").value,
        dueOn: studio.querySelector("#hw-due").value,
        vocab: state.pairs,
        questions: state.questions,
        settings: settings(),
      };
      let result;
      if (mode === "draft") {
        // Explicit draft button: private My Library only — never publish from here.
        result = await options.callFunction("saveHomeworkPack", {
          ...packBase,
          status: "draft",
          classIds: [],
          published: false,
          libraryReady: creationComplete(),
        });
        state.draftId = result.id || state.draftId;
        state.status = "draft";
      } else {
        // Creation must be complete before send. Publish only when the share box is checked.
        // Always keep a My Library copy, then send a separate assigned copy to the class.
        if (!creationComplete()) {
          setStatus("bad", assignBlockReason());
          return;
        }
        // Teacher confirmation often uses local IndexedDB. Re-publish clips so students can load them.
        setStatus("ok", "音声を生徒と共有しています…");
        const voiceLines = [...linesForQuestions(state.questions), ...RETRY_LINES];
        const sync = await syncHomeworkVoiceRemote(voiceLines, options.db);
        if (sync.missing.length || sync.failed.length) {
          setStatus(
            "bad",
            `音声の共有に失敗しました（未共有 ${(sync.missing.length || 0) + (sync.failed.length || 0)}件）。「確認完了」でもう一度音声を用意してから送ってください。`,
          );
          return;
        }
        const template = await options.callFunction("saveHomeworkPack", {
          ...packBase,
          status: "draft",
          classIds: [],
          published: sharePublic === true,
          libraryReady: true,
        });
        state.draftId = template.id || state.draftId;
        result = await options.callFunction("assignHomeworkFromTemplate", {
          templateId: state.draftId,
          classIds,
          dueOn: packBase.dueOn,
        });
        result = {
          ...result,
          id: state.draftId,
          published: sharePublic,
        };
        state.status = "assigned";
      }
      state.dirty = false;
      if (mode === "draft") {
        const published = studio.querySelector("#hw-published");
        if (published) published.checked = false;
        setDraftHeadStatus("ok", "マイライブラリに下書き保存しました（非公開・未配信）");
      paintQuestions();
      } else {
        const count = Number(result.assigneeCount) || 0;
        const sentMessage = sharePublic
          ? (count > 0
            ? `宿題を送りました（${count}人・他の先生にも公開）`
            : "宿題を送りました（他の先生にも公開）")
          : (count > 0
            ? `宿題を送りました（${count}人・マイライブラリに保存）`
            : "宿題を送りました（マイライブラリに保存）");
        state.flowStep = "confirm";
        paintQuestions();
        paintConfirmSummary();
        setStatus("ok", sentMessage);
        if (typeof options.openLibrary === "function") {
          window.setTimeout(() => {
            options.openLibrary({
              tab: "mine",
              notice: sentMessage,
            });
          }, 900);
        }
      }
    } catch (error) {
      console.error("[homework-studio] save failed", error);
      if (mode === "draft") setDraftHeadStatus("bad", error?.message || "保存に失敗しました。");
      else setStatus("bad", error?.message || "保存に失敗しました。");
    } finally {
      if (mode === "draft") {
        draftButtons.forEach((btn) => {
          btn.disabled = !state.questions.length || state.status === "assigned";
        });
      }
      if (mode === "assigned" && assignBtn) {
        assignBtn.disabled = state.status === "assigned"
          || !selectedClasses().length
          || !readyForAssign();
      }
    }
  }

  function openPreview() {
    if (!state.questions.length) return;
    studio.hidden = true;
    stage.hidden = false;
    const byId = new Map(state.questions.map((question) => [question.id, question]));
    mountHomeworkPlayer(stage, {
      title: studio.querySelector("#hw-title").value,
      questions: state.questions.map(toPublic),
      db: options.db,
      grade: async (id, payload) => {
        const question = byId.get(id);
        if (payload.kind === "matching-done") return { correct: true, solution: "" };
        if (payload.kind === "pair") return gradeAnswer(question, payload);
        return gradeAnswer(question, payload.answer);
      },
      onClose: () => {
        stopPrompt();
        stage.hidden = true;
        stage.replaceChildren();
        studio.hidden = false;
      },
    });
  }

  function applyEditor(pack) {
    state.draftId = pack.id || "";
    state.status = pack.status || "draft";
    state.questions = (pack.questions || []).map((question) => ({
      ...question,
      approved: Boolean(question.approved),
      review: !question.approved,
    }));
    state.pairs = pack.vocab || [];
    state.warnings = pack.status === "assigned" ? ["出した宿題は変更できません。"] : [];
    studio.querySelector("#hw-title").value = pack.title || "きょうのしゅくだい";
    if (pack.level) studio.querySelector("#hw-level").value = pack.level;
    studio.querySelector("#hw-due").value = pack.dueOn || "";
    const shuffleInput = studio.querySelector("#hw-shuffle-words");
    if (shuffleInput) {
      shuffleInput.checked = pack.settings?.shuffleWords !== false;
    }
    setWords(pack.vocab || []);
    state.audioReady = false;
    state.audioBuilding = false;
    state.filter = "all";
    state.wordKey = "";
    state.wordFilters = {};
    audioReviewed.clear();
    heardLines.clear();
    retryNeedsRecheck.clear();
    lineBusy.clear();
    voiceBusy.clear();
    state.dirty = false;
    state.flowStep = "build";
    paintQuestions();
  }

  await loadClasses();
  if (options.initialPack) {
    applyEditor(options.initialPack);
    if (options.initialPack.published === false) {
      const published = studio.querySelector("#hw-published");
      if (published) published.checked = false;
    }
    if (Array.isArray(options.initialPack.classIds) && options.initialPack.classIds.length) {
      const want = new Set(options.initialPack.classIds.map(String));
      studio.querySelectorAll("[data-class]").forEach((input) => {
        input.checked = want.has(String(input.value));
      });
    }
    if (options.initialPack.audioReady) {
      state.audioReady = true;
      const lines = [...linesForQuestions(state.questions), ...RETRY_LINES];
      markLinesHeard(lines);
      acceptReusableRetryLines();
    }
    if (Array.isArray(options.initialPack.heardLines)) {
      options.initialPack.heardLines.forEach((key) => heardLines.add(key));
    }
    const resumeStep = options.initialPack.flowStep;
    if (resumeStep && resumeStep !== "build") {
      state.flowStep = resumeStep;
      paintFlow();
      paintQuestions();
      if (resumeStep === "assign") paintClassStudents();
      if (resumeStep === "confirm") paintConfirmSummary();
    }
  }
  rememberStudio();

  async function studentsForClass(classId) {
    if (state.classStudents[classId]) return state.classStudents[classId];
    if (options.lab || !options.db || classId === "lab-class") {
      const demo = [
        { id: "lab-1", name: "プレビュー生徒 A" },
        { id: "lab-2", name: "プレビュー生徒 B" },
        { id: "lab-3", name: "プレビュー生徒 C" },
      ];
      state.classStudents[classId] = demo;
      return demo;
    }
    try {
      const snap = await getDocs(query(collection(options.db, "bookings"), where("classId", "==", classId)));
      const rows = [];
      const seen = new Set();
      for (const item of snap.docs) {
        const data = item.data();
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
        } catch (error) {
      console.warn("class students", classId, error);
      state.classStudents[classId] = [];
      return [];
    }
  }

  async function paintClassStudents() {
    const host = studio.querySelector("#hw-class-students");
    const summary = studio.querySelector("#hw-students-summary");
    if (!host) return;
    const selected = selectedClasses();
    studio.querySelectorAll(".hw-class-card").forEach((card) => {
      const input = card.querySelector("[data-class]");
      card.classList.toggle("is-on", Boolean(input?.checked));
    });
    if (!selected.length) {
      if (summary) summary.textContent = "クラスを選ぶと表示されます";
      host.innerHTML = `<p class="hw-assign-students-empty">左のクラスにチェックを入れると、予約している生徒が出ます。</p>`;
      return;
    }
    host.innerHTML = `<p class="hw-assign-students-loading">生徒を読み込み中…</p>`;
    if (summary) summary.textContent = "読み込み中…";
    const groups = [];
    for (const classId of selected) {
      const meta = state.classes.find((item) => item.id === classId);
      const students = await studentsForClass(classId);
      const countEl = [...studio.querySelectorAll("[data-class-count]")].find((el) => el.getAttribute("data-class-count") === classId);
      if (countEl) countEl.textContent = `${students.length}人`;
      groups.push({
        id: classId,
        title: meta?.title || classId,
        students,
      });
    }
    // Selection may have changed while awaiting.
    if (selectedClasses().join(",") !== selected.join(",")) return;
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

  async function loadClasses() {
    const host = studio.querySelector("#hw-classes");
    if (!host) return;
    if (options.lab || !options.db) {
      state.classes = [{ id: "lab-class", title: "プレビューのクラス" }];
      host.innerHTML = `<label class="hw-class-card is-on">
        <input data-class type="checkbox" value="lab-class" checked>
        <span class="hw-class-card-body">
          <strong>プレビューのクラス</strong>
          <small data-class-count="lab-class">3人</small>
        </span>
      </label>`;
      paintClassStudents();
      return;
    }
    const me = await getDoc(doc(options.db, "users", options.uid));
    const role = me.data()?.role;
    const classQuery = role === "owner"
      ? query(collection(options.db, "classes"), where("status", "==", "open"))
      : query(collection(options.db, "classes"), where("teacherId", "==", options.uid));
    const snap = await getDocs(classQuery);
    state.classes = snap.docs.map((item) => ({ id: item.id, title: item.data().title || "クラス" }));
    state.classStudents = {};
    host.innerHTML = state.classes.length
      ? state.classes.map((item) => `<label class="hw-class-card">
          <input data-class type="checkbox" value="${escapeHtml(item.id)}">
          <span class="hw-class-card-body">
            <strong>${escapeHtml(item.title)}</strong>
            <small data-class-count="${escapeHtml(item.id)}">…</small>
          </span>
        </label>`).join("")
      : `<p class="hw-note">担当クラスがまだありません。下書きは保存できます。</p>`;
    // Prefetch counts in the background for the class cards.
    state.classes.forEach((item) => {
      studentsForClass(item.id).then((students) => {
        const countEl = [...studio.querySelectorAll("[data-class-count]")].find((el) => el.getAttribute("data-class-count") === item.id);
        if (countEl) countEl.textContent = `${students.length}人`;
      }).catch(() => {});
    });
    paintClassStudents();
  }
}

function vocabNorm(value) {
  return String(value || "").trim().toLowerCase();
}

function questionVocabKeys(question) {
  const raw = String(question?.vocabKey || "").trim();
  if (raw) {
    return raw.split(",").map((part) => vocabNorm(part)).filter(Boolean);
  }
  if (question?.type === "matching") {
    return (question.right || []).map((item) => vocabNorm(item.text)).filter(Boolean);
  }
  if (question?.answer && !Array.isArray(question.answer)) {
    return [vocabNorm(question.answer)].filter(Boolean);
  }
  if (question?.display) return [vocabNorm(question.display)].filter(Boolean);
  return [];
}

function questionBelongsToWord(question, wordKey) {
  if (!wordKey || wordKey === "all") return true;
  const target = vocabNorm(wordKey);
  return questionVocabKeys(question).includes(target);
}

function matchingPairForWord(question, wordKey) {
  if (question?.type !== "matching") return null;
  const target = vocabNorm(wordKey);
  if (!target || target === "all") {
    const first = question.pairs?.[0];
    if (!first) return null;
    return {
      ja: question.left?.find((item) => item.id === first.leftId)?.text || "",
      en: question.right?.find((item) => item.id === first.rightId)?.text || "",
      extra: Math.max(0, (question.pairs?.length || 0) - 1),
    };
  }
  const right = (question.right || []).find((item) => vocabNorm(item.text) === target);
  if (!right) return null;
  const pair = (question.pairs || []).find((item) => item.rightId === right.id);
  const ja = question.left?.find((item) => item.id === pair?.leftId)?.text || "";
  return {
    ja,
    en: right.text || "",
    extra: Math.max(0, (question.pairs?.length || 0) - 1),
  };
}

function needsConfirm(question) {
  return !question.approved;
}

const ICON = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  regen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11l9-5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h3.5v12H7zm6.5 0H17v12h-3.5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"/><path d="m13.8 5.7 4.5 4.5"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M15.5 9.5a3.2 3.2 0 0 1 0 5"/><path d="M17.5 7.2a6 6 0 0 1 0 9.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8 12.2 2.8 2.8L16.5 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.3.9-1.3 1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.05" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6.5 16-2.2-6.3L4 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 18.5c1.2-2.6 3.2-4 5.5-4s4.3 1.4 5.5 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.2 18.5c.7-1.6 1.8-2.6 3.3-2.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3.5v3M16 3.5v3M4 9.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tags: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5V5.8A1.8 1.8 0 0 1 5.8 4H12l8 8-7.2 7.2L4 12.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.2"/></svg>',
  paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 7V5.8A1.8 1.8 0 0 1 11.8 4h2.4A1.8 1.8 0 0 1 16 5.8V7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 11V8.8A1.8 1.8 0 0 1 6.8 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.8l-1.6-5.6L5 10.6 10.4 9 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M18.5 15.5 19.2 18l2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3.5V8h4.5M8.5 12h7M8.5 15.5h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  signal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17.5v-3M10 17.5v-6M15 17.5v-9M20 17.5v-12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  hash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 7 19M17 5l-2 14M4.5 9.5h15M3.5 14.5h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11.5L19.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 4.5v5h7v-5M8 19v-6.5h8V19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1.3" fill="currentColor"/><circle cx="15" cy="7" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="17" r="1.3" fill="currentColor"/><circle cx="15" cy="17" r="1.3" fill="currentColor"/></svg>',
  mcq: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="3.5" rx="1.5"/><rect x="4" y="10.5" width="16" height="3.5" rx="1.5"/><rect x="4" y="16" width="16" height="3.5" rx="1.5"/></svg>',
  match: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h6M13 7h6M5 17h6M13 17h6M11 7l2 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  spell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5h5.5a3.5 3.5 0 0 1 0 7H5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 12h5M14 19V5h4a3 3 0 0 1 0 6h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sentence: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15.5H7.5A2.5 2.5 0 0 0 5 21V5.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 7.5h6.5M9 11h4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

const TYPE_ICON = {
  multipleChoice: ICON.mcq,
  matching: ICON.match,
  spelling: ICON.spell,
  sentence: ICON.sentence,
};

const TYPE_TONE = {
  multipleChoice: "is-mcq",
  matching: "is-match",
  spelling: "is-spell",
  sentence: "is-sentence",
};

function voiceBadge(state) {
  if (state === "locked") return `<span class="hw-voice-badge is-wait">未作成</span>`;
  if (state === "busy") return `<span class="hw-voice-badge is-busy">生成中</span>`;
  if (state === "error") return `<span class="hw-voice-badge is-error">生成エラー</span>`;
  if (state === "ready") return `<span class="hw-voice-badge is-ready">確認済み</span>`;
  if (state === "stale") return `<span class="hw-voice-badge is-wait">確認待ち</span>`;
  return `<span class="hw-voice-badge is-missing">音声未生成</span>`;
}

function voiceHint(state) {
  if (state === "busy") return "新しい音声を作っています。終わるまでお待ちください。";
  if (state === "error") return "音声の生成に失敗しました。もう一度作り直してください。";
  if (state === "ready") return "このフレーズの音声は確認済みです。";
  if (state === "stale") return "音声はあるので、きいて確認してください。生成が終わっただけでは確認済みになりません。";
  return "まだ音声がありません。「音声を作り直す」で生成できます。";
}

function drawerStatusHtml(question, voice) {
  if (question.approved && voice === "ready") {
    return `<span class="hw-soft-badge is-ok">確認済み</span>`;
  }
  const labels = [];
  if (!question.approved) labels.push(`<span class="hw-soft-badge is-wait">確認待ち</span>`);
  else labels.push(`<span class="hw-soft-badge is-ok">内容は確認済み</span>`);
  if (voice === "error") labels.push(`<span class="hw-soft-badge is-error">生成エラー</span>`);
  else if (voice === "busy") labels.push(`<span class="hw-soft-badge is-busy">生成中</span>`);
  else if (voice === "missing" || voice === "locked") labels.push(`<span class="hw-soft-badge is-wait">音声未生成</span>`);
  else if (voice === "ready") labels.push(`<span class="hw-soft-badge is-ok">音声の確認済み</span>`);
  else labels.push(`<span class="hw-soft-badge is-wait">音声の確認待ち</span>`);
  return labels.join("");
}

function statusLabelsHtml(question, voice) {
  return drawerStatusHtml(question, voice);
}

function previewLines(question, wordKey = "all") {
  if (question.type === "sentence") {
    return {
      ja: question.promptJa || "",
      en: question.display || "",
    };
  }
  if (question.type === "multipleChoice") {
    return { ja: question.promptJa || "", en: question.answer || "" };
  }
  if (question.type === "spelling") {
    return { ja: question.promptJa || "", en: question.display || question.answer || "" };
  }
  if (question.type === "matching") {
    const pair = matchingPairForWord(question, wordKey);
    if (!pair) return { ja: question.promptJa || "", en: "" };
    const more = pair.extra > 0 ? ` ほか${pair.extra}` : "";
    return { ja: pair.ja || question.promptJa || "", en: pair.en ? `${pair.en}${more}` : "" };
  }
  return { ja: question.promptJa || "", en: "" };
}

function collapsedCardHtml(question, index, options = {}) {
  const audioReady = Boolean(options.audioReady);
  const pending = audioReady && needsConfirm(question);
  const voice = options.voice || "missing";
  const lines = previewLines(question, options.wordKey || "all");
  const typeTone = TYPE_TONE[question.type] || "";
  const tone = pending ? "is-pending" : (audioReady && question.approved) ? "is-confirmed" : "is-ready";
  const status = audioReady
    ? (question.approved
      ? `<span class="hw-pill is-ok"><span class="hw-pill-ico" aria-hidden="true">${ICON.check}</span>確認済</span>`
      : `<span class="hw-pill is-warn"><span class="hw-pill-ico" aria-hidden="true">${ICON.clock}</span>未確認</span>`)
    : "";
  const audio = audioReady
    ? `<span class="hw-card-audio">${voice === "ready" ? "音声OK" : voice === "error" ? "エラー" : "音声待ち"}</span>`
    : "";
  return `<article class="hw-card is-clickable ${tone} ${typeTone}${options.active ? " is-active" : ""}" data-index="${index}" tabindex="0" role="button" aria-label="Q${index + 1} を編集・確認">
    <div class="hw-card-top">
      <div class="hw-card-meta">
        <span class="hw-q-num">Q${index + 1}</span>
        <span class="hw-type-pill"><span class="hw-type-pill-ico" aria-hidden="true">${TYPE_ICON[question.type] || ICON.grid}</span>${TYPE_LABEL[question.type] || "問題"}</span>
        ${status}
      </div>
      <details class="hw-menu">
        <summary class="hw-icon-btn" aria-label="メニュー">${ICON.more}</summary>
        <div class="hw-menu-panel" role="menu">
          <button type="button" data-act="up" role="menuitem">上へ</button>
          <button type="button" data-act="down" role="menuitem">下へ</button>
          <button type="button" data-act="regen" role="menuitem">作り直す</button>
          <button type="button" data-act="remove" role="menuitem">けす</button>
        </div>
      </details>
    </div>
    <p class="hw-card-ja">${escapeHtml(lines.ja) || "—"}</p>
    <p class="hw-card-en">${escapeHtml(lines.en) || "—"}</p>
    ${audio ? `<div class="hw-card-foot">${audio}</div>` : ""}
  </article>`;
}

function summaryHtml(question) {
  if (question.type === "multipleChoice") {
    return `<div class="hw-choices-preview">${(question.choices || []).map((choice) => `<span class="hw-chip${choice === question.answer ? " is-key" : ""}">${escapeHtml(choice)}</span>`).join("")}</div>`;
  }
  if (question.type === "matching") {
    return `<div class="hw-match-preview">${(question.pairs || []).map((pair) => {
      const ja = question.left.find((item) => item.id === pair.leftId)?.text || "";
      const en = question.right.find((item) => item.id === pair.rightId)?.text || "";
      return `<p class="hw-key">${escapeHtml(ja)} = ${escapeHtml(en)}</p>`;
    }).join("")}</div>`;
  }
  if (question.type === "spelling") return `<p class="hw-key">${escapeHtml(question.display || question.answer || "")}</p>`;
  return "";
}
