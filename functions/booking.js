const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { callerIsOwner } = require("./cost-summary");

const REGION = "asia-northeast1";
const GAMES = new Set(["minecraft", "roblox"]);
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const MAX_CAPACITY = 6;

function db() {
  return getFirestore();
}

async function callerUser(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const snap = await db().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "アカウントが見つかりません。");
  }
  return { uid: request.auth.uid, email: request.auth.token?.email || "", ...snap.data() };
}

function isTeacher(user) {
  return user.role === "admin" || user.role === "owner";
}

function jstParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function slotKeyFromDate(date) {
  const p = jstParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Last moment of a JST calendar month. `month` is 1–12. */
function endOfJstMonth(year, month) {
  return new Date(Date.UTC(year, month, 0, 14, 59, 59));
}

function expiryForGrant(now, rolloverMonths) {
  const p = jstParts(now);
  let year = Number(p.year);
  let month = Number(p.month) + rolloverMonths;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return endOfJstMonth(year, month);
}

function monthKey(now) {
  const p = jstParts(now);
  return `${p.year}-${p.month}`;
}

function liveLots(lots, nowMs) {
  return (Array.isArray(lots) ? lots : []).filter((lot) => {
    const expires = lot.expiresAt?.toMillis?.() ?? lot.expiresAt ?? 0;
    return Number(lot.remaining) > 0 && expires > nowMs;
  });
}

function availableOf(lots) {
  return lots.reduce((sum, lot) => sum + Number(lot.remaining || 0), 0);
}

async function ticketPolicy() {
  const snap = await db().collection("settings").doc("ticketPolicy").get();
  const data = snap.exists ? snap.data() : {};
  const ticketsPerMonth = clampInt(data.ticketsPerMonth, 2, 0, 12);
  const rolloverMonths = clampInt(data.rolloverMonths, 1, 0, 6);
  return { ticketsPerMonth, rolloverMonths };
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function spendOne(lots, nowMs) {
  const next = liveLots(lots, nowMs).sort((a, b) => {
    const ae = a.expiresAt?.toMillis?.() ?? a.expiresAt;
    const be = b.expiresAt?.toMillis?.() ?? b.expiresAt;
    return ae - be;
  });
  if (!next.length) return null;
  next[0] = { ...next[0], remaining: Number(next[0].remaining) - 1 };
  return next.filter((lot) => lot.remaining > 0);
}

function grantLot(lots, now, count, rolloverMonths) {
  const key = monthKey(now);
  const next = liveLots(lots, now.getTime());
  if (next.some((lot) => lot.monthKey === key)) {
    return { lots: next, granted: false };
  }
  next.push({
    id: key,
    monthKey: key,
    remaining: count,
    expiresAt: Timestamp.fromDate(expiryForGrant(now, rolloverMonths)),
  });
  return { lots: next, granted: true };
}

exports.publishClass = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) {
    throw new HttpsError("permission-denied", "先生だけがクラスを公開できます。");
  }
  const title = String(request.data?.title || "").trim().slice(0, 80);
  const game = String(request.data?.game || "");
  const difficulty = String(request.data?.difficulty || "");
  const startsAtMs = Number(request.data?.startsAt);
  const endsAtMs = Number(request.data?.endsAt);
  const capacity = clampInt(request.data?.capacity, MAX_CAPACITY, 1, MAX_CAPACITY);
  const weeks = clampInt(request.data?.weeks, 1, 1, 12);
  if (!title || !GAMES.has(game) || !LEVELS.has(difficulty)) {
    throw new HttpsError("invalid-argument", "タイトル、ゲーム、レベルを確認してください。");
  }
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) {
    throw new HttpsError("invalid-argument", "開始と終了の時刻を確認してください。");
  }
  const ids = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (let week = 0; week < weeks; week += 1) {
    const startsAt = new Date(startsAtMs + week * weekMs);
    const ref = db().collection("classes").doc();
    await ref.set({
      teacherId: user.uid,
      teacherName: String(user.displayName || user.email || "先生").slice(0, 50),
      title: weeks > 1 ? `${title} (${week + 1}/${weeks})` : title,
      game,
      difficulty,
      startsAt: Timestamp.fromDate(startsAt),
      endsAt: Timestamp.fromDate(new Date(endsAtMs + week * weekMs)),
      slotKey: slotKeyFromDate(startsAt),
      capacity,
      bookedCount: 0,
      status: "open",
      seriesWeeks: weeks,
      createdAt: FieldValue.serverTimestamp(),
    });
    ids.push(ref.id);
  }
  return { id: ids[0], ids };
});

