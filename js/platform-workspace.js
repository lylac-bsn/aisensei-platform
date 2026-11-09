import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, setDoc, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  GAME_LABEL, LEVEL_LABEL, REPEAT_LABEL,
  classPhase, clockLabel, escapeHtml, jstParts, labAttendance, labBookings, labClasses,
  labNote, labReport, labSaveNote, openHub, peekClass, peekWorkspaceTab, phaseLabel,
  rememberClass, rememberReturn, rememberWorkspaceTab, seatLabel, setHomeworkClass,
  setOpenReport, teachLabActive,
} from "./teacher-context.js?v=20261106-teacher";
import { duplicateClass, removeClass } from "./teacher-calendar.js?v=20261106-teacher5";

const CHECKS = [
  ["roster", "予約した生徒を確認"],
  ["game", "Minecraft / Roblox を準備"],
  ["audio", "音声とマイクを確認"],
  ["vocab", "単語を見直す"],
  ["collab", "COllAB を準備"],
];

function mapClass(snap) {
  const data = snap.data ? snap.data() : snap;
  return {
    id: snap.id,
    title: data.title || "クラス",
    game: data.game || "",
    difficulty: data.difficulty || "",
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

async function loadBundle(classId, role) {
  if (teachLabActive()) {
    const item = labClasses().map(mapClass).find((row) => row.id === classId);
    if (!item) return null;
    const present = labAttendance(classId);
    return {
      item,
      students: labBookings(classId).map((row) => ({
        id: row.studentId,
        name: row.studentName,
        present: present ? present.has(row.studentId) : null,
        first: row.studentId !== "s1",
      })),
      attendanceSaved: Boolean(present),
      report: labReport(classId),
      homework: [],
      note: labNote(classId) || defaultNote(),
    };
  }
  const db = getFirestore();
  const uid = getAuth().currentUser?.uid;
  const snap = await getDoc(doc(db, "classes", classId));
  if (!snap.exists()) return null;
  const item = mapClass(snap);
  if (item.teacherId !== uid && role !== "owner") return { denied: true, item };
  const [bookingSnap, attendanceSnap, reportSnap, homeworkSnap, noteSnap] = await Promise.all([
    getDocs(query(collection(db, "bookings"), where("teacherId", "==", item.teacherId || uid))),
    getDoc(doc(db, "attendance", classId)),
    getDocs(query(collection(db, "classReports"), where("teacherId", "==", item.teacherId || uid))),
    getDocs(query(collection(db, "homeworkAssignments"), where("teacherId", "==", item.teacherId || uid))),
    getDoc(doc(db, "teacherPrivate", uid, "notes", classId)).catch(() => null),
  ]);
  const present = attendanceSnap.exists() ? new Set(attendanceSnap.data().presentIds || []) : null;
  const mine = bookingSnap.docs.map((row) => row.data()).filter((row) => row.status === "booked");
  const students = mine
    .filter((row) => row.classId === classId)
    .map((row) => ({
      id: row.studentId,
      name: row.studentName || "生徒",
      present: present ? present.has(row.studentId) : null,
      first: !mine.some((other) => other.studentId === row.studentId && other.classId !== classId && other.startsAt?.toMillis?.() < (item.startsAt?.getTime?.() || 0)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const report = reportSnap.docs.map((row) => row.data()).find((row) => row.classId === classId) || null;
  const homework = homeworkSnap.docs
    .map((row) => ({ id: row.id, ...row.data() }))
    .filter((row) => (row.classIds || []).includes(classId));
  return {
    item,
    students,
    attendanceSaved: attendanceSnap.exists(),
    report,
    homework,
    note: noteSnap?.exists?.() ? noteSnap.data() : defaultNote(),
  };
}

function defaultNote() {
  return {
    notes: "",
    homeworkRequired: false,
    checklist: Object.fromEntries(CHECKS.map(([id]) => [id, false])),
  };
}

export async function renderClassWorkspace(root, role) {
  root.hidden = false;
  root.classList.add("td-app");
  const classId = peekClass();
  if (!classId) {
    root.innerHTML = `<p class="td-empty">クラスが選ばれていません。</p>`;
    return;
  }
  root.innerHTML = `<div class="td-skel" aria-hidden="true"><span></span><span></span></div>`;
  let bundle;
  try {
    bundle = await loadBundle(classId, role);
  } catch (error) {
    root.innerHTML = `<p class="td-warn">${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!bundle) {
    root.innerHTML = `<p class="td-empty">このクラスは見つかりません。</p>`;
    return;
  }
  if (bundle.denied) {
    root.innerHTML = `<p class="td-warn">このクラスは別の先生の担当です。</p>`;
    return;
  }
  let tab = peekWorkspaceTab();
  const paint = () => {
    root.innerHTML = view(bundle, tab);
    bind(root, bundle, tab, (next) => {
      tab = next;
      rememberWorkspaceTab(next);
      paint();
    }, role);
  };
  paint();
}

function whenLabel(item) {
  if (!item.startsAt) return "日時未設定";
  const parts = jstParts(item.startsAt);
  const weekday = { Sun: "日", Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土" }[parts.weekday] || "";
  return `${Number(parts.month)}月${Number(parts.day)}日（${weekday}） ${clockLabel(item.startsAt)}–${clockLabel(item.endsAt)}`;
}

function view(bundle, tab) {
  const item = bundle.item;
  const phase = classPhase(item);
  const seats = Math.max(0, Number(item.capacity || 6) - Number(item.bookedCount || 0));
  return `
    <article class="td-work">
      <header class="td-work-head">
        <button type="button" class="td-text" data-back>マイカレンダーへ</button>
        <p class="td-kicker">${escapeHtml(GAME_LABEL[item.game] || item.game)} · ${escapeHtml(LEVEL_LABEL[item.difficulty] || item.difficulty)}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(whenLabel(item))}</p>
        <div class="td-work-meta">
          <span>${escapeHtml(seatLabel(item))}人予約</span>
          <span>残り ${seats}席</span>
          <span class="td-pill is-${phase}">${phaseLabel(phase)}</span>
          ${item.status === "draft" ? `<span class="td-pill is-draft">下書き</span>` : ""}
        </div>
      </header>
      <div class="td-tabs" role="tablist">
        ${[["overview", "概要"], ["students", "生徒"], ["after", "授業後"]].map(([id, label]) => `<button type="button" class="td-tab${tab === id ? " is-on" : ""}" data-tab="${id}" role="tab">${label}</button>`).join("")}
      </div>
      <div class="td-work-body">${tab === "students" ? studentsView(bundle) : tab === "after" ? afterView(bundle) : overviewView(bundle)}</div>
    </article>`;
}

function overviewView(bundle) {
  const item = bundle.item;
  return `
    <section class="td-panel">
      <dl class="td-facts">
        <div><dt>先生</dt><dd>${escapeHtml(item.teacherName || "自分")}</dd></div>
        <div><dt>ゲーム</dt><dd>${escapeHtml(GAME_LABEL[item.game] || "—")}</dd></div>
        <div><dt>レベル</dt><dd>${escapeHtml(LEVEL_LABEL[item.difficulty] || "—")}</dd></div>
        <div><dt>日時</dt><dd>${escapeHtml(whenLabel(item))}</dd></div>
        <div><dt>予約</dt><dd>${escapeHtml(seatLabel(item))}人</dd></div>
        <div><dt>繰り返し</dt><dd>${escapeHtml(REPEAT_LABEL[item.seriesRepeat] || "繰り返さない")}${item.seriesCount > 1 ? ` · ${item.seriesCount}回のうちの1回` : ""}</dd></div>
      </dl>
      <h3>授業メモ</h3>
      <p>${item.instructions ? escapeHtml(item.instructions) : "作成時のメモはありません。下の準備メモは自分だけが見られます。"}</p>
      ${prepView(bundle)}
      <div class="td-actions">
        <button type="button" class="td-primary" data-jump="attendance">出席を記録</button>
        <button type="button" class="td-primary" data-jump="quiz">COllABを開く</button>
        <button type="button" class="td-primary" data-jump="homework">宿題を作成・送信</button>
        <button type="button" class="td-primary" data-jump="report">レポートを作成</button>
      </div>
      <div class="td-actions">
        <button type="button" class="td-text" data-dup>この設定で複製</button>
        <button type="button" class="td-danger" data-del>クラスを削除</button>
      </div>
    </section>`;
}

function prepView(bundle) {
  const note = bundle.note || defaultNote();
  return `
    <h3>準備チェック</h3>
    <p class="td-hint">任意です。終わっていなくても授業は始められます。</p>
    <div class="td-checks">
      ${CHECKS.map(([id, label]) => `<label><input type="checkbox" data-check="${id}" ${note.checklist?.[id] ? "checked" : ""}> ${label}</label>`).join("")}
    </div>
    <label class="td-allday"><input type="checkbox" id="td-hw-required" ${note.homeworkRequired ? "checked" : ""}> この授業は宿題が必要</label>
    <label>自分用メモ <textarea id="td-private-note" maxlength="2000" placeholder="つまずいたところ、次に出したい単語">${escapeHtml(note.notes || "")}</textarea></label>
    <button type="button" class="td-text" id="td-save-note">メモを保存</button>
    <p class="td-note" id="td-note-status" hidden></p>`;
}

function studentsView(bundle) {
  if (!bundle.students.length) return `<p class="td-empty">まだ予約している生徒はいません。</p>`;
  return `<div class="td-students">${bundle.students.map((student) => `
    <article class="td-student">
      <span class="td-avatar">${escapeHtml((student.name || "?").slice(0, 1))}</span>
      <div>
        <strong>${escapeHtml(student.name)}</strong>
        <small>${student.first ? "この先生のクラスは初めて" : "以前も予約あり"} · ${student.present == null ? "出席未記録" : student.present ? "出席" : "欠席"}</small>
      </div>
    </article>`).join("")}</div>
    <p class="td-hint">出席の詳しい記録、宿題、レポートは「授業後」から開けます。連絡先などの個人情報はここには出しません。</p>`;
}

function afterView(bundle) {
  const attendance = bundle.attendanceSaved ? "完了" : "未記録";
  const report = bundle.report ? "送信済み" : "未送信";
  const homework = bundle.homework.length ? `送信済み ${bundle.homework.length}件` : "まだ送っていません";
  return `
    <div class="td-after">
      <article class="td-task-card"><strong>出席登録</strong><span>${attendance}</span><button type="button" data-jump="attendance">${bundle.attendanceSaved ? "出席を確認" : "出席を記録"}</button></article>
      <article class="td-task-card"><strong>レポート</strong><span>${report}</span><button type="button" data-jump="report">${bundle.report ? "レポートを見る" : "レポートを作成"}</button></article>
      <article class="td-task-card"><strong>宿題</strong><span>${escapeHtml(homework)}</span><button type="button" data-jump="homework">宿題を作成・送信</button></article>
    </div>
    ${bundle.report ? `<section class="td-panel"><h3>送ったレポート</h3><p>${escapeHtml(bundle.report.summary || "")}</p></section>` : ""}
    ${bundle.homework.length ? `<section class="td-panel"><h3>このクラスの宿題</h3><ul>${bundle.homework.map((item) => `<li>${escapeHtml(item.title || "宿題")}</li>`).join("")}</ul></section>` : ""}
    <p class="td-hint">欠席や未提出を、宿題がない授業のエラーにはしません。宿題が必要なときだけ概要で「宿題が必要」にします。</p>`;
}

function bind(root, bundle, tab, setTab) {
  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.onclick = () => setTab(button.dataset.tab);
  });
  root.querySelector("[data-back]").onclick = () => openHub("publish-class");
  root.querySelectorAll("[data-jump]").forEach((button) => {
    button.onclick = () => leaveFor(bundle.item.id, button.dataset.jump);
  });
  root.querySelector("[data-dup]")?.addEventListener("click", () => duplicateClass(bundle.item));
  root.querySelector("[data-del]")?.addEventListener("click", async () => {
    const removed = await removeClass(bundle.item);
    if (removed) openHub("publish-class");
  });
  root.querySelector("#td-save-note")?.addEventListener("click", () => saveNote(root, bundle));
}

function leaveFor(classId, jump) {
  rememberClass(classId);
  rememberReturn(classId);
  if (jump === "homework") {
    setHomeworkClass(classId);
    openHub("assign-homework");
    return;
  }
  if (jump === "report") {
    setOpenReport(classId);
    openHub("assign-homework");
    return;
  }
  openHub(jump);
}

async function saveNote(root, bundle) {
  const status = root.querySelector("#td-note-status");
  const checklist = {};
  root.querySelectorAll("[data-check]").forEach((input) => {
    checklist[input.dataset.check] = input.checked;
  });
  const note = {
    notes: root.querySelector("#td-private-note").value.trim().slice(0, 2000),
    homeworkRequired: root.querySelector("#td-hw-required").checked,
    checklist,
  };
  status.hidden = false;
  status.textContent = "保存しています…";
  try {
    if (teachLabActive()) labSaveNote(bundle.item.id, note);
    else {
      const uid = getAuth().currentUser.uid;
      await setDoc(doc(getFirestore(), "teacherPrivate", uid, "notes", bundle.item.id), {
        ...note,
        updatedAt: serverTimestamp(),
      });
    }
    bundle.note = note;
    status.textContent = "保存しました。生徒と保護者には送っていません。";
  } catch (error) {
    status.textContent = error.message;
  }
}
