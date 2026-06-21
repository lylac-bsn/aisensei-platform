import { LESSON_1_QUESTS } from "./quests/beginner-lesson1.js";

export const PROGRESS_KEY = "gc_beginner_lesson1_questIndex";
export const STEP_PROGRESS_KEY = "gc_beginner_lesson1_stepProgress";

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const index = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(index) && index >= 0 ? index : 0;
  } catch {
    return 0;
  }
}

export function saveProgress(index) {
  try {
    localStorage.setItem(PROGRESS_KEY, String(index));
  } catch {
    // ignore quota / private mode
  }
}

export function resetProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(STEP_PROGRESS_KEY);
  } catch {
    // ignore
  }
}

export function getQuests() {
  return LESSON_1_QUESTS;
}

export function getCurrentQuest() {
  const index = loadProgress();
  if (index >= LESSON_1_QUESTS.length) return null;
  return LESSON_1_QUESTS[index];
}

export function isLessonComplete() {
  return loadProgress() >= LESSON_1_QUESTS.length;
}

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Beginner-friendly verb forms → canonical root for fuzzy matching. */
const VERB_FORMS = {
  make: "make",
  made: "make",
  making: "make",
  find: "find",
  found: "find",
  finding: "find",
  get: "get",
  got: "get",
  getting: "get",
  see: "see",
  saw: "see",
  seeing: "see",
  look: "see",
  looked: "see",
  looking: "see",
  chop: "chop",
  chopped: "chop",
  chopping: "chop",
  cut: "chop",
  cutted: "chop",
  craft: "craft",
  crafted: "craft",
  crafting: "craft",
  build: "build",
  built: "build",
  building: "build",
  mine: "mine",
  mined: "mine",
  mining: "mine",
  dig: "mine",
  dug: "mine",
  digging: "mine",
  collect: "collect",
  collected: "collect",
  collecting: "collect",
  gather: "collect",
  gathered: "collect",
  place: "place",
  placed: "place",
  placing: "place",
  put: "place",
  putting: "place",
  create: "create",
  created: "create",
  creating: "create",
  have: "have",
  has: "have",
  had: "have",
  want: "want",
  wanted: "want",
  needing: "need",
  need: "need",
  needed: "need",
  eat: "eat",
  eating: "eat",
  ate: "eat",
};

const CONTRACTIONS = {
  "i'm": "i am",
  im: "i am",
  "you're": "you are",
  youre: "you are",
  "there's": "there is",
  theres: "there is",
  "it's": "it is",
  "we're": "we are",
};

const PLURAL_TO_SINGULAR = {
  pickaxes: "pickaxe",
  stones: "stone",
  trees: "tree",
  tables: "table",
  apples: "apple",
  cows: "cow",
  sheeps: "sheep",
  cobblestones: "cobblestone",
  foods: "food",
  logs: "log",
};

const NUMBER_WORDS = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

