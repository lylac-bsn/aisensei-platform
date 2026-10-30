import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, doc, documentId, getDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { renderCollab } from "./platform-collab.js";

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

function noteMillis(value) {
  return value?.toMillis?.() || (typeof value === "number" ? value : 0);
}

function noteWhen(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function seenNoteKeys(uid) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`gc-seen-notes-${uid}`) || "[]"));
  } catch {
    return new Set();
  }
}

function rememberNoteKeys(uid, keys) {
  const next = [...new Set([...seenNoteKeys(uid), ...keys])].slice(-200);
  localStorage.setItem(`gc-seen-notes-${uid}`, JSON.stringify(next));
}

let stopNotifications = () => {};

export function watchNotifications(uid, role) {
  stopNotifications();
  const bell = document.getElementById("hub-bell");
  const panel = document.getElementById("hub-bell-panel");
  const badge = document.getElementById("hub-bell-count");
  if (!bell || !panel || !badge) return;
  const family = role === "parent" || role === "student" || role === "user" || !role;
  bell.hidden = !family;
  panel.hidden = true;
  badge.hidden = true;
  if (!family || !uid) return;

  const db = getFirestore();
  const lists = new Map();
  const unsubs = [];
  let cancelled = false;
  const listen = (name, ref, map) => {
    unsubs.push(onSnapshot(ref, (snap) => {
      lists.set(name, snap.docs.map(map));
      paint();
    }, () => {
      lists.set(name, []);
      paint();
    }));
  };
  const inboxRow = (item) => {
    const data = item.data();
    const kind = data.type || "note";
    return {
      key: `in-${item.id}`,
      inboxId: item.id,
      kind,
      title: data.title || "通知",
      body: data.body || "",
      time: noteMillis(data.createdAt),
      unread: data.read !== true,
      assignmentId: data.assignmentId || "",
      reportId: data.reportId || "",
      action: kind === "homework" ? "my-homework" : kind === "booking" ? "book" : "inbox",
    };
  };
  listen("inbox", collection(db, "inbox", uid, "items"), inboxRow);
  const homeworkRow = (item) => {
    const data = item.data();
    return {
      key: `hw-${item.id}`,
      kind: "homework",
      title: "あたらしい しゅくだい",
      body: data.title || "宿題",
      time: noteMillis(data.createdAt),
      unread: false,
      assignmentId: item.id,
      reportId: "",
      action: role === "parent" ? "inbox" : "my-homework",
    };
  };
  if (role !== "parent") {
    listen("homework", collection(db, "studentHomework", uid, "items"), homeworkRow);
    listen("reports", query(collection(db, "classReports"), where("attendeeIds", "array-contains", uid)), (item) => {
      const data = item.data();
      return {
        key: `rp-${item.id}`,
        kind: "report",
        title: "クラスレポート",
        body: data.summary || "",
        time: noteMillis(data.createdAt),
        unread: false,
        assignmentId: "",
        reportId: item.id,
        action: "my-homework",
      };
    });
  } else {
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (cancelled) return;
      const kids = snap.data()?.linkedStudentIds || snap.data()?.linkedChildren?.map((kid) => kid.id) || [];
      kids.filter(Boolean).forEach((studentId) => {
        listen(`homework-${studentId}`, collection(db, "studentHomework", studentId, "items"), homeworkRow);
      });
    }).catch(() => {});
  }

  const merged = () => {
    const inbox = lists.get("inbox") || [];
    const homeworkIds = new Set(inbox.map((row) => row.assignmentId).filter(Boolean));
    const reportIds = new Set(inbox.map((row) => row.reportId).filter(Boolean));
    const rest = [];
    lists.forEach((rows, name) => {
      if (name === "inbox") return;
      rows.forEach((row) => {
        if (row.assignmentId && homeworkIds.has(row.assignmentId)) return;
        if (row.reportId && reportIds.has(row.reportId)) return;
        rest.push(row);
      });
    });
    return [...inbox, ...rest].sort((a, b) => b.time - a.time).slice(0, 20);
  };

  const paint = () => {
    const rows = merged();
    const seen = seenNoteKeys(uid);
    const unseen = rows.filter((row) => !seen.has(row.key) && (row.unread || !row.inboxId)).length;
    badge.hidden = unseen < 1;
    badge.textContent = unseen > 9 ? "9+" : String(unseen);
    const kindLabel = { report: "レポート", homework: "宿題", booking: "予約", note: "通知" };
    panel.innerHTML = rows.length ? rows.map((row) => `
      <button type="button" class="gc-bell-item${seen.has(row.key) ? "" : " is-new"}" data-note-action="${row.action}">
        <small>${kindLabel[row.kind] || "通知"}${row.time ? ` · ${escapeHtml(noteWhen(row.time))}` : ""}</small>
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(String(row.body || "").replace(/\s+/g, " ").slice(0, 80))}</span>
      </button>`).join("") : `<p class="gc-bell-empty">通知はありません。</p>`;
  };

  const closePanel = (event) => {
    if (panel.hidden || event.target.closest(".gc-bell-wrap")) return;
    panel.hidden = true;
    bell.setAttribute("aria-expanded", "false");
  };
  bell.onclick = (event) => {
    event.stopPropagation();
    const opening = panel.hidden;
    panel.hidden = !opening;
    bell.setAttribute("aria-expanded", String(opening));
    if (!opening) return;
    const rows = merged();
    rememberNoteKeys(uid, rows.map((row) => row.key));
    rows.filter((row) => row.inboxId && row.unread).forEach((row) => {
      callFunction("markInboxRead", { itemId: row.inboxId }).catch(() => {});
    });
    paint();
  };
  panel.onclick = (event) => {
    const button = event.target.closest("[data-note-action]");
    if (!button) return;
    panel.hidden = true;
    bell.setAttribute("aria-expanded", "false");
    const matches = [...document.querySelectorAll(`[data-hub-action="${button.dataset.noteAction}"]`)];
    (matches.find((item) => item.offsetParent) || matches[0])?.click();
  };
  document.addEventListener("click", closePanel);
  stopNotifications = () => {
    cancelled = true;
    unsubs.forEach((stop) => stop());
    document.removeEventListener("click", closePanel);
    bell.hidden = true;
    panel.hidden = true;
    badge.hidden = true;
  };
}

export function stopNotificationWatch() {
  stopNotifications();
}

async function bookedStudents(classId, teacherUid) {
  if (!classId) return [];
  const db = getFirestore();
  const snap = await getDocs(query(collection(db, "bookings"), where("teacherId", "==", teacherUid)));
  const rows = [];
  for (const item of snap.docs) {
    const data = item.data();
    if (data.classId !== classId || data.status !== "booked" || !data.studentId) continue;
    let name = data.studentName;
    if (!name) {
      const user = await getDoc(doc(db, "users", data.studentId));
      name = user.data()?.displayName || "生徒";
    }
    rows.push({ id: data.studentId, name });
  }
  return rows;
}

function pairsFrom(text) {
  const rows = text.split("\n").map((row) => row.trim()).filter(Boolean);
  const phrases = [];
  for (let i = 0; i + 1 < rows.length; i += 2) phrases.push({ en: rows[i], ja: rows[i + 1] });
  return phrases;
}

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

