import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { confirmAction } from "./ui-confirm.js?v=20261031-hw-voicefix";
import {
  GAME_LABEL, LEVEL_LABEL, REPEAT_LABEL,
  calendarView, saveCalendarView, classPhase, clockLabel, consumePrefill, escapeHtml,
  jstKey, jstParts, jstStamp, labClasses, labDeleteClass, labSaveClass, openWorkspace,
  phaseLabel, rememberPrefill, seatLabel, teachLabActive,
} from "./teacher-context.js?v=20261106-teacher";

const REGION = "https://asia-northeast1-ai-sensei-8849b.cloudfunctions.net";
const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_PX = 52;
const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

async function callFunction(name, data) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("ログインが必要です。");
  const token = await user.getIdToken();
  const response = await fetch(`${REGION}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "うまくいきませんでした。");
  return body.result || body;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function shiftKey(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function weekKeys(anchor) {
  const [year, month, day] = anchor.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: 7 }, (_, index) => shiftKey(anchor, index - date.getUTCDay()));
}

function monthCells(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = shiftKey(`${year}-${pad(month)}-01`, -first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => shiftKey(start, index));
}

function minutesOf(date) {
  const parts = jstParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function mapClass(item) {
  const data = item.data ? item.data() : item;
  return {
    id: item.id,
    title: data.title || "クラス",
    game: data.game || "minecraft",
    difficulty: data.difficulty || "beginner",
    teacherId: data.teacherId || "",
    teacherName: data.teacherName || "",
    startsAt: data.startsAt?.toDate?.() || (data.startsAt ? new Date(data.startsAt) : null),
    endsAt: data.endsAt?.toDate?.() || (data.endsAt ? new Date(data.endsAt) : null),
    capacity: Number(data.capacity || 6),
    bookedCount: Number(data.bookedCount || 0),
    status: data.status || "open",
    seriesRepeat: data.seriesRepeat || "none",
    seriesCount: Number(data.seriesCount || 1),
    instructions: data.instructions || "",
  };
}

function layoutColumns(events) {
  const items = events
    .map((item) => ({
      item,
      start: minutesOf(item.startsAt),
      end: Math.max(minutesOf(item.startsAt) + 30, minutesOf(item.endsAt)),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const columns = [];
  items.forEach((entry) => {
    const column = columns.find((lane) => lane[lane.length - 1].end <= entry.start);
    if (column) column.push(entry);
    else columns.push([entry]);
    entry.column = columns.findIndex((lane) => lane.includes(entry));
  });
  items.forEach((entry) => {
    entry.columns = columns.length || 1;
  });
  return items;
}

export async function renderTeacherCalendar(root) {
  root.hidden = false;
  root.classList.add("td-app");
  root.innerHTML = `<div class="td-skel" aria-hidden="true"><span></span><span></span></div>`;
  const state = {
    classes: [],
    presets: [],
    availability: { hours: {}, blocks: [] },
    policy: null,
    view: calendarView(),
    anchor: jstKey(new Date()),
    query: "",
    notice: "",
    noticeKind: "",
  };
  const reload = () => loadState(state);
  try {
    await reload();
  } catch (error) {
    root.innerHTML = `<p class="td-warn">${escapeHtml(error.message)}</p>`;
    return;
  }
  const paint = () => {
    root.innerHTML = shell(state);
    bind(root, state, paint, reload);
  };
  paint();
  focusNow(root);
  try {
    if (sessionStorage.getItem("gc-open-create") === "1") {
      sessionStorage.removeItem("gc-open-create");
      openCreate(root, state, paint, reload, {});
    }
  } catch { /* ignore */ }
  const prefill = consumePrefill();
  if (prefill) openCreate(root, state, paint, reload, prefill);
}

async function loadState(state) {
  if (teachLabActive()) {
    state.classes = labClasses().map(mapClass);
    return;
  }
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error("ログインが必要です。");
  const [classes, presets, availability, policy] = await Promise.all([
    getDocs(query(collection(db, "classes"), where("teacherId", "==", uid))),
    getDocs(collection(db, "teacherPrivate", uid, "presets")),
    getDoc(doc(db, "teacherPrivate", uid, "availability", "settings")),
    getDoc(doc(db, "settings", "classPolicy")),
  ]);
  state.classes = classes.docs.map(mapClass).filter((item) => item.status !== "cancelled");
  state.presets = presets.docs.map((item) => ({ id: item.id, ...item.data() }));
  state.availability = availability.exists() ? availability.data() : { hours: {}, blocks: [] };
  state.policy = policy.exists() ? policy.data() : null;
}

function shell(state) {
  const title = state.view === "week" ? weekTitle(state.anchor) : monthTitle(state.anchor);
  return `
    <div class="td-cal${state.view === "month" ? " is-month" : ""}">
      <header class="td-cal-bar">
        <div>
          <p class="td-kicker">マイカレンダー</p>
          <h2>自分のクラス</h2>
        </div>
        <div class="td-cal-tools">
          <button type="button" class="td-text" id="td-today">今日</button>
          <button type="button" class="td-icon" id="td-prev" aria-label="前へ">‹</button>
          <strong>${escapeHtml(title)}</strong>
          <button type="button" class="td-icon" id="td-next" aria-label="次へ">›</button>
          <div class="td-switch" role="group" aria-label="表示">
            <button type="button" data-view="week" class="${state.view === "week" ? "is-on" : ""}">週</button>
            <button type="button" data-view="month" class="${state.view === "month" ? "is-on" : ""}">月</button>
          </div>
          <button type="button" class="td-text" id="td-hours">対応可能時間</button>
          <button type="button" class="td-primary" id="td-create">＋ クラスを作成</button>
        </div>
      </header>
      <label class="td-search"><input id="td-find" placeholder="クラスを検索" value="${escapeHtml(state.query)}" autocomplete="off"></label>
      <p class="td-note${state.noticeKind ? ` is-${state.noticeKind}` : ""}"${state.notice ? "" : " hidden"}>${escapeHtml(state.notice)}</p>
      ${state.view === "week" ? weekHtml(state) : monthHtml(state)}
      ${agendaHtml(state)}
    </div>`;
}

function visibleClasses(state) {
  const queryText = state.query.trim().toLowerCase();
  return state.classes.filter((item) => !queryText || `${item.title} ${item.game} ${item.difficulty}`.toLowerCase().includes(queryText));
}

function weekTitle(anchor) {
  const keys = weekKeys(anchor);
  return `${labelKey(keys[0])} – ${labelKey(keys[6])}`;
}

function monthTitle(anchor) {
  const [year, month] = anchor.split("-");
  return `${Number(year)}年${Number(month)}月`;
}

function labelKey(key) {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
}

function weekHtml(state) {
  const keys = weekKeys(state.anchor);
  const today = jstKey(new Date());
  const classes = visibleClasses(state);
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
  const now = new Date();
  const nowMin = minutesOf(now);
  const showNow = keys.includes(today) && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  return `
    <div class="td-week" style="--hour:${HOUR_PX}px">
      <div class="td-week-head">
        <span></span>
        ${keys.map((key) => `<button type="button" class="td-dayhead${key === today ? " is-today" : ""}" data-day="${key}">${WEEKDAY[new Date(`${key}T12:00:00+09:00`).getUTCDay()]}<strong>${Number(key.slice(-2))}</strong></button>`).join("")}
      </div>
      <div class="td-week-body">
        <div class="td-hours">${hours.map((hour) => `<span>${hour}:00</span>`).join("")}</div>
        ${keys.map((key) => {
          const events = layoutColumns(classes.filter((item) => item.startsAt && jstKey(item.startsAt) === key));
          return `<div class="td-col${key === today ? " is-today" : ""}" data-day="${key}">
            ${hours.map((hour) => `<button type="button" class="td-slot" data-slot="${key}T${pad(hour)}:00" aria-label="${labelKey(key)} ${hour}時にクラスを作成"></button>`).join("")}
            ${events.map(eventBlock).join("")}
            ${showNow && key === today ? `<i class="td-now" style="top:${((nowMin - START_HOUR * 60) / 60) * HOUR_PX}px"></i>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function eventBlock(entry) {
  const start = Math.max(entry.start, START_HOUR * 60);
  const end = Math.min(entry.end, END_HOUR * 60);
  if (end <= start) return "";
  const top = ((start - START_HOUR * 60) / 60) * HOUR_PX;
  const height = Math.max(36, ((end - start) / 60) * HOUR_PX - 4);
  const width = 100 / entry.columns;
  const phase = classPhase(entry.item);
  return `<button type="button" class="td-event is-${phase} is-${escapeHtml(entry.item.game)}" data-class="${escapeHtml(entry.item.id)}"
      style="top:${top}px;height:${height}px;left:calc(${entry.column * width}% + 3px);width:calc(${width}% - 6px)">
      <strong>${escapeHtml(entry.item.title)}</strong>
      <small>${escapeHtml(clockLabel(entry.item.startsAt))} ${escapeHtml(seatLabel(entry.item))}</small>
    </button>`;
}

function monthHtml(state) {
  const [year, month] = state.anchor.split("-").map(Number);
  const today = jstKey(new Date());
  const classes = visibleClasses(state);
  return `
    <div class="td-month">
      <div class="td-month-head">${WEEKDAY.map((label) => `<span>${label}</span>`).join("")}</div>
      <div class="td-month-grid">
        ${monthCells(year, month).map((key) => {
          const events = classes.filter((item) => item.startsAt && jstKey(item.startsAt) === key);
          const extra = Math.max(0, events.length - 3);
          return `<div class="td-cell${Number(key.slice(5, 7)) === month ? "" : " is-out"}${key === today ? " is-today" : ""}">
            <button type="button" class="td-cell-day" data-day="${key}">${Number(key.slice(-2))}</button>
            ${events.slice(0, 3).map((item) => `<button type="button" class="td-chip is-${classPhase(item)}" data-class="${escapeHtml(item.id)}">${escapeHtml(clockLabel(item.startsAt))} ${escapeHtml(item.title)}</button>`).join("")}
            ${extra ? `<button type="button" class="td-more" data-day="${key}">+${extra}</button>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function agendaHtml(state) {
  const keys = weekKeys(state.anchor);
  const today = jstKey(new Date());
  const classes = visibleClasses(state);
  const list = classes
    .filter((item) => item.startsAt && jstKey(item.startsAt) === state.anchor)
    .sort((a, b) => a.startsAt - b.startsAt);
  return `
    <div class="td-agenda">
      <div class="td-strip">
        ${keys.map((key) => {
          const count = classes.filter((item) => item.startsAt && jstKey(item.startsAt) === key).length;
          return `<button type="button" class="td-strip-day${key === state.anchor ? " is-on" : ""}${key === today ? " is-today" : ""}" data-day="${key}">
            <small>${WEEKDAY[new Date(`${key}T12:00:00+09:00`).getUTCDay()]}</small><strong>${Number(key.slice(-2))}</strong>${count ? `<i>${count}</i>` : ""}
          </button>`;
        }).join("")}
      </div>
      <div class="td-agenda-list">
        <p class="td-agenda-date">${escapeHtml(agendaDateLabel(state.anchor))}</p>
        ${list.map((item) => `<button type="button" class="td-agenda-card is-${classPhase(item)}" data-class="${escapeHtml(item.id)}">
          <span>${escapeHtml(clockLabel(item.startsAt))}–${escapeHtml(clockLabel(item.endsAt))}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(GAME_LABEL[item.game] || "")} · ${escapeHtml(LEVEL_LABEL[item.difficulty] || "")} · ${escapeHtml(seatLabel(item))}人</small>
          <em>${phaseLabel(classPhase(item))}</em>
        </button>`).join("") || `<p class="td-empty">この日のクラスはありません。</p>`}
      </div>
    </div>`;
}

function agendaDateLabel(key) {
  const date = new Date(`${key}T12:00:00+09:00`);
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8))}日（${WEEKDAY[date.getUTCDay()]}）`;
}

function bind(root, state, paint, reload) {
  const find = root.querySelector("#td-find");
  find.oninput = () => {
    state.query = find.value;
    const caret = find.selectionStart;
    paint();
    const next = root.querySelector("#td-find");
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
  };
  root.querySelector("#td-today").onclick = () => {
    state.anchor = jstKey(new Date());
    paint();
    focusNow(root);
  };
  root.querySelector("#td-prev").onclick = () => shiftView(state, -1, paint);
  root.querySelector("#td-next").onclick = () => shiftView(state, 1, paint);
  root.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      state.view = button.dataset.view;
      saveCalendarView(state.view);
      paint();
    };
  });
  root.querySelector("#td-create").onclick = () => openCreate(root, state, paint, reload, { date: state.anchor });
  root.querySelector("#td-hours").onclick = () => openAvailability(root, state, paint);
  root.querySelectorAll("[data-class]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      openWorkspace(button.dataset.class);
    };
  });
  root.querySelectorAll("[data-day]").forEach((button) => {
    button.onclick = () => {
      state.anchor = button.dataset.day;
      paint();
    };
  });
  root.querySelectorAll("[data-slot]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const [date, time] = button.dataset.slot.split("T");
      openCreate(root, state, paint, reload, { date, time });
    };
  });
  paintBusy(root, state);
}

