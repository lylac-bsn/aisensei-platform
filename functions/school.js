const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { pushTo } = require("./push");
const { preparePack, gradeAnswer, questionsForEditor } = require("./homework-engine");

const REGION = "asia-northeast1";

function db() {
  return getFirestore();
}

async function callerUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const snap = await db().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "アカウントが見つかりません。");
  // Auth token email must win over any client-writable Firestore email field.
  return {
    uid: request.auth.uid,
    ...snap.data(),
    email: request.auth.token?.email || snap.data()?.email || "",
  };
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
  {
    const teacherName = clean(user.displayName, 40) || "先生";
    const classNames = await classTitlesFor([classId]);
    const className = classNames.join("・");
    for (const studentId of presentIds) {
      await db().collection("studentHomework").doc(studentId).collection("items").doc(ref.id).set({
        assignmentId: ref.id,
        title,
        teacherId: user.uid,
        teacherName,
        classIds: [classId],
        className,
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
  }
  return { id: ref.id, activities: activities.length };
});

function dueOn(value) {
  const text = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function elapsedMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(180000, Math.round(number));
}

function answerSample(answer) {
  const text = Array.isArray(answer) ? answer.join(" ") : String(answer ?? "");
  return text.trim().slice(0, 80);
}

async function studentsForClasses(user, classIds) {
  const ids = new Set();
  for (const classId of classIds) {
    const klass = await db().collection("classes").doc(classId).get();
    if (!klass.exists) throw new HttpsError("not-found", "クラスが見つかりません。");
    if (klass.data().teacherId !== user.uid && user.role !== "owner") {
      throw new HttpsError("permission-denied", "担当クラスだけに出せます。");
    }
    const bookings = await db().collection("bookings").where("classId", "==", classId).get();
    bookings.forEach((item) => {
      const row = item.data();
      if (row.status === "booked" && /^[A-Za-z0-9]{1,128}$/.test(row.studentId || "")) ids.add(row.studentId);
    });
  }
  return [...ids];
}

async function classTitlesFor(classIds = []) {
  const names = [];
  for (const classId of classIds) {
    const klass = await db().collection("classes").doc(classId).get();
    if (!klass.exists) continue;
    const title = clean(klass.data().title || klass.data().name, 40);
    if (title) names.push(title);
  }
  return names;
}

exports.saveHomeworkPack = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが宿題を作れます。");
  const status = request.data?.status === "assigned" ? "assigned" : "draft";
  const prepared = preparePack(request.data?.questions, { assigning: status === "assigned" });
  if (!prepared.ok) throw new HttpsError("invalid-argument", prepared.error);
  const title = clean(request.data?.title, 80) || "きょうのしゅくだい";
  const level = ["beginner", "intermediate", "advanced"].includes(request.data?.level) ? request.data.level : "beginner";
  const classIds = [...new Set((Array.isArray(request.data?.classIds) ? request.data.classIds : [])
    .map((id) => clean(id, 128))
    .filter((id) => /^[A-Za-z0-9]{1,128}$/.test(id)))].slice(0, 8);
  let assigneeIds = [];
  if (status === "assigned") {
    if (!classIds.length) throw new HttpsError("invalid-argument", "出すクラスを選んでください。");
    assigneeIds = await studentsForClasses(user, classIds);
    if (!assigneeIds.length) throw new HttpsError("failed-precondition", "予約している生徒がいません。");
  }
  let ref = db().collection("homeworkAssignments").doc();
  const requestedId = clean(request.data?.id, 128);
  let createdAt = FieldValue.serverTimestamp();
  if (requestedId) {
    if (!/^[A-Za-z0-9]{1,128}$/.test(requestedId)) throw new HttpsError("invalid-argument", "無効な宿題です。");
    ref = db().collection("homeworkAssignments").doc(requestedId);
    const existing = await ref.get();
    if (existing.exists) {
      if (existing.data().teacherId !== user.uid && user.role !== "owner") {
        throw new HttpsError("permission-denied", "この宿題は編集できません。");
      }
      if (existing.data().status === "assigned") {
        throw new HttpsError("failed-precondition", "出した宿題は変更できません。新しく作ってください。");
      }
      createdAt = existing.data().createdAt || createdAt;
    }
  }
  const typeSource = request.data?.settings?.types || {};
  const vocab = (Array.isArray(request.data?.vocab) ? request.data.vocab : []).slice(0, 30).map((row) => ({
    ja: clean(row?.ja, 40),
    en: clean(row?.en, 40),
    sentenceJa: clean(row?.sentenceJa, 80),
    sentenceEn: clean(row?.sentenceEn, 120),
  })).filter((row) => row.ja && row.en);
  // Opt-in only — incomplete drafts must never become public by default.
  const published = request.data?.published === true;
  const libraryReady = Boolean(request.data?.libraryReady);
  const description = clean(request.data?.description, 160);
  const creatorName = clean(user.displayName, 40) || "先生";
  await ref.set({
    format: "pack-v1",
    status,
    title,
    level,
    teacherId: user.uid,
    creatorName,
    description,
    published: status === "assigned" ? false : published,
    libraryReady: status === "assigned" ? false : libraryReady,
    official: false,
    classIds,
    dueOn: dueOn(request.data?.dueOn),
    questionCount: prepared.publicQuestions.length,
    questions: prepared.publicQuestions,
    assigneeIds,
    settings: {
      hints: Boolean(request.data?.settings?.hints),
      sentenceDirection: request.data?.settings?.sentenceDirection === "en-to-ja" ? "en-to-ja" : "ja-to-en",
      types: {
        multipleChoice: typeSource.multipleChoice !== false,
        matching: typeSource.matching !== false,
        spelling: typeSource.spelling !== false,
        sentence: typeSource.sentence !== false,
      },
    },
    createdAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db().collection("homeworkKeys").doc(ref.id).set({
    teacherId: user.uid,
    questions: prepared.questions,
    vocab,
    answers: prepared.secrets,
  });
  if (status === "assigned") {
    const teacherName = creatorName;
    const classNames = await classTitlesFor(classIds);
    const className = classNames.join("・");
    for (const studentId of assigneeIds) {
      await db().collection("studentHomework").doc(studentId).collection("items").doc(ref.id).set({
        assignmentId: ref.id,
        title,
        teacherId: user.uid,
        teacherName,
        classIds,
        className,
        format: "pack-v1",
        questionCount: prepared.publicQuestions.length,
        dueOn: dueOn(request.data?.dueOn),
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
  }
  return { id: ref.id, status, questionCount: prepared.publicQuestions.length, assigneeCount: assigneeIds.length };
});

function libraryCard(id, data) {
  const types = data.settings?.types || {};
  const typeLabels = [];
  if (types.multipleChoice !== false) typeLabels.push("4択");
  if (types.matching !== false) typeLabels.push("線つなぎ");
  if (types.spelling !== false) typeLabels.push("スペリング");
  if (types.sentence !== false) typeLabels.push("文づくり");
  return {
    id,
    title: data.title || "きょうのしゅくだい",
    description: data.description || "",
    level: data.level || "beginner",
    status: data.status || "draft",
    published: data.published === true,
    libraryReady: Boolean(data.libraryReady),
    official: Boolean(data.official),
    teacherId: data.teacherId || "",
    creatorName: data.official ? "Learny" : (data.creatorName || "先生"),
    questionCount: data.questionCount || (data.questions || []).length || 0,
    types: typeLabels,
    dueOn: data.dueOn || "",
    updatedAt: data.updatedAt?.toMillis?.() || 0,
  };
}

function canAccessHomework(user, data) {
  if (!data) return false;
  if (user.role === "owner" || user.role === "admin") return true;
  if (data.teacherId === user.uid) return true;
  if (data.published === true && data.status === "draft") return true;
  if (data.official === true) return true;
  return false;
}

exports.listHomeworkLibrary = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが開けます。");
  const byId = new Map();
  try {
    const mineSnap = await db().collection("homeworkAssignments")
      .where("teacherId", "==", user.uid)
      .limit(80)
      .get();
    mineSnap.docs.forEach((item) => {
      const data = item.data();
      if (data.format !== "pack-v1" || data.status === "assigned") return;
      byId.set(item.id, libraryCard(item.id, data));
    });
  } catch (error) {
    console.warn("listHomeworkLibrary mine", error);
  }
  try {
    const sharedSnap = await db().collection("homeworkAssignments")
      .where("published", "==", true)
      .limit(80)
      .get();
    sharedSnap.docs.forEach((item) => {
      const data = item.data();
      if (data.format !== "pack-v1" || data.status === "assigned") return;
      if (data.teacherId === user.uid) return;
      byId.set(item.id, libraryCard(item.id, data));
    });
  } catch (error) {
    console.warn("listHomeworkLibrary shared", error);
  }
  const items = [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { items };
});

function millisOf(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  return 0;
}

function questionPrompt(question = {}) {
  return clean(question.promptJa || question.prompt?.text || question.prompt || "", 120);
}

exports.listSentHomework = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが開けます。");
  let snap;
  try {
    snap = await db().collection("homeworkAssignments")
      .where("teacherId", "==", user.uid)
      .limit(120)
      .get();
  } catch (error) {
    console.warn("listSentHomework", error);
    throw new HttpsError("internal", "送信済み宿題を読み込めませんでした。");
  }
  const rows = snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((data) => data.format === "pack-v1" && data.status === "assigned");
  const classIdSet = new Set();
  rows.forEach((row) => {
    (Array.isArray(row.classIds) ? row.classIds : []).forEach((id) => {
      if (id) classIdSet.add(id);
    });
  });
  const classTitleMap = {};
  await Promise.all([...classIdSet].map(async (classId) => {
    try {
      const klass = await db().collection("classes").doc(classId).get();
      if (!klass.exists) return;
      classTitleMap[classId] = clean(klass.data().title || klass.data().name, 40) || classId;
    } catch {
      classTitleMap[classId] = classId;
    }
  }));
  const items = rows.map((row) => {
    const classIds = Array.isArray(row.classIds) ? row.classIds.filter(Boolean) : [];
    return {
      id: row.id,
      title: row.title || "きょうのしゅくだい",
      level: row.level || "beginner",
      dueOn: row.dueOn || "",
      questionCount: row.questionCount || (row.questions || []).length || 0,
      assigneeCount: (row.assigneeIds || []).length,
      classIds,
      classNames: classIds.map((id) => classTitleMap[id] || id),
      sourceTemplateId: row.sourceTemplateId || "",
      createdAt: millisOf(row.createdAt),
      updatedAt: millisOf(row.updatedAt),
    };
  }).sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
  return {
    items,
    classes: Object.entries(classTitleMap)
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => String(a.title).localeCompare(String(b.title), "ja")),
  };
});

