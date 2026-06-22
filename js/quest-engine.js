import { LESSON_1_QUESTS, LESSON_1_TITLE } from "./quests/beginner-lesson1.js";

export const PROGRESS_KEY = "gc_beginner_lesson1_questIndex";
export const STEP_PROGRESS_KEY = "gc_beginner_lesson1_stepProgress";
export const SELECTED_QUEST_KEY = "gc_beginner_lesson1_selectedQuest";
export const LEARNED_PHRASES_KEY = "gc_beginner_lesson1_learnedPhrases";
export const LESSON_BADGES_KEY = "gc_beginner_lessonBadges";

/** Lesson badge slots for the beginner level (one badge per full lesson clear). */
export const BEGINNER_LESSON_SLOTS = [
  { id: "lesson1", label: "レッスン1", desc: "マイクラサバイバル" },
  { id: "lesson2", label: "レッスン2", desc: "???", upcoming: true },
  { id: "lesson3", label: "レッスン3", desc: "???", upcoming: true },
  { id: "lesson4", label: "レッスン4", desc: "???", upcoming: true },
  { id: "lesson5", label: "レッスン5", desc: "???", upcoming: true },
  { id: "lesson6", label: "レッスン6", desc: "???", upcoming: true },
];

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
    localStorage.removeItem(SELECTED_QUEST_KEY);
    localStorage.removeItem(LEARNED_PHRASES_KEY);
    localStorage.removeItem(LESSON_BADGES_KEY);
  } catch {
    // ignore
  }
}

export function getSelectedQuestIndex() {
  try {
    const raw = localStorage.getItem(SELECTED_QUEST_KEY);
    if (raw === null || raw === "none") return null;
    const index = parseInt(raw, 10);
    if (!Number.isFinite(index) || index < 0) return null;
    if (!isQuestUnlocked(index)) return null;
    return index;
  } catch {
    return null;
  }
}

export function clearSelectedQuest() {
  try {
    localStorage.setItem(SELECTED_QUEST_KEY, "none");
  } catch {
    // ignore
  }
}

export function setSelectedQuestIndex(index) {
  if (index === null || index === undefined) {
    clearSelectedQuest();
    return true;
  }
  if (!Number.isFinite(index) || index < 0 || !isQuestUnlocked(index)) {
    return false;
  }
  try {
    localStorage.setItem(SELECTED_QUEST_KEY, String(index));
    return true;
  } catch {
    return false;
  }
}

export function isQuestUnlocked(index) {
  if (!Number.isFinite(index) || index < 0 || index >= LESSON_1_QUESTS.length) {
    return false;
  }
  return index <= loadProgress();
}

export function getUnlockedQuests() {
  const progress = loadProgress();
  return LESSON_1_QUESTS.filter((_, i) => i <= progress);
}

export function getSelectedQuest() {
  const index = getSelectedQuestIndex();
  if (index === null) return null;
  return LESSON_1_QUESTS[index] || null;
}

export function getQuestIndex(quest) {
  if (!quest) return -1;
  return LESSON_1_QUESTS.findIndex((q) => q.id === quest.id);
}

