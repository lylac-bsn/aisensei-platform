import { playPrompt, stopPrompt } from "./homework-audio.js?v=20261026-retry";
import { hydrateHomeworkVoice, linesForQuestions } from "./homework-voice-bank.js?v=20261026-retry";
import { RETRY_LINES } from "./homework-voice-lines.js?v=20261026-retry";
import { playHomeworkSfx, preloadHomeworkSfx, resultSound, stopHomeworkSfx } from "./homework-sfx.js?v=20261026-sfx";

const PRAISE = ["せいかい！", "すごい！", "そのちょうし！", "ばっちり！"];
let retryCursor = 0;

function nextRetryLine() {
  const line = RETRY_LINES[retryCursor % RETRY_LINES.length];
  retryCursor += 1;
  return line;
}

function spokenAnswer(answer) {
  if (Array.isArray(answer)) return answer.join(" ");
  return String(answer || "");
}

function voiceLang(text) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text) ? "ja" : "en";
}

export async function mountHomeworkPlayer(root, options) {
  const source = Array.isArray(options.questions) ? options.questions : [];
  const outcomes = new Map();
  const saved = await options.loadProgress?.().catch(() => null);
  if (saved?.attempts) {
    Object.entries(saved.attempts).forEach(([id, attempt]) => {
      if (attempt?.correct) outcomes.set(id, { correct: true, tries: attempt.tries || 1 });
    });
  }
  let order = source.filter((question) => !outcomes.get(question.id)?.correct);
  let reviewing = false;
  let reviewUsed = false;
  if (saved?.completed && !order.length) {
    paintDone(saved.correctCount ?? source.length, saved.total || source.length, false);
    return;
  }
  if (!order.length) order = source.slice();
  await hydrateHomeworkVoice([...linesForQuestions(source), ...RETRY_LINES], options.db);
  let cursor = 0;
  let praise = 0;
  let streak = 0;
  let soundToken = 0;
  preloadHomeworkSfx();

  function playResult(ok) {
    const next = resultSound(streak, ok);
    streak = next.streak;
    return playHomeworkSfx(next.name);
  }

  function paintShell(question) {
    const seen = outcomes.size;
    root.innerHTML = "";
    const play = document.createElement("section");
    play.className = "hw-play";
    play.innerHTML = `
      <div class="hw-top">
        ${options.onClose ? `<button type="button" class="hw-text" data-close>もどる</button>` : `<span></span>`}
        <p class="hw-count">${reviewing ? "ふくしゅう" : "もんだい"} ${cursor + 1} / ${order.length}</p>
      </div>
      <div class="hw-bar" aria-hidden="true"><span style="width:${Math.round((seen / Math.max(source.length, 1)) * 100)}%"></span></div>
      <div class="hw-ask">
        <button type="button" class="hw-speaker" aria-label="きく">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a7.5 7.5 0 0 1 0 10"/></svg>
        </button>
        <div class="hw-ask-text">
          <p class="hw-prompt"></p>
          <p class="hw-sub"></p>
        </div>
      </div>
      <div class="hw-body"></div>
      <p class="hw-live" role="status"></p>
      <div class="hw-submit">
        <button type="button" class="hw-check" disabled>こたえあわせる</button>
        <button type="button" class="hw-next">つぎへ</button>
      </div>`;
    play.querySelector("[data-close]")?.addEventListener("click", () => {
      stopHomeworkSfx();
      stopPrompt();
      options.onClose();
    });
    const prompt = play.querySelector(".hw-prompt");
    const sub = play.querySelector(".hw-sub");
    prompt.textContent = question.promptJa || "えいごを ならぼう";
    sub.textContent = question.promptEn || "";
    sub.hidden = !question.promptEn;
    const spoken = question.speak?.prompt;
    const speaker = play.querySelector(".hw-speaker");
    speaker.hidden = !spoken?.text;
    const replay = () => {
      if (!spoken?.text) return;
      speaker.disabled = true;
      speaker.classList.add("is-speaking");
      playPrompt(spoken.text, spoken.lang).finally(() => {
        speaker.disabled = false;
        speaker.classList.remove("is-speaking");
      });
    };
    speaker.addEventListener("click", replay);
    play.querySelector(".hw-next").addEventListener("click", () => {
      const current = outcomes.get(question.id);
      if (!current?.correct) outcomes.set(question.id, { correct: false, tries: current?.tries || 1 });
      advance();
    });
    root.appendChild(play);
    replay();
    return play;
  }

  function speakAfter(soundDone, line) {
    const token = ++soundToken;
    return soundDone.then(() => {
      if (token !== soundToken) return;
      return playPrompt(line, voiceLang(line));
    });
  }

  function showRetry(play) {
    const line = nextRetryLine();
    play.classList.add("is-miss");
    play.classList.remove("is-good");
    const check = play.querySelector(".hw-check");
    check.hidden = false;
    check.disabled = false;
    check.textContent = "こたえあわせる";
    play.querySelector(".hw-live").textContent = line;
    speakAfter(playResult(false), line);
  }

  function showCorrect(play, spoken, sound = true) {
    play.classList.add("is-good");
    play.classList.remove("is-miss");
    play.querySelectorAll("button, input").forEach((item) => {
      if (item.classList.contains("hw-next") || item.classList.contains("hw-text") || item.classList.contains("hw-speaker")) return;
      item.disabled = true;
    });
    const check = play.querySelector(".hw-check");
    check.textContent = "こたえあわせる";
    play.querySelector(".hw-live").textContent = PRAISE[praise % PRAISE.length];
    praise += 1;
    const soundDone = sound ? playResult(true) : Promise.resolve();
    if (spoken) speakAfter(soundDone, spoken);
  }

  function render() {
    const question = order[cursor];
    if (!question) {
      paintDone(countCorrect(), source.length);
      return;
    }
    const started = performance.now();
    const play = paintShell(question);
    const body = play.querySelector(".hw-body");
    const check = play.querySelector(".hw-check");
    const live = play.querySelector(".hw-live");
    let answer = null;
    const markReady = (ready) => {
      check.disabled = !ready;
    };

    if (question.type === "multipleChoice") {
      const choices = document.createElement("div");
      choices.className = "hw-choices";
      (question.choices || []).forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hw-choice";
        button.textContent = choice;
        button.addEventListener("click", () => {
          if (button.disabled || answer === choice) return;
          answer = choice;
          play.classList.remove("is-miss");
          playPrompt(choice, "en");
          choices.querySelectorAll(".hw-choice").forEach((item) => {
            item.classList.toggle("is-picked", item === button);
            item.classList.remove("is-wrong");
          });
          markReady(true);
        });
        choices.appendChild(button);
      });
      body.appendChild(choices);
    } else if (question.type === "spelling") {
      body.appendChild(buildLetters(question, (value, ready) => {
        answer = value;
        markReady(ready);
      }));
    } else if (question.type === "sentence") {
      body.appendChild(buildSentence(question, (tokens, ready) => {
        answer = tokens;
        markReady(ready);
      }));
    } else {
      check.hidden = true;
      buildMatching(question, body, live, playResult, async (leftId, rightId) => options.grade(question.id, {
        kind: "pair",
        leftId,
        rightId,
        elapsedMs: 0,
      }), async () => {
        await options.grade(question.id, { kind: "matching-done", elapsedMs: Math.round(performance.now() - started) });
        const prev = outcomes.get(question.id);
        outcomes.set(question.id, { correct: true, tries: (prev?.tries || 0) + 1 });
        showCorrect(play, "", false);
      }, (line) => speakAfter(playResult(false), line));
      return;
    }

    check.addEventListener("click", async () => {
      if (check.disabled || check.textContent === "つぎへ") return;
      check.disabled = true;
      check.textContent = "…";
      try {
        const result = await options.grade(question.id, {
          kind: "answer",
          answer,
          elapsedMs: Math.round(performance.now() - started),
        });
        const prev = outcomes.get(question.id);
        outcomes.set(question.id, { correct: Boolean(result.correct), tries: (prev?.tries || 0) + 1 });
        if (!play.isConnected) return;
        if (question.type === "multipleChoice") {
          play.querySelectorAll(".hw-choice").forEach((button) => {
            if (result.correct && button.textContent === answer) button.classList.add("is-right");
            if (!result.correct && button.textContent === answer) button.classList.add("is-wrong");
          });
        }
        if (result.correct) showCorrect(play, spokenAnswer(answer));
        else showRetry(play);
      } catch (error) {
        check.disabled = false;
        check.textContent = "こたえあわせる";
        live.textContent = error.message;
      }
    });
  }

  function countCorrect() {
    return source.filter((question) => outcomes.get(question.id)?.correct).length;
  }

  function advance() {
    soundToken += 1;
    stopHomeworkSfx();
    stopPrompt();
    cursor += 1;
    if (cursor < order.length) {
      render();
      return;
    }
    const missed = source.filter((question) => {
      const outcome = outcomes.get(question.id);
      return outcome && !outcome.correct;
    });
    if (missed.length && !reviewUsed) {
      reviewUsed = true;
      reviewing = true;
      order = missed;
      cursor = 0;
      render();
      return;
    }
    paintDone(countCorrect(), source.length);
  }

  async function paintDone(correct, total, celebrate = true) {
    soundToken += 1;
    stopHomeworkSfx();
    stopPrompt();
    let summary = { correct, total, percent: total ? Math.round((correct / total) * 100) : 0 };
    if (options.finish) {
      try {
        summary = { ...summary, ...(await options.finish()) };
      } catch (error) {
        summary.error = error.message;
      }
    }
    root.innerHTML = "";
    const done = document.createElement("section");
    done.className = "hw-play hw-done";
    const title = document.createElement("p");
    title.className = "hw-kicker";
    title.textContent = options.title || "しゅくだい";
    const heading = document.createElement("h2");
    heading.textContent = "おわったよ！";
    const score = document.createElement("p");
    score.className = "hw-score";
    score.textContent = `${summary.correct ?? correct} / ${summary.total || total} せいかい`;
    const note = document.createElement("p");
    note.textContent = (summary.percent ?? 0) === 100 ? "ぜんぶ できたね。" : "まちがえた ことばは、また あそぼう。";
    done.append(title, heading, score, note);
    if (summary.error) {
      const warn = document.createElement("p");
      warn.className = "hw-live";
      warn.textContent = summary.error;
      done.appendChild(warn);
    }
    if (options.onClose) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "hw-check";
      back.textContent = "もどる";
      back.addEventListener("click", () => {
        stopHomeworkSfx();
        options.onClose();
      });
      done.appendChild(back);
    }
    root.appendChild(done);
    if (celebrate) playHomeworkSfx("complete");
  }

  if (!source.length) {
    root.textContent = "もんだいが ありません。";
    return;
  }
  render();
}

