const test = require("node:test");
const assert = require("node:assert/strict");
const { availabilityConflict, bookingWindowError, cancelBlocked, occurrenceEndMs } = require("../class-schedule");

const start = Date.parse("2026-11-06T07:00:00.000Z"); // 16:00 JST Friday
const end = start + 60 * 60 * 1000;

test("booking stays open when no platform policy is stored", () => {
  assert.equal(bookingWindowError(start, start - 60 * 60 * 1000, null), "");
  assert.equal(cancelBlocked(start, start - 60 * 1000, null), false);
});

test("booking window and cancellation cutoff follow the policy", () => {
  const policy = { bookingOpensHours: 48, bookingCutoffHours: 2, cancelCutoffHours: 3 };
  assert.match(bookingWindowError(start, start - 72 * 60 * 60 * 1000, policy), /まだ/);
  assert.equal(bookingWindowError(start, start - 24 * 60 * 60 * 1000, policy), "");
  assert.match(bookingWindowError(start, start - 30 * 60 * 1000, policy), /終了/);
  assert.equal(cancelBlocked(start, start - 4 * 60 * 60 * 1000, policy), false);
  assert.equal(cancelBlocked(start, start - 60 * 60 * 1000, policy), true);
});

test("repeating classes keep one session, and a real multi-day class stays multi-day", () => {
  const fridayAllDay = Date.parse("2026-11-05T15:00:00.000Z"); // Nov 6 00:00 JST
  const seriesEnd = Date.parse("2026-11-27T14:59:00.000Z"); // Nov 27 23:59 JST
  assert.equal(occurrenceEndMs(fridayAllDay, seriesEnd, "fortnightly"), Date.parse("2026-11-06T23:59:00+09:00"));
  const timed = Date.parse("2026-11-06T10:40:00.000Z"); // 19:40 JST
  const timedSeriesEnd = Date.parse("2026-11-27T11:40:00.000Z"); // 20:40 JST, three weeks later
  assert.equal(occurrenceEndMs(timed, timedSeriesEnd, "fortnightly"), timed + 60 * 60 * 1000);
  const eventStart = Date.parse("2026-10-31T10:00:00.000Z");
  const eventEnd = Date.parse("2026-11-03T11:00:00.000Z");
  assert.equal(occurrenceEndMs(eventStart, eventEnd, "none"), eventEnd);
});

test("availability blocks a holiday and allows a class inside working hours", () => {
  assert.equal(availabilityConflict(null, start, end), "");
  assert.match(availabilityConflict({
    hours: {},
    blocks: [{ startAt: start - 1000, endAt: end + 1000, kind: "holiday" }],
  }, start, end), /対応不可/);
  assert.equal(availabilityConflict({
    hours: { "5": [[9 * 60, 19 * 60]] },
    blocks: [],
  }, start, end), "");
  assert.match(availabilityConflict({
    hours: { "5": [[9 * 60, 12 * 60]] },
    blocks: [],
  }, start, end), /外です/);
});
