import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, doc, documentId, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

function jstParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function jstKey(date) {
  const parts = jstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function clock(date) {
  const parts = jstParts(date);
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${hour}:${parts.minute}`;
}

function isAllDay(item) {
  if (!item.startsAt || !item.endsAt) return false;
  const start = jstParts(item.startsAt);
  const end = jstParts(item.endsAt);
  const startHour = start.hour === "24" ? "00" : start.hour;
  const endHour = end.hour === "24" ? "00" : end.hour;
  return startHour === "00" && start.minute === "00" && endHour === "23" && end.minute === "59";
}

function timeLabel(item) {
  if (isAllDay(item)) return "終日";
  const start = item.startsAt ? clock(item.startsAt) : "";
  const end = item.endsAt ? clock(item.endsAt) : "";
  return end ? `${start}–${end}` : start;
}

function seatLabel(item) {
  if (item.bookedCount == null) return "";
  return item.capacity ? `${item.bookedCount}/${item.capacity}人` : `${item.bookedCount}人`;
}

function coversToday(item, todayKey) {
  if (!item.startsAt) return false;
  const startKey = jstKey(item.startsAt);
  if (!item.endsAt) return startKey === todayKey;
  const endParts = jstParts(item.endsAt);
  let endKey = jstKey(item.endsAt);
  if (endParts.hour === "00" && endParts.minute === "00" && endKey > startKey) {
    const shifted = new Date(Date.UTC(Number(endParts.year), Number(endParts.month) - 1, Number(endParts.day) - 1));
    endKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  }
  return todayKey >= startKey && todayKey <= endKey;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function classFromDoc(item) {
  const data = item.data();
  return {
    id: item.id,
    title: data.title || "クラス",
    teacherName: data.teacherName || "",
    startsAt: data.startsAt?.toDate?.() || null,
    endsAt: data.endsAt?.toDate?.() || null,
    capacity: Number(data.capacity || 0),
    bookedCount: Number.isFinite(Number(data.bookedCount)) ? Number(data.bookedCount) : null,
    teacherId: data.teacherId || "",
    status: data.status || "open",
  };
}

async function classesForRole(db, role, uid) {
  if (role === "owner") {
    const snap = await getDocs(query(collection(db, "classes"), where("status", "==", "open")));
    return snap.docs.map(classFromDoc);
  }
  if (role === "admin") {
    const snap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", uid)));
    return snap.docs.map(classFromDoc).filter((item) => item.startsAt && item.status === "open");
  }
  const studentIds = role === "parent" ? await linkedStudentIds(db, uid) : [uid];
  const bookings = [];
  for (const studentId of studentIds) {
    const snap = await getDocs(query(collection(db, "bookings"), where("studentId", "==", studentId)));
    snap.forEach((item) => {
      const data = item.data();
      if (data.status === "booked" && data.classId) bookings.push(data.classId);
    });
  }
  const unique = [...new Set(bookings)];
  const classes = await Promise.all(unique.map(async (id) => {
    const snap = await getDoc(doc(db, "classes", id));
    return snap.exists() ? classFromDoc(snap) : null;
  }));
  return classes.filter((item) => item && item.status === "open");
}

async function linkedStudentIds(db, uid) {
  const me = await getDoc(doc(db, "users", uid));
  const data = me.data() || {};
  const fromLinks = Array.isArray(data.linkedStudentIds) ? data.linkedStudentIds : [];
  const fromChildren = (data.linkedChildren || []).map((kid) => kid.id).filter(Boolean);
  return [...new Set([...fromLinks, ...fromChildren])];
}

async function recordedAttendance(db, ids) {
  const found = new Set();
  for (let index = 0; index < ids.length; index += 30) {
    const chunk = ids.slice(index, index + 30);
    const snap = await getDocs(query(collection(db, "attendance"), where(documentId(), "in", chunk)));
    snap.forEach((item) => found.add(item.id));
  }
  return found;
}

async function pendingAttendance(db, classes, uid, now) {
  const started = classes.filter((item) => item.startsAt && item.startsAt.getTime() <= now);
  const result = (rows, found) => {
    const missing = new Set(rows.filter((item) => !found.has(item.id)).map((item) => item.id));
    return { count: missing.size, missing };
  };
  if (!started.length) return { count: 0, missing: new Set() };
  try {
    const found = await recordedAttendance(db, started.map((item) => item.id));
    return result(started, found);
  } catch {
    try {
      const own = started.filter((item) => item.teacherId === uid);
      if (!own.length) return { count: null, missing: new Set() };
      const found = await recordedAttendance(db, own.map((item) => item.id));
      return result(own, found);
    } catch {
      return { count: null, missing: new Set() };
    }
  }
}

function openClassDay(key, action) {
  sessionStorage.setItem("gc-focus-day", key);
  document.querySelector(`[data-hub-action="${action}"]`)?.click();
}

function actionButton(action, label, pageLabel, icon) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-quick";
  button.dataset.hubAction = action;
  button.dataset.hubLabel = pageLabel;
  button.innerHTML = `${icon}<span>${label}</span>`;
  return button;
}

const ICONS = {
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 19c1-3 3-4.5 6-4.5s5 1.5 6 4.5"/><path d="m15 11 1.5 1.5L20 9"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="2.5"/><circle cx="16" cy="10" r="2"/><path d="M4.5 18c.7-2.2 2.4-3.3 4.5-3.3s3.8 1.1 4.5 3.3M13 18c.4-1.4 1.5-2.2 3-2.2 1.4 0 2.4.7 3 2.2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
};

export async function renderHome(dash, role, displayName) {
  const staff = role === "admin" || role === "owner";
  const lead = document.getElementById("hub-lead");
  const hubDate = document.getElementById("hub-date");
  const greeting = document.getElementById("hub-greeting");
  const name = String(displayName || "").trim();
  if (greeting) greeting.textContent = name ? `おかえりなさい、${name}さん` : "おかえりなさい";
  const todayParts = jstParts(new Date());
  const weekday = { Sun: "日", Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土" }[todayParts.weekday] || "";
  if (hubDate) hubDate.textContent = `${Number(todayParts.year)}年${Number(todayParts.month)}月${Number(todayParts.day)}日（${weekday}）`;
  if (lead) lead.textContent = staff ? "今日のクラスと学習状況を確認しましょう。" : "今日の予定を確認しましょう。";
  dash.replaceChildren();
  dash.className = "gc-dash gc-home";
  const loading = document.createElement("p");
  loading.className = "gc-muted";
  loading.textContent = "読み込んでいます…";
  dash.appendChild(loading);
  try {
    const db = getFirestore();
    const uid = getAuth().currentUser.uid;
    const todayKey = jstKey(new Date());
    const now = Date.now();
    const classes = (await classesForRole(db, role, uid))
      .filter((item) => coversToday(item, todayKey))
      .sort((a, b) => (a.startsAt?.getTime?.() || 0) - (b.startsAt?.getTime?.() || 0));
    const attendance = staff ? await pendingAttendance(db, classes, uid, now) : { count: null, missing: new Set() };
    const pending = attendance.count;
    const booked = classes.reduce((sum, item) => sum + (item.bookedCount || 0), 0);
    const classAction = staff ? "publish-class" : "book";
    dash.replaceChildren();

    const stats = document.createElement("div");
    stats.className = "gc-stats";
    const statCards = staff
      ? [
        ["今日のクラス", classes.length, "publish-class", "クラス", ICONS.calendar],
        ...(pending == null ? [] : [["出席確認待ち", pending, "attendance", "出席", ICONS.check]]),
        ["今日の予約", booked, "publish-class", "クラス", ICONS.people],
      ]
      : [
        ["今日のクラス", classes.length, classAction, "講座を予約", ICONS.calendar],
      ];
    if (statCards.length < 3) stats.classList.add("is-short");
    statCards.forEach(([label, count, action, pageLabel, icon]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-stat";
      button.dataset.hubAction = action;
      button.dataset.hubLabel = pageLabel;
      button.innerHTML = `<i>${icon}</i><span class="gc-stat-copy"><strong>${count}</strong><span>${label}</span></span>`;
      stats.appendChild(button);
    });
    dash.appendChild(stats);

    const grid = document.createElement("div");
    grid.className = "gc-home-grid";
    const schedule = document.createElement("section");
    schedule.className = "gc-panel";
    const head = document.createElement("div");
    head.className = "gc-home-head";
    const title = document.createElement("h3");
    title.textContent = "今日のクラス";
    const more = document.createElement("button");
    more.type = "button";
    more.className = "gc-text-btn";
    more.dataset.hubAction = classAction;
    more.dataset.hubLabel = staff ? "クラス" : "講座を予約";
    more.textContent = "すべて見る";
    head.append(title, more);
    schedule.appendChild(head);
    if (!classes.length) {
      const empty = document.createElement("p");
      empty.className = "gc-muted";
      empty.textContent = "今日はクラスの予定がありません。";
      schedule.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "gc-today-list";
      classes.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gc-today-class";
        const started = item.startsAt && item.startsAt.getTime() <= now;
        const ended = item.endsAt && item.endsAt.getTime() <= now;
        const state = ended ? "done" : started ? "live" : "soon";
        button.classList.add(`is-${state}`);
        const badge = ended ? "終了" : started ? "進行中" : "予定";
        const teacher = item.teacherName && item.teacherName.trim().toLowerCase() !== name.toLowerCase() ? item.teacherName : "";
        const meta = [timeLabel(item), seatLabel(item), teacher].filter(Boolean).join(" · ");
        button.innerHTML = `<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(meta)}</small></span><em>${badge}</em>`;
        button.addEventListener("click", () => openClassDay(jstKey(item.startsAt), classAction));
        list.appendChild(button);
      });
      schedule.appendChild(list);
    }
    grid.appendChild(schedule);
    if (staff) {
      const actions = document.createElement("section");
      actions.className = "gc-panel gc-aside";
      const actionTitle = document.createElement("h3");
      actionTitle.textContent = "クイック操作";
      actions.appendChild(actionTitle);
      const actionList = document.createElement("div");
      actionList.className = "gc-quick-list";
      [
        actionButton("publish-class", "クラスを追加", "クラス", ICONS.plus),
        actionButton("attendance", "出席を確認", "出席", ICONS.check),
      ].forEach((button) => actionList.appendChild(button));
      actions.appendChild(actionList);
      grid.appendChild(actions);
    }
    dash.appendChild(grid);
  } catch (error) {
    dash.replaceChildren();
    const message = document.createElement("p");
    message.className = "gc-warn";
    message.textContent = error.message || "読み込めませんでした。";
    dash.appendChild(message);
  }
}
