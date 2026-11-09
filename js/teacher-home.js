import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, documentId, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  GAME_LABEL,
  LEVEL_LABEL,
  classPhase,
  clockLabel,
  escapeHtml,
  jstKey,
  jstParts,
  labAttendance,
  labClasses,
  labNote,
  nextActionLabel,
  openWorkspace,
  phaseLabel,
  seatLabel,
  teachLabActive,
} from "./teacher-context.js?v=20261106-teacher";

const WEEKDAY = { Sun: "日", Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土" };

function greeting(name) {
  const hour = Number(jstParts(new Date()).hour);
  const hello = hour < 11 ? "おはようございます！" : hour < 17 ? "こんにちは！" : "こんばんは！";
  const who = name ? `${name}さん、` : "";
  return { hello: `${who}${hello}`, sub: "今日も楽しい授業を始めましょう！" };
}

function mapClass(item) {
  const data = item.data ? item.data() : item;
  const id = item.id;
  return {
    id,
    title: data.title || "クラス",
    teacherName: data.teacherName || "",
    teacherId: data.teacherId || "",
    game: data.game || "",
    difficulty: data.difficulty || "",
    startsAt: data.startsAt?.toDate?.() || data.startsAt || null,
    endsAt: data.endsAt?.toDate?.() || data.endsAt || null,
    capacity: Number(data.capacity || 6),
    bookedCount: Number(data.bookedCount || 0),
    status: data.status || "open",
  };
}

async function recorded(db, ids) {
  const found = new Set();
  for (let index = 0; index < ids.length; index += 30) {
    const chunk = ids.slice(index, index + 30);
    if (!chunk.length) continue;
    const snap = await getDocs(query(collection(db, "attendance"), where(documentId(), "in", chunk)));
    snap.forEach((item) => found.add(item.id));
  }
  return found;
}

export async function renderTeacherHome(dash, role, displayName) {
  const lead = document.getElementById("hub-lead");
  const hubDate = document.getElementById("hub-date");
  const greetingNode = document.getElementById("hub-greeting");
  const name = String(displayName || "").trim();
  const hello = greeting(name && name !== "アカウント" ? name : "");
  if (greetingNode) greetingNode.textContent = hello.hello;
  if (lead) lead.textContent = hello.sub;
  const todayParts = jstParts(new Date());
  const weekday = WEEKDAY[todayParts.weekday] || "";
  if (hubDate) hubDate.textContent = `${Number(todayParts.year)}年${Number(todayParts.month)}月${Number(todayParts.day)}日（${weekday}）`;
  dash.className = "gc-dash gc-home td-app";
  dash.innerHTML = `<div class="td-skel" aria-hidden="true"><span></span><span></span><span></span></div>`;
  try {
    const todayKey = jstKey(new Date());
    const now = Date.now();
    const uid = teachLabActive() ? "lab" : getAuth().currentUser?.uid;
    if (!uid) {
      dash.replaceChildren();
      return;
    }
    let classes = [];
    let attendanceIds = new Set();
    let reportIds = new Set();
    let homeworkClassIds = new Set();
    const notes = new Map();
    if (teachLabActive()) {
      classes = labClasses().map(mapClass);
      classes.forEach((item) => {
        if (labAttendance(item.id)) attendanceIds.add(item.id);
        const note = labNote(item.id);
        if (note) notes.set(item.id, note);
      });
    } else {
      const db = getFirestore();
      const classQuery = role === "owner"
        ? query(collection(db, "classes"), where("status", "==", "open"))
        : query(collection(db, "classes"), where("teacherId", "==", uid));
      const snap = await getDocs(classQuery);
      classes = snap.docs.map(mapClass).filter((item) => item.status !== "cancelled");
      if (role === "owner") classes = classes.filter((item) => item.teacherId === uid || item.status === "open");
      const mine = role === "owner" ? classes.filter((item) => item.teacherId === uid) : classes;
      const started = mine.filter((item) => item.startsAt && item.startsAt.getTime() <= now && item.status === "open");
      try {
        attendanceIds = await recorded(db, started.map((item) => item.id));
      } catch {
        attendanceIds = new Set();
      }
      try {
        const reports = await getDocs(query(collection(db, "classReports"), where("teacherId", "==", uid)));
        reports.forEach((item) => {
          const classId = item.data().classId;
          if (classId) reportIds.add(classId);
        });
      } catch { /* reports stay empty */ }
      try {
        const homework = await getDocs(query(collection(db, "homeworkAssignments"), where("teacherId", "==", uid)));
        homework.forEach((item) => {
          (item.data().classIds || []).forEach((id) => homeworkClassIds.add(id));
        });
      } catch { /* homework stay empty */ }
      const soon = mine.filter((item) => item.startsAt && jstKey(item.startsAt) === todayKey);
      await Promise.all(soon.map(async (item) => {
        try {
          const noteSnap = await getDoc(doc(db, "teacherPrivate", uid, "notes", item.id));
          if (noteSnap.exists()) notes.set(item.id, noteSnap.data());
        } catch { /* private notes are optional */ }
      }));
    }
    const today = classes
      .filter((item) => item.startsAt && jstKey(item.startsAt) === todayKey && (teachLabActive() || item.teacherId === uid))
      .sort((a, b) => (a.startsAt?.getTime?.() || 0) - (b.startsAt?.getTime?.() || 0));
    const pendingAttendance = today.filter((item) => item.status === "open" && item.startsAt.getTime() <= now && !attendanceIds.has(item.id)).length;
    const booked = today.reduce((sum, item) => sum + (item.bookedCount || 0), 0);
    const tasks = buildTasks(today, attendanceIds, reportIds, homeworkClassIds, notes, now);
    paint(dash, { hello, today, pendingAttendance, booked, tasks, now });
  } catch (error) {
    dash.innerHTML = `<p class="td-warn">${escapeHtml(error.message || "読み込めませんでした。")}</p>`;
  }
}

function buildTasks(today, attendanceIds, reportIds, homeworkClassIds, notes, now) {
  const tasks = [];
  today.forEach((item) => {
    if (item.status === "draft") return;
    const ended = item.endsAt && item.endsAt.getTime() <= now;
    const started = item.startsAt && item.startsAt.getTime() <= now;
    if (started && !attendanceIds.has(item.id)) {
      tasks.push({ classId: item.id, tab: "after", title: "出席を記録", detail: item.title, tone: "alert" });
    } else if (ended && !reportIds.has(item.id)) {
      tasks.push({ classId: item.id, tab: "after", title: "レポートを送る", detail: item.title, tone: "report" });
    }
    const note = notes.get(item.id);
    if (note?.homeworkRequired && !homeworkClassIds.has(item.id)) {
      tasks.push({ classId: item.id, tab: "after", title: "宿題を送る", detail: item.title, tone: "homework" });
    }
    if (!started && note && checklistOpen(note)) {
      tasks.push({ classId: item.id, tab: "overview", title: "授業の準備", detail: item.title, tone: "prep" });
    }
  });
  return tasks.slice(0, 6);
}

function checklistOpen(note) {
  const items = note.checklist || {};
  return Object.values(items).some((value) => value === false);
}

function paint(dash, { today, pendingAttendance, booked, tasks, now }) {
  const cards = today.map((item) => {
    const phase = classPhase(item, now);
    const unfinished = phase === "done" && tasks.some((task) => task.classId === item.id);
    const action = nextActionLabel(phase, unfinished);
    const when = `${clockLabel(item.startsAt)}–${clockLabel(item.endsAt)}`;
    return `
      <button type="button" class="td-class is-${phase}" data-class="${escapeHtml(item.id)}" data-tab="${phase === "done" ? "after" : "overview"}">
        <span class="td-class-time">${escapeHtml(when)}</span>
        <span class="td-class-copy">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(GAME_LABEL[item.game] || item.game || "ゲーム")} · ${escapeHtml(LEVEL_LABEL[item.difficulty] || item.difficulty || "")} · ${escapeHtml(seatLabel(item))}人</small>
        </span>
        <span class="td-pill is-${phase}">${phaseLabel(phase)}</span>
        <span class="td-class-go">${action}</span>
      </button>`;
  }).join("");
  dash.innerHTML = `
    <div class="td-home">
      <div class="td-stats">
        <button type="button" class="td-stat" data-go="publish-class"><strong>${today.length}</strong><span>今日のクラス</span></button>
        <button type="button" class="td-stat" data-go="attendance"><strong>${pendingAttendance}</strong><span>出席確認待ち</span></button>
        <button type="button" class="td-stat" data-go="publish-class"><strong>${booked}</strong><span>今日の予約</span></button>
      </div>
      <div class="td-home-grid">
        <section class="td-panel">
          <div class="td-panel-head"><h3>今日のクラス</h3><button type="button" class="td-text" data-go="publish-class">マイカレンダー</button></div>
          ${cards || `<p class="td-empty">今日はクラスの予定がありません。</p>`}
        </section>
        <div class="td-side">
          <section class="td-panel">
            <h3>やること</h3>
            ${tasks.length ? `<div class="td-tasks">${tasks.map((task) => `
              <button type="button" class="td-task is-${task.tone}" data-class="${escapeHtml(task.classId)}" data-tab="${escapeHtml(task.tab)}">
                <strong>${escapeHtml(task.title)}</strong>
                <small>${escapeHtml(task.detail)}</small>
              </button>`).join("")}</div>` : `<p class="td-empty">いま対応が必要な作業はありません。</p>`}
          </section>
          <section class="td-panel">
            <h3>クイック操作</h3>
            <div class="td-quick">
              <button type="button" class="td-quick-btn" data-go="publish-class" data-create="1">クラスを作成</button>
              <button type="button" class="td-quick-btn" data-go="publish-class">マイカレンダー</button>
              <button type="button" class="td-quick-btn" data-go="attendance">出席を記録</button>
            </div>
          </section>
        </div>
      </div>
    </div>`;
  dash.querySelectorAll("[data-class]").forEach((button) => {
    button.onclick = () => openWorkspace(button.dataset.class, button.dataset.tab || "overview");
  });
  dash.querySelectorAll("[data-go]").forEach((button) => {
    button.onclick = () => {
      if (button.dataset.create) {
        try { sessionStorage.setItem("gc-open-create", "1"); } catch { /* ignore */ }
      }
      const target = document.querySelector(`[data-hub-action="${button.dataset.go}"]`);
      target?.click();
    };
  });
}