function clock(date) {
  const parts = jstParts(date);
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${hour}:${parts.minute}`;
}

function sessionWhen(item) {
  if (!item.startsAt) return "日時未設定";
  const parts = jstParts(item.startsAt);
  const weekday = { Sun: "日", Mon: "月", Tue: "火", Wed: "水", Thu: "木", Fri: "金", Sat: "土" }[parts.weekday] || "";
  const date = `${Number(parts.month)}月${Number(parts.day)}日（${weekday}）`;
  const start = jstParts(item.startsAt);
  const end = item.endsAt ? jstParts(item.endsAt) : null;
  const startHour = start.hour === "24" ? "00" : start.hour;
  const endHour = end ? (end.hour === "24" ? "00" : end.hour) : "";
  const allDay = end && startHour === "00" && start.minute === "00" && endHour === "23" && end.minute === "59";
  return allDay ? `${date} · 終日` : `${date} · ${clock(item.startsAt)}${item.endsAt ? `–${clock(item.endsAt)}` : ""}`;
}

function sessionSearch(item) {
  return `${item.title} ${sessionWhen(item)}`.toLowerCase();
}

async function renderAttendance(root, db, uid) {
  const classSnap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", uid)));
  const sessions = classSnap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      title: data.title || "クラス",
      startsAt: data.startsAt?.toDate?.() || null,
      endsAt: data.endsAt?.toDate?.() || null,
    };
  }).sort((a, b) => (b.startsAt?.getTime?.() || 0) - (a.startsAt?.getTime?.() || 0));
  const now = Date.now();
  const todayKey = jstParts(new Date());
  const todayId = `${todayKey.year}-${todayKey.month}-${todayKey.day}`;
  const today = sessions.filter((item) => item.startsAt && `${jstParts(item.startsAt).year}-${jstParts(item.startsAt).month}-${jstParts(item.startsAt).day}` === todayId);
  const initial = today.find((item) => !item.endsAt || item.endsAt.getTime() >= now) || today[0] || sessions[0] || null;
  let currentId = initial?.id || "";
  let savedKey = "";
  let loadToken = 0;
  let loading = false;
  root.innerHTML = `
    <div class="gc-attend-page">
      <section class="gc-panel gc-attend-pick">
        <p class="gc-kicker">クラス</p>
        <div class="gc-pick">
          <button type="button" id="class-pick" class="gc-pick-btn" aria-haspopup="listbox" aria-expanded="false">
            <span id="class-pick-label"><strong>クラスがありません</strong><small>担当クラスが表示されます</small></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div id="class-menu" class="gc-pick-menu" hidden>
            <input id="class-find" type="search" placeholder="クラス名・日時で検索" autocomplete="off">
            <div id="class-options" role="listbox"></div>
          </div>
        </div>
      </section>
      <section class="gc-panel gc-attend-summary">
        <div>
          <p class="gc-kicker">出席</p>
          <p id="attend-summary" class="gc-attend-count"><strong>0</strong><span>/ 0</span></p>
        </div>
        <p id="school-status" class="gc-save-note" role="status"></p>
      </section>
      <section class="gc-panel gc-attend-card">
        <div class="gc-attend-head">
          <h3>生徒</h3>
          <button type="button" class="gc-text-btn" id="mark-all">全員出席</button>
        </div>
        <div id="roster" class="gc-attend-list"></div>
        <div class="gc-attend-save">
          <button type="button" class="gc-primary" id="save-attendance">出席を保存</button>
        </div>
      </section>
    </div>`;
  const status = root.querySelector("#school-status");
  const summary = root.querySelector("#attend-summary");
  const roster = root.querySelector("#roster");
  const picker = root.querySelector("#class-pick");
  const menu = root.querySelector("#class-menu");
  const find = root.querySelector("#class-find");
  const options = root.querySelector("#class-options");
  const save = root.querySelector("#save-attendance");
  const markAll = root.querySelector("#mark-all");
  const signature = () => [...roster.querySelectorAll(".gc-attend.is-present")].map((item) => item.dataset.id).sort().join(",");
  const isDirty = () => !loading && signature() !== savedKey;
  const setStatus = (kind, text) => {
    status.className = `gc-save-note${kind ? ` is-${kind}` : ""}`;
    status.textContent = text || "";
  };
  const confirmDiscard = (message) => {
    if (!isDirty()) return true;
    if (!window.confirm(message)) return false;
    savedKey = signature();
    return true;
  };
  const onBeforeUnload = (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const closeMenu = () => {
    menu.hidden = true;
    picker.setAttribute("aria-expanded", "false");
  };
  const onDocumentClick = (event) => {
    if (!menu.hidden && !event.target.closest(".gc-pick")) closeMenu();
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("click", onDocumentClick);
  root._confirmLeave = () => confirmDiscard("保存していない出席の変更があります。このまま移動しますか？");
  root._stopAttendance = () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("click", onDocumentClick);
    root._confirmLeave = null;
  };
  const paintSummary = () => {
    const total = roster.querySelectorAll(".gc-attend").length;
    const present = roster.querySelectorAll(".gc-attend.is-present").length;
    summary.querySelector("strong").textContent = String(present);
    summary.querySelector("span").textContent = `/ ${total}`;
  };
  const refreshDirty = () => {
    if (isDirty()) setStatus("dirty", "未保存の変更があります。");
    else if (!status.classList.contains("is-ok")) setStatus("", "");
  };
  const setPresent = (row, present) => {
    row.classList.toggle("is-present", present);
    row.classList.toggle("is-absent", !present);
    refreshDirty();
    paintSummary();
  };
  const paintLabel = () => {
    const item = sessions.find((session) => session.id === currentId);
    const label = root.querySelector("#class-pick-label");
    if (!item) {
      label.innerHTML = "<strong>クラスがありません</strong><small>担当クラスが表示されます</small>";
      return;
    }
    label.innerHTML = `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sessionWhen(item))}</small>`;
  };
  const paintOptions = () => {
    const queryText = find.value.trim().toLowerCase();
    const visible = sessions.filter((item) => !queryText || sessionSearch(item).includes(queryText));
    options.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "gc-muted";
      empty.textContent = "該当するクラスはありません。";
      options.appendChild(empty);
      return;
    }
    visible.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-pick-option";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", item.id === currentId ? "true" : "false");
      if (item.id === currentId) button.classList.add("is-on");
      button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sessionWhen(item))}</small>`;
      button.onclick = () => {
        if (item.id === currentId) {
          closeMenu();
          return;
        }
        if (!confirmDiscard("保存していない出席の変更があります。クラスを切り替えますか？")) return;
        currentId = item.id;
        closeMenu();
        find.value = "";
        paintLabel();
        paintRoster().catch((error) => setStatus("error", error.message));
      };
      options.appendChild(button);
    });
  };
  const paintRoster = async () => {
    const token = ++loadToken;
    paintLabel();
    picker.disabled = !sessions.length;
    markAll.disabled = !currentId;
    save.disabled = !currentId;
    if (!currentId) {
      roster.textContent = "担当のクラスはまだありません。";
      paintSummary();
      savedKey = signature();
      return;
    }
    roster.textContent = "読み込んでいます…";
    loading = true;
    let rows = [];
    let recorded = null;
    try {
      rows = await bookedStudents(currentId, uid);
      const saved = await getDocs(query(collection(db, "attendance"), where(documentId(), "in", [currentId])));
      if (!saved.empty) recorded = new Set(saved.docs[0].data().presentIds || []);
    } catch (error) {
      if (token !== loadToken) return;
      loading = false;
      roster.textContent = "読み込めませんでした。";
      setStatus("error", error.message);
      return;
    }
    if (token !== loadToken) return;
    loading = false;
    rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    if (token !== loadToken) return;
    roster.replaceChildren();
    if (!rows.length) {
      roster.textContent = "このクラスの予約はまだありません。";
      markAll.disabled = true;
      save.disabled = true;
      paintSummary();
      savedKey = signature();
      setStatus("", "");
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "gc-attend";
      item.dataset.id = row.id;
      const present = recorded ? recorded.has(row.id) : true;
      item.classList.add(present ? "is-present" : "is-absent");
      item.innerHTML = `<span class="gc-avatar">${escapeHtml((row.name || "?").slice(0, 1))}</span><strong>${escapeHtml(row.name)}</strong><div class="gc-seg" role="group" aria-label="${escapeHtml(row.name)}の出席"><button type="button" data-state="present">出席</button><button type="button" data-state="absent">欠席</button></div>`;
      item.querySelectorAll("button").forEach((button) => {
        button.onclick = () => setPresent(item, button.dataset.state === "present");
      });
      roster.appendChild(item);
    });
    markAll.disabled = false;
    save.disabled = false;
    paintSummary();
    savedKey = signature();
    setStatus("", "");
  };
  picker.onclick = () => {
    if (!sessions.length) return;
    const open = menu.hidden;
    menu.hidden = !open;
    picker.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      paintOptions();
      find.focus();
    }
  };
  find.oninput = () => paintOptions();
  find.onkeydown = (event) => {
    if (event.key === "Escape") closeMenu();
  };
  markAll.onclick = () => {
    roster.querySelectorAll(".gc-attend").forEach((item) => {
      item.classList.add("is-present");
      item.classList.remove("is-absent");
    });
    refreshDirty();
    paintSummary();
  };
  save.onclick = async () => {
    if (!currentId || save.disabled) return;
    save.disabled = true;
    markAll.disabled = true;
    setStatus("", "保存しています…");
    try {
      const presentIds = [...roster.querySelectorAll(".gc-attend.is-present")].map((item) => item.dataset.id);
      await callFunction("setAttendance", { classId: currentId, presentIds });
      savedKey = signature();
      setStatus("ok", "出席を保存しました。");
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      save.disabled = !roster.querySelector(".gc-attend");
      markAll.disabled = save.disabled;
    }
  };
  await paintRoster();
}

