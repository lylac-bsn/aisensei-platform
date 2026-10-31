import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, doc, documentId, getDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { renderCollab } from "./platform-collab.js";
import { checkIcon, shapeIcon } from "./collab-icons.js";
import { confirmAction } from "./ui-confirm.js?v=20261031-hw-voicefix";

async function callFunction(name, data) {
  const user = getAuth().currentUser;
  const token = await user.getIdToken();
  let response;
  try {
    response = await fetch(`https://asia-northeast1-ai-sensei-8849b.cloudfunctions.net/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  } catch (error) {
    console.error(`[callFunction] ${name} network error`, error);
    throw new Error("通信に失敗しました。接続を確認してもう一度お試しください。");
  }
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
  panel.classList.remove("is-open");
  badge.hidden = true;
  if (!family || !uid) return;

  const BELL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
  const NOTE_ICONS = {
    homework: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h6.2A2.3 2.3 0 0 1 13.5 6.8V20a1.6 1.6 0 0 0-1.6-1.6H5z"/><path d="M19 4.5h-6.2A2.3 2.3 0 0 0 10.5 6.8V20a1.6 1.6 0 0 1 1.6-1.6H19z"/></svg>',
    report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.5 9l5.5 1.5L13.5 12 12 17.5 10.5 12 5 10.5 10.5 9 12 3.5z"/><path d="M18.5 15.2 19 17l1.8.5L19 18l-.5 1.8L18 18l-1.8-.5L18 17l.5-1.8z"/></svg>',
    booking: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3.5v3M16 3.5v3M4 9.5h16"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.3 4.7 5.2.8-3.8 3.6.9 5.2L12 15.8 7.4 17.9l.9-5.2L4.5 9.1l5.2-.8z"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 20.5 19h-17z"/><path d="M12 10v4M12 16.5h.01"/></svg>',
  };

  const kindMeta = (kind) => {
    if (kind === "homework") return { label: "宿題", tone: "peach", icon: "homework" };
    if (kind === "report") return { label: "レポート", tone: "lavender", icon: "report" };
    if (kind === "booking") return { label: "お知らせ", tone: "mint", icon: "booking" };
    if (kind === "alert" || kind === "important") return { label: "重要", tone: "pink", icon: "alert" };
    return { label: "お知らせ", tone: "yellow", icon: "note" };
  };

  const previewText = (body) => {
    const text = String(body || "").replace(/\s+/g, " ").trim();
    if (!text) return "内容をかくにんしよう";
    return text.slice(0, 56);
  };

  const goHubAction = (action) => {
    if (!action) return;
    const matches = [...document.querySelectorAll(`[data-hub-action="${action}"]`)];
    (matches.find((item) => item.offsetParent) || matches[0])?.click();
  };

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
      action: kind === "homework" || kind === "report" ? "my-homework" : kind === "booking" ? "book" : "inbox",
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
    return [...inbox, ...rest].sort((a, b) => b.time - a.time).slice(0, 12);
  };

  const isUnread = (row, seen) => {
    if (row.inboxId) return row.unread === true;
    return !seen.has(row.key);
  };

  const closePanel = () => {
    panel.hidden = true;
    panel.classList.remove("is-open");
    bell.setAttribute("aria-expanded", "false");
  };

  const openPanel = () => {
    panel.hidden = false;
    bell.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      if (!panel.hidden) panel.classList.add("is-open");
    });
  };

  const markRowsRead = (rows) => {
    if (!rows.length) return;
    rememberNoteKeys(uid, rows.map((row) => row.key));
    rows.forEach((row) => {
      if (row.inboxId) {
        row.unread = false;
        callFunction("markInboxRead", { itemId: row.inboxId }).catch(() => {});
      }
    });
  };

  const paint = () => {
    const rows = merged();
    const seen = seenNoteKeys(uid);
    const unreadRows = rows.filter((row) => isUnread(row, seen));
    const unseen = unreadRows.length;
    badge.hidden = unseen < 1;
    badge.textContent = unseen > 0 ? String(unseen) : "";
    badge.setAttribute("aria-label", unseen > 0 ? `未読のおしらせ ${unseen}件` : "通知");
    badge.title = unseen > 0 ? `未読 ${unseen}件` : "";

    const listHtml = rows.length
      ? rows.map((row) => {
        const meta = kindMeta(row.kind);
        const unread = isUnread(row, seen);
        const icon = NOTE_ICONS[meta.icon] || NOTE_ICONS.note;
        return `
          <button type="button"
            class="gc-bell-item tone-${meta.tone}${unread ? " is-new" : ""}"
            data-note-action="${escapeHtml(row.action)}"
            data-note-key="${escapeHtml(row.key)}"
            data-inbox-id="${escapeHtml(row.inboxId || "")}">
            <span class="gc-bell-item-ico" aria-hidden="true">${icon}</span>
            <span class="gc-bell-item-body">
              <span class="gc-bell-item-title">${escapeHtml(row.title)}</span>
              <span class="gc-bell-item-preview">${escapeHtml(previewText(row.body))}</span>
              <span class="gc-bell-item-tag">${meta.label}</span>
            </span>
            <span class="gc-bell-item-meta">
              <small>${escapeHtml(noteWhen(row.time))}</small>
              ${unread ? `<span class="gc-bell-dot" aria-label="未読"></span>` : ""}
            </span>
          </button>`;
      }).join("")
      : `<div class="gc-bell-empty">
          <span class="gc-bell-empty-ico" aria-hidden="true">${BELL_ICON}</span>
          <strong>まだ おしらせはないよ！</strong>
          <p>新しい しゅくだいや レポートが とどいたら ここに でるよ</p>
        </div>`;

    panel.innerHTML = `
      <div class="gc-bell-head">
        <div class="gc-bell-head-left">
          <span class="gc-bell-head-ico" aria-hidden="true">${BELL_ICON}</span>
          <strong>おしらせ</strong>
          ${unseen ? `<span class="gc-bell-head-count">${unseen > 9 ? "9+" : unseen}</span>` : ""}
        </div>
        ${unseen ? `<button type="button" class="gc-bell-mark-all" data-bell-mark-all>すべて既読</button>` : ""}
      </div>
      <div class="gc-bell-list">${listHtml}</div>
      <div class="gc-bell-foot">
        <button type="button" class="gc-bell-inbox-link" data-note-action="inbox">
          <span>すべてのおしらせを見る</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>`;
  };

  const onDocumentClick = (event) => {
    if (panel.hidden || event.target.closest(".gc-bell-wrap")) return;
    closePanel();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
      bell.focus();
    }
  };

  bell.onclick = (event) => {
    event.stopPropagation();
    if (panel.hidden) {
      paint();
      openPanel();
    } else {
      closePanel();
    }
  };

  panel.onclick = (event) => {
    event.stopPropagation();
    if (event.target.closest("[data-bell-mark-all]")) {
      markRowsRead(merged().filter((row) => isUnread(row, seenNoteKeys(uid))));
      paint();
      return;
    }
    const button = event.target.closest("[data-note-action]");
    if (!button) return;
    const key = button.dataset.noteKey || "";
    const inboxId = button.dataset.inboxId || "";
    const action = button.dataset.noteAction || "inbox";
    if (key || inboxId) {
      markRowsRead([{ key: key || `tmp-${inboxId}`, inboxId, unread: Boolean(inboxId) }]);
    }
    closePanel();
    paint();
    goHubAction(action);
  };

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeyDown);
  paint();

  stopNotifications = () => {
    cancelled = true;
    unsubs.forEach((stop) => stop());
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeyDown);
    bell.onclick = null;
    panel.onclick = null;
    bell.hidden = true;
    closePanel();
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
  const confirmDiscard = async (message) => {
    if (!isDirty()) return true;
    const ok = await confirmAction({
      title: "保存していない変更があります",
      message,
      confirmLabel: "移動する",
      cancelLabel: "とどまる",
      danger: true,
    });
    if (!ok) return false;
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
      button.onclick = async () => {
        if (item.id === currentId) {
          closeMenu();
          return;
        }
        if (!await confirmDiscard("保存していない出席の変更があります。クラスを切り替えますか？")) return;
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

export async function renderReport(root, db, uid, reportOptions = {}) {
  const lab = Boolean(reportOptions.lab);
  let sessions = [];
  if (lab) {
    sessions = [{
      id: "lab-class",
      title: "プレビューのクラス",
      startsAt: new Date(),
      endsAt: null,
    }];
  } else {
    const classSnap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", uid)));
    sessions = classSnap.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        title: data.title || "クラス",
        startsAt: data.startsAt?.toDate?.() || null,
        endsAt: data.endsAt?.toDate?.() || null,
      };
    }).sort((a, b) => (b.startsAt?.getTime?.() || 0) - (a.startsAt?.getTime?.() || 0));
  }
  const now = Date.now();
  const todayKey = jstParts(new Date());
  const todayId = `${todayKey.year}-${todayKey.month}-${todayKey.day}`;
  const today = sessions.filter((item) => item.startsAt && `${jstParts(item.startsAt).year}-${jstParts(item.startsAt).month}-${jstParts(item.startsAt).day}` === todayId);
  const initial = today.find((item) => !item.endsAt || item.endsAt.getTime() >= now) || today[0] || sessions[0] || null;
  let currentId = initial?.id || "";
  let savedKey = "";
  let lastReportKey = "";
  let presentCount = 0;
  let loadToken = 0;
  let sending = false;
  root.innerHTML = `
    <div class="hw-switch-shell">
      <div class="gc-report-layout">
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
            ${lab ? "" : `<button type="button" class="gc-text-btn" data-hub-action="attendance" data-hub-label="出席">出席を編集</button>`}
          </div>
          <label class="gc-report-label">今日のレッスン内容
            <textarea id="summary" maxlength="600" placeholder="今日の授業で練習したことや、生徒の様子を書いてください。"></textarea>
          </label>
          <div class="gc-report-words">
            <div class="gc-phrase-head"><span>英語</span><span>日本語</span><span></span></div>
            <div id="phrase-rows"></div>
            <button type="button" class="gc-text-btn" id="add-phrase">＋ 単語を追加</button>
            <p class="gc-report-note">この単語はレポートに載ります。</p>
          </div>
          <div id="recipients" class="gc-report-to"></div>
          <div class="gc-report-actions">
            <p id="school-status" class="gc-save-note" role="status"></p>
            <button type="button" class="gc-primary" id="send-report">${lab ? "プレビューを更新" : "レポートを送る"}</button>
          </div>
        </div>
        <aside class="gc-report-preview" aria-label="届くレポートの見え方">
          <p class="gc-kicker">生徒・保護者に届く見た目</p>
          <article class="gc-report-card" id="report-preview-card">
            <small id="report-preview-when">きょうのクラスレポート</small>
            <strong>クラスレポート</strong>
            <p id="report-preview-summary" class="gc-report-card-empty">レッスン内容を書くと、ここに表示されます。</p>
            <ul id="report-preview-words" hidden></ul>
          </article>
        </aside>
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
  const previewSummary = root.querySelector("#report-preview-summary");
  const previewWords = root.querySelector("#report-preview-words");
  const setStatus = (kind, text) => {
    status.className = `gc-save-note${kind ? ` is-${kind}` : ""}`;
    status.textContent = text || "";
  };
  const phraseValues = () => [...phraseRows.querySelectorAll(".gc-phrase")].map((row) => ({
    en: row.querySelector("[data-en]").value.trim(),
    ja: row.querySelector("[data-ja]").value.trim(),
  }));
  const paintPreview = () => {
    const summary = lesson.value.trim();
    const words = phraseValues().filter((row) => row.en || row.ja);
    if (summary) {
      previewSummary.className = "";
      previewSummary.textContent = summary;
    } else {
      previewSummary.className = "gc-report-card-empty";
      previewSummary.textContent = "レッスン内容を書くと、ここに表示されます。";
    }
    const complete = words.filter((row) => row.en && row.ja);
    if (!complete.length) {
      previewWords.hidden = true;
      previewWords.innerHTML = "";
      return;
    }
    previewWords.hidden = false;
    previewWords.innerHTML = complete
      .map((row) => `<li><span>${escapeHtml(row.en)}</span><span>${escapeHtml(row.ja)}</span></li>`)
      .join("");
  };
  const formKey = () => `${lesson.value}\n${phraseValues().map((row) => `${row.en}\t${row.ja}`).join("\n")}`;
  const isDirty = () => !sending && formKey() !== savedKey;
  const confirmDiscard = async (message) => {
    if (!isDirty()) return true;
    const ok = await confirmAction({
      title: "保存していない変更があります",
      message,
      confirmLabel: "移動する",
      cancelLabel: "とどまる",
      danger: true,
    });
    if (!ok) return false;
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
    paintPreview();
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
    paintPreview();
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
      button.onclick = async () => {
        if (item.id === currentId) {
          closeMenu();
          return;
        }
        if (!await confirmDiscard("保存していない内容があります。クラスを切り替えますか？")) return;
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
    if (lab) {
      presentCount = 1;
      attendSummary.textContent = "プレビュー · 出席 1人";
      recipients.innerHTML = `
        <p class="gc-kicker">レポートの送付先</p>
        <ul><li>プレビュー生徒 · 保護者 プレビュー保護者</li></ul>
        <p class="gc-report-note">プレビューでは実際には送信しません。</p>`;
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
  if (lab && !lesson.value) {
    lesson.value = "きょうは色と動物の単語を練習しました。みんな元気に参加していました。";
  }
  lesson.oninput = touch;
  paintPreview();
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
  const submit = async () => {
    if (sending || !currentId) return;
    const lessonText = lesson.value.trim();
    const phrases = readyPhrases();
    if (!lessonText) {
      setStatus("error", "今日のレッスン内容を書いてください。");
      lesson.focus();
      return;
    }
    if (phrases.error) {
      setStatus("error", phrases.error);
      return;
    }
    paintPreview();
    if (lab) {
      setStatus("ok", "右側が、生徒と保護者に届く見え方です。");
      savedKey = formKey();
      return;
    }
    if (!presentCount) {
      setStatus("error", "先に出席を記録してください。");
      return;
    }
    const key = `${lessonText}\n${phrases.complete.map((row) => `${row.en}\t${row.ja}`).join("\n")}`;
    if (key === lastReportKey && !await confirmAction({
      title: "もう一度送りますか？",
      message: "同じ内容のレポートをもう一度送ります。よろしいですか？",
      confirmLabel: "送る",
      cancelLabel: "やめる",
    })) return;
    sending = true;
    reportButton.disabled = true;
    setStatus("", "送信しています…");
    try {
      await callFunction("publishReport", { classId: currentId, summary: lessonText, phrases: phrases.complete });
      lastReportKey = key;
      setStatus("ok", "レポートを送りました。");
      savedKey = formKey();
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      sending = false;
      reportButton.disabled = false;
    }
  };
  reportButton.onclick = () => submit();
  await paintSession();
}


const LEARN_ICON = {
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.2c-1.6-1.1-3.5-1.7-5.6-1.7-1.1 0-2.1.2-3 .5v12.2c.9-.3 1.9-.5 3-.5 2.1 0 4 .6 5.6 1.7" fill="none"/><path d="M12 6.2c1.6-1.1 3.5-1.7 5.6-1.7 1.1 0 2.1.2 3 .5v12.2c-.9-.3-1.9-.5-3-.5-2.1 0-4 .6-5.6 1.7" fill="none"/><path d="M12 6.2v12.2" fill="none"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.2 2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.2l-5.1 2.7.97-5.68L3.75 9.2l5.7-.83L12 3.2z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2s-6.8-4.2-8.8-8.1C1.4 8.8 3.1 5.6 6.4 5.2c1.8-.2 3.4.7 4.4 2.1 1-1.4 2.6-2.3 4.4-2.1 3.3.4 5 3.6 3.2 7-2 3.9-8.8 8-8.8 8z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.2 3.4A8.8 8.8 0 1 0 20.6 14 7.2 7.2 0 0 1 15.2 3.4z"/></svg>',
  flower: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="5.4" r="2.5"/><circle cx="12" cy="18.6" r="2.5"/><circle cx="5.4" cy="12" r="2.5"/><circle cx="18.6" cy="12" r="2.5"/><circle cx="7.3" cy="7.3" r="2.2"/><circle cx="16.7" cy="7.3" r="2.2"/><circle cx="7.3" cy="16.7" r="2.2"/><circle cx="16.7" cy="16.7" r="2.2"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 18.5h9.1A4.2 4.2 0 0 0 21 13.6a4 4 0 0 0-3.5-3.9A5.1 5.1 0 0 0 8.2 8.4 3.8 3.8 0 0 0 4.4 14a3.7 3.7 0 0 0 3.8 4.5z"/></svg>',
  smile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><circle cx="9" cy="10.2" r="1.15"/><circle cx="15" cy="10.2" r="1.15"/><path d="M8.4 14.1c1.1 1.5 2.3 2.2 3.6 2.2s2.5-.7 3.6-2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  clover: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.2" r="3.1"/><circle cx="7.2" cy="12.2" r="3.1"/><circle cx="16.8" cy="12.2" r="3.1"/><circle cx="12" cy="16.8" r="3.1"/><path d="M12 15.5v5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  notebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10.5A1.5 1.5 0 0 1 19 5v14.5A1.5 1.5 0 0 1 17.5 21H7A1.5 1.5 0 0 1 5.5 19.5V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 13.8 9l6.2 1.8L13.8 12.6 12 18.8 10.2 12.6 4 10.8 10.2 9 12 2.8z"/><path d="m18.2 15.2.9 2.4 2.4.8-2.4.8-.9 2.4-.9-2.4-2.4-.8 2.4-.8z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3.5v3M16 3.5v3M4 9.5h16"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 20.5 19h-17z"/><path d="M12 10v4M12 16.5h.01"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19c1.2-3.2 3.4-4.8 6.5-4.8s5.3 1.6 6.5 4.8"/></svg>',
  mcq: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14M5 12h14M5 16.5h10"/><circle cx="7.2" cy="7.5" r="1"/><circle cx="7.2" cy="12" r="1"/><circle cx="7.2" cy="16.5" r="1"/></svg>',
  match: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="8" r="2.4"/><circle cx="17" cy="16" r="2.4"/><path d="M9 9.2 15 14.8"/></svg>',
  spell: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M7 15.5v-4M10.5 15.5v-2.5M14 15.5V9.5M17.5 15.5v-3"/></svg>',
  sentence: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="6.5" height="5" rx="1.4"/><rect x="13.5" y="5.5" width="6.5" height="5" rx="1.4"/><rect x="7.5" y="13.5" width="9" height="5" rx="1.4"/></svg>',
};

const WHEEL_CUTE_ICONS = ["star", "heart", "moon", "flower", "sparkle", "cloud", "smile", "clover"];

function wheelBubbleIcon(index, { completed = false, warn = false, report = false } = {}) {
  if (completed) return LEARN_ICON.star;
  if (warn) return LEARN_ICON.heart;
  if (report) return LEARN_ICON.sparkle;
  const name = WHEEL_CUTE_ICONS[Math.abs(Number(index) || 0) % WHEEL_CUTE_ICONS.length];
  return LEARN_ICON[name] || LEARN_ICON.star;
}
async function renderInbox(root, db, uid) {
  const snap = await getDocs(collection(db, "inbox", uid, "items"));
  const rows = snap.docs.map((item) => ({ id: item.id, ...item.data(), time: noteMillis(item.data().createdAt) }))
    .sort((a, b) => b.time - a.time);

  const typeMeta = (type) => {
    const key = String(type || "note");
    if (key === "homework") {
      return { key: "homework", label: "宿題", tone: "peach", cta: "宿題をひらく", action: "my-homework", icon: "book" };
    }
    if (key === "report") {
      return { key: "report", label: "レポート", tone: "lavender", cta: "レポートを見る", action: "my-homework", icon: "sparkle" };
    }
    if (key === "booking") {
      return { key: "booking", label: "お知らせ", tone: "mint", cta: "予約をみる", action: "book", icon: "calendar" };
    }
    return { key: "note", label: "お知らせ", tone: "mint", cta: "くわしく見る", action: "", icon: "star" };
  };

  const counts = {
    all: rows.length,
    unread: rows.filter((row) => row.read !== true).length,
    homework: rows.filter((row) => row.type === "homework").length,
    report: rows.filter((row) => row.type === "report").length,
    notice: rows.filter((row) => row.type !== "homework" && row.type !== "report").length,
  };

  root.innerHTML = `
    <div class="gc-inbox" id="gc-inbox">
      <header class="gc-inbox-hero">
        <div class="gc-inbox-hero-copy">
          <h2>受信箱</h2>
          <p>しゅくだいや レッスンの おしらせを チェックしよう！</p>
        </div>
        <img class="gc-inbox-mascot" src="images/fukurou.svg" alt="" width="64" height="70" decoding="async">
      </header>

      <div class="gc-inbox-filters" role="tablist" aria-label="フィルタ">
        <button type="button" class="gc-inbox-filter is-active" data-inbox-filter="all" aria-selected="true">すべて <em>${counts.all}</em></button>
        <button type="button" class="gc-inbox-filter" data-inbox-filter="homework" aria-selected="false">宿題 <em>${counts.homework}</em></button>
        <button type="button" class="gc-inbox-filter" data-inbox-filter="report" aria-selected="false">レポート <em>${counts.report}</em></button>
        <button type="button" class="gc-inbox-filter" data-inbox-filter="notice" aria-selected="false">お知らせ <em>${counts.notice}</em></button>
        <button type="button" class="gc-inbox-filter" data-inbox-filter="unread" aria-selected="false">未読 <em>${counts.unread}</em></button>
      </div>

      <div class="gc-inbox-stage" id="gc-inbox-stage">
        <div class="gc-inbox-list" id="gc-inbox-list" role="list"></div>
        <aside class="gc-inbox-detail" id="gc-inbox-detail" aria-live="polite"></aside>
      </div>
    </div>`;

  const stage = root.querySelector("#gc-inbox-stage");
  const listHost = root.querySelector("#gc-inbox-list");
  const detailHost = root.querySelector("#gc-inbox-detail");
  const filterButtons = [...root.querySelectorAll("[data-inbox-filter]")];
  let filter = "all";
  let selectedId = rows.find((row) => row.read !== true)?.id || rows[0]?.id || "";
  let detailOpen = false;

  const iconSvg = (name) => LEARN_ICON[name] || LEARN_ICON.star;
  const isMobileInbox = () => window.matchMedia("(max-width: 900px)").matches;

  const filteredRows = () => rows.filter((row) => {
    if (filter === "unread") return row.read !== true;
    if (filter === "homework") return row.type === "homework";
    if (filter === "report") return row.type === "report";
    if (filter === "notice") return row.type !== "homework" && row.type !== "report";
    return true;
  });

  const previewText = (row) => {
    const body = String(row.body || "").trim();
    if (!body) return "内容はありません";
    return body.replace(/\s+/g, " ").slice(0, 72);
  };

  const goAction = (action) => {
    if (!action) return;
    document.querySelector(`[data-hub-action="${action}"]`)?.click();
  };

  const syncDetailOpen = () => {
    stage?.classList.toggle("is-detail-open", Boolean(detailOpen && isMobileInbox()));
  };

  const refreshCounts = () => {
    counts.unread = rows.filter((row) => row.read !== true).length;
    const unreadFilter = root.querySelector('[data-inbox-filter="unread"] em');
    if (unreadFilter) unreadFilter.textContent = String(counts.unread);
  };

  const markRead = (row) => {
    if (!row || row.read === true) return false;
    row.read = true;
    callFunction("markInboxRead", { itemId: row.id }).catch(() => {});
    refreshCounts();
    return true;
  };

  const detailContentHtml = (row, meta) => {
    const body = String(row.body || "").trim();
    if (meta.key === "homework") {
      return body
        ? `<p class="gc-inbox-detail-related">${escapeHtml(body)}</p>`
        : `<p class="gc-inbox-detail-body is-muted">内容はありません</p>`;
    }
    if (!body) return `<p class="gc-inbox-detail-body is-muted">内容はありません</p>`;
    return `<div class="gc-inbox-detail-body">${escapeHtml(body)}</div>`;
  };

  const bindDetailActions = () => {
    detailHost.querySelector("[data-inbox-go]")?.addEventListener("click", (event) => {
      goAction(event.currentTarget.dataset.inboxGo);
    });
    detailHost.querySelector("[data-inbox-back]")?.addEventListener("click", () => {
      detailOpen = false;
      syncDetailOpen();
    });
  };

  const renderDetail = (row) => {
    if (!row) {
      detailHost.innerHTML = `
        <div class="gc-inbox-empty">
          <img src="images/fukurou.svg" alt="" width="64" height="70" decoding="async">
          <p>メッセージを 選んでね</p>
        </div>`;
      return;
    }
    const meta = typeMeta(row.type);
    const unread = row.read !== true;
    detailHost.innerHTML = `
      <article class="gc-inbox-detail-card tone-${meta.tone}${unread ? " is-unread" : ""}">
        <button type="button" class="gc-inbox-back" data-inbox-back>
          <span aria-hidden="true">←</span> もどる
        </button>
        <header class="gc-inbox-detail-head">
          <span class="gc-inbox-detail-ico" aria-hidden="true">${iconSvg(meta.icon)}</span>
          <div class="gc-inbox-detail-head-copy">
            <div class="gc-inbox-detail-top">
              <span class="gc-inbox-badge tone-${meta.tone}">${meta.label}</span>
              ${unread ? `<span class="gc-inbox-badge is-unread">未読</span>` : `<span class="gc-inbox-badge is-read">既読</span>`}
              <small>${escapeHtml(noteWhen(row.time))}</small>
            </div>
            <h3>${escapeHtml(row.title || "通知")}</h3>
          </div>
        </header>
        <div class="gc-inbox-detail-panel">
          ${detailContentHtml(row, meta)}
        </div>
        ${meta.action ? `
          <button type="button" class="gc-inbox-cta" data-inbox-go="${escapeHtml(meta.action)}">
            <span>${escapeHtml(meta.cta)}</span>
            <span aria-hidden="true">${LEARN_ICON.arrow}</span>
          </button>` : ""}
      </article>`;
    detailHost.classList.remove("is-fade");
    void detailHost.offsetWidth;
    detailHost.classList.add("is-fade");
    bindDetailActions();
  };

  const renderList = ({ keepScroll = false } = {}) => {
    const scrollTop = keepScroll ? listHost.scrollTop : 0;
    const visible = filteredRows();
    if (!visible.some((row) => row.id === selectedId)) {
      selectedId = visible[0]?.id || "";
    }
    if (!visible.length) {
      listHost.innerHTML = `<div class="gc-inbox-empty is-list"><p>この条件のメッセージは ないよ</p></div>`;
      renderDetail(null);
      detailOpen = false;
      syncDetailOpen();
      return;
    }
    listHost.innerHTML = visible.map((row) => {
      const meta = typeMeta(row.type);
      const unread = row.read !== true;
      const active = row.id === selectedId;
      return `
        <button type="button"
          class="gc-inbox-item tone-${meta.tone}${unread ? " is-unread" : ""}${active ? " is-active" : ""}"
          data-inbox-id="${escapeHtml(row.id)}"
          role="listitem"
          aria-current="${active ? "true" : "false"}">
          <span class="gc-inbox-item-accent" aria-hidden="true"></span>
          <span class="gc-inbox-item-ico" aria-hidden="true">${iconSvg(meta.icon)}</span>
          <span class="gc-inbox-item-main">
            <span class="gc-inbox-item-top">
              <span class="gc-inbox-badge tone-${meta.tone}">${meta.label}</span>
              <small>${escapeHtml(noteWhen(row.time))}</small>
            </span>
            <strong>${escapeHtml(row.title || "通知")}</strong>
            <span class="gc-inbox-item-preview">${escapeHtml(previewText(row))}</span>
          </span>
          <span class="gc-inbox-item-side">
            ${unread ? `<span class="gc-inbox-dot" aria-label="未読"></span>` : ""}
          </span>
        </button>`;
    }).join("");

    listHost.querySelectorAll("[data-inbox-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedId = button.dataset.inboxId;
        const row = rows.find((item) => item.id === selectedId);
        markRead(row);
        if (isMobileInbox()) detailOpen = true;
        renderList({ keepScroll: true });
      });
    });

    if (keepScroll) listHost.scrollTop = scrollTop;
    renderDetail(rows.find((row) => row.id === selectedId) || null);
    syncDetailOpen();
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filter = button.dataset.inboxFilter || "all";
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });
      detailOpen = false;
      renderList();
    });
  });

  window.matchMedia("(max-width: 900px)").addEventListener("change", () => {
    if (!isMobileInbox()) detailOpen = false;
    syncDetailOpen();
  });

  renderList();
}