export function selectNextQuestAfterComplete() {
  const index = loadProgress();
  if (index >= LESSON_1_QUESTS.length) {
    clearSelectedQuest();
    return null;
  }
  setSelectedQuestIndex(index);
  return LESSON_1_QUESTS[index];
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

export function loadEarnedLessonBadges() {
  try {
    const raw = localStorage.getItem(LESSON_BADGES_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const earned = new Set(Array.isArray(stored) ? stored : []);
    if (isLessonComplete()) {
      earned.add("lesson1");
    }
    return [...earned];
  } catch {
    return isLessonComplete() ? ["lesson1"] : [];
  }
}

export function isLessonBadgeEarned(lessonId) {
  return loadEarnedLessonBadges().includes(lessonId);
}

export function recordLessonBadge(lessonId) {
  if (!lessonId) return;
  try {
    const raw = localStorage.getItem(LESSON_BADGES_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const earned = new Set(Array.isArray(stored) ? stored : []);
    if (earned.has(lessonId)) return;
    earned.add(lessonId);
    localStorage.setItem(LESSON_BADGES_KEY, JSON.stringify([...earned]));
  } catch {
    // ignore
  }
}

export function getLessonBadgeSlots() {
  const earned = new Set(loadEarnedLessonBadges());
  return BEGINNER_LESSON_SLOTS.map((slot) => ({
    ...slot,
    earned: earned.has(slot.id),
  }));
}

/** Snapshot for Firestore sync and admin dashboard. */
export function buildProgressSnapshot() {
  const totalQuests = LESSON_1_QUESTS.length;
  const questIndex = loadProgress();
  const starsEarned = Math.min(questIndex, totalQuests);
  const lessonComplete = isLessonComplete();
  const selectedIndex = getSelectedQuestIndex();
  const phrases = getLearnedPhrases();
  const badges = loadEarnedLessonBadges();

  let missionIndex = null;
  let missionTitleEn = "";
  let missionGoal = "";
  let missionStatus = "未開始";

  if (lessonComplete) {
    missionStatus = "レッスンクリア";
    if (selectedIndex !== null && LESSON_1_QUESTS[selectedIndex]) {
      missionIndex = selectedIndex;
      missionTitleEn = LESSON_1_QUESTS[selectedIndex].titleEn || "";
      missionGoal = LESSON_1_QUESTS[selectedIndex].goal || "";
    }
  } else if (selectedIndex !== null && LESSON_1_QUESTS[selectedIndex]) {
    missionIndex = selectedIndex;
    missionTitleEn = LESSON_1_QUESTS[selectedIndex].titleEn || "";
    missionGoal = LESSON_1_QUESTS[selectedIndex].goal || "";
    missionStatus = selectedIndex === questIndex ? "いまのミッション" : "復習中";
  } else if (questIndex < totalQuests) {
    missionIndex = questIndex;
    missionTitleEn = LESSON_1_QUESTS[questIndex].titleEn || "";
    missionGoal = LESSON_1_QUESTS[questIndex].goal || "";
    missionStatus = "自由会話（次のミッション待ち）";
  } else {
    missionStatus = "自由会話";
  }

  return {
    level: "beginner",
    lessonTitle: LESSON_1_TITLE,
    questIndex,
    starsEarned,
    totalQuests,
    lessonComplete,
    selectedQuestIndex: selectedIndex,
    missionIndex,
    missionNumber: missionIndex !== null ? missionIndex + 1 : null,
    missionTitleEn,
    missionGoal,
    missionStatus,
    phraseCount: phrases.length,
    phrases: phrases.slice(0, 40).map((p) => ({
      english: p.english,
      japanese: p.japanese,
      questTitle: p.questTitle,
    })),
    lessonBadges: badges,
    badgeCount: badges.length,
  };
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
    } else if (token === "here" && i === tokens.length - 1) {
      parts.push(`(?:${escapeRegex(token)}|there)`);
    } else if (token === "down" && i === tokens.length - 1) {
      parts.push("(?:down)?");
    } else {
      parts.push(escapeRegex(token));
    }
    i += 1;
  }

  return new RegExp(parts.join("\\s+"), "i");
}

/** Salient keyword groups — each group needs at least one hit (STT-friendly fallback). */
const STEP_SALIENT_GROUPS = {
  found_tree: [["find", "found", "see", "look"], ["tree"]],
  got_wood: [["get", "got", "have", "chop", "cut", "collect"], ["wood"]],
  made_table: [["make", "made", "craft", "crafted", "built", "create"], ["table", "crafting", "craft"]],
  placed_table: [["put", "place", "placed"], ["here", "down"]],
  made_pickaxe: [["make", "made", "craft", "built"], ["pickaxe", "pick"]],
  ready: [["ready"]],
  found_stones: [["find", "found", "see"], ["stone", "stones", "cobblestone"]],
  got_stones: [["get", "got", "have", "mine", "dig", "collect"], ["stone", "stones", "cobblestone"]],
  found_food: [["find", "found", "see"], ["food", "meat", "apple", "beef", "pork", "chicken"]],
  need_food: [["hungry", "hunger", "need", "want", "eat"], ["food", "eat"]],
};

function textWords(text) {
  return normalizeEnglishForMatching(text).split(/\s+/).filter(Boolean);
}

function wordHitsKeyword(word, keyword) {
  if (word === keyword) return true;
  if (word.startsWith(keyword) || keyword.startsWith(word)) return true;
  return false;
}

function matchesStepSalient(text, step) {
  const groups = STEP_SALIENT_GROUPS[step?.id];
  if (!groups?.length) return false;
  const words = textWords(text);
  if (!words.length) return false;
  return groups.every((group) =>
    group.some((keyword) => words.some((word) => wordHitsKeyword(word, keyword)))
  );
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

const VALID_SHORT_UTTERANCES = new Set([
  "i", "a", "ok", "no", "hi", "go", "yes", "yeah", "yep", "wow",
  "うん", "はい", "え", "ね", "あ", "う", "ん", "そう", "えっ", "わ", "や", "よ", "お",
]);

/** True when transcript is empty, noise, or too garbled to treat as intentional speech. */
export function isUnrecognizableUserInput(text) {
  const t = (text || "").trim();
  if (!t) return true;

  const normalized = t.toLowerCase().replace(/\s+/g, " ").trim();
  if (VALID_SHORT_UTTERANCES.has(normalized)) return false;

  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(t)) {
    if (t.length === 1 && /[\u3040-\u30ff]/.test(t)) return false;
    if (/^(.)\1{3,}$/.test(normalized)) return true;
    return false;
  }

  if (userTextHasEnglish(t)) return false;

  if (/^(um+|uh+|ah+|hm+|mhm+|mmm+|hmm+|eh+|oh+)$/i.test(normalized)) return true;
  if (/^[\*#\.\-_\?\!\,\:\;\"\'\(\)\[\]\s\d]+$/.test(t)) return true;

  const letters = (t.match(/[\p{L}\p{N}]/gu) || []).length;
  if (letters / t.length < 0.35) return true;
  if (t.length < 12 && !/\b[a-z]{2,}\b/i.test(t)) return true;

  return false;
}

/** Nudge Learny to ask the child to repeat after unclear/noise input. */
export function buildUnclearInputRepeatNudge(userUtterance = "") {
  const transcript = (userUtterance || "").trim();
  const transcriptNote = transcript
    ? `Speech transcript was unclear or may be background noise: "${transcript}". `
    : "The user spoke but the transcript was empty or unclear (likely accidental noise). ";
  return (
    `[Response required — speak aloud in AUDIO now. Do NOT stay silent.] ${transcriptNote}` +
    `Do NOT guess what they meant. Do NOT advance any quest step. ` +
    `Warmly tell the child in Japanese (1–2 short sentences) that you could not quite catch it, ` +
    `it might have been background noise, and ask them to say it again. ` +
    `Example tone: 「ごめんね、ちょっと聞き取れなかったよ！もう一回言ってくれる？」`
  );
}

export function matchesStep(text, step) {
  if (!step?.patterns?.length) return false;
  const patternMatched = step.patterns.some((pattern) => matchesPhrase(text, pattern));
  const salientMatched = !patternMatched && matchesStepSalient(text, step);
  if (!patternMatched && !salientMatched) return false;
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

/** Format a short English phrase for the phrase book display. */
export function formatEnglishPhrase(text) {
  if (!text) return "";
  return text
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "i") return "I";
      if (lower === "i'm" || lower === "im") return "I'm";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function getStepEnglishPhrase(step) {
  const fromCoach = step?.coachNote?.match(/「([^」]+)」/)?.[1];
  if (fromCoach) return fromCoach.replace(/\u3000/g, " ").trim();

  const pattern = step?.patterns?.[0];
  if (!pattern) return step?.label || "";

  if (/^i[\s']/i.test(pattern)) {
    return formatEnglishPhrase(pattern);
  }
  return formatEnglishPhrase(`i ${pattern}`);
}

function loadLearnedPhrasesMap() {
  try {
    const raw = localStorage.getItem(LEARNED_PHRASES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLearnedPhrasesMap(map) {
  try {
    localStorage.setItem(LEARNED_PHRASES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function phraseEntryKey(questIndex, stepId) {
  return `${questIndex}:${stepId}`;
}

/** Persist phrases when mission steps are completed (survives quest replay reset). */
export function recordLearnedSteps(quest, questIndex, stepIds) {
  if (!quest?.steps?.length || !stepIds?.length) return;
  if (!Number.isFinite(questIndex) || questIndex < 0) return;

  const map = loadLearnedPhrasesMap();
  let changed = false;

  for (const stepId of stepIds) {
    const step = quest.steps.find((s) => s.id === stepId);
    if (!step) continue;
    const key = phraseEntryKey(questIndex, stepId);
    if (map[key]) continue;
    map[key] = {
      questIndex,
      stepId,
      questTitle: quest.titleEn || quest.title,
      japanese: step.label,
      english: getStepEnglishPhrase(step),
      learnedAt: Date.now(),
    };
    changed = true;
  }

  if (changed) saveLearnedPhrasesMap(map);
}

/** One-time migration from legacy step-progress storage. */
function migrateLearnedPhrasesFromStepProgress() {
  const map = loadLearnedPhrasesMap();
  if (Object.keys(map).length) return;

  const quests = LESSON_1_QUESTS;
  let changed = false;
  quests.forEach((quest, questIndex) => {
    const doneIds = loadCompletedStepIds(questIndex);
    if (!doneIds.length) return;
    for (const stepId of doneIds) {
      const key = phraseEntryKey(questIndex, stepId);
      if (map[key]) continue;
      const step = quest.steps?.find((s) => s.id === stepId);
      if (!step) continue;
      map[key] = {
        questIndex,
        stepId,
        questTitle: quest.titleEn || quest.title,
        japanese: step.label,
        english: getStepEnglishPhrase(step),
        learnedAt: Date.now(),
      };
      changed = true;
    }
  });
  if (changed) saveLearnedPhrasesMap(map);
}

/** All phrases saved in the phrase book (フレーズ panel). */
export function getLearnedPhrases() {
  migrateLearnedPhrasesFromStepProgress();
  const map = loadLearnedPhrasesMap();
  const quests = LESSON_1_QUESTS;

  return Object.values(map).sort((a, b) => {
    if (a.questIndex !== b.questIndex) return a.questIndex - b.questIndex;
    const stepsA = quests[a.questIndex]?.steps || [];
    const stepsB = quests[b.questIndex]?.steps || [];
    const orderA = stepsA.findIndex((s) => s.id === a.stepId);
    const orderB = stepsB.findIndex((s) => s.id === b.stepId);
    return orderA - orderB;
  });
}

/** In-memory step progress for replay sessions (does not touch localStorage). */
let questSessionSteps = null;

export function isQuestReplay(questIndex) {
  if (!Number.isFinite(questIndex) || questIndex < 0) return false;
  return questIndex < loadProgress();
}

/** Start a call session — step progress is tracked in memory for the active call. */
export function beginQuestSession(questIndex) {
  if (!Number.isFinite(questIndex) || questIndex < 0) {
    questSessionSteps = null;
    return;
  }
  questSessionSteps = {
    questIndex,
    stepIds: isQuestReplay(questIndex) ? [] : [...loadCompletedStepIds(questIndex)],
  };
}

export function endQuestSession() {
  if (questSessionSteps && !isQuestReplay(questSessionSteps.questIndex)) {
    saveCompletedStepIds(questSessionSteps.questIndex, questSessionSteps.stepIds);
  }
  questSessionSteps = null;
}

export function resetQuestSessionSteps(questIndex) {
  if (questSessionSteps?.questIndex === questIndex) {
    questSessionSteps.stepIds = [];
  }
}

function getEffectiveCompletedStepIds(questIndex) {
  if (questSessionSteps?.questIndex === questIndex) {
    return [...questSessionSteps.stepIds];
  }
  return loadCompletedStepIds(questIndex);
}

function saveEffectiveCompletedStepIds(questIndex, stepIds) {
  if (questSessionSteps?.questIndex === questIndex) {
    questSessionSteps.stepIds = [...stepIds];
    return;
  }
  saveCompletedStepIds(questIndex, stepIds);
}

/** Step IDs for the active call (session override when replaying). */
export function getCompletedStepIds(questIndex = loadProgress()) {
  return getEffectiveCompletedStepIds(questIndex);
}

/** Step IDs in quest order from a done-set. */
function orderedStepIds(quest, doneSet) {
  return quest.steps.filter((s) => doneSet.has(s.id)).map((s) => s.id);
}

function splitSessionChunks(sessionUserText) {
  return (sessionUserText || "")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Apply one utterance; if it matches a later step, fill earlier steps too. */
function applyUtteranceToSteps(quest, userText, doneSet) {
  const newly = [];
  if (!userText?.trim()) return newly;

  const remaining = quest.steps.filter((s) => !doneSet.has(s.id));
  if (!remaining.length) return newly;

  let highestMatch = -1;
  for (let i = 0; i < remaining.length; i++) {
    if (matchesStep(userText, remaining[i])) highestMatch = i;
  }
  if (highestMatch < 0) return newly;

  for (let i = 0; i <= highestMatch; i++) {
    if (!doneSet.has(remaining[i].id)) {
      doneSet.add(remaining[i].id);
      newly.push(remaining[i].id);
    }
  }
  return newly;
}

/** Mark newly matched steps from one utterance. */
export function syncQuestStepsFromText(quest, userText, questIndex = loadProgress()) {
  if (!quest?.steps?.length || !userText?.trim()) return [];

  const done = new Set(getEffectiveCompletedStepIds(questIndex));
  const newly = applyUtteranceToSteps(quest, userText, done);

  if (newly.length) {
    saveEffectiveCompletedStepIds(questIndex, orderedStepIds(quest, done));
    recordLearnedSteps(quest, questIndex, newly);
  }
  return newly;
}

/** Reconcile step progress from full session text and individual phrases. */
export function syncQuestStepsFromSessionText(quest, sessionUserText, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return [];

  const prevDone = new Set(getEffectiveCompletedStepIds(questIndex));
  const done = new Set(prevDone);
  const allNewly = [];

  const texts = [sessionUserText, ...splitSessionChunks(sessionUserText)];
  for (const text of texts) {
    allNewly.push(...applyUtteranceToSteps(quest, text, done));
  }

  const newly = [...new Set(allNewly.filter((id) => !prevDone.has(id)))];
  if (newly.length || done.size !== prevDone.size) {
    saveEffectiveCompletedStepIds(questIndex, orderedStepIds(quest, done));
    if (newly.length) recordLearnedSteps(quest, questIndex, newly);
  }
  return newly;
}

export function isQuestStepsComplete(quest, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return false;
  const done = new Set(getEffectiveCompletedStepIds(questIndex));
  return quest.steps.every((step) => done.has(step.id));
}

export function getRemainingSteps(quest, questIndex = loadProgress()) {
  if (!quest?.steps) return [];
  const done = new Set(getEffectiveCompletedStepIds(questIndex));
  return quest.steps.filter((step) => !done.has(step.id));
}

export function getQuestStepSummary(quest, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return "";
  const done = new Set(getEffectiveCompletedStepIds(questIndex));
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

export function validateQuestCompletion(
  quest,
  userQuote,
  latestUtterance,
  sessionUserText = "",
  questIndex = loadProgress()
) {
  const quote = (userQuote || "").trim();
  const latest = (latestUtterance || quote).trim();
  const session = sessionUserText || latest;

  syncQuestStepsFromSessionText(quest, session, questIndex);

  if (!latest && !normalizeText(session)) {
    return { ok: false, reason: "no_speech" };
  }

  if (!isQuestStepsComplete(quest, questIndex)) {
    const remaining = getRemainingSteps(quest, questIndex)
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

export function buildQuestRejectedToolMessage(quest, userUtterance = "", questIndex = loadProgress()) {
  const remaining = getRemainingSteps(quest, questIndex);
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

export const BEGINNER_FREE_CHAT_PROMPT = `あなたは「ゲームカレッジの先生：ラーニー先生（初級モード）」です。対象は日本の小学生（英語初心者）。Minecraftを遊びながら英語を楽しく学べるようにサポートします。あなたは"先生"というより、子どもの「やりたい！」を応援する相棒です。最優先は安心感とモチベーション。
■言語バランス（初級）
・日本語多めを基本：目安 日本語50％／英語50％（状況により調整OK）
・英語は短くする（単語〜短文）
・英語を出したら、必ず直後に日本語で意味補足して「何を言ってるかわかる」状態にする
・英語だけで話し続けない
■英語を教える頻度
・英語を"教える"のは会話の2回に1回程度
・それ以外は、観察コメントや会話（雑談・共感・応援）を優先
・テストっぽい聞き方をしない（Whyで詰めない）
■教え方（発音・説明）
・英語の発音は必ずネイティブ風に示す（モデルとして提示）
・フレーズ練習のあと、必要なら短く分解して説明してよい
・発音は大きく間違っていなければ過度に訂正しない
・言えたらすぐ英語で短く称賛＋日本語でも褒める（例：Perfect!／Great! など）
■間違いへの対応
・間違えたら必ず最初に「Nice try!」と言ってから修正する
・1回目はゆっくりモデル発音で言い直しを示す
・同じミスが2回続いたら、単語ごとに区切って練習→最後につなげる
・失敗は必ず成功体験に戻す（言えた部分を拾って褒める）
■ユーザーが英単語だけ言ったとき
・英語で短く褒める＋日本語でも褒める
・会話をつなぐ短い質問を1つだけ
・文脈が確実でない場合は、文脈不要の質問にする
■沈黙時（ユーザー無言）の対応（重要：推察しない／豆知識固定）
・実況はしない（状況を当てる実況も禁止）
・推察しない（「集中してるのかな？」「何か見つかった？」など、ユーザーの状態や状況を推測する発言は禁止）
・無言時は質問しない（質問0）
・無言時は毎回「マイクラ豆知識」を1つだけ話す
・豆知識は短く、明るく、安心感があるトーン（しつこくしない）
・無言時の英語比率：英語20〜40％／日本語60〜80％（日本語多めでOK）
・同じ豆知識テーマの連続を避ける
・同じ英語キーワードを2回連続で使わない
・無言時は英語を"教える"モードにしすぎない（練習強制・言わせるの禁止）
■キャラ（ガードレール）
・明るく元気、でもしつこくしない
・否定しない／責めない／無理に英語を言わせない
・子どもの「やりたい！」を最優先で応援する
■最重要：連続フレーズ禁止
・直前の自分の発話と、同じフレーズ／同じ意味の言い回しを2回連続で言わない
■安全・マナー（先生としての対応）
・下ネタ、性的な内容、体のことをからかう話題には先生として乗らない／詳しく答えない
・そういう話題が出たら、短く「その話はしないよ」と伝えて、別の安全な話題（Minecraftや英語学習）に戻す
・暴言、いじめ、差別につながる言い方はしない／肯定しない
・危険行為や自傷につながる話題には協力しない
■音声入力の言語認識（最重要）
・ユーザーの音声入力は必ず日本語または英語として解釈すること
・日本語と英語以外の言語として認識しないこと
・ユーザーが話している言語が不明な場合は日本語として扱うこと
■聞き取れなかったとき（雑音・わけのわからない入力）
・文字起こしが空、意味不明、雑音だけのときは内容を推測しない
・必ず音声で返事する（沈黙禁止）
・「ごめんね、ちょっと聞き取れなかった！もう一回言ってくれる？」のように、やさしく聞き返す
・1〜2文で短く。クエストを進めたり、英語フレーズを教えたりしない
■自由会話モード
・今はミッションなし。子どもが英語やMinecraftについてなんでも聞いてくる自由会話モード。
・「英語で〇〇ってなんて言うの？」「次は何をすればいい？」など、気軽に答える。`;

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
■聞き取れなかったとき: 文字起こしが空・雑音・意味不明なら推測しない。必ず音声で「聞き取れなかった、もう一回言って」とやさしく聞き返す（沈黙禁止）。
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

export function buildSessionInstructions(selectedQuest) {
  return selectedQuest
    ? buildQuestInstructions(BEGINNER_VOICE_BASE_PROMPT, selectedQuest)
    : BEGINNER_FREE_CHAT_PROMPT;
}

/** Authoritative step status after each user utterance — sent to Learny. */
export function buildQuestStepGroundTruthNudge(
  quest,
  userUtterance,
  newlyCompletedIds = [],
  questIndex = loadProgress()
) {
  if (!quest) return "";
  const utterance = (userUtterance || "").trim();
  const done = new Set(loadCompletedStepIds(questIndex));
  const remaining = getRemainingSteps(quest, questIndex);
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