function focusNow(root) {
  const mark = root.querySelector(".td-now");
  const body = root.querySelector(".td-week-body");
  if (!mark || !body) return;
  body.scrollTop = Math.max(0, mark.offsetTop - body.clientHeight * 0.35);
}

function paintBusy(root, state) {
  root.querySelectorAll(".td-col").forEach((column) => {
    (state.availability.blocks || []).forEach((block) => {
      const start = new Date(Number(block.startAt));
      const end = new Date(Number(block.endAt));
      if (!block.startAt || jstKey(start) !== column.dataset.day) return;
      const mark = document.createElement("div");
      mark.className = "td-busy";
      mark.style.top = `${((minutesOf(start) - START_HOUR * 60) / 60) * HOUR_PX}px`;
      mark.style.height = `${Math.max(18, ((minutesOf(end) - minutesOf(start)) / 60) * HOUR_PX)}px`;
      mark.textContent = block.kind === "holiday" ? "休み" : "対応不可";
      column.appendChild(mark);
    });
  });
}

function shiftView(state, direction, paint) {
  if (state.view === "week") state.anchor = shiftKey(state.anchor, direction * 7);
  else {
    const [year, month] = state.anchor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + direction, 1));
    state.anchor = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`;
  }
  paint();
}

function policyLine(policy) {
  if (!policy) return "予約は公開後すぐに、開始時刻まで受け付けます。";
  const open = policy.bookingOpensHours != null ? `開始の${policy.bookingOpensHours}時間前から` : "公開後すぐに";
  const close = policy.bookingCutoffHours != null ? `開始の${policy.bookingCutoffHours}時間前まで` : "開始時刻まで";
  return `予約は${open}、${close}受け付けます。ルールはプラットフォーム設定です。`;
}

function openCreate(root, state, paint, reload, prefill) {
  const date = prefill.date || jstKey(new Date());
  const start = prefill.time || "16:00";
  const [hour, minute] = start.split(":").map(Number);
  const end = prefill.end || `${pad(Math.min(23, hour + 1))}:${pad(minute || 0)}`;
  const dialog = document.createElement("dialog");
  dialog.className = "gc-modal td-sheet";
  dialog.innerHTML = `
    <form class="td-form" id="td-form">
      <header class="td-form-head">
        <h2>${prefill.title ? "クラスを複製" : "クラスを作成"}</h2>
        <button type="button" class="td-icon" id="td-form-close" aria-label="閉じる">×</button>
      </header>
      <label>テンプレート
        <select id="td-preset">
          <option value="">使わない</option>
          ${state.presets.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label || item.title)}</option>`).join("")}
          <option value="builtin-mc">Minecraft Beginner — 60分</option>
          <option value="builtin-rb">Roblox Intermediate — 60分</option>
        </select>
      </label>
      <label class="td-span">タイトル <input id="td-title" maxlength="80" required value="${escapeHtml(prefill.title || "")}"></label>
      <label>ゲーム <select id="td-game"><option value="minecraft">Minecraft</option><option value="roblox">Roblox</option></select></label>
      <label>レベル <select id="td-level"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
      <label>日付 <input id="td-date" type="date" required value="${escapeHtml(date)}"></label>
      <label>開始 <input id="td-start" type="time" required value="${escapeHtml(start)}"></label>
      <label>終了 <input id="td-end" type="time" required value="${escapeHtml(end)}"></label>
      <label>定員 <select id="td-capacity">${[1, 2, 3, 4, 5, 6].map((count) => `<option value="${count}"${count === Number(prefill.capacity || 6) ? " selected" : ""}>${count}人</option>`).join("")}</select></label>
      <label class="td-allday"><input id="td-allday" type="checkbox"> 終日</label>
      <label>繰り返し <select id="td-repeat">${Object.entries(REPEAT_LABEL).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
      <label id="td-count-label">回数 <input id="td-count" type="number" min="2" max="12" value="${Number(prefill.count || 4)}"></label>
      <p class="td-hint">繰り返しは、日ごとに別のクラスとして公開します。予約とチケットは1回ずつです。期間の自動延長や、1回だけ休む操作はまだありません。</p>
      <label class="td-span">授業メモ（生徒には見えません） <textarea id="td-notes" maxlength="600">${escapeHtml(prefill.instructions || "")}</textarea></label>
      <label>公開 <select id="td-status"><option value="open">公開する</option><option value="draft">下書き（予約画面に出さない）</option></select></label>
      <aside class="td-preview" id="td-preview"></aside>
      <p class="td-hint" id="td-policy"></p>
      <p class="td-note" id="td-form-status" hidden></p>
      <div class="td-form-actions">
        <button type="button" class="td-text" id="td-save-preset">テンプレートに保存</button>
        <button type="submit" class="td-primary" id="td-publish">クラスを公開する</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("#td-form");
  if (prefill.game) form.querySelector("#td-game").value = prefill.game;
  if (prefill.difficulty) form.querySelector("#td-level").value = prefill.difficulty;
  if (prefill.repeat) form.querySelector("#td-repeat").value = prefill.repeat;
  const sync = () => syncCreateForm(form, state);
  form.querySelector("#td-preset").onchange = (event) => {
    const id = event.target.value;
    const builtin = id === "builtin-mc"
      ? { title: "Minecraft Beginner", game: "minecraft", difficulty: "beginner", durationMin: 60, capacity: 6, repeat: "weekly" }
      : id === "builtin-rb"
        ? { title: "Roblox Intermediate", game: "roblox", difficulty: "intermediate", durationMin: 60, capacity: 6, repeat: "weekly" }
        : state.presets.find((item) => item.id === id);
    applyPreset(form, builtin);
    sync();
  };
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  sync();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector("#td-form-close").onclick = close;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.querySelector("#td-save-preset").onclick = () => savePreset(form, state, close, paint);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const status = dialog.querySelector("#td-form-status");
    const button = dialog.querySelector("#td-publish");
    button.disabled = true;
    status.hidden = false;
    status.textContent = "保存しています…";
    try {
      const payload = readPayload(form);
      if (!Number.isFinite(payload.startsAt) || payload.endsAt <= payload.startsAt) throw new Error("終了は開始よりあとにしてください。");
      if (teachLabActive()) labSaveClass(payload);
      else {
        await callFunction("publishClass", {
          title: payload.title,
          game: payload.game,
          difficulty: payload.difficulty,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          capacity: payload.capacity,
          repeat: payload.repeat,
          count: payload.count,
          status: payload.status,
          instructions: payload.instructions,
        });
      }
      close();
      await reload();
      state.anchor = jstKey(new Date(payload.startsAt));
      state.notice = payload.status === "draft" ? "下書きを保存しました。" : "クラスを公開しました。";
      state.noticeKind = "ok";
      paint();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  };
  dialog.showModal();
}

function applyPreset(form, preset) {
  if (!preset) return;
  if (preset.title) form.querySelector("#td-title").value = preset.title;
  form.querySelector("#td-game").value = preset.game || "minecraft";
  form.querySelector("#td-level").value = preset.difficulty || "beginner";
  form.querySelector("#td-capacity").value = String(preset.capacity || 6);
  form.querySelector("#td-repeat").value = preset.repeat || "none";
  form.querySelector("#td-notes").value = preset.instructions || "";
  if (preset.durationMin) {
    const [h, m] = form.querySelector("#td-start").value.split(":").map(Number);
    const total = h * 60 + m + Number(preset.durationMin);
    form.querySelector("#td-end").value = `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }
}