function tokyoDateText(ms = Date.now()) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function formatDueLabel(dueOn) {
  if (!dueOn) return "";
  const date = new Date(`${dueOn}T12:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return dueOn;
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  });
}

function formatLessonDate(ms) {
  if (!ms) return "レッスン";
  return `${new Date(ms).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  })}のレッスン`;
}

function addDaysYmd(ymd, days) {
  const date = new Date(`${ymd}T12:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return tokyoDateText(date.getTime());
}

function homeworkProgressState(item, progress) {
  const completed = Boolean(progress?.completed);
  const started = Boolean(
    progress?.startedAt
    || (Array.isArray(progress?.doneIds) && progress.doneIds.length)
    || Number(progress?.correctCount) > 0
    || Number(progress?.percent) > 0
    || (progress?.attempts && Object.keys(progress.attempts).length)
  );
  const today = tokyoDateText();
  const dueOn = String(item.dueOn || "");
  const overdue = Boolean(dueOn && dueOn < today && !completed);
  const dueSoon = Boolean(dueOn && !completed && !overdue && dueOn <= addDaysYmd(today, 3));
  let status = "not_started";
  if (completed) status = "completed";
  else if (overdue) status = "overdue";
  else if (dueSoon) status = started ? "due_soon_progress" : "due_soon";
  else if (started) status = "in_progress";
  return { status, completed, started, overdue, dueSoon, percent: Number(progress?.percent) || 0 };
}

