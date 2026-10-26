const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { pushTo } = require("./push");

const REGION = "asia-northeast1";

function db() {
  return getFirestore();
}

async function callerUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const snap = await db().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "アカウントが見つかりません。");
  return { uid: request.auth.uid, ...snap.data() };
}

function isTeacher(user) {
  return user.role === "admin" || user.role === "owner";
}

function isStudent(user) {
  return !user.role || user.role === "user" || user.role === "student";
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function phrasesFrom(raw) {
  const phrases = (Array.isArray(raw) ? raw : [])
    .map((row) => ({ en: clean(row?.en, 80), ja: clean(row?.ja, 80) }))
    .filter((row) => row.en && row.ja);
  if (phrases.length < 3 || phrases.length > 10) {
    throw new HttpsError("invalid-argument", "英語と日本語を 3〜10 組入れてください。");
  }
  return phrases;
}

function decoys(phrases, key, keep) {
  const others = shuffle(phrases.map((row) => row[key]).filter((value) => norm(value) !== norm(keep)));
  return [keep, ...others].slice(0, Math.min(4, phrases.length));
}

function buildActivities(phrases) {
  const activities = [];
  phrases.forEach((phrase, index) => {
    activities.push({
      id: `mc-${index}`,
      type: "multipleChoice",
      promptJa: `${phrase.ja} は えいごで？`,
      speak: phrase.en,
      choices: shuffle(decoys(phrases, "en", phrase.en)),
      answer: phrase.en,
    });
    activities.push({
      id: `listen-${index}`,
      type: "listening",
      promptJa: "きいて、日本語をえらぼう",
      speak: phrase.en,
      choices: shuffle(decoys(phrases, "ja", phrase.ja)),
      answer: phrase.ja,
    });
    const words = phrase.en.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const blankAt = Math.min(words.length - 1, 1);
      activities.push({
        id: `blank-${index}`,
        type: "fillBlank",
        promptJa: "ぬけている ことばは？",
        promptEn: words.map((word, i) => (i === blankAt ? "____" : word)).join(" "),
        choices: shuffle(decoys(phrases, "en", words[blankAt]).map((value) => value.split(/\s+/)[0])),
        answer: words[blankAt],
      });
      activities.push({
        id: `order-${index}`,
        type: "sentenceBuild",
        promptJa: phrase.ja,
        tokens: shuffle(words),
        answer: phrase.en,
      });
    }
  });
  activities.push({
    id: "match-words",
    type: "wordMatch",
    promptJa: "えいごと にほんごを つなげよう",
    pairs: phrases.map((phrase) => ({ en: phrase.en, ja: phrase.ja })),
  });
  activities.push({
    id: "match-phrases",
    type: "phraseMatch",
    promptJa: "ふんを いみと つなげよう",
    pairs: phrases.map((phrase) => ({ en: phrase.en, ja: phrase.ja })),
  });
  return activities;
}

function answerMatches(activity, answer) {
  if (activity.type === "wordMatch" || activity.type === "phraseMatch") {
    const got = Array.isArray(answer) ? answer : [];
    return (activity.pairs || []).every((pair) =>
      got.some((row) => norm(row.en) === norm(pair.en) && norm(row.ja) === norm(pair.ja))
    );
  }
  if (activity.type === "sentenceBuild") {
    const text = Array.isArray(answer) ? answer.join(" ") : answer;
    return norm(text) === norm(activity.answer);
  }
  return norm(answer) === norm(activity.answer);
}

async function inbox(userId, item) {
  const ref = db().collection("inbox").doc(userId).collection("items").doc();
  await ref.set({ ...item, read: false, createdAt: FieldValue.serverTimestamp() });
  await pushTo(userId, item.title, item.body);
}

exports.ensureLinkCode = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isStudent(user)) throw new HttpsError("permission-denied", "生徒のコードです。");
  let code = clean(user.linkCode, 8);
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await db().collection("users").doc(user.uid).set({ linkCode: code }, { merge: true });
    await db().collection("linkCodes").doc(code).set({ studentId: user.uid });
  }
  return { code };
});

