const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

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
    const targets = parents.length ? parents : [studentId];
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

exports.createQuiz = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生がホストします。");
  const title = clean(request.data?.title, 80) || "クイズ";
  const questions = (Array.isArray(request.data?.questions) ? request.data.questions : [])
    .map((row) => ({
      prompt: clean(row?.prompt, 120),
      choices: (Array.isArray(row?.choices) ? row.choices : []).map((choice) => clean(choice, 80)).filter(Boolean).slice(0, 4),
      answer: clean(row?.answer, 80),
    }))
    .filter((row) => row.prompt && row.choices.length >= 2 && row.choices.some((choice) => norm(choice) === norm(row.answer)));
  if (!questions.length) throw new HttpsError("invalid-argument", "問題を1つ以上入れてください。");
  const code = quizCode();
  const ref = db().collection("quizRooms").doc();
  await ref.set({
    hostId: user.uid,
    code,
    title,
    status: "lobby",
    questionIndex: -1,
    questions,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, code };
});

exports.joinQuiz = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const code = clean(request.data?.code, 8).toUpperCase();
  const snap = await db().collection("quizRooms").where("code", "==", code).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "ルームが見つかりません。");
  const room = snap.docs[0];
  await room.ref.collection("players").doc(user.uid).set({
    name: clean(user.displayName, 40) || "プレイヤー",
    score: 0,
    answeredIndex: -1,
  }, { merge: true });
  return { id: room.id, title: room.data().title };
});

exports.advanceQuiz = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const roomRef = db().collection("quizRooms").doc(clean(request.data?.roomId, 128));
  const room = await roomRef.get();
  if (!room.exists || room.data().hostId !== user.uid) {
    throw new HttpsError("permission-denied", "ホストだけが進められます。");
  }
  const next = Number(room.data().questionIndex) + 1;
  const done = next >= (room.data().questions || []).length;
  await roomRef.set({
    questionIndex: done ? room.data().questionIndex : next,
    status: done ? "done" : "question",
  }, { merge: true });
  return { status: done ? "done" : "question", questionIndex: done ? room.data().questionIndex : next };
});

exports.submitQuizAnswer = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const roomRef = db().collection("quizRooms").doc(clean(request.data?.roomId, 128));
  const room = await roomRef.get();
  if (!room.exists || room.data().status !== "question") {
    throw new HttpsError("failed-precondition", "いまは回答できません。");
  }
  const index = Number(room.data().questionIndex);
  const question = (room.data().questions || [])[index];
  const playerRef = roomRef.collection("players").doc(user.uid);
  const player = await playerRef.get();
  if (!player.exists) throw new HttpsError("permission-denied", "先に参加してください。");
  if (Number(player.data().answeredIndex) === index) return { correct: false, duplicate: true };
  const correct = norm(request.data?.choice) === norm(question?.answer);
  await playerRef.set({
    answeredIndex: index,
    score: FieldValue.increment(correct ? 100 : 0),
  }, { merge: true });
  if (correct) {
    await db().collection("users").doc(user.uid).set({ xp: FieldValue.increment(2) }, { merge: true });
  }
  return { correct };
});

exports.markInboxRead = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const itemId = clean(request.data?.itemId, 128);
  await db().collection("inbox").doc(user.uid).collection("items").doc(itemId).set({ read: true }, { merge: true });
  return { ok: true };
});