function homeworkStatusMeta(state) {
  if (state.status === "completed") {
    return { key: "done", label: "完了", tone: "mint", action: "結果を見る", cheer: "できた！" };
  }
  if (state.status === "overdue") {
    return { key: "late", label: "期限切れ", tone: "coral", action: state.started ? "つづける" : "はじめる" };
  }
  if (state.status === "due_soon" || state.status === "due_soon_progress") {
    return {
      key: "soon",
      label: "締切間近",
      tone: "yellow",
      action: state.started ? "つづける" : "はじめる",
      warn: true,
    };
  }
  if (state.status === "in_progress") {
    return { key: "progress", label: "進行中", tone: "blue", action: "つづける" };
  }
  return { key: "new", label: "未開始", tone: "peach", action: "はじめる" };
}

async function loadHomeworkProgressMap(db, uid, homework) {
  const entries = await Promise.all(homework.map(async (item) => {
    const assignmentId = item.assignmentId || item.id;
    try {
      const snap = await getDoc(doc(db, "homeworkProgress", `${assignmentId}_${uid}`));
      return [assignmentId, snap.exists() ? snap.data() : null];
    } catch {
      return [assignmentId, null];
    }
  }));
  return new Map(entries);
}

function learnEmptyHtml(kind) {
  if (kind === "homework") {
    return `
      <div class="gc-learn-empty">
        <img src="images/fukurou.svg" alt="" width="72" height="78" decoding="async">
        <p>いまは宿題がないよ！</p>
      </div>`;
  }
  return `
    <div class="gc-learn-empty is-report">
      <span class="gc-learn-empty-ico" aria-hidden="true">${LEARN_ICON.sparkle}</span>
      <p>まだレポートはありません</p>
    </div>`;
}