function syncCreateForm(form, state) {
  const repeat = form.querySelector("#td-repeat").value;
  form.querySelector("#td-count-label").hidden = repeat === "none";
  const allDay = form.querySelector("#td-allday").checked;
  form.querySelector("#td-start").disabled = allDay;
  form.querySelector("#td-end").disabled = allDay;
  const status = form.querySelector("#td-status").value;
  form.querySelector("#td-publish").textContent = status === "draft" ? "下書きを保存" : "クラスを公開する";
  const when = `${form.querySelector("#td-date").value} ${allDay ? "終日" : `${form.querySelector("#td-start").value}–${form.querySelector("#td-end").value}`}`;
  form.querySelector("#td-preview").innerHTML = `
    <p class="td-kicker">公開前の確認</p>
    <strong>${escapeHtml(form.querySelector("#td-title").value.trim() || "（タイトル未入力）")}</strong>
    <p>${escapeHtml(GAME_LABEL[form.querySelector("#td-game").value])} · ${escapeHtml(LEVEL_LABEL[form.querySelector("#td-level").value])}</p>
    <p>${escapeHtml(when)}</p>
    <p>${escapeHtml(REPEAT_LABEL[repeat] || "")}${repeat === "none" ? "" : ` × ${escapeHtml(form.querySelector("#td-count").value)}回`} · 定員 ${escapeHtml(form.querySelector("#td-capacity").value)}人</p>
    <p>${status === "draft" ? "下書きです。生徒の予約画面には出ません。" : "公開すると、生徒と保護者が予約できます。"}</p>`;
  form.querySelector("#td-policy").textContent = policyLine(state.policy);
}