exports.getSentHomeworkDetail = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが開けます。");
  const assignmentId = clean(request.data?.id, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(assignmentId)) {
    throw new HttpsError("invalid-argument", "無効な宿題です。");
  }
  const assignment = await db().collection("homeworkAssignments").doc(assignmentId).get();
  if (!assignment.exists || assignment.data().format !== "pack-v1") {
    throw new HttpsError("not-found", "宿題が見つかりません。");
  }
  const data = assignment.data();
  if (data.teacherId !== user.uid && user.role !== "owner") {
    throw new HttpsError("permission-denied", "この宿題の結果は開けません。");
  }
  if (data.status !== "assigned") {
    throw new HttpsError("failed-precondition", "送信済みの宿題だけ確認できます。");
  }
  const assigneeIds = [...new Set((Array.isArray(data.assigneeIds) ? data.assigneeIds : [])
    .map((id) => clean(id, 128))
    .filter((id) => /^[A-Za-z0-9]{1,128}$/.test(id)))];
  const classIds = Array.isArray(data.classIds) ? data.classIds.filter(Boolean) : [];
  const classNames = await classTitlesFor(classIds);
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const totalQuestions = questions.length || data.questionCount || 0;

  let progressSnap;
  try {
    progressSnap = await db().collection("homeworkProgress")
      .where("assignmentId", "==", assignmentId)
      .get();
  } catch (error) {
    console.warn("getSentHomeworkDetail progress", error);
    progressSnap = { docs: [] };
  }
  const progressByStudent = new Map();
  progressSnap.docs.forEach((item) => {
    const row = item.data() || {};
    const studentId = clean(row.studentId, 128) || String(item.id).split("_").pop();
    if (studentId) progressByStudent.set(studentId, row);
  });

  const nameById = {};
  for (let i = 0; i < assigneeIds.length; i += 40) {
    const chunk = assigneeIds.slice(i, i + 40);
    const snaps = await db().getAll(...chunk.map((id) => db().collection("users").doc(id)));
    snaps.forEach((snap, index) => {
      const id = chunk[index];
      nameById[id] = clean(snap.exists ? snap.data()?.displayName : "", 40) || "生徒";
    });
  }

  const students = assigneeIds.map((studentId) => {
    const progress = progressByStudent.get(studentId) || null;
    const attemptsMap = progress?.attempts || {};
    const correctCount = Number(progress?.correctCount) || 0;
    const total = Number(progress?.total) || totalQuestions;
    const percent = Number(progress?.percent) || (total ? Math.round((correctCount / total) * 100) : 0);
    const completed = Boolean(progress?.completed);
    const started = Boolean(
      progress?.startedAt
      || completed
      || correctCount > 0
      || Object.keys(attemptsMap).length
      || (Array.isArray(progress?.doneIds) && progress.doneIds.length)
    );
    let status = "not_started";
    if (completed) status = "completed";
    else if (started) status = "in_progress";
    const attempts = questions.map((question) => {
      const attempt = attemptsMap[question.id] || null;
      return {
        questionId: question.id,
        type: question.type || "",
        prompt: questionPrompt(question),
        correct: Boolean(attempt?.correct),
        tried: Boolean(attempt && (attempt.tries > 0 || attempt.correct || (attempt.matched || []).length)),
        tries: Number(attempt?.tries) || 0,
        misses: Number(attempt?.misses) || 0,
        firstCorrect: attempt?.firstCorrect === undefined ? null : Boolean(attempt.firstCorrect),
        sample: clean(attempt?.sample, 80),
        vocabKey: clean(attempt?.vocabKey || question.vocabKey, 80),
      };
    });
    return {
      id: studentId,
      name: nameById[studentId] || "生徒",
      status,
      started,
      completed,
      percent,
      correctCount,
      total,
      timeSpentMs: Number(progress?.timeSpentMs) || 0,
      struggleVocab: Array.isArray(progress?.struggleVocab) ? progress.struggleVocab.slice(0, 12) : [],
      updatedAt: millisOf(progress?.updatedAt),
      finishedAt: millisOf(progress?.finishedAt),
      attempts,
    };
  }).sort((a, b) => {
    const rank = { completed: 0, in_progress: 1, not_started: 2 };
    return (rank[a.status] - rank[b.status]) || String(a.name).localeCompare(String(b.name), "ja");
  });

  const questionStats = questions.map((question) => {
    let attempted = 0;
    let correct = 0;
    let firstOk = 0;
    let struggles = 0;
    let misses = 0;
    assigneeIds.forEach((studentId) => {
      const attempt = progressByStudent.get(studentId)?.attempts?.[question.id];
      if (!attempt) return;
      const tried = attempt.tries > 0 || attempt.correct || (attempt.matched || []).length;
      if (!tried) return;
      attempted += 1;
      misses += Number(attempt.misses) || 0;
      if (attempt.correct) correct += 1;
      if (attempt.firstCorrect === true) firstOk += 1;
      if (attempt.firstCorrect === false) struggles += 1;
    });
    return {
      id: question.id,
      type: question.type || "",
      prompt: questionPrompt(question),
      vocabKey: clean(question.vocabKey, 80),
      attempted,
      correct,
      incorrect: Math.max(0, attempted - correct),
      firstOk,
      struggles,
      misses,
      notStarted: Math.max(0, assigneeIds.length - attempted),
      correctRate: attempted ? Math.round((correct / attempted) * 100) : null,
      firstCorrectRate: attempted ? Math.round((firstOk / attempted) * 100) : null,
    };
  });

  const completedCount = students.filter((row) => row.completed).length;
  const startedCount = students.filter((row) => row.started).length;
  const avgPercent = students.length
    ? Math.round(students.reduce((sum, row) => sum + (row.percent || 0), 0) / students.length)
    : 0;

  return {
    assignment: {
      id: assignmentId,
      title: data.title || "きょうのしゅくだい",
      level: data.level || "beginner",
      dueOn: data.dueOn || "",
      questionCount: totalQuestions,
      classIds,
      classNames,
      createdAt: millisOf(data.createdAt),
      updatedAt: millisOf(data.updatedAt),
    },
    summary: {
      assigneeCount: assigneeIds.length,
      completedCount,
      startedCount,
      notStartedCount: Math.max(0, assigneeIds.length - startedCount),
      avgPercent,
    },
    students,
    questions: questionStats,
  };
});

