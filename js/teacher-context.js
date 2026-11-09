/** Shared teacher navigation state. Session keys match the rest of the hub. */

export const GAME_LABEL = { minecraft: "Minecraft", roblox: "Roblox" };
export const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
export const REPEAT_LABEL = {
  none: "繰り返さない",
  daily: "毎日",
  weekly: "毎週",
  fortnightly: "2週間ごと",
  monthly: "毎月",
};

const FOCUS = "gc-class-focus";
const RETURN = "gc-workspace-return";
const HW_CLASS = "gc-hw-class";
const PREFILL = "gc-class-prefill";
const TAB = "gc-workspace-tab";
const OPEN_REPORT = "gc-open-report";
const VIEW_KEY = "gc-teacher-cal-view";

export function teachLabActive() {
  try {
    const params = new URLSearchParams(location.search);
    const host = location.hostname;
    return params.get("teachlab") === "1" && (host === "localhost" || host === "127.0.0.1");
  } catch {
    return false;
  }
}

export function jstParts(date) {
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

export function jstKey(date) {
  const parts = jstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function jstStamp(dateText, timeText) {
  const date = String(dateText || "").trim();
  const time = String(timeText || "").trim();
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return NaN;
  const parsed = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime();
}

export function clockLabel(date) {
  if (!date) return "";
  const parts = jstParts(date);
  return `${parts.hour}:${parts.minute}`;
}

export function classPhase(item, now = Date.now()) {
  if (item?.status === "draft") return "draft";
  const start = item?.startsAt?.getTime?.() || 0;
  const end = item?.endsAt?.getTime?.() || 0;
  if (end && end <= now) return "done";
  if (start && start <= now) return "live";
  return "soon";
}

export function phaseLabel(phase) {
  if (phase === "draft") return "下書き";
  if (phase === "live") return "進行中";
  if (phase === "done") return "終了";
  return "予定";
}

export function nextActionLabel(phase, unfinished) {
  if (phase === "draft" || phase === "soon") return "授業を準備";
  if (phase === "live") return "授業を開く";
  if (unfinished) return "授業後の作業";
  return "詳細を見る";
}

export function rememberClass(id) {
  try {
    if (id) sessionStorage.setItem(FOCUS, id);
    else sessionStorage.removeItem(FOCUS);
  } catch { /* ignore */ }
}

export function peekClass() {
  try {
    return sessionStorage.getItem(FOCUS) || "";
  } catch {
    return "";
  }
}

export function rememberWorkspaceTab(tab) {
  try {
    sessionStorage.setItem(TAB, tab || "overview");
  } catch { /* ignore */ }
}

export function peekWorkspaceTab() {
  try {
    const tab = sessionStorage.getItem(TAB) || "overview";
    return ["overview", "students", "after"].includes(tab) ? tab : "overview";
  } catch {
    return "overview";
  }
}

export function rememberReturn(id) {
  try {
    if (id) sessionStorage.setItem(RETURN, id);
  } catch { /* ignore */ }
}

export function peekReturn() {
  try {
    return sessionStorage.getItem(RETURN) || "";
  } catch {
    return "";
  }
}

export function consumeReturn() {
  const id = peekReturn();
  try {
    sessionStorage.removeItem(RETURN);
  } catch { /* ignore */ }
  return id;
}

export function setHomeworkClass(id) {
  try {
    if (id) sessionStorage.setItem(HW_CLASS, id);
    else sessionStorage.removeItem(HW_CLASS);
  } catch { /* ignore */ }
}

export function homeworkClass() {
  try {
    return sessionStorage.getItem(HW_CLASS) || "";
  } catch {
    return "";
  }
}

export function rememberPrefill(payload) {
  try {
    sessionStorage.setItem(PREFILL, JSON.stringify(payload || {}));
  } catch { /* ignore */ }
}

export function consumePrefill() {
  try {
    const raw = sessionStorage.getItem(PREFILL);
    sessionStorage.removeItem(PREFILL);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setOpenReport(id) {
  try {
    if (id) sessionStorage.setItem(OPEN_REPORT, id);
    else sessionStorage.removeItem(OPEN_REPORT);
  } catch { /* ignore */ }
}

export function consumeOpenReport() {
  try {
    const id = sessionStorage.getItem(OPEN_REPORT) || "";
    sessionStorage.removeItem(OPEN_REPORT);
    return id;
  } catch {
    return "";
  }
}

export function calendarView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "month" || saved === "week" ? saved : "week";
  } catch {
    return "week";
  }
}

export function saveCalendarView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch { /* ignore */ }
}

export function openHub(action) {
  const matches = [...document.querySelectorAll(`[data-hub-action="${action}"]`)];
  const button = matches.find((item) => !item.hidden && item.offsetParent) || matches[0];
  button?.click();
}

export function openWorkspace(classId, tab = "overview") {
  rememberClass(classId);
  rememberWorkspaceTab(tab);
  try {
    const url = new URL(location.href);
    url.hash = `class/${classId}`;
    history.replaceState(null, "", url);
  } catch { /* ignore */ }
  openHub("class-workspace");
}

export function syncClassHash(classId) {
  try {
    const url = new URL(location.href);
    url.hash = classId ? `class/${classId}` : "";
    history.replaceState(null, "", url);
  } catch { /* ignore */ }
}

export function classIdFromHash() {
  const match = String(location.hash || "").match(/^#class\/([A-Za-z0-9]{1,128})$/);
  return match ? match[1] : "";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function seatLabel(item) {
  const capacity = Number(item?.capacity || 6);
  const booked = Number(item?.bookedCount || 0);
  return `${booked} / ${capacity}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function atJst(dayOffset, hour, minute) {
  const parts = jstParts(new Date());
  const base = new Date(`${parts.year}-${parts.month}-${parts.day}T${pad(hour)}:${pad(minute)}:00+09:00`);
  return new Date(base.getTime() + dayOffset * 86400000);
}

const labState = {
  classes: null,
  bookings: [
    { classId: "lab-live", studentId: "s1", studentName: "佐藤 はな", status: "booked" },
    { classId: "lab-live", studentId: "s2", studentName: "鈴木 けん", status: "booked" },
    { classId: "lab-done", studentId: "s1", studentName: "佐藤 はな", status: "booked" },
    { classId: "lab-soon", studentId: "s3", studentName: "高橋 みお", status: "booked" },
  ],
  attendance: { "lab-done": ["s1"] },
  reports: {},
  notes: {},
};

export function labEnsure() {
  if (labState.classes) return labState;
  const nowHour = Number(jstParts(new Date()).hour);
  const liveHour = Math.min(20, Math.max(8, nowHour));
  labState.classes = [
    {
      id: "lab-done",
      title: "あさのマイクラ",
      game: "minecraft",
      difficulty: "beginner",
      teacherId: "lab",
      teacherName: "プレビュー",
      startsAt: atJst(0, Math.max(8, liveHour - 2), 0),
      endsAt: atJst(0, Math.max(9, liveHour - 1), 0),
      capacity: 6,
      bookedCount: 1,
      status: "open",
      seriesRepeat: "weekly",
      seriesCount: 4,
      instructions: "建物の単語を中心に。",
    },
    {
      id: "lab-live",
      title: "ロボット英語",
      game: "roblox",
      difficulty: "intermediate",
      teacherId: "lab",
      teacherName: "プレビュー",
      startsAt: atJst(0, liveHour, 0),
      endsAt: atJst(0, Math.min(21, liveHour + 1), 0),
      capacity: 6,
      bookedCount: 2,
      status: "open",
      seriesRepeat: "none",
      seriesCount: 1,
      instructions: "指示の言い方を練習。",
    },
    {
      id: "lab-soon",
      title: "夕方の冒険",
      game: "minecraft",
      difficulty: "advanced",
      teacherId: "lab",
      teacherName: "プレビュー",
      startsAt: atJst(0, Math.min(20, liveHour + 2), 30),
      endsAt: atJst(0, Math.min(21, liveHour + 3), 30),
      capacity: 6,
      bookedCount: 1,
      status: "open",
      seriesRepeat: "none",
      seriesCount: 1,
      instructions: "",
    },
    {
      id: "lab-tomorrow",
      title: "ロブロックス初級",
      game: "roblox",
      difficulty: "beginner",
      teacherId: "lab",
      teacherName: "プレビュー",
      startsAt: atJst(1, 16, 0),
      endsAt: atJst(1, 17, 0),
      capacity: 6,
      bookedCount: 0,
      status: "open",
      seriesRepeat: "weekly",
      seriesCount: 8,
      instructions: "",
    },
  ];
  return labState;
}

export function labClasses() {
  return labEnsure().classes.map((item) => ({ ...item }));
}

export function labSaveClass(fields) {
  const state = labEnsure();
  const count = fields.repeat === "none" ? 1 : Number(fields.count || 1);
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const start = new Date(fields.startsAt + index * repeatStep(fields.repeat));
    const id = `lab-${Date.now().toString(36)}-${index}`;
    state.classes.push({
      id,
      title: count > 1 ? `${fields.title} (${index + 1}/${count})` : fields.title,
      game: fields.game,
      difficulty: fields.difficulty,
      teacherId: "lab",
      teacherName: "プレビュー",
      startsAt: start,
      endsAt: new Date(start.getTime() + (fields.endsAt - fields.startsAt)),
      capacity: fields.capacity,
      bookedCount: 0,
      status: fields.status || "open",
      seriesRepeat: fields.repeat,
      seriesCount: count,
      instructions: fields.instructions || "",
    });
    ids.push(id);
  }
  return ids;
}

function repeatStep(repeat) {
  const day = 86400000;
  if (repeat === "daily") return day;
  if (repeat === "weekly") return 7 * day;
  if (repeat === "fortnightly") return 14 * day;
  if (repeat === "monthly") return 30 * day;
  return 0;
}

export function labDeleteClass(id) {
  const state = labEnsure();
  state.classes = state.classes.filter((item) => item.id !== id);
  state.bookings = state.bookings.filter((item) => item.classId !== id);
}

export function labBookings(classId) {
  return labEnsure().bookings.filter((item) => item.classId === classId && item.status === "booked");
}

export function labAttendance(classId) {
  const ids = labEnsure().attendance[classId];
  return ids ? new Set(ids) : null;
}

export function labSaveAttendance(classId, presentIds) {
  labEnsure().attendance[classId] = [...presentIds];
}

export function labReport(classId) {
  return labEnsure().reports[classId] || null;
}

export function labNote(classId) {
  return labEnsure().notes[classId] || null;
}

export function labSaveNote(classId, note) {
  labEnsure().notes[classId] = note;
}