function buildLetters(question, onChange) {
  const row = document.createElement("div");
  row.className = "hw-letters";
  const inputs = [];
  (question.slots || []).forEach((slot) => {
    if (slot.type === "gap") {
      const gap = document.createElement("span");
      gap.className = "hw-letter-gap";
      row.appendChild(gap);
      return;
    }
    if (slot.type === "mark") {
      const mark = document.createElement("span");
      mark.className = "hw-letter-mark";
      mark.textContent = slot.text || "";
      row.appendChild(mark);
      return;
    }
    const input = document.createElement("input");
    input.className = "hw-letter";
    input.maxLength = 1;
    input.inputMode = "text";
    input.autocomplete = "off";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.setAttribute("aria-label", "もじ");
    if (question.hint && inputs.length === 0) {
      input.value = question.hint;
      input.readOnly = true;
      input.classList.add("is-hint");
    }
    inputs.push(input);
    row.appendChild(input);
  });
  const publish = () => onChange(inputs.map((input) => input.value).join(""), inputs.every((input) => input.value));
  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      const previous = input.dataset.letter || "";
      input.value = input.value.replace(/[^A-Za-z]/g, "").slice(-1).toUpperCase();
      if (input.value && input.value !== previous) playHomeworkSfx("select");
      input.dataset.letter = input.value;
      if (input.value) inputs.slice(index + 1).find((item) => !item.readOnly)?.focus();
      publish();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && !input.readOnly) {
        [...inputs].slice(0, index).reverse().find((item) => !item.readOnly)?.focus();
      }
    });
  });
  publish();
  inputs.find((input) => !input.readOnly)?.focus();
  return row;
}