const TYPE_CHIP = {
  multipleChoice: "4択",
  matching: "線つなぎ",
  spelling: "スペリング",
  sentence: "文づくり",
};

/** Collect practice words from public question payloads (no answer keys). */
function previewWordsFromQuestions(questions = []) {
  const ja = [];
  const en = [];
  const seenJa = new Set();
  const seenEn = new Set();
  const pushJa = (text) => {
    const value = String(text || "").trim();
    if (!value || seenJa.has(value)) return;
    seenJa.add(value);
    ja.push(value);
  };
  const pushEn = (text) => {
    const value = String(text || "").trim();
    if (!value || seenEn.has(value)) return;
    seenEn.add(value);
    en.push(value);
  };
  questions.forEach((question) => {
    if (question?.type === "matching") {
      (question.left || []).forEach((item) => pushJa(item?.text));
      (question.right || []).forEach((item) => pushEn(item?.text));
      return;
    }
    const prompt = String(question?.promptJa || "");
    const match = prompt.match(/^(.+?)は英語で/);
    if (match?.[1]) pushJa(match[1]);
    if (question?.type === "multipleChoice") {
      (question.choices || []).forEach((choice) => {
        if (/[A-Za-z]/.test(choice) && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(choice)) pushEn(choice);
      });
    }
    if (question?.promptEn) pushEn(question.promptEn);
  });
  return { ja, en };
}