function normalizeEnglishForMatching(text) {
  let t = normalizeText(text);

  for (const [from, to] of Object.entries(CONTRACTIONS)) {
    t = t.replace(new RegExp(`\\b${escapeRegex(from)}\\b`, "g"), to);
  }

  for (const [plural, singular] of Object.entries(PLURAL_TO_SINGULAR)) {
    t = t.replace(new RegExp(`\\b${plural}\\b`, "g"), singular);
  }

  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    t = t.replace(new RegExp(`\\b${word}\\b`, "g"), digit);
  }

  t = t.replace(/\bcrafting\b/g, "craft");
  t = t.replace(/\bwooden\b/g, "wood");

  t = t
    .split(/\s+/)
    .map((word) => VERB_FORMS[word.replace(/['']/g, "")] || word)
    .join(" ");

  t = t.replace(/\b(a|an|the)\b/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

function getCanonicalVerb(word) {
  return VERB_FORMS[word.replace(/['']/g, "")] || word;
}

function getVerbAlternates(word) {
  const canonical = getCanonicalVerb(word);
  const alts = new Set([word, canonical]);
  for (const [form, root] of Object.entries(VERB_FORMS)) {
    if (root === canonical) alts.add(form);
  }
  return [...alts];
}

function isVerbToken(word) {
  const w = word.replace(/['']/g, "");
  return Object.prototype.hasOwnProperty.call(VERB_FORMS, w);
}

function buildFlexibleEnglishRegex(normPattern) {
  const tokens = normPattern.split(/\s+/).filter(Boolean);
  if (!tokens.length) return /$^/;

  const parts = [];
  let i = 0;

  if (tokens[0] === "i") {
    parts.push("(?:i\\s+)?");
    i = 1;
  }
  if (tokens[i] === "there" && tokens[i + 1] === "is") {
    parts.push("there\\s+is\\s+");
    i += 2;
  }

  if (i < tokens.length && isVerbToken(tokens[i])) {
    const alts = getVerbAlternates(tokens[i]);
    parts.push(`(?:${alts.map(escapeRegex).join("|")})`);
    i += 1;
  }

  while (i < tokens.length) {
    const token = tokens[i];
    if (["a", "an", "the", "some"].includes(token)) {
      parts.push(`(?:${escapeRegex(token)}\\s+)?`);
    } else if (token === "it") {
      parts.push(`(?:${escapeRegex(token)}\\s+)?`);
    } else if (token === "down" && i === tokens.length - 1) {
      parts.push("(?:down)?");
    } else {
      parts.push(escapeRegex(token));
    }
    i += 1;
  }

  return new RegExp(parts.join("\\s+"), "i");
}

/** Flexible phrase match (not exact wording). */
export function matchesPhrase(text, pattern) {
  if (!text || !pattern) return false;
  const lower = normalizeText(text);
  const p = normalizeText(pattern);

  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(p)) {
    return lower.includes(p);
  }

  const normText = normalizeEnglishForMatching(text);
  const normPattern = normalizeEnglishForMatching(pattern);

  if (p.includes(" ")) {
    if (buildFlexibleEnglishRegex(normPattern).test(normText)) return true;
    const regex = new RegExp(escapeRegex(p).replace(/\s+/g, "\\s+"), "i");
    return regex.test(lower);
  }

  if (new RegExp(`\\b${escapeRegex(normPattern)}\\b`, "i").test(normText)) return true;
  return new RegExp(`\\b${escapeRegex(p)}\\b`, "i").test(lower);
}

function isEnglishPattern(pattern) {
  return !/[\u3040-\u30ff\u3400-\u9fff]/.test(pattern || "");
}

function userTextHasEnglish(text) {
  return /[a-zA-Z]/.test(text || "");
}

export function matchesStep(text, step) {
  if (!step?.patterns?.length) return false;
  const matched = step.patterns.some((pattern) => matchesPhrase(text, pattern));
  if (!matched) return false;
  if (step.patterns.every(isEnglishPattern) && !userTextHasEnglish(text)) {
    return false;
  }
  return true;
}