function buildSentence(question, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "hw-sentence";
  const answer = document.createElement("div");
  answer.className = "hw-answer";
  const bank = document.createElement("div");
  bank.className = "hw-tiles";
  const picked = [];
  const paint = () => {
    answer.replaceChildren();
    picked.forEach((tile, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hw-tile";
      button.textContent = tile.text;
      button.addEventListener("click", () => {
        picked.splice(index, 1);
        playPrompt(tile.text, voiceLang(tile.text));
        paint();
      });
      answer.appendChild(button);
    });
    for (let index = picked.length; index < (question.slotCount || 0); index += 1) {
      const slot = document.createElement("span");
      slot.className = "hw-slot";
      answer.appendChild(slot);
    }
    bank.replaceChildren();
    (question.tiles || []).forEach((text, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hw-tile";
      button.textContent = text;
      button.disabled = picked.some((tile) => tile.index === index);
      button.addEventListener("click", () => {
        if (picked.length >= question.slotCount) return;
        picked.push({ text, index });
        playPrompt(text, voiceLang(text));
        paint();
      });
      bank.appendChild(button);
    });
    onChange(picked.map((tile) => tile.text), picked.length === question.slotCount && question.slotCount > 0);
  };
  wrap.append(answer, bank);
  paint();
  return wrap;
}