async function renderReport(root, db, uid, reportOptions = {}) {
  const classSnap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", uid)));
  const sessions = classSnap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      title: data.title || "クラス",
      startsAt: data.startsAt?.toDate?.() || null,
      endsAt: data.endsAt?.toDate?.() || null,
    };
  }).sort((a, b) => (b.startsAt?.getTime?.() || 0) - (a.startsAt?.getTime?.() || 0));
  const now = Date.now();
  const todayKey = jstParts(new Date());
  const todayId = `${todayKey.year}-${todayKey.month}-${todayKey.day}`;
  const today = sessions.filter((item) => item.startsAt && `${jstParts(item.startsAt).year}-${jstParts(item.startsAt).month}-${jstParts(item.startsAt).day}` === todayId);
  const initial = today.find((item) => !item.endsAt || item.endsAt.getTime() >= now) || today[0] || sessions[0] || null;
  let currentId = initial?.id || "";
  let savedKey = "";
  let lastReportKey = "";
  let lastHomeworkKey = "";
  let presentCount = 0;
  let loadToken = 0;
  let sending = false;
  root.innerHTML = `
    <div class="gc-report">
      <div class="gc-pick">
        <p class="gc-kicker">クラス</p>
        <button type="button" id="class-pick" class="gc-pick-btn" aria-haspopup="listbox" aria-expanded="false">
          <span id="class-pick-label"><strong>クラスがありません</strong><small>担当クラスが表示されます</small></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div id="class-menu" class="gc-pick-menu" hidden>
          <input id="class-find" type="search" placeholder="クラス名・日時で検索" autocomplete="off">
          <div id="class-options" role="listbox"></div>
        </div>
      </div>
      <div class="gc-report-bar">
        <p id="attend-summary">出席を確認しています。</p>
        <button type="button" class="gc-text-btn" data-hub-action="attendance" data-hub-label="出席">出席を編集</button>
      </div>
      <label class="gc-report-label">今日のレッスン内容
        <textarea id="summary" maxlength="600" placeholder="今日の授業で練習したことや、生徒の様子を書いてください。"></textarea>
      </label>
      <div class="gc-report-words">
        <div class="gc-phrase-head"><span>英語</span><span>日本語</span><span></span></div>
        <div id="phrase-rows"></div>
        <button type="button" class="gc-text-btn" id="add-phrase">＋ 単語を追加</button>
        <p class="gc-report-note">この単語はレポートに載ります。練習問題は「宿題」タブで、単語リストから自動で作れます。</p>
        <button type="button" class="gc-secondary" id="send-homework">宿題タブでつくる</button>
      </div>
      <div id="recipients" class="gc-report-to"></div>
      <div class="gc-report-actions">
        <p id="school-status" class="gc-save-note" role="status"></p>
        <button type="button" class="gc-primary" id="send-report">レポートを送る</button>
      </div>
    </div>`;
  const status = root.querySelector("#school-status");
  const lesson = root.querySelector("#summary");
  const phraseRows = root.querySelector("#phrase-rows");
  const recipients = root.querySelector("#recipients");
  const attendSummary = root.querySelector("#attend-summary");
  const picker = root.querySelector("#class-pick");
  const menu = root.querySelector("#class-menu");
  const find = root.querySelector("#class-find");
  const options = root.querySelector("#class-options");
  const reportButton = root.querySelector("#send-report");
  const homeworkButton = root.querySelector("#send-homework");
  const setStatus = (kind, text) => {
    status.className = `gc-save-note${kind ? ` is-${kind}` : ""}`;
    status.textContent = text || "";
  };
  const phraseValues = () => [...phraseRows.querySelectorAll(".gc-phrase")].map((row) => ({
    en: row.querySelector("[data-en]").value.trim(),
    ja: row.querySelector("[data-ja]").value.trim(),
  }));
  const formKey = () => `${lesson.value}\n${phraseValues().map((row) => `${row.en}\t${row.ja}`).join("\n")}`;
  const isDirty = () => !sending && formKey() !== savedKey;
  const confirmDiscard = (message) => {
    if (!isDirty()) return true;
    if (!window.confirm(message)) return false;
    savedKey = formKey();
    return true;
  };
  const onBeforeUnload = (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const closeMenu = () => {
    menu.hidden = true;
    picker.setAttribute("aria-expanded", "false");
  };
  const onDocumentClick = (event) => {
    if (!menu.hidden && !event.target.closest(".gc-pick")) closeMenu();
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("click", onDocumentClick);
  root._confirmLeave = () => confirmDiscard("保存していない内容があります。このまま移動しますか？");
  root._stopAttendance = () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("click", onDocumentClick);
    root._confirmLeave = null;
  };
  const touch = () => {
    if (sending) return;
    if (isDirty()) setStatus("dirty", "未保存の内容があります。");
    else if (!status.classList.contains("is-ok")) setStatus("", "");
  };
  const addPhrase = (en = "", ja = "") => {
    const row = document.createElement("div");
    row.className = "gc-phrase";
    row.innerHTML = `<input type="text" data-en maxlength="80" placeholder="apple" value="${escapeHtml(en)}"><input type="text" data-ja maxlength="80" placeholder="りんご" value="${escapeHtml(ja)}"><button type="button" class="gc-phrase-x" aria-label="この単語を消す">×</button>`;
    row.querySelector("button").onclick = () => {
      row.remove();
      touch();
    };
    row.querySelectorAll("input").forEach((input) => { input.oninput = touch; });
    phraseRows.appendChild(row);
  };
  const readyPhrases = () => {
    const rows = phraseValues();
    const complete = rows.filter((row) => row.en && row.ja);
    const incomplete = rows.some((row) => (row.en || row.ja) && !(row.en && row.ja));
    if (incomplete) return { error: "英語と日本語の両方を入力してください。" };
    if (complete.length < 3 || complete.length > 10) return { error: "英語と日本語を3〜10組入れてください。" };
    return { complete };
  };
  const paintLabel = () => {
    const item = sessions.find((session) => session.id === currentId);
    const label = root.querySelector("#class-pick-label");
    if (!item) {
      label.innerHTML = "<strong>クラスがありません</strong><small>担当クラスが表示されます</small>";
      return;
    }
    label.innerHTML = `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sessionWhen(item))}</small>`;
  };
  const paintOptions = () => {
    const queryText = find.value.trim().toLowerCase();
    const visible = sessions.filter((item) => !queryText || sessionSearch(item).includes(queryText));
    options.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "gc-muted";
      empty.textContent = "該当するクラスはありません。";
      options.appendChild(empty);
      return;
    }
    visible.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-pick-option";
      if (item.id === currentId) button.classList.add("is-on");
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", item.id === currentId ? "true" : "false");
      button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sessionWhen(item))}</small>`;
      button.onclick = () => {
        if (item.id === currentId) {
          closeMenu();
          return;
        }
        if (!confirmDiscard("保存していない内容があります。クラスを切り替えますか？")) return;
        currentId = item.id;
        closeMenu();
        find.value = "";
        paintSession().catch((error) => setStatus("error", error.message));
      };
      options.appendChild(button);
    });
  };
  const paintSession = async () => {
    const token = ++loadToken;
    paintLabel();
    picker.disabled = !sessions.length;
    if (!currentId) {
      attendSummary.textContent = "担当のクラスはまだありません。";
      recipients.textContent = "";
      presentCount = 0;
      return;
    }
    attendSummary.textContent = "出席を確認しています。";
    let booked = [];
    let saved;
    try {
      booked = await bookedStudents(currentId, uid);
      saved = await getDocs(query(collection(db, "attendance"), where(documentId(), "in", [currentId])));
    } catch (error) {
      if (token !== loadToken) return;
      presentCount = 0;
      attendSummary.textContent = "出席を確認できませんでした。";
      setStatus("error", error.message);
      return;
    }
    if (token !== loadToken) return;
    const presentIds = saved.empty ? null : (saved.docs[0].data().presentIds || []);
    presentCount = presentIds ? presentIds.length : 0;
    attendSummary.textContent = presentIds
      ? `予約 ${booked.length}人 · 出席 ${presentIds.length}人`
      : `予約 ${booked.length}人 · 出席未記録`;
    recipients.replaceChildren();
    const title = document.createElement("p");
    title.className = "gc-kicker";
    title.textContent = "レポートの送付先";
    recipients.appendChild(title);
    if (!presentIds) {
      const note = document.createElement("p");
      note.textContent = "出席を記録すると、出席した生徒にだけ送れます。";
      recipients.appendChild(note);
      return;
    }
    if (!presentIds.length) {
      const note = document.createElement("p");
      note.textContent = "出席した生徒がいないため、送れません。";
      recipients.appendChild(note);
      return;
    }
    const names = new Map(booked.map((row) => [row.id, row.name]));
    const list = document.createElement("ul");
    for (const studentId of presentIds) {
      let via = "生徒本人";
      try {
        const user = await getDoc(doc(db, "users", studentId));
        if (!names.has(studentId)) names.set(studentId, user.data()?.displayName || "生徒");
        const parentIds = user.data()?.linkedParentIds || [];
        if (parentIds.length) {
          const parentNames = [];
          for (const parentId of parentIds.slice(0, 4)) {
            const parent = await getDoc(doc(db, "users", parentId));
            parentNames.push(parent.data()?.displayName || "保護者");
          }
          via = `保護者 ${parentNames.join("、")}`;
        }
      } catch {
        if (!names.has(studentId)) names.set(studentId, "生徒");
        via = "保護者または生徒";
      }
      if (token !== loadToken) return;
      const item = document.createElement("li");
      item.textContent = `${names.get(studentId)} · ${via}`;
      list.appendChild(item);
    }
    recipients.appendChild(list);
    if (booked.some((row) => !presentIds.includes(row.id))) {
      const note = document.createElement("p");
      note.className = "gc-report-note";
      note.textContent = "欠席の生徒には送られません。";
      recipients.appendChild(note);
    }
  };
  [["apple", "りんご"], ["book", "ほん"], ["cat", "ねこ"]].forEach(([en, ja]) => addPhrase(en, ja));
  lesson.oninput = touch;
  savedKey = formKey();
  picker.onclick = () => {
    if (!sessions.length) return;
    const open = menu.hidden;
    menu.hidden = !open;
    picker.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      paintOptions();
      find.focus();
    }
  };
  find.oninput = () => paintOptions();
  find.onkeydown = (event) => {
    if (event.key === "Escape") closeMenu();
  };
  root.querySelector("#add-phrase").onclick = () => {
    addPhrase();
    touch();
  };
  const submit = async (kind) => {
    if (sending || !currentId) return;
    const lessonText = lesson.value.trim();
    const phrases = readyPhrases();
    if (kind === "report" && !lessonText) {
      setStatus("error", "今日のレッスン内容を書いてください。");
      lesson.focus();
      return;
    }
    if (phrases.error) {
      setStatus("error", phrases.error);
      return;
    }
    if (!presentCount) {
      setStatus("error", "先に出席を記録してください。");
      return;
    }
    const key = `${lessonText}\n${phrases.complete.map((row) => `${row.en}\t${row.ja}`).join("\n")}`;
    const again = kind === "report" ? key === lastReportKey : key === lastHomeworkKey;
    if (again && !window.confirm(kind === "report" ? "同じ内容のレポートを、もう一度送りますか？" : "同じ単語の宿題を、もう一度出しますか？")) return;
    sending = true;
    reportButton.disabled = true;
    homeworkButton.disabled = true;
    setStatus("", kind === "report" ? "送信しています…" : "宿題を出しています…");
    try {
      if (kind === "report") {
        await callFunction("publishReport", { classId: currentId, summary: lessonText, phrases: phrases.complete });
        lastReportKey = key;
        setStatus("ok", "レポートを送りました。");
      } else {
        await callFunction("publishHomework", { classId: currentId, title: "きょうのしゅくだい", phrases: phrases.complete });
        lastHomeworkKey = key;
        setStatus("ok", "宿題を出しました。");
      }
      savedKey = formKey();
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      sending = false;
      reportButton.disabled = false;
      homeworkButton.disabled = false;
    }
  };
  reportButton.onclick = () => submit("report");
  homeworkButton.onclick = () => {
    if (reportOptions.onCreateHomework) reportOptions.onCreateHomework();
    else submit("homework");
  };
  await paintSession();
}

async function renderInbox(root, db, uid) {
  const snap = await getDocs(collection(db, "inbox", uid, "items"));
  const rows = snap.docs.map((item) => ({ id: item.id, ...item.data(), time: noteMillis(item.data().createdAt) }))
    .sort((a, b) => b.time - a.time);
  root.innerHTML = `
    <div class="gc-learn">
      <section class="gc-panel">
        <h2>受信箱</h2>
        <div class="gc-note-list">${rows.map((row) => `
          <article class="gc-note-card${row.read ? "" : " is-new"}">
            <small>${escapeHtml(noteWhen(row.time))}</small>
            <h3>${escapeHtml(row.title || "通知")}</h3>
            <p>${escapeHtml(row.body || "")}</p>
          </article>`).join("") || `<p class="gc-muted">まだ届いていません。</p>`}</div>
      </section>
    </div>`;
  rows.filter((row) => !row.read).forEach((row) => {
    callFunction("markInboxRead", { itemId: row.id }).catch(() => {});
  });
}

async function renderStudentLearning(root, db, uid) {
  root.innerHTML = `<p class="gc-muted">読み込んでいます…</p>`;
  const [homeworkSnap, reportSnap] = await Promise.all([
    getDocs(collection(db, "studentHomework", uid, "items")),
    getDocs(query(collection(db, "classReports"), where("attendeeIds", "array-contains", uid))).catch(() => null),
  ]);
  const homework = homeworkSnap.docs.map((item) => ({ id: item.id, ...item.data(), time: noteMillis(item.data().createdAt) }))
    .sort((a, b) => b.time - a.time);
  const reports = (reportSnap?.docs || []).map((item) => ({ id: item.id, ...item.data(), time: noteMillis(item.data().createdAt) }))
    .sort((a, b) => b.time - a.time);
  root.innerHTML = `
    <div class="gc-learn">
      <section class="gc-panel">
        <h2>先生の宿題</h2>
        <div id="hw-list" class="gc-note-list">${homework.map((item) => `
          <button type="button" class="gc-note-card" data-hw="${escapeHtml(item.id)}" data-format="${escapeHtml(item.format || "")}">
            <small>${escapeHtml(noteWhen(item.time))}${item.dueOn ? ` · 期日 ${escapeHtml(item.dueOn)}` : ""}</small>
            <strong>${escapeHtml(item.title || "宿題")}</strong>
          </button>`).join("") || `<p class="gc-muted">まだ届いていません。</p>`}</div>
        <div id="hw-play"></div>
      </section>
      <section class="gc-panel">
        <h2>クラスレポート</h2>
        <div class="gc-note-list">${reports.map((item) => `
          <article class="gc-note-card">
            <small>${escapeHtml(noteWhen(item.time))}</small>
            <p>${escapeHtml(item.summary || "")}</p>
            <ul>${(item.phrases || []).map((phrase) => `<li>${escapeHtml(phrase.en || "")} / ${escapeHtml(phrase.ja || "")}</li>`).join("")}</ul>
          </article>`).join("") || `<p class="gc-muted">まだ届いていません。</p>`}</div>
      </section>
    </div>`;
  root.querySelectorAll("[data-hw]").forEach((button) => {
    button.onclick = () => {
      if (button.dataset.format === "pack-v1") {
        playPackHomework(root.querySelector("#hw-play"), button.dataset.hw, uid).catch((error) => {
          root.querySelector("#hw-play").textContent = error.message;
        });
        return;
      }
      playHomework(root.querySelector("#hw-play"), button.dataset.hw);
    };
  });
}

export async function renderSchoolPanel(root, action) {
  root._stopQuiz?.();
  root._stopQuiz = null;
  root._stopAttendance?.();
  root._stopAttendance = null;
  root._confirmLeave = null;
  root.hidden = false;
  const db = getFirestore();
  const uid = getAuth().currentUser.uid;
  if (action === "family") {
    const result = await callFunction("ensureLinkCode", {});
    root.innerHTML = `<h2>かぞくコード</h2><article class="book-card"><p class="hub-preparing">${result.code}</p><p>保護者にこのコードを伝えてください。</p></article>`;
    return;
  }
  if (action === "children") {
    root.innerHTML = `<h2>子どもとつなぐ</h2><div class="hub-form"><label>コード <input id="link-code" placeholder="6文字" maxlength="8"></label><button type="button" class="hub-action" id="link-go">つなぐ</button><p id="link-status"></p><div id="child-list" class="hub-stack"></div></div>`;
    const me = await getDoc(doc(db, "users", uid));
    const kids = me.data()?.linkedChildren || [];
    root.querySelector("#child-list").innerHTML = kids.map((kid) => `<article class="book-card"><h3>${escapeHtml(kid.name)}</h3></article>`).join("") || "<p>まだいません。</p>";
    root.querySelector("#link-go").onclick = async () => {
      try {
        await callFunction("linkChild", { code: root.querySelector("#link-code").value });
        root.querySelector("#link-status").textContent = "つながりました。";
      } catch (error) {
        root.querySelector("#link-status").textContent = error.message;
      }
    };
    return;
  }
  if (action === "inbox") {
    await renderInbox(root, db, uid);
    return;
  }
  if (action === "attendance") {
    await renderAttendance(root, db, uid);
    return;
  }
  if (action === "assign-homework") {
    const { mountTeacherHomework } = await import("./homework-studio.js?v=20261026-retry");
    const openHomework = () => mountTeacherHomework(root, {
      db,
      uid,
      callFunction,
      openReport: () => renderReport(root, db, uid, { onCreateHomework: openHomework }),
    });
    await openHomework();
    return;
  }
  if (action === "my-homework") {
    await renderStudentLearning(root, db, uid);
    return;
  }
  const me = await getDoc(doc(db, "users", uid));
  const role = me.data()?.role || "";
  const host = role === "admin" || role === "owner";
  await renderCollab(root, { host, uid, role });
}

const QUIZ_COLORS = ["qo-red", "qo-blue", "qo-yellow", "qo-green"];
const QUIZ_SHAPES = ["▲", "◆", "●", "■"];
const QUIZ_TIMES = [5, 10, 20, 30, 60, 90, 120];

function renderQuiz(root, { host, uid }) {
  const db = getFirestore();
  const questions = [{ prompt: "cat は？", choices: ["ねこ", "いぬ", "さかな", ""], answer: 0, seconds: 20 }];
  let title = "クラスクイズ";
  let current = 0;
  let note = "";
  let noteKind = "";
  let savedKey = "";
  let mode = host ? "edit" : "join";
  let roomId = "";
  let amHost = false;
  let roomData = {};
  let players = [];
  let revealed = false;
  let lockedChoice = "";
  let lockedResult = "";
  let stopRoom = null;
  let stopPlayers = null;
  let templates = [];
  let templateId = "";
  let clock = 0;
  let clockTimer = 0;
  let clockGen = 0;
  let syncing = false;
  let syncAgain = false;

  const stopClock = () => {
    clockGen += 1;
    cancelAnimationFrame(clock);
    clearTimeout(clockTimer);
    clock = 0;
    clockTimer = 0;
  };

  const stop = () => {
    stopRoom?.();
    stopPlayers?.();
    stopRoom = null;
    stopPlayers = null;
    stopClock();
    root._closeQuizMenu?.();
    window.removeEventListener("beforeunload", onBeforeUnload);
    root._confirmLeave = null;
  };
  root._stopQuiz = stop;
  const formKey = () => JSON.stringify({
    title,
    questions: questions.map((question) => ({
      prompt: question.prompt,
      choices: question.choices,
      answer: question.answer,
      seconds: question.seconds,
    })),
  });
  const dirty = () => formKey() !== savedKey;
  const confirmDiscard = (message) => {
    readCurrent();
    if (!dirty()) return true;
    if (!window.confirm(message)) return false;
    savedKey = formKey();
    return true;
  };
  const onBeforeUnload = (event) => {
    readCurrent();
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  if (host) {
    window.addEventListener("beforeunload", onBeforeUnload);
    root._confirmLeave = () => confirmDiscard("保存していないクイズの変更があります。このまま移動しますか？");
  }

  const blankQuestion = () => ({ prompt: "", choices: ["", "", "", ""], answer: 0, seconds: 20 });

  const fromStored = (row) => {
    const choices = [...(row.choices || []), "", "", "", ""].slice(0, 4);
    const answerText = String(row.answer || "").trim().toLowerCase();
    const answer = choices.findIndex((choice) => choice.trim().toLowerCase() === answerText);
    return {
      prompt: row.prompt || "",
      choices,
      answer: answer >= 0 ? answer : 0,
      seconds: QUIZ_TIMES.includes(Number(row.timeLimitSec)) ? Number(row.timeLimitSec) : 20,
    };
  };

  const pack = (question) => {
    const choices = question.choices.map((choice) => choice.trim()).filter(Boolean).slice(0, 4);
    const answer = (question.choices[question.answer] || "").trim();
    const seconds = QUIZ_TIMES.includes(Number(question.seconds)) ? Number(question.seconds) : 20;
    return {
      prompt: question.prompt.trim(),
      choices,
      answer,
      seconds,
      ok: Boolean(question.prompt.trim() && choices.length >= 2 && choices.includes(answer)),
    };
  };

  const readyQuestions = () => questions.map(pack);
  const templateMeta = (item) => {
    const count = `${(item.questions || []).length}問`;
    const ms = item.updatedAt?.toMillis?.() || 0;
    if (!ms) return count;
    const when = new Date(ms).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${count} · ${when}`;
  };

  const readCurrent = () => {
    const prompt = root.querySelector("#quiz-prompt");
    if (!prompt || !questions[current]) return;
    questions[current].prompt = prompt.value;
    [...root.querySelectorAll("[data-choice]")].forEach((input, index) => {
      questions[current].choices[index] = input.value;
    });
    questions[current].seconds = Number(root.querySelector("#quiz-seconds")?.value || questions[current].seconds || 20);
    title = root.querySelector("#quiz-title")?.value || title;
  };

  const paintEdit = () => {
    const packed = questions.map(pack);
    const seconds = QUIZ_TIMES.includes(Number(questions[current].seconds)) ? Number(questions[current].seconds) : 20;
    const statusText = note || (dirty() ? "未保存の変更があります。" : "");
    const statusKind = note ? noteKind : (dirty() ? "dirty" : "");
    const currentTemplate = templates.find((item) => item.id === templateId);
    const savedRows = templates.map((item) => `
      <div class="qo-saved-row${item.id === templateId ? " is-on" : ""}">
        <button type="button" class="qo-saved-open" data-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.title || "クイズ")}</strong>
          <small>${escapeHtml(templateMeta(item))}</small>
        </button>
        <button type="button" class="qo-saved-delete" data-id="${escapeHtml(item.id)}" aria-label="このクイズを削除">削除</button>
      </div>`).join("");
    root.innerHTML = `
      <div class="qo-bar">
        <input id="quiz-title" type="text" maxlength="80" value="${escapeHtml(title)}" aria-label="クイズのタイトル" placeholder="クイズのタイトル">
        <div class="qo-saved">
          <button type="button" class="qo-saved-btn" id="quiz-template" aria-haspopup="listbox" aria-expanded="false">${escapeHtml(currentTemplate?.title || "保存したクイズ")}</button>
          <div id="quiz-template-menu" class="qo-saved-menu" hidden>
            ${savedRows || `<p class="qo-saved-empty">保存したクイズはありません。</p>`}
          </div>
        </div>
        <button type="button" class="gc-secondary" id="quiz-save">保存</button>
        <div class="qo-launch">
          <button type="button" class="gc-secondary" id="quiz-join-mode">コードで参加</button>
          <button type="button" class="gc-primary" id="quiz-host">クイズを開始</button>
        </div>
      </div>
      <div class="qo-build">
        <div class="qo-rail" id="quiz-rail"></div>
        <section class="qo-stage">
          <div class="qo-stage-head">
            <strong>問題 ${current + 1}</strong>
            <div class="qo-tools">
              <button type="button" class="qo-tool" id="quiz-up" title="上へ" aria-label="問題を上へ" ${current === 0 ? "disabled" : ""}>↑</button>
              <button type="button" class="qo-tool" id="quiz-down" title="下へ" aria-label="問題を下へ" ${current === questions.length - 1 ? "disabled" : ""}>↓</button>
              <button type="button" class="qo-tool" id="quiz-copy-question" title="複製" aria-label="問題を複製">複製</button>
              <button type="button" class="qo-tool qo-tool-danger" id="quiz-delete" title="削除" aria-label="問題を削除">削除</button>
            </div>
          </div>
          <label class="qo-prompt-label"><textarea id="quiz-prompt" maxlength="120" placeholder="問題文">${escapeHtml(questions[current].prompt)}</textarea></label>
          <div class="qo-meta">
            <p>チェックを付けると、その答えが正解になります。空欄は出題されません。</p>
            <label class="qo-time">制限時間
              <select id="quiz-seconds">${QUIZ_TIMES.map((value) => `<option value="${value}"${value === seconds ? " selected" : ""}>${value}秒</option>`).join("")}</select>
            </label>
          </div>
          <div class="qo-grid" id="quiz-choices"></div>
          <p id="quiz-status" class="gc-save-note${statusKind ? ` is-${statusKind}` : ""}">${escapeHtml(statusText)}</p>
        </section>
      </div>`;
    const rail = root.querySelector("#quiz-rail");
    questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `qo-q${index === current ? " is-on" : ""}${packed[index].ok ? "" : " is-bad"}`;
      button.innerHTML = `<b>${index + 1}</b><small>${escapeHtml(question.prompt.trim() || "新しい問題")}</small>`;
      button.onclick = () => {
        readCurrent();
        current = index;
        note = "";
        paintEdit();
      };
      rail.appendChild(button);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "qo-add";
    add.textContent = "＋ 問題を追加";
    add.onclick = () => {
      if (questions.length >= 20) {
        note = "問題は20問までです。";
        noteKind = "error";
        paintEdit();
        return;
      }
      readCurrent();
      questions.push(blankQuestion());
      current = questions.length - 1;
      note = "";
      paintEdit();
      root.querySelector("#quiz-prompt")?.focus();
    };
    rail.appendChild(add);
    const grid = root.querySelector("#quiz-choices");
    questions[current].choices.forEach((choice, index) => {
      const tile = document.createElement("div");
      tile.className = `qo-tile ${QUIZ_COLORS[index]}${questions[current].answer === index ? " is-correct" : ""}`;
      const correct = questions[current].answer === index;
      tile.innerHTML = `<button type="button" class="qo-mark" aria-label="この答えを正解にする" title="正解にする" aria-pressed="${correct}">${correct ? "✓" : ""}</button><span class="qo-shape" aria-hidden="true">${QUIZ_SHAPES[index]}</span><input data-choice maxlength="80" placeholder="答えを入力" value="${escapeHtml(choice)}">`;
      tile.querySelector(".qo-mark").onclick = () => {
        readCurrent();
        questions[current].answer = index;
        paintEdit();
      };
      tile.querySelector("[data-choice]").oninput = (event) => {
        questions[current].choices[index] = event.target.value;
        showDirty();
      };
      grid.appendChild(tile);
    });
    const showDirty = () => {
      if (note) return;
      const status = root.querySelector("#quiz-status");
      if (!status) return;
      const unsaved = dirty();
      status.className = `gc-save-note${unsaved ? " is-dirty" : ""}`;
      status.textContent = unsaved ? "未保存の変更があります。" : "";
    };
    root.querySelector("#quiz-prompt").oninput = (event) => {
      questions[current].prompt = event.target.value;
      const label = root.querySelector(".qo-q.is-on small");
      if (label) label.textContent = event.target.value.trim() || "新しい問題";
      showDirty();
    };
    root.querySelector("#quiz-title").oninput = (event) => {
      title = event.target.value;
      showDirty();
    };
    const move = (dir) => {
      readCurrent();
      const next = current + dir;
      if (next < 0 || next >= questions.length) return;
      const [row] = questions.splice(current, 1);
      questions.splice(next, 0, row);
      current = next;
      paintEdit();
    };
    root.querySelector("#quiz-up").onclick = () => move(-1);
    root.querySelector("#quiz-down").onclick = () => move(1);
    root.querySelector("#quiz-copy-question").onclick = () => {
      readCurrent();
      if (questions.length >= 20) {
        note = "問題は20問までです。";
        noteKind = "error";
        paintEdit();
        return;
      }
      questions.splice(current + 1, 0, JSON.parse(JSON.stringify(questions[current])));
      current += 1;
      paintEdit();
    };
    root.querySelector("#quiz-delete").onclick = () => {
      readCurrent();
      if (questions.length === 1) {
        note = "問題は1つ以上必要です。";
        noteKind = "error";
        paintEdit();
        return;
      }
      const row = questions[current];
      const filled = row.prompt.trim() || row.choices.some((choice) => choice.trim());
      if (filled && !window.confirm("この問題を削除しますか？")) return;
      questions.splice(current, 1);
      current = Math.min(current, questions.length - 1);
      note = "";
      paintEdit();
    };
    root.querySelector("#quiz-join-mode").onclick = () => {
      if (!confirmDiscard("保存していない変更があります。参加画面に移動しますか？")) return;
      mode = "join";
      note = "";
      noteKind = "";
      paintJoin();
    };
    root.querySelector("#quiz-seconds").onchange = (event) => {
      questions[current].seconds = Number(event.target.value);
      showDirty();
    };
    const savedMenu = root.querySelector("#quiz-template-menu");
    const savedButton = root.querySelector("#quiz-template");
    savedButton.onclick = (event) => {
      event.stopPropagation();
      savedMenu.hidden = !savedMenu.hidden;
      savedButton.setAttribute("aria-expanded", String(!savedMenu.hidden));
    };
    root._closeQuizMenu?.();
    const closeQuizMenu = (event) => {
      if (!savedMenu || savedMenu.hidden || event.target.closest(".qo-saved")) return;
      savedMenu.hidden = true;
      savedButton.setAttribute("aria-expanded", "false");
    };
    document.addEventListener("click", closeQuizMenu);
    root._closeQuizMenu = () => document.removeEventListener("click", closeQuizMenu);
    savedMenu.onclick = (event) => {
      const remove = event.target.closest(".qo-saved-delete");
      if (remove) {
        event.stopPropagation();
        const id = remove.dataset.id;
        const found = templates.find((item) => item.id === id);
        if (!found || remove.disabled) return;
        if (!window.confirm(`「${found.title || "このクイズ"}」を削除します。\n${templateMeta(found)}`)) return;
        remove.disabled = true;
        callFunction("deleteQuizTemplate", { id }).then(() => {
          if (templateId === id) {
            templateId = "";
            savedKey = "";
          }
          note = "削除しました。";
          noteKind = "ok";
          return refreshTemplates();
        }).catch((error) => {
          note = error.message;
          noteKind = "error";
          paintEdit();
        });
        return;
      }
      const open = event.target.closest(".qo-saved-open");
      if (!open) return;
      readCurrent();
      const found = templates.find((item) => item.id === open.dataset.id);
      if (!found || found.id === templateId) {
        savedMenu.hidden = true;
        savedButton.setAttribute("aria-expanded", "false");
        return;
      }
      if (dirty() && !window.confirm("保存していない変更があります。このクイズに切り替えますか？")) return;
      templateId = found.id;
      title = found.title || "クイズ";
      const rows = (found.questions || []).map(fromStored);
      questions.splice(0, questions.length, ...(rows.length ? rows : [blankQuestion()]));
      current = 0;
      note = "読み込みました。";
      noteKind = "ok";
      savedKey = formKey();
      paintEdit();
    };
    root.querySelector("#quiz-save").onclick = async () => {
      readCurrent();
      const ready = readyQuestions();
      const bad = ready.findIndex((row) => !row.ok);
      if (bad >= 0) {
        current = bad;
        note = "問題文、2つ以上の答え、正解のチェックが必要です。";
        noteKind = "error";
        paintEdit();
        return;
      }
      const button = root.querySelector("#quiz-save");
      button.disabled = true;
      button.textContent = "保存しています…";
      try {
        const result = await callFunction("saveQuizTemplate", {
          id: templateId || undefined,
          title: title.trim() || "クイズ",
          questions: ready.map(({ prompt, choices, answer, seconds: timeLimitSec }) => ({ prompt, choices, answer, timeLimitSec })),
        });
        templateId = result.id;
        note = "保存しました。";
        noteKind = "ok";
        savedKey = formKey();
        await refreshTemplates();
      } catch (error) {
        note = error.message;
        noteKind = "error";
        paintEdit();
      }
    };
    root.querySelector("#quiz-host").onclick = async () => {
      readCurrent();
      const ready = readyQuestions();
      const bad = ready.findIndex((row) => !row.ok);
      if (bad >= 0) {
        current = bad;
        note = "問題文、2つ以上の答え、正解のチェックが必要です。";
        noteKind = "error";
        paintEdit();
        return;
      }
      if (dirty() && !window.confirm("保存していない変更があります。保存せずに開始しますか？")) return;
      const button = root.querySelector("#quiz-host");
      button.disabled = true;
      button.textContent = "開始しています…";
      try {
        const result = await callFunction("createQuiz", {
          title: title.trim() || "クラスクイズ",
          questions: ready.map(({ prompt, choices, answer, seconds: timeLimitSec }) => ({ prompt, choices, answer, timeLimitSec })),
        });
        roomId = result.id;
        amHost = true;
        revealed = false;
        mode = "live";
        savedKey = formKey();
        watchRoom();
      } catch (error) {
        note = error.message;
        noteKind = "error";
        paintEdit();
      }
    };
  };

  const paintJoin = () => {
    root.innerHTML = `
      <section class="qo-join">
        <h2>クイズに参加</h2>
        <p class="gc-muted">先生の画面に出ているコードを入力してください。</p>
        <input id="quiz-code" class="qo-pin-input" maxlength="8" placeholder="コード" autocomplete="off">
        <button type="button" class="gc-primary" id="quiz-join">参加</button>
        <p id="quiz-status" class="gc-warn">${escapeHtml(note)}</p>
        ${host ? `<button type="button" class="gc-text-btn" id="quiz-back-edit">問題を作る</button>` : ""}
      </section>`;
    root.querySelector("#quiz-join").onclick = async () => {
      try {
        const result = await callFunction("joinQuiz", { code: root.querySelector("#quiz-code").value });
        roomId = result.id;
        amHost = false;
        mode = "live";
        note = "";
        watchRoom();
      } catch (error) {
        note = error.message;
        paintJoin();
      }
    };
    root.querySelector("#quiz-code").addEventListener("keydown", (event) => {
      if (event.key === "Enter") root.querySelector("#quiz-join").click();
    });
    root.querySelector("#quiz-back-edit")?.addEventListener("click", () => {
      mode = "edit";
      note = "";
      paintEdit();
    });
    root.querySelector("#quiz-code").focus();
  };

  const normChoice = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

  const resultsMarkup = (question, index, questionsLive) => {
    const counts = Array.isArray(roomData.choiceCounts) ? roomData.choiceCounts : [];
    const total = counts.reduce((sum, count) => sum + (Number(count) || 0), 0);
    const mine = players.find((player) => player.id === uid);
    const picked = amHost ? "" : (lockedChoice || (Number(mine?.answeredIndex) === index ? mine?.choice || "" : ""));
    const gotIt = picked && normChoice(picked) === normChoice(question.answer);
    const banner = amHost
      ? ""
      : `<p class="qo-banner ${!picked ? "is-bad" : gotIt ? "is-ok" : "is-bad"}">${!picked ? "時間切れ" : gotIt ? "せいかい！" : "ざんねん"}</p>`;
    const tiles = (question.choices || []).map((choice, choiceIndex) => {
      const count = Number(counts[choiceIndex] || 0);
      const share = total ? Math.round((count / total) * 100) : 0;
      const correct = normChoice(choice) === normChoice(question.answer);
      const yours = picked && normChoice(choice) === normChoice(picked);
      return `<div class="qo-answer qo-result ${QUIZ_COLORS[choiceIndex] || ""}${correct ? " is-correct" : " is-dim"}" style="--share:${share}%"><span>${correct ? "✓" : (QUIZ_SHAPES[choiceIndex] || "")}</span><span class="qo-result-label">${escapeHtml(choice)}${yours ? `<small class="qo-you">あなた</small>` : ""}</span><strong class="qo-count">${count}</strong><span class="qo-meter"></span></div>`;
    }).join("");
    const nextLabel = index + 1 >= questionsLive.length ? "結果を見る" : "つぎの問題";
    return `
      <section class="qo-live qo-results">
        ${banner}
        <p class="gc-muted">問題 ${index + 1} / ${questionsLive.length} ・ ${total}人が回答</p>
        <h2 class="qo-question">${escapeHtml(question.prompt)}</h2>
        <div class="qo-grid">${tiles}</div>
        ${amHost
          ? `<div class="qo-tools"><button type="button" class="gc-primary" id="quiz-next">${nextLabel}</button></div><p id="quiz-status" class="gc-warn"></p>`
          : `<p class="gc-muted">先生が次へ進みます。</p>`}
      </section>`;
  };

  const rankingMarkup = () => {
    const ranked = (Array.isArray(roomData.ranking) && roomData.ranking.length
      ? roomData.ranking
      : [...players]
        .filter((player) => player.id !== roomData.hostId)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0)))
      .map((player, index) => ({ ...player, place: index + 1 }));
    const stand = (player) => player ? `
      <div class="qo-stand is-${player.place}${player.id === uid ? " is-me" : ""}">
        <b>${player.place}</b>
        <strong>${escapeHtml(player.name || "プレイヤー")}</strong>
        <em>${Number(player.score || 0)}</em>
      </div>` : "";
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    return `
      <section class="qo-lobby qo-finish">
        <h2>けっか</h2>
        ${ranked.length ? `<div class="qo-podium-top">${top.map(stand).join("")}</div>` : `<p class="gc-muted">参加者はいません</p>`}
        <ol class="qo-podium">${ranked.map((player) => `<li class="${player.id === uid ? "is-me" : ""}"><span>${player.place}</span><strong>${escapeHtml(player.name || "プレイヤー")}</strong><em>${Number(player.score || 0)}</em></li>`).join("")}</ol>
        ${amHost ? `<button type="button" class="gc-secondary" id="quiz-new">新しいクイズ</button>` : ""}
      </section>`;
  };

  const paintLive = () => {
    const questionsLive = roomData.questions || [];
    const index = roomData.questionIndex ?? -1;
    const question = questionsLive[index];
    const status = roomData.status || "lobby";
    if (!roomData.code && status !== "done") {
      root.innerHTML = `<p class="gc-muted">読み込んでいます。</p>`;
      armClock();
      return;
    }
    if (!amHost && (status === "lobby" || index < 0)) {
      root.innerHTML = `
        <section class="qo-lobby">
          <h2>参加しました</h2>
          <p>${escapeHtml(roomData.title || "クイズ")}</p>
          <p class="gc-muted">先生がスタートするまで、この画面のまま待ってください。</p>
        </section>`;
      armClock();
      return;
    }
    if (amHost && (status === "lobby" || index < 0)) {
      root.innerHTML = `
        <section class="qo-lobby">
          <p class="gc-muted">参加コード</p>
          <p class="qo-pin" id="quiz-room-code">${escapeHtml(roomData.code || "")}</p>
          <button type="button" class="gc-secondary" id="quiz-copy">コードをコピー</button>
          <p>生徒は「クイズ」を開いて、このコードを入力します。</p>
          <div class="qo-players">${players.map((player) => `<span class="qo-chip">${escapeHtml(player.name || "プレイヤー")}</span>`).join("") || `<span class="gc-muted">まだ誰もいません</span>`}</div>
          <p class="gc-muted">${players.length} 人参加中</p>
          <button type="button" class="gc-primary qo-start" id="quiz-next">スタート</button>
          <p id="quiz-status" class="gc-warn"></p>
        </section>`;
    } else if (status === "reveal" && question) {
      root.innerHTML = resultsMarkup(question, index, questionsLive);
    } else if (status === "done" || !question) {
      root.innerHTML = rankingMarkup();
    } else if (amHost) {
      const answered = players.filter((player) => Number(player.answeredIndex) === index).length;
      root.innerHTML = `
        <section class="qo-live">
          <div class="qo-timer" role="meter" aria-label="残り時間" aria-valuemin="0" aria-valuemax="100"><span id="quiz-clock"></span></div>
          <p class="gc-muted">問題 ${index + 1} / ${questionsLive.length} ・ ${answered} / ${players.length} 人が回答</p>
          <h2 class="qo-question">${escapeHtml(question.prompt)}</h2>
          <div class="qo-grid">${(question.choices || []).map((choice, choiceIndex) => {
            const norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
            const correct = revealed && norm(choice) === norm(question.answer);
            const dim = revealed && !correct;
            return `<div class="qo-answer ${QUIZ_COLORS[choiceIndex] || ""}${correct ? " is-correct" : ""}${dim ? " is-dim" : ""}"><span>${QUIZ_SHAPES[choiceIndex] || ""}</span><span>${escapeHtml(choice)}</span></div>`;
          }).join("")}</div>
          <div class="qo-tools">
            ${revealed ? `<button type="button" class="gc-primary" id="quiz-next">${index + 1 >= questionsLive.length ? "結果を見る" : "つぎの問題"}</button>` : `<button type="button" class="gc-primary" id="quiz-reveal">答えを見せる</button>`}
          </div>
          <p id="quiz-status" class="gc-warn"></p>
        </section>`;
    } else {
      const answered = lockedChoice || Number(root._playerAnswered) === index;
      root.innerHTML = `
        <section class="qo-live">
          <div class="qo-timer" role="meter" aria-label="残り時間" aria-valuemin="0" aria-valuemax="100"><span id="quiz-clock"></span></div>
          <p class="gc-muted">問題 ${index + 1} / ${questionsLive.length}</p>
          <h2 class="qo-question">${escapeHtml(question.prompt)}</h2>
          <div class="qo-grid" id="quiz-board"></div>
          <p id="quiz-status" class="${lockedResult === "せいかい" ? "gc-note" : "gc-warn"}">${escapeHtml(lockedResult)}</p>
        </section>`;
      const board = root.querySelector("#quiz-board");
      (question.choices || []).forEach((choice, choiceIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `qo-answer ${QUIZ_COLORS[choiceIndex] || ""}${lockedChoice === choice ? " is-correct" : ""}`;
        button.disabled = Boolean(answered);
        button.innerHTML = `<span>${QUIZ_SHAPES[choiceIndex] || ""}</span><span>${escapeHtml(choice)}</span>`;
        button.onclick = async () => {
          if (lockedChoice || Number(root._playerAnswered) === index) return;
          lockedChoice = choice;
          board.querySelectorAll("button").forEach((item) => { item.disabled = true; });
          try {
            const result = await callFunction("submitQuizAnswer", { roomId, choice, questionIndex: index });
            lockedResult = result.closed ? "" : result.expired ? "時間切れです" : result.duplicate ? "すでに答えています" : result.correct ? "せいかい" : "ざんねん";
            if (!result.expired && !result.closed) syncRoom();
          } catch (error) {
            lockedResult = error.message;
          }
          paintLive();
        };
        board.appendChild(button);
      });
    }
    root.querySelector("#quiz-copy")?.addEventListener("click", async () => {
      const code = roomData.code || "";
      if (code) await navigator.clipboard.writeText(code);
      const status = root.querySelector("#quiz-status");
      if (status) status.textContent = "コピーしました。";
    });
    root.querySelector("#quiz-reveal")?.addEventListener("click", async () => {
      const button = root.querySelector("#quiz-reveal");
      if (button) button.disabled = true;
      try {
        await callFunction("advanceQuiz", { roomId, questionIndex: roomData.questionIndex });
      } catch (error) {
        const status = root.querySelector("#quiz-status");
        if (status) status.textContent = error.message;
        if (button) button.disabled = false;
      }
    });
    root.querySelector("#quiz-next")?.addEventListener("click", async () => {
      const button = root.querySelector("#quiz-next");
      if (button) button.disabled = true;
      try {
        await callFunction("advanceQuiz", { roomId, questionIndex: roomData.questionIndex });
      } catch (error) {
        const status = root.querySelector("#quiz-status");
        if (status) status.textContent = error.message;
        if (button) button.disabled = false;
      }
    });
    root.querySelector("#quiz-new")?.addEventListener("click", () => {
      stop();
      roomId = "";
      amHost = false;
      roomData = {};
      players = [];
      mode = "edit";
      note = "";
      paintEdit();
    });
    armClock();
  };

  const syncRoom = async () => {
    if (!roomId || roomData.status !== "question") return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    const questionIndex = roomData.questionIndex;
    syncing = true;
    try {
      await callFunction("syncQuizRoom", { roomId, questionIndex });
    } catch (error) {
      const status = root.querySelector("#quiz-status");
      if (status && !status.textContent) status.textContent = error.message;
    } finally {
      syncing = false;
      if (syncAgain) {
        syncAgain = false;
        syncRoom();
      }
    }
  };

  const armClock = () => {
    stopClock();
    if (mode !== "live" || roomData.status !== "question" || !roomData.questionEndsAt) return;
    const gen = clockGen;
    const ends = Number(roomData.questionEndsAt);
    const limit = Number(roomData.questions?.[roomData.questionIndex]?.timeLimitSec) || 20;
    const full = Math.max(1, limit * 1000);
    let synced = false;
    const frame = () => {
      if (gen !== clockGen) return;
      const bar = root.querySelector("#quiz-clock");
      const meter = bar?.parentElement;
      const left = ends - Date.now();
      const ratio = Math.max(0, Math.min(1, left / full));
      if (bar) bar.style.transform = `scaleX(${ratio})`;
      if (meter) meter.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      if (left <= 0) {
        if (!synced) {
          synced = true;
          syncRoom();
        }
        clockTimer = setTimeout(frame, 1000);
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
    stop();
    root.innerHTML = `<p class="gc-muted">読み込んでいます。</p>`;
    stopRoom = onSnapshot(doc(db, "quizRooms", roomId), (snap) => {
      const data = snap.data() || {};
      if (data.questionIndex !== roomData.questionIndex) {
        revealed = false;
        lockedChoice = "";
        lockedResult = "";
      }
      roomData = data;
      if (mode === "live") paintLive();
    }, (error) => {
      note = error.message;
      if (mode === "live") root.innerHTML = `<p class="gc-warn">${escapeHtml(error.message)}</p>`;
    });
    if (amHost) {
      stopPlayers = onSnapshot(collection(db, "quizRooms", roomId, "players"), (snap) => {
        players = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (mode === "live") paintLive();
        maybeAdvance();
      }, () => {});
    } else {
      stopPlayers = onSnapshot(doc(db, "quizRooms", roomId, "players", uid), (snap) => {
        const mine = snap.data();
        players = mine ? [{ id: uid, ...mine }] : [];
        root._playerAnswered = mine?.answeredIndex;
        if (mode === "live" && !lockedChoice) paintLive();
      });
    }
    root._stopQuiz = stop;
  };

  const refreshTemplates = async () => {
    const snap = await getDocs(query(collection(db, "quizTemplates"), where("ownerId", "==", uid)));
    templates = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    templates.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    if (mode !== "edit") return;
    readCurrent();
    paintEdit();
  };

  savedKey = formKey();
  if (mode === "edit") {
    paintEdit();
    refreshTemplates().catch((error) => {
      note = error.message;
      noteKind = "error";
      if (mode === "edit") paintEdit();
    });
  } else {
    paintJoin();
  }
}

async function playPackHomework(root, assignmentId, uid) {
  const { mountHomeworkPlayer } = await import("./homework-play.js?v=20261026-retry");
  const db = getFirestore();
  root.innerHTML = `<p class="gc-muted">読み込んでいます…</p>`;
  const snap = await getDoc(doc(db, "homeworkAssignments", assignmentId));
  const questions = snap.data()?.questions || [];
  await mountHomeworkPlayer(root, {
    title: snap.data()?.title || "しゅくだい",
    questions,
    db,
    loadProgress: async () => (await getDoc(doc(db, "homeworkProgress", `${assignmentId}_${uid}`))).data(),
    grade: (id, payload) => callFunction("submitHomework", {
      assignmentId,
      activityId: id,
      kind: payload.kind,
      answer: payload.answer,
      leftId: payload.leftId,
      rightId: payload.rightId,
      elapsedMs: payload.elapsedMs,
    }),
    finish: () => callFunction("finishHomework", { assignmentId }),
    onClose: () => {
      root.replaceChildren();
    },
  });
}

async function playHomework(root, assignmentId) {
  const db = getFirestore();
  const snap = await getDoc(doc(db, "homeworkAssignments", assignmentId));
  const activities = snap.data()?.activities || [];
  const progress = await getDoc(doc(db, "homeworkProgress", `${assignmentId}_${getAuth().currentUser.uid}`));
  const done = new Set(progress.data()?.doneIds || []);
  const activity = activities.find((row) => !done.has(row.id));
  root.innerHTML = "";
  if (!activity) {
    root.textContent = "おわったよ";
    return;
  }
  root.insertAdjacentHTML("beforeend", `<h3>${activity.promptJa || ""}</h3>`);
  if (activity.speak && window.speechSynthesis) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hub-quiet";
    button.textContent = "きく";
    button.onclick = () => {
      const utterance = new SpeechSynthesisUtterance(activity.speak);
      utterance.lang = "en-US";
      speechSynthesis.speak(utterance);
    };
    root.appendChild(button);
  }
  const choices = activity.choices || (activity.pairs || []).map((pair) => `${pair.en} = ${pair.ja}`);
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hub-choice";
    button.textContent = typeof choice === "string" ? choice : choice;
    button.onclick = async () => {
      const answer = activity.pairs ? activity.pairs : (activity.tokens ? activity.tokens : choice);
      const result = await callFunction("submitHomework", { assignmentId, activityId: activity.id, answer });
      root.insertAdjacentHTML("beforeend", `<p>${result.correct ? "せいかい" : "もういちど"}</p>`);
      if (result.correct) playHomework(root, assignmentId);
    };
    root.appendChild(button);
  });
}
