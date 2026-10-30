const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const REGION = "asia-northeast1";
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const GAMES = new Set(["minecraft", "roblox"]);
const VISIBILITY = new Set(["private", "published", "unlisted"]);
const QUIZ_LIMITS = new Set([5, 10, 20, 30, 60, 90, 120]);
const CATEGORIES = new Set([
  "animals", "food", "colors", "alphabet", "school", "conversation", "other",
]);

function db() {
  return getFirestore();
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function callerUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const snap = await db().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "アカウントが見つかりません。");
  return { uid: request.auth.uid, email: request.auth.token?.email || "", ...snap.data() };
}

function isTeacher(user) {
  return user.role === "admin" || user.role === "owner";
}

function isOwner(user) {
  return user.role === "owner" && user.email === "growbuddy@gc.com";
}

function quizTimeLimit(value) {
  const seconds = Number(value);
  return QUIZ_LIMITS.has(seconds) ? seconds : 20;
}

function quizQuestions(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 30).map((row) => {
    const type = clean(row?.type, 24) || "multipleChoice";
    const prompt = clean(row?.prompt, 160);
    const timeLimitSec = quizTimeLimit(row?.timeLimitSec);
    const points = Math.min(1000, Math.max(0, Number(row?.points) || 100));
    if (type === "trueFalse") {
      const answer = clean(row?.answer, 20) || "true";
      return {
        type,
        prompt,
        choices: ["○ ほんとう", "× うそ"],
        answer: answer === "false" || answer === "× うそ" ? "× うそ" : "○ ほんとう",
        timeLimitSec,
        points,
      };
    }
    if (type === "typeAnswer") {
      const answers = (Array.isArray(row?.answers) ? row.answers : [row?.answer])
        .map((item) => clean(item, 80))
        .filter(Boolean)
        .slice(0, 8);
      if (!prompt || !answers.length) return null;
      return { type, prompt, choices: [], answer: answers[0], answers, timeLimitSec, points };
    }
    if (type === "matching") {
      const pairs = (Array.isArray(row?.pairs) ? row.pairs : [])
        .map((pair) => ({ left: clean(pair?.left, 40), right: clean(pair?.right, 40) }))
        .filter((pair) => pair.left && pair.right)
        .slice(0, 8);
      if (!prompt || pairs.length < 2) return null;
      return { type, prompt, pairs, choices: pairs.map((pair) => pair.right), answer: "", timeLimitSec, points };
    }
    if (type === "wordOrder") {
      const words = (Array.isArray(row?.words) ? row.words : [])
        .map((word) => clean(word, 40))
        .filter(Boolean)
        .slice(0, 12);
      const answer = clean(row?.answer, 160) || words.join(" ");
      if (!prompt || words.length < 2) return null;
      return { type, prompt, words, choices: words, answer, timeLimitSec, points };
    }
    const choices = (Array.isArray(row?.choices) ? row.choices : [])
      .map((choice) => clean(choice, 80))
      .filter(Boolean)
      .slice(0, 4);
    const answer = clean(row?.answer, 80);
    const answers = (Array.isArray(row?.answers) ? row.answers : [])
      .map((item) => clean(item, 80))
      .filter(Boolean);
    if (!prompt || choices.length < 2) return null;
    const correct = answers.length
      ? answers.filter((item) => choices.some((choice) => norm(choice) === norm(item)))
      : (choices.some((choice) => norm(choice) === norm(answer)) ? [answer] : []);
    if (!correct.length) return null;
    return {
      type: "multipleChoice",
      prompt,
      choices,
      answer: correct[0],
      answers: correct,
      timeLimitSec,
      points,
      mediaUrl: clean(row?.mediaUrl, 500) || null,
    };
  }).filter(Boolean);
}

function levelOf(value) {
  const level = clean(value, 24).toLowerCase();
  return LEVELS.has(level) ? level : "beginner";
}

function gameOf(value) {
  const game = clean(value, 24).toLowerCase();
  return GAMES.has(game) ? game : "minecraft";
}

function categoryOf(value) {
  const category = clean(value, 40).toLowerCase();
  if (!category) return "";
  return CATEGORIES.has(category) ? category : clean(value, 40);
}

function visibilityOf(value, fallback = "private") {
  const visibility = clean(value, 24).toLowerCase();
  return VISIBILITY.has(visibility) ? visibility : fallback;
}

function tagsOf(raw) {
  return (Array.isArray(raw) ? raw : String(raw || "").split(/[,、\s]+/))
    .map((tag) => clean(tag, 24))
    .filter(Boolean)
    .slice(0, 12);
}