async function savePreset(form, state, close, paint) {
  const title = form.querySelector("#td-title").value.trim();
  if (!title) return;
  const preset = {
    label: title,
    title,
    game: form.querySelector("#td-game").value,
    difficulty: form.querySelector("#td-level").value,
    capacity: Number(form.querySelector("#td-capacity").value),
    repeat: form.querySelector("#td-repeat").value,
    instructions: form.querySelector("#td-notes").value.trim(),
  };
  if (!teachLabActive()) {
    const uid = getAuth().currentUser.uid;
    await setDoc(doc(getFirestore(), "teacherPrivate", uid, "presets", `p${Date.now().toString(36)}`), {
      ...preset,
      createdAt: serverTimestamp(),
    });
  }
  state.presets.push({ id: `local-${state.presets.length}`, ...preset });
  state.notice = "テンプレートを保存しました。";
  state.noticeKind = "ok";
  close();
  paint();
}

function readPayload(form) {
  const allDay = form.querySelector("#td-allday").checked;
  const date = form.querySelector("#td-date").value;
  const repeat = form.querySelector("#td-repeat").value;
  return {
    title: form.querySelector("#td-title").value.trim(),
    game: form.querySelector("#td-game").value,
    difficulty: form.querySelector("#td-level").value,
    startsAt: jstStamp(date, allDay ? "00:00" : form.querySelector("#td-start").value),
    endsAt: jstStamp(date, allDay ? "23:59" : form.querySelector("#td-end").value),
    capacity: Number(form.querySelector("#td-capacity").value),
    repeat,
    count: repeat === "none" ? 1 : Number(form.querySelector("#td-count").value || 4),
    status: form.querySelector("#td-status").value === "draft" ? "draft" : "open",
    instructions: form.querySelector("#td-notes").value.trim(),
  };
}