exports.assignHomeworkFromTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが出せます。");
  const templateId = clean(request.data?.templateId, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(templateId)) throw new HttpsError("invalid-argument", "無効な宿題です。");
  const classIds = [...new Set((Array.isArray(request.data?.classIds) ? request.data.classIds : [])
    .map((id) => clean(id, 128))
    .filter((id) => /^[A-Za-z0-9]{1,128}$/.test(id)))].slice(0, 8);
  if (!classIds.length) throw new HttpsError("invalid-argument", "出すクラスを選んでください。");
  const template = await db().collection("homeworkAssignments").doc(templateId).get();
  if (!template.exists || template.data().format !== "pack-v1") {
    throw new HttpsError("not-found", "宿題が見つかりません。");
  }
  const data = template.data();
  if (!canAccessHomework(user, data)) throw new HttpsError("permission-denied", "この宿題は使えません。");
  if (data.status === "assigned") throw new HttpsError("failed-precondition", "配信済みの宿題はテンプレートにできません。");
  if (!data.official && !data.libraryReady) {
    throw new HttpsError("failed-precondition", "音声確認が終わるまで配信できません。");
  }
  const key = await db().collection("homeworkKeys").doc(templateId).get();
  if (!key.exists) throw new HttpsError("failed-precondition", "この宿題の中身がありません。");
  const questions = (key.data()?.questions || []).map((question) => ({
    ...question,
    approved: true,
    review: false,
  }));
  if (!questions.length) throw new HttpsError("failed-precondition", "問題がありません。");
  const assigneeIds = await studentsForClasses(user, classIds);
  if (!assigneeIds.length) throw new HttpsError("failed-precondition", "予約している生徒がいません。");
  const prepared = preparePack(questions, { assigning: true });
  if (!prepared.ok) throw new HttpsError("invalid-argument", prepared.error);
  const title = clean(data.title, 80) || "きょうのしゅくだい";
  const level = ["beginner", "intermediate", "advanced"].includes(data.level) ? data.level : "beginner";
  const due = dueOn(request.data?.dueOn);
  const ref = db().collection("homeworkAssignments").doc();
  await ref.set({
    format: "pack-v1",
    status: "assigned",
    title,
    level,
    teacherId: user.uid,
    creatorName: clean(user.displayName, 40) || "先生",
    description: clean(data.description, 160),
    published: false,
    libraryReady: false,
    official: false,
    sourceTemplateId: templateId,
    classIds,
    dueOn: due,
    questionCount: prepared.publicQuestions.length,
    questions: prepared.publicQuestions,
    assigneeIds,
    settings: data.settings || {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db().collection("homeworkKeys").doc(ref.id).set({
    teacherId: user.uid,
    questions: prepared.questions,
    vocab: key.data()?.vocab || [],
    answers: prepared.secrets,
    sourceTemplateId: templateId,
  });
  const teacherName = clean(user.displayName, 40) || "先生";
  const classNames = await classTitlesFor(classIds);
  const className = classNames.join("・");
  for (const studentId of assigneeIds) {
    await db().collection("studentHomework").doc(studentId).collection("items").doc(ref.id).set({
      assignmentId: ref.id,
      title,
      teacherId: user.uid,
      teacherName,
      classIds,
      className,
      format: "pack-v1",
      questionCount: prepared.publicQuestions.length,
      dueOn: due,
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
  return { id: ref.id, status: "assigned", questionCount: prepared.publicQuestions.length, assigneeCount: assigneeIds.length };
});

exports.duplicateHomeworkPack = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが複製できます。");
  const id = clean(request.data?.id, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(id)) throw new HttpsError("invalid-argument", "無効な宿題です。");
  const source = await db().collection("homeworkAssignments").doc(id).get();
  if (!source.exists || source.data().format !== "pack-v1") throw new HttpsError("not-found", "宿題が見つかりません。");
  if (!canAccessHomework(user, source.data())) throw new HttpsError("permission-denied", "この宿題は複製できません。");
  const key = await db().collection("homeworkKeys").doc(id).get();
  if (!key.exists) throw new HttpsError("failed-precondition", "この宿題の中身がありません。");
  const data = source.data();
  const ref = db().collection("homeworkAssignments").doc();
  const title = `${clean(data.title, 70) || "きょうのしゅくだい"}（コピー）`.slice(0, 80);
  await ref.set({
    ...data,
    title,
    status: "draft",
    teacherId: user.uid,
    creatorName: clean(user.displayName, 40) || "先生",
    published: false,
    libraryReady: Boolean(data.libraryReady),
    official: false,
    sourceTemplateId: id,
    classIds: [],
    assigneeIds: [],
    dueOn: "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db().collection("homeworkKeys").doc(ref.id).set({
    teacherId: user.uid,
    questions: key.data()?.questions || [],
    vocab: key.data()?.vocab || [],
    answers: key.data()?.answers || {},
    sourceTemplateId: id,
  });
  return { id: ref.id };
});

exports.deleteHomeworkPack = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが削除できます。");
  const id = clean(request.data?.id, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(id)) throw new HttpsError("invalid-argument", "無効な宿題です。");
  const ref = db().collection("homeworkAssignments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "宿題が見つかりません。");
  const data = snap.data();
  if (data.teacherId !== user.uid && user.role !== "owner") {
    throw new HttpsError("permission-denied", "自分の宿題だけ削除できます。");
  }
  const assigneeIds = [...new Set((Array.isArray(data.assigneeIds) ? data.assigneeIds : [])
    .map((studentId) => clean(studentId, 128))
    .filter((studentId) => /^[A-Za-z0-9]{1,128}$/.test(studentId)))];

  // Emergency revoke for sent homework: remove student copies + progress first.
  if (data.status === "assigned") {
    for (let i = 0; i < assigneeIds.length; i += 40) {
      const chunk = assigneeIds.slice(i, i + 40);
      const batch = db().batch();
      chunk.forEach((studentId) => {
        batch.delete(db().collection("studentHomework").doc(studentId).collection("items").doc(id));
        batch.delete(db().collection("homeworkProgress").doc(`${id}_${studentId}`));
      });
      await batch.commit();
    }
    try {
      const progressSnap = await db().collection("homeworkProgress")
        .where("assignmentId", "==", id)
        .get();
      for (let i = 0; i < progressSnap.docs.length; i += 40) {
        const chunk = progressSnap.docs.slice(i, i + 40);
        const batch = db().batch();
        chunk.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
      }
    } catch (error) {
      console.warn("deleteHomeworkPack progress sweep", error);
    }
  }

  await ref.delete();
  await db().collection("homeworkKeys").doc(id).delete().catch(() => {});
  return { ok: true, revoked: data.status === "assigned", assigneeCount: assigneeIds.length };
});

exports.setHomeworkPublished = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが変更できます。");
  const id = clean(request.data?.id, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(id)) throw new HttpsError("invalid-argument", "無効な宿題です。");
  const ref = db().collection("homeworkAssignments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "宿題が見つかりません。");
  if (snap.data().teacherId !== user.uid && user.role !== "owner") {
    throw new HttpsError("permission-denied", "自分の宿題だけ変更できます。");
  }
  if (snap.data().status === "assigned") {
    throw new HttpsError("failed-precondition", "出した宿題は公開設定を変えられません。");
  }
  const published = request.data?.published === true;
  if (published && !snap.data()?.libraryReady && !snap.data()?.official) {
    throw new HttpsError("failed-precondition", "完成していない宿題は公開できません。");
  }
  await ref.set({ published, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id, published };
});

exports.updateHomeworkPackMeta = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが変更できます。");
  const id = clean(request.data?.id, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(id)) throw new HttpsError("invalid-argument", "無効な宿題です。");
  const ref = db().collection("homeworkAssignments").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().format !== "pack-v1") {
    throw new HttpsError("not-found", "宿題が見つかりません。");
  }
  if (snap.data().teacherId !== user.uid && user.role !== "owner") {
    throw new HttpsError("permission-denied", "自分の宿題だけ変更できます。");
  }
  if (snap.data().status === "assigned") {
    throw new HttpsError("failed-precondition", "出した宿題は変更できません。");
  }
  const title = clean(request.data?.title, 80) || "きょうのしゅくだい";
  const description = clean(request.data?.description, 160);
  await ref.set({ title, description, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id, title, description };
});