function coverColorOf(value) {
  const color = clean(value, 20);
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "";
}

function templateMeta(data = {}, questions = []) {
  return {
    title: clean(data.title, 80) || "COllAB",
    description: clean(data.description, 400),
    level: levelOf(data.level),
    game: gameOf(data.game),
    category: categoryOf(data.category),
    coverUrl: clean(data.coverUrl, 500),
    coverColor: coverColorOf(data.coverColor) || "#FF5A29",
    coverEmoji: clean(data.coverEmoji, 8) || "🎮",
    tags: tagsOf(data.tags),
    questionCount: questions.length,
    questions,
  };
}

function publicFields(id, data) {
  return {
    id,
    title: data.title || "COllAB",
    description: data.description || "",
    level: data.level || "beginner",
    game: data.game || "minecraft",
    category: data.category || "",
    coverUrl: data.coverUrl || "",
    coverColor: data.coverColor || "#FF5A29",
    coverEmoji: data.coverEmoji || "🎮",
    tags: data.tags || [],
    questionCount: Number(data.questionCount || (data.questions || []).length || 0),
    usageCount: Number(data.usageCount || 0),
    visibility: data.visibility || "private",
    official: Boolean(data.official),
    ownerId: data.ownerId || "",
    ownerName: data.ownerName || "",
    updatedAt: data.updatedAt || null,
    publishedAt: data.publishedAt || null,
    sourceTemplateId: data.sourceTemplateId || "",
  };
}

function canReadTemplate(user, data) {
  if (!data) return false;
  if (data.ownerId === user.uid || isOwner(user)) return true;
  if (!isTeacher(user)) return false;
  return data.visibility === "published" || data.visibility === "unlisted";
}

exports.createCollabTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが作成できます。");
  const title = clean(request.data?.title, 80);
  if (!title) throw new HttpsError("invalid-argument", "タイトルを入力してください。");
  const level = levelOf(request.data?.level);
  const game = gameOf(request.data?.game);
  const category = categoryOf(request.data?.category);
  const incoming = Array.isArray(request.data?.questions) ? request.data.questions : [];
  const questions = incoming.length
    ? quizQuestions(incoming)
    : quizQuestions([{ prompt: "新しい問題", choices: ["答え1", "答え2", "答え3", "答え4"], answer: "答え1", timeLimitSec: 20 }]);
  const ref = db().collection("quizTemplates").doc();
  const payload = {
    ...templateMeta({ title, level, game, category, coverEmoji: request.data?.coverEmoji, coverColor: request.data?.coverColor }, questions),
    ownerId: user.uid,
    ownerName: clean(user.displayName, 40) || "先生",
    visibility: "private",
    official: false,
    usageCount: 0,
    sourceTemplateId: "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  return { id: ref.id, ...publicFields(ref.id, payload) };
});

exports.saveCollabTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが保存できます。");
  const id = clean(request.data?.id, 128);
  if (!id) throw new HttpsError("invalid-argument", "テンプレートが不明です。");
  const ref = db().collection("quizTemplates").doc(id);
  const existing = await ref.get();
  if (!existing.exists || existing.data().ownerId !== user.uid) {
    throw new HttpsError("permission-denied", "このテンプレートは保存できません。");
  }
  const questions = quizQuestions(request.data?.questions);
  if (!questions.length) throw new HttpsError("invalid-argument", "問題を1つ以上入れてください。");
  const prev = existing.data();
  const meta = templateMeta({
    title: request.data?.title ?? prev.title,
    description: request.data?.description ?? prev.description,
    level: request.data?.level ?? prev.level,
    game: request.data?.game ?? prev.game,
    category: request.data?.category ?? prev.category,
    coverUrl: request.data?.coverUrl ?? prev.coverUrl,
    coverColor: request.data?.coverColor ?? prev.coverColor,
    coverEmoji: request.data?.coverEmoji ?? prev.coverEmoji,
    tags: request.data?.tags ?? prev.tags,
  }, questions);
  const visibility = request.data?.visibility
    ? visibilityOf(request.data.visibility, prev.visibility || "private")
    : (prev.visibility || "private");
  const patch = {
    ...meta,
    visibility,
    ownerName: clean(user.displayName, 40) || prev.ownerName || "先生",
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (visibility === "published" && prev.visibility !== "published") {
    patch.publishedAt = FieldValue.serverTimestamp();
  }
  if (visibility === "private") {
    patch.publishedAt = null;
  }
  await ref.set(patch, { merge: true });
  return { id, ...publicFields(id, { ...prev, ...patch }) };
});