function openAvailability(root, state, paint) {
  const dialog = document.createElement("dialog");
  dialog.className = "gc-modal td-sheet";
  const hours = state.availability.hours || {};
  dialog.innerHTML = `
    <form class="td-form" id="td-hours-form">
      <header class="td-form-head"><h2>対応可能時間</h2><button type="button" class="td-icon" id="td-hours-close" aria-label="閉じる">×</button></header>
      <p class="td-hint">時間の外や、休む日にはクラスを公開できません。生徒には詳細は見えません。</p>
      <div class="td-hour-list">
        ${WEEKDAY.map((label, index) => {
          const range = hours[String(index)]?.[0];
          return `<label class="td-hour-row"><input type="checkbox" data-day="${index}" ${range ? "checked" : ""}>${label}
            <input type="time" data-start="${index}" value="${range ? minLabel(range[0]) : "10:00"}">
            <input type="time" data-end="${index}" value="${range ? minLabel(range[1]) : "18:00"}"></label>`;
        }).join("")}
      </div>
      <h3>休む日・対応できない時間</h3>
      <ul class="td-block-list" id="td-blocks">${(state.availability.blocks || []).map((block, index) => `<li data-index="${index}">${escapeHtml(block.label || "対応不可")}<button type="button" data-remove="${index}">外す</button></li>`).join("") || "<li data-empty>まだありません。</li>"}</ul>
      <div class="td-block-add">
        <input id="td-block-date" type="date" value="${jstKey(new Date())}">
        <input id="td-block-start" type="time" value="09:00">
        <input id="td-block-end" type="time" value="18:00">
        <input id="td-block-label" maxlength="40" placeholder="自分用のメモ">
        <label><input id="td-block-holiday" type="checkbox"> 終日</label>
        <button type="button" class="td-text" id="td-block-add">追加</button>
      </div>
      <label class="td-allday"><input id="td-remind" type="checkbox"> 授業の1時間前に通知する</label>
      <div class="td-form-actions"><button type="submit" class="td-primary">保存する</button></div>
      <p class="td-note" id="td-hours-status" hidden></p>
    </form>`;
  document.body.appendChild(dialog);
  const blocks = [...(state.availability.blocks || [])];
  dialog.showModal();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector("#td-hours-close").onclick = close;
  dialog.querySelector("#td-block-add").onclick = () => {
    const date = dialog.querySelector("#td-block-date").value;
    const holiday = dialog.querySelector("#td-block-holiday").checked;
    const startAt = jstStamp(date, holiday ? "00:00" : dialog.querySelector("#td-block-start").value);
    const endAt = jstStamp(date, holiday ? "23:59" : dialog.querySelector("#td-block-end").value);
    if (!Number.isFinite(startAt) || endAt <= startAt) return;
    blocks.push({
      startAt,
      endAt,
      label: dialog.querySelector("#td-block-label").value.trim().slice(0, 40),
      kind: holiday ? "holiday" : "block",
    });
    dialog.querySelector("[data-empty]")?.remove();
    dialog.querySelector("#td-blocks").insertAdjacentHTML("beforeend", `<li>${escapeHtml(blocks[blocks.length - 1].label || "対応不可")}</li>`);
  };
  dialog.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => {
      blocks[Number(button.dataset.remove)] = null;
      button.closest("li")?.remove();
    };
  });
  dialog.querySelector("#td-hours-form").onsubmit = async (event) => {
    event.preventDefault();
    const nextHours = {};
    WEEKDAY.forEach((_, index) => {
      if (!dialog.querySelector(`[data-day="${index}"]`).checked) return;
      const start = toMinutes(dialog.querySelector(`[data-start="${index}"]`).value);
      const end = toMinutes(dialog.querySelector(`[data-end="${index}"]`).value);
      if (end > start) nextHours[String(index)] = [[start, end]];
    });
    const next = { hours: nextHours, blocks: blocks.filter(Boolean).slice(0, 80) };
    try {
      if (!teachLabActive()) {
        const uid = getAuth().currentUser.uid;
        const db = getFirestore();
        await setDoc(doc(db, "teacherPrivate", uid, "availability", "settings"), next);
        await updateDoc(doc(db, "users", uid), { classReminders: dialog.querySelector("#td-remind").checked });
      }
      state.availability = next;
      state.notice = "対応可能時間を保存しました。";
      state.noticeKind = "ok";
      close();
      paint();
    } catch (error) {
      const status = dialog.querySelector("#td-hours-status");
      status.hidden = false;
      status.textContent = error.message;
    }
  };
}