exports.getHomeworkEditor = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが開けます。");
  const id = clean(request.data?.id, 128);
  if (!/^[A-Za-z0-9]{1,128}$/.test(id)) throw new HttpsError("invalid-argument", "無効な宿題です。");
  const assignment = await db().collection("homeworkAssignments").doc(id).get();
  if (!assignment.exists || assignment.data().format !== "pack-v1") {
    throw new HttpsError("not-found", "宿題が見つかりません。");
  }
  if (!canAccessHomework(user, assignment.data())) {
    throw new HttpsError("permission-denied", "この宿題は開けません。");
  }
  const key = await db().collection("homeworkKeys").doc(id).get();
  const data = assignment.data();
  const mine = data.teacherId === user.uid || user.role === "owner";
  return {
    id,
    title: data.title || "",
    level: data.level || "beginner",
    status: data.status || "draft",
    classIds: data.classIds || [],
    dueOn: data.dueOn || "",
    settings: data.settings || {},
    published: data.published === true,
    libraryReady: Boolean(data.libraryReady),
    description: data.description || "",
    readOnly: !mine || data.status === "assigned",
    vocab: key.data()?.vocab || [],
    questions: questionsForEditor(key.data()?.questions || []),
  };
});

async function submitPackAnswer(user, assignment, data) {
  const assignmentId = assignment.id;
  const questionId = clean(data?.activityId, 40);
  const keySnap = await db().collection("homeworkKeys").doc(assignmentId).get();
  const secret = keySnap.data()?.answers?.[questionId];
  if (!secret) throw new HttpsError("not-found", "問題が見つかりません。");
  const kind = data?.kind === "pair" || data?.kind === "matching-done" ? data.kind : "answer";
  const progressRef = db().collection("homeworkProgress").doc(`${assignmentId}_${user.uid}`);
  const response = { correct: false, solution: "" };
  let gained = 0;
  await db().runTransaction(async (tx) => {
    gained = 0;
    response.correct = false;
    response.solution = "";
    const progressSnap = await tx.get(progressRef);
    const prevDoc = progressSnap.exists ? progressSnap.data() : {};
    const attempts = { ...(prevDoc.attempts || {}) };
    const prev = {
      tries: 0,
      misses: 0,
      matched: [],
      correct: false,
      sample: "",
      ...(attempts[questionId] || {}),
    };
    const total = (assignment.data().questions || []).length;
    if (kind === "pair") {
      const result = gradeAnswer(secret, { leftId: clean(data?.leftId, 40), rightId: clean(data?.rightId, 40) });
      response.correct = result.correct;
      if (result.correct) {
        const mark = `${clean(data?.leftId, 40)}:${clean(data?.rightId, 40)}`;
        if (!prev.matched.includes(mark)) prev.matched = [...prev.matched, mark].slice(-8);
      } else {
        prev.misses += 1;
        prev.tries += 1;
      }
    } else if (kind === "matching-done") {
      const needed = secret.pairs || [];
      const done = needed.every((pair) => prev.matched.includes(`${pair.leftId}:${pair.rightId}`));
      if (!done) throw new HttpsError("failed-precondition", "まだのこっているペアがあります。");
      response.correct = true;
      if (!prev.correct) gained = 5;
      if (prev.firstCorrect === undefined) prev.firstCorrect = prev.misses === 0;
      prev.correct = true;
      prev.tries += 1;
    } else {
      const result = gradeAnswer(secret, data?.answer);
      response.correct = result.correct;
      response.solution = result.solution || "";
      if (result.correct && !prev.correct) gained = 5;
      if (prev.firstCorrect === undefined) prev.firstCorrect = result.correct;
      prev.correct = prev.correct || result.correct;
      prev.tries += 1;
      if (!result.correct) prev.sample = answerSample(data?.answer);
    }
    if (prev.firstCorrect === undefined) delete prev.firstCorrect;
    prev.type = secret.type;
    prev.vocabKey = secret.vocabKey || "";
    attempts[questionId] = prev;
    const questions = assignment.data().questions || [];
    const correctCount = questions.filter((question) => attempts[question.id]?.correct).length;
    const struggleVocab = [...new Set(questions
      .filter((question) => attempts[question.id]?.firstCorrect === false)
      .map((question) => attempts[question.id]?.vocabKey)
      .filter(Boolean))];
    const patch = {
      format: "pack-v1",
      assignmentId,
      studentId: user.uid,
      attempts,
      correctCount,
      total,
      percent: total ? Math.round((correctCount / total) * 100) : 0,
      struggleVocab,
      timeSpentMs: (prevDoc.timeSpentMs || 0) + (kind === "pair" ? 0 : elapsedMs(data?.elapsedMs)),
      updatedAt: FieldValue.serverTimestamp(),
      completed: Boolean(prevDoc.completed),
    };
    if (!prevDoc.startedAt) patch.startedAt = FieldValue.serverTimestamp();
    tx.set(progressRef, patch, { merge: true });
  });
  if (gained) await db().collection("users").doc(user.uid).set({ xp: FieldValue.increment(gained) }, { merge: true });
  const latest = await db().collection("homeworkProgress").doc(`${assignmentId}_${user.uid}`).get();
  return { ...response, xp: gained, percent: latest.data()?.percent || 0, completed: Boolean(latest.data()?.completed) };
}