exports.publishCollabTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが公開できます。");
  const id = clean(request.data?.id, 128);
  const ref = db().collection("quizTemplates").doc(id);
  const existing = await ref.get();
  if (!existing.exists || existing.data().ownerId !== user.uid) {
    throw new HttpsError("permission-denied", "このテンプレートは公開できません。");
  }
  const prev = existing.data();
  const questions = quizQuestions(request.data?.questions || prev.questions);
  if (!questions.length) throw new HttpsError("invalid-argument", "問題を1つ以上入れてください。");
  const visibility = visibilityOf(request.data?.visibility, "published");
  if (visibility === "private") {
    throw new HttpsError("invalid-argument", "公開するには published か unlisted を選んでください。");
  }
  const meta = templateMeta({
    title: request.data?.title ?? prev.title,
    description: request.data?.description ?? prev.description,
    level: request.data?.level ?? prev.level,
    game: request.data?.game ?? prev.game,
    category: request.data?.category ?? prev.category,
    coverUrl: request.data?.coverUrl ?? prev.coverUrl,
    coverColor: request.data?.coverColor ?? prev.coverColor,
    coverEmoji: request.data?.coverEmoji ?? prev.coverEmoji,
    tags: request.data?.tags ?? prev.tags,
  }, questions);
  const patch = {
    ...meta,
    visibility,
    publishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(patch, { merge: true });
  return { id, ...publicFields(id, { ...prev, ...patch }) };
});

exports.unpublishCollabTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが非公開にできます。");
  const id = clean(request.data?.id, 128);
  const ref = db().collection("quizTemplates").doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new HttpsError("not-found", "テンプレートが見つかりません。");
  const data = existing.data();
  if (data.ownerId !== user.uid && !isOwner(user)) {
    throw new HttpsError("permission-denied", "このテンプレートは非公開にできません。");
  }
  await ref.set({
    visibility: "private",
    publishedAt: null,
    official: isOwner(user) ? false : Boolean(data.official),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id, ok: true };
});

exports.duplicateCollabTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけがコピーできます。");
  const id = clean(request.data?.id, 128);
  const source = await db().collection("quizTemplates").doc(id).get();
  if (!source.exists) throw new HttpsError("not-found", "テンプレートが見つかりません。");
  const data = source.data();
  if (!canReadTemplate(user, data)) {
    throw new HttpsError("permission-denied", "このテンプレートは使えません。");
  }
  const questions = quizQuestions(data.questions);
  const ref = db().collection("quizTemplates").doc();
  const payload = {
    ...templateMeta({
      title: `${clean(data.title, 70) || "COllAB"} のコピー`,
      description: data.description,
      level: data.level,
      game: data.game,
      category: data.category,
      coverUrl: data.coverUrl,
      coverColor: data.coverColor,
      coverEmoji: data.coverEmoji,
      tags: data.tags,
    }, questions),
    ownerId: user.uid,
    ownerName: clean(user.displayName, 40) || "先生",
    visibility: "private",
    official: false,
    usageCount: 0,
    sourceTemplateId: id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  await source.ref.set({ usageCount: FieldValue.increment(1) }, { merge: true });
  return { id: ref.id, ...publicFields(ref.id, payload), questions };
});

exports.deleteCollabTemplate = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが削除できます。");
  const id = clean(request.data?.id, 128);
  const ref = db().collection("quizTemplates").doc(id);
  const existing = await ref.get();
  if (!existing.exists || (existing.data().ownerId !== user.uid && !isOwner(user))) {
    throw new HttpsError("permission-denied", "このテンプレートは削除できません。");
  }
  await ref.delete();
  return { ok: true };
});

exports.setCollabOfficial = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isOwner(user)) throw new HttpsError("permission-denied", "オーナーだけが設定できます。");
  const id = clean(request.data?.id, 128);
  const official = Boolean(request.data?.official);
  const ref = db().collection("quizTemplates").doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new HttpsError("not-found", "テンプレートが見つかりません。");
  await ref.set({
    official,
    visibility: official ? "published" : (existing.data().visibility || "private"),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id, official };
});

exports.toggleCollabFavorite = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけがお気に入りできます。");
  const id = clean(request.data?.id, 128);
  const ref = db().collection("users").doc(user.uid).collection("collabFavorites").doc(id);
  const existing = await ref.get();
  if (existing.exists) {
    await ref.delete();
    return { id, favorited: false };
  }
  await ref.set({ templateId: id, createdAt: FieldValue.serverTimestamp() });
  return { id, favorited: true };
});