function buildMatching(question, body, live, playResult, gradePair, onDone, onMiss) {
  const board = document.createElement("div");
  board.className = "hw-match";
  let leftId = "";
  let rightId = "";
  let busy = false;
  const matched = new Set();
  let wrongIds = new Set();
  const paint = () => {
    board.replaceChildren();
    ["left", "right"].forEach((side) => {
      const column = document.createElement("div");
      column.className = "hw-col";
      (question[side] || []).forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hw-pair";
        button.textContent = item.text;
        button.disabled = matched.has(item.id);
        button.classList.toggle("is-wrong", wrongIds.has(item.id));
        button.classList.toggle("is-picked", !wrongIds.has(item.id) && (item.id === leftId || item.id === rightId));
        button.classList.toggle("is-done", matched.has(item.id));
        button.addEventListener("click", () => choose(side, item.id, item.text));
        column.appendChild(button);
      });
      board.appendChild(column);
    });
  };
  function soundFor(ok) {
    try {
      playResult(ok);
    } catch (error) {
      console.warn(error);
      playHomeworkSfx(ok ? "correct" : "incorrect");
    }
  }
  async function choose(side, id, text) {
    if (busy || matched.has(id)) return;
    if (side === "left") leftId = leftId === id ? "" : id;
    else rightId = rightId === id ? "" : id;
    const chosen = side === "left" ? leftId : rightId;
    const pairing = Boolean(leftId && rightId);
    wrongIds = new Set();
    if (pairing) busy = true;
    paint();
    if (chosen) playPrompt(text, voiceLang(text));
    if (!pairing) {
      busy = false;
      return;
    }
    const pairLeft = leftId;
    const pairRight = rightId;
    try {
      const result = await gradePair(pairLeft, pairRight);
      stopPrompt();
      if (result.correct) {
        matched.add(pairLeft);
        matched.add(pairRight);
        leftId = "";
        rightId = "";
        paint();
        soundFor(true);
        live.textContent = "せいかい！";
        if (matched.size >= (question.left || []).length + (question.right || []).length) {
          await onDone();
          return;
        }
      } else {
        wrongIds = new Set([pairLeft, pairRight]);
        leftId = "";
        rightId = "";
        paint();
        const line = nextRetryLine();
        live.textContent = line;
        onMiss(line);
        board.classList.add("is-shake");
        window.setTimeout(() => board.classList.remove("is-shake"), 350);
        await new Promise((resolve) => setTimeout(resolve, 700));
        wrongIds = new Set();
        if (board.isConnected) paint();
      }
    } catch (error) {
      live.textContent = error.message;
      leftId = "";
      rightId = "";
      wrongIds = new Set();
      if (board.isConnected) paint();
    } finally {
      busy = false;
    }
  }
  body.appendChild(board);
  paint();
}