exports.linkChild = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (user.role !== "parent") throw new HttpsError("permission-denied", "保護者アカウントでリンクしてください。");
  const code = clean(request.data?.code, 8).toUpperCase();
  const link = await db().collection("linkCodes").doc(code).get();
  if (!link.exists) throw new HttpsError("not-found", "コードが見つかりません。");
  const studentId = link.data().studentId;
  const student = await db().collection("users").doc(studentId).get();
  const name = student.data()?.displayName || "こども";
  const children = Array.isArray(user.linkedChildren) ? user.linkedChildren.filter((row) => row?.id !== studentId) : [];
  children.push({ id: studentId, name });
  await db().collection("users").doc(user.uid).set({
    linkedStudentIds: FieldValue.arrayUnion(studentId),
    linkedChildren: children,
  }, { merge: true });
  await db().collection("users").doc(studentId).set({
    linkedParentIds: FieldValue.arrayUnion(user.uid),
  }, { merge: true });
  return { studentId, name };
});

exports.setAttendance = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const classId = clean(request.data?.classId, 128);
  const presentIds = (Array.isArray(request.data?.presentIds) ? request.data.presentIds : [])
    .map((id) => clean(id, 128))
    .filter((id) => /^[A-Za-z0-9]{1,128}$/.test(id));
  const klass = await db().collection("classes").doc(classId).get();
  if (!klass.exists) throw new HttpsError("not-found", "クラスがありません。");
  if (klass.data().teacherId !== user.uid && !isTeacher(user)) {
    throw new HttpsError("permission-denied", "このクラスの出席は記録できません。");
  }
  if (klass.data().teacherId !== user.uid && user.role !== "owner") {
    throw new HttpsError("permission-denied", "担当の先生だけが記録できます。");
  }
  await db().collection("attendance").doc(classId).set({
    classId,
    teacherId: klass.data().teacherId,
    presentIds,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { count: presentIds.length };
});

async function presentStudents(classId, user) {
  const klass = await db().collection("classes").doc(classId).get();
  if (!klass.exists || klass.data().teacherId !== user.uid) {
    throw new HttpsError("permission-denied", "担当クラスだけ操作できます。");
  }
  const attendance = await db().collection("attendance").doc(classId).get();
  const presentIds = attendance.exists ? attendance.data().presentIds || [] : [];
  if (!presentIds.length) throw new HttpsError("failed-precondition", "先に出席を記録してください。");
  return { klass: klass.data(), presentIds };
}

exports.publishReport = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const classId = clean(request.data?.classId, 128);
  const summary = clean(request.data?.summary, 600);
  const phrases = phrasesFrom(request.data?.phrases);
  if (!summary) throw new HttpsError("invalid-argument", "クラスのまとめを書いてください。");
  const { presentIds } = await presentStudents(classId, user);
  const reportRef = db().collection("classReports").doc();
  await reportRef.set({
    classId,
    teacherId: user.uid,
    summary,
    phrases,
    attendeeIds: presentIds,
    createdAt: FieldValue.serverTimestamp(),
  });
  const vocab = phrases.map((phrase) => `${phrase.en} / ${phrase.ja}`).join("\n");
  for (const studentId of presentIds) {
    const student = await db().collection("users").doc(studentId).get();
    const parents = student.data()?.linkedParentIds || [];
    const targets = [...new Set([studentId, ...parents].filter(Boolean))];
    for (const target of targets) {
      await inbox(target, {
        type: "report",
        title: "クラスレポート",
        body: `${summary}\n\n${vocab}`,
        reportId: reportRef.id,
      });
    }
  }
  return { id: reportRef.id };
});

exports.publishHomework = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const classId = clean(request.data?.classId, 128);
  const title = clean(request.data?.title, 80) || "きょうのしゅくだい";
  const phrases = phrasesFrom(request.data?.phrases);
  const { presentIds } = await presentStudents(classId, user);
  const activities = buildActivities(phrases);
  const ref = db().collection("homeworkAssignments").doc();
  await ref.set({
    teacherId: user.uid,
    classId,
    title,
    phrases,
    activities,
    assigneeIds: presentIds,
    createdAt: FieldValue.serverTimestamp(),
  });
  for (const studentId of presentIds) {
    await db().collection("studentHomework").doc(studentId).collection("items").doc(ref.id).set({
      assignmentId: ref.id,
      title,
      teacherId: user.uid,
      activityCount: activities.length,
      createdAt: FieldValue.serverTimestamp(),
    });
    await inbox(studentId, {
      type: "homework",
      title: "あたらしい しゅくだい",
      body: title,
      assignmentId: ref.id,
    });
    const student = await db().collection("users").doc(studentId).get();
    const parents = student.data()?.linkedParentIds || [];
    for (const parentId of parents) {
      if (!parentId || parentId === studentId) continue;
      await inbox(parentId, {
        type: "homework",
        title: "あたらしい しゅくだい",
        body: `${student.data()?.displayName || "生徒"} · ${title}`,
        assignmentId: ref.id,
        studentId,
      });
    }
  }
  return { id: ref.id, activities: activities.length };
});

