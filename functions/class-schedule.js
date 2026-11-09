/** Pure scheduling checks shared by class publish and booking. No Firestore. */

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

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

function jstWeekday(date) {
  return WEEKDAY[jstParts(date).weekday] ?? 0;
}

function jstMinutes(date) {
  const parts = jstParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function jstDayKey(date) {
  const parts = jstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function bookingWindowError(startsAtMs, nowMs, policy) {
  if (!policy || !Number.isFinite(startsAtMs) || !Number.isFinite(nowMs)) return "";
  if (policy.bookingOpensHours != null && policy.bookingOpensHours !== "") {
    const hours = Number(policy.bookingOpensHours);
    if (Number.isFinite(hours) && nowMs < startsAtMs - hours * 3600000) {
      return "まだ予約を受け付けていません。";
    }
  }
  if (policy.bookingCutoffHours != null && policy.bookingCutoffHours !== "") {
    const hours = Number(policy.bookingCutoffHours);
    if (Number.isFinite(hours) && nowMs > startsAtMs - hours * 3600000) {
      return "予約の受付は終了しました。";
    }
  }
  return "";
}

function cancelBlocked(startsAtMs, nowMs, policy) {
  if (!policy || policy.cancelCutoffHours == null || policy.cancelCutoffHours === "") return false;
  const hours = Number(policy.cancelCutoffHours);
  if (!Number.isFinite(hours) || !Number.isFinite(startsAtMs)) return false;
  return nowMs > startsAtMs - hours * 3600000;
}

function availabilityConflict(settings, startsAtMs, endsAtMs) {
  if (!settings || !Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) return "";
  const blocks = Array.isArray(settings.blocks) ? settings.blocks : [];
  for (const block of blocks) {
    const start = Number(block?.startAt);
    const end = Number(block?.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (startsAtMs < end && endsAtMs > start) return "この時間は対応不可にしています。";
  }
  const hours = settings.hours && typeof settings.hours === "object" ? settings.hours : {};
  const keys = Object.keys(hours);
  if (!keys.length) return "";
  const start = new Date(startsAtMs);
  const end = new Date(endsAtMs);
  if (jstDayKey(start) !== jstDayKey(end)) return "日をまたぐクラスは、設定した対応可能時間の外です。";
  const ranges = hours[String(jstWeekday(start))];
  if (!Array.isArray(ranges) || !ranges.length) return "この曜日は対応可能時間の外です。";
  const startMin = jstMinutes(start);
  const endMin = jstMinutes(end);
  const fits = ranges.some((range) => {
    const from = Number(range?.[0]);
    const to = Number(range?.[1]);
    return Number.isFinite(from) && Number.isFinite(to) && startMin >= from && endMin <= to;
  });
  return fits ? "" : "対応可能時間の外です。";
}

// A repeating class is one session, copied onto later dates.
// If the end date is days later, that is the series length, not the length of this session.
function occurrenceEndMs(startsAtMs, endsAtMs, repeat) {
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) return endsAtMs;
  if (!repeat || repeat === "none") return endsAtMs;
  const start = new Date(startsAtMs);
  const end = new Date(endsAtMs);
  if (jstDayKey(start) === jstDayKey(end)) return endsAtMs;
  const startMin = jstMinutes(start);
  const endMin = jstMinutes(end);
  if (endMin > startMin) return startsAtMs + (endMin - startMin) * 60000;
  if (startMin === 0 && (endMin === 23 * 60 + 59 || endMin === 0)) {
    return Date.parse(`${jstDayKey(start)}T23:59:00+09:00`);
  }
  return startsAtMs + 60 * 60 * 1000;
}

module.exports = {
  bookingWindowError,
  cancelBlocked,
  availabilityConflict,
  occurrenceEndMs,
  jstWeekday,
};
