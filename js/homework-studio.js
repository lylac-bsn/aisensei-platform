import { doc, getDoc, getDocs, query, collection, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  parseVocabulary,
  generateHomework,
  regenerateAt,
  updateSentence,
  gradeAnswer,
  toPublic,
} from "./homework-engine.js?v=20261026-homework";
import { mountHomeworkPlayer } from "./homework-play.js?v=20261026-retry";
import { stopPrompt } from "./homework-audio.js?v=20261026-retry";
import { linesForQuestions, prepareHomeworkVoice } from "./homework-voice-bank.js?v=20261026-retry";
import { RETRY_LINES } from "./homework-voice-lines.js?v=20261026-retry";

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
  };
  root._confirmLeave = () => !state.dirty || window.confirm("編集中の宿題を捨てますか？");
  root.replaceChildren();
  const studio = document.createElement("div");
  const stage = document.createElement("div");
  stage.hidden = true;
  root.append(studio, stage);

  studio.innerHTML = `
    <div class="hw-tabs">
      <button type="button" class="hw-tab is-current" data-tab="homework">宿題</button>
      <button type="button" class="hw-tab" data-tab="report">レポート</button>
    </div>
    <div class="hw-layout">
      <form class="hw-card" id="hw-form">
        <h2>単語から宿題をつくる</h2>
        <p class="hw-help">日本語と英語をそれぞれ入力します。すでにある一覧は、そのまま貼り付けても分けて入ります。</p>
        <div class="hw-fields">
          <label>タイトル <input id="hw-title" type="text" maxlength="80" value="きょうのしゅくだい"></label>
          <label>レベル
            <select id="hw-level">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label>問題数 <input id="hw-count" type="number" min="1" max="24" placeholder="おまかせ"></label>
          <div class="hw-span hw-words">
            <div class="hw-word-head"><span>日本語</span><span>英語</span></div>
            <div id="hw-words"></div>
            <div class="hw-actions">
              <button type="button" class="hw-quiet" id="hw-add-word">＋ 単語を追加</button>
              <button type="button" class="hw-quiet" id="hw-sample">例を入れる</button>
            </div>
          </div>
        </div>
        <div class="hw-types">
          <label class="hw-checkline"><input type="checkbox" data-type="multipleChoice" checked> 4択</label>
          <label class="hw-checkline"><input type="checkbox" data-type="matching" checked> 線つなぎ</label>
          <label class="hw-checkline"><input type="checkbox" data-type="spelling" checked> スペリング</label>
          <label class="hw-checkline"><input type="checkbox" data-type="sentence" checked> 文づくり</label>
        </div>
        <label class="hw-checkline"><input id="hw-hints" type="checkbox" checked> はじめの文字をヒントにする</label>
        <label>文づくり
          <select id="hw-direction">
            <option value="ja-to-en">日本語を見て英語を並べる</option>
            <option value="en-to-ja">英語を見て日本語を並べる</option>
          </select>
        </label>
        <div class="hw-actions">
          <button type="button" class="hw-primary" id="hw-generate">宿題をつくる</button>
        </div>
        <p class="hw-help">「宿題をつくる」で、問題と単語の声をLearnyの声であらかじめ作ります。単語を押すとその声が流れます。</p>
        <div id="hw-classes"></div>
        <label>期日 <input id="hw-due" type="date"></label>
        <p id="hw-status" class="hw-status" role="status"></p>
        <div class="hw-actions">
          <button type="button" class="hw-quiet" id="hw-draft" disabled>下書き保存</button>
          <button type="button" class="hw-primary" id="hw-assign" disabled>クラスに出す</button>
        </div>
      </form>
      <div>
        <div id="hw-drafts" class="hw-questions"></div>
        <div id="hw-warnings"></div>
        <div class="hw-actions" id="hw-tools" hidden>
          <p id="hw-voice" class="hw-voice" hidden></p>
          <button type="button" class="hw-quiet" id="hw-preview">生徒の画面で見る</button>
          <button type="button" class="hw-quiet" id="hw-approve">文を確認済みにする</button>
        </div>
        <div id="hw-questions" class="hw-questions"></div>
      </div>
    </div>`;

  studio.querySelector("#hw-form").addEventListener("submit", (event) => event.preventDefault());
  const wordsEl = studio.querySelector("#hw-words");
  const status = studio.querySelector("#hw-status");
  const questionsEl = studio.querySelector("#hw-questions");
  const warningsEl = studio.querySelector("#hw-warnings");
  const tools = studio.querySelector("#hw-tools");
  const preview = studio.querySelector("#hw-preview");
  const voiceNote = studio.querySelector("#hw-voice");
  const previewLabel = "生徒の画面で見る";
  const setVoiceWait = (message) => {
    const waiting = Boolean(message);
    preview.disabled = waiting;
    preview.textContent = waiting ? "声をつくっています…" : previewLabel;
    preview.setAttribute("aria-busy", waiting ? "true" : "false");
    voiceNote.hidden = !waiting;
    voiceNote.textContent = message || "";
  };
  const addWord = (pair = {}) => {
    const row = document.createElement("div");
    row.className = "hw-word";
    row.innerHTML = `<input type="text" data-ja maxlength="40" placeholder="日本語" aria-label="日本語" value="${escapeHtml(pair.ja || "")}" autocomplete="off" enterkeyhint="next"><input type="text" data-en maxlength="40" placeholder="English" aria-label="英語" value="${escapeHtml(pair.en || "")}" autocomplete="off" enterkeyhint="next"><button type="button" class="hw-word-x" aria-label="この単語を消す">×</button>`;
    if (pair.sentenceJa) row.dataset.sentenceJa = pair.sentenceJa;
    if (pair.sentenceEn) row.dataset.sentenceEn = pair.sentenceEn;
    const jaInput = row.querySelector("[data-ja]");
    const enInput = row.querySelector("[data-en]");
    row.querySelector("button").onclick = () => {
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
  studio.querySelector('[data-tab="report"]').onclick = () => {
    if (!root._confirmLeave()) return;
    state.dirty = false;
    options.openReport?.();
  };
  studio.querySelector("#hw-generate").onclick = async () => {
    const button = studio.querySelector("#hw-generate");
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
      types,
      warnings: parsed.warnings,
    });
    state.pairs = parsed.pairs;
    state.questions = result.questions;
    state.warnings = [...parsed.errors, ...result.warnings];
    state.status = "draft";
    state.dirty = true;
    if (result.error) state.warnings.unshift(result.error);
    paintQuestions();
    if (result.error || !result.questions.length) {
      setStatus("bad", result.error || "問題がつくれませんでした。");
      return;
    }
    button.disabled = true;
    const waitLine = (done, total) => `Learnyの声をつくっています ${done} / ${total}。終わるまでお待ちください。`;
    setVoiceWait("Learnyの声をつくっています。終わるまで、生徒の画面は開けません。");
    setStatus("", "Learnyの声をつくっています。終わるまでお待ちください。");
    try {
      const voice = await prepareHomeworkVoice([...linesForQuestions(result.questions), ...RETRY_LINES], {
        db: options.db,
        onProgress: (done, total) => {
          const line = waitLine(done, total);
          setVoiceWait(line);
          setStatus("", line);
        },
      });
      setVoiceWait("");
      const made = voice.total - voice.failed.length;
      setStatus(voice.failed.length ? "bad" : "", voice.failed.length
        ? `${result.questions.length}問できました。声は ${made} / ${voice.total} です。もう一度「宿題をつくる」を押すと残りを作ります。`
        : `${result.questions.length}問できました。声もできました。文は確認してから出します。`);
    } catch (error) {
      setVoiceWait("");
      setStatus("bad", `${result.questions.length}問できました。声はつくれませんでした。${error.message || ""}`);
    } finally {
      button.disabled = false;
    }
  };
  studio.querySelector("#hw-preview").onclick = () => openPreview();
  studio.querySelector("#hw-approve").onclick = () => {
    state.questions = state.questions.map((question) => (
      question.type === "sentence" ? { ...question, approved: true, sentenceSource: "teacher", review: false } : question
    ));
    state.dirty = true;
    paintQuestions();
    setStatus("ok", "文を確認済みにしました。内容をもう一度見てください。");
  };
  studio.querySelector("#hw-draft").onclick = () => save("draft");
  studio.querySelector("#hw-assign").onclick = () => save("assigned");
  questionsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const index = Number(button.closest("[data-index]")?.dataset.index);
    if (!Number.isInteger(index)) return;
    if (button.dataset.act === "remove") state.questions.splice(index, 1);
    if (button.dataset.act === "up" && index > 0) {
      [state.questions[index - 1], state.questions[index]] = [state.questions[index], state.questions[index - 1]];
    }
    if (button.dataset.act === "down" && index < state.questions.length - 1) {
      [state.questions[index + 1], state.questions[index]] = [state.questions[index], state.questions[index + 1]];
    }
    if (button.dataset.act === "regen") {
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
      state.questions = next.questions;
    }
    state.dirty = true;
    paintQuestions();
  });
  questionsEl.addEventListener("change", (event) => {
    const card = event.target.closest("[data-index]");
    if (!card || event.target.dataset.field == null) return;
    const index = Number(card.dataset.index);
    const question = state.questions[index];
    if (event.target.dataset.field === "approved") {
      state.questions[index] = { ...question, approved: event.target.checked, sentenceSource: "teacher", review: false };
      state.dirty = true;
      paintQuestions();
      return;
    }
    const promptJa = card.querySelector('[data-field="promptJa"]').value;
    const sentence = card.querySelector('[data-field="sentence"]').value;
    const approved = card.querySelector('[data-field="approved"]').checked;
    const updated = updateSentence(question, { promptJa, sentence, approved }, state.pairs, Date.now());
    if (updated.error) {
      setStatus("bad", updated.error);
      return;
    }
    state.questions[index] = updated.question;
    state.dirty = true;
    paintQuestions();
  });

  function setStatus(kind, message) {
    status.className = `hw-status${kind ? ` is-${kind}` : ""}`;
    status.textContent = message || "";
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
      types,
    };
  }

  function paintQuestions() {
    const pendingSentences = state.questions.some((question) => question.type === "sentence" && !question.approved);
    if (!pendingSentences) {
      state.warnings = state.warnings.filter((warning) => !warning.includes("文をつくる問題は提案"));
    }
    warningsEl.innerHTML = state.warnings.map((warning) => `<p class="hw-note">${escapeHtml(warning)}</p>`).join("");
    tools.hidden = !state.questions.length;
    studio.querySelector("#hw-draft").disabled = !state.questions.length || state.status === "assigned";
    studio.querySelector("#hw-assign").disabled = !state.questions.length || pendingSentences || state.status === "assigned";
    questionsEl.innerHTML = state.questions.map((question, index) => cardHtml(question, index)).join("");
  }

  async function save(mode) {
    const pending = state.questions.some((question) => question.type === "sentence" && !question.approved);
    if (mode === "assigned" && pending) {
      setStatus("bad", "文をつくる問題を確認してから出してください。");
      return;
    }
    const classIds = selectedClasses();
    if (mode === "assigned" && !classIds.length) {
      setStatus("bad", "出すクラスを選んでください。");
      return;
    }
    setStatus("", mode === "assigned" ? "出しています…" : "保存しています…");
    try {
      const result = await options.callFunction("saveHomeworkPack", {
        id: state.draftId,
        status: mode,
        title: studio.querySelector("#hw-title").value,
        level: studio.querySelector("#hw-level").value,
        dueOn: studio.querySelector("#hw-due").value,
        classIds,
        vocab: state.pairs,
        questions: state.questions,
        settings: settings(),
      });
      state.draftId = result.id;
      state.status = result.status || mode;
      state.dirty = false;
      setStatus("ok", mode === "assigned"
        ? `${result.assigneeCount}人に出しました。`
        : "下書きを保存しました。");
      paintQuestions();
      loadDrafts().catch(() => {});
    } catch (error) {
      setStatus("bad", error.message);
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
    state.questions = pack.questions || [];
    state.pairs = pack.vocab || [];
    state.warnings = pack.status === "assigned" ? ["出した宿題は変更できません。"] : [];
    studio.querySelector("#hw-title").value = pack.title || "きょうのしゅくだい";
    if (pack.level) studio.querySelector("#hw-level").value = pack.level;
    studio.querySelector("#hw-due").value = pack.dueOn || "";
    setWords(pack.vocab || []);
    state.dirty = false;
    paintQuestions();
  }

  async function loadDrafts() {
    const host = studio.querySelector("#hw-drafts");
    if (options.lab || !options.db) {
      host.innerHTML = "";
      return;
    }
    const snap = await getDocs(query(collection(options.db, "homeworkAssignments"), where("teacherId", "==", options.uid)));
    const rows = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => item.format === "pack-v1")
      .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))
      .slice(0, 8);
    host.innerHTML = rows.length ? `<p class="hw-note">保存した宿題</p>${rows.map((row) => `
      <button type="button" class="hw-quiet" data-draft="${escapeHtml(row.id)}">${escapeHtml(row.title || "宿題")} · ${row.status === "assigned" ? "出した" : "下書き"}</button>`).join("")}` : "";
    host.querySelectorAll("[data-draft]").forEach((button) => {
      button.onclick = async () => {
        if (!root._confirmLeave()) return;
        try {
          applyEditor(await options.callFunction("getHomeworkEditor", { id: button.dataset.draft }));
        } catch (error) {
          setStatus("bad", error.message);
        }
      };
    });
  }

  await loadClasses();
  loadDrafts().catch((error) => setStatus("bad", error.message));

  async function loadClasses() {
    const host = studio.querySelector("#hw-classes");
    if (options.lab || !options.db) {
      host.innerHTML = `<label class="hw-checkline"><input data-class type="checkbox" value="lab-class" checked> プレビューのクラス</label>`;
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
      ? `<p class="hw-note">出すクラス</p>${state.classes.map((item) => `<label class="hw-checkline"><input data-class type="checkbox" value="${escapeHtml(item.id)}"> ${escapeHtml(item.title)}</label>`).join("")}`
      : `<p class="hw-note">担当クラスがまだありません。下書きは保存できます。</p>`;
  }
}