exports.submitHomework = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isStudent(user)) throw new HttpsError("permission-denied", "生徒が回答します。");
  const assignmentId = clean(request.data?.assignmentId, 128);
  const activityId = clean(request.data?.activityId, 40);
  const assignment = await db().collection("homeworkAssignments").doc(assignmentId).get();
  if (!assignment.exists || !(assignment.data().assigneeIds || []).includes(user.uid)) {
    throw new HttpsError("permission-denied", "この宿題は割り当てられていません。");
  }
  const activity = (assignment.data().activities || []).find((row) => row.id === activityId);
  if (!activity) throw new HttpsError("not-found", "問題が見つかりません。");
  const correct = answerMatches(activity, request.data?.answer);
  const progressRef = db().collection("homeworkProgress").doc(`${assignmentId}_${user.uid}`);
  const progressSnap = await progressRef.get();
  const doneIds = new Set(progressSnap.exists ? progressSnap.data().doneIds || [] : []);
  const already = doneIds.has(activityId);
  if (correct && !already) doneIds.add(activityId);
  const total = (assignment.data().activities || []).length;
  const completed = doneIds.size >= total;
  const gained = correct && !already ? 5 : 0;
  const bonus = completed && !(progressSnap.exists && progressSnap.data().completed) ? 20 : 0;
  await progressRef.set({
    assignmentId,
    studentId: user.uid,
    doneIds: [...doneIds],
    completed,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (gained + bonus > 0) {
    await db().collection("users").doc(user.uid).set({
      xp: FieldValue.increment(gained + bonus),
    }, { merge: true });
  }
  return { correct, completed, xp: gained + bonus, done: doneIds.size, total };
});

function quizCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

const QUIZ_LIMITS = new Set([5, 10, 20, 30, 60, 90, 120]);

function quizTimeLimit(value) {
  const seconds = Number(value);
  return QUIZ_LIMITS.has(seconds) ? seconds : 20;
}

function quizQuestions(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 20).map((row) => ({
    prompt: clean(row?.prompt, 120),
    choices: (Array.isArray(row?.choices) ? row.choices : []).map((choice) => clean(choice, 80)).filter(Boolean).slice(0, 4),
    answer: clean(row?.answer, 80),
    timeLimitSec: quizTimeLimit(row?.timeLimitSec),
  })).filter((row) => row.prompt && row.choices.length >= 2 && row.choices.some((choice) => norm(choice) === norm(row.answer)));
}

function nextRoomPatch(data) {
  const questions = data.questions || [];
  const next = Number(data.questionIndex) + 1;
  if (next >= questions.length) {
    return { questionIndex: Number(data.questionIndex), status: "done", questionEndsAt: null, answeredCount: 0, choiceCounts: [] };
  }
  return {
    questionIndex: next,
    status: "question",
    questionEndsAt: Date.now() + quizTimeLimit(questions[next]?.timeLimitSec) * 1000,
    answeredCount: 0,
    choiceCounts: [],
  };
}

function tallyChoices(data, docs, extra) {
  const index = Number(data.questionIndex);
  const choices = ((data.questions || [])[index] || {}).choices || [];
  const counts = choices.map(() => 0);
  const seen = new Set();
  const add = (id, choice, answeredIndex) => {
    if (!id || id === data.hostId || seen.has(id) || Number(answeredIndex) !== index) return;
    const at = choices.findIndex((item) => norm(item) === norm(choice));
    if (at < 0) return;
    seen.add(id);
    counts[at] += 1;
  };
  docs.forEach((item) => {
    const row = item.data() || {};
    add(item.id, row.choice, row.answeredIndex);
  });
  if (extra) add(extra.id, extra.choice, index);
  return counts;
}