exports.finishHomework = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isStudent(user)) throw new HttpsError("permission-denied", "生徒が終了します。");
  const assignmentId = clean(request.data?.assignmentId, 128);
  const assignment = await db().collection("homeworkAssignments").doc(assignmentId).get();
  if (!assignment.exists || !(assignment.data().assigneeIds || []).includes(user.uid)) {
    throw new HttpsError("permission-denied", "この宿題は割り当てられていません。");
  }
  const progressRef = db().collection("homeworkProgress").doc(`${assignmentId}_${user.uid}`);
  const progress = await progressRef.get();
  const data = progress.exists ? progress.data() : {};
  const total = (assignment.data().questions || []).length || data.total || 0;
  const correctCount = data.correctCount || 0;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;
  const bonus = percent === 100 && !data.perfectBonusGranted ? 20 : 0;
  await progressRef.set({
    completed: true,
    finishedAt: FieldValue.serverTimestamp(),
    percent,
    correctCount,
    total,
    perfectBonusGranted: Boolean(data.perfectBonusGranted) || percent === 100,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (bonus) await db().collection("users").doc(user.uid).set({ xp: FieldValue.increment(bonus) }, { merge: true });
  return { completed: true, percent, correct: correctCount, total, struggle: data.struggleVocab || [], xp: bonus };
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
  if (assignment.data().format === "pack-v1") return submitPackAnswer(user, assignment, request.data);
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
  return String(Math.floor(100000 + Math.random() * 900000));
}

const QUIZ_LIMITS = new Set([5, 10, 20, 30, 60, 90, 120]);
const BALL_COLORS = ["#C9EBD8", "#C5DFF5", "#F8D0BC", "#F3E6A6", "#D9CEF2", "#F5C8D6", "#F0B8B0", "#BFE8E2"];
const BAD_NAMES = new Set(["ばか", "あほ", "くそ", "しね", "fuck", "shit", "bitch"]);

function quizTimeLimit(value) {
  const seconds = Number(value);
  return QUIZ_LIMITS.has(seconds) ? seconds : 20;
}

function quizQuestions(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 30).map((row) => {
    const type = clean(row?.type, 24) || "multipleChoice";
    let choices = (Array.isArray(row?.choices) ? row.choices : [])
      .map((choice) => clean(choice, 80))
      .filter(Boolean)
      .slice(0, 4);
    if ((type === "multipleChoice" || type === "trueFalse") && choices.length >= 2) {
      choices = shuffle(choices);
    } else if (type === "trueFalse" && !choices.length) {
      choices = shuffle(["○ ほんとう", "× うそ"]);
    }
    return {
      type,
      prompt: clean(row?.prompt, 160),
      choices,
      answer: clean(row?.answer, 80),
      answers: (Array.isArray(row?.answers) ? row.answers : []).map((item) => clean(item, 80)).filter(Boolean).slice(0, 8),
      pairs: Array.isArray(row?.pairs) ? row.pairs : undefined,
      words: Array.isArray(row?.words) ? row.words.map((word) => clean(word, 40)).filter(Boolean) : undefined,
      timeLimitSec: quizTimeLimit(row?.timeLimitSec),
      points: Math.min(1000, Math.max(0, Number(row?.points) || 1000)),
    };
  }).filter((row) => {
    if (!row.prompt) return false;
    if (row.type === "typeAnswer") return (row.answers.length || row.answer);
    if (row.type === "wordOrder") return (row.words || []).length >= 2 && row.answer;
    if (row.type === "trueFalse") return true;
    return row.choices.length >= 2 && row.choices.some((choice) => norm(choice) === norm(row.answer) || row.answers.some((item) => norm(item) === norm(choice)));
  });
}

