const PALETTE = [
  "#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA",
  "#00897B", "#6D4C41", "#3949AB", "#C0CA33", "#D81B60",
];
const MANUAL_PALETTE = ["#90A4AE", "#B0BEC5", "#78909C", "#CFD8DC", "#607D8B"];

export const COST_RANGES = [
  { days: 30, label: "30日" },
  { days: 90, label: "90日" },
  { days: 365, label: "12ヶ月" },
];

export function escapeCostHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatYen(value, currency = "JPY") {
  const n = Number(value) || 0;
  const digits = Math.abs(n) < 100 && n !== 0 ? 1 : 0;
  const text = n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency === "JPY" ? `¥${text}` : `${text} ${currency}`;
}

function sortedKeys(totals) {
  return Object.entries(totals || {})
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

export function costSeries(summary) {
  const services = sortedKeys(summary.serviceTotals);
  const manual = sortedKeys(summary.manualTotals);
  return [
    ...services.map((name, i) => ({ name, source: "services", color: PALETTE[i % PALETTE.length] })),
    ...manual.map((name, i) => ({ name, source: "manual", color: MANUAL_PALETTE[i % MANUAL_PALETTE.length], manual: true })),
  ];
}

function bucketLabel(key, granularity) {
  if (granularity === "month") return `${Number(key.slice(5, 7))}月`;
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

function niceMax(value) {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * pow >= value) return step * pow;
  }
  return 10 * pow;
}

export function renderCostChart(summary) {
  const series = costSeries(summary);
  const buckets = summary.buckets || [];
  const width = 960;
  const height = 300;
  const pad = { top: 16, right: 12, bottom: 34, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const totals = buckets.map((b) =>
    series.reduce((sum, s) => sum + Math.max(0, b[s.source][s.name] || 0), 0)
  );
  const max = niceMax(Math.max(0, ...totals));
  const slot = plotW / Math.max(1, buckets.length);
  const barW = Math.max(2, Math.min(36, slot * 0.7));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 12));
  const y = (v) => pad.top + plotH - (v / max) * plotH;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = max * f;
    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" class="cost-grid"/>
      <text x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end" class="cost-axis">${escapeCostHtml(formatYen(v, summary.currency))}</text>`;
  }).join("");

  const bars = buckets.map((b, i) => {
    const x = pad.left + slot * i + (slot - barW) / 2;
    let acc = 0;
    const rects = series.map((s) => {
      const v = Math.max(0, b[s.source][s.name] || 0);
      if (!v) return "";
      const top = y(acc + v);
      const h = y(acc) - top;
      acc += v;
      return `<rect x="${x}" y="${top}" width="${barW}" height="${Math.max(0.5, h)}" fill="${s.color}"><title>${escapeCostHtml(`${bucketLabel(b.key, summary.granularity)} · ${s.name}: ${formatYen(v, summary.currency)}`)}</title></rect>`;
    }).join("");
    const label = i % labelEvery === 0
      ? `<text x="${pad.left + slot * i + slot / 2}" y="${height - 12}" text-anchor="middle" class="cost-axis">${bucketLabel(b.key, summary.granularity)}</text>`
      : "";
    const hover = `<rect x="${pad.left + slot * i}" y="${pad.top}" width="${slot}" height="${plotH}" class="cost-hover"><title>${escapeCostHtml(`${b.key}: ${formatYen(totals[i], summary.currency)}`)}</title></rect>`;
    return hover + rects + label;
  }).join("");

  const legend = series.length
    ? series.map((s) => {
        const total = (s.manual ? summary.manualTotals : summary.serviceTotals)[s.name];
        return `<span class="cost-legend-item"><span class="cost-swatch" style="background:${s.color}"></span>${escapeCostHtml(s.name)}${s.manual ? "（手入力）" : ""} <b>${escapeCostHtml(formatYen(total, summary.currency))}</b></span>`;
      }).join("")
    : '<span class="cost-legend-item">この期間のコストはありません。</span>';

  return `<svg class="cost-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="コストの推移">${grid}${bars}</svg>
    <div class="cost-legend">${legend}</div>`;
}

function renderEntries(entries, currency) {
  if (!entries?.length) {
    return '<p class="cost-empty">手入力のコストはまだありません。</p>';
  }
  const rows = entries.map((e) => `<tr>
      <td>${escapeCostHtml(e.label)}</td>
      <td class="cost-num">${escapeCostHtml(formatYen(e.amount, currency))}</td>
      <td>${e.kind === "monthly" ? "毎月" : "1回"}</td>
      <td>${escapeCostHtml(e.startDate)}${e.kind === "monthly" ? ` 〜 ${escapeCostHtml(e.endDate || "")}` : ""}</td>
      <td>${escapeCostHtml(e.note || "")}</td>
      <td class="cost-actions">
        <button type="button" class="cost-btn-small" data-cost-action="edit" data-id="${escapeCostHtml(e.id)}">編集</button>
        <button type="button" class="cost-btn-small cost-btn-danger" data-cost-action="delete" data-id="${escapeCostHtml(e.id)}">削除</button>
      </td>
    </tr>`).join("");
  return `<div class="table-wrapper"><table class="cost-table">
      <thead><tr><th>項目</th><th>金額</th><th>種類</th><th>日付</th><th>メモ</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function formatExport(lastExport) {
  if (!lastExport) return "まだありません";
  const d = new Date(lastExport);
  if (Number.isNaN(d.getTime())) return String(lastExport);
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function renderCostSummary(summary) {
  const t = summary.totals || {};
  const c = summary.currency;
  const card = (label, value, sub = "") =>
    `<div class="cost-card"><div class="cost-card-label">${label}</div><div class="cost-card-value">${escapeCostHtml(formatYen(value, c))}</div>${sub ? `<div class="cost-card-sub">${sub}</div>` : ""}</div>`;
  return `<div class="cost-cards">
      ${card("合計", t.all)}
      ${card("Google Cloud（クレジット後）", t.cloudNet, `請求額 ${escapeCostHtml(formatYen(t.gross, c))} · クレジット ${escapeCostHtml(formatYen(t.credits, c))}`)}
      ${card("手入力", t.manual)}
    </div>
    <p class="cost-meta">${escapeCostHtml(summary.startDate)} 〜 ${escapeCostHtml(summary.endDate)} · プロジェクト ${escapeCostHtml(summary.projectId)} · 課金データ最終更新 ${escapeCostHtml(formatExport(summary.lastExport))}（Google の課金エクスポートは数時間〜1日遅れます）</p>
    ${renderCostChart(summary)}
    <h3 class="cost-subhead">手入力のコスト</h3>
    ${renderEntries(summary.entries, c)}`;
}