function revealPatch(data, docs, extra) {
  return {
    status: "reveal",
    questionEndsAt: null,
    choiceCounts: tallyChoices(data, docs, extra),
  };
}

async function rankingFor(tx, roomRef, hostId) {
  const snap = await tx.get(roomRef.collection("players"));
  return snap.docs
    .filter((item) => item.id !== hostId)
    .map((item) => ({
      id: item.id,
      name: clean(item.data().name, 40) || "プレイヤー",
      score: Number(item.data().score || 0),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ja"))
    .slice(0, 30);
}

exports.createQuiz = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生がホストします。");
  const title = clean(request.data?.title, 80) || "クイズ";
  const questions = quizQuestions(request.data?.questions);
  if (!questions.length) throw new HttpsError("invalid-argument", "問題を1つ以上入れてください。");
  const code = quizCode();
  const ref = db().collection("quizRooms").doc();
  await ref.set({
    hostId: user.uid,
    code,
    title,
    status: "lobby",
    questionIndex: -1,
    questionEndsAt: null,
    playerCount: 0,
    answeredCount: 0,
    questions,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, code };
});

exports.saveQuizTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが保存できます。");
  const title = clean(request.data?.title, 80) || "クイズ";
  const questions = quizQuestions(request.data?.questions);
  if (!questions.length) throw new HttpsError("invalid-argument", "問題を1つ以上入れてください。");
  const requestedId = clean(request.data?.id, 128);
  const ref = requestedId
    ? db().collection("quizTemplates").doc(requestedId)
    : db().collection("quizTemplates").doc();
  if (requestedId) {
    const existing = await ref.get();
    if (!existing.exists || existing.data().ownerId !== user.uid) {
      throw new HttpsError("permission-denied", "このテンプレートは保存できません。");
    }
  }
  await ref.set({
    ownerId: user.uid,
    title,
    questions,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: ref.id };
});

exports.deleteQuizTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが削除できます。");
  const ref = db().collection("quizTemplates").doc(clean(request.data?.id, 128));
  const existing = await ref.get();
  if (!existing.exists || existing.data().ownerId !== user.uid) {
    throw new HttpsError("permission-denied", "このテンプレートは削除できません。");
  }
  await ref.delete();
  return { ok: true };
});

exports.joinQuiz = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const code = clean(request.data?.code, 8).toUpperCase();
  const snap = await db().collection("quizRooms").where("code", "==", code).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "ルームが見つかりません。");
  const roomRef = snap.docs[0].ref;
  const title = snap.docs[0].data().title;
  await db().runTransaction(async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists) throw new HttpsError("not-found", "ルームが見つかりません。");
    const playerRef = roomRef.collection("players").doc(user.uid);
    const player = await tx.get(playerRef);
    if (!player.exists && user.uid !== room.data().hostId) {
      tx.set(roomRef, { playerCount: FieldValue.increment(1) }, { merge: true });
    }
    tx.set(playerRef, {
      name: clean(user.displayName, 40) || "プレイヤー",
      score: player.exists ? Number(player.data().score || 0) : 0,
      answeredIndex: player.exists ? Number(player.data().answeredIndex ?? -1) : -1,
    }, { merge: true });
  });
  return { id: roomRef.id, title };
});

exports.advanceQuiz = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const roomRef = db().collection("quizRooms").doc(clean(request.data?.roomId, 128));
  const sent = request.data?.questionIndex;
  const expected = sent === undefined || sent === null || sent === "" ? null : Number(sent);
  if (expected !== null && !Number.isInteger(expected)) throw new HttpsError("invalid-argument", "問題が不明です。");
  return db().runTransaction(async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists || room.data().hostId !== user.uid) {
      throw new HttpsError("permission-denied", "ホストだけが進められます。");
    }
    const data = room.data();
    if (data.status === "done" || (expected !== null && Number(data.questionIndex) !== expected)) {
      return { status: data.status, questionIndex: Number(data.questionIndex), advanced: false };
    }
    if (data.status === "question") {
      const playersSnap = await tx.get(roomRef.collection("players"));
      const patch = revealPatch(data, playersSnap.docs);
      tx.set(roomRef, patch, { merge: true });
      return { ...patch, questionIndex: Number(data.questionIndex), advanced: true };
    }
    const finishing = data.status === "reveal" && Number(data.questionIndex) + 1 >= (data.questions || []).length;
    const ranking = finishing ? await rankingFor(tx, roomRef, data.hostId) : null;
    const patch = nextRoomPatch(data);
    if (ranking) patch.ranking = ranking;
    tx.set(roomRef, patch, { merge: true });
    return { ...patch, advanced: true };
  });
});