exports.startCollabRoom = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生がホストします。");
  const templateId = clean(request.data?.templateId, 128);
  let title = clean(request.data?.title, 80);
  let questions = quizQuestions(request.data?.questions);
  if (templateId) {
    const template = await db().collection("quizTemplates").doc(templateId).get();
    if (!template.exists) throw new HttpsError("not-found", "テンプレートが見つかりません。");
    const data = template.data();
    if (!canReadTemplate(user, data)) {
      throw new HttpsError("permission-denied", "このテンプレートは開始できません。");
    }
    title = title || data.title || "COllAB";
    questions = questions.length ? questions : quizQuestions(data.questions);
    await template.ref.set({ usageCount: FieldValue.increment(1) }, { merge: true });
  }
  if (!questions.length) throw new HttpsError("invalid-argument", "問題を1つ以上入れてください。");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const publicQuestions = questions.map((row) => ({
    type: row.type || "multipleChoice",
    prompt: row.prompt,
    choices: row.choices || [],
    pairs: row.pairs || null,
    words: row.words || null,
    timeLimitSec: row.timeLimitSec,
    points: row.points || 1000,
  }));
  const answerKey = questions.map((row) => ({
    answer: row.answer || "",
    answers: row.answers?.length ? row.answers : (row.answer ? [row.answer] : []),
  }));
  const ref = db().collection("quizRooms").doc();
  await ref.set({
    hostId: user.uid,
    code,
    title: title || "COllAB",
    status: "lobby",
    questionIndex: -1,
    questionEndsAt: null,
    introEndsAt: null,
    playerCount: 0,
    answeredCount: 0,
    choiceCounts: [],
    questions: publicQuestions,
    acceptingJoins: true,
    revealedAnswer: null,
    templateId: templateId || "",
    pinExpiresAt: Date.now() + 6 * 60 * 60 * 1000,
    createdAt: FieldValue.serverTimestamp(),
  });
  await ref.collection("secure").doc("answers").set({ answerKey });
  return { id: ref.id, code };
});

exports.saveCollabSession = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが結果を保存できます。");
  const roomId = clean(request.data?.roomId, 128);
  const room = await db().collection("quizRooms").doc(roomId).get();
  if (!room.exists || room.data().hostId !== user.uid) {
    throw new HttpsError("permission-denied", "このルームの結果は保存できません。");
  }
  const data = room.data();
  if (!["done", "final_results"].includes(data.status)) {
    throw new HttpsError("failed-precondition", "まだ終わっていません。");
  }
  const players = await room.ref.collection("players").get();
  const ranking = (data.ranking || players.docs
    .filter((item) => item.id !== data.hostId)
    .map((item) => ({
      id: item.id,
      name: clean(item.data().name, 40) || "プレイヤー",
      score: Number(item.data().score || 0),
      correctCount: Number(item.data().correctCount || 0),
      ballColor: clean(item.data().ballColor, 16) || "",
    }))
    .sort((a, b) => b.score - a.score));
  const sessionRef = db().collection("quizSessions").doc(roomId);
  await sessionRef.set({
    roomId,
    hostId: user.uid,
    templateId: data.templateId || "",
    title: data.title || "COllAB",
    questionCount: (data.questions || []).length,
    participantCount: ranking.length,
    ranking,
    questions: (data.questions || []).map((question) => ({
      prompt: question.prompt,
      type: question.type || "multipleChoice",
      answer: question.answer || "",
    })),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: sessionRef.id };
});