function typeSummaryFromQuestions(questions = []) {
  const counts = {};
  questions.forEach((question) => {
    const key = question?.type;
    if (!TYPE_CHIP[key]) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([type, count]) => ({
    type,
    label: TYPE_CHIP[type],
    count,
  }));
}

const LEARN_HUB_UI_KEY = "gc-learn-hub-ui";

function defaultLearnHubUi() {
  return { mode: "homework", homeworkId: "", reportId: "" };
}

function readLearnHubUi(uid = "") {
  try {
    const raw = sessionStorage.getItem(uid ? `${LEARN_HUB_UI_KEY}-${uid}` : LEARN_HUB_UI_KEY);
    if (!raw) return defaultLearnHubUi();
    const parsed = JSON.parse(raw);
    const mode = parsed?.mode === "reports" ? "reports" : "homework";
    return {
      mode,
      homeworkId: String(parsed?.homeworkId || ""),
      reportId: String(parsed?.reportId || ""),
    };
  } catch {
    return defaultLearnHubUi();
  }
}

function writeLearnHubUi(uid = "") {
  try {
    const payload = JSON.stringify({
      mode: learnHubUi.mode === "reports" ? "reports" : "homework",
      homeworkId: String(learnHubUi.homeworkId || ""),
      reportId: String(learnHubUi.reportId || ""),
    });
    sessionStorage.setItem(uid ? `${LEARN_HUB_UI_KEY}-${uid}` : LEARN_HUB_UI_KEY, payload);
  } catch {
    /* ignore quota / private mode */
  }
}

let learnHubUi = defaultLearnHubUi();

function shortBubbleLabel(text, max = 10) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function sortHomeworkRows(rows) {
  // Keep bubble positions stable — never reorder by completion/progress.
  return [...rows].sort((a, b) => (
    (b.item.time || 0) - (a.item.time || 0)
    || String(a.assignmentId).localeCompare(String(b.assignmentId))
  ));
}

function homeworkBubbleHtml(row, index) {
  const meta = homeworkStatusMeta(row.state);
  const title = row.item.title || "宿題";
  const done = Boolean(row.state.completed);
  const tone = done ? "mint" : "peach";
  const icon = done ? LEARN_ICON.check : LEARN_ICON.book;
  const incompleteDot = done
    ? ""
    : `<span class="gc-wheel-bubble-dot" aria-hidden="true"></span>`;
  return `
    <button type="button"
      class="gc-wheel-bubble tone-${tone}${done ? " is-done" : " is-todo"}"
      data-wheel-index="${index}"
      data-wheel-id="${escapeHtml(row.assignmentId)}"
      aria-label="${escapeHtml(title)}（${escapeHtml(meta.label)}）">
      ${incompleteDot}
      <span class="gc-wheel-bubble-ico is-outline" aria-hidden="true">${icon}</span>
      <span class="gc-wheel-bubble-label">${escapeHtml(shortBubbleLabel(title))}</span>
    </button>`;
}

function reportBubbleHtml(item, index) {
  const label = formatLessonDate(item.time).replace("のレッスン", "");
  return `
    <button type="button"
      class="gc-wheel-bubble tone-lavender"
      data-wheel-index="${index}"
      data-wheel-id="${escapeHtml(item.id)}"
      aria-label="${escapeHtml(formatLessonDate(item.time))}">
      <span class="gc-wheel-bubble-ico is-cute" aria-hidden="true">${wheelBubbleIcon(index, { report: true })}</span>
      <span class="gc-wheel-bubble-label">${escapeHtml(shortBubbleLabel(label, 9))}</span>
    </button>`;
}

function homeworkDetailHtml(row) {
  if (!row) {
    return `
      <div class="gc-wheel-detail-empty">
        <img src="images/fukurou.svg" alt="" width="88" height="96" decoding="async">
        <p>いまは宿題がないよ！</p>
      </div>`;
  }
  const meta = homeworkStatusMeta(row.state);
  const due = formatDueLabel(row.item.dueOn);
  const teacherName = String(row.item.teacherName || "").trim() || "先生";
  const className = String(row.item.className || "").trim();
  const questionCount = Number(row.item.questionCount) || 0;
  const action = row.state.completed
    ? "もう一度チャレンジ"
    : (row.state.started ? "つづきから" : "はじめる");
  const cheer = row.state.completed
    ? "できたね！もういちど挑戦してみよう"
    : (row.state.started ? "つづきからチャレンジしよう！" : "さあ、英語にチャレンジしよう！");
  const progress = row.state.started && !row.state.completed
    ? `<div class="gc-wheel-progress" aria-label="進捗 ${Math.min(100, Math.max(0, row.state.percent))}%">
        <span style="width:${Math.max(8, Math.min(100, row.state.percent))}%"></span>
      </div>
      <p class="gc-wheel-progress-label">${Math.min(100, Math.max(0, row.state.percent))}% 完了</p>`
    : "";
  return `
    <div class="gc-wheel-detail-card tone-${meta.tone}" data-detail-id="${escapeHtml(row.assignmentId)}">
      <div class="gc-wheel-detail-deco" aria-hidden="true"></div>
      <p class="gc-wheel-detail-status">${meta.warn ? LEARN_ICON.warn : (row.state.completed ? LEARN_ICON.check : LEARN_ICON.book)} ${escapeHtml(meta.label)}</p>
      <h2 class="gc-wheel-detail-title">${escapeHtml(row.item.title || "宿題")}</h2>
      <p class="gc-wheel-detail-cheer">${escapeHtml(cheer)}</p>
      <div class="gc-wheel-detail-facts">
        <span>${LEARN_ICON.calendar} ${due ? `${escapeHtml(due)}まで` : "期日なし"}</span>
        ${questionCount ? `<span>${LEARN_ICON.notebook} ${questionCount}もん</span>` : ""}
        <span>${LEARN_ICON.person} ${escapeHtml(teacherName)}</span>
        ${className ? `<span>${LEARN_ICON.sparkle} ${escapeHtml(className)}</span>` : ""}
      </div>
      ${progress}
      <button type="button" class="gc-wheel-cta" data-hw="${escapeHtml(row.assignmentId)}" data-format="${escapeHtml(row.item.format || "")}" data-replay="${row.state.completed ? "1" : ""}">
        <span>${escapeHtml(action)}</span>
        <span aria-hidden="true">${LEARN_ICON.arrow}</span>
      </button>
    </div>`;
}

function reportDetailHtml(item) {
  if (!item) {
    return `
      <div class="gc-wheel-detail-empty is-report">
        <span class="gc-learn-empty-ico" aria-hidden="true">${LEARN_ICON.sparkle}</span>
        <p>まだレポートはありません</p>
      </div>`;
  }
  const phrases = Array.isArray(item.phrases) ? item.phrases.filter((row) => row?.en || row?.ja) : [];
  const summary = String(item.summary || "").trim();
  const preview = phrases.slice(0, 6).map((phrase) => `
    <span class="gc-learn-chip">
      <strong>${escapeHtml(phrase.en || "")}</strong>
      ${phrase.ja ? `<small>${escapeHtml(phrase.ja)}</small>` : ""}
    </span>`).join("");
  return `
    <div class="gc-wheel-detail-card tone-lavender" data-detail-id="${escapeHtml(item.id)}">
      <div class="gc-wheel-detail-deco is-report" aria-hidden="true"></div>
      <p class="gc-wheel-detail-status">${LEARN_ICON.sparkle} レッスンレポート</p>
      <h2 class="gc-wheel-detail-title">${escapeHtml(formatLessonDate(item.time))}</h2>
      <p class="gc-wheel-detail-cheer">${summary ? escapeHtml(summary) : "コメントはありません"}</p>
      ${preview ? `
        <div class="gc-wheel-vocab">
          <p class="gc-wheel-vocab-label">今日の単語</p>
          <div class="gc-learn-chips">${preview}</div>
        </div>` : ""}
      <button type="button" class="gc-wheel-cta is-report" data-report-open="${escapeHtml(item.id)}" aria-expanded="false">
        <span>レポートを見る</span>
        <span aria-hidden="true">${LEARN_ICON.arrow}</span>
      </button>
      <div class="gc-wheel-report-full" id="report-detail-${escapeHtml(item.id)}" hidden>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
        ${phrases.length
          ? `<ul>${phrases.map((phrase) => `<li><strong>${escapeHtml(phrase.en || "")}</strong>${phrase.ja ? ` — ${escapeHtml(phrase.ja)}` : ""}</li>`).join("")}</ul>`
          : "<p>単語の記録はありません。</p>"}
      </div>
    </div>`;
}

async function enrichHomeworkMeta(db, homework) {
  const needsLookup = homework.some((item) => !item.teacherName || !item.className);
  if (!homework.length || !needsLookup) return homework;

  const assignmentIds = [...new Set(homework.map((item) => item.assignmentId || item.id).filter(Boolean))];
  const assignmentMap = new Map();
  const classIds = new Set();
  await Promise.all(assignmentIds.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, "homeworkAssignments", id));
      if (!snap.exists()) return;
      const data = snap.data() || {};
      assignmentMap.set(id, data);
      (Array.isArray(data.classIds) ? data.classIds : []).forEach((classId) => {
        if (classId) classIds.add(classId);
      });
      if (data.classId) classIds.add(data.classId);
    } catch {
      /* ignore missing assignment */
    }
  }));

  const classNameMap = new Map();
  await Promise.all([...classIds].map(async (classId) => {
    try {
      const snap = await getDoc(doc(db, "classes", classId));
      if (!snap.exists()) return;
      const title = String(snap.data()?.title || snap.data()?.name || "").trim();
      if (title) classNameMap.set(classId, title);
    } catch {
      /* ignore */
    }
  }));

  return homework.map((item) => {
    const id = item.assignmentId || item.id;
    const pack = assignmentMap.get(id) || {};
    const ids = Array.isArray(pack.classIds) && pack.classIds.length
      ? pack.classIds
      : (pack.classId ? [pack.classId] : (Array.isArray(item.classIds) ? item.classIds : []));
    const resolvedClass = item.className
      || ids.map((classId) => classNameMap.get(classId)).filter(Boolean).join("・");
    return {
      ...item,
      teacherName: item.teacherName || pack.creatorName || "先生",
      className: resolvedClass || "",
      dueOn: item.dueOn || pack.dueOn || "",
      title: item.title || pack.title || "宿題",
    };
  });
}

function reportCardHtml(item) {
  const phrases = Array.isArray(item.phrases) ? item.phrases.filter((row) => row?.en || row?.ja) : [];
  const summary = String(item.summary || "").trim();
  const chips = phrases.slice(0, 8).map((phrase) => `
    <span class="gc-learn-chip">
      <strong>${escapeHtml(phrase.en || "")}</strong>
      ${phrase.ja ? `<small>${escapeHtml(phrase.ja)}</small>` : ""}
    </span>`).join("");
  return `
    <article class="gc-learn-report-card" data-report="${escapeHtml(item.id)}">
      <div class="gc-learn-report-head">
        <span class="gc-learn-report-spark" aria-hidden="true">${LEARN_ICON.sparkle}</span>
        <h3>${escapeHtml(formatLessonDate(item.time))}</h3>
      </div>
      ${summary ? `<p class="gc-learn-report-summary">${escapeHtml(summary)}</p>` : `<p class="gc-learn-report-summary is-muted">コメントはありません</p>`}
      ${chips ? `
        <div class="gc-learn-report-vocab">
          <p class="gc-learn-report-vocab-label">今日の単語</p>
          <div class="gc-learn-chips">${chips}</div>
        </div>` : ""}
      <button type="button" class="gc-learn-report-btn" data-report-open="${escapeHtml(item.id)}">
        <span>レポートを見る</span>
        <span aria-hidden="true">${LEARN_ICON.arrow}</span>
      </button>
      <div class="gc-learn-report-detail" id="report-detail-${escapeHtml(item.id)}" hidden>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
        ${phrases.length ? `<ul>${phrases.map((phrase) => `<li><strong>${escapeHtml(phrase.en || "")}</strong>${phrase.ja ? ` — ${escapeHtml(phrase.ja)}` : ""}</li>`).join("")}</ul>` : "<p>単語の記録はありません。</p>"}
      </div>
    </article>`;
}

