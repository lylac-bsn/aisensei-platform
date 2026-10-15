const COST_PROJECT_ID = "ai-sensei-8849b";
// Project of the Gemini API key used to pre-generate lesson audio (TTS).
const AUDIO_KEY_PROJECT_ID = "gen-lang-client-0524969604";
const AUDIO_KEY_SUFFIX = "（音声生成キー）";
const BILLING_TABLE =
  process.env.BILLING_EXPORT_TABLE ||
  "ai-sensei-8849b.billing_export.gcp_billing_export_v1_0117ED_8AA7E1_647954";
const COST_TIME_ZONE = "Asia/Tokyo";
const MIN_DAYS = 7;
const MAX_DAYS = 400;
const DEFAULT_DAYS = 30;
const MONTHLY_FROM_DAYS = 120;
const ENTRY_KINDS = ["once", "monthly"];
const OWNER_EMAIL = "growbuddy@gc.com";
const MAX_LABEL = 60;
const MAX_NOTE = 200;
const MAX_AMOUNT = 100000000;

function clampDays(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function todayInTokyo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function costRange(days, now = new Date()) {
  const span = clampDays(days);
  const endDate = todayInTokyo(now);
  const startDate = addDays(endDate, -(span - 1));
  return {
    days: span,
    startDate,
    endDate,
    granularity: span >= MONTHLY_FROM_DAYS ? "month" : "day",
  };
}

function isDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDate(d) === value;
}

function periodDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86400000) + 1;
}

function costPeriod(input, now = new Date()) {
  const startDate = input?.startDate;
  const endDate = input?.endDate;
  if (!startDate && !endDate) return costRange(input?.days, now);
  if (!isDateString(startDate) || !isDateString(endDate)) {
    throw new Error("期間の日付が不正です。");
  }
  if (startDate > endDate) throw new Error("開始日は終了日より前にしてください。");
  if (endDate > todayInTokyo(now)) throw new Error("終了日は今日までにしてください。");
  const days = periodDays(startDate, endDate);
  if (days > MAX_DAYS) throw new Error("期間は400日以内にしてください。");
  return {
    days,
    startDate,
    endDate,
    granularity: days >= MONTHLY_FROM_DAYS ? "month" : "day",
  };
}

function callerIsOwner(user, tokenEmail) {
  const email = String(user?.email || "").trim().toLowerCase();
  const token = String(tokenEmail || "").trim().toLowerCase();
  return user?.role === "owner" && email === OWNER_EMAIL && token === OWNER_EMAIL;
}

// Billing rows land in the partition of their export time, which can trail
// usage by a few days; scan a little earlier than the range start.
function billingQuery(table = BILLING_TABLE) {
  return `
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time, '${COST_TIME_ZONE}')) AS day,
      IF(project.id = @projectId, service.description,
         CONCAT(service.description, '${AUDIO_KEY_SUFFIX}')) AS service,
      SUM(cost) AS cost,
      SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits,
      ANY_VALUE(currency) AS currency,
      MAX(export_time) AS lastExport
    FROM \`${table}\`
    WHERE project.id IN (@projectId, @audioKeyProjectId)
      AND _PARTITIONTIME >= TIMESTAMP_SUB(TIMESTAMP(@startDate), INTERVAL 5 DAY)
      AND DATE(usage_start_time, '${COST_TIME_ZONE}') BETWEEN @startDate AND @endDate
    GROUP BY day, service
  `;
}

function bucketKey(dateStr, granularity) {
  return granularity === "month" ? dateStr.slice(0, 7) : dateStr;
}

