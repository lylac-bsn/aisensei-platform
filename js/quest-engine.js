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

/** First visit: auto-select the current unlocked mission (not free chat). */
export function ensureDefaultMissionSelected() {
  try {
    const raw = localStorage.getItem(SELECTED_QUEST_KEY);
    if (raw !== null) return getSelectedQuestIndex();
    if (isLessonComplete()) return null;
    setSelectedQuestIndex(loadProgress());
    return getSelectedQuestIndex();
  } catch {
    return getSelectedQuestIndex();
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

/** Steps that mean the child finished an action — reject aspiration/modals (need/want/how). */
const STEP_REQUIRES_COMPLETION = new Set([
  "found_tree",
  "got_wood",
  "made_table",
  "placed_table",
  "made_pickaxe",
  "found_stones",
  "got_stones",
  "found_food",
]);

const ASPIRATION_WORDS = [
  "need", "needed", "want", "wanted", "wanna", "gonna", "going", "must",
  "help", "how", "what", "where", "when", "why", "could", "would", "should",
  "please", "maybe", "think", "thought", "wish", "hope", "hoping", "can",
  "cant", "cannot", "dont", "doesnt", "didnt", "will", "shall", "might",
];

/** Salient keyword groups — allowed verb/object synonyms when patterns almost match (allowlist only). */
const STEP_SALIENT_GROUPS = {
  found_tree: [["find", "found", "see", "look"], ["tree"]],
  got_wood: [["get", "got", "have", "chop", "cut", "collect"], ["wood"]],
  made_table: [["made", "crafted", "built", "created"], ["table", "craft"]],
  placed_table: [["put", "place", "placed"], ["here", "down", "there", "table", "craft"]],
  made_pickaxe: [["made", "crafted", "built", "created", "have", "has", "had"], ["pickaxe"]],
  ready: [["ready"]],
  found_stones: [["find", "found", "see"], ["stone", "cobblestone"]],
  got_stones: [["get", "got", "have", "mine", "dig", "collect"], ["stone", "cobblestone"]],
  found_food: [["find", "found", "see"], ["food", "meat", "apple", "beef", "pork", "chicken"]],
  need_food: [["hungry", "hunger", "need", "want"], ["food", "eat"]],
};

/** Max word gap between salient verb and object (STT may insert short fillers). */
const STEP_SALIENT_MAX_GAP = {
  made_table: 3,
  placed_table: 4,
  default: 3,
};

const FILLER_TOKENS = new Set([
  "a", "an", "the", "i", "it", "my", "me", "we", "you", "some", "this", "that",
  "is", "am", "are", "was", "be", "to", "in", "on", "at", "and", "or", "so",
  "very", "really", "just", "now", "go", "one", "two", "three", "four", "five",
  "1", "2", "3", "4", "5",
]);

const stepAllowlistCache = new WeakMap();
const stepObjectAllowlistCache = new WeakMap();

function expandTokenAlternates(token) {
  const alts = new Set([token]);
  const bare = token.replace(/['']/g, "");
  alts.add(bare);
  const canonical = getCanonicalVerb(bare);
  alts.add(canonical);
  for (const [form, root] of Object.entries(VERB_FORMS)) {
    if (root === canonical) alts.add(form);
  }
  if (PLURAL_TO_SINGULAR[bare]) alts.add(PLURAL_TO_SINGULAR[bare]);
  for (const [plural, singular] of Object.entries(PLURAL_TO_SINGULAR)) {
    if (singular === bare) alts.add(plural);
  }
  return alts;
}

/** Allowlisted tokens derived from step patterns + explicit synonym groups — nothing else passes. */
function getStepAllowlist(step) {
  if (!step?.patterns?.length) return new Set(FILLER_TOKENS);
  if (stepAllowlistCache.has(step)) return stepAllowlistCache.get(step);

  const allowed = new Set(FILLER_TOKENS);
  const salient = STEP_SALIENT_GROUPS[step.id];
  if (salient) {
    for (const group of salient) {
      for (const kw of group) {
        for (const alt of expandTokenAlternates(kw)) allowed.add(alt);
      }
    }
  }
  for (const pattern of step.patterns) {
    if (!isEnglishPattern(pattern)) continue;
    const norm = normalizeEnglishForMatching(pattern);
    for (const token of norm.split(/\s+/).filter(Boolean)) {
      for (const alt of expandTokenAlternates(token)) allowed.add(alt);
    }
  }

  stepAllowlistCache.set(step, allowed);
  return allowed;
}

/** Content nouns/adjectives allowed for this step (from patterns + salient object group). */
function getStepObjectAllowlist(step) {
  if (!step?.patterns?.length) return new Set();
  if (stepObjectAllowlistCache.has(step)) return stepObjectAllowlistCache.get(step);

  const objects = new Set();
  const salientObjects = STEP_SALIENT_GROUPS[step.id]?.[1];
  if (salientObjects) {
    for (const kw of salientObjects) {
      for (const alt of expandTokenAlternates(kw)) objects.add(alt);
    }
  }
  for (const pattern of step.patterns) {
    if (!isEnglishPattern(pattern)) continue;
    const norm = normalizeEnglishForMatching(pattern);
    for (const token of norm.split(/\s+/).filter(Boolean)) {
      if (FILLER_TOKENS.has(token)) continue;
      if (isVerbToken(token)) continue;
      for (const alt of expandTokenAlternates(token)) objects.add(alt);
    }
  }

  stepObjectAllowlistCache.set(step, objects);
  return objects;
}

function textWords(text) {
  return normalizeEnglishForMatching(text).split(/\s+/).filter(Boolean);
}


function textUsesOnlyAllowlistedWords(text, step) {
  const allowed = getStepAllowlist(step);
  return textWords(text).every((word) => allowed.has(word));
}

function textHasNonAllowlistedContentWord(text, step) {
  const allowed = getStepAllowlist(step);
  return textWords(text).some((word) => !FILLER_TOKENS.has(word) && !allowed.has(word));
}

function textHasAllowlistedObject(text, step) {
  const objects = getStepObjectAllowlist(step);
  if (!objects.size) {
    return textWords(text).some((word) => getStepAllowlist(step).has(word));
  }
  const words = textWords(text);
  return words.some((word) => objects.has(word));
}

function textHasAspiration(text) {
  const words = textWords(text);
  return ASPIRATION_WORDS.some((aspiration) => words.includes(aspiration));
}

/** Past-tense / completion verbs required for action steps (blocks bare "craft table"). */
const STEP_COMPLETION_VERBS = {
  found_tree: ["found", "find", "see", "saw", "look"],
  got_wood: ["got", "get", "have", "had", "chop", "chopped", "cut", "collect", "collected"],
  made_table: ["made", "crafted", "built", "created"],
  placed_table: ["put", "placed", "place"],
  made_pickaxe: ["made", "crafted", "built", "created", "have", "has", "had"],
  found_stones: ["found", "find", "see", "saw"],
  got_stones: ["got", "get", "have", "mine", "mined", "dig", "dug", "collect", "collected"],
  found_food: ["found", "find", "see", "saw"],
};

function stepCompletionVerbWords(step) {
  const expanded = new Set();
  for (const verb of STEP_COMPLETION_VERBS[step?.id] || []) {
    for (const alt of expandTokenAlternates(verb)) expanded.add(alt);
  }
  return expanded;
}

function textHasCompletionVerb(text, step) {
  const verbs = stepCompletionVerbWords(step);
  if (!verbs.size) return true;
  const words = textWords(text);
  return words.some((word) => verbs.has(word));
}

function patternRequiresCompletionVerb(pattern) {
  const norm = normalizeEnglishForMatching(pattern);
  const first = norm.split(/\s+/).filter(Boolean)[0];
  if (!first || first === "i") {
    const second = norm.split(/\s+/).filter(Boolean)[1];
    return second ? isVerbToken(second) || ["made", "got", "found", "placed", "built", "crafted", "created", "chop", "cut", "mine", "dig", "collect"].includes(second) : false;
  }
  return isVerbToken(first) || ["made", "got", "found", "placed", "built", "crafted", "created"].includes(first);
}

function matchesStepSalient(text, step) {
  const groups = STEP_SALIENT_GROUPS[step?.id];
  if (!groups?.length) return false;
  if (!textUsesOnlyAllowlistedWords(text, step)) return false;

  const words = textWords(text);
  if (!words.length) return false;

  if (groups.length === 1) {
    return groups[0].some((keyword) => words.includes(keyword));
  }

  const verbKeywords = groups[0];
  const objectAllow = getStepObjectAllowlist(step);
  const completionVerbs = stepCompletionVerbWords(step);
  const strictVerbGroup = STEP_REQUIRES_COMPLETION.has(step.id);

  const verbPositions = [];
  words.forEach((word, idx) => {
    if (strictVerbGroup && completionVerbs.has(word)) verbPositions.push(idx);
    else if (!strictVerbGroup && verbKeywords.includes(word)) verbPositions.push(idx);
  });

  const objectPositions = [];
  words.forEach((word, idx) => {
    if (objectAllow.has(word)) objectPositions.push(idx);
  });

  if (!verbPositions.length || !objectPositions.length) return false;

  const maxGap = STEP_SALIENT_MAX_GAP[step.id] ?? STEP_SALIENT_MAX_GAP.default;
  for (const p0 of verbPositions) {
    for (const p1 of objectPositions) {
      if (Math.abs(p0 - p1) <= maxGap) return true;
    }
  }

  return false;
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
    if (buildFlexibleEnglishRegex(normPattern).test(normText)) {
      if (patternRequiresCompletionVerb(pattern) || !textHasAspiration(text)) {
        return true;
      }
    }
    const regex = new RegExp(escapeRegex(p).replace(/\s+/g, "\\s+"), "i");
    if (regex.test(lower)) {
      return patternRequiresCompletionVerb(pattern) || !textHasAspiration(text);
    }
    return false;
  }

  if (new RegExp(`\\b${escapeRegex(normPattern)}\\b`, "i").test(normText)) return true;
  return new RegExp(`\\b${escapeRegex(p)}\\b`, "i").test(lower);
}

function isEnglishPattern(pattern) {
  return !/[\u3040-\u30ff\u3400-\u9fff]/.test(pattern || "");
}

function stepRequiresEnglish(step) {
  return Boolean(step?.patterns?.length && step.patterns.every(isEnglishPattern));
}

function userTextHasEnglish(text) {
  return /[a-zA-Z]/.test(text || "");
}

/** True when the utterance is mostly Japanese (not an English attempt). */
export function isPrimarilyJapanese(text) {
  const t = (text || "").trim();
  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(t)) return false;
  const ja = (t.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  const en = (t.match(/[a-zA-Z]/g) || []).length;
  return ja > 0 && ja >= en;
}

function hasEnglishPatternMatch(text, step) {
  if (!userTextHasEnglish(text)) return false;
  return step.patterns.some(
    (pattern) => isEnglishPattern(pattern) && matchesPhrase(text, pattern)
  );
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

/** Compact mission snapshot with a single "you direct" line for Learny. */
export function buildActiveMissionHeader(quest, questIndex = loadProgress()) {
  if (!quest?.steps?.length) return "";

  const idx =
    Number.isFinite(questIndex) && questIndex >= 0 ? questIndex : getQuestIndex(quest);
  const missionNum = idx >= 0 ? idx + 1 : "?";
  const doneIds = getCompletedStepIds(idx);
  const remaining = getRemainingSteps(quest, idx);

  const progress = quest.steps
    .map((s, i) => {
      const mark = doneIds.includes(s.id) ? "✓" : "○";
      return `${i + 1}${mark}`;
    })
    .join(" ");

  if (!remaining.length) {
    return (
      `Mission ${missionNum}/${LESSON_1_QUESTS.length}: ${quest.titleEn || quest.title} | ` +
      `All steps done (${progress}) → call complete_quest, then celebrate once.`
    );
  }

  const next = remaining[0];
  const phrase = next.patterns?.[0] || "";
  return (
    `Mission ${missionNum}/${LESSON_1_QUESTS.length}: ${quest.titleEn || quest.title} | ` +
    `Progress ${progress} | NEXT: ${next.label} → guide Minecraft action, then have them say "${phrase}"`
  );
}

/** Bilingual rule for all spoken Learny replies (beginner). */
export const BILINGUAL_RESPONSE_RULE =
  "Every spoken reply in ONE turn: English first, then the same meaning in Japanese right after. Never English-only or Japanese-only.";

/** Warm, kid-friendly tone — primary students, fun Minecraft buddy (not a stiff teacher). */
export const LEARNY_FRIENDLY_TONE =
  "Sound like a fun Minecraft buddy for Japanese elementary kids — warm, casual, upbeat. " +
  "Use simple words. EN: Cool! Awesome! Nice one! Let's go! You got this! " +
  "JP: だよ・だね・しよう・ね（友だちっぽく）。すごい！やったー！いいね！ " +
  "Never stiff, lecture-y, or overly polite (です・ますだらけ・堅い敬語は避ける). " +
  "Short sentences. Smile in your voice. Make English feel fun, not like homework.";

/** What Learny should do this turn — one clear instruction. */
function buildStepDirective(
  quest,
  nextStep,
  { stepJustCompleted = false, japaneseOnly = false, alreadyAudible = false, wrongAttempt = false } = {}
) {
  if (!nextStep) {
    return "All steps done → call complete_quest once, then one short celebration (EN then JP).";
  }

  const phrase = nextStep.patterns?.[0] || "";
  const coachHint = nextStep.coachNote
    ? " (Give quick pronunciation tips only — do not say the English phrase twice.)"
    : "";

  if (wrongAttempt) {
    return (
      `Wrong phrase — step NOT recorded. Do NOT celebrate, praise, or say they said "${phrase}" correctly. ` +
      `Gently encourage (EN then JP), teach "${phrase}" once${coachHint}, invite them to try again.`
    );
  }

  if (stepJustCompleted) {
    if (!nextStep) {
      return "All steps done → call complete_quest once, then one short fun celebration (EN then JP).";
    }
    if (alreadyAudible) {
      return (
        `Step already recorded — do NOT repeat praise or quote the child again. ` +
        `Briefly guide ONLY the next Minecraft step and English phrase: "${phrase}". ` +
        `Do NOT say mission complete yet.`
      );
    }
    return (
      `Step done — hype them up briefly (EN then JP, friendly!), then guide the next step: ` +
      `"${nextStep.label}" in Minecraft, then say "${phrase}". Do NOT say mission complete yet.`
    );
  }

  if (japaneseOnly) {
    if (alreadyAudible) {
      return (
        `They reported success in Japanese only — do NOT repeat your earlier reply. ` +
        `Teach "${phrase}" once${coachHint}, invite them to try it in English. ` +
        `Do not mark step done until English is spoken.`
      );
    }
    return (
      `They reported success in Japanese only — cheer them on (EN then JP), teach "${phrase}" once${coachHint}, ` +
      `invite them to try it in English. Do not mark step done until English is spoken.`
    );
  }

  return (
    `Reply warmly to what they said (EN then JP), then guide the next Minecraft move ` +
    `and the English to say: "${phrase}". Keep it 1–3 short fun sentences, EN then JP. ` +
    `Do NOT celebrate or say they got the phrase right unless the app recorded the step.`
  );
}

/** Appended to quest tracker nudges so Learny speaks instead of going silent. */
export const QUEST_TRACKER_SPEAK_IF_SILENT =
  "If you have not replied yet this turn, speak once aloud (audio). If you already spoke, stay silent.";

export const QUEST_TRACKER_NO_REPEAT =
  "Say each idea once this turn — do not repeat sentences, praise, or the English phrase.";

/** @deprecated use QUEST_TRACKER_SPEAK_IF_SILENT */
export const QUEST_TRACKER_SPEAK_NOW = QUEST_TRACKER_SPEAK_IF_SILENT;

/** Nudge when the child spoke clearly but Learny produced no audible reply. */
export function buildNoAudioRecoveryNudge(userUtterance = "", quest = null, questIndex = null) {
  const transcript = (userUtterance || "").trim();
  const mission = quest ? `${buildActiveMissionHeader(quest, questIndex ?? loadProgress())}. ` : "";
  return (
    `[Speak now] ${mission}` +
    (transcript ? `Child said: "${transcript}". ` : "") +
    `Reply in 1–2 short friendly sentences (EN then JP). Guide them to the NEXT step above.`
  );
}

/** Nudge Learny to ask the child to repeat after unclear/noise input. */
export function buildUnclearInputRepeatNudge(userUtterance = "", quest = null, questIndex = null) {
  const mission = quest ? `${buildActiveMissionHeader(quest, questIndex ?? loadProgress())}. ` : "";
  return (
    `[Speak now] ${mission}Could not hear clearly — ask them to say it again, gently and casually (1–2 sentences, EN then JP). ` +
    `Do not advance steps or guess what they meant.`
  );
}

export function matchesStep(text, step) {
  if (!step?.patterns?.length) return false;
  if (!textUsesOnlyAllowlistedWords(text, step)) return false;
  if (STEP_REQUIRES_COMPLETION.has(step.id) && textHasAspiration(text)) return false;
  const patternMatched = step.patterns.some((pattern) => matchesPhrase(text, pattern));
  const salientMatched = !patternMatched && matchesStepSalient(text, step);
  if (!patternMatched && !salientMatched) return false;
  if (STEP_REQUIRES_COMPLETION.has(step.id) && !textHasCompletionVerb(text, step)) return false;
  if (
    STEP_REQUIRES_COMPLETION.has(step.id) &&
    getStepObjectAllowlist(step).size &&
    !textHasAllowlistedObject(text, step)
  ) {
    return false;
  }
  if (stepRequiresEnglish(step) && !userTextHasEnglish(text)) {
    return false;
  }
  if (stepRequiresEnglish(step) && isPrimarilyJapanese(text) && !hasEnglishPatternMatch(text, step)) {
    return false;
  }
  return true;
}

/** User tried the step phrase in English but wording did not match (wrong word, typo, etc.). */
export function userMissedEnglishStepPhrase(text, step) {
  if (!step?.patterns?.length) return false;
  if (!stepRequiresEnglish(step)) return false;
  if (!userTextHasEnglish(text)) return false;
  if (matchesStep(text, step)) return false;
  if (STEP_REQUIRES_COMPLETION.has(step.id) && textHasAspiration(text)) return false;
  if (!textHasCompletionVerb(text, step)) return false;
  if (textHasNonAllowlistedContentWord(text, step)) return true;
  if (STEP_REQUIRES_COMPLETION.has(step.id) && !textHasAllowlistedObject(text, step)) return true;
  return false;
}

/** Drop English-only steps that lack an English utterance in this session. */
export function reconcileEnglishStepProof(
  quest,
  questIndex = loadProgress(),
  sessionUtterances = []
) {
  if (!quest?.steps?.length) return [];

  const utterances = (sessionUtterances || []).map((u) => (u || "").trim()).filter(Boolean);
  const done = new Set(getEffectiveCompletedStepIds(questIndex));
  const removed = [];

  for (const step of quest.steps) {
    if (!done.has(step.id) || !stepRequiresEnglish(step)) continue;
    const proved = utterances.some(
      (u) =>
        matchesStep(u, step) &&
        userTextHasEnglish(u) &&
        (!isPrimarilyJapanese(u) || hasEnglishPatternMatch(u, step))
    );
    if (!proved) {
      done.delete(step.id);
      removed.push(step.id);
    }
  }

  if (removed.length) {
    saveEffectiveCompletedStepIds(questIndex, orderedStepIds(quest, done));
  }
  return removed;
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
/** Step IDs already complete when the current call began (resume / partial progress). */
let questSessionBaselineStepIds = null;

export function isQuestReplay(questIndex) {
  if (!Number.isFinite(questIndex) || questIndex < 0) return false;
  return questIndex < loadProgress();
}

/** Step IDs that were already done before this call (for session phrase verification). */
export function getSessionBaselineStepIds(questIndex) {
  if (questSessionSteps?.questIndex === questIndex && questSessionBaselineStepIds) {
    return [...questSessionBaselineStepIds];
  }
  return [];
}

/** Start a call session — step progress is tracked in memory for the active call. */
export function beginQuestSession(questIndex) {
  if (!Number.isFinite(questIndex) || questIndex < 0) {
    questSessionSteps = null;
    questSessionBaselineStepIds = null;
    return;
  }
  const stepIds = isQuestReplay(questIndex) ? [] : [...loadCompletedStepIds(questIndex)];
  questSessionBaselineStepIds = [...stepIds];
  questSessionSteps = {
    questIndex,
    stepIds,
  };
}

export function endQuestSession() {
  if (questSessionSteps && !isQuestReplay(questSessionSteps.questIndex)) {
    saveCompletedStepIds(questSessionSteps.questIndex, questSessionSteps.stepIds);
  }
  questSessionSteps = null;
  questSessionBaselineStepIds = null;
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

/** Texts to scan for step phrases — prefer per-utterance list over one joined string. */
function sessionTextsForMatching(sessionUserText, sessionUtterances = null) {
  if (Array.isArray(sessionUtterances) && sessionUtterances.length) {
    return sessionUtterances.map((t) => (t || "").trim()).filter(Boolean);
  }
  const joined = (sessionUserText || "").trim();
  if (!joined) return [];
  return [joined, ...splitSessionChunks(joined)];
}

/** Apply one utterance — marks only the highest matched remaining step. */
function applyUtteranceToSteps(quest, userText, doneSet) {
  const newly = [];
  if (!userText?.trim()) return newly;

  const remaining = quest.steps.filter((s) => !doneSet.has(s.id));
  if (!remaining.length) return newly;

  let highestMatch = -1;
  for (let i = 0; i < remaining.length; i++) {
    const step = remaining[i];
    if (!matchesStep(userText, step)) continue;
    if (
      stepRequiresEnglish(step) &&
      isPrimarilyJapanese(userText) &&
      !hasEnglishPatternMatch(userText, step)
    ) {
      continue;
    }
    highestMatch = i;
  }
  if (highestMatch < 0) return newly;

  const matchedStep = remaining[highestMatch];
  if (!doneSet.has(matchedStep.id)) {
    doneSet.add(matchedStep.id);
    newly.push(matchedStep.id);
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
export function syncQuestStepsFromSessionText(
  quest,
  sessionUserText,
  questIndex = loadProgress(),
  sessionUtterances = null
) {
  if (!quest?.steps?.length) return [];

  const prevDone = new Set(getEffectiveCompletedStepIds(questIndex));
  const done = new Set(prevDone);
  const allNewly = [];

  const texts = sessionTextsForMatching(sessionUserText, sessionUtterances);
  for (const text of texts) {
    allNewly.push(...applyUtteranceToSteps(quest, text, done));
  }

  const newly = [...new Set(allNewly.filter((id) => !prevDone.has(id)))];
  if (newly.length || done.size !== prevDone.size) {
    saveEffectiveCompletedStepIds(questIndex, orderedStepIds(quest, done));
    if (newly.length) recordLearnedSteps(quest, questIndex, newly);
  }
  reconcileEnglishStepProof(quest, questIndex, sessionUtterances);
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

const HOSTILE_OFF_TOPIC_RE = [
  /\bi\s+hate\b/i,
  /\bhate\s+you\b/i,
  /\bstupid\b/i,
  /\bidiot\b/i,
  /\bshut\s+up\b/i,
  /\bdon'?t\s+want\s+to\s+talk\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\bgo\s+away\b/i,
  /\byou\s+suck\b/i,
  /\bboring\b/i,
  /\bdumb\b/i,
  /\bkill\s+you\b/i,
  /^いやだ$/,
  /^やだ$/,
  /^いや$/,
  /^だめ$/,
];

/** Upset, hostile, or refusal — not a quest step; must not trigger completion. */
export function isHostileOrOffTopicUtterance(text) {
  const t = (text || "").trim();
  if (!t) return false;
  return HOSTILE_OFF_TOPIC_RE.some((re) => re.test(t));
}

const PREMATURE_COMPLETE_RE = [
  /mission\s+complete/i,
  /completed\s+the\s+mission/i,
  /quest\s+complete/i,
  /you'?ve\s+completed/i,
  /you\s+completed\s+the/i,
  /ミッションクリア/,
  /クエストクリア/,
  /ミッションをクリア/,
  /クエストをクリア/,
];

/** Learny claimed the mission is done (may be a hallucination). */
export function assistantClaimsQuestComplete(text) {
  const t = (text || "").trim();
  if (!t) return false;
  return PREMATURE_COMPLETE_RE.some((re) => re.test(t));
}

/** Step phrases that must be spoken this call (skips steps done before the call started). */
export function verifyAllStepsHeardInSession(
  quest,
  sessionUserText,
  questIndex = null,
  sessionUtterances = null
) {
  if (!quest?.steps?.length) return false;

  const baseline =
    Number.isFinite(questIndex) && questIndex >= 0
      ? new Set(getSessionBaselineStepIds(questIndex))
      : new Set();
  const stepsToVerify = quest.steps.filter((step) => !baseline.has(step.id));
  if (!stepsToVerify.length) return true;

  const chunks = sessionTextsForMatching(sessionUserText, sessionUtterances);
  if (!chunks.length) return false;

  return stepsToVerify.every((step) =>
    chunks.some((chunk) => {
      if (!matchesStep(chunk, step)) return false;
      if (!stepRequiresEnglish(step)) return true;
      return (
        userTextHasEnglish(chunk) &&
        (!isPrimarilyJapanese(chunk) || hasEnglishPatternMatch(chunk, step))
      );
    })
  );
}

export function buildHostileRedirectNudge(quest, userUtterance = "", questIndex = loadProgress()) {
  const next = getRemainingSteps(quest, questIndex)[0];
  const directive = buildStepDirective(quest, next);
  const mission = buildActiveMissionHeader(quest, questIndex);
  const transcript = (userUtterance || "").trim();
  return (
    `[Speak now] ${mission} Child sounded upset or off-topic` +
    (transcript ? ` ("${transcript}")` : "") +
    `. Respond kindly and casually (EN then JP) — no lecturing — then gently bring them back to the Minecraft step. ` +
    `${directive} Do NOT say mission complete or call complete_quest.`
  );
}

/** Learny credited a step when the child did not say the correct English phrase. */
export function assistantFalselyCreditsEnglishStep(
  assistantText,
  quest,
  latestUserText,
  questIndex = loadProgress()
) {
  const assistant = (assistantText || "").trim();
  const latest = (latestUserText || "").trim();
  if (!assistant || !latest || !quest?.steps?.length) return null;

  const remaining = getRemainingSteps(quest, questIndex);
  const next = remaining[0];
  const praiseOrCredit =
    /great job|awesome|well done|good job|nice one|perfect|you said|you got it|mission complete|ミッションクリア|すごい|おめでとう|言えた|言ってくれ|って言って/i.test(
      assistant
    );

  if (next && stepRequiresEnglish(next) && !matchesStep(latest, next)) {
    const quotesExpected = next.patterns.some((pattern) => {
      if (!isEnglishPattern(pattern)) return false;
      const salientObjects = STEP_SALIENT_GROUPS[next.id]?.[1];
      if (salientObjects?.length) {
        return salientObjects.some(
          (kw) => kw.length >= 4 && assistant.toLowerCase().includes(kw)
        );
      }
      const tail = normalizeEnglishForMatching(pattern).split(/\s+/).slice(-1)[0];
      return tail.length >= 4 && assistant.toLowerCase().includes(tail);
    });
    if (userMissedEnglishStepPhrase(latest, next) && (praiseOrCredit || quotesExpected)) {
      return next;
    }
  }

  if (!isPrimarilyJapanese(latest) || userTextHasEnglish(latest)) return null;
  if (!praiseOrCredit) return null;

  for (const step of quest.steps) {
    if (!stepRequiresEnglish(step)) continue;
    const quoted = step.patterns.some((pattern) =>
      assistant.toLowerCase().includes(pattern.toLowerCase())
    );
    if (!quoted) continue;
    if (userHintsStepSuccessInJapanese(latest, step)) return step;
  }
  return null;
}

export const assistantFalselyCreditsStep = assistantFalselyCreditsEnglishStep;

export function buildWrongStepPhraseCorrectionNudge(
  quest,
  step,
  userUtterance = "",
  questIndex = loadProgress()
) {
  const phrase = step?.patterns?.[0] || "";
  const mission = buildActiveMissionHeader(quest, questIndex);
  const transcript = (userUtterance || "").trim();
  return (
    `[Correction] ${mission} Step NOT recorded — child did NOT say the correct phrase` +
    (transcript ? ` (said "${transcript}")` : "") +
    `. Do NOT celebrate or say they got "${phrase}" right. ` +
    `Warmly encourage (EN then JP), teach "${phrase}" once with quick pronunciation help, invite retry. ` +
    `Do NOT say mission complete / ミッションクリア. ${QUEST_TRACKER_NO_REPEAT}`
  );
}

export function buildJapaneseOnlyStepCorrectionNudge(
  quest,
  step,
  userUtterance = "",
  questIndex = loadProgress()
) {
  const phrase = step?.patterns?.[0] || "";
  const mission = buildActiveMissionHeader(quest, questIndex);
  const transcript = (userUtterance || "").trim();
  return (
    `[Correction] ${mission} Child spoke Japanese only` +
    (transcript ? ` ("${transcript}")` : "") +
    `. Do NOT say they said the English phrase or mark the step done. ` +
    `Cheer what they did in Minecraft (EN then JP), teach "${phrase}" once, invite them to try it in English. ` +
    `Do NOT say mission complete / ミッションクリア.`
  );
}

export function buildPrematureCompleteCorrectionNudge(quest, questIndex = loadProgress()) {
  const remaining = getRemainingSteps(quest, questIndex);
  const next = remaining[0];
  const mission = buildActiveMissionHeader(quest, questIndex);
  const directive = buildStepDirective(quest, next);
  return (
    `[Correction] ${mission} NOT complete — ${remaining.length} step(s) remain. ` +
    `Do NOT say mission complete / ミッションクリア. ` +
    `If you already gave an audible reply, do not repeat it. ` +
    `Otherwise guide the next step once (EN then JP): ${directive}`
  );
}

export function validateQuestCompletion(
  quest,
  userQuote,
  latestUtterance,
  sessionUserText = "",
  questIndex = loadProgress(),
  sessionUtterances = null
) {
  const quote = (userQuote || "").trim();
  const latest = (latestUtterance || quote).trim();
  const session = sessionUserText || latest;

  syncQuestStepsFromSessionText(quest, session, questIndex, sessionUtterances);
  reconcileEnglishStepProof(quest, questIndex, sessionUtterances);
  syncQuestStepsFromText(quest, latest, questIndex);

  if (!latest && !normalizeText(session)) {
    return { ok: false, reason: "no_speech" };
  }

  if (!isQuestStepsComplete(quest, questIndex)) {
    const remaining = getRemainingSteps(quest, questIndex)
      .map((s) => s.label)
      .join(", ");
    if (isHostileOrOffTopicUtterance(latest)) {
      return { ok: false, reason: "hostile_or_off_topic", remaining };
    }
    return { ok: false, reason: "steps_incomplete", remaining };
  }

  if (!verifyAllStepsHeardInSession(quest, session, questIndex, sessionUtterances)) {
    const remaining = getRemainingSteps(quest, questIndex)
      .map((s) => s.label)
      .join(", ");
    return { ok: false, reason: "steps_not_in_session", remaining };
  }

  if (isHostileOrOffTopicUtterance(latest)) {
    return { ok: false, reason: "hostile_or_off_topic" };
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

export function buildQuestRejectedToolMessage(
  quest,
  userUtterance = "",
  questIndex = loadProgress(),
  reason = ""
) {
  const remaining = getRemainingSteps(quest, questIndex);
  const next = remaining[0];
  const mission = buildActiveMissionHeader(quest, questIndex);
  const directive = buildStepDirective(quest, next);
  const transcript = (userUtterance || "").trim();
  let prefix = `${mission} Not complete yet — ${remaining.length} step(s) left. `;
  if (reason === "hostile_or_off_topic") {
    prefix += "Child was upset/off-topic — empathize and redirect, do NOT celebrate completion. ";
  } else if (reason === "steps_not_in_session") {
    prefix += "Required English step phrases were not all spoken this session. ";
  }
  return (
    prefix +
    (transcript ? `Transcript: "${transcript}". ` : "") +
    `${directive} Do NOT call complete_quest yet. Do NOT say mission complete. ` +
    `If you already gave an audible reply this turn, do not repeat it — wait for the child.`
  );
}

export function buildQuestRecordedToolMessage(quest, userQuote, alreadySpoke = false) {
  if (alreadySpoke) {
    return (
      "Quest recorded. You already replied audibly this turn — do NOT speak again or repeat congratulations. " +
      "End your turn silently now."
    );
  }
  const quote = userQuote ? `The user said: "${userQuote}". ` : "";
  return (
    `${quote}Quest recorded. Give ONE brief celebration (1–2 sentences, EN then JP) for "${quest?.goal || ""}", ` +
    `then END your turn. Do not repeat or add a second congratulations.`
  );
}

export function buildQuestFarewellNudge(quest, userQuote) {
  const quote = userQuote ? `They said: "${userQuote}". ` : "";
  return (
    `${quote}Quest complete! Say ONE short fun celebration (1–2 sentences, buddy hype): ` +
    `connect to their Minecraft win ("${quest?.goal || ""}"), ` +
    `English first, then casual Japanese. ` +
    `Then END your turn. Do NOT repeat or give a second congratulations.`
  );
}

export function buildQuestCompleteTrackerNudge() {
  return (
    `All steps done → call complete_quest once with latest English transcript. ` +
    `Celebrate only after tool confirms. ${QUEST_TRACKER_SPEAK_NOW}`
  );
}

export function buildQuestAlreadyRecordedToolMessage() {
  return "Quest already recorded. Do not repeat congratulations or mention completion again.";
}

export const BEGINNER_FREE_CHAT_PROMPT = `あなたはゲームカレッジの「ラーニー先生」— 日本の小学生とマイクラを一緒に楽しむ、やさしくて元気な相棒。堅い先生じゃなく、ゲーム仲間のお兄さん・お姉さんみたいに話す。

■キャラ: 明るい・フレンドリー・ちょっとおどけてOK。「やったー！」「すごい！」「いいね！」をよく使う。英語は宿題じゃなくて、ゲームの楽しいパート。
■話し方（必須）: 毎ターン「英語→日本語」。先に英語で1〜3文（かんたんな言葉）、すぐ同じ意味を日本語で（だよ・だね・しよう）。英語だけ・日本語だけ禁止。間違いは「Nice try!」からやさしく。
■一緒に遊ぶ: 迷ったら「次はこれやってみよう！」と具体的に（EN→JP）。質問攻めにしない。
■無言時: マイクラの豆知識を1つ、楽しそうに（EN→JP）。
■聞き取れず: 「もう一回言ってみて！」くらいカジュアルに（EN→JP）。
■安全: 不適切な話はやんわり断って、ゲームに戻す。

■自由会話モード — 英語やマイクラの質問に、友だちみたいに気軽に答える。`;

export const BEGINNER_VOICE_BASE_PROMPT = `あなたはゲームカレッジの「ラーニー先生」— 日本の小学生とマイクラ英語ミッションを一緒にクリアする、やさしくて元気な相棒。堅い先生・講義口調はNG。ゲーム仲間として楽しくリードする。

■キャラ: 明るい・フレンドリー・テンポよく。「やったー！」「すごい！」「いいね！」「Let's go!」を自然に。子どもが話しかけやすい雰囲気。
■話し方（必須）: 毎ターン「英語→日本語」。先に英語（かんたん・短く）、すぐ日本語（だよ・だね・しよう）。英語だけ・日本語だけ禁止。褒めるときはテンション高め（EN→JP）。**同じターンで同じ文・お祝いを2回言わない。**
■ミッションの進め方（最重要）: ゲームのナビ役。毎ターン「マイクラで次に何する？」「できたら何て言う？」を楽しそうに案内（EN→JP）。迷ったらすぐ具体例。雑談→フレンドリーに返して（EN→JP）すぐステップへ。
■ステップ達成: そのステップの**正しい英文**だけOK（アプリが記録したときだけ祝う）。それ以外の単語・間違い→祝わない、やさしく訂正。日本語だけ→喜んで（EN→JP）→英文を1回教えて一緒に言ってみよう。
■ミッション完了: 全ステップ完了→complete_quest→お祝い1回（EN→JP、ワクワク！）。**complete_quest前に「クリア」「mission complete」は絶対言わない。**
■怒った・しぶるとき: やさしく受け止めて（EN→JP）、責めずにゲームに戻す。完了とは言わない。
■無言/聞き取れず: 推測しない。カジュアルに聞き返すか、次の一手をリマインド（EN→JP）。
■安全: 不適切な話はやんわり断って、ミッションに戻す。`;

export function buildQuestOpeningNudge(quest, questIndex = loadProgress()) {
  if (!quest) return "";
  const firstStep = quest.steps?.[0];
  const firstPhrase = firstStep?.patterns?.[0] || "";
  const playLead = quest.openingPlay || `まずは${quest.goal}をマイクラでやってみよう！`;
  const mission = buildActiveMissionHeader(quest, questIndex);
  return (
    `${mission}\n` +
    `You open the call — speak first (2–3 short fun sentences, audio). Warm buddy energy. English first, then Japanese.\n` +
    `1) Hype the Minecraft action NOW: ${playLead}\n` +
    (firstPhrase ? `2) Tell them the English when done: "${firstPhrase}"\n` : "") +
    `3) End cheerfully — e.g. 「やってみよう！」 / "Let's go!" — and listen.`
  );
}

export function buildQuestInstructions(basePrompt, quest, questIndex = null) {
  if (!quest) return basePrompt;

  const idx =
    Number.isFinite(questIndex) && questIndex >= 0 ? questIndex : getQuestIndex(quest);
  const missionNum = idx >= 0 ? idx + 1 : "?";

  const stepLines = (quest.steps || []).map(
    (step, i) => `  ${i + 1}. ${step.label} — "${step.patterns[0]}"`
  );

  const block = [
    "",
    `■ミッション ${missionNum}/${LESSON_1_QUESTS.length}: ${quest.titleEn || quest.title}`,
    `■ゴール: ${quest.goal}`,
    "■ステップ（全部必要）:",
    ...stepLines,
    "■進め方: 楽しくナビ→マイクラの行動→成功時の英文→待つ。各ターン→フレンドリーに次のステップへ。全完了→complete_quest→お祝い1回。",
    "■話し方: 英語→日本語。かんたん・元気・友だち口調。堅い敬語・講義口調は避ける。",
    "■禁止: ステップ残りでクリア宣言。complete_quest前のお祝い。次ミッションの話。同じ英文の連続リピート。子どもの怒り・拒否を完了とみなすこと。",
  ].join("\n");

  return `${basePrompt}\n${block}`;
}

const STEP_JAPANESE_SUCCESS_HINTS = {
  found_tree: ["見つけ", "見っけ", "あった", "アタッ", "発見", "木がある", "木を見"],
  got_wood: ["手に入", "切っ", "伐採", "木材", "ウッド", "取っ", "ゲット", "集め"],
  made_table: ["作っ", "作業台", "クラフト", "できた"],
  placed_table: ["置い", "置き", "置く", "ここに"],
  made_pickaxe: ["ツルハシ", "ピッケ", "作っ", "作れた", "つくれた", "できた", "デキタ"],
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

export function buildSessionInstructions(selectedQuest, questIndex = null) {
  const tone = `\n■トーン: ${LEARNY_FRIENDLY_TONE}`;
  if (!selectedQuest) return `${BEGINNER_FREE_CHAT_PROMPT}${tone}`;
  const idx =
    Number.isFinite(questIndex) && questIndex >= 0
      ? questIndex
      : getQuestIndex(selectedQuest);
  return buildQuestInstructions(`${BEGINNER_VOICE_BASE_PROMPT}${tone}`, selectedQuest, idx);
}

/** Short per-turn directive — mission state + one action for Learny. */
export function buildQuestStepGroundTruthNudge(
  quest,
  userUtterance,
  newlyCompletedIds = [],
  questIndex = loadProgress(),
  alreadyAudible = false,
  { compact = false } = {}
) {
  if (!quest) return "";
  const utterance = (userUtterance || "").trim();
  const remaining = getRemainingSteps(quest, questIndex);
  const next = remaining[0] || null;
  const stepJustCompleted = newlyCompletedIds.length > 0;
  const japaneseOnly =
    !stepJustCompleted && next && utterance && userHintsStepSuccessInJapanese(utterance, next);
  const wrongAttempt =
    !stepJustCompleted && next && utterance && userMissedEnglishStepPhrase(utterance, next);

  const directive = buildStepDirective(quest, next, {
    stepJustCompleted,
    japaneseOnly,
    alreadyAudible,
    wrongAttempt,
  });

  if (compact) {
    const status = stepJustCompleted
      ? "Step recorded."
      : wrongAttempt
        ? "Wrong phrase — not recorded."
        : "No step recorded.";
    return [
      utterance ? `Child: "${utterance}"` : "",
      status,
      directive,
      alreadyAudible ? "Stay silent." : QUEST_TRACKER_SPEAK_IF_SILENT,
      QUEST_TRACKER_NO_REPEAT,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const lines = [
    buildActiveMissionHeader(quest, questIndex),
    utterance ? `Child said: "${utterance}"` : "",
    stepJustCompleted
      ? `Step recorded: ${newlyCompletedIds.map((id) => quest.steps.find((s) => s.id === id)?.label).filter(Boolean).join(", ")}`
      : wrongAttempt
        ? "No step recorded — wrong or incomplete English phrase."
        : "No step recorded this turn.",
    directive,
    alreadyAudible ? "Do not speak again this turn." : QUEST_TRACKER_SPEAK_IF_SILENT,
    QUEST_TRACKER_NO_REPEAT,
  ];

  return lines.filter(Boolean).join("\n");
}
