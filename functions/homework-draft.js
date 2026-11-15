/**
 * Turn a teacher's pasted English lesson into a pack-v1 homework draft.
 * The model supplies Japanese meanings and wrong answers. Question shape is built here.
 * Nothing is saved or assigned.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  buildLessonQuestions,
  preparePack,
  questionsForEditor,
  lessonTranslationRows,
  lessonRowsFromConfirmed,
} = require("./homework-engine");
const { getAccessToken } = require("./homework-tts");

const REGION = "asia-northeast1";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "ai-sensei-8849b";
const VERTEX_LOCATION = "us-central1";
const MODEL = "gemini-2.5-flash";
const MAX_LINES = 12;

function normEn(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function lessonInputs(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const lines = [];
  const seen = new Set();
  raw.forEach((item) => {
    if (lines.length >= MAX_LINES) return;
    const text = String(item || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!text || !/[A-Za-z]/.test(text)) return;
    const key = normEn(text);
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(text);
  });
  return lines;
}

async function callerUser(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const { getFirestore } = require("firebase-admin/firestore");
  const snap = await getFirestore().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "アカウントが見つかりません。");
  return {
    uid: request.auth.uid,
    ...snap.data(),
    email: request.auth.token?.email || snap.data()?.email || "",
  };
}

function isTeacher(user) {
  return user.role === "admin" || user.role === "owner";
}

function lessonPrompt(lines) {
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  return `You write homework for Japanese elementary school students learning English.
Read the pasted lines as one lesson. Neighboring lines are the topic, so choose the classroom or game meaning (iron beside wood and stone is てつ, not an iron for clothes).
For each line, in the same order, return:
- ja: a short natural meaning in hiragana, classroom register, at most 40 characters. Keep names as names.
- distractorsEn: exactly 3 English options that change the meaning. Do not repeat the line or each other. Only one option may be correct.
- distractorsJa: exactly 3 Japanese options that change the meaning. Do not repeat ja or each other.
Do not rewrite the English. Do not add lines.
Return JSON only: {"lines":[{"en":"","ja":"","distractorsEn":["","",""],"distractorsJa":["","",""]}]}

Lines:
${numbered}`;
}

function translationPrompt(lines) {
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  return `You translate English lesson lines for Japanese elementary school students.
Read the pasted lines as one lesson. Neighboring lines are the topic, so choose the classroom or game meaning (iron beside wood and stone is てつ, not an iron for clothes).
For each line, in the same order, return ja: a short natural meaning in hiragana, classroom register, at most 40 characters. Keep names as names.
Do not rewrite the English. Do not add lines. Do not write answer choices.
Return JSON only: {"lines":[{"en":"","ja":""}]}

Lines:
${numbered}`;
}

function distractorPrompt(pairs) {
  const numbered = pairs.map((line, index) => `${index + 1}. ${line.en} = ${line.ja}`).join("\n");
  return `You write wrong answers for an English homework. The Japanese meanings are already confirmed. Do not change them.
For each line, in the same order, return:
- distractorsEn: exactly 3 English options that change the meaning. Do not repeat the English line or each other.
- distractorsJa: exactly 3 Japanese options that change the meaning. Do not repeat the confirmed Japanese or each other.
Return JSON only: {"lines":[{"en":"","distractorsEn":["","",""],"distractorsJa":["","",""]}]}

Lines:
${numbered}`;
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("empty model json");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return Array.isArray(parsed?.lines) ? parsed.lines : [];
}

function hasKana(value) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(String(value || ""));
}

function confirmedLines(value) {
  const raw = Array.isArray(value) ? value : [];
  const lines = [];
  const seen = new Set();
  raw.forEach((item) => {
    if (lines.length >= MAX_LINES) return;
    const en = String(item?.en || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 120);
    const ja = String(item?.ja || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!en || !/[A-Za-z]/.test(en) || !ja || !hasKana(ja)) return;
    const key = normEn(en);
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ en, ja });
  });
  return lines;
}

async function vertexGenerate(body, token) {
  let lastError = null;
  for (const version of ["v1", "v1beta1"]) {
    const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/${version}/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": PROJECT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const parts = payload?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((part) => !part.thought).map((part) => part.text || "").join("");
      return parseModelJson(text);
    }
    const error = new Error(payload?.error?.message || `gemini http ${response.status}`);
    error.status = response.status;
    if (response.status !== 404) throw error;
    lastError = error;
  }
  throw lastError || new Error("gemini http 404");
}

async function generateJson(prompt, token) {
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    thinkingConfig: { thinkingBudget: 0 },
  };
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  try {
    return await vertexGenerate({ contents, generationConfig }, token);
  } catch (error) {
    if (error.status !== 400) throw error;
    const rest = { ...generationConfig };
    delete rest.thinkingConfig;
    return vertexGenerate({ contents, generationConfig: rest }, token);
  }
}

function capWarningFor(request, lines) {
  const supplied = (Array.isArray(request.data?.texts) ? request.data.texts : String(request.data?.text || "").split(/\r?\n/))
    .map((item) => String(item || "").trim())
    .filter((item) => /[A-Za-z]/.test(item));
  return supplied.length > lines.length && lines.length >= MAX_LINES
    ? ["英語は12件まで使います。"]
    : [];
}

function packDraft(rows, extraWarnings = []) {
  const built = buildLessonQuestions(rows, { seed: Date.now() % 100000 });
  if (!built.questions.length) {
    throw new HttpsError("invalid-argument", built.error || "この英語では問題を作れません。");
  }
  const prepared = preparePack(built.questions);
  if (!prepared.ok) throw new HttpsError("internal", prepared.error || "問題の形式を確認できませんでした。");
  return {
    questions: questionsForEditor(prepared.questions),
    vocab: built.vocab,
    warnings: [...extraWarnings, ...built.warnings],
  };
}

exports.draftLessonHomework = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (request) => {
  const user = await callerUser(request);
  if (!isTeacher(user)) throw new HttpsError("permission-denied", "先生だけが宿題を作れます。");
  const stage = String(request.data?.stage || "full");

  if (stage === "translate") {
    const lines = lessonInputs(request.data?.text ?? request.data?.texts);
    if (!lines.length) throw new HttpsError("invalid-argument", "英語を貼り付けてください。");
    let modelLines;
    try {
      const token = await getAccessToken();
      modelLines = await generateJson(translationPrompt(lines), token);
    } catch (error) {
      console.warn("[homework-draft] translation failed", error?.message || error);
      throw new HttpsError("internal", "日本語を作れませんでした。もう一度お試しください。");
    }
    return {
      translations: lessonTranslationRows(lines, modelLines),
      warnings: capWarningFor(request, lines),
    };
  }

  if (stage === "questions") {
    const confirmed = confirmedLines(request.data?.lines);
    if (!confirmed.length) throw new HttpsError("invalid-argument", "日本語を確認してください。");
    let modelLines = [];
    try {
      const token = await getAccessToken();
      modelLines = await generateJson(distractorPrompt(confirmed), token);
    } catch (error) {
      console.warn("[homework-draft] distractors failed", error?.message || error);
      throw new HttpsError("internal", "問題を作れませんでした。もう一度お試しください。");
    }
    return packDraft(lessonRowsFromConfirmed(confirmed, modelLines));
  }

  const lines = lessonInputs(request.data?.text ?? request.data?.texts);
  if (!lines.length) throw new HttpsError("invalid-argument", "英語を貼り付けてください。");
  let modelLines;
  try {
    const token = await getAccessToken();
    modelLines = await generateJson(lessonPrompt(lines), token);
  } catch (error) {
    console.warn("[homework-draft] gemini failed", error?.message || error);
    throw new HttpsError("internal", "問題を作れませんでした。もう一度お試しください。");
  }
  const translated = lessonTranslationRows(lines, modelLines);
  return packDraft(lessonRowsFromConfirmed(translated, modelLines), capWarningFor(request, lines));
});