function bucketKeys(startDate, endDate, granularity) {
  const keys = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const key = bucketKey(d, granularity);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function expandEntry(entry, startDate, endDate) {
  const amount = Number(entry.amount) || 0;
  if (!amount || !entry.startDate) return [];
  if (entry.kind !== "monthly") {
    return entry.startDate >= startDate && entry.startDate <= endDate
      ? [{ date: entry.startDate, amount }]
      : [];
  }
  const out = [];
  const anchorDay = Number(entry.startDate.slice(8, 10));
  let year = Number(entry.startDate.slice(0, 4));
  let month = Number(entry.startDate.slice(5, 7));
  const last = entry.endDate && entry.endDate < endDate ? entry.endDate : endDate;
  for (;;) {
    const day = Math.min(anchorDay, daysInMonth(year, month));
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date > last) break;
    if (date >= startDate) out.push({ date, amount });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function roundYen(value) {
  return Math.round(value * 100) / 100;
}

function summarizeCosts(rows, entries, range) {
  const { startDate, endDate, granularity } = range;
  const keys = bucketKeys(startDate, endDate, granularity);
  const buckets = new Map(keys.map((key) => [key, { key, services: {}, manual: {} }]));
  const serviceTotals = {};
  const manualTotals = {};
  let gross = 0;
  let credits = 0;
  let manual = 0;
  let currency = "JPY";
  let lastExport = null;

  for (const row of rows || []) {
    const bucket = buckets.get(bucketKey(String(row.day), granularity));
    if (!bucket) continue;
    const cost = Number(row.cost) || 0;
    const credit = Number(row.credits) || 0;
    const net = cost + credit;
    const service = row.service || "Other";
    bucket.services[service] = (bucket.services[service] || 0) + net;
    serviceTotals[service] = (serviceTotals[service] || 0) + net;
    gross += cost;
    credits += credit;
    if (row.currency) currency = row.currency;
    const exported = row.lastExport ? String(row.lastExport.value || row.lastExport) : null;
    if (exported && (!lastExport || exported > lastExport)) lastExport = exported;
  }

  for (const entry of entries || []) {
    const label = entry.label || "Other";
    for (const hit of expandEntry(entry, startDate, endDate)) {
      const bucket = buckets.get(bucketKey(hit.date, granularity));
      if (!bucket) continue;
      bucket.manual[label] = (bucket.manual[label] || 0) + hit.amount;
      manualTotals[label] = (manualTotals[label] || 0) + hit.amount;
      manual += hit.amount;
    }
  }

  const roundMap = (map) =>
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, roundYen(v)]));

  return {
    projectId: COST_PROJECT_ID,
    currency,
    granularity,
    startDate,
    endDate,
    lastExport,
    buckets: keys.map((key) => {
      const b = buckets.get(key);
      return { key, services: roundMap(b.services), manual: roundMap(b.manual) };
    }),
    serviceTotals: roundMap(serviceTotals),
    manualTotals: roundMap(manualTotals),
    totals: {
      gross: roundYen(gross),
      credits: roundYen(credits),
      cloudNet: roundYen(gross + credits),
      manual: roundYen(manual),
      all: roundYen(gross + credits + manual),
    },
  };
}

// Returns { entry } or { error } (Japanese message for the admin UI).
function validateCostEntry(input) {
  const data = input || {};
  const label = String(data.label || "").trim();
  if (!label || label.length > MAX_LABEL) {
    return { error: `項目名は1〜${MAX_LABEL}文字で入力してください。` };
  }
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { error: "金額は正の数で入力してください。" };
  }
  const kind = ENTRY_KINDS.includes(data.kind) ? data.kind : null;
  if (!kind) return { error: "種類が不正です。" };
  if (!isDateString(data.startDate)) return { error: "日付が不正です。" };
  const endDate = data.endDate ? String(data.endDate) : "";
  if (endDate && (!isDateString(endDate) || endDate < data.startDate)) {
    return { error: "終了日が不正です。" };
  }
  const note = String(data.note || "").trim().slice(0, MAX_NOTE);
  return {
    entry: {
      label,
      amount: roundYen(amount),
      kind,
      startDate: data.startDate,
      endDate: kind === "monthly" ? endDate : "",
      note,
    },
  };
}

module.exports = {
  COST_PROJECT_ID,
  AUDIO_KEY_PROJECT_ID,
  BILLING_TABLE,
  billingQuery,
  OWNER_EMAIL,
  clampDays,
  costRange,
  costPeriod,
  callerIsOwner,
  expandEntry,
  summarizeCosts,
  validateCostEntry,
};