function loadAllStepProgress() {
  try {
    const raw = localStorage.getItem(STEP_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllStepProgress(data) {
  try {
    localStorage.setItem(STEP_PROGRESS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadCompletedStepIds(questIndex = loadProgress()) {
  const data = loadAllStepProgress();
  const ids = data[String(questIndex)];
  return Array.isArray(ids) ? ids : [];
}

export function saveCompletedStepIds(questIndex, stepIds) {
  const data = loadAllStepProgress();
  data[String(questIndex)] = stepIds;
  saveAllStepProgress(data);
}

export function clearStepProgress(questIndex) {
  const data = loadAllStepProgress();
  delete data[String(questIndex)];
  saveAllStepProgress(data);
}

export function clearAllStepProgress() {
  try {
    localStorage.removeItem(STEP_PROGRESS_KEY);
  } catch {
    // ignore
  }
}

/** Mark newly matched steps from one utterance (sequential — next step only). */
export function syncQuestStepsFromText(quest, userText, questIndex = loadProgress()) {
  if (!quest?.steps?.length || !userText?.trim()) return [];

  const done = new Set(loadCompletedStepIds(questIndex));
  const newly = [];

  for (const step of quest.steps) {
    if (done.has(step.id)) continue;
    if (matchesStep(userText, step)) {
      done.add(step.id);
      newly.push(step.id);
    }
    break;
  }

  if (newly.length) {
    saveCompletedStepIds(questIndex, [...done]);
  }
  return newly;
}

/** Reconcile step progress — keep prior steps, extend when session matches next ones. */
export function syncQuestStepsFromSessionText(quest, sessionUserText, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return [];

  const prevDone = new Set(loadCompletedStepIds(questIndex));
  const done = [];
  const newly = [];

  for (const step of quest.steps) {
    const already = prevDone.has(step.id);
    const matched =
      Boolean(sessionUserText?.trim()) && matchesStep(sessionUserText, step);
    if (already || matched) {
      if (matched && !already) newly.push(step.id);
      done.push(step.id);
    } else {
      break;
    }
  }

  if (newly.length || done.length !== prevDone.size) {
    saveCompletedStepIds(questIndex, done);
  }
  return newly;
}

export function isQuestStepsComplete(quest, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return false;
  const done = new Set(loadCompletedStepIds(questIndex));
  return quest.steps.every((step) => done.has(step.id));
}

export function getRemainingSteps(quest, questIndex = loadProgress()) {
  if (!quest?.steps) return [];
  const done = new Set(loadCompletedStepIds(questIndex));
  return quest.steps.filter((step) => !done.has(step.id));
}

export function getQuestStepSummary(quest, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return "";
  const done = new Set(loadCompletedStepIds(questIndex));
  return quest.steps
    .map((step) => `${done.has(step.id) ? "✓" : "○"} ${step.label}`)
    .join(" · ");
}

/** @deprecated use matchesStep — kept for compatibility */
export function matchesQuest(text, quest) {
  if (!quest) return false;
  if (quest.steps?.length) {
    return quest.steps.some((step) => matchesStep(text, step));
  }
  return false;
}

export function validateQuestCompletion(quest, userQuote, latestUtterance, sessionUserText = "") {
  const quote = (userQuote || "").trim();
  const latest = (latestUtterance || quote).trim();
  const session = normalizeText(sessionUserText || latest);

  if (!latest && !session) {
    return { ok: false, reason: "no_speech" };
  }

  if (!isQuestStepsComplete(quest)) {
    const remaining = getRemainingSteps(quest)
      .map((s) => s.label)
      .join(", ");
    return { ok: false, reason: "steps_incomplete", remaining };
  }

  if (!userTextHasEnglish(latest) && !userTextHasEnglish(quote)) {
    return { ok: false, reason: "no_english_in_latest_utterance" };
  }

  const normLatest = normalizeText(latest);
  const normQuote = normalizeText(quote || latest);

  if (quote && normLatest !== normQuote && !normLatest.includes(normQuote)) {
    const quoteWords = normQuote.split(/\s+/).filter((w) => w.length > 2);
    const hasOverlap = quoteWords.some((w) => normLatest.includes(w));
    if (!hasOverlap) {
      return { ok: false, reason: "quote_not_in_latest_utterance" };
    }
  }

  return { ok: true, userQuote: quote || latest };
}

export function buildQuestRejectedToolMessage(quest, userUtterance = "") {
  const remaining = getRemainingSteps(quest);
  const next = remaining[0];
  const remainText = remaining.length
    ? `Still need: ${remaining.map((s) => s.label).join(", ")}.`
    : "";
  const transcript = (userUtterance || "").trim();
  const transcriptNote = transcript
    ? `Latest transcript: "${transcript}". Do NOT claim they said English that is not in this transcript. `
    : "";
  const nextPhrase = next?.patterns?.[0]
    ? `Pending English (do not repeat unless they ask or just succeeded): "${next.patterns[0]}". `
    : "";
  return (
    `Quest NOT complete yet. Goal: "${quest?.goal || ""}". ${remainText} ${transcriptNote}${nextPhrase}` +
    `Steps only count when English appears in the speech transcript. ` +
    `Do NOT call complete_quest until all steps are done. ` +
    `Reply naturally — do not drill the same phrase again. ${buildNaturalFlowReminder(next)}`
  );
}

export function buildQuestRecordedToolMessage(quest, userQuote) {
  const quote = userQuote ? `The user said: "${userQuote}". ` : "";
  return (
    `${quote}Quest recorded. Say ONE short spoken congratulations (1–2 sentences only): ` +
    `tie back to what THEY did in Minecraft for "${quest?.goal || ""}", ` +
    `then celebrate briefly in Japanese with a little English. ` +
    `Then END your turn. Do NOT repeat or give a second congratulations.`
  );
}

export function buildQuestFarewellNudge(quest, userQuote) {
  const quote = userQuote ? `They said: "${userQuote}". ` : "";
  return (
    `${quote}Quest complete! Say ONE short spoken congratulations (1–2 sentences only): ` +
    `connect back to their Minecraft progress ("${quest?.goal || ""}"), ` +
    `then celebrate in Japanese with a little English. ` +
    `Then END your turn. Do NOT repeat or give a second congratulations.`
  );
}

export function buildQuestCompleteTrackerNudge() {
  return (
    `[Quest tracker] All steps complete. Call complete_quest once with the latest English transcript. ` +
    `Do NOT congratulate yet — wait for the tool response. One celebration only, then end turn.`
  );
}

export function buildQuestAlreadyRecordedToolMessage() {
  return "Quest already recorded. Do not repeat congratulations or mention completion again.";
}

export const BEGINNER_VOICE_BASE_PROMPT = `あなたはゲームカレッジの「ラーニー先生」（初級・日本の小学生）。Minecraftサバイバルワールドの中で一緒に成長する相棒。安心感と楽しさが最優先。

■話し方: 日本語多め＋短い英語。英語の直後に日本語で意味補足。詰めない。Nice try! から直す。言えたら英語＋日本語で短く褒める。
■会話の流れ:
- 子どもの今の話・マイクラの状況に自然に返す。
- 同じ英文コーチングを連続で繰り返さない。探している・困っている最中はゲームの助言優先。
- 話題がそれてもOK。自然なタイミングでやさしくクエストに戻す。
■マイクラ成功→英語（重要）:
- 日本語だけで「できた」「手に入れた」「見つけた」と報告されたら → まずマイクラを一緒に喜ぶ → その場で英文フレーズを1回教える（スキップ禁止）。
- 例: 「手に入れたよ」→「やったね！英語だと「I got wood!」って言うんだよ。gotは手に入れた、woodは木材！」
- 英文を言うまでクエストステップは未達成。達成したことにしないが、英語は必ず促す。
- 探し物・失敗・雑談のときだけ英文繰り返しを控える。
■初級コーチング（必要なときだけ）:
- 否定しない。まず日本語で共感。
- 英語は短く1回。単語説明も1回きり。何度も同じ説明をしない。
- クエスト達成は文字起こしに英語が出るまで待つ。練習と達成は別。
■Minecraft: 木→作業台→ツルハシ→石→食料。ゲーム内の体験を一緒に楽しむ。正確より伝わる英語を褒める。
■クエスト開始: マイクラで「まずやること」をワクワク短く → できたら英語。プレイ優先。
■無言時: 推察・質問禁止。マイクラ豆知識1つ（短い英語1つ＋日本語）。同テーマ連続NG。
■安全: 明るく否定しない。不適切話題は短く断りMinecraft/英語へ。`;

function buildNaturalFlowReminder(nextStep) {
  const phrase = nextStep?.patterns?.[0] || "";
  return (
    `CONVERSATION: Respond naturally to what the child just said. ` +
    `Do NOT repeat the same English coaching (${phrase ? `"${phrase}"` : "example phrase"}) if you already said it recently. ` +
    `Help with gameplay first if they are still searching or frustrated. ` +
    `Do not force the quest — follow their flow.`
  );
}

const STEP_JAPANESE_SUCCESS_HINTS = {
  found_tree: ["見つけ", "見っけ", "あった", "アタッ", "発見", "木がある", "木を見"],
  got_wood: ["手に入", "切っ", "伐採", "木材", "ウッド", "取っ", "ゲット", "集め"],
  made_table: ["作っ", "作業台", "クラフト", "できた"],
  placed_table: ["置い", "置き", "置く", "ここに"],
  made_pickaxe: ["ツルハシ", "ピッケ", "pick", "作っ"],
  ready: ["準備", "できた", "行くよ", "行こう", "レディ"],
  found_stones: ["石", "見つけ", "丸石", "ストーン"],
  got_stones: ["集め", "手に入", "掘っ", "取っ", "石を"],
  found_food: ["食べ", "肉", "フルーツ", "リンゴ", "見つけ", "羊", "牛"],
  need_food: ["お腹", "腹減", "空い", "食べたい", "ハングリー"],
};

/** User reported step success in Japanese but transcript has no English. */
export function userHintsStepSuccessInJapanese(text, step) {
  if (!text?.trim() || !step) return false;
  if (userTextHasEnglish(text)) return false;
  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return false;
  const hints = step.japaneseHints || STEP_JAPANESE_SUCCESS_HINTS[step.id] || [];
  return hints.some((hint) => text.includes(hint));
}

function buildEnglishBridgeNudge(step) {
  const phrase = step.patterns?.[0] || "";
  const coach = step.coachNote || "";
  return (
    `ENGLISH TEACHING MOMENT: Child reported "${step.label}" in Japanese only — step NOT recorded (no English in transcript). ` +
    `1) Celebrate their Minecraft success warmly in Japanese first. ` +
    `2) Then teach the English phrase ONCE: "${phrase}". ${coach ? `Hint: ${coach}` : ""} One short sentence for word meanings. ` +
    `3) Do NOT skip English here. Do NOT claim they said the English. Do NOT jump to the next quest topic yet. ` +
    `4) Invite them to try saying the English phrase now.`
  );
}

export function buildQuestOpeningNudge(quest) {
  if (!quest) return "";
  const firstStep = quest.steps?.[0];
  const firstPhrase = firstStep?.patterns?.[0] || "";
  const firstCoach = firstStep?.coachNote || "";
  const playLead = quest.openingPlay || `まずは${quest.goal}をマイクラでやってみよう！`;
  return (
    `New Minecraft quest session — microphone is live. Speak first, out loud (2–4 short sentences max).\n` +
    `OPENING — gameplay FIRST, English SECOND. Do NOT lead with "次のクエストは…" or phrase drilling.\n` +
    `1) Excited Minecraft action (what to do in-game NOW): ${playLead}\n` +
    (firstPhrase
      ? `2) THEN tie the first English phrase for when they succeed: "${firstPhrase}" — only after the in-game action.\n`
      : "") +
    (firstCoach
      ? `3) One brief Japanese word hint if natural (from: ${firstCoach}) — one short sentence, not a lecture.\n`
      : "") +
    `4) End with brief encouragement ("やってみよう！" / "できたら教えてね！") and STOP to listen.\n` +
    `Example tone (quest 1): 「まずは木を探そう！見つかったら「I found a tree!」って言ってみよう！foundは見つけた、treeは木だよ。一緒にやってみよう！」`
  );
}

export function buildQuestInstructions(basePrompt, quest) {
  if (!quest) return basePrompt;

  const stepLines = (quest.steps || []).map(
    (step, i) =>
      `  ${i + 1}. ${step.label} — e.g. "${step.patterns[0]}" (similar wording OK)` +
      (step.coachNote ? `\n     コーチ用: ${step.coachNote}` : "")
  );

  const block = [
    "",
    "■Minecraftクエスト（画面表示済み・初級）",
    `- 目標: ${quest.goal}`,
    quest.hint ? `- ヒント: ${quest.hint}` : "",
    "- 達成条件（すべて必要・この通話の中で）:",
    ...stepLines,
    "- 開始時（必ず最初・音声）: マイクラで「まずやること」をワクワク短く → できたら最初の英語フレーズ → 単語ヒントは1文だけ → 聞く。",
    "- 開始時に「次のクエストは…」だけ言ったり、英語フレーズの説明から始めない。",
    "- 会話中: 子どもの話に自然に返す。同じ英文・単語説明を連続で繰り返さない。",
    "- 探し物・失敗・雑談: ゲームのヒントや共感を先に。",
    "- マイクラ成功（日本語報告）: 喜ぶ → 英文フレーズを1回必ず教える → 言えるまで次の話題に進まない。",
    "- クエストを強制しないが、できた報告のときは英語を教える。",
    "- つまずき時: 共感 → マイクラの助言 → 英語は短く1回だけ（既に言った説明は繰り返さない）。",
    "- 各ステップは英語が音声文字起こしに出たときだけ達成。日本語だけでは達成扱いにしない。",
    "- ユーザーが英語を言っていないのに例文を言ったことにしない。文字起こしに出た言葉だけ引用。",
    "- 練習中は何度でも手伝う。達成前でも Nice try! でモデル発話＋日本語の意味説明を続ける。",
    "- 「クエスト達成」「おめでとうクリア」などは complete_quest が成功したあとだけ。ステップ未完了のときは絶対に言わない。",
    "- 各ステップ達成を英語で言えたら短く褒める（引用は文字起こしどおり）。全部終わったらだけ complete_quest を呼ぶ。",
    "- user_quote には直近のユーザー発話の文字起こしをそのまま入れる（創作・翻訳禁止）。",
    "- complete_quest 後: お祝いでユーザーのMinecraft行動に触れる → 音声1〜2文でターン終了。",
    "- 達成前: 自然に会話。話題がそれてもOK。自然なタイミングでやさしくクエストに戻す。",
  ]
    .filter(Boolean)
    .join("\n");

  return `${basePrompt}\n${block}`;
}

/** Authoritative step status after each user utterance — sent to Learny. */
export function buildQuestStepGroundTruthNudge(quest, userUtterance, newlyCompletedIds = []) {
  if (!quest) return "";
  const utterance = (userUtterance || "").trim();
  const done = new Set(loadCompletedStepIds());
  const remaining = getRemainingSteps(quest);
  const completedLabels = quest.steps
    .filter((s) => done.has(s.id))
    .map((s) => s.label)
    .join(", ");

  const lines = [
    "[Quest tracker — follow exactly; do not contradict]",
    utterance ? `User transcript (exact): "${utterance}"` : "User transcript: (empty)",
    `Completed steps: ${completedLabels || "none"}`,
  ];

  if (remaining.length) {
    const next = remaining[0];
    lines.push(
      `Next step needed: ${next.label} (English e.g. "${next.patterns[0]}")`,
      `Incomplete: ${remaining.map((s) => s.label).join(", ")}`
    );
  } else {
    lines.push("All steps complete — call complete_quest once. Do NOT congratulate until tool confirms.");
  }

  if (newlyCompletedIds.length) {
    const labels = newlyCompletedIds
      .map((id) => quest.steps.find((s) => s.id === id)?.label)
      .filter(Boolean)
      .join(", ");
    lines.push(`Just completed from this utterance: ${labels}.`);
    if (remaining.length) {
      lines.push(
        "Celebrate this step only — quest NOT finished yet.",
        `Still need: ${remaining.map((s) => s.label).join(", ")}.`,
        "Do NOT say the quest is complete or call complete_quest yet."
      );
    } else {
      lines.push(
        "All steps done — call complete_quest once. Do NOT congratulate until the tool confirms. One celebration only."
      );
    }
  } else if (remaining.length && utterance) {
    const next = remaining[0];
    lines.push(
      "No new step completed this turn.",
      "Do NOT say the user completed a step or spoke an example phrase unless the tracker marked it complete above.",
      `Do NOT say the user spoke "${next.patterns[0]}" unless those words appear in the transcript above.`
    );
    if (userHintsStepSuccessInJapanese(utterance, next)) {
      lines.push(buildEnglishBridgeNudge(next));
    } else {
      lines.push(buildNaturalFlowReminder(next));
    }
  }

  return lines.join("\n");
}