function publicQuestions(questions) {
  return questions.map((row) => {
    const type = row.type || "multipleChoice";
    let choices = row.choices || [];
    // Randomize MC / T-F button positions so the correct answer is not always top-left (red).
    if ((type === "multipleChoice" || type === "trueFalse") && choices.length >= 2) {
      choices = shuffle(choices);
    }
    return {
      type,
      prompt: row.prompt,
      choices,
      pairs: row.pairs || null,
      words: row.words || null,
      timeLimitSec: row.timeLimitSec,
      points: row.points || 1000,
    };
  });
}

function answerKey(questions) {
  return questions.map((row) => ({
    answer: row.answer || "",
    answers: row.answers?.length ? row.answers : (row.answer ? [row.answer] : []),
  }));
}

async function loadAnswerKey(tx, roomRef, data) {
  if (Array.isArray(data.answerKey) && data.answerKey.length) return data.answerKey;
  const secure = await tx.get(roomRef.collection("secure").doc("answers"));
  if (secure.exists) return secure.data().answerKey || [];
  return (data.questions || []).map((row) => ({ answer: row.answer || "", answers: row.answers || [] }));
}

function withAnswers(data, key) {
  const questions = (data.questions || []).map((row, index) => ({
    ...row,
    answer: key[index]?.answer || row.answer || "",
    answers: key[index]?.answers || row.answers || [],
  }));
  return { ...data, questions };
}

