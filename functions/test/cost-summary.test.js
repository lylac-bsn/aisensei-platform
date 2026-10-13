const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clampDays,
  costRange,
  expandEntry,
  summarizeCosts,
  validateCostEntry,
} = require("../cost-summary");

test("range is clamped and uses Tokyo dates", () => {
  assert.equal(clampDays("abc"), 30);
  assert.equal(clampDays(1), 7);
  assert.equal(clampDays(9999), 400);
  const r = costRange(30, new Date("2026-10-12T16:30:00Z"));
  assert.equal(r.endDate, "2026-10-13");
  assert.equal(r.startDate, "2026-09-14");
  assert.equal(r.granularity, "day");
  assert.equal(costRange(365).granularity, "month");
});

test("monthly entries repeat on the same day, clamped to month end", () => {
  const hits = expandEntry(
    { amount: 1000, kind: "monthly", startDate: "2026-01-31" },
    "2026-01-01",
    "2026-04-30"
  );
  assert.deepEqual(hits.map((h) => h.date), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  const ended = expandEntry(
    { amount: 1000, kind: "monthly", startDate: "2026-01-10", endDate: "2026-02-15" },
    "2026-01-01",
    "2026-06-30"
  );
  assert.equal(ended.length, 2);
  assert.deepEqual(expandEntry({ amount: 5, kind: "once", startDate: "2025-12-31" }, "2026-01-01", "2026-01-31"), []);
});

test("summary nets credits and adds manual entries per bucket", () => {
  const range = { startDate: "2026-09-01", endDate: "2026-09-03", granularity: "day" };
  const rows = [
    { day: "2026-09-01", service: "Vertex AI", cost: 100, credits: 0, currency: "JPY", lastExport: { value: "2026-09-02T01:00:00Z" } },
    { day: "2026-09-02", service: "Cloud Run", cost: 10, credits: -7.5, currency: "JPY" },
    { day: "2026-08-31", service: "Cloud Run", cost: 99, credits: 0 },
  ];
  const entries = [{ label: "Domain", amount: 1500, kind: "once", startDate: "2026-09-03" }];
  const s = summarizeCosts(rows, entries, range);
  assert.deepEqual(s.buckets.map((b) => b.key), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.equal(s.buckets[1].services["Cloud Run"], 2.5);
  assert.equal(s.buckets[2].manual.Domain, 1500);
  assert.deepEqual(s.totals, { gross: 110, credits: -7.5, cloudNet: 102.5, manual: 1500, all: 1602.5 });
  assert.equal(s.lastExport, "2026-09-02T01:00:00Z");
});

test("monthly granularity groups days into months", () => {
  const range = { startDate: "2026-08-15", endDate: "2026-10-13", granularity: "month" };
  const s = summarizeCosts(
    [
      { day: "2026-08-20", service: "Vertex AI", cost: 5, credits: 0 },
      { day: "2026-08-21", service: "Vertex AI", cost: 6, credits: 0 },
    ],
    [{ label: "Apple Developer", amount: 1000, kind: "monthly", startDate: "2026-01-01" }],
    range
  );
  assert.deepEqual(s.buckets.map((b) => b.key), ["2026-08", "2026-09", "2026-10"]);
  assert.equal(s.buckets[0].services["Vertex AI"], 11);
  assert.equal(s.manualTotals["Apple Developer"], 2000);
});

test("entry validation", () => {
  assert.ok(validateCostEntry({ label: "", amount: 1, kind: "once", startDate: "2026-01-01" }).error);
  assert.ok(validateCostEntry({ label: "x", amount: -1, kind: "once", startDate: "2026-01-01" }).error);
  assert.ok(validateCostEntry({ label: "x", amount: 1, kind: "weekly", startDate: "2026-01-01" }).error);
  assert.ok(validateCostEntry({ label: "x", amount: 1, kind: "once", startDate: "2026-02-30" }).error);
  assert.ok(validateCostEntry({ label: "x", amount: 1, kind: "monthly", startDate: "2026-02-01", endDate: "2026-01-01" }).error);
  const ok = validateCostEntry({ label: " ChatGPT ", amount: "3000", kind: "once", startDate: "2026-02-01", endDate: "2026-03-01" });
  assert.deepEqual(ok.entry, { label: "ChatGPT", amount: 3000, kind: "once", startDate: "2026-02-01", endDate: "", note: "" });
});