exports.bookClass = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const classId = String(request.data?.classId || "");
  let studentId = String(request.data?.studentId || user.uid);
  if (!/^[A-Za-z0-9]{1,128}$/.test(classId) || !/^[A-Za-z0-9]{1,128}$/.test(studentId)) {
    throw new HttpsError("invalid-argument", "予約の指定が正しくありません。");
  }
  if (user.role === "parent") {
    const links = Array.isArray(user.linkedStudentIds) ? user.linkedStudentIds : [];
    if (!links.includes(studentId)) {
      throw new HttpsError("permission-denied", "リンクした子どもの予約だけできます。");
    }
  } else if (user.role === "user" || user.role === "student" || !user.role) {
    studentId = user.uid;
  } else {
    throw new HttpsError("permission-denied", "生徒か保護者が予約できます。");
  }

  const bookingId = `${classId}__${studentId}`;
  try {
    await db().runTransaction(async (tx) => {
      const classRef = db().collection("classes").doc(classId);
      const classSnap = await tx.get(classRef);
      if (!classSnap.exists || classSnap.data().status !== "open") {
        throw new HttpsError("not-found", "そのクラスは予約できません。");
      }
      const klass = classSnap.data();
      if (Number(klass.bookedCount || 0) >= Number(klass.capacity || MAX_CAPACITY)) {
        throw new HttpsError("resource-exhausted", "席が埋まっています。");
      }
      const bookingRef = db().collection("bookings").doc(bookingId);
      const existing = await tx.get(bookingRef);
      if (existing.exists && existing.data().status === "booked") {
        throw new HttpsError("already-exists", "このクラスは予約済みです。");
      }
      const holdId = `${studentId}__${klass.slotKey}`;
      const holdRef = db().collection("slotHolds").doc(holdId);
      const hold = await tx.get(holdRef);
      if (hold.exists) {
        throw new HttpsError("already-exists", "同じ時間に別のクラスが予約されています。");
      }
      const balanceRef = db().collection("ticketBalances").doc(studentId);
      const balanceSnap = await tx.get(balanceRef);
      const nowMs = Date.now();
      const spent = spendOne(balanceSnap.exists ? balanceSnap.data().lots : [], nowMs);
      if (!spent) {
        throw new HttpsError("failed-precondition", "チケットがありません。");
      }
      tx.set(balanceRef, {
        lots: spent,
        available: availableOf(spent),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(holdRef, {
        studentId,
        slotKey: klass.slotKey,
        classId,
        bookingId,
      });
      tx.set(bookingRef, {
        classId,
        studentId,
        bookedBy: user.uid,
        teacherId: klass.teacherId,
        slotKey: klass.slotKey,
        status: "booked",
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(classRef, { bookedCount: FieldValue.increment(1) });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "予約できませんでした。");
  }
  return { id: bookingId };
});

exports.cancelBooking = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const bookingId = String(request.data?.bookingId || "");
  if (!/^[A-Za-z0-9_]{1,280}$/.test(bookingId)) {
    throw new HttpsError("invalid-argument", "予約IDが正しくありません。");
  }
  const policy = await ticketPolicy();
  const refundExpires = Timestamp.fromDate(expiryForGrant(new Date(), policy.rolloverMonths));
  await db().runTransaction(async (tx) => {
    const bookingRef = db().collection("bookings").doc(bookingId);
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists || bookingSnap.data().status !== "booked") {
      throw new HttpsError("not-found", "予約が見つかりません。");
    }
    const booking = bookingSnap.data();
    const allowed =
      booking.studentId === user.uid ||
      booking.bookedBy === user.uid ||
      isTeacher(user);
    if (!allowed) throw new HttpsError("permission-denied", "この予約は取り消せません。");
    const classRef = db().collection("classes").doc(booking.classId);
    const balanceRef = db().collection("ticketBalances").doc(booking.studentId);
    const holdRef = db().collection("slotHolds").doc(`${booking.studentId}__${booking.slotKey}`);
    const balanceSnap = await tx.get(balanceRef);
    const lots = liveLots(balanceSnap.exists ? balanceSnap.data().lots : [], Date.now());
    const refundKey = `refund-${bookingId}`;
    if (!lots.some((lot) => lot.id === refundKey)) {
      lots.push({
        id: refundKey,
        monthKey: monthKey(new Date()),
        remaining: 1,
        expiresAt: refundExpires,
      });
    }
    tx.set(balanceRef, {
      lots,
      available: availableOf(lots),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(holdRef);
    tx.update(bookingRef, { status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
    tx.update(classRef, { bookedCount: FieldValue.increment(-1) });
  });
  return { ok: true };
});

exports.setTicketPolicy = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!callerIsOwner(user, request.auth.token?.email)) {
    throw new HttpsError("permission-denied", "オーナーだけが変更できます。");
  }
  const ticketsPerMonth = clampInt(request.data?.ticketsPerMonth, 2, 0, 12);
  const rolloverMonths = clampInt(request.data?.rolloverMonths, 1, 0, 6);
  await db().collection("settings").doc("ticketPolicy").set({
    ticketsPerMonth,
    rolloverMonths,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ticketsPerMonth, rolloverMonths };
});

async function grantAll(now = new Date()) {
  const policy = await ticketPolicy();
  const users = await db().collection("users").where("role", "in", ["user", "student"]).get();
  let granted = 0;
  for (const doc of users.docs) {
    const ref = db().collection("ticketBalances").doc(doc.id);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const result = grantLot(snap.exists ? snap.data().lots : [], now, policy.ticketsPerMonth, policy.rolloverMonths);
      if (!result.granted) return;
      granted += 1;
      tx.set(ref, {
        lots: result.lots,
        available: availableOf(result.lots),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  return { granted, ticketsPerMonth: policy.ticketsPerMonth };
}

exports.grantMonthlyTicketsNow = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!callerIsOwner(user, request.auth.token?.email)) {
    throw new HttpsError("permission-denied", "オーナーだけが実行できます。");
  }
  return grantAll(new Date());
});

exports.grantMonthlyTickets = onSchedule(
  { schedule: "0 0 1 * *", timeZone: "Asia/Tokyo", region: REGION },
  async () => grantAll(new Date())
);