exports.syncQuizRoom = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const roomRef = db().collection("quizRooms").doc(clean(request.data?.roomId, 128));
  const expected = Number(request.data?.questionIndex);
  if (!Number.isInteger(expected)) throw new HttpsError("invalid-argument", "問題が不明です。");
  return db().runTransaction(async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists) throw new HttpsError("not-found", "ルームが見つかりません。");
    const data = room.data();
    const me = await tx.get(roomRef.collection("players").doc(user.uid));
    if (data.hostId !== user.uid && !me.exists) {
      throw new HttpsError("permission-denied", "このルームの参加者だけが進められます。");
    }
    if (data.status !== "question" || Number(data.questionIndex) !== expected) {
      return { status: data.status, questionIndex: Number(data.questionIndex), advanced: false };
    }
    const playerCount = Number(data.playerCount || 0);
    const allAnswered = playerCount > 0 && Number(data.answeredCount || 0) >= playerCount;
    const ends = Number(data.questionEndsAt || 0);
    const expired = ends > 0 && Date.now() >= ends;
    if (!allAnswered && !expired) {
      return { status: data.status, questionIndex: expected, advanced: false };
    }
    const playersSnap = await tx.get(roomRef.collection("players"));
    const patch = revealPatch(data, playersSnap.docs);
    tx.set(roomRef, patch, { merge: true });
    return { ...patch, questionIndex: expected, advanced: true };
  });
});

exports.submitQuizAnswer = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const roomRef = db().collection("quizRooms").doc(clean(request.data?.roomId, 128));
  const sent = request.data?.questionIndex;
  const expected = sent === undefined || sent === null || sent === "" ? null : Number(sent);
  if (expected !== null && (!Number.isInteger(expected) || expected < 0)) {
    throw new HttpsError("invalid-argument", "問題が不明です。");
  }
  return db().runTransaction(async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists) throw new HttpsError("not-found", "ルームが見つかりません。");
    const data = room.data();
    const index = Number(data.questionIndex);
    if (data.status !== "question" || (expected !== null && index !== expected)) return { correct: false, closed: true };
    const playerRef = roomRef.collection("players").doc(user.uid);
    const player = await tx.get(playerRef);
    if (!player.exists) throw new HttpsError("permission-denied", "先に参加してください。");
    if (Number(player.data().answeredIndex) === index) return { correct: false, duplicate: true };
    const ends = Number(data.questionEndsAt || 0);
    const expired = ends > 0 && Date.now() >= ends;
    const question = (data.questions || [])[index];
    const choice = clean(request.data?.choice, 80);
    const correct = !expired && norm(choice) === norm(question?.answer);
    const counts = user.uid === data.hostId ? null : {
      answeredCount: Number(data.answeredCount || 0) + (expired ? 0 : 1),
      playerCount: Number(data.playerCount || 0),
    };
    const closing = expired || (counts && counts.playerCount > 0 && counts.answeredCount >= counts.playerCount);
    const playersSnap = closing ? await tx.get(roomRef.collection("players")) : null;
    if (expired) {
      tx.set(roomRef, revealPatch(data, playersSnap.docs), { merge: true });
      return { correct: false, expired: true };
    }
    const roomPatch = {};
    if (counts && !closing) roomPatch.answeredCount = counts.answeredCount;
    if (closing) Object.assign(roomPatch, revealPatch(data, playersSnap.docs, { id: user.uid, choice }));
    tx.set(playerRef, {
      answeredIndex: index,
      choice,
      score: FieldValue.increment(correct ? 100 : 0),
    }, { merge: true });
    if (correct) {
      tx.set(db().collection("users").doc(user.uid), { xp: FieldValue.increment(2) }, { merge: true });
    }
    if (Object.keys(roomPatch).length) tx.set(roomRef, roomPatch, { merge: true });
    return { correct };
  });
});

exports.markInboxRead = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const itemId = clean(request.data?.itemId, 128);
  await db().collection("inbox").doc(user.uid).collection("items").doc(itemId).set({ read: true }, { merge: true });
  return { ok: true };
});