function introPatch(data, index) {
  return {
    status: "intro",
    questionIndex: index,
    introEndsAt: Date.now() + 3000,
    questionEndsAt: null,
    answeredCount: 0,
    choiceCounts: [],
    revealedAnswer: null,
    acceptingJoins: false,
  };
}

function questionPatch(data) {
  const index = Number(data.questionIndex);
  const seconds = quizTimeLimit((data.questions || [])[index]?.timeLimitSec);
  return {
    status: "question",
    introEndsAt: null,
    questionEndsAt: Date.now() + seconds * 1000,
    answeredCount: 0,
    choiceCounts: [],
    revealedAnswer: null,
  };
}

function nextAfterLeaderboard(data) {
  const questions = data.questions || [];
  const next = Number(data.questionIndex) + 1;
  if (next >= questions.length) {
    return {
      status: "final_results",
      questionIndex: Number(data.questionIndex),
      questionEndsAt: null,
      introEndsAt: null,
      answeredCount: 0,
      choiceCounts: [],
    };
  }
  return introPatch(data, next);
}

function sanitizeNickname(value) {
  const name = clean(value, 12).replace(/\s+/g, " ");
  if (!name || name.length < 1) throw new HttpsError("invalid-argument", "おなまえを入れてね。");
  if (BAD_NAMES.has(name.toLowerCase()) || BAD_NAMES.has(name)) {
    throw new HttpsError("invalid-argument", "そのおなまえはつかえないよ。");
  }
  return name;
}

function ballStyle(seed) {
  const color = BALL_COLORS[Math.abs(Number(seed) || Date.now()) % BALL_COLORS.length];
  const size = 60 + (Math.abs(Number(seed) || 7) % 51);
  return { ballColor: color, ballSize: size };
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

function revealPatch(data, docs, extra, key) {
  const index = Number(data.questionIndex);
  const answer = key?.[index]?.answer || (data.questions || [])[index]?.answer || "";
  return {
    status: "reveal",
    questionEndsAt: null,
    introEndsAt: null,
    choiceCounts: tallyChoices(data, docs, extra),
    revealedAnswer: answer,
  };
}

async function rankingFor(tx, roomRef, hostId) {
  const snap = await tx.get(roomRef.collection("players"));
  return snap.docs
    .filter((item) => item.id !== hostId)
    .map((item) => {
      const row = item.data() || {};
      return {
        id: item.id,
        name: clean(row.name, 40) || "プレイヤー",
        score: Number(row.score || 0),
        correctCount: Number(row.correctCount || 0),
        ballColor: clean(row.ballColor, 16) || "",
        ballSize: Number(row.ballSize || 0) || undefined,
      };
    })
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
    introEndsAt: null,
    playerCount: 0,
    answeredCount: 0,
    questions: publicQuestions(questions),
    acceptingJoins: true,
    revealedAnswer: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  await ref.collection("secure").doc("answers").set({ answerKey: answerKey(questions) });
  return { id: ref.id, code };
});

exports.lookupCollabRoom = onCall({ region: REGION }, async (request) => {
  const code = clean(request.data?.code, 8).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "6けたのコードを入れてね。");
  const snap = await db().collection("quizRooms").where("code", "==", code).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "そのコードのルームはないよ。");
  const data = snap.docs[0].data();
  if (data.status !== "lobby" || data.acceptingJoins === false) {
    throw new HttpsError("failed-precondition", "このルームはもう参加できないよ。");
  }
  if (data.pinExpiresAt && Date.now() > Number(data.pinExpiresAt)) {
    throw new HttpsError("failed-precondition", "このコードのじかんが切れたよ。");
  }
  return { id: snap.docs[0].id, title: data.title || "COllAB", code };
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
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const uid = request.auth.uid;
  let profile = null;
  try {
    profile = await callerUser(request);
  } catch {
    profile = { uid, displayName: "" };
  }
  const code = clean(request.data?.code, 8).replace(/\s+/g, "");
  const nickname = request.data?.nickname != null
    ? sanitizeNickname(request.data.nickname)
    : clean(profile.displayName, 12) || "プレイヤー";
  const snap = await db().collection("quizRooms").where("code", "==", code).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "そのコードのルームはないよ。");
  const roomRef = snap.docs[0].ref;
  const title = snap.docs[0].data().title;
  let ball = null;
  await db().runTransaction(async (tx) => {
    const room = await tx.get(roomRef);
    if (!room.exists) throw new HttpsError("not-found", "そのコードのルームはないよ。");
    const data = room.data();
    if (data.status !== "lobby" || data.acceptingJoins === false) {
      throw new HttpsError("failed-precondition", "このルームはもう参加できないよ。");
    }
    if (uid === data.hostId) throw new HttpsError("failed-precondition", "ホストは参加者として入れません。");
    const playerRef = roomRef.collection("players").doc(uid);
    const player = await tx.get(playerRef);
    if (!player.exists) {
      tx.set(roomRef, { playerCount: FieldValue.increment(1) }, { merge: true });
      ball = ballStyle(Date.now() + uid.length);
      tx.set(playerRef, {
        name: nickname,
        score: 0,
        answeredIndex: -1,
        correctCount: 0,
        ...ball,
        joinedAt: FieldValue.serverTimestamp(),
      });
    } else {
      ball = {
        ballColor: player.data().ballColor || ballStyle(uid.length).ballColor,
        ballSize: player.data().ballSize || ballStyle(uid.length).ballSize,
      };
      tx.set(playerRef, {
        name: nickname,
        ballColor: ball.ballColor,
        ballSize: ball.ballSize,
      }, { merge: true });
    }
  });
  return { id: roomRef.id, title, name: nickname, ...ball };
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
    if (["done", "completed"].includes(data.status)) {
      return { status: data.status, questionIndex: Number(data.questionIndex), advanced: false };
    }
    if (expected !== null && !["lobby", "leaderboard", "final_results"].includes(data.status)
      && Number(data.questionIndex) !== expected) {
      return { status: data.status, questionIndex: Number(data.questionIndex), advanced: false };
    }
    const key = await loadAnswerKey(tx, roomRef, data);
    const full = withAnswers(data, key);
    if (data.status === "lobby") {
      const patch = introPatch(data, 0);
      tx.set(roomRef, patch, { merge: true });
      return { ...patch, advanced: true };
    }
    if (data.status === "question") {
      const playersSnap = await tx.get(roomRef.collection("players"));
      const patch = revealPatch(full, playersSnap.docs, null, key);
      tx.set(roomRef, patch, { merge: true });
      return { ...patch, questionIndex: Number(data.questionIndex), advanced: true };
    }
    if (data.status === "reveal") {
      const ranking = await rankingFor(tx, roomRef, data.hostId);
      const patch = {
        status: "leaderboard",
        ranking,
        questionEndsAt: null,
        introEndsAt: null,
      };
      tx.set(roomRef, patch, { merge: true });
      return { ...patch, questionIndex: Number(data.questionIndex), advanced: true };
    }
    if (data.status === "leaderboard") {
      const patch = nextAfterLeaderboard(data);
      if (patch.status === "final_results") {
        patch.ranking = data.ranking || await rankingFor(tx, roomRef, data.hostId);
      }
      tx.set(roomRef, patch, { merge: true });
      return { ...patch, advanced: true };
    }
    if (data.status === "final_results") {
      const patch = { status: "done", acceptingJoins: false };
      tx.set(roomRef, patch, { merge: true });
      return { ...patch, questionIndex: Number(data.questionIndex), advanced: true };
    }
    return { status: data.status, questionIndex: Number(data.questionIndex), advanced: false };
  });
});