async function renderStudentLearning(root, db, uid) {
  document.getElementById("platform-hub")?.classList.remove("is-hw-focus");
  learnHubUi = readLearnHubUi(uid);
  root.innerHTML = `
    <div class="gc-learn-hub" aria-busy="true">
      <div class="gc-learn-skel">
        <div class="gc-learn-skel-card"></div>
        <div class="gc-learn-skel-row">
          <div class="gc-learn-skel-card"></div>
          <div class="gc-learn-skel-card"></div>
          <div class="gc-learn-skel-card"></div>
        </div>
        <div class="gc-learn-skel-card is-tall"></div>
      </div>
    </div>`;

  let homework = [];
  let reports = [];
  let progressMap = new Map();
  try {
    const [homeworkSnap, reportSnap] = await Promise.all([
      getDocs(collection(db, "studentHomework", uid, "items")),
      getDocs(query(collection(db, "classReports"), where("attendeeIds", "array-contains", uid))).catch(() => null),
    ]);
    homework = await enrichHomeworkMeta(db, homeworkSnap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      time: noteMillis(item.data().createdAt),
    })));
    reports = (reportSnap?.docs || []).map((item) => ({
      id: item.id,
      ...item.data(),
      time: noteMillis(item.data().createdAt),
    })).sort((a, b) => b.time - a.time);
    progressMap = await loadHomeworkProgressMap(db, uid, homework);
  } catch (error) {
    console.error("[renderStudentLearning]", error);
    root.innerHTML = `
      <div class="gc-learn-hub">
        <div class="gc-learn-error" role="alert">
          <p>読みこめませんでした。もう一度ためしてみてね。</p>
          <button type="button" class="gc-learn-retry" id="learn-retry">もう一度</button>
        </div>
      </div>`;
    root.querySelector("#learn-retry")?.addEventListener("click", () => {
      renderStudentLearning(root, db, uid);
    });
    return;
  }

  const enriched = homework.map((item) => {
    const assignmentId = item.assignmentId || item.id;
    const state = homeworkProgressState(item, progressMap.get(assignmentId));
    return { item, state, assignmentId };
  });
  root._learnWheelCleanup?.();
  root._learnWheelCleanup = null;

  const homeworkRows = sortHomeworkRows(enriched);
  const byAssignment = new Map(homeworkRows.map((row) => [row.assignmentId, row]));

  const defaultHwIndex = (() => {
    if (learnHubUi.homeworkId) {
      const found = homeworkRows.findIndex((row) => row.assignmentId === learnHubUi.homeworkId);
      if (found >= 0) return found;
    }
    return 0;
  })();
  const defaultReportIndex = (() => {
    if (learnHubUi.reportId) {
      const found = reports.findIndex((item) => item.id === learnHubUi.reportId);
      if (found >= 0) return found;
    }
    return 0;
  })();
  if (!["homework", "reports"].includes(learnHubUi.mode)) learnHubUi.mode = "homework";

  root.innerHTML = `
    <div class="gc-learn-hub is-wheel">
      <div class="gc-learn-home" id="learn-home">
        <div class="gc-wheel-stage">
          <div class="gc-wheel-atmosphere" aria-hidden="true">
            <span class="gc-wheel-glow a"></span>
            <span class="gc-wheel-glow b"></span>
            <span class="gc-wheel-glow c"></span>
            <span class="gc-wheel-dot a"></span>
            <span class="gc-wheel-dot b"></span>
            <span class="gc-wheel-dot c"></span>
          </div>
          <div class="gc-wheel" id="learn-wheel" tabindex="0" aria-roledescription="carousel" aria-label="宿題とレポートのせんたく">
            <div class="gc-wheel-ring" id="learn-wheel-ring" aria-hidden="true"></div>
            <div class="gc-wheel-mode" id="learn-wheel-mode" role="tablist" aria-label="表示のきりかえ">
              <button type="button" class="gc-wheel-mode-btn" role="tab" id="learn-mode-homework" data-mode="homework" aria-selected="true">宿題</button>
              <button type="button" class="gc-wheel-mode-btn" role="tab" id="learn-mode-reports" data-mode="reports" aria-selected="false">レポート</button>
            </div>
            <div class="gc-wheel-bubbles" id="learn-wheel-bubbles"></div>
            <div class="gc-wheel-navs" id="learn-wheel-navs">
              <button type="button" class="gc-wheel-nav is-prev" id="learn-wheel-prev" aria-label="前の項目">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5 12 8l6 6.5"/></svg>
              </button>
              <button type="button" class="gc-wheel-nav is-next" id="learn-wheel-next" aria-label="次の項目">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5 12 16l6-6.5"/></svg>
              </button>
            </div>
            <div class="gc-wheel-bridge" id="learn-wheel-bridge" aria-hidden="true"></div>
          </div>
          <div class="gc-wheel-detail" id="learn-detail" aria-live="polite"></div>
        </div>
      </div>
      <div class="gc-learn-play" id="hw-play" hidden></div>
    </div>`;

  const home = root.querySelector("#learn-home");
  const playHost = root.querySelector("#hw-play");
  const wheel = root.querySelector("#learn-wheel");
  const bubblesHost = root.querySelector("#learn-wheel-bubbles");
  const detailHost = root.querySelector("#learn-detail");
  const modeButtons = [...root.querySelectorAll("[data-mode]")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const hubRoot = root.querySelector(".gc-learn-hub");
  const platformHub = document.getElementById("platform-hub");

  const setHomeworkFocus = (on) => {
    hubRoot?.classList.toggle("is-playing", on);
    platformHub?.classList.toggle("is-hw-focus", on);
    if (on) platformHub?.classList.remove("is-nav-open");
  };

  const showHome = () => {
    playHost.hidden = true;
    playHost.replaceChildren();
    home.hidden = false;
    setHomeworkFocus(false);
  };

  const showPlay = () => {
    home.hidden = true;
    playHost.hidden = false;
    setHomeworkFocus(true);
  };

  const refreshHome = () => {
    renderStudentLearning(root, db, uid);
  };

  const startHomework = async (assignmentId, format, extras = {}) => {
    if (!playHost || !home) return;
    showPlay();
    playHost.innerHTML = `<p class="gc-learn-loading">よみこみ中…</p>`;
    const backToList = () => {
      showHome();
      refreshHome();
    };
    try {
      if (format === "pack-v1") {
        await playPackHomework(playHost, assignmentId, uid, {
          onClose: backToList,
          replay: Boolean(extras.replay),
        });
      } else {
        await playHomework(playHost, assignmentId);
        const back = document.createElement("button");
        back.type = "button";
        back.className = "gc-learn-back";
        back.textContent = "もどる";
        back.onclick = backToList;
        playHost.prepend(back);
      }
    } catch (error) {
      playHost.innerHTML = `
        <div class="gc-learn-error" role="alert">
          <p>宿題を開けませんでした。もう一度ためしてみてね。</p>
          <button type="button" class="gc-learn-retry" id="learn-play-back">もどる</button>
        </div>`;
      playHost.querySelector("#learn-play-back")?.addEventListener("click", backToList);
      console.error("[startHomework]", error);
    }
  };

  const wheelState = {
    mode: learnHubUi.mode,
    homeworkIndex: Math.min(defaultHwIndex, Math.max(0, homeworkRows.length - 1)),
    reportIndex: Math.min(defaultReportIndex, Math.max(0, reports.length - 1)),
    position: 0,
    metrics: null,
    dragging: false,
    dragMoved: false,
    pointerId: null,
    dragStartY: 0,
    dragStartX: 0,
    dragStartPos: 0,
    dragTargetIndex: null,
    suppressClick: false,
  };
  wheelState.position = wheelState.mode === "reports" ? wheelState.reportIndex : wheelState.homeworkIndex;

  const ring = root.querySelector("#learn-wheel-ring");
  const modeHost = root.querySelector("#learn-wheel-mode");
  const navsHost = root.querySelector("#learn-wheel-navs");
  const bridge = root.querySelector("#learn-wheel-bridge");
  const prevBtn = root.querySelector("#learn-wheel-prev");
  const nextBtn = root.querySelector("#learn-wheel-next");

  const currentItems = () => (wheelState.mode === "reports" ? reports : homeworkRows);
  const currentIndex = () => Math.round(wheelState.position);
  const syncIndexFromPosition = () => {
    const index = Math.max(0, Math.min(Math.max(currentItems().length - 1, 0), currentIndex()));
    if (wheelState.mode === "reports") wheelState.reportIndex = index;
    else wheelState.homeworkIndex = index;
    return index;
  };

  const computeMetrics = () => {
    const bounds = wheel.getBoundingClientRect();
    // Match CSS: stack layout at <=980px.
    const mobile = window.matchMedia("(max-width: 980px)").matches;
    const narrow = !mobile && (bounds.width < 360 || window.matchMedia("(max-width: 1200px)").matches);
    const height = Math.max(bounds.height, mobile ? 220 : (narrow ? 360 : 420));
    const width = Math.max(bounds.width, mobile ? 220 : 240);
    const selectedSize = mobile
      ? Math.min(88, Math.max(72, Math.min(width, height) * 0.22))
      : narrow
        ? Math.min(118, Math.max(100, height * 0.16))
        : Math.min(132, Math.max(118, height * 0.17));
    const gap = mobile ? 18 : (narrow ? 22 : 28);
    // Mobile: shallower arc so neighbors stay fully inside the wheel box.
    const radius = mobile
      ? Math.min(width * 0.48, Math.max(108, height * 0.62))
      : Math.min(height * (narrow ? 0.46 : 0.5), Math.max(narrow ? 220 : 280, height * (narrow ? 0.44 : 0.48)));
    // All bubbles stay selectedSize — space them so neighbors don't overlap.
    const minChord = selectedSize + gap;
    const step = Math.max(
      mobile ? 0.44 : 0.36,
      2 * Math.asin(Math.min(0.9, minChord / (2 * Math.max(radius, 1)))),
    );
    // Keep the selected bubble near the right edge of the wheel column,
    // so it sits close to the details panel.
    const selectedX = mobile
      ? width * 0.5
      : Math.min(width - selectedSize * 0.55 - 12, width * (narrow ? 0.92 : 0.88));
    const cx = mobile ? width * 0.5 : selectedX - radius;
    const cy = mobile ? height * 1.02 : height * 0.5;
    const maxVisible = Math.max(2, Math.floor((mobile ? 0.85 : 1.2) / step));
    return {
      mobile,
      narrow,
      width,
      height,
      radius,
      cx,
      cy,
      step,
      selectedSize,
      gap,
      maxVisible,
      selectedX: mobile ? width * 0.5 : selectedX,
      selectedY: mobile ? height * 0.46 : cy,
    };
  };

  const layoutBubbles = ({ animate } = {}) => {
    if (!wheel || !bubblesHost) return;
    const metrics = computeMetrics();
    wheelState.metrics = metrics;
    const nodes = [...bubblesHost.querySelectorAll(".gc-wheel-bubble")];
    const pos = wheelState.position;
    const size = metrics.selectedSize;
    const fontSize = `${Math.max(0.7, Math.min(0.98, size / 118))}rem`;
    nodes.forEach((node, i) => {
      const offset = i - pos;
      const angle = metrics.mobile
        ? -Math.PI / 2 + offset * metrics.step
        : offset * metrics.step;
      const x = metrics.cx + metrics.radius * Math.cos(angle);
      const y = metrics.cy + metrics.radius * Math.sin(angle);
      const dist = Math.abs(offset);
      const visible = dist <= metrics.maxVisible + 0.55;
      const opacity = !visible ? 0 : Math.max(0.4, 1 - dist * 0.14);
      if (!animate || reduceMotion) node.style.transition = "none";
      else node.style.transition = "";
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.fontSize = fontSize;
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      node.style.opacity = String(opacity);
      node.style.zIndex = String(Math.round(50 - dist * 10));
      node.style.pointerEvents = visible ? "auto" : "none";
      node.classList.toggle("is-active", Math.round(pos) === i);
      node.setAttribute("aria-current", Math.round(pos) === i ? "true" : "false");
      node.setAttribute("aria-hidden", visible ? "false" : "true");
    });
    if (ring) {
      const diameter = metrics.radius * 2;
      ring.style.width = `${diameter}px`;
      ring.style.height = `${diameter}px`;
      ring.style.left = `${metrics.cx}px`;
      ring.style.top = `${metrics.cy}px`;
      ring.style.transform = "translate(-50%, -50%)";
    }
    if (!metrics.mobile) {
      if (modeHost) {
        // Sit in the open bowl of the semicircle (near geometric center, still on-screen).
        const modeX = Math.max(
          72,
          Math.min(
            metrics.selectedX - metrics.selectedSize * 0.95,
            metrics.cx + metrics.radius * 0.48,
          ),
        );
        modeHost.style.left = `${modeX}px`;
        modeHost.style.top = `${metrics.cy}px`;
        modeHost.style.transform = "translate(-50%, -50%)";
      }
      if (navsHost) {
        const navX = metrics.selectedX + metrics.selectedSize * 0.55 + 14;
        navsHost.style.left = `${navX}px`;
        navsHost.style.top = `${metrics.selectedY}px`;
        navsHost.style.right = "auto";
        navsHost.style.transform = "translateY(-50%)";
      }
      if (bridge) {
        bridge.style.left = `${metrics.selectedX + metrics.selectedSize * 0.48}px`;
        bridge.style.top = `${metrics.selectedY}px`;
        bridge.style.width = `${Math.max(48, metrics.width - metrics.selectedX - metrics.selectedSize * 0.48 + 72)}px`;
      }
    } else {
      if (modeHost) {
        modeHost.style.left = "";
        modeHost.style.top = "";
        modeHost.style.transform = "";
      }
      if (navsHost) {
        navsHost.style.left = "";
        navsHost.style.top = "";
        navsHost.style.right = "";
        navsHost.style.transform = "";
      }
      if (bridge) {
        bridge.style.left = "";
        bridge.style.top = "";
        bridge.style.width = "";
      }
    }
    updateNavButtons();
  };

  const updateNavButtons = () => {
    const items = currentItems();
    const index = syncIndexFromPosition();
    if (prevBtn) prevBtn.disabled = !items.length || index <= 0;
    if (nextBtn) nextBtn.disabled = !items.length || index >= items.length - 1;
  };

  const bindDetailActions = () => {
    detailHost.querySelector("[data-hw]")?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      startHomework(button.dataset.hw, button.dataset.format || "", {
        replay: button.dataset.replay === "1",
      });
    });
    detailHost.querySelector("[data-report-open]")?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      const id = button.dataset.reportOpen;
      const detail = detailHost.querySelector(`#report-detail-${CSS.escape(id)}`);
      if (!detail) return;
      const open = detail.hidden;
      detail.hidden = !open;
      const label = button.querySelector("span");
      if (label) label.textContent = open ? "とじる" : "レポートを見る";
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
  };

  const renderDetail = () => {
    const index = syncIndexFromPosition();
    if (wheelState.mode === "reports") {
      const item = reports[index] || null;
      learnHubUi.reportId = item?.id || "";
      detailHost.innerHTML = reportDetailHtml(item);
    } else {
      const row = homeworkRows[index] || null;
      learnHubUi.homeworkId = row?.assignmentId || "";
      detailHost.innerHTML = homeworkDetailHtml(row);
    }
    writeLearnHubUi(uid);
    detailHost.classList.remove("is-swap");
    void detailHost.offsetWidth;
    detailHost.classList.add("is-swap");
    bindDetailActions();
    updateNavButtons();
  };

  const renderBubbles = () => {
    if (wheelState.mode === "reports") {
      bubblesHost.innerHTML = reports.length
        ? reports.map((item, index) => reportBubbleHtml(item, index)).join("")
        : "";
      wheel.setAttribute("aria-label", "レッスンレポートのせんたく");
      wheelState.position = Math.min(wheelState.reportIndex, Math.max(0, reports.length - 1));
    } else {
      bubblesHost.innerHTML = homeworkRows.length
        ? homeworkRows.map((row, index) => homeworkBubbleHtml(row, index)).join("")
        : "";
      wheel.setAttribute("aria-label", "宿題のせんたく");
      wheelState.position = Math.min(wheelState.homeworkIndex, Math.max(0, homeworkRows.length - 1));
    }
    layoutBubbles({ animate: false });
    bubblesHost.querySelectorAll(".gc-wheel-bubble").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (wheelState.suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const index = Number(node.dataset.wheelIndex);
        if (Number.isNaN(index) || index === currentIndex()) return;
        selectIndex(index);
      });
    });
  };

  const updateModeUi = () => {
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === wheelState.mode;
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.classList.toggle("is-active", active);
    });
    root.querySelector(".gc-wheel-stage")?.classList.toggle("is-reports", wheelState.mode === "reports");
  };

  const selectIndex = (nextIndex, { silent } = {}) => {
    const items = currentItems();
    if (!items.length) {
      wheelState.position = 0;
      renderDetail();
      layoutBubbles({ animate: true });
      return;
    }
    const clamped = Math.max(0, Math.min(items.length - 1, nextIndex));
    if (clamped === currentIndex() && Math.abs(wheelState.position - clamped) < 0.02 && !silent) {
      wheelState.position = clamped;
      layoutBubbles({ animate: true });
      return;
    }
    wheelState.position = clamped;
    syncIndexFromPosition();
    layoutBubbles({ animate: true });
    renderDetail();
    const active = bubblesHost.querySelector(".gc-wheel-bubble.is-active");
    if (active && !reduceMotion) {
      active.classList.remove("is-pop");
      void active.offsetWidth;
      active.classList.add("is-pop");
    }
  };

  const step = (delta) => {
    const items = currentItems();
    if (!items.length) return;
    const next = currentIndex() + delta;
    if (next < 0 || next >= items.length) return;
    selectIndex(next);
  };

  const snapToNearest = () => {
    const items = currentItems();
    if (!items.length) {
      wheelState.position = 0;
      layoutBubbles({ animate: true });
      renderDetail();
      return;
    }
    const clamped = Math.max(0, Math.min(items.length - 1, Math.round(wheelState.position)));
    selectIndex(clamped, { silent: true });
  };

  const setMode = (mode) => {
    if (mode !== "homework" && mode !== "reports") return;
    if (mode === wheelState.mode) return;
    syncIndexFromPosition();
    wheelState.mode = mode;
    learnHubUi.mode = mode;
    writeLearnHubUi(uid);
    updateModeUi();
    renderBubbles();
    renderDetail();
  };

  const bubbleIndexFromEvent = (event) => {
    const bubble = event.target?.closest?.(".gc-wheel-bubble");
    if (!bubble) return null;
    const index = Number(bubble.dataset.wheelIndex);
    return Number.isNaN(index) ? null : index;
  };

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest(".gc-wheel-mode, .gc-wheel-nav")) return;
    if (!currentItems().length) return;
    wheelState.dragging = true;
    wheelState.dragMoved = false;
    wheelState.pointerId = event.pointerId;
    wheelState.dragStartY = event.clientY;
    wheelState.dragStartX = event.clientX;
    wheelState.dragStartPos = wheelState.position;
    wheelState.dragTargetIndex = bubbleIndexFromEvent(event);
    wheel.classList.add("is-dragging");
  };

  const onPointerMove = (event) => {
    if (!wheelState.dragging || event.pointerId !== wheelState.pointerId) return;
    const metrics = wheelState.metrics || computeMetrics();
    const dy = event.clientY - wheelState.dragStartY;
    const dx = event.clientX - wheelState.dragStartX;
    if (!wheelState.dragMoved && Math.hypot(dx, dy) > 8) {
      wheelState.dragMoved = true;
      try { wheel.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    }
    if (!wheelState.dragMoved) return;
    event.preventDefault();
    const items = currentItems();
    const max = Math.max(items.length - 1, 0);
    // Drag up → next items (lower on arc move toward focus); invert prior mapping.
    const deltaPos = metrics.mobile
      ? -dx / Math.max(metrics.radius * metrics.step, 1)
      : -dy / Math.max(metrics.radius * metrics.step, 1);
    let next = wheelState.dragStartPos + deltaPos;
    if (next < 0) next = next * 0.25;
    if (next > max) next = max + (next - max) * 0.25;
    wheelState.position = next;
    layoutBubbles({ animate: false });
  };

  const onPointerUp = (event) => {
    if (!wheelState.dragging || event.pointerId !== wheelState.pointerId) return;
    wheelState.dragging = false;
    wheel.classList.remove("is-dragging");
    try { wheel.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    if (wheelState.dragMoved) {
      wheelState.suppressClick = true;
      window.setTimeout(() => { wheelState.suppressClick = false; }, 40);
      snapToNearest();
    } else {
      const index = wheelState.dragTargetIndex ?? bubbleIndexFromEvent(event);
      if (index != null && index !== currentIndex()) {
        selectIndex(index);
      }
    }
    wheelState.pointerId = null;
    wheelState.dragTargetIndex = null;
  };

  updateModeUi();
  renderBubbles();
  renderDetail();

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  prevBtn?.addEventListener("click", () => step(-1));
  nextBtn?.addEventListener("click", () => step(1));

  wheel?.addEventListener("pointerdown", onPointerDown);
  wheel?.addEventListener("pointermove", onPointerMove);
  wheel?.addEventListener("pointerup", onPointerUp);
  wheel?.addEventListener("pointercancel", onPointerUp);

  wheel?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      const cta = detailHost.querySelector(".gc-wheel-cta");
      if (cta) {
        event.preventDefault();
        cta.click();
      }
    }
  });

  const onResize = () => layoutBubbles({ animate: false });
  const observer = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => onResize())
    : null;
  observer?.observe(wheel);
  window.addEventListener("resize", onResize, { passive: true });
  root._learnWheelCleanup = () => {
    observer?.disconnect();
    window.removeEventListener("resize", onResize);
  };
}