const OFFICIAL_SEEDS = [
  {
    key: "animals",
    title: "どうぶつ英語クイズ",
    category: "animals",
    coverEmoji: "🐱",
    coverColor: "#FF7373",
    tags: ["animals", "どうぶつ", "beginner"],
    questions: [
      { prompt: "cat は？", choices: ["ねこ", "いぬ", "さかな", "とり"], answer: "ねこ" },
      { prompt: "dog は？", choices: ["ねこ", "いぬ", "うま", "うさぎ"], answer: "いぬ" },
      { prompt: "fish は？", choices: ["さかな", "とり", "かめ", "へび"], answer: "さかな" },
      { prompt: "bird は？", choices: ["とり", "ねこ", "いぬ", "さかな"], answer: "とり" },
    ],
  },
  {
    key: "food",
    title: "たべもの英語クイズ",
    category: "food",
    coverEmoji: "🍎",
    coverColor: "#FF5A29",
    tags: ["food", "たべもの"],
    questions: [
      { prompt: "apple は？", choices: ["りんご", "バナナ", "みず", "パン"], answer: "りんご" },
      { prompt: "bread は？", choices: ["パン", "ごはん", "にく", "たまご"], answer: "パン" },
      { prompt: "water は？", choices: ["みず", "ミルク", "ジュース", "おちゃ"], answer: "みず" },
      { prompt: "egg は？", choices: ["たまご", "チーズ", "にく", "さかな"], answer: "たまご" },
    ],
  },
  {
    key: "colors",
    title: "いろをおぼえよう",
    category: "colors",
    coverEmoji: "🎨",
    coverColor: "#B59BFF",
    tags: ["colors", "いろ"],
    questions: [
      { prompt: "red は？", choices: ["あか", "あお", "きいろ", "みどり"], answer: "あか" },
      { prompt: "blue は？", choices: ["あお", "あか", "しろ", "くろ"], answer: "あお" },
      { prompt: "yellow は？", choices: ["きいろ", "みどり", "むらさき", "ピンク"], answer: "きいろ" },
      { prompt: "green は？", choices: ["みどり", "あお", "ちゃいろ", "オレンジ"], answer: "みどり" },
    ],
  },
  {
    key: "alphabet",
    title: "ABCチャレンジ",
    category: "alphabet",
    coverEmoji: "🔤",
    coverColor: "#67B8FF",
    tags: ["alphabet", "abc"],
    questions: [
      { prompt: "A のつぎは？", choices: ["B", "C", "D", "E"], answer: "B" },
      { prompt: "C のまえは？", choices: ["B", "D", "A", "E"], answer: "B" },
      { prompt: "Z のまえは？", choices: ["Y", "X", "W", "V"], answer: "Y" },
      { prompt: "apple のいちばん最初の文字は？", choices: ["A", "P", "L", "E"], answer: "A" },
    ],
  },
  {
    key: "school",
    title: "がっこうの英語",
    category: "school",
    coverEmoji: "🏫",
    coverColor: "#75D7A3",
    tags: ["school", "がっこう"],
    questions: [
      { prompt: "teacher は？", choices: ["先生", "生徒", "学校", "机"], answer: "先生" },
      { prompt: "student は？", choices: ["生徒", "先生", "本", "えんぴつ"], answer: "生徒" },
      { prompt: "book は？", choices: ["本", "かばん", "いす", "窓"], answer: "本" },
      { prompt: "pencil は？", choices: ["えんぴつ", "消しゴム", "ノート", "定規"], answer: "えんぴつ" },
    ],
  },
  {
    key: "conversation",
    title: "えいかいわチャレンジ",
    category: "conversation",
    coverEmoji: "💬",
    coverColor: "#FFD85A",
    tags: ["conversation", "あいさつ"],
    questions: [
      { prompt: "Hello の意味は？", choices: ["こんにちは", "さようなら", "ありがとう", "すみません"], answer: "こんにちは" },
      { prompt: "Thank you の意味は？", choices: ["ありがとう", "おはよう", "おやすみ", "がんばって"], answer: "ありがとう" },
      { prompt: "Good morning の意味は？", choices: ["おはよう", "こんにちは", "こんばんは", "さようなら"], answer: "おはよう" },
      { prompt: "See you の意味は？", choices: ["またね", "はじめまして", "どうぞ", "元気？"], answer: "またね" },
    ],
  },
];

exports.seedOfficialCollabTemplates = onCall({ region: REGION }, async (request) => {
  const user = await callerUser(request);
  if (!isOwner(user)) throw new HttpsError("permission-denied", "オーナーだけが実行できます。");
  const created = [];
  for (const seed of OFFICIAL_SEEDS) {
    const id = `official_${seed.key}`;
    const ref = db().collection("quizTemplates").doc(id);
    const existing = await ref.get();
    if (existing.exists) continue;
    const questions = quizQuestions(seed.questions.map((row) => ({ ...row, type: "multipleChoice", timeLimitSec: 20 })));
    const payload = {
      ...templateMeta({
        title: seed.title,
        description: "公式 COllAB テンプレート",
        level: "beginner",
        game: "minecraft",
        category: seed.category,
        coverEmoji: seed.coverEmoji,
        coverColor: seed.coverColor,
        tags: seed.tags,
      }, questions),
      ownerId: user.uid,
      ownerName: "COllAB公式",
      visibility: "published",
      official: true,
      usageCount: 0,
      sourceTemplateId: "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      publishedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(payload);
    created.push(id);
  }
  return { created, total: OFFICIAL_SEEDS.length };
});