exports.syncQuizRoom = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request).catch(async () => {
    if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
    return { uid: request.auth.uid };
  });
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
    const key = await loadAnswerKey(tx, roomRef, data);
    const full = withAnswers(data, key);
    if (data.status === "intro" && Number(data.questionIndex) === expected) {
      const ends = Number(data.introEndsAt || 0);
      if (ends > 0 && Date.now() >= ends) {
        const patch = questionPatch(data);
        tx.set(roomRef, patch, { merge: true });
        return { ...patch, questionIndex: expected, advanced: true };
      }
      return { status: data.status, questionIndex: expected, advanced: false };
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
    const patch = revealPatch(full, playersSnap.docs, null, key);
    tx.set(roomRef, patch, { merge: true });
    return { ...patch, questionIndex: expected, advanced: true };
  });
});

exports.submitQuizAnswer = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  let user;
  try {
    user = await callerUser(request);
  } catch {
    user = { uid: request.auth.uid };
  }
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
    if (Number(player.data().answeredIndex) === index) return { correct: false, duplicate: true, pending: true };
    const ends = Number(data.questionEndsAt || 0);
    // Small grace so a tap at the buzzer still counts before reveal lands.
    const expired = ends > 0 && Date.now() > ends + 1500;
    const key = await loadAnswerKey(tx, roomRef, data);
    const full = withAnswers(data, key);
    const question = (full.questions || [])[index];
    const choice = clean(request.data?.choice, 80);
    const typed = clean(request.data?.typed, 160);
    const multi = Array.isArray(request.data?.choices) ? request.data.choices.map((item) => clean(item, 80)).filter(Boolean) : [];
    let correct = false;
    if (!expired) {
      if ((question?.type || "multipleChoice") === "typeAnswer") {
        const answers = (question.answers || [question.answer]).map(norm);
        correct = answers.includes(norm(typed || choice));
      } else if ((question?.type || "") === "wordOrder") {
        correct = norm(typed || choice) === norm(question?.answer);
      } else if (Array.isArray(question?.answers) && question.answers.length > 1) {
        const need = question.answers.map(norm).sort().join("|");
        const got = multi.map(norm).sort().join("|");
        correct = need === got && multi.length > 0;
      } else {
        correct = norm(choice || typed) === norm(question?.answer);
      }
    }
    const base = Math.min(1000, Math.max(0, Number(question?.points) || 1000));
    const limitMs = Math.max(1000, (Number(question?.timeLimitSec) || 20) * 1000);
    const leftRatio = ends > 0 ? Math.max(0, Math.min(1, (ends - Date.now()) / limitMs)) : 0;
    const speedBonus = correct ? Math.round(500 * leftRatio) : 0;
    const gained = correct ? base + speedBonus : 0;
    const counts = user.uid === data.hostId ? null : {
      answeredCount: Number(data.answeredCount || 0) + (expired ? 0 : 1),
      playerCount: Number(data.playerCount || 0),
    };
    const closing = expired || (counts && counts.playerCount > 0 && counts.answeredCount >= counts.playerCount);
    const playersSnap = closing ? await tx.get(roomRef.collection("players")) : null;
    if (expired) {
      tx.set(roomRef, revealPatch(full, playersSnap.docs, null, key), { merge: true });
      return { correct: false, expired: true, pending: true };
    }
    const roomPatch = {};
    if (counts && !closing) roomPatch.answeredCount = counts.answeredCount;
    if (closing) Object.assign(roomPatch, revealPatch(full, playersSnap.docs, { id: user.uid, choice: choice || typed }, key));
    tx.set(playerRef, {
      answeredIndex: index,
      choice: choice || typed || multi.join(" | "),
      score: FieldValue.increment(gained),
      correctCount: FieldValue.increment(correct ? 1 : 0),
      lastPoints: gained,
    }, { merge: true });
    if (correct && profileExists(user)) {
      tx.set(db().collection("users").doc(user.uid), { xp: FieldValue.increment(2) }, { merge: true });
    }
    if (Object.keys(roomPatch).length) tx.set(roomRef, roomPatch, { merge: true });
    return { correct, points: gained, speedBonus, pending: true };
  });
});

function profileExists(user) {
  return Boolean(user && user.role !== undefined);
}

exports.markInboxRead = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  const itemId = clean(request.data?.itemId, 128);
  await db().collection("inbox").doc(user.uid).collection("items").doc(itemId).set({ read: true }, { merge: true });
  return { ok: true };
});