export async function renderSchoolPanel(root, action) {
  root._stopQuiz?.();
  root._stopQuiz = null;
  root._stopAttendance?.();
  root._stopAttendance = null;
  root._confirmLeave = null;
  document.getElementById("platform-hub")?.classList.remove("is-hw-focus");
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
    const { mountHomeworkHub } = await import("./homework-library.js?v=20261031-hw-teachers");
    const me = await getDoc(doc(db, "users", uid));
    const role = me.data()?.role || "";
    const openHub = ({ landing = false } = {}) => {
      root._stopAttendance?.();
      return mountHomeworkHub(root, {
        db,
        uid,
        role,
        callFunction,
        ...(landing ? { initialView: "landing", skipResume: true } : {}),
        openReport: () => {
          root._stopAttendance?.();
          return renderReport(root, db, uid, {
            onCreateHomework: () => openHub({ landing: true }),
          });
        },
      });
    };
    // Left-nav always opens the homework/report top page.
    await openHub({ landing: true });
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
  const confirmDiscard = async (message) => {
    readCurrent();
    if (!dirty()) return true;
    const ok = await confirmAction({
      title: "保存していない変更があります",
      message,
      confirmLabel: "移動する",
      cancelLabel: "とどまる",
      danger: true,
    });
    if (!ok) return false;
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
      tile.innerHTML = `<button type="button" class="qo-mark" aria-label="この答えを正解にする" title="正解にする" aria-pressed="${correct}">${correct ? checkIcon(14) : ""}</button><span class="qo-shape" aria-hidden="true">${shapeIcon(index)}</span><input data-choice maxlength="80" placeholder="答えを入力" value="${escapeHtml(choice)}">`;
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
    root.querySelector("#quiz-delete").onclick = async () => {
      readCurrent();
      if (questions.length === 1) {
        note = "問題は1つ以上必要です。";
        noteKind = "error";
        paintEdit();
        return;
      }
      const row = questions[current];
      const filled = row.prompt.trim() || row.choices.some((choice) => choice.trim());
      if (filled && !await confirmAction({
        title: "この問題を削除しますか？",
        message: "削除した問題はもとにもどせません。",
        confirmLabel: "削除する",
        cancelLabel: "やめる",
        danger: true,
      })) return;
      questions.splice(current, 1);
      current = Math.min(current, questions.length - 1);
      note = "";
      paintEdit();
    };
    root.querySelector("#quiz-join-mode").onclick = async () => {
      if (!await confirmDiscard("保存していない変更があります。参加画面に移動しますか？")) return;
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
    savedMenu.onclick = async (event) => {
      const remove = event.target.closest(".qo-saved-delete");
      if (remove) {
        event.stopPropagation();
        const id = remove.dataset.id;
        const found = templates.find((item) => item.id === id);
        if (!found || remove.disabled) return;
        if (!await confirmAction({
          title: "このクイズを削除しますか？",
          message: `「${found.title || "このクイズ"}」を削除します。\n${templateMeta(found)}`,
          confirmLabel: "削除する",
          cancelLabel: "やめる",
          danger: true,
        })) return;
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
      if (dirty() && !await confirmAction({
        title: "保存していない変更があります",
        message: "このクイズに切り替えますか？編集中の内容は保存されません。",
        confirmLabel: "切り替える",
        cancelLabel: "とどまる",
        danger: true,
      })) return;
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
      if (dirty() && !await confirmAction({
        title: "保存していない変更があります",
        message: "保存せずに開始しますか？",
        confirmLabel: "開始する",
        cancelLabel: "もどる",
        danger: true,
      })) return;
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
      return `<div class="qo-answer qo-result ${QUIZ_COLORS[choiceIndex] || ""}${correct ? " is-correct" : " is-dim"}" style="--share:${share}%"><span>${correct ? checkIcon() : shapeIcon(choiceIndex)}</span><span class="qo-result-label">${escapeHtml(choice)}${yours ? `<small class="qo-you">あなた</small>` : ""}</span><strong class="qo-count">${count}</strong><span class="qo-meter"></span></div>`;
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
            return `<div class="qo-answer ${QUIZ_COLORS[choiceIndex] || ""}${correct ? " is-correct" : ""}${dim ? " is-dim" : ""}"><span>${shapeIcon(choiceIndex)}</span><span>${escapeHtml(choice)}</span></div>`;
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
        button.innerHTML = `<span>${shapeIcon(choiceIndex)}</span><span>${escapeHtml(choice)}</span>`;
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

async function playPackHomework(root, assignmentId, uid, extras = {}) {
  const { mountHomeworkPlayer } = await import("./homework-play.js?v=20261031-hw-voicefix");
  const db = getFirestore();
  root.innerHTML = `<p class="gc-muted">読み込んでいます…</p>`;
  const snap = await getDoc(doc(db, "homeworkAssignments", assignmentId));
  if (!snap.exists()) throw new Error("宿題が見つかりません。");
  const questions = snap.data()?.questions || [];
  await mountHomeworkPlayer(root, {
    title: snap.data()?.title || "しゅくだい",
    questions,
    db,
    replay: Boolean(extras.replay),
    // Students play teacher-shared clips only (no on-device Gemini remake).
    generateVoice: false,
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
      if (typeof extras.onClose === "function") extras.onClose();
      else root.replaceChildren();
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
  const title = document.createElement("h3");
  title.textContent = activity.promptJa || "";
  root.appendChild(title);
  if (activity.speak && window.speechSynthesis) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hub-quiet";
    button.textContent = "きく";
    button.onclick = () => {
      const utterance = new SpeechSynthesisUtterance(String(activity.speak || ""));
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
    button.textContent = typeof choice === "string" ? choice : String(choice ?? "");
    button.onclick = async () => {
      const answer = activity.pairs ? activity.pairs : (activity.tokens ? activity.tokens : choice);
      const result = await callFunction("submitHomework", { assignmentId, activityId: activity.id, answer });
      const note = document.createElement("p");
      note.textContent = result.correct ? "せいかい" : "もういちど";
      root.appendChild(note);
      if (result.correct) playHomework(root, assignmentId);
    };
    root.appendChild(button);
  });
}