function minLabel(minutes) {
  const value = Number(minutes) || 0;
  return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
}

function toMinutes(value) {
  const [hour, minute] = String(value || "0:0").split(":").map(Number);
  return hour * 60 + minute;
}

export function duplicateClass(item) {
  const start = item.startsAt ? jstParts(new Date(item.startsAt)) : null;
  const end = item.endsAt ? jstParts(new Date(item.endsAt)) : null;
  rememberPrefill({
    title: item.title,
    game: item.game,
    difficulty: item.difficulty,
    capacity: item.capacity || 6,
    repeat: "none",
    instructions: item.instructions || "",
    date: jstKey(new Date()),
    time: start ? `${start.hour}:${start.minute}` : "16:00",
    end: end ? `${end.hour}:${end.minute}` : "17:00",
  });
  document.querySelector('[data-hub-action="publish-class"]')?.click();
}

export async function removeClass(item) {
  const booked = Number(item.bookedCount || 0);
  const ok = await confirmAction({
    title: "クラスを削除しますか？",
    message: booked
      ? `「${item.title || "クラス"}」を削除します。\n予約している ${booked} 人のチケットは返却されます。\nこの操作は取り消せません。`
      : `「${item.title || "クラス"}」を削除します。\nこの操作は取り消せません。`,
    confirmLabel: "削除する",
    cancelLabel: "やめる",
    danger: true,
  });
  if (!ok) return false;
  if (teachLabActive()) labDeleteClass(item.id);
  else await callFunction("deleteClass", { classId: item.id });
  return true;
}
