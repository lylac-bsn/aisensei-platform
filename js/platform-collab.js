import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { createBallLobby } from "./collab-physics.js";

async function callFunction(name, data) {
  const user = getAuth().currentUser;
  const token = await user.getIdToken();
  const response = await fetch(`https://asia-northeast1-ai-sensei-8849b.cloudfunctions.net/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "うまくいきませんでした。");
  return body.result || body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const COLORS = ["cb-red", "cb-blue", "cb-yellow", "cb-green"];
const SHAPES = ["▲", "◆", "●", "■"];
const TIMES = [5, 10, 20, 30, 60, 90, 120];
const LEVEL_LABEL = { beginner: "初級", intermediate: "中級", advanced: "上級" };
const GAME_LABEL = { minecraft: "Minecraft", roblox: "Roblox" };
const CATEGORY_LABEL = {
  animals: "どうぶつ", food: "たべもの", colors: "いろ", alphabet: "ABC",
  school: "がっこう", conversation: "えいかいわ", other: "その他",
};

function blankQuestion(type = "multipleChoice") {
  if (type === "trueFalse") {
    return { type, prompt: "", choices: ["○ ほんとう", "× うそ"], answer: "○ ほんとう", answers: ["○ ほんとう"], seconds: 20, points: 100 };
  }
  if (type === "typeAnswer") {
    return { type, prompt: "", choices: [], answer: "", answers: [""], seconds: 30, points: 100 };
  }
  if (type === "matching") {
    return { type, prompt: "ペアを合わせよう", pairs: [{ left: "", right: "" }, { left: "", right: "" }], choices: [], answer: "", seconds: 45, points: 100 };
  }
  if (type === "wordOrder") {
    return { type, prompt: "", words: ["", "", "", ""], answer: "", seconds: 45, points: 100 };
  }
  return { type: "multipleChoice", prompt: "", choices: ["", "", "", ""], answer: 0, answers: [], seconds: 20, points: 100 };
}

function fromStored(row) {
  const type = row.type || "multipleChoice";
  if (type === "trueFalse") {
    return {
      type,
      prompt: row.prompt || "",
      choices: ["○ ほんとう", "× うそ"],
      answer: row.answer || "○ ほんとう",
      answers: [row.answer || "○ ほんとう"],
      seconds: TIMES.includes(Number(row.timeLimitSec)) ? Number(row.timeLimitSec) : 20,
      points: Number(row.points) || 100,
    };
  }
  if (type === "typeAnswer") {
    const answers = row.answers?.length ? row.answers : [row.answer || ""];
    return {
      type,
      prompt: row.prompt || "",
      choices: [],
      answer: answers[0] || "",
      answers,
      seconds: TIMES.includes(Number(row.timeLimitSec)) ? Number(row.timeLimitSec) : 30,
      points: Number(row.points) || 100,
    };
  }
  if (type === "matching") {
    return {
      type,
      prompt: row.prompt || "ペアを合わせよう",
      pairs: (row.pairs || []).length ? row.pairs.map((pair) => ({ left: pair.left || "", right: pair.right || "" })) : [{ left: "", right: "" }, { left: "", right: "" }],
      choices: [],
      answer: "",
      seconds: TIMES.includes(Number(row.timeLimitSec)) ? Number(row.timeLimitSec) : 45,
      points: Number(row.points) || 100,
    };
  }
  if (type === "wordOrder") {
    return {
      type,
      prompt: row.prompt || "",
      words: row.words?.length ? [...row.words] : String(row.answer || "").split(/\s+/).filter(Boolean),
      answer: row.answer || "",
      seconds: TIMES.includes(Number(row.timeLimitSec)) ? Number(row.timeLimitSec) : 45,
      points: Number(row.points) || 100,
    };
  }
  const choices = [...(row.choices || []), "", "", "", ""].slice(0, 4);
  const answers = (row.answers || []).length
    ? row.answers
    : [row.answer].filter(Boolean);
  const answerIndex = choices.findIndex((choice) => choice.trim().toLowerCase() === String(answers[0] || "").trim().toLowerCase());
  return {
    type: "multipleChoice",
    prompt: row.prompt || "",
    choices,
    answer: answerIndex >= 0 ? answerIndex : 0,
    answers,
    seconds: TIMES.includes(Number(row.timeLimitSec)) ? Number(row.timeLimitSec) : 20,
    points: Number(row.points) || 100,
    mediaUrl: row.mediaUrl || "",
  };
}

function pack(question) {
  const type = question.type || "multipleChoice";
  const seconds = TIMES.includes(Number(question.seconds)) ? Number(question.seconds) : 20;
  const points = Math.min(1000, Math.max(0, Number(question.points) || 100));
  if (type === "trueFalse") {
    const answer = question.answer || "○ ほんとう";
    return { type, prompt: question.prompt.trim(), choices: ["○ ほんとう", "× うそ"], answer, answers: [answer], timeLimitSec: seconds, points, ok: Boolean(question.prompt.trim()) };
  }
  if (type === "typeAnswer") {
    const answers = (question.answers || [question.answer]).map((item) => String(item || "").trim()).filter(Boolean);
    return { type, prompt: question.prompt.trim(), choices: [], answer: answers[0] || "", answers, timeLimitSec: seconds, points, ok: Boolean(question.prompt.trim() && answers.length) };
  }
  if (type === "matching") {
    const pairs = (question.pairs || []).map((pair) => ({ left: String(pair.left || "").trim(), right: String(pair.right || "").trim() })).filter((pair) => pair.left && pair.right);
    return { type, prompt: question.prompt.trim() || "ペアを合わせよう", pairs, choices: pairs.map((pair) => pair.right), answer: "", timeLimitSec: seconds, points, ok: pairs.length >= 2 };
  }
  if (type === "wordOrder") {
    const words = (question.words || []).map((word) => String(word || "").trim()).filter(Boolean);
    const answer = String(question.answer || words.join(" ")).trim();
    return { type, prompt: question.prompt.trim(), words, choices: words, answer, timeLimitSec: seconds, points, ok: Boolean(question.prompt.trim() && words.length >= 2 && answer) };
  }
  const choices = question.choices.map((choice) => choice.trim()).filter(Boolean).slice(0, 4);
  const answerText = (question.choices[question.answer] || "").trim();
  const answers = choices.includes(answerText) ? [answerText] : [];
  return {
    type: "multipleChoice",
    prompt: question.prompt.trim(),
    choices,
    answer: answerText,
    answers,
    timeLimitSec: seconds,
    points,
    mediaUrl: question.mediaUrl || "",
    ok: Boolean(question.prompt.trim() && choices.length >= 2 && answers.length),
  };
}

function qrUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
}

function joinUrl(code) {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const path = local ? "/collab/join.html" : "/collab/join";
  return `${location.origin}${path}?code=${encodeURIComponent(code)}`;
}

function collabSoundEnabled() {
  return localStorage.getItem("cb-sound") !== "off";
}

function playTone(kind) {
  if (!collabSoundEnabled()) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const map = { start: 520, tick: 880, ok: 660, bad: 220, done: 740 };
    osc.frequency.value = map[kind] || 440;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    /* ignore */
  }
}

const COLLAB_BGM_SRC = "/audio/collab-bgm.wav";
/** Host BGM plays in lobby / answering / reveal / board / results — paused during intro. */
const COLLAB_BGM_STATUSES = new Set([
  "lobby", "question", "reveal", "leaderboard", "final_results", "done",
]);
const COLLAB_BGM_PAUSE_STATUSES = new Set(["intro"]);
let collabBgm = null;

function startCollabBgm() {
  if (!collabSoundEnabled()) {
    stopCollabBgm();
    return;
  }
  try {
    if (!collabBgm) {
      collabBgm = new Audio(COLLAB_BGM_SRC);
      collabBgm.loop = true;
      collabBgm.preload = "auto";
      collabBgm.volume = 0.28;
    }
    if (collabBgm.paused) {
      const play = collabBgm.play();
      if (play?.catch) play.catch(() => { /* autoplay blocked until gesture */ });
    }
  } catch {
    /* ignore */
  }
}

function pauseCollabBgm() {
  if (!collabBgm) return;
  try {
    collabBgm.pause();
  } catch {
    /* ignore */
  }
}

function stopCollabBgm() {
  if (!collabBgm) return;
  try {
    collabBgm.pause();
    collabBgm.currentTime = 0;
  } catch {
    /* ignore */
  }
}

function syncCollabBgm(status, { asHost = false } = {}) {
  if (!asHost) {
    stopCollabBgm();
    return;
  }
  if (COLLAB_BGM_PAUSE_STATUSES.has(status)) pauseCollabBgm();
  else if (COLLAB_BGM_STATUSES.has(status)) startCollabBgm();
  else stopCollabBgm();
}

function visibilityLabel(value) {
  if (value === "published") return "公開中";
  if (value === "unlisted") return "リンク限定";
  return "非公開";
}

export async function renderCollab(root, { host, uid, role }) {
  const db = getFirestore();
  const isOwner = role === "owner";
  let view = host ? "home" : "join";
  let tab = "recommended";
  let search = "";
  let templates = [];
  let mine = [];
  let favorites = new Set();
  let selected = null;
  let sessions = [];
  let note = "";
  let noteKind = "";
  let editor = null;
  let roomId = "";
  let amHost = false;
  let roomData = {};
  let players = [];
  let lockedChoice = "";
  let lockedResult = "";
  let stopRoom = null;
  let stopPlayers = null;
  let clock = 0;
  let clockTimer = 0;
  let clockGen = 0;
  let syncing = false;
  let syncAgain = false;
  let autosaveTimer = 0;
  let classes = [];
  let vocab = [];
  let lobbyPhysics = null;
  let lastPoints = 0;
  let lastCorrect = null;
  let presenting = false;
  let presentRepaint = false;

  const stopClock = () => {
    clockGen += 1;
    cancelAnimationFrame(clock);
    clearTimeout(clockTimer);
    clock = 0;
    clockTimer = 0;
  };

  const stopLive = ({ keepPresent = false } = {}) => {
    if (!keepPresent) {
      presenting = false;
      presentRepaint = false;
      try {
        if (document.fullscreenElement) document.exitFullscreen?.();
      } catch { /* ignore */ }
      root.querySelector(".cb-present-root")?.classList.remove("is-present");
      stopCollabBgm();
    }
    stopRoom?.();
    stopPlayers?.();
    stopRoom = null;
    stopPlayers = null;
    stopClock();
    lobbyPhysics?.destroy?.();
    lobbyPhysics = null;
  };

  const stop = () => {
    stopLive();
    stopCollabBgm();
    clearTimeout(autosaveTimer);
    window.removeEventListener("beforeunload", onBeforeUnload);
    root._confirmLeave = null;
    root._closeCollabMenu?.();
  };
  root._stopQuiz = stop;

  const dirty = () => editor && editor.savedKey !== editor.formKey();
  const onBeforeUnload = (event) => {
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const confirmDiscard = (message) => {
    if (!dirty()) return true;
    if (!window.confirm(message)) return false;
    if (editor) editor.savedKey = editor.formKey();
    return true;
  };

  const loadFavorites = async () => {
    if (!host) return;
    try {
      const snap = await getDocs(collection(db, "users", uid, "collabFavorites"));
      favorites = new Set(snap.docs.map((item) => item.id));
    } catch {
      favorites = new Set();
    }
  };

  const loadTemplates = async () => {
    const [publishedSnap, mineSnap] = await Promise.all([
      getDocs(query(collection(db, "quizTemplates"), where("visibility", "==", "published"))),
      host ? getDocs(query(collection(db, "quizTemplates"), where("ownerId", "==", uid))) : Promise.resolve({ docs: [] }),
    ]);
    const map = new Map();
    publishedSnap.docs.forEach((item) => map.set(item.id, { id: item.id, ...item.data() }));
    mineSnap.docs.forEach((item) => map.set(item.id, { id: item.id, ...item.data() }));
    templates = [...map.values()].sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    mine = templates.filter((item) => item.ownerId === uid);
  };

  const loadSessions = async () => {
    if (!host) return;
    try {
      const snap = await getDocs(query(collection(db, "quizSessions"), where("hostId", "==", uid), limit(20)));
      sessions = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    } catch {
      sessions = [];
    }
  };

  const loadClasses = async () => {
    if (!host) return;
    try {
      const snap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", uid)));
      classes = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.startsAt?.toMillis?.() || 0) - String(a.startsAt?.toMillis?.() || 0))
        .slice(0, 40);
    } catch {
      classes = [];
    }
  };

  const loadVocab = async (classId) => {
    if (!classId) {
      vocab = [];
      return;
    }
    try {
      const [hw, reports] = await Promise.all([
        getDocs(query(collection(db, "homeworkAssignments"), where("teacherId", "==", uid))),
        getDocs(query(collection(db, "classReports"), where("teacherId", "==", uid))),
      ]);
      const rows = [];
      hw.docs.filter((item) => item.data().classId === classId)
        .forEach((item) => (item.data().phrases || []).forEach((phrase) => rows.push(phrase)));
      reports.docs.filter((item) => item.data().classId === classId)
        .forEach((item) => (item.data().phrases || []).forEach((phrase) => rows.push(phrase)));
      const seen = new Set();
      vocab = rows.filter((phrase) => {
        const key = `${phrase.en}::${phrase.ja}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return Boolean(phrase.en && phrase.ja);
      }).slice(0, 60);
    } catch {
      vocab = [];
    }
  };

  const filtered = () => {
    const q = search.trim().toLowerCase();
    let rows = templates;
    if (tab === "official") rows = rows.filter((item) => item.official);
    else if (tab === "teacher") rows = rows.filter((item) => !item.official && item.visibility === "published");
    else if (tab === "mine") rows = rows.filter((item) => item.ownerId === uid);
    else if (tab === "recommended") {
      rows = rows.filter((item) => item.visibility === "published")
        .sort((a, b) => Number(b.usageCount || 0) - Number(a.usageCount || 0) || (b.official ? 1 : 0) - (a.official ? 1 : 0));
    } else {
      rows = rows.filter((item) => item.visibility === "published" || item.ownerId === uid);
    }
    if (!q) return rows;
    return rows.filter((item) => {
      const hay = [
        item.title, item.description, item.category, item.ownerName, item.level, item.game,
        ...(item.tags || []),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  };

  const cardMarkup = (item) => {
    const cover = item.coverUrl
      ? `<img src="${escapeHtml(item.coverUrl)}" alt="">`
      : `<span>${escapeHtml(item.coverEmoji || "🎮")}</span>`;
    const favOn = favorites.has(item.id);
    return `
      <article class="cb-card-wrap">
        <button type="button" class="cb-card" data-open="${escapeHtml(item.id)}" style="--cover:${escapeHtml(item.coverColor || "#FF5A29")}">
          <div class="cb-card-cover">${cover}</div>
          <div class="cb-card-body">
            <strong>${escapeHtml(item.title || "COllAB")}</strong>
            <div class="cb-card-meta">
              <span class="cb-pill">${Number(item.questionCount || (item.questions || []).length || 0)}問</span>
              <span>${escapeHtml(LEVEL_LABEL[item.level] || item.level || "")}</span>
              <span>${escapeHtml(CATEGORY_LABEL[item.category] || item.category || GAME_LABEL[item.game] || "")}</span>
              <span>${escapeHtml(item.ownerName || "")}</span>
              ${item.usageCount ? `<span>${Number(item.usageCount)}回</span>` : ""}
              ${item.ownerId === uid ? `<span class="cb-pill">${visibilityLabel(item.visibility)}</span>` : ""}
            </div>
          </div>
        </button>
        ${host ? `<button type="button" class="cb-fav${favOn ? " is-on" : ""}" data-fav="${escapeHtml(item.id)}" aria-label="お気に入り">${favOn ? "♥" : "♡"}</button>` : ""}
      </article>`;
  };

  const paintHome = () => {
    const rows = filtered();
    const popular = templates.filter((item) => item.visibility === "published")
      .sort((a, b) => Number(b.usageCount || 0) - Number(a.usageCount || 0))
      .slice(0, 6);
    root.innerHTML = `
      <div class="cb-app">
        <section class="cb-hero">
          <div class="cb-hero-inner">
            <h2 class="cb-brand">COllAB</h2>
            <p class="cb-sub">みんなで楽しく英語を学ぼう！</p>
            <div class="cb-search-row">
              <input class="cb-search" id="cb-search" type="search" placeholder="クイズやテンプレートを検索..." value="${escapeHtml(search)}">
              ${host ? `<button type="button" class="cb-create" id="cb-create">+ Create COllAB</button>` : `<button type="button" class="cb-create" id="cb-join-open">コードで参加</button>`}
            </div>
          </div>
        </section>
        ${host ? `
          <div class="cb-tabs">
            ${[
              ["recommended", "おすすめ"],
              ["all", "すべて"],
              ["official", "公式テンプレート"],
              ["teacher", "先生のテンプレート"],
              ["mine", "マイクイズ"],
              ["results", "けっか"],
            ].map(([id, label]) => `<button type="button" class="cb-tab${tab === id ? " is-on" : ""}" data-tab="${id}">${label}</button>`).join("")}
          </div>` : ""}
        ${tab === "results" ? `
          <h3 class="cb-section-title">最近のけっか</h3>
          <div class="cb-q-list">${sessions.map((item) => `
            <button type="button" class="cb-q-item" data-session="${escapeHtml(item.id)}">
              <strong>${escapeHtml(item.title || "COllAB")}</strong>
              <div class="cb-card-meta"><span>${Number(item.participantCount || 0)}人</span><span>${Number(item.questionCount || 0)}問</span></div>
            </button>`).join("") || `<p class="cb-empty">まだけっかがありません。</p>`}</div>
        ` : `
          ${tab === "recommended" && !search ? `
            <h3 class="cb-section-title">人気のクイズ</h3>
            <div class="cb-grid">${popular.map(cardMarkup).join("") || `<p class="cb-empty">まだ公開テンプレートがありません。</p>`}</div>
            <h3 class="cb-section-title">おすすめのクイズ</h3>
          ` : `<h3 class="cb-section-title">${tab === "mine" ? "マイクイズ" : "テンプレート"}</h3>`}
          <div class="cb-grid">${rows.map(cardMarkup).join("") || `<p class="cb-empty">見つかりませんでした。</p>`}</div>
        `}
        <p class="cb-save-note${noteKind ? ` is-${noteKind}` : ""}">${escapeHtml(note)}</p>
      </div>`;
    root.querySelector("#cb-search")?.addEventListener("input", (event) => {
      search = event.target.value;
      paintHome();
      root.querySelector("#cb-search")?.focus();
      const input = root.querySelector("#cb-search");
      if (input) input.setSelectionRange(search.length, search.length);
    });
    root.querySelector("#cb-create")?.addEventListener("click", () => openCreateModal());
    root.querySelector("#cb-join-open")?.addEventListener("click", () => {
      view = "join";
      paintJoin();
    });
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.onclick = () => {
        tab = button.dataset.tab;
        note = "";
        paintHome();
      };
    });
    root.querySelectorAll("[data-open]").forEach((button) => {
      button.onclick = () => {
        selected = templates.find((item) => item.id === button.dataset.open);
        if (!selected) return;
        view = "preview";
        paintPreview();
      };
    });
    root.querySelectorAll("[data-fav]").forEach((button) => {
      button.onclick = async (event) => {
        event.stopPropagation();
        try {
          const result = await callFunction("toggleCollabFavorite", { id: button.dataset.fav });
          if (result.favorited) favorites.add(result.id);
          else favorites.delete(result.id);
          paintHome();
        } catch (error) {
          note = error.message;
          noteKind = "error";
          paintHome();
        }
      };
    });
    root.querySelectorAll("[data-session]").forEach((button) => {
      button.onclick = () => {
        const session = sessions.find((item) => item.id === button.dataset.session);
        if (!session) return;
        paintSession(session);
      };
    });
  };

  const openCreateModal = () => {
    const dialog = document.createElement("dialog");
    dialog.className = "cb-modal gc-modal";
    dialog.innerHTML = `
      <form method="dialog" class="cb-modal-card" id="cb-create-form">
        <h2>+ Create COllAB</h2>
        <label>タイトル<input name="title" maxlength="80" required placeholder="どうぶつ英語クイズ"></label>
        <label>レベル
          <select name="level" required>
            <option value="beginner">初級</option>
            <option value="intermediate">中級</option>
            <option value="advanced">上級</option>
          </select>
        </label>
        <label>カテゴリー（任意）
          <select name="category">
            <option value="">なし</option>
            ${Object.entries(CATEGORY_LABEL).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </label>
        <label>ゲーム
          <select name="game" required>
            <option value="minecraft" selected>Minecraft</option>
            <option value="roblox">Roblox</option>
          </select>
        </label>
        <p class="cb-save-note" id="cb-create-status"></p>
        <div class="cb-modal-actions">
          <button type="button" class="cb-btn cb-btn-ghost" id="cb-create-cancel">キャンセル</button>
          <button type="submit" class="cb-btn cb-btn-primary">作成して編集</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector("#cb-create-cancel").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove());
    dialog.querySelector("#cb-create-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const status = dialog.querySelector("#cb-create-status");
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const result = await callFunction("createCollabTemplate", {
          title: form.title.value,
          level: form.level.value,
          category: form.category.value,
          game: form.game.value,
        });
        dialog.close();
        const full = await getDoc(doc(db, "quizTemplates", result.id));
        await openEditor(result.id, { id: result.id, ...full.data() }, true);
      } catch (error) {
        status.textContent = error.message;
        button.disabled = false;
      }
    };
  };

  const openPublishModal = (template) => {
    const dialog = document.createElement("dialog");
    dialog.className = "cb-modal gc-modal";
    dialog.innerHTML = `
      <form method="dialog" class="cb-modal-card" id="cb-publish-form">
        <h2>COllABリストに追加</h2>
        <label>タイトル<input name="title" maxlength="80" required value="${escapeHtml(template.title || "")}"></label>
        <label>説明<textarea name="description" maxlength="400">${escapeHtml(template.description || "")}</textarea></label>
        <label>カバー画像<input type="file" name="cover" accept="image/*"></label>
        <label>カバーの色<input name="coverColor" type="color" value="${escapeHtml(template.coverColor || "#FF5A29")}"></label>
        <label>カテゴリー
          <select name="category">
            <option value="">なし</option>
            ${Object.entries(CATEGORY_LABEL).map(([value, label]) => `<option value="${value}"${template.category === value ? " selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>レベル
          <select name="level">
            ${["beginner", "intermediate", "advanced"].map((value) => `<option value="${value}"${template.level === value ? " selected" : ""}>${LEVEL_LABEL[value]}</option>`).join("")}
          </select>
        </label>
        <label>タグ（カンマ区切り）<input name="tags" value="${escapeHtml((template.tags || []).join(", "))}"></label>
        <label>公開範囲
          <select name="visibility">
            <option value="published">公開（みんなに表示）</option>
            <option value="unlisted">リンク限定</option>
          </select>
        </label>
        <p class="cb-save-note" id="cb-publish-status"></p>
        <div class="cb-modal-actions">
          <button type="button" class="cb-btn cb-btn-ghost" data-close>キャンセル</button>
          <button type="submit" class="cb-btn cb-btn-primary">公開する</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove());
    dialog.querySelector("#cb-publish-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const status = dialog.querySelector("#cb-publish-status");
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        readEditor();
        const ready = editor.questions.map(pack);
        const bad = ready.findIndex((row) => !row.ok);
        if (bad >= 0) throw new Error("公開前に、すべての問題を完成させてください。");
        let coverUrl = editor.meta.coverUrl || "";
        const file = form.cover.files?.[0];
        if (file) {
          try {
            const path = `collabCovers/${uid}/${editor.id}-${Date.now()}-${file.name.replace(/[^\w.-]+/g, "")}`;
            const fileRef = storageRef(getStorage(), path);
            await uploadBytes(fileRef, file);
            coverUrl = await getDownloadURL(fileRef);
          } catch (uploadError) {
            status.textContent = `カバー画像のアップロードに失敗したので、色カバーで公開します。（${uploadError.message}）`;
          }
        }
        await callFunction("publishCollabTemplate", {
          id: editor.id,
          title: form.title.value,
          description: form.description.value,
          category: form.category.value,
          level: form.level.value,
          tags: form.tags.value,
          visibility: form.visibility.value,
          coverColor: form.coverColor.value,
          coverUrl,
          coverEmoji: editor.meta.coverEmoji || "🎮",
          questions: ready,
        });
        dialog.close();
        note = "COllABリストに追加しました。";
        noteKind = "ok";
        await refreshAndEdit(editor.id);
      } catch (error) {
        status.textContent = error.message;
        button.disabled = false;
      }
    };
  };

  const paintPreview = () => {
    const item = selected;
    if (!item) {
      view = "home";
      paintHome();
      return;
    }
    const mineItem = item.ownerId === uid;
    const cover = item.coverUrl
      ? `<img src="${escapeHtml(item.coverUrl)}" alt="">`
      : escapeHtml(item.coverEmoji || "🎮");
    root.innerHTML = `
      <div class="cb-app cb-preview">
        <button type="button" class="cb-back" id="cb-back">← COllABホーム</button>
        <div class="cb-preview-hero">
          <div class="cb-preview-cover" style="background:${escapeHtml(item.coverColor || "#FF5A29")}">${cover}</div>
          <div>
            <h2>${escapeHtml(item.title || "COllAB")}</h2>
            <p class="cb-sub">${escapeHtml(item.description || "")}</p>
            <div class="cb-card-meta">
              <span class="cb-pill">${Number(item.questionCount || (item.questions || []).length || 0)}問</span>
              <span>${escapeHtml(LEVEL_LABEL[item.level] || "")}</span>
              <span>${escapeHtml(CATEGORY_LABEL[item.category] || item.category || "")}</span>
              <span>${escapeHtml(GAME_LABEL[item.game] || item.game || "")}</span>
              <span>${escapeHtml(item.ownerName || "")}</span>
              <span>${visibilityLabel(item.visibility)}</span>
              ${item.official ? `<span class="cb-pill">公式</span>` : ""}
            </div>
            <div class="cb-preview-actions">
              ${host ? `<button type="button" class="cb-btn cb-btn-primary" id="cb-start-room">ルームを作成</button>` : ""}
              <button type="button" class="cb-btn cb-btn-secondary" id="cb-preview-q">プレビュー</button>
              ${mineItem ? `<button type="button" class="cb-btn cb-btn-secondary" id="cb-edit">編集</button>` : ""}
              ${mineItem && item.visibility !== "private" ? `<button type="button" class="cb-btn cb-btn-ghost" id="cb-unpublish">非公開にする</button>` : ""}
              ${isOwner ? `<button type="button" class="cb-btn cb-btn-ghost" id="cb-official">${item.official ? "公式を解除" : "公式にする"}</button>` : ""}
              ${mineItem || isOwner ? `<button type="button" class="cb-btn cb-btn-danger" id="cb-delete-template">テンプレートを削除</button>` : ""}
            </div>
          </div>
        </div>
        <h3 class="cb-section-title">問題プレビュー</h3>
        <div class="cb-q-list">${(item.questions || []).map((question, index) => `
          <article class="cb-q-item">
            <strong>${index + 1}. ${escapeHtml(question.prompt || "")}</strong>
            <div class="cb-card-meta"><span>${escapeHtml(question.type || "multipleChoice")}</span><span>${Number(question.timeLimitSec || 20)}秒</span></div>
          </article>`).join("") || `<p class="cb-empty">まだ問題がありません。</p>`}</div>
        <p class="cb-save-note${noteKind ? ` is-${noteKind}` : ""}">${escapeHtml(note)}</p>
      </div>`;
    root.querySelector("#cb-back").onclick = () => {
      view = "home";
      selected = null;
      paintHome();
    };
    root.querySelector("#cb-edit")?.addEventListener("click", async () => {
      if (!mineItem) {
        note = "ほかの先生のテンプレートはコピーして使えます。";
        noteKind = "error";
        paintPreview();
        return;
      }
      await openEditor(item.id, item, false);
    });
    root.querySelector("#cb-preview-q")?.addEventListener("click", () => paintQuestionPreview(item));
    root.querySelector("#cb-start-room")?.addEventListener("click", () => startRoom(item));
    root.querySelector("#cb-unpublish")?.addEventListener("click", async () => {
      if (!window.confirm("非公開にしますか？")) return;
      try {
        await callFunction("unpublishCollabTemplate", { id: item.id });
        await loadTemplates();
        selected = templates.find((row) => row.id === item.id) || item;
        selected.visibility = "private";
        note = "非公開にしました。";
        noteKind = "ok";
        paintPreview();
      } catch (error) {
        note = error.message;
        noteKind = "error";
        paintPreview();
      }
    });
    root.querySelector("#cb-official")?.addEventListener("click", async () => {
      try {
        await callFunction("setCollabOfficial", { id: item.id, official: !item.official });
        await loadTemplates();
        selected = templates.find((row) => row.id === item.id);
        note = "更新しました。";
        noteKind = "ok";
        paintPreview();
      } catch (error) {
        note = error.message;
        noteKind = "error";
        paintPreview();
      }
    });
    root.querySelector("#cb-delete-template")?.addEventListener("click", () => deleteTemplate(item));
  };

  const deleteTemplate = async (item) => {
    if (!item?.id) return;
    const title = item.title || editor?.meta?.title || "このテンプレート";
    if (!window.confirm(`「${title}」を削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      await callFunction("deleteCollabTemplate", { id: item.id });
      if (editor?.id === item.id) {
        editor = null;
        root._confirmLeave = null;
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      if (selected?.id === item.id) selected = null;
      await loadTemplates();
      note = "テンプレートを削除しました。";
      noteKind = "ok";
      view = "home";
      paintHome();
    } catch (error) {
      note = error.message;
      noteKind = "error";
      if (view === "edit") paintEditor();
      else if (view === "preview") paintPreview();
      else paintHome();
    }
  };

  const paintQuestionPreview = (item) => {
    const questions = item.questions || [];
    let index = 0;
    const draw = () => {
      const question = questions[index];
      root.innerHTML = `
        <div class="cb-app cb-live">
          <button type="button" class="cb-back" id="cb-back">← 戻る</button>
          <p class="cb-sub">プレビュー ${index + 1} / ${questions.length}</p>
          <h2 class="cb-question">${escapeHtml(question?.prompt || "")}</h2>
          <div class="cb-answer-grid">${(question?.choices || []).map((choice, choiceIndex) => `
            <div class="cb-answer ${COLORS[choiceIndex] || "cb-red"}"><span>${SHAPES[choiceIndex] || ""}</span><span>${escapeHtml(choice)}</span></div>
          `).join("")}</div>
          <div class="cb-tools">
            <button type="button" class="cb-btn cb-btn-secondary" id="cb-prev" ${index === 0 ? "disabled" : ""}>前へ</button>
            <button type="button" class="cb-btn cb-btn-primary" id="cb-next">${index + 1 >= questions.length ? "おわり" : "つぎへ"}</button>
          </div>
        </div>`;
      root.querySelector("#cb-back").onclick = () => paintPreview();
      root.querySelector("#cb-prev").onclick = () => {
        index -= 1;
        draw();
      };
      root.querySelector("#cb-next").onclick = () => {
        if (index + 1 >= questions.length) {
          paintPreview();
          return;
        }
        index += 1;
        draw();
      };
    };
    draw();
  };

  const refreshAndEdit = async (id) => {
    await loadTemplates();
    const full = await getDoc(doc(db, "quizTemplates", id));
    await openEditor(id, { id, ...full.data() }, false);
  };

  const openEditor = async (id, data, isNew) => {
    stopLive();
    view = "edit";
    window.addEventListener("beforeunload", onBeforeUnload);
    root._confirmLeave = () => confirmDiscard("保存していない変更があります。このまま移動しますか？");
    const questions = (data.questions || []).length
      ? data.questions.map(fromStored)
      : [blankQuestion()];
    editor = {
      id,
      meta: {
        title: data.title || "COllAB",
        description: data.description || "",
        level: data.level || "beginner",
        game: data.game || "minecraft",
        category: data.category || "",
        coverUrl: data.coverUrl || "",
        coverColor: data.coverColor || "#FF5A29",
        coverEmoji: data.coverEmoji || "🎮",
        tags: data.tags || [],
        visibility: data.visibility || "private",
      },
      questions,
      current: 0,
      savedKey: "",
      formKey() {
        return JSON.stringify({
          meta: this.meta,
          questions: this.questions.map(pack),
        });
      },
    };
    editor.savedKey = isNew ? "" : editor.formKey();
    if (!classes.length) await loadClasses();
    paintEditor();
  };

  const readEditor = () => {
    if (!editor || view !== "edit") return;
    const q = editor.questions[editor.current];
    if (!q) return;
    const prompt = root.querySelector("#cb-prompt");
    if (prompt) q.prompt = prompt.value;
    q.type = root.querySelector("#cb-type")?.value || q.type;
    q.seconds = Number(root.querySelector("#cb-seconds")?.value || q.seconds || 20);
    q.points = Number(root.querySelector("#cb-points")?.value || q.points || 100);
    if (q.type === "multipleChoice" || q.type === "trueFalse") {
      [...root.querySelectorAll("[data-choice]")].forEach((input, index) => {
        q.choices[index] = input.value;
      });
    }
    if (q.type === "typeAnswer") {
      q.answers = (root.querySelector("#cb-typed-answers")?.value || "").split("\n").map((row) => row.trim()).filter(Boolean);
      q.answer = q.answers[0] || "";
    }
    if (q.type === "matching") {
      q.pairs = [...root.querySelectorAll("[data-pair]")].map((row) => ({
        left: row.querySelector("[data-left]")?.value || "",
        right: row.querySelector("[data-right]")?.value || "",
      }));
    }
    if (q.type === "wordOrder") {
      q.words = (root.querySelector("#cb-words")?.value || "").split(/\s+/).filter(Boolean);
      q.answer = root.querySelector("#cb-word-answer")?.value || q.words.join(" ");
    }
    editor.meta.title = root.querySelector("#cb-title")?.value || editor.meta.title;
  };

  const scheduleAutosave = () => {
    clearTimeout(autosaveTimer);
    const status = root.querySelector("#cb-status");
    if (status && !note) {
      status.className = "cb-save-note is-dirty";
      status.textContent = "未保存の変更があります…";
    }
    autosaveTimer = setTimeout(() => saveEditor(true), 1600);
  };

  const saveEditor = async (silent = false) => {
    if (!editor) return;
    readEditor();
    const ready = editor.questions.map(pack);
    const bad = ready.findIndex((row) => !row.ok);
    if (bad >= 0) {
      if (!silent) {
        editor.current = bad;
        note = "問題文と答えを完成させてから保存してください。";
        noteKind = "error";
        paintEditor();
      }
      return;
    }
    try {
      const visibility = silent ? (editor.meta.visibility || "private") : "private";
      await callFunction("saveCollabTemplate", {
        id: editor.id,
        title: editor.meta.title,
        description: editor.meta.description,
        level: editor.meta.level,
        game: editor.meta.game,
        category: editor.meta.category,
        coverUrl: editor.meta.coverUrl,
        coverColor: editor.meta.coverColor,
        coverEmoji: editor.meta.coverEmoji,
        tags: editor.meta.tags,
        visibility,
        questions: ready,
      });
      editor.meta.visibility = visibility;
      editor.savedKey = editor.formKey();
      note = silent ? "自動保存しました。" : "保存しました（自分だけに表示）。";
      noteKind = "ok";
      if (!silent) paintEditor();
      else {
        const status = root.querySelector("#cb-status");
        if (status) {
          status.className = "cb-save-note is-ok";
          status.textContent = note;
        }
      }
    } catch (error) {
      note = error.message;
      noteKind = "error";
      if (!silent) paintEditor();
    }
  };

  const paintEditor = () => {
    if (!editor) return;
    const q = editor.questions[editor.current];
    const packed = editor.questions.map(pack);
    root.innerHTML = `
      <div class="cb-app cb-editor">
        <div class="cb-toolbar">
          <button type="button" class="cb-back" id="cb-home">← COllAB</button>
          <input id="cb-title" type="text" maxlength="80" value="${escapeHtml(editor.meta.title)}">
          <span class="cb-pill">${visibilityLabel(editor.meta.visibility)}</span>
          <button type="button" class="cb-btn cb-btn-secondary" id="cb-save">保存</button>
          <button type="button" class="cb-btn cb-btn-secondary" id="cb-publish">COllABリストに追加</button>
          <button type="button" class="cb-btn cb-btn-primary" id="cb-room">ルームを作成</button>
          ${editor.id ? `<button type="button" class="cb-btn cb-btn-danger" id="cb-delete-template">テンプレートを削除</button>` : ""}
          <p id="cb-status" class="cb-save-note${noteKind ? ` is-${noteKind}` : ""}${!note && dirty() ? " is-dirty" : ""}">${escapeHtml(note || (dirty() ? "未保存の変更があります。" : ""))}</p>
        </div>
        <div class="cb-editor-shell">
          <aside class="cb-rail" id="cb-rail"></aside>
          <section class="cb-stage">
            <div class="cb-stage-head">
              <strong>問題 ${editor.current + 1}</strong>
              <div class="cb-tools">
                <button type="button" class="cb-tool" id="cb-up" ${editor.current === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="cb-tool" id="cb-down" ${editor.current >= editor.questions.length - 1 ? "disabled" : ""}>↓</button>
                <button type="button" class="cb-tool" id="cb-copy">複製</button>
                <button type="button" class="cb-tool cb-tool-danger" id="cb-delete">削除</button>
              </div>
            </div>
            <div class="cb-type-row">
              <label>タイプ
                <select id="cb-type">
                  <option value="multipleChoice"${q.type === "multipleChoice" ? " selected" : ""}>四択</option>
                  <option value="trueFalse"${q.type === "trueFalse" ? " selected" : ""}>○×</option>
                  <option value="typeAnswer"${q.type === "typeAnswer" ? " selected" : ""}>タイピング</option>
                  <option value="matching"${q.type === "matching" ? " selected" : ""}>マッチング</option>
                  <option value="wordOrder"${q.type === "wordOrder" ? " selected" : ""}>語順</option>
                </select>
              </label>
            </div>
            <textarea id="cb-prompt" class="cb-prompt" maxlength="160" placeholder="問題文">${escapeHtml(q.prompt)}</textarea>
            <div class="cb-meta-row">
              <label>制限時間
                <select id="cb-seconds">${TIMES.map((value) => `<option value="${value}"${value === Number(q.seconds) ? " selected" : ""}>${value}秒</option>`).join("")}</select>
              </label>
              <label>ポイント
                <select id="cb-points">${[50, 100, 200, 500, 1000].map((value) => `<option value="${value}"${value === Number(q.points) ? " selected" : ""}>${value}</option>`).join("")}</select>
              </label>
            </div>
            <div id="cb-answer-area"></div>
          </section>
          <aside class="cb-side">
            <h3>クラスの単語</h3>
            <p>宿題やレポートで使った単語を見て、クイズに使えます。</p>
            <select id="cb-class">
              <option value="">クラスを選ぶ</option>
              ${classes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title || "クラス")}</option>`).join("")}
            </select>
            <div class="cb-vocab" id="cb-vocab">${vocab.map((phrase) => `
              <button type="button" class="cb-chip" data-en="${escapeHtml(phrase.en)}" data-ja="${escapeHtml(phrase.ja)}">${escapeHtml(phrase.en)} / ${escapeHtml(phrase.ja)}</button>
            `).join("") || `<p>クラスを選ぶと単語が出ます。</p>`}</div>
          </aside>
        </div>
      </div>`;

    const rail = root.querySelector("#cb-rail");
    editor.questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cb-rail-item${index === editor.current ? " is-on" : ""}`;
      button.draggable = true;
      button.innerHTML = `<b>${index + 1}</b><small>${escapeHtml(question.prompt.trim() || "新しい問題")}</small>`;
      button.onclick = () => {
        readEditor();
        editor.current = index;
        note = "";
        paintEditor();
      };
      button.ondragstart = (event) => event.dataTransfer.setData("text/plain", String(index));
      button.ondragover = (event) => event.preventDefault();
      button.ondrop = (event) => {
        event.preventDefault();
        readEditor();
        const from = Number(event.dataTransfer.getData("text/plain"));
        const to = index;
        if (!Number.isInteger(from) || from === to) return;
        const [row] = editor.questions.splice(from, 1);
        editor.questions.splice(to, 0, row);
        editor.current = to;
        scheduleAutosave();
        paintEditor();
      };
      rail.appendChild(button);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "cb-rail-add";
    add.textContent = "＋ 問題を追加";
    add.onclick = () => {
      readEditor();
      if (editor.questions.length >= 30) {
        note = "問題は30問までです。";
        noteKind = "error";
        paintEditor();
        return;
      }
      editor.questions.push(blankQuestion());
      editor.current = editor.questions.length - 1;
      scheduleAutosave();
      paintEditor();
    };
    rail.appendChild(add);

    const area = root.querySelector("#cb-answer-area");
    if (q.type === "typeAnswer") {
      area.innerHTML = `<label>正解（改行で別解）<textarea id="cb-typed-answers" class="cb-prompt" placeholder="fish">${escapeHtml((q.answers || []).join("\n"))}</textarea></label>`;
    } else if (q.type === "matching") {
      area.innerHTML = `<div class="cb-q-list">${(q.pairs || []).map((pair, index) => `
        <div class="cb-q-item" data-pair>
          <input data-left placeholder="日本語" value="${escapeHtml(pair.left || "")}">
          <input data-right placeholder="English" value="${escapeHtml(pair.right || "")}">
        </div>`).join("")}
        <button type="button" class="cb-btn cb-btn-secondary" id="cb-add-pair">ペアを追加</button>
      </div>`;
      area.querySelector("#cb-add-pair").onclick = () => {
        readEditor();
        q.pairs.push({ left: "", right: "" });
        paintEditor();
      };
    } else if (q.type === "wordOrder") {
      area.innerHTML = `
        <label>単語（スペース区切り）<input id="cb-words" value="${escapeHtml((q.words || []).join(" "))}"></label>
        <label>正解の文<input id="cb-word-answer" value="${escapeHtml(q.answer || "")}"></label>`;
    } else {
      const choices = q.type === "trueFalse" ? ["○ ほんとう", "× うそ"] : q.choices;
      if (q.type === "trueFalse") q.choices = choices;
      area.innerHTML = `<div class="cb-answers" id="cb-answers"></div><p class="cb-sub">チェックを付けると、その答えが正解になります。</p>`;
      const grid = area.querySelector("#cb-answers");
      choices.slice(0, q.type === "trueFalse" ? 2 : 4).forEach((choice, index) => {
        const tile = document.createElement("div");
        const correct = q.type === "trueFalse" ? q.answer === choice : q.answer === index;
        tile.className = `cb-tile ${COLORS[index]}${correct ? " is-correct" : ""}`;
        tile.innerHTML = `<button type="button" class="cb-mark" aria-pressed="${correct}">${correct ? "✓" : ""}</button><span>${SHAPES[index]}</span><input data-choice maxlength="80" placeholder="答えを入力" value="${escapeHtml(choice)}" ${q.type === "trueFalse" ? "readonly" : ""}>`;
        tile.querySelector(".cb-mark").onclick = () => {
          readEditor();
          if (q.type === "trueFalse") q.answer = choice;
          else q.answer = index;
          scheduleAutosave();
          paintEditor();
        };
        tile.querySelector("[data-choice]").oninput = (event) => {
          q.choices[index] = event.target.value;
          scheduleAutosave();
        };
        grid.appendChild(tile);
      });
    }

    root.querySelector("#cb-home").onclick = () => {
      if (!confirmDiscard("保存していない変更があります。ホームに戻りますか？")) return;
      stop();
      root._stopQuiz = stop;
      view = "home";
      loadTemplates().then(paintHome);
    };
    root.querySelector("#cb-title").oninput = (event) => {
      editor.meta.title = event.target.value;
      scheduleAutosave();
    };
    root.querySelector("#cb-prompt").oninput = (event) => {
      q.prompt = event.target.value;
      const label = root.querySelector(".cb-rail-item.is-on small");
      if (label) label.textContent = event.target.value.trim() || "新しい問題";
      scheduleAutosave();
    };
    root.querySelector("#cb-type").onchange = (event) => {
      readEditor();
      editor.questions[editor.current] = blankQuestion(event.target.value);
      scheduleAutosave();
      paintEditor();
    };
    root.querySelector("#cb-seconds").onchange = scheduleAutosave;
    root.querySelector("#cb-points").onchange = scheduleAutosave;
    root.querySelector("#cb-up").onclick = () => moveQuestion(-1);
    root.querySelector("#cb-down").onclick = () => moveQuestion(1);
    root.querySelector("#cb-copy").onclick = () => {
      readEditor();
      editor.questions.splice(editor.current + 1, 0, JSON.parse(JSON.stringify(q)));
      editor.current += 1;
      scheduleAutosave();
      paintEditor();
    };
    root.querySelector("#cb-delete").onclick = () => {
      readEditor();
      if (editor.questions.length === 1) {
        note = "問題は1つ以上必要です。";
        noteKind = "error";
        paintEditor();
        return;
      }
      if (!window.confirm("この問題を削除しますか？")) return;
      editor.questions.splice(editor.current, 1);
      editor.current = Math.min(editor.current, editor.questions.length - 1);
      scheduleAutosave();
      paintEditor();
    };
    root.querySelector("#cb-save").onclick = () => saveEditor(false);
    root.querySelector("#cb-delete-template")?.addEventListener("click", () => {
      deleteTemplate({
        id: editor.id,
        title: editor.meta.title,
        ownerId: uid,
      });
    });
    root.querySelector("#cb-publish").onclick = async () => {
      readEditor();
      openPublishModal({ ...editor.meta, id: editor.id });
    };
    root.querySelector("#cb-room").onclick = async () => {
      readEditor();
      if (dirty() && !window.confirm("保存していない変更があります。この内容でルームを作りますか？")) return;
      await startRoom({
        id: editor.id,
        title: editor.meta.title,
        questions: editor.questions.map(pack),
      });
    };
    root.querySelector("#cb-class").onchange = async (event) => {
      await loadVocab(event.target.value);
      paintEditor();
      root.querySelector("#cb-class").value = event.target.value;
    };
    root.querySelectorAll(".cb-chip").forEach((chip) => {
      chip.onclick = () => {
        readEditor();
        const current = editor.questions[editor.current];
        if (!current.prompt) current.prompt = `${chip.dataset.en} は？`;
        else if (current.type === "multipleChoice") {
          const slot = current.choices.findIndex((choice) => !String(choice || "").trim());
          if (slot >= 0) current.choices[slot] = chip.dataset.ja;
          else current.choices[0] = chip.dataset.ja;
        } else if (current.type === "typeAnswer") {
          current.answers = [chip.dataset.en];
          current.answer = chip.dataset.en;
        }
        scheduleAutosave();
        paintEditor();
      };
    });
  };

  const moveQuestion = (dir) => {
    readEditor();
    const next = editor.current + dir;
    if (next < 0 || next >= editor.questions.length) return;
    const [row] = editor.questions.splice(editor.current, 1);
    editor.questions.splice(next, 0, row);
    editor.current = next;
    scheduleAutosave();
    paintEditor();
  };

  const startRoom = async (item) => {
    try {
      const questions = (item.questions || []).map((row) => (row.ok !== undefined ? row : pack(fromStored(row))));
      const ready = questions.filter((row) => row.prompt);
      const result = await callFunction("startCollabRoom", {
        templateId: item.id || "",
        title: item.title || editor?.meta?.title || "COllAB",
        questions: ready.length ? ready : undefined,
      });
      roomId = result.id;
      amHost = true;
      lockedChoice = "";
      lockedResult = "";
      view = "live";
      playTone("start");
      startCollabBgm();
      watchRoom();
    } catch (error) {
      note = error.message;
      noteKind = "error";
      if (view === "edit") paintEditor();
      else if (view === "preview") paintPreview();
      else paintHome();
    }
  };

  let joining = false;

  const enterJoinedRoom = async (result) => {
    roomId = result.id;
    amHost = false;
    lockedChoice = "";
    lockedResult = "";
    lastPoints = 0;
    lastCorrect = null;
    players = [{
      id: uid,
      name: result.name,
      ballColor: result.ballColor,
      ballSize: result.ballSize,
      score: 0,
      answeredIndex: -1,
    }];
    view = "live";
    playTone("start");
    stopCollabBgm();
    watchRoom();
  };

  const paintJoinName = (code, joinNote = "") => {
    setPresentStage(`
          <h2 class="cb-brand">COllAB</h2>
          <p class="cb-sub">おなまえを入力してね！</p>
          <input id="cb-join-name" class="cb-name-bubble" maxlength="12" placeholder="なまえ" autocomplete="nickname" enterkeyhint="done">
          <button type="button" class="cb-btn cb-btn-primary" id="cb-join-go">参加する</button>
          <button type="button" class="cb-btn cb-btn-ghost" id="cb-join-back-pin">← コードにもどる</button>
          <p class="cb-save-note${joinNote ? " is-error" : ""}">${escapeHtml(joinNote)}</p>`, "cb-join-page");
    const nameInput = root.querySelector("#cb-join-name");
    const go = async () => {
      if (joining) return;
      joining = true;
      const button = root.querySelector("#cb-join-go");
      if (button) button.disabled = true;
      try {
        const result = await callFunction("joinQuiz", {
          code,
          nickname: nameInput?.value || "",
        });
        joining = false;
        await enterJoinedRoom(result);
      } catch (error) {
        joining = false;
        paintJoinName(code, error.message);
      }
    };
    root.querySelector("#cb-join-go")?.addEventListener("click", go);
    nameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") go();
    });
    root.querySelector("#cb-join-back-pin")?.addEventListener("click", () => {
      paintJoin(code);
    });
    nameInput?.focus();
  };

  const paintJoin = (presetCode = "", joinNote = "") => {
    joining = false;
    setPresentStage(`
          <h2 class="cb-brand">COllAB</h2>
          <p class="cb-sub">先生のルームコードを入れて参加しよう！</p>
          <input id="cb-join-pin" class="cb-name-bubble cb-join-pin" inputmode="numeric" maxlength="8" placeholder="6けたのコード" value="${escapeHtml(presetCode)}" autocomplete="one-time-code">
          <button type="button" class="cb-btn cb-btn-primary" id="cb-join-next">つぎへ</button>
          <p class="cb-save-note${joinNote ? " is-error" : ""}">${escapeHtml(joinNote)}</p>
          ${host ? `<button type="button" class="cb-back" id="cb-back-home">← ホーム</button>` : ""}`, "cb-join-page");
    const pinInput = root.querySelector("#cb-join-pin");
    const goNext = async () => {
      const code = String(pinInput?.value || "").replace(/\s+/g, "");
      if (!code) {
        paintJoin("", "コードを入力してね。");
        return;
      }
      const button = root.querySelector("#cb-join-next");
      if (button) button.disabled = true;
      try {
        await callFunction("lookupCollabRoom", { code });
        paintJoinName(code);
      } catch (error) {
        paintJoin(code, error.message);
      }
    };
    root.querySelector("#cb-join-next")?.addEventListener("click", goNext);
    pinInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") goNext();
    });
    root.querySelector("#cb-back-home")?.addEventListener("click", () => {
      view = "home";
      paintHome();
    });
    pinInput?.focus();
    if (pinInput && presetCode) pinInput.select();
  };

  const rankedPlayers = () => {
    const base = Array.isArray(roomData.ranking) && roomData.ranking.length
      ? roomData.ranking
      : [...players]
        .filter((player) => player.id !== roomData.hostId)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.name || "").localeCompare(String(b.name || ""), "ja"));
    return base.map((player, index) => {
      const live = players.find((row) => row.id === player.id) || {};
      const rankScore = Number(player.score);
      const liveScore = Number(live.score);
      const score = Math.max(
        Number.isFinite(rankScore) ? rankScore : 0,
        Number.isFinite(liveScore) ? liveScore : 0,
      );
      return {
        ...live,
        ...player,
        place: index + 1,
        ballColor: player.ballColor || live.ballColor || "#C9EBD8",
        correctCount: Math.max(Number(player.correctCount || 0), Number(live.correctCount || 0)),
        score,
        name: player.name || live.name || "プレイヤー",
      };
    });
  };

  const playerInitials = (name) => {
    const text = String(name || "?").trim();
    if (!text) return "?";
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    return text.slice(0, 2);
  };

  const accuracyPct = (correct, total) => {
    if (!total) return 0;
    return Math.round((Math.max(0, Number(correct) || 0) / total) * 100);
  };

  const medalFor = (place) => ({ 1: "🥇", 2: "🥈", 3: "🥉" }[place] || String(place));

  const studentResultMarkup = ({
    name,
    initials,
    color,
    place,
  }) => {
    const medal = place > 0 && place <= 3 ? medalFor(place) : "";
    const placeLabel = place > 0 ? `${place}位` : "—";
    const displayName = escapeHtml(name || "プレイヤー");
    return `
        <div class="cb-burst" aria-hidden="true"></div>
        <div class="cb-student-card" style="--ball:${escapeHtml(color)}">
          <div class="cb-student-hero">
            <div class="cb-student-sparkles" aria-hidden="true"></div>
            <div class="cb-student-avatar">${escapeHtml(initials)}</div>
          </div>
          <h2 class="cb-finish-title">Amazing Job ${displayName}!</h2>
          <div class="cb-student-place${place > 0 && place <= 3 ? ` is-top-${place}` : ""}">
            ${medal ? `<span class="cb-student-medal" aria-hidden="true">${medal}</span>` : ""}
            <strong>${placeLabel}</strong>
          </div>
          <button type="button" class="cb-btn cb-student-rejoin" id="cb-student-rejoin">べつのクイズに参加</button>
        </div>`;
  };

  const buildPodiumCard = (player, placeClass, delay) => {
    if (!player) return `<div class="cb-podium-slot is-empty ${placeClass}" aria-hidden="true"></div>`;
    const place = Number(player.place || 0);
    const badge = place <= 3
      ? `<span class="cb-podium-badge is-${place}"><span class="cb-podium-medal" aria-hidden="true">${medalFor(place)}</span><strong>${place}位</strong></span>`
      : `<span class="cb-podium-badge"><strong>${place}位</strong></span>`;
    return `
      <div class="cb-podium-slot ${placeClass}${player.id === uid ? " is-me" : ""}" style="--delay:${delay}s">
        <div class="cb-podium-card">
          ${badge}
          <strong class="cb-podium-name">${escapeHtml(player.name || "プレイヤー")}</strong>
          <p class="cb-podium-score"><em>${Number(player.score || 0)}</em><span>ポイント</span></p>
        </div>
      </div>`;
  };

  const bindAdvance = (selector = "#cb-next") => {
    root.querySelector(selector)?.addEventListener("click", async () => {
      const button = root.querySelector(selector);
      if (button) button.disabled = true;
      try {
        await callFunction("advanceQuiz", { roomId, questionIndex: roomData.questionIndex });
        playTone("start");
      } catch (error) {
        note = error.message;
        if (button) button.disabled = false;
      }
    });
  };

  const presentLabel = () => (amHost ? "プレゼン" : "全画面");

  const presentButton = () => (
    `<button type="button" class="cb-btn cb-btn-ghost cb-present-btn" id="cb-present" title="${presenting ? "全画面をやめる" : "全画面表示"}">${presenting ? "✕ 終了" : `⛶ ${presentLabel()}`}</button>`
  );

  const syncPresentButton = (button) => {
    if (!button) return;
    button.textContent = presenting ? "✕ 終了" : `⛶ ${presentLabel()}`;
    button.title = presenting ? "全画面をやめる" : "全画面表示";
  };

  const soundMuted = () => !collabSoundEnabled();
  const soundIconSvg = (muted) => muted
    ? `<svg class="cb-sound-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m23 9-6 6M17 9l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    : `<svg class="cb-sound-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const soundButton = () => {
    const muted = soundMuted();
    return `<button type="button" class="cb-btn cb-btn-ghost cb-sound-btn${muted ? " is-muted" : ""}" id="cb-sound" aria-pressed="${muted ? "true" : "false"}" title="${muted ? "BGMをオン" : "BGMをミュート"}" aria-label="${muted ? "BGMをオン" : "BGMをミュート"}">${soundIconSvg(muted)}</button>`;
  };
  const syncSoundButton = (button) => {
    if (!button) return;
    const muted = soundMuted();
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.title = muted ? "BGMをオン" : "BGMをミュート";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = soundIconSvg(muted);
  };
  const bindSound = () => {
    const button = root.querySelector("#cb-sound");
    if (!button || button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      const next = soundMuted() ? "on" : "off";
      localStorage.setItem("cb-sound", next);
      syncSoundButton(button);
      const status = roomData.status || "lobby";
      if (next === "off") stopCollabBgm();
      else syncCollabBgm(status, { asHost: amHost });
    });
  };

  const bindPresent = () => {
    const stage = root.querySelector("#cb-present-stage");
    const button = root.querySelector("#cb-present");
    if (!stage || !button || button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      if (presenting) {
        presenting = false;
        presentRepaint = false;
        stage.classList.remove("is-present");
        try {
          if (document.fullscreenElement === stage) await document.exitFullscreen?.();
        } catch { /* ignore */ }
        syncPresentButton(button);
        lobbyPhysics?.resize?.();
        return;
      }
      presenting = true;
      syncPresentButton(button);
      try {
        await stage.requestFullscreen?.();
        stage.classList.add("is-present");
      } catch {
        stage.classList.add("is-present");
      }
      lobbyPhysics?.resize?.();
    });
  };

  /** Keep one stage node so requestFullscreen survives phase paints. */
  const setPresentStage = (innerHtml, sectionClass = "cb-live") => {
    let stage = root.querySelector("#cb-present-stage");
    if (!stage) {
      root.innerHTML = `<section class="cb-present-root ${sectionClass}" id="cb-present-stage"></section>`;
      stage = root.querySelector("#cb-present-stage");
    }
    const classes = ["cb-present-root", ...String(sectionClass || "").split(/\s+/).filter(Boolean)];
    if (presenting) classes.push("is-present");
    stage.className = [...new Set(classes)].join(" ");
    stage.id = "cb-present-stage";

    const keep = new Set(["cb-present", "cb-sound"]);
    [...stage.children].forEach((child) => {
      if (!keep.has(child.id)) child.remove();
    });

    const holder = document.createElement("div");
    holder.innerHTML = innerHtml;
    while (holder.firstChild) stage.appendChild(holder.firstChild);

    let button = stage.querySelector("#cb-present");
    if (!button) {
      stage.insertAdjacentHTML("afterbegin", presentButton());
      button = stage.querySelector("#cb-present");
      bindPresent();
    } else {
      syncPresentButton(button);
      if (button.dataset.bound !== "1") bindPresent();
    }

    if (amHost) {
      let sound = stage.querySelector("#cb-sound");
      if (!sound) {
        stage.insertAdjacentHTML("afterbegin", soundButton());
        sound = stage.querySelector("#cb-sound");
        bindSound();
      } else {
        syncSoundButton(sound);
        if (sound.dataset.bound !== "1") bindSound();
      }
    } else {
      stage.querySelector("#cb-sound")?.remove();
    }
    return stage;
  };

  if (!root._cbPresentFsBound) {
    root._cbPresentFsBound = true;
    document.addEventListener("fullscreenchange", () => {
      const stage = root.querySelector("#cb-present-stage");
      if (document.fullscreenElement === stage) {
        presenting = true;
        stage?.classList.add("is-present");
        syncPresentButton(root.querySelector("#cb-present"));
        return;
      }
      if (presentRepaint) return;
      if (!presenting) return;
      // Esc / browser exit — keep CSS present only if we still intend to present
      // and fullscreen was lost for another reason; Esc clears intent.
      if (!document.fullscreenElement) {
        presenting = false;
        stage?.classList.remove("is-present");
        syncPresentButton(root.querySelector("#cb-present"));
      }
    });
  }

  const paintLive = () => {
    const questionsLive = roomData.questions || [];
    const index = roomData.questionIndex ?? -1;
    const question = questionsLive[index];
    const status = roomData.status || "lobby";
    const students = players.filter((player) => player.id !== roomData.hostId);
    syncCollabBgm(status, { asHost: amHost });

    if (!roomData.code && status !== "done" && status !== "final_results") {
      if (!(amHost && root.querySelector("#cb-present-stage"))) {
        root.innerHTML = `<p class="cb-sub">読み込んでいます。</p>`;
      }
      return;
    }

    if (status === "lobby") {
      if (!amHost) {
        const mine = players.find((player) => player.id === uid) || {};
        setPresentStage(`
            <h2 class="cb-brand">GET READY!</h2>
            <p class="cb-sub">${escapeHtml(mine.name || "プレイヤー")}さん、じゅんびはいい？</p>
            <div class="cb-ball-me" style="--size:${Number(mine.ballSize || 88)}px;background:${escapeHtml(mine.ballColor || "#C9EBD8")}">${escapeHtml(String(mine.name || "?").slice(0, 6))}</div>
            <p class="cb-sub">先生がゲームを始めるまで待ってね！</p>`, "cb-lobby");
        return;
      }
      const link = joinUrl(roomData.code || "");
      const keepCanvas = root.querySelector("#cb-pit");
      if (!keepCanvas) {
        lobbyPhysics?.destroy?.();
        lobbyPhysics = null;
        setPresentStage(`
            <div class="cb-lobby-join-block">
              <p class="cb-sub">参加コード</p>
              <p class="cb-pin" id="cb-pin">${escapeHtml(roomData.code || "")}</p>
              <img class="cb-qr" alt="QR" src="${qrUrl(link)}">
              <p class="cb-sub" id="cb-count">${students.length} 人参加中</p>
              <p class="cb-sub cb-lobby-quiz">${escapeHtml(roomData.title || "COllAB")}</p>
              <button type="button" class="cb-btn cb-btn-primary cb-lobby-start" id="cb-next">スタート</button>
            </div>
            <div class="cb-lobby-space" aria-hidden="true">
              <canvas id="cb-pit"></canvas>
            </div>`, "cb-lobby cb-lobby-host");
        const canvas = root.querySelector("#cb-pit");
        lobbyPhysics = createBallLobby(canvas);
        bindAdvance();
        const pushBalls = () => {
          lobbyPhysics?.resize?.();
          lobbyPhysics?.sync(students);
        };
        pushBalls();
        requestAnimationFrame(pushBalls);
        setTimeout(pushBalls, 120);
      } else {
        const pin = root.querySelector("#cb-pin");
        const count = root.querySelector("#cb-count");
        const quiz = root.querySelector(".cb-lobby-quiz");
        if (pin) pin.textContent = roomData.code || "";
        if (count) count.textContent = `${students.length} 人参加中`;
        if (quiz) quiz.textContent = roomData.title || "COllAB";
        const stage = root.querySelector("#cb-present-stage") || root.querySelector(".cb-lobby-host");
        if (stage && !stage.id) stage.id = "cb-present-stage";
        stage?.classList.add("cb-present-root");
        if (presenting) stage?.classList.add("is-present");
        if (!root.querySelector("#cb-present")) {
          stage?.insertAdjacentHTML("afterbegin", presentButton());
        }
        bindPresent();
        syncPresentButton(root.querySelector("#cb-present"));
        if (amHost) {
          if (!root.querySelector("#cb-sound")) {
            stage?.insertAdjacentHTML("afterbegin", soundButton());
          }
          bindSound();
          syncSoundButton(root.querySelector("#cb-sound"));
        }
        lobbyPhysics?.resize?.();
        lobbyPhysics?.sync(students);
      }
      return;
    }

    lobbyPhysics?.destroy?.();
    lobbyPhysics = null;

    if (status === "intro" && question) {
      setPresentStage(`
          <p class="cb-sub">問題 ${index + 1} / ${questionsLive.length}</p>
          <h2 class="cb-question">${escapeHtml(question.prompt)}</h2>
          <div class="cb-timer"><span id="cb-clock"></span></div>
          ${amHost ? "" : `<p class="cb-sub">もうすぐ答えが出るよ</p>`}`, "cb-live");
      armClock(roomData.introEndsAt, 3000);
      return;
    }

    if (status === "question" && question) {
      if (amHost) {
        const answered = students.filter((player) => Number(player.answeredIndex) === index).length;
        setPresentStage(`
            <div class="cb-timer"><span id="cb-clock"></span></div>
            <p class="cb-sub">問題 ${index + 1} / ${questionsLive.length} ・ ${answered} / ${students.length} 人が回答</p>
            <h2 class="cb-question">${escapeHtml(question.prompt)}</h2>
            <div class="cb-answer-grid">${(question.choices || []).map((choice, choiceIndex) => `
              <div class="cb-answer ${COLORS[choiceIndex] || ""}"><span>${SHAPES[choiceIndex] || ""}</span><span>${escapeHtml(choice)}</span></div>
            `).join("")}</div>
            <button type="button" class="cb-btn cb-btn-primary" id="cb-reveal">答えを見せる</button>`, "cb-live");
        root.querySelector("#cb-reveal")?.addEventListener("click", async () => {
          try {
            await callFunction("advanceQuiz", { roomId, questionIndex: index });
          } catch (error) {
            note = error.message;
          }
        });
      } else {
        const answered = Boolean(lockedChoice) || Number(root._playerAnswered) === index;
        if (answered) {
          setPresentStage(`
              <div class="cb-timer"><span id="cb-clock"></span></div>
              <section class="cb-wait-card">
                <p class="cb-wait-copy">答えをおくったよ・・・</p>
                ${lockedResult && !lockedResult.includes("おくった") && !lockedResult.includes("送った")
                  ? `<p class="cb-save-note is-error">${escapeHtml(lockedResult)}</p>`
                  : ""}
              </section>`, "cb-live");
        } else {
          setPresentStage(`
              <div class="cb-timer"><span id="cb-clock"></span></div>
              <p class="cb-sub">問題 ${index + 1} / ${questionsLive.length}</p>
              <h2 class="cb-question">${escapeHtml(question.prompt)}</h2>
              <div class="cb-answer-grid" id="cb-board"></div>`, "cb-live");
          const board = root.querySelector("#cb-board");
          (question.choices || []).forEach((choice, choiceIndex) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `cb-answer ${COLORS[choiceIndex] || ""}`;
            button.innerHTML = `<span>${SHAPES[choiceIndex] || ""}</span><span>${escapeHtml(choice)}</span>`;
            button.onclick = async () => {
              if (lockedChoice || Number(root._playerAnswered) === index) return;
              lockedChoice = choice;
              lockedResult = "答えをおくったよ・・・";
              paintLive();
              try {
                const result = await callFunction("submitQuizAnswer", { roomId, choice, questionIndex: index });
                if (result.duplicate) {
                  /* keep local answer state */
                } else if (result.expired) {
                  lastCorrect = false;
                  lastPoints = 0;
                  playTone("bad");
                } else if (result.closed) {
                  lastCorrect = null;
                } else {
                  lastPoints = Number(result.points || 0);
                  lastCorrect = Boolean(result.correct);
                  playTone(result.correct ? "ok" : "bad");
                }
                if (!result.expired && !result.closed) syncRoom();
              } catch (error) {
                lockedResult = error.message;
                paintLive();
              }
            };
            board.appendChild(button);
          });
        }
      }
      armClock(roomData.questionEndsAt, (Number(question.timeLimitSec) || 20) * 1000);
      return;
    }

    if (status === "reveal" && question) {
      const answer = roomData.revealedAnswer || "";
      const counts = Array.isArray(roomData.choiceCounts) ? roomData.choiceCounts : [];
      const total = counts.reduce((sum, count) => sum + (Number(count) || 0), 0) || 1;
      const mine = players.find((player) => player.id === uid) || {};
      const myChoice = lockedChoice
        || (Number(mine.answeredIndex) === index ? (mine.choice || "") : "");
      const matchesAnswer = Boolean(
        myChoice && String(myChoice).trim().toLowerCase() === String(answer).trim().toLowerCase(),
      );
      const gotIt = lastCorrect == null ? matchesAnswer : lastCorrect === true;
      const points = gotIt ? Number(lastPoints || mine.lastPoints || 0) : 0;
      if (amHost) {
        setPresentStage(`
            <p class="cb-sub">問題 ${index + 1} / ${questionsLive.length}</p>
            <h2 class="cb-question">${escapeHtml(question.prompt)}</h2>
            <p class="cb-sub">正解は ${escapeHtml(answer)}！</p>
            <div class="cb-answer-grid">${(question.choices || []).map((choice, choiceIndex) => {
              const count = Number(counts[choiceIndex] || 0);
              const share = Math.round((count / total) * 100);
              const correct = String(choice).trim().toLowerCase() === String(answer).trim().toLowerCase();
              return `<div class="cb-answer ${COLORS[choiceIndex] || ""}${correct ? " is-correct" : " is-dim"}" style="--share:${share}%"><span>${correct ? "✓" : (SHAPES[choiceIndex] || "")}</span><span>${escapeHtml(choice)}</span><strong>${count}</strong><span class="cb-meter"></span></div>`;
            }).join("")}</div>
            <button type="button" class="cb-btn cb-btn-primary" id="cb-next">次へ</button>`, "cb-live");
        bindAdvance();
        return;
      }
      setPresentStage(`
          <h2 class="cb-question">${escapeHtml(question.prompt)}</h2>
          <p class="cb-banner ${gotIt ? "is-ok" : "is-bad"}">${gotIt ? "せいかい！" : "ふせいかい"}</p>
          <p class="cb-pin" style="font-size:clamp(1.8rem,6vw,2.6rem);letter-spacing:0.04em;">+${points}</p>
          <p class="cb-sub">てん</p>`, "cb-live");
      return;
    }

    if (status === "leaderboard") {
      const ranked = rankedPlayers();
      if (amHost) {
        setPresentStage(`
          <h2 class="cb-brand">リーダーボード</h2>
          <ol class="cb-rank-list">${ranked.map((player) => `<li class="${player.id === uid ? "is-me" : ""}"><span>${player.place}</span><strong>${escapeHtml(player.name || "プレイヤー")}</strong><em>${Number(player.score || 0)}</em></li>`).join("")}</ol>
          <button type="button" class="cb-btn cb-btn-primary" id="cb-next">${index + 1 >= questionsLive.length ? "結果を表示" : "次の問題へ"}</button>`, "cb-live");
        bindAdvance();
      } else {
        setPresentStage(`
            <h2 class="cb-brand">リーダーボード</h2>
            <ol class="cb-rank-list">${ranked.map((player) => `<li class="${player.id === uid ? "is-me" : ""}"><span>${player.place}</span><strong>${escapeHtml(player.name || "プレイヤー")}</strong><em>${Number(player.score || 0)}</em></li>`).join("")}</ol>
            <p class="cb-sub">つぎの問題を待ってね</p>`, "cb-live");
      }
      return;
    }

    if (status === "final_results" || status === "done" || !question) {
      const ranked = rankedPlayers();
      const qTotal = questionsLive.length || Number(roomData.questionCount || 0) || 0;
      const first = ranked[0] || null;
      const second = ranked[1] || null;
      const third = ranked[2] || null;
      const avgAccuracy = ranked.length
        ? Math.round(ranked.reduce((sum, row) => sum + accuracyPct(row.correctCount, qTotal), 0) / ranked.length)
        : 0;
      const topScore = first ? Number(first.score || 0) : 0;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!amHost) {
        const mine = ranked.find((player) => player.id === uid)
          || players.find((player) => player.id === uid)
          || {};
        const place = Number(mine.place || (ranked.findIndex((row) => row.id === uid) + 1) || 0);
        setPresentStage(studentResultMarkup({
          name: mine.name || "プレイヤー",
          initials: playerInitials(mine.name || "？"),
          color: mine.ballColor || "#C9EBD8",
          place,
        }), "cb-live cb-finish cb-finish-student");
        root.querySelector("#cb-student-rejoin")?.addEventListener("click", () => {
          stopLive();
          roomId = "";
          roomData = {};
          players = [];
          note = "";
          noteKind = "";
          view = "join";
          paintJoin();
        });
        playTone("done");
        return;
      }

      setPresentStage(`
          <div class="cb-burst" aria-hidden="true"></div>
          <div class="cb-finish-deco" aria-hidden="true"></div>
          <div class="cb-finish-sparkles" aria-hidden="true"></div>
          <div class="cb-finish-hero">
            <p class="cb-finish-kicker">${escapeHtml(roomData.title || "COllAB")}</p>
            <h2 class="cb-finish-title"><span aria-hidden="true">✨</span> Rankings! <span aria-hidden="true">🎉</span></h2>
            <p class="cb-finish-sub">Well done everyone!</p>
          </div>
          <div class="cb-podium" data-count="${Math.min(3, ranked.length)}">
            ${ranked.length === 1
              ? buildPodiumCard(first, "is-1 is-solo", 0.2)
              : `${buildPodiumCard(second, "is-2", 0.15)}${buildPodiumCard(first, "is-1", 0.45)}${buildPodiumCard(third, "is-3", 0.05)}`}
          </div>
          <div class="cb-finish-stats">
            <div class="cb-stat is-peach" style="--d:0.05s"><strong>${ranked.length}</strong><span>参加人数</span></div>
            <div class="cb-stat is-lemon" style="--d:0.12s"><strong>${qTotal}</strong><span>問題数</span></div>
            <div class="cb-stat is-mint" style="--d:0.19s"><strong>${avgAccuracy}%</strong><span>平均正解率</span></div>
            <div class="cb-stat is-sky" style="--d:0.26s"><strong>${topScore}</strong><span>最高得点</span></div>
          </div>
          <div class="cb-board-wrap">
            <div class="cb-board-head">
              <span>じゅんい</span>
              <span>なまえ</span>
              <span>てんすう</span>
              <span>せいかい</span>
            </div>
            <ol class="cb-board-list">${ranked.map((player) => `
              <li class="${player.id === uid ? "is-me" : ""}${player.place <= 3 ? ` is-top-${player.place}` : ""}">
                <span class="cb-board-rank${player.place <= 3 ? ` is-badge is-${player.place}` : ""}">${player.place <= 3 ? medalFor(player.place) : player.place}</span>
                <span class="cb-board-player">
                  <span class="cb-board-dot" style="background:${escapeHtml(player.ballColor || "#C9EBD8")}">${escapeHtml(playerInitials(player.name))}</span>
                  <strong>${escapeHtml(player.name || "プレイヤー")}</strong>
                </span>
                <em class="cb-board-score">${Number(player.score || 0)}</em>
                <span class="cb-board-acc">${accuracyPct(player.correctCount, qTotal)}%</span>
              </li>`).join("") || `<li class="cb-board-empty">
                <span class="cb-board-empty-art" aria-hidden="true"></span>
                <strong>まだランキングがありません</strong>
                <span>クイズがおわると、ここにじゅんいがひょうじされます</span>
              </li>`}
            </ol>
          </div>
          <div class="cb-finish-actions">
            ${roomData.templateId ? `<button type="button" class="cb-btn cb-finish-primary" id="cb-replay">もう一度プレイ</button>` : ""}
            <button type="button" class="cb-btn cb-finish-secondary" id="cb-save-session">結果を保存</button>
            <button type="button" class="cb-btn cb-finish-ghost" id="cb-new">COllABホームへ</button>
          </div>
          <p class="cb-save-note${noteKind ? ` is-${noteKind}` : ""}">${escapeHtml(note)}</p>`, `cb-live cb-finish${reduceMotion ? " is-reduced" : ""}`);

      root.querySelector("#cb-save-session")?.addEventListener("click", async () => {
        const button = root.querySelector("#cb-save-session");
        if (button) button.disabled = true;
        try {
          await callFunction("saveCollabSession", { roomId });
          note = "結果を保存しました。";
          noteKind = "ok";
          await loadSessions();
        } catch (error) {
          note = error.message;
          noteKind = "error";
        }
        paintLive();
      });
      root.querySelector("#cb-replay")?.addEventListener("click", async () => {
        const button = root.querySelector("#cb-replay");
        if (button) button.disabled = true;
        try {
          stopLive();
          note = "";
          noteKind = "";
          await startRoom({
            id: roomData.templateId || "",
            title: roomData.title || "COllAB",
            questions: [],
          });
        } catch (error) {
          note = error.message;
          noteKind = "error";
          if (button) button.disabled = false;
          paintLive();
        }
      });
      root.querySelector("#cb-new")?.addEventListener("click", () => {
        stopLive();
        roomId = "";
        roomData = {};
        players = [];
        note = "";
        noteKind = "";
        view = "home";
        loadTemplates().then(paintHome);
      });
      playTone("done");
    }
  };

  const syncRoom = async () => {
    if (!roomId || !["question", "intro"].includes(roomData.status)) return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    const questionIndex = roomData.questionIndex;
    syncing = true;
    try {
      await callFunction("syncQuizRoom", { roomId, questionIndex });
    } catch {
      /* ignore transient */
    } finally {
      syncing = false;
      if (syncAgain) {
        syncAgain = false;
        syncRoom();
      }
    }
  };

  const armClock = (endsAt, fullMs) => {
    stopClock();
    if (view !== "live" || !endsAt) return;
    const gen = clockGen;
    const ends = Number(endsAt);
    const full = Math.max(1, fullMs || 1000);
    let synced = false;
    const frame = () => {
      if (gen !== clockGen) return;
      const bar = root.querySelector("#cb-clock");
      const left = ends - Date.now();
      const ratio = Math.max(0, Math.min(1, left / full));
      if (bar) bar.style.transform = `scaleX(${ratio})`;
      if (left <= 0) {
        if (!synced) {
          synced = true;
          syncRoom();
        }
        clockTimer = setTimeout(frame, 800);
        return;
      }
      clock = requestAnimationFrame(frame);
    };
    frame();
  };

  const maybeAdvance = () => {
    const index = roomData.questionIndex;
    if (roomData.status !== "question" || !players.length) return;
    const students = players.filter((player) => player.id !== roomData.hostId);
    if (students.length && students.every((player) => Number(player.answeredIndex) === index)) syncRoom();
  };

  const watchRoom = () => {
    stopLive({ keepPresent: true });
    if (!root.querySelector("#cb-present-stage")) {
      root.innerHTML = `<p class="cb-sub">読み込んでいます。</p>`;
    }
    stopRoom = onSnapshot(doc(db, "quizRooms", roomId), (snap) => {
      const data = snap.data() || {};
      if (data.questionIndex !== roomData.questionIndex) {
        lockedChoice = "";
        lockedResult = "";
        lastPoints = 0;
        lastCorrect = null;
      }
      roomData = data;
      if (view === "live") paintLive();
    }, (error) => {
      root.innerHTML = `<p class="cb-save-note is-error">${escapeHtml(error.message)}</p>`;
    });
    if (amHost) {
      stopPlayers = onSnapshot(collection(db, "quizRooms", roomId, "players"), (snap) => {
        players = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (view === "live") paintLive();
        maybeAdvance();
      }, () => {});
    } else {
      stopPlayers = onSnapshot(doc(db, "quizRooms", roomId, "players", uid), (snap) => {
        const minePlayer = snap.data();
        players = minePlayer ? [{ id: uid, ...minePlayer }] : [];
        root._playerAnswered = minePlayer?.answeredIndex;
        if (typeof minePlayer?.lastPoints === "number"
          && Number(minePlayer.answeredIndex) === Number(roomData.questionIndex)) {
          lastPoints = Number(minePlayer.lastPoints);
          if (lockedChoice || minePlayer.choice) {
            const answer = String(roomData.revealedAnswer || "").trim().toLowerCase();
            if (answer) {
              lastCorrect = String(lockedChoice || minePlayer.choice).trim().toLowerCase() === answer;
            }
          }
        }
        if (view === "live") paintLive();
      });
    }
    root._stopQuiz = stop;
  };

  const paintSession = (session) => {
    root.innerHTML = `
      <div class="cb-app cb-results">
        <button type="button" class="cb-back" id="cb-back">← 戻る</button>
        <h2>${escapeHtml(session.title || "けっか")}</h2>
        <div class="cb-card-meta">
          <span class="cb-pill">${Number(session.participantCount || 0)}人</span>
          <span>${Number(session.questionCount || 0)}問</span>
        </div>
        <ol class="cb-rank-list">${(session.ranking || []).map((player, index) => `
          <li><span>${index + 1}</span><strong>${escapeHtml(player.name || "プレイヤー")}</strong><em>${Number(player.score || 0)}</em></li>
        `).join("")}</ol>
      </div>`;
    root.querySelector("#cb-back").onclick = () => {
      tab = "results";
      view = "home";
      paintHome();
    };
  };

  // boot
  if (!host) {
    paintJoin();
    return;
  }
  root.innerHTML = `<p class="cb-sub">COllAB を読み込んでいます…</p>`;
  try {
    const results = await Promise.allSettled([
      loadTemplates(),
      loadFavorites(),
      loadSessions(),
      loadClasses(),
    ]);
    const failed = results.find((item) => item.status === "rejected");
    if (failed && results.every((item) => item.status === "rejected")) {
      throw failed.reason;
    }
    if (failed) {
      note = failed.reason?.message || "一部のデータを読めませんでした。";
      noteKind = "error";
    }
    if (isOwner && !templates.some((item) => item.official)) {
      try {
        await callFunction("seedOfficialCollabTemplates", {});
        await loadTemplates();
      } catch {
        /* seed optional */
      }
    }
    paintHome();
  } catch (error) {
    root.innerHTML = `
      <div class="cb-app">
        <h2 class="cb-brand">COllAB</h2>
        <p class="cb-save-note is-error">${escapeHtml(error.message || "読み込みに失敗しました。")}</p>
        <button type="button" class="cb-btn cb-btn-primary" id="cb-boot-retry">もう一度試す</button>
      </div>`;
    root.querySelector("#cb-boot-retry")?.addEventListener("click", () => {
      renderCollab(root, { host, uid, role });
    });
  }
}