function cardHtml(question, index) {
  const review = question.review && question.type !== "sentence" ? `<span class="hw-pill is-warn">確認</span>` : "";
  const sentence = question.type === "sentence" ? `
    <label>日本語 <input data-field="promptJa" type="text" value="${escapeHtml(question.promptJa || "")}"></label>
    <label>英語 <input data-field="sentence" type="text" value="${escapeHtml(question.display || "")}"></label>
    <label class="hw-checkline"><input data-field="approved" type="checkbox" ${question.approved ? "checked" : ""}> この文で出す</label>` : summaryHtml(question);
  return `<article class="hw-q" data-index="${index}">
    <header>
      <strong>${TYPE_LABEL[question.type] || "問題"}</strong>
      ${review}
      ${question.type === "sentence" && !question.approved ? `<span class="hw-pill is-warn">文を確認</span>` : ""}
      <button type="button" class="hw-text" data-act="up">上へ</button>
      <button type="button" class="hw-text" data-act="down">下へ</button>
      <button type="button" class="hw-text" data-act="regen">作り直す</button>
      <button type="button" class="hw-text" data-act="remove">けす</button>
    </header>
    ${question.type === "sentence" ? "" : `<p>${escapeHtml(question.promptJa || "")}</p>`}
    ${sentence}
  </article>`;
}

function summaryHtml(question) {
  if (question.type === "multipleChoice") {
    return `<div class="hw-choices-preview">${(question.choices || []).map((choice) => `<span class="hw-chip${choice === question.answer ? " is-key" : ""}">${escapeHtml(choice)}</span>`).join("")}</div>`;
  }
  if (question.type === "matching") {
    return `<div>${(question.pairs || []).map((pair) => {
      const ja = question.left.find((item) => item.id === pair.leftId)?.text || "";
      const en = question.right.find((item) => item.id === pair.rightId)?.text || "";
      return `<p class="hw-key">${escapeHtml(ja)} = ${escapeHtml(en)}</p>`;
    }).join("")}</div>`;
  }
  if (question.type === "spelling") return `<p class="hw-key">${escapeHtml(question.display || question.answer || "")}</p>`;
  return "";
}
