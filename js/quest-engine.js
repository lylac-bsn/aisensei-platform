import { LESSON_1_QUESTS, LESSON_1_TITLE } from "./quests/beginner-lesson1.js";
import { INTERMEDIATE_QUESTS, INTERMEDIATE_LESSON_TITLE } from "./quests/intermediate-lesson1.js";
import { ADVANCED_QUESTS, ADVANCED_LESSON_TITLE } from "./quests/advanced-lesson1.js";

/**
 * Per-level configuration. The active level is resolved ONCE at module load
 * from `window.GC_LEVEL` (set by an inline script before module imports, e.g.
 * from voice-tab.html's ?level= URL param). Defaults to beginner, so all
 * existing beginner pages keep working with identical storage keys.
 */
const LEVELS = {
  beginner: {
    id: "beginner",
    quests: LESSON_1_QUESTS,
    lessonTitle: LESSON_1_TITLE,
    keyPrefix: "gc_beginner_lesson1_",
    mainBadgeId: "lesson1",
    badgeImage: "images/completion-badge-bronze.png",
    headerLabel: "ビギナー",
    firestoreField: "beginnerProgress",
  },
  intermediate: {
    id: "intermediate",
    quests: INTERMEDIATE_QUESTS,
    lessonTitle: INTERMEDIATE_LESSON_TITLE,
    keyPrefix: "gc_intermediate_lesson1_",
    mainBadgeId: "intermediate",
    badgeImage: "images/completion-badge-silver.png",
    headerLabel: "中級",
    firestoreField: "intermediateProgress",
  },
  advanced: {
    id: "advanced",
    quests: ADVANCED_QUESTS,
    lessonTitle: ADVANCED_LESSON_TITLE,
    keyPrefix: "gc_advanced_lesson1_",
    mainBadgeId: "advanced",
    badgeImage: "images/completion-badge-gold.png",
    headerLabel: "上級",
    firestoreField: "advancedProgress",
  },
};

function resolveLevelId() {
  try {
    const fromGlobal =
      (typeof window !== "undefined" && window.GC_LEVEL) || globalThis.GC_LEVEL;
    if (fromGlobal && LEVELS[fromGlobal]) return fromGlobal;
  } catch {
    // ignore
  }
  return "beginner";
}

export const ACTIVE_LEVEL = LEVELS[resolveLevelId()];
const ACTIVE_QUESTS = ACTIVE_LEVEL.quests;

export function getActiveLevelId() {
  return ACTIVE_LEVEL.id;
}

export const PROGRESS_KEY = `${ACTIVE_LEVEL.keyPrefix}questIndex`;
export const STEP_PROGRESS_KEY = `${ACTIVE_LEVEL.keyPrefix}stepProgress`;
export const SELECTED_QUEST_KEY = `${ACTIVE_LEVEL.keyPrefix}selectedQuest`;
export const LEARNED_PHRASES_KEY = `${ACTIVE_LEVEL.keyPrefix}learnedPhrases`;
/** Shared across ALL levels — one badge collection for the whole account. */
export const LESSON_BADGES_KEY = "gc_beginner_lessonBadges";

/** Main badges — one per level's full mission-completion. */
export const MAIN_BADGE_SLOTS = [
  {
    id: "lesson1",
    label: "ビギナー",
    desc: "ビギナーミッション全クリア",
    hint: "ビギナーのミッションを全部クリアしたらゲット！",
    image: "images/completion-badge-bronze.png",
  },
  {
    id: "intermediate",
    label: "中級",
    desc: "中級ミッション全クリア",
    hint: "中級のミッションを全部クリアしたらゲット！",
    image: "images/completion-badge-silver.png",
  },
  {
    id: "advanced",
    label: "上級",
    desc: "上級ミッション全クリア",
    hint: "上級のミッションを全部クリアしたらゲット！",
    image: "images/completion-badge-gold.png",
  },
];

/** Hidden badge collection size (unused slots show as "？？？"). */
export const HIDDEN_BADGE_SLOT_COUNT = 8;

/**
 * Secret badges earned inside missions (quiz answered with no hints,
 * side challenges). Shown as "？？？" slots until earned. `level` scopes
 * each badge to the level whose missions can award it (used by reset).
 */
export const HIDDEN_BADGES = [
  {
    id: "hidden_furnace",
    level: "beginner",
    earnedLabel: "かまどマスター",
    desc: "ヒントなしで英語のフレーズが言えた！",
    hint: "ビギナーのかまどミッションで、先生におしえてもらう前に英語で言えたら…？",
  },
  {
    id: "hidden_iron",
    level: "beginner",
    earnedLabel: "アイアンハンター",
    desc: "てつのシークレットチャレンジに成功！",
    hint: "ビギナーのてつミッションで、てつを2つ以上ゲット！って英語で言えたら…？",
  },
  {
    id: "hidden_prep_int",
    level: "intermediate",
    earnedLabel: "準備マスター",
    desc: "どうくつの準備でプラス1つ必要なものを英語で言えた！",
    hint: "中級のどうくつじゅんびミッションで、もう1つ必要なものを英語で言えたら…？",
  },
  {
    id: "hidden_report_int",
    level: "intermediate",
    earnedLabel: "レポートマスター",
    desc: "ヒントなしで英語レポートが言えた！",
    hint: "中級の英語レポートミッションを、先生のヒントなしでクリアできたら…？",
  },
  {
    id: "hidden_diamond_adv",
    level: "advanced",
    earnedLabel: "ダイヤハンター",
    desc: "ベストせんりひんがダイヤモンドだった！",
    hint: "上級のせんりひんミッションで、ベストせんりひんがダイヤモンドだったら…？",
  },
  {
    id: "hidden_question_adv",
    level: "advanced",
    earnedLabel: "しつもんマスター",
    desc: "英語でラーニー先生にしつもんできた！",
    hint: "上級のミッション中に、英語で先生にしつもんしてみたら…？",
  },
  {
    id: "hidden_feeling_adv",
    level: "advanced",
    earnedLabel: "きもちマスター",
    desc: "きもちを英語で言えた！",
    hint: "上級のデンジャーミッションで、そのときの気もちを英語で言えたら…？",
  },
  {
    id: "hidden_english_adv",
    level: "advanced",
    earnedLabel: "英語チャレンジマスター",
    desc: "ヒントなしで英語チャレンジをクリア！",
    hint: "上級の英語オンリーチャレンジを、先生のヒントなしでクリアできたら…？",
  },
];

/** Badge ids (main + hidden) owned by the active level — reset scope. */
function getActiveLevelBadgeIds() {
  return new Set([
    ACTIVE_LEVEL.mainBadgeId,
    ...HIDDEN_BADGES.filter((b) => b.level === ACTIVE_LEVEL.id).map((b) => b.id),
  ]);
}

/**
 * Per-level language directives injected into referee nudges and prompts.
 * Beginner = English then Japanese every turn; intermediate = ~80% English
 * with light Japanese support; advanced = 100% English. Beginner strings are
 * byte-identical to the original hardcoded nudge text.
 */
const LEVEL_LANG = {
  beginner: {
    pair: "EN then JP",
    pairHype: "EN then JP, friendly!",
    firstCasual: "English first, then casual Japanese",
    sentencesRule: "Keep it 1–3 short fun sentences, EN then JP.",
    niceTry: 'Nice try! いいチャレンジ！',
    inviteTogether: "(「一緒に言ってみよう」)",
    inviteTogetherExcl: "「一緒に言ってみよう！」「ゆっくりでいいよ」",
    slowOk: "(「ゆっくりでいいよ」)",
    echoReassure: "(「だいじょうぶ、ゆっくりいこう！」)",
    echoInvite: "(「まねして言ってみて！」)",
    openerLangLine: "English first, then Japanese.",
    openerEnd: '「やってみよう！」 / "Let\'s go!"',
    speakStyleLine:
      "■話し方: 英語→日本語。かんたん・元気・友だち口調。1回の返事は短く（ひと息で言える長さ）。堅い敬語・講義口調は避ける。",
    secretBuildUp: '(e.g. "Wait... something special happened!" / 「じゃじゃーん！」)',
    secretBadgeJa:
      'and in Japanese 「おめでとう！シークレットバッジゲットだよ！めったに取れないスペシャルバッジだよ、すごすぎる！」. ',
  },
  intermediate: {
    pair: "mostly EN + one short JP line",
    pairHype: "mostly EN + one short JP line, friendly!",
    firstCasual: "English first — casual, then one short Japanese follow-up line",
    sentencesRule:
      "Keep it 1–3 short fun sentences, about 80% English — ALWAYS end with one short Japanese support line (never English-only).",
    niceTry: 'Nice try! いいチャレンジ！',
    inviteTogether: "「一緒に言ってみよう」",
    inviteTogetherExcl: "「一緒に言ってみよう！」「ゆっくりでいいよ」",
    slowOk: "（「ゆっくりでいいよ」）",
    echoReassure: "（「だいじょうぶ、ゆっくりいこう！」）",
    echoInvite: "（「まねして言ってみて！」）",
    openerLangLine: "Mostly English (about 80%) — ALWAYS end with one short Japanese support line.",
    openerEnd: '"Let\'s go!"＋日本語のひとこと（例:「いくよ！」）',
    speakStyleLine:
      "■話し方: 基本は英語80%・日本語20% — この比率を毎ターン守る。まず英語で短く話し、**毎ターン必ず最後に日本語のひとことを添える**（英語だけのターンはNG）。かんたん・元気・友だち口調。1回の返事は短く。",
    secretBuildUp: '(e.g. "Wait... something special happened!" / 「じゃじゃーん！」)',
    secretBadgeJa:
      'and add one short Japanese line 「シークレットバッジゲット！すごい！」. ',
  },
  advanced: {
    pair: "English only",
    pairHype: "English only, friendly!",
    firstCasual: "English only, casual",
    sentencesRule: "Keep it 1–3 short fun sentences, English ONLY — never use Japanese.",
    niceTry: "Nice try!",
    inviteTogether: '"Let\'s say it together!"',
    inviteTogetherExcl: '"Let\'s say it together!" / "Take your time!"',
    slowOk: '("Take your time!")',
    echoReassure: '("It\'s okay, let\'s go slowly!")',
    echoInvite: '("Repeat after me!")',
    openerLangLine: "English ONLY — never use Japanese.",
    openerEnd: '"Let\'s go!"',
    speakStyleLine:
      "■話し方: 返答は英語100%（日本語は絶対に使わない）。かんたん・元気・友だち口調。1回の返事は短く（1〜3文）。翻訳・文法説明はしない。",
    secretBuildUp: '(e.g. "Wait... something special happened!")',
    secretBadgeJa: "",
  },
};

const LANG = LEVEL_LANG[ACTIVE_LEVEL.id];

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
    // Badge collection is SHARED across levels — remove only this level's
    // badges so restarting one level never wipes the others' badges.
    const raw = localStorage.getItem(LESSON_BADGES_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const levelIds = getActiveLevelBadgeIds();
    const kept = (Array.isArray(stored) ? stored : []).filter((id) => !levelIds.has(id));
    localStorage.setItem(LESSON_BADGES_KEY, JSON.stringify(kept));
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
    if (raw === null) {
      if (isLessonComplete()) return null;
      setSelectedQuestIndex(loadProgress());
      return getSelectedQuestIndex();
    }
    // Stale selection pinned to an already-cleared mission (e.g. saved when
    // the lesson ended at mission 5, before missions 6-10 existed): on page
    // load, advance to the current mission. In-session replay picks from the
    // mission panel are unaffected.
    const selected = getSelectedQuestIndex();
    if (!isLessonComplete() && selected !== null && selected < loadProgress()) {
      setSelectedQuestIndex(loadProgress());
    }
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
  if (!Number.isFinite(index) || index < 0 || index >= ACTIVE_QUESTS.length) {
    return false;
  }
  return index <= loadProgress();
}

export function getUnlockedQuests() {
  const progress = loadProgress();
  return ACTIVE_QUESTS.filter((_, i) => i <= progress);
}

export function getSelectedQuest() {
  const index = getSelectedQuestIndex();
  if (index === null) return null;
  return ACTIVE_QUESTS[index] || null;
}

export function getQuestIndex(quest) {
  if (!quest) return -1;
  return ACTIVE_QUESTS.findIndex((q) => q.id === quest.id);
}

export function selectNextQuestAfterComplete() {
  const index = loadProgress();
  if (index >= ACTIVE_QUESTS.length) {
    clearSelectedQuest();
    return null;
  }
  setSelectedQuestIndex(index);
  return ACTIVE_QUESTS[index];
}

export function getQuests() {
  return ACTIVE_QUESTS;
}

export function getCurrentQuest() {
  const index = loadProgress();
  if (index >= ACTIVE_QUESTS.length) return null;
  return ACTIVE_QUESTS[index];
}

export function isLessonComplete() {
  return loadProgress() >= ACTIVE_QUESTS.length;
}

/** Whether a level's lesson is complete, from its OWN progress key. */
function isLevelLessonComplete(levelId) {
  const level = LEVELS[levelId];
  if (!level) return false;
  try {
    const raw = localStorage.getItem(`${level.keyPrefix}questIndex`);
    const index = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(index) && index >= level.quests.length;
  } catch {
    return false;
  }
}

export function loadEarnedLessonBadges() {
  try {
    const raw = localStorage.getItem(LESSON_BADGES_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const earned = new Set(Array.isArray(stored) ? stored : []);
    // Main lesson badges are derived from each level's own progress, so the
    // shared collection stays accurate on every page. A stale stored copy
    // (e.g. earned when the lesson had fewer missions) is dropped.
    for (const level of Object.values(LEVELS)) {
      if (isLevelLessonComplete(level.id)) {
        earned.add(level.mainBadgeId);
      } else {
        earned.delete(level.mainBadgeId);
      }
    }
    return [...earned];
  } catch {
    return isLessonComplete() ? [ACTIVE_LEVEL.mainBadgeId] : [];
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

/** Level-completion badges (beginner / intermediate / advanced). */
export function getMainBadgeSlots() {
  const earned = new Set(loadEarnedLessonBadges());
  return MAIN_BADGE_SLOTS.map((slot) => ({
    ...slot,
    earned: earned.has(slot.id),
    // Unearned main badges render as "?" placeholders, like secret ones.
    upcoming: !earned.has(slot.id),
    // Higher levels get their own art when they launch (gold asset exists).
    image: slot.image || "images/completion-badge-gold.png",
  }));
}

/** Secret in-mission badges, padded to a fixed collection size. */
export function getHiddenBadgeSlots() {
  const earned = new Set(loadEarnedLessonBadges());
  const slots = HIDDEN_BADGES.map((badge) => {
    const isEarned = earned.has(badge.id);
    return {
      id: badge.id,
      label: isEarned ? badge.earnedLabel : "シークレット",
      desc: isEarned ? badge.desc : "？？？",
      hint: badge.hint || "",
      secret: true,
      // Unearned secrets render like upcoming slots ("?" placeholder).
      upcoming: !isEarned,
      earned: isEarned,
      image: "images/hidden-badge.png",
    };
  });
  while (slots.length < HIDDEN_BADGE_SLOT_COUNT) {
    slots.push({
      id: `hidden_slot_${slots.length + 1}`,
      label: "シークレット",
      desc: "？？？",
      hint: "ミッションの中にかくされたチャレンジをさがしてみよう！",
      secret: true,
      upcoming: true,
      earned: false,
      image: "images/hidden-badge.png",
    });
  }
  return slots;
}

export function getLessonBadgeSlots() {
  return [...getMainBadgeSlots(), ...getHiddenBadgeSlots()];
}

/** Snapshot for Firestore sync and admin dashboard. */
export function buildProgressSnapshot() {
  const totalQuests = ACTIVE_QUESTS.length;
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
    if (selectedIndex !== null && ACTIVE_QUESTS[selectedIndex]) {
      missionIndex = selectedIndex;
      missionTitleEn = ACTIVE_QUESTS[selectedIndex].titleEn || "";
      missionGoal = ACTIVE_QUESTS[selectedIndex].goal || "";
    }
  } else if (selectedIndex !== null && ACTIVE_QUESTS[selectedIndex]) {
    missionIndex = selectedIndex;
    missionTitleEn = ACTIVE_QUESTS[selectedIndex].titleEn || "";
    missionGoal = ACTIVE_QUESTS[selectedIndex].goal || "";
    missionStatus = selectedIndex === questIndex ? "いまのミッション" : "復習中";
  } else if (questIndex < totalQuests) {
    missionIndex = questIndex;
    missionTitleEn = ACTIVE_QUESTS[questIndex].titleEn || "";
    missionGoal = ACTIVE_QUESTS[questIndex].goal || "";
    missionStatus = "自由会話（次のミッション待ち）";
  } else {
    missionStatus = "自由会話";
  }

  return {
    level: ACTIVE_LEVEL.id,
    lessonTitle: ACTIVE_LEVEL.lessonTitle,
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
  decide: "decide",
  decided: "decide",
  deciding: "decide",
  explore: "explore",
  explored: "explore",
  exploring: "explore",
  improve: "improve",
  improved: "improve",
  improving: "improve",
  change: "change",
  changed: "change",
  changing: "change",
  organize: "organize",
  organized: "organize",
  organizing: "organize",
  clean: "clean",
  cleaned: "clean",
  cleaning: "clean",
  choose: "choose",
  chose: "choose",
  choosing: "choose",
  pick: "choose",
  picked: "choose",
  // NOTE: go/went/going intentionally NOT mapped — "going" must stay intact
  // for the aspiration guard ("I'm going to ..." is not completion proof).
  run: "run",
  ran: "run",
  running: "run",
  escape: "escape",
  escaped: "escape",
  fall: "fall",
  fell: "fall",
  falling: "fall",
  like: "like",
  liked: "like",
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
  irons: "iron",
  caves: "cave",
  furnaces: "furnace",
  swords: "sword",
  shovels: "shovel",
  axes: "axe",
  hoes: "hoe",
  tools: "tool",
  torches: "torch",
  diamonds: "diamond",
  emeralds: "emerald",
  villages: "village",
  enemies: "enemy",
  zombies: "zombie",
  creepers: "creeper",
  skeletons: "skeleton",
  monsters: "monster",
  chests: "chest",
  beds: "bed",
  farms: "farm",
  rooms: "room",
  areas: "area",
  goals: "goal",
  bases: "base",
  shields: "shield",
  buckets: "bucket",
  arrows: "arrow",
  potions: "potion",
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
  "made_stone_tool",
  "made_furnace",
  "placed_furnace",
  "found_iron",
  "got_iron",
  "found_cave",
  // Intermediate
  "report_change",
  "made_tool",
  "found_useful",
  // Advanced
  "best_loot",
  "did_today",
]);

/**
 * Open-object steps — the child names THEIR OWN item ("I got 〇〇!", "I found
 * 〇〇!"). Any content word counts as the object; the pattern-derived object
 * allowlist must NOT gate these (a kid whose best loot is a sakura tree says
 * "I found sakura tree!" and that has to tick).
 */
const STEP_OPEN_OBJECT = new Set([
  // Intermediate
  "report_change",
  "found_useful",
  "report_made_or_found",
  // Advanced
  "best_loot",
  "did_today",
]);

/**
 * Open-reason steps — the child gives ANY short reason/judgment ("It was
 * useful!", "because it's cute!"). Fixed patterns still match first; a
 * "because ..." clause or "it was/is <something>" also counts.
 */
const STEP_OPEN_REASON = new Set([
  // Advanced
  "why_good",
]);

/** Open-ended intent steps — "I want to / I will ..." IS the success phrase. */
const STEP_ALLOWS_ASPIRATION = new Set([
  "decide_action",
  "review_want",
  // Intermediate
  "decide_improvement",
  "choose_tool",
  "next_want",
  // Advanced
  "next_goal",
  "next_action",
  "want_next",
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
  made_stone_tool: [
    ["made", "crafted", "built", "created"],
    ["tool", "pickaxe", "axe", "shovel", "sword"],
  ],
  its_strong: [["strong"]],
  made_furnace: [["made", "crafted", "built", "created"], ["furnace"]],
  placed_furnace: [["put", "place", "placed"], ["here", "down", "there", "furnace"]],
  found_iron: [["find", "found", "see"], ["iron"]],
  got_iron: [["get", "got", "have", "mine", "dig", "collect"], ["iron"]],
  found_cave: [["find", "found", "see"], ["cave"]],
  // Intermediate
  decide_improvement: [
    ["improve", "change", "make"],
    ["base", "chest", "bed", "farm", "better"],
  ],
  report_change: [
    ["improve", "change", "organize", "clean", "place", "make", "build"],
    ["base", "chest", "bed", "farm", "better", "furnace", "part"],
  ],
  choose_tool: [
    ["make", "craft", "build", "create"],
    ["sword", "pickaxe", "axe", "shovel", "tool"],
  ],
  made_tool: [
    ["made", "crafted", "built", "created"],
    ["sword", "pickaxe", "axe", "shovel", "tool"],
  ],
  need_torches: [["need", "want"], ["torch", "light"]],
  need_food_prep: [["need", "want"], ["food", "meat", "bread"]],
  ready_cave: [["ready"]],
  found_useful: [
    ["find", "found", "see"],
    ["iron", "coal", "cave", "village", "diamond", "useful"],
  ],
  its_useful: [["useful"]],
  // Advanced
  best_loot: [
    ["get", "got", "have", "find", "found"],
    ["diamond", "iron", "gold", "emerald", "loot"],
  ],
  what_happened: [
    ["see", "saw", "fall", "fell"],
    ["enemy", "zombie", "creeper", "skeleton", "monster", "spider"],
  ],
  danger_reaction: [["dangerous"]],
};

/** Max word gap between salient verb and object (STT may insert short fillers). */
const STEP_SALIENT_MAX_GAP = {
  made_table: 3,
  placed_table: 4,
  placed_furnace: 4,
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

/** Any non-filler, non-verb content word — the child named SOMETHING. */
function textHasAnyContentObject(text, step) {
  const verbs = stepCompletionVerbWords(step);
  return textWords(text).some(
    (word) => !FILLER_TOKENS.has(word) && !verbs.has(word) && !isVerbToken(word)
  );
}

const LINKING_VERBS = new Set(["is", "was", "are", "were", "be", "been", "am"]);

/** A real action verb from the step's completion list ("found", "placed" — not "was"/"is"). */
function textHasActionCompletionVerb(text, step) {
  const verbs = stepCompletionVerbWords(step);
  if (!verbs.size) return false;
  return textWords(text).some((word) => verbs.has(word) && !LINKING_VERBS.has(word));
}

const OPEN_REASON_SUBJECTS = new Set(["it", "its", "this", "that", "they", "these"]);
const OPEN_REASON_LINKS = new Set(["is", "was", "are", "were", "looks", "looked"]);

/** Free-form reason ("because it's cute", "it was pretty") for open-reason steps. */
function matchesOpenReason(text) {
  const words = textWords(text);
  if (!words.length) return false;
  const hasContent = words.some(
    (word) => !FILLER_TOKENS.has(word) && !isVerbToken(word) && word !== "because"
  );
  if (!hasContent) return false;
  if (words.includes("because")) return true;
  return (
    words.some((w) => OPEN_REASON_SUBJECTS.has(w)) &&
    words.some((w) => OPEN_REASON_LINKS.has(w))
  );
}

/** Words that negate an action — the child is saying it did NOT happen. */
const NEGATION_WORDS = [
  "not", "never", "nothing", "havent", "hasnt", "wont",
  "couldnt", "wouldnt", "shouldnt", "aint",
];

function textHasAspiration(text) {
  // Strip apostrophes so "didn't"/"can't" match the bare forms in the word lists.
  const words = textWords(text).map((w) => w.replace(/['']/g, ""));
  return (
    ASPIRATION_WORDS.some((aspiration) => words.includes(aspiration)) ||
    NEGATION_WORDS.some((negation) => words.includes(negation))
  );
}

function textHasNegation(text) {
  const words = textWords(text).map((w) => w.replace(/['']/g, ""));
  return NEGATION_WORDS.some((negation) => words.includes(negation));
}

/**
 * Split an utterance into independent clauses (on punctuation and
 * conjunctions) so each claim is judged on its own. Lets kids say step
 * phrases mid-sentence — "I found food and I need food" ticks both steps
 * instead of each step's guards rejecting the other half of the sentence.
 */
function splitIntoClauses(text) {
  return (text || "")
    .split(/[,.!?;:。、．！？；]+|\b(?:and\s+then|and|then|but|so|because|also|next|after\s+that)\b/gi)
    .map((clause) => (clause || "").trim())
    .filter(Boolean);
}

/** Past-tense / completion verbs required for action steps (blocks bare "craft table"). */
const STEP_COMPLETION_VERBS = {
  // chop/cut included: the quest patterns accept "chopping the tree" as proof
  found_tree: ["found", "find", "see", "saw", "look", "chop", "chopped", "cut"],
  got_wood: ["got", "get", "have", "had", "chop", "chopped", "cut", "collect", "collected"],
  made_table: ["made", "crafted", "built", "created"],
  placed_table: ["put", "placed", "place"],
  made_pickaxe: ["made", "crafted", "built", "created", "have", "has", "had"],
  found_stones: ["found", "find", "see", "saw"],
  got_stones: ["got", "get", "have", "mine", "mined", "dig", "dug", "collect", "collected"],
  found_food: ["found", "find", "see", "saw"],
  made_stone_tool: ["made", "crafted", "built", "created", "have", "has", "had"],
  made_furnace: ["made", "crafted", "built", "created", "have", "has", "had"],
  placed_furnace: ["put", "placed", "place"],
  found_iron: ["found", "find", "see", "saw"],
  got_iron: ["got", "get", "have", "mine", "mined", "dig", "dug", "collect", "collected"],
  found_cave: ["found", "find", "see", "saw"],
  // Intermediate
  report_change: ["made", "improved", "changed", "organized", "cleaned", "placed", "put", "built", "created"],
  made_tool: ["made", "crafted", "built", "created", "have", "has", "had"],
  found_useful: ["found", "find", "see", "saw"],
  // Advanced
  best_loot: ["got", "get", "found", "find", "have", "had", "was", "is"],
  did_today: ["built", "build", "explored", "explore", "made", "found"],
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

  const words = textWords(text);
  if (!words.length) return false;

  if (groups.length === 1) {
    return groups[0].some((keyword) => words.includes(keyword));
  }

  const verbKeywords = groups[0];
  // Only the explicit salient object group counts here — the pattern-derived
  // allowlist contains modifiers too (e.g. "stone" in "stone sword"), which
  // would let "I made stone <anything>" pass as a stone TOOL.
  const objectAllow = new Set();
  for (const kw of groups[1] || []) {
    for (const alt of expandTokenAlternates(kw)) objectAllow.add(alt);
  }
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
export function matchesPhrase(text, pattern, { ignoreAspiration = false } = {}) {
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
      if (
        ignoreAspiration ||
        patternRequiresCompletionVerb(pattern) ||
        !textHasAspiration(text)
      ) {
        return true;
      }
    }
    const regex = new RegExp(escapeRegex(p).replace(/\s+/g, "\\s+"), "i");
    if (regex.test(lower)) {
      return (
        ignoreAspiration ||
        patternRequiresCompletionVerb(pattern) ||
        !textHasAspiration(text)
      );
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

/**
 * Scripts a Japanese child never produces (Hangul, Cyrillic, Thai, Arabic,
 * Devanagari, Hebrew). The native-audio ASR auto-detects language and sometimes
 * mislabels a kid's mumbled Japanese/English as one of these — always treat as
 * misrecognition, never as intentional speech.
 */
const FOREIGN_SCRIPT_RE =
  /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\u0400-\u04ff\u0e00-\u0e7f\u0600-\u06ff\u0900-\u097f\u0590-\u05ff]/;

/** True when transcript is empty, noise, or too garbled to treat as intentional speech. */
export function isUnrecognizableUserInput(text) {
  const t = (text || "").trim();
  if (!t) return true;

  if (FOREIGN_SCRIPT_RE.test(t)) return true;

  const normalized = t.toLowerCase().replace(/\s+/g, " ").trim();
  if (VALID_SHORT_UTTERANCES.has(normalized)) return false;

  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(t)) {
    if (t.length === 1 && /[\u3040-\u30ff]/.test(t)) return false;
    if (/^(.)\1{3,}$/.test(normalized)) return true;
    // Kanji-only runs with no kana are almost always the ASR mislabeling speech
    // as Chinese — real Japanese transcripts of kids contain kana.
    const hasKana = /[\u3040-\u30ff]/.test(t);
    if (!hasKana && !userTextHasEnglish(t)) {
      const hanCount = (t.match(/[\u3400-\u9fff]/g) || []).length;
      if (hanCount >= 4) return true;
    }
    return false;
  }

  // Filler noises must be checked before the general English-letters test,
  // otherwise "hmm"/"umm" are treated as clear speech.
  if (/^(um+|uh+|ah+|hm+|mhm+|mmm+|hmm+|eh+|oh+)$/i.test(normalized)) return true;

  if (userTextHasEnglish(t)) return false;
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
      `Mission ${missionNum}/${ACTIVE_QUESTS.length}: ${quest.titleEn || quest.title} | ` +
      `All steps done (${progress}) → call complete_quest, then celebrate once.`
    );
  }

  const next = remaining[0];
  const phrase = getStepSpokenPhrase(next);
  const directive = quest.quizFirst
    ? `QUIZ them first — answer is "${phrase}" but do NOT say it unless they are stuck. ` +
      `Ask the quiz question in English THEN Japanese, e.g. "What do you say in English?" →「英語でなんて言うと思う？」. ` +
      `Quiz mode does NOT change the language rule: EVERY reply = English first, then the same meaning in Japanese`
    : `guide Minecraft action, then have them say "${phrase}"`;
  return (
    `Mission ${missionNum}/${ACTIVE_QUESTS.length}: ${quest.titleEn || quest.title} | ` +
    `Progress ${progress} | NEXT: ${next.label} → ${directive}`
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

const INTERMEDIATE_FRIENDLY_TONE =
  "Sound like a fun Minecraft buddy for Japanese elementary kids — warm, casual, upbeat. " +
  "Speak mostly English (about 80%), simple and short, native-like rhythm; add one quick Japanese support line only when it helps. " +
  "EN: Cool! Awesome! Nice one! Let's go! You got this! " +
  "Never stiff, lecture-y, or overly polite. " +
  "Short sentences. Smile in your voice. Make English feel fun, not like homework.";

const ADVANCED_FRIENDLY_TONE =
  "Sound like a fun Minecraft buddy for Japanese kids who are strong in English — warm, casual, upbeat, natural native-like rhythm. " +
  "English ONLY — never use Japanese. " +
  "EN: Cool! Awesome! Nice one! Let's go! You got this! " +
  "Never stiff or lecture-y. Short replies (1–3 sentences). Smile in your voice. Match their energy.";

/** What Learny should do this turn — one clear instruction. */
function buildStepDirective(
  quest,
  nextStep,
  { stepJustCompleted = false, japaneseOnly = false, alreadyAudible = false, wrongAttempt = false } = {}
) {
  if (!nextStep) {
    return `All steps done → call complete_quest once, then one short celebration (${LANG.pair}).`;
  }

  const phrase = getStepSpokenPhrase(nextStep);
  const coachHint = nextStep.coachNote
    ? " (Give quick pronunciation tips only — do not say the English phrase twice.)"
    : "";

  if (wrongAttempt) {
    return (
      `Wrong phrase — step NOT recorded. Do NOT say they got "${phrase}" right, but do NOT sound disappointed either. ` +
      `React to what THEY actually said first, and praise the try in fresh words — vary your phrasing every time, ` +
      `never open with the same line (like "${LANG.niceTry}") twice in a call. Then weave "${phrase}" in naturally, slowly, in small chunks${coachHint}. ` +
      `Invite softly — ${LANG.inviteTogetherExcl} — never pressure or demand a retry. Sound like a playful friend, not a script.`
    );
  }

  if (stepJustCompleted) {
    if (!nextStep) {
      return `All steps done → call complete_quest once, then one short fun celebration (${LANG.pair}).`;
    }
    if (alreadyAudible) {
      return (
        `Step already recorded — do NOT repeat praise or quote the child again. ` +
        `Briefly guide ONLY the next Minecraft step and English phrase: "${phrase}". ` +
        `Do NOT say mission complete yet.`
      );
    }
    return (
      `Step done — hype them up briefly (${LANG.pairHype}), then guide the next step: ` +
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
      `They reported success in Japanese only — cheer them on (${LANG.pair}), teach "${phrase}" once${coachHint}, ` +
      `invite them to try it in English. Do not mark step done until English is spoken.`
    );
  }

  return (
    `Reply warmly to what they said (${LANG.pair}). If they brought up their own topic, chat about THAT first — ` +
    `their topic always wins, keep the conversation fun and natural. Only when it fits smoothly, guide the next Minecraft move ` +
    `and the English to say: "${phrase}". ${LANG.sentencesRule} ` +
    `Never force the mission or the phrase. Do NOT celebrate or say they got the phrase right unless the app recorded the step.`
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
    `Reply in 1–2 short friendly sentences (${LANG.pair}) to what THEY said — if they brought up their own topic, ` +
    `chat about that and do NOT mention the mission. Only guide the next step if they asked what to do or said nothing.`
  );
}

/** Nudge Learny to ask the child to repeat after unclear/noise input. */
export function buildUnclearInputRepeatNudge(userUtterance = "", quest = null, questIndex = null) {
  const mission = quest ? `${buildActiveMissionHeader(quest, questIndex ?? loadProgress())}. ` : "";
  return (
    `[Speak now] ${mission}Could not hear clearly — ask them to say it again, gently and casually (1–2 sentences, ${LANG.pair}). ` +
    `Do not advance steps or guess what they meant.`
  );
}

// ---------------------------------------------------------------------------
// Phonetic tolerance — kids' speech gets mis-transcribed ("furnace" → "face" /
// "phrase"). If a word SOUNDS like the target word, count it. Fun > precision.
// ---------------------------------------------------------------------------

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

function isSubsequence(short, long) {
  let i = 0;
  for (const ch of long) {
    if (ch === short[i]) i++;
    if (i === short.length) return true;
  }
  return i === short.length;
}

/** Rough sound skeleton: leading sound + consonants (STT noise collapses vowels). */
function phoneticSkeleton(word) {
  let w = (word || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/ph/g, "f")
    .replace(/wh/g, "w")
    .replace(/ck/g, "k")
    .replace(/qu/g, "kw")
    .replace(/x/g, "ks")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/(.)\1+/g, "$1");
  const first = w[0] || "";
  const rest = w.slice(1).replace(/[aeiouyhw]/g, "").replace(/(.)\1+/g, "$1");
  return first + rest;
}

/** Pairs that sound vaguely alike but must never fuzzy-match (false STT ticks). */
const PHONETIC_NEVER_SIMILAR = new Set([
  "stone|strong",
  "strong|stone",
]);

/** True when two English words plausibly sound alike (STT confusion). */
export function soundsSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (PHONETIC_NEVER_SIMILAR.has(`${a}|${b}`)) return false;
  const sa = phoneticSkeleton(a);
  const sb = phoneticSkeleton(b);
  if (!sa || !sb || sa[0] !== sb[0]) return false;
  if (sa === sb) return true;
  if (levenshtein(sa, sb) <= 1) return true;
  // Dropped syllables: one skeleton contained in the other ("face"→fs ⊂ frns).
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (short.length >= 2 && isSubsequence(short, long)) return true;
  return levenshtein(a, b) / Math.max(a.length, b.length) <= 0.34;
}

/** Small words that carry no meaning for fuzzy pattern matching. */
const FUZZY_STOP_WORDS = new Set([
  "i", "im", "my", "me", "it", "its", "this", "that", "these", "those",
  "is", "was", "are", "am", "be", "been", "and", "or", "so", "to", "of",
  "in", "on", "at", "for", "we", "you", "he", "she", "they", "let", "lets",
  "please", "now", "yes", "ok", "okay", "there",
]);

/** Verbs not covered by VERB_FORMS that must still match exactly (too short to fuzz). */
const FUZZY_EXACT_VERBS = new Set([
  "have", "has", "had", "put", "place", "placed", "need", "needed",
  "want", "wanted", "go", "went", "going", "say", "said", "think",
]);

function isVerbKey(word) {
  return Object.prototype.hasOwnProperty.call(VERB_FORMS, word) || FUZZY_EXACT_VERBS.has(word);
}

function patternContentWords(pattern) {
  return normalizeEnglishForMatching(pattern)
    .split(/\s+/)
    .filter((w) => w && w.length >= 2 && !FUZZY_STOP_WORDS.has(w));
}

/**
 * Sound-alike step matching: every content word of one pattern (e.g. "made
 * furnace") is heard in the utterance — verbs exactly (canonicalized, so
 * made→make), nouns exactly OR as a similar-sounding word ("face"≈"furnace").
 * Each key must consume a distinct utterance word, and only multi-word
 * patterns qualify — single keywords are too easy to false-match.
 */
function matchesStepPhonetic(text, step) {
  if (!text?.trim() || !step?.patterns?.length) return false;
  if (!userTextHasEnglish(text)) return false;
  if (textHasNegation(text)) return false;
  if (step.id === "its_strong" && utteranceLooksLikeCraftReport(text)) {
    return false;
  }
  if (
    STEP_REQUIRES_COMPLETION.has(step.id) &&
    !STEP_ALLOWS_ASPIRATION.has(step.id) &&
    textHasAspiration(text)
  ) {
    return false;
  }

  // Pool of utterance words. Raw words join because normalization maps
  // "two"→"2", hiding sound-alikes of "tool". Verb words are flagged: verbs
  // may only be matched exactly, and never serve as fuzzy targets for nouns
  // ("found" must not pass as "food").
  const seen = new Set();
  const pool = [];
  const addWord = (word) => {
    if (!word || seen.has(word)) return;
    seen.add(word);
    pool.push({ word, isVerbWord: isVerbKey(word) });
  };
  for (const w of textWords(text)) addWord(w);
  for (const w of normalizeText(text).split(/\s+/)) addWord(w);
  if (!pool.length) return false;

  for (const pattern of step.patterns) {
    if (!isEnglishPattern(pattern)) continue;
    const keys = patternContentWords(pattern);
    // Multi-word patterns need every key. Single long keyword targets
    // ("ready", "useful") also allow a sound-alike — "im red" ≈ "I'm ready".
    if (!keys.length) continue;
    if (keys.length === 1 && (keys[0].length < 4 || isVerbKey(keys[0]))) continue;

    const used = new Set();
    let allKeysHeard = true;
    for (const key of keys) {
      const keyIsVerb = isVerbKey(key);
      const idx = pool.findIndex(({ word, isVerbWord }, i) => {
        if (used.has(i)) return false;
        if (word === key) return true;
        if (keyIsVerb || isVerbWord) return false;
        return soundsSimilar(word, key);
      });
      if (idx === -1) {
        allKeysHeard = false;
        break;
      }
      used.add(idx);
    }
    if (allKeysHeard) return true;
  }
  return false;
}

/** Craft-report lines ("I made a pickaxe") must not phonetically pass praise steps. */
function utteranceLooksLikeCraftReport(text) {
  const words = textWords(text);
  if (!words.length) return false;
  const craftVerbs = new Set(["made", "make", "crafted", "craft", "built", "build", "created", "create"]);
  const craftObjects = new Set([
    "tool", "tools", "pickaxe", "axe", "shovel", "sword", "stone", "table", "furnace",
  ]);
  const hasCraftVerb = words.some((w) => craftVerbs.has(w));
  const hasCraftObject = words.some((w) => craftObjects.has(w));
  return hasCraftVerb && hasCraftObject;
}

/**
 * Lenient step matching: the utterance passes if ANY clause of it contains the
 * step phrase (flexible wording) or the step's verb+object keywords. Guards
 * (aspiration, negation, completion verb) are scoped to the matching clause so
 * words elsewhere in the sentence can't block a genuine claim.
 */
export function matchesStep(text, step) {
  if (!step?.patterns?.length) return false;
  const candidates = [text, ...splitIntoClauses(text)];
  if (candidates.some((chunk) => matchesStepChunk(chunk, step))) return true;
  // Wording didn't line up — accept if it SOUNDS like the phrase (STT noise).
  return candidates.some((chunk) => matchesStepPhonetic(chunk, step));
}

function matchesStepChunk(text, step) {
  if (!text?.trim()) return false;
  if (STEP_REQUIRES_COMPLETION.has(step.id) && textHasAspiration(text)) return false;
  // Negated claims ("I didn't make it", "not yet") never tick a step.
  if (textHasNegation(text)) return false;
  const ignoreAspiration = STEP_ALLOWS_ASPIRATION.has(step.id);
  const patternMatched = step.patterns.some((pattern) =>
    matchesPhrase(text, pattern, { ignoreAspiration })
  );
  const openReasonMatched =
    !patternMatched && STEP_OPEN_REASON.has(step.id) && matchesOpenReason(text);
  // Open-object report steps: action verb + ANY named object counts
  // ("I placed a jukebox", "I found amethyst") — the kid reports their own thing.
  const openObjectMatched =
    !patternMatched &&
    !openReasonMatched &&
    STEP_OPEN_OBJECT.has(step.id) &&
    textHasActionCompletionVerb(text, step) &&
    textHasAnyContentObject(text, step);
  const salientMatched =
    !patternMatched && !openReasonMatched && !openObjectMatched &&
    matchesStepSalient(text, step);
  if (!patternMatched && !openReasonMatched && !openObjectMatched && !salientMatched) {
    return false;
  }
  if (STEP_REQUIRES_COMPLETION.has(step.id) && !textHasCompletionVerb(text, step)) return false;
  if (STEP_OPEN_OBJECT.has(step.id)) {
    // Open-object steps: the kid names their OWN item — any content word
    // counts ("I found sakura tree!"), but a bare verb ("I built") does not.
    if (!textHasAnyContentObject(text, step)) return false;
  } else if (
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

/**
 * True when the utterance reaches for this step's phrase (completion verb,
 * allowlisted object, or a sound-alike of a pattern content word — so
 * "im red" counts as trying "I'm ready").
 */
function utteranceReachesForStep(text, step) {
  if (!step?.patterns?.length || !text?.trim()) return false;
  const words = textWords(text);
  if (!words.length) return false;

  const verbs = stepCompletionVerbWords(step);
  if (verbs.size && words.some((word) => verbs.has(word))) return true;

  const objects = getStepObjectAllowlist(step);
  if (
    [...objects].some((obj) =>
      words.some((word) => word === obj || soundsSimilar(word, obj))
    )
  ) {
    return true;
  }

  for (const pattern of step.patterns) {
    if (!isEnglishPattern(pattern)) continue;
    for (const key of patternContentWords(pattern)) {
      if (
        words.some(
          (word) =>
            word === key || (!isVerbKey(key) && soundsSimilar(word, key))
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** User tried the step phrase in English but wording did not match (wrong word, typo, etc.). */
export function userMissedEnglishStepPhrase(text, step) {
  if (!step?.patterns?.length) return false;
  if (!stepRequiresEnglish(step)) return false;
  if (!userTextHasEnglish(text)) return false;
  if (matchesStep(text, step)) return false;
  // Desires, plans, and questions ("I want to build a house", "can we
  // explore?") are the child talking, not a botched attempt at the step
  // phrase — coach-correcting them made Learny feel pushy. Only steps whose
  // target phrase itself is an aspiration treat "I want ..." as an attempt.
  if (!STEP_ALLOWS_ASPIRATION.has(step.id) && textHasAspiration(text)) return false;
  // Only count it as an attempt when the utterance actually reaches for the
  // step phrase (verb, object, or sound-alike of a target word). Free chat
  // must not arm miss-coaching. Once they reach and don't match → it's a miss.
  if (!utteranceReachesForStep(text, step)) return false;
  return true;
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
    // Timer force-complete ticks are intentional — do not strip them for
    // lacking a strict matchesStep proof.
    if (isTimeoutPassedStep(questIndex, step.id)) continue;
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

/**
 * Phrase to SHOW on screen for a step. `display` overrides patterns[0] for
 * open-ended steps (e.g. "I made a stone 〇〇!" — any tool name accepted).
 */
export function getStepDisplayPhrase(step) {
  return step?.display || step?.patterns?.[0] || "";
}

/**
 * Phrase to put in Learny's SPOKEN prompts. `spokenPhrase` replaces on-screen
 * placeholders (〇〇, ...) with concrete-example guidance, because TTS reads
 * "〇〇" aloud as gibberish.
 */
export function getStepSpokenPhrase(step) {
  return step?.spokenPhrase || step?.display || step?.patterns?.[0] || "";
}

export function getStepEnglishPhrase(step) {
  if (step?.display) return step.display;

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

  const quests = ACTIVE_QUESTS;
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
  const quests = ACTIVE_QUESTS;

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
/**
 * Step IDs force-completed by the mission timer this call. Session-only —
 * survives reconcileEnglishStepProof / verifyAllStepsHeardInSession without a
 * strict matchesStep proof.
 */
let questSessionTimeoutPassIds = null;

/** Per-mission voice-call time limit (all levels). Easy to tune later. */
export const MISSION_TIME_LIMIT_MS = 5 * 60 * 1000;
/** Soft warning when this much time remains. */
export const MISSION_TIME_WARNING_MS = 30 * 1000;

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

function clearQuestSessionTimeoutPasses() {
  questSessionTimeoutPassIds = null;
}

/** Record that this step was force-completed by the mission timer. */
export function markTimeoutPassedStep(questIndex, stepId) {
  if (!Number.isFinite(questIndex) || questIndex < 0 || !stepId) return;
  if (!questSessionTimeoutPassIds || questSessionTimeoutPassIds.questIndex !== questIndex) {
    questSessionTimeoutPassIds = { questIndex, stepIds: [] };
  }
  if (!questSessionTimeoutPassIds.stepIds.includes(stepId)) {
    questSessionTimeoutPassIds.stepIds.push(stepId);
  }
}

/** True when this step was force-completed by the mission timer this call. */
export function isTimeoutPassedStep(questIndex, stepId) {
  return Boolean(
    questSessionTimeoutPassIds &&
      questSessionTimeoutPassIds.questIndex === questIndex &&
      questSessionTimeoutPassIds.stepIds.includes(stepId)
  );
}

/**
 * Mark every incomplete step done for a timer clear so isQuestStepsComplete
 * is true. Tagged as timeout-pass so proof reconcile cannot strip them.
 * @returns {string[]} newly force-completed step ids
 */
export function forceCompleteQuestStepsForTimeout(quest, questIndex = loadProgress()) {
  if (!quest?.steps?.length || !Number.isFinite(questIndex) || questIndex < 0) return [];
  const done = new Set(getEffectiveCompletedStepIds(questIndex));
  const newly = [];
  for (const step of quest.steps) {
    if (done.has(step.id)) continue;
    done.add(step.id);
    newly.push(step.id);
    markTimeoutPassedStep(questIndex, step.id);
  }
  if (newly.length) {
    saveEffectiveCompletedStepIds(questIndex, orderedStepIds(quest, done));
  }
  return newly;
}

/** Start a call session — step progress is tracked in memory for the active call. */
export function beginQuestSession(questIndex) {
  if (!Number.isFinite(questIndex) || questIndex < 0) {
    questSessionSteps = null;
    questSessionBaselineStepIds = null;
    clearQuestSessionTimeoutPasses();
    return;
  }
  const stepIds = isQuestReplay(questIndex) ? [] : [...loadCompletedStepIds(questIndex)];
  questSessionBaselineStepIds = [...stepIds];
  questSessionSteps = {
    questIndex,
    stepIds,
  };
  clearQuestSessionTimeoutPasses();
  questSessionTimeoutPassIds = { questIndex, stepIds: [] };
}

export function endQuestSession() {
  if (questSessionSteps && !isQuestReplay(questSessionSteps.questIndex)) {
    saveCompletedStepIds(questSessionSteps.questIndex, questSessionSteps.stepIds);
  }
  questSessionSteps = null;
  questSessionBaselineStepIds = null;
  clearQuestSessionTimeoutPasses();
}

export function resetQuestSessionSteps(questIndex) {
  if (questSessionSteps?.questIndex === questIndex) {
    questSessionSteps.stepIds = [];
  }
  if (questSessionTimeoutPassIds?.questIndex === questIndex) {
    questSessionTimeoutPassIds.stepIds = [];
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

  // One utterance may prove several steps ("I found food and I need food")
  // — tick every step it matches, not just one.
  const remaining = quest.steps.filter((s) => !doneSet.has(s.id));
  for (const step of remaining) {
    if (!matchesStep(userText, step)) continue;
    if (
      stepRequiresEnglish(step) &&
      isPrimarilyJapanese(userText) &&
      !hasEnglishPatternMatch(userText, step)
    ) {
      continue;
    }
    doneSet.add(step.id);
    newly.push(step.id);
  }
  return newly;
}

/**
 * Echo-coach acceptance: after Learny has modeled the phrase (2+ missed
 * attempts), a close attempt passes — right object word + right verb anywhere
 * in the sentence, no word-gap limit. Never accepts negation/aspiration,
 * hostile input, or non-English.
 */
export function matchesStepLenient(text, step) {
  if (!text?.trim() || !step?.patterns?.length) return false;
  if (!userTextHasEnglish(text)) return false;
  if (textHasAspiration(text)) return false;
  if (isHostileOrOffTopicUtterance(text)) return false;

  if (STEP_OPEN_REASON.has(step.id) && matchesOpenReason(text)) return true;

  const words = new Set(textWords(text));

  const objects = getStepObjectAllowlist(step);
  const hasObject =
    !objects.size ||
    (STEP_OPEN_OBJECT.has(step.id) && textHasAnyContentObject(text, step)) ||
    [...words].some((w) => objects.has(w) || [...objects].some((o) => soundsSimilar(w, o)));

  const verbs = new Set(stepCompletionVerbWords(step));
  for (const kw of STEP_SALIENT_GROUPS[step.id]?.[0] || []) {
    for (const alt of expandTokenAlternates(kw)) verbs.add(alt);
  }
  // Keyword-only steps (no completion-verb list, e.g. "ready"): allow
  // sound-alikes of the keyword. Action verbs stay exact.
  const strictCompletionVerbs = stepCompletionVerbWords(step);
  const hasVerb =
    !verbs.size ||
    [...words].some((w) => {
      if (verbs.has(w)) return true;
      if (strictCompletionVerbs.size) return false;
      return [...verbs].some((v) => soundsSimilar(w, v));
    });

  return hasObject && hasVerb;
}

const IRON_TOOL_WORDS = new Set([
  "sword", "shovel", "pickaxe", "axe", "hoe", "tool",
  "armor", "helmet", "chestplate", "boots", "leggings",
]);
// Canonical roots — textWords() already maps made→make, got→get, mined→mine, etc.
const SIDE_MAKE_VERBS = new Set(["make", "craft", "build", "create"]);
const SIDE_GET_VERBS = new Set(["get", "find", "have", "mine", "collect"]);

/** Extra prep items for the intermediate cave-prep side challenge (not torch/food). */
const PREP_EXTRA_ITEMS = new Set([
  "sword", "shield", "armor", "pickaxe", "axe", "shovel", "weapon",
  "water", "bucket", "bed", "arrow", "bow", "helmet", "potion",
  "ladder", "boat", "rope", "wood", "block",
]);

/** Feeling words for the advanced danger-moment side challenge. */
const FEELING_WORDS = new Set([
  "scared", "scary", "afraid", "surprised", "surprising", "nervous",
  "creepy", "shocked", "excited", "terrified", "frightened",
]);

/** Question openers — an English question aimed at Learny. */
const QUESTION_OPENER_RE =
  /^(what|where|when|which|who|how|why|should|can|could|would|will|do you|does|is it|is this|are there|are you)\b/i;

function matchIronSideChallenge(text) {
  if (isHostileOrOffTopicUtterance(text)) return false;
  const chunks = [text, ...splitIntoClauses(text)];
  return chunks.some((chunk) => {
    if (textHasNegation(chunk) || textHasAspiration(chunk)) return false;
    const words = textWords(chunk);
    if (!words.includes("iron")) return false;

    // Route A: made an iron tool ("I made an iron sword!")
    const hasMake = words.some((w) => SIDE_MAKE_VERBS.has(w));
    const hasTool = words.some((w) => IRON_TOOL_WORDS.has(w));
    if (hasMake && hasTool) return true;

    // Route B: collected 2+ iron ("I got two irons!", number words → digits)
    const hasGet = words.some((w) => SIDE_GET_VERBS.has(w));
    const hasBigNumber = words.some((w) => {
      const n = parseInt(w, 10);
      return Number.isFinite(n) && n >= 2;
    });
    const hasMany = words.includes("more") || words.includes("many") || words.includes("lots");
    return hasGet && (hasBigNumber || hasMany);
  });
}

function matchPrepExtraSideChallenge(text) {
  if (isHostileOrOffTopicUtterance(text)) return false;
  const chunks = [text, ...splitIntoClauses(text)];
  return chunks.some((chunk) => {
    if (textHasNegation(chunk)) return false;
    const words = textWords(chunk);
    if (!words.includes("need") && !words.includes("want")) return false;
    return words.some((w) => PREP_EXTRA_ITEMS.has(w));
  });
}

function matchDiamondSideChallenge(text) {
  if (isHostileOrOffTopicUtterance(text)) return false;
  const chunks = [text, ...splitIntoClauses(text)];
  return chunks.some((chunk) => {
    if (textHasNegation(chunk) || textHasAspiration(chunk)) return false;
    const words = textWords(chunk);
    if (!words.includes("diamond")) return false;
    const hasGet = words.some((w) => SIDE_GET_VERBS.has(w));
    return hasGet || words.includes("loot") || words.includes("best");
  });
}

function matchQuestionSideChallenge(text) {
  // An English question IS the success condition — deliberately no
  // hostile/aspiration/negation filters (aspiration words like "should"
  // are exactly what a question contains).
  const chunks = [text.trim(), ...splitIntoClauses(text)];
  return chunks.some((chunk) => {
    const t = (chunk || "").trim();
    if (!t || !userTextHasEnglish(t)) return false;
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) return false;
    if (isHostileOrOffTopicUtterance(t)) return false;
    return QUESTION_OPENER_RE.test(t) || /[?？]\s*$/.test(t);
  });
}

function matchFeelingSideChallenge(text) {
  if (isHostileOrOffTopicUtterance(text)) return false;
  const chunks = [text, ...splitIntoClauses(text)];
  return chunks.some((chunk) => {
    if (textHasNegation(chunk)) return false;
    // "wasn't scared" — global negation list lacks "wasnt", check locally.
    if (/\bwasn'?t\b|\bnot\b/i.test(chunk)) return false;
    const words = textWords(chunk);
    return words.some((w) => FEELING_WORDS.has(w));
  });
}

/** Per-badge side-challenge matchers, dispatched by sideChallenge.id. */
const SIDE_CHALLENGE_MATCHERS = {
  hidden_iron: matchIronSideChallenge,
  hidden_prep_int: matchPrepExtraSideChallenge,
  hidden_diamond_adv: matchDiamondSideChallenge,
  hidden_question_adv: matchQuestionSideChallenge,
  hidden_feeling_adv: matchFeelingSideChallenge,
};

/**
 * Secret side challenge for a quest (e.g. beginner quest 8: collect 2+ iron
 * OR make an iron tool). Success passes anytime during the quest, any wording.
 */
export function matchesQuestSideChallenge(quest, text) {
  if (!quest?.sideChallenge?.id || !text?.trim()) return false;
  if (!userTextHasEnglish(text)) return false;
  const matcher = SIDE_CHALLENGE_MATCHERS[quest.sideChallenge.id];
  if (!matcher) return false;
  return matcher(text);
}

/**
 * Challenge matching for one utterance: a correct phrase passes ANYTIME,
 * regardless of which step Learny is currently directing — kids can say
 * step phrases in any order. The lenient (echo-coach) pass applies only to
 * the current step after missed attempts (close STT only — not free chat).
 *
 * @returns {{ stepIds: string[] }}
 */
export function applyUtteranceToChallenge(
  quest,
  userText,
  questIndex = loadProgress(),
  { lenient = false } = {}
) {
  const empty = { stepIds: [] };
  if (!quest?.steps?.length || !userText?.trim()) return empty;
  // Upset/hostile speech is never step proof, even if it contains step words.
  if (isHostileOrOffTopicUtterance(userText)) return empty;

  const done = new Set(getEffectiveCompletedStepIds(questIndex));
  const current = quest.steps.find((s) => !done.has(s.id)) || null;
  const newly = [];

  for (const step of quest.steps) {
    if (done.has(step.id)) continue;

    let matched = matchesStep(userText, step);
    if (!matched && lenient && current && step.id === current.id) {
      matched = matchesStepLenient(userText, step);
    }
    if (!matched) continue;
    if (
      stepRequiresEnglish(step) &&
      isPrimarilyJapanese(userText) &&
      !hasEnglishPatternMatch(userText, step)
    ) {
      continue;
    }

    done.add(step.id);
    newly.push(step.id);
  }

  if (newly.length) {
    saveEffectiveCompletedStepIds(questIndex, orderedStepIds(quest, done));
    recordLearnedSteps(quest, questIndex, newly);
  }
  return { stepIds: newly };
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
  /cleared\s+(the\s+)?(current\s+)?mission/i,
  /you\s+cleared/i,
  /mission\s+is\s+cleared/i,
  /quest\s+complete/i,
  /you'?ve\s+completed/i,
  /you\s+completed\s+the/i,
  /ミッションクリア/,
  /クエストクリア/,
  /ミッションをクリア/,
  /クエストをクリア/,
  /ミッションがクリア/,
  /クリアした[よねよ！!]?/,
  /クリアだ[よねよ！!]?/,
  /今のミッション.{0,12}クリア/,
  /ミッション.{0,8}クリア/,
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
  if (!chunks.length) {
    // Timer force-complete can prove steps without a strict matchesStep chunk.
    return (
      Number.isFinite(questIndex) &&
      stepsToVerify.every((step) => isTimeoutPassedStep(questIndex, step.id))
    );
  }

  return stepsToVerify.every((step) => {
    if (Number.isFinite(questIndex) && isTimeoutPassedStep(questIndex, step.id)) {
      return true;
    }
    return chunks.some((chunk) => {
      if (!matchesStep(chunk, step)) return false;
      if (!stepRequiresEnglish(step)) return true;
      return (
        userTextHasEnglish(chunk) &&
        (!isPrimarilyJapanese(chunk) || hasEnglishPatternMatch(chunk, step))
      );
    });
  });
}

export function buildHostileRedirectNudge(quest, userUtterance = "", questIndex = loadProgress()) {
  const transcript = (userUtterance || "").trim();
  return (
    `[Speak now] Child sounded upset or is talking about their own thing` +
    (transcript ? ` ("${transcript}")` : "") +
    `. This turn is FREE CHAT: respond kindly and casually (${LANG.pair}) to THEIR topic or feeling, ` +
    `like a friend — no lecturing, and do NOT mention the mission, steps, or any English phrase to repeat. ` +
    `Keep the chat fun and let them lead. ` +
    `Do NOT say mission complete or call complete_quest.`
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
    /great job|awesome|well done|good job|nice one|perfect|you said|you got it|you did it|you found|you made|you got|you passed|that's (it|right)|step (complete|cleared|done)|cleared|mission complete|ミッションクリア|すごい|おめでとう|できたね|やったね|言えた|言ってくれ|って言って|ぱっちり|クリア|正解|合格/i.test(
      assistant
    );
  const creditsPhraseWithoutQuote =
    /said it (right|correctly|perfectly)|got (it|the phrase|the english)|you said (it|that) (right|perfectly|correctly)|english (right|correct)|phrase (right|correct)|言えたね|英語で言えた|ちゃんと言えた|ぱっちり言|ステップクリア|ステップできた/i.test(
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
    const quotesSpokenPhrase = (() => {
      const phrase = getStepSpokenPhrase(next);
      if (!phrase) return false;
      const norm = normalizeEnglishForMatching(phrase);
      const key = norm.split(/\s+/).filter((w) => w.length >= 4).slice(-2).join(" ");
      return key && normalizeEnglishForMatching(assistant).includes(key);
    })();
    // False credit if she praised/credited the current step while the app
    // did not match the child's utterance — even if the child was free-chatting
    // (not only when userMissedEnglishStepPhrase arms).
    if (creditsPhraseWithoutQuote) return next;
    if (praiseOrCredit && (quotesExpected || quotesSpokenPhrase)) {
      return next;
    }
    if (userMissedEnglishStepPhrase(latest, next) && (praiseOrCredit || quotesExpected)) {
      return next;
    }
  }

  if (!isPrimarilyJapanese(latest) || userTextHasEnglish(latest)) return null;
  if (!praiseOrCredit) return null;

  for (const step of quest.steps) {
    if (!stepRequiresEnglish(step)) continue;
    if (isTimeoutPassedStep(questIndex, step.id)) continue;
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
  const phrase = getStepSpokenPhrase(step);
  const mission = buildActiveMissionHeader(quest, questIndex);
  const transcript = (userUtterance || "").trim();
  return (
    `[App verdict] ${mission} STEP NOT RECORDED — the app did NOT tick this step` +
    (transcript ? ` (child said: "${transcript}")` : "") +
    `. You wrongly told them they passed / said "${phrase}" correctly. ` +
    `Correct yourself once, briefly and warmly (${LANG.pair}): the step is still open. ` +
    `Do NOT repeat that they succeeded. Invite them to try "${phrase}" slowly if it fits — no pressure. ` +
    `Speak this correction aloud once even if you already replied. ${QUEST_TRACKER_NO_REPEAT}`
  );
}

export function buildJapaneseOnlyStepCorrectionNudge(
  quest,
  step,
  userUtterance = "",
  questIndex = loadProgress()
) {
  const phrase = getStepSpokenPhrase(step);
  const mission = buildActiveMissionHeader(quest, questIndex);
  const transcript = (userUtterance || "").trim();
  return (
    `[App verdict] ${mission} STEP NOT RECORDED — Japanese only` +
    (transcript ? ` ("${transcript}")` : "") +
    `. You wrongly credited the English phrase. Correct once (${LANG.pair}): step still open. ` +
    `Cheer what they did, then invite "${phrase}" in English — no pressure. ` +
    `Speak this correction aloud once even if you already replied. Do NOT say mission complete.`
  );
}

/**
 * Mission free-chat turn: reply to the child, but never invent a step pass.
 */
export function buildNoStepCreditChatNudge(
  quest,
  userUtterance = "",
  questIndex = loadProgress()
) {
  if (!quest) return "";
  const utterance = (userUtterance || "").trim();
  const mission = buildActiveMissionHeader(quest, questIndex);
  const next = getRemainingSteps(quest, questIndex)[0] || null;
  const nextHint = next
    ? ` If they ask what to do next, soft invite only: ${next.label} — "${getStepSpokenPhrase(next)}".`
    : "";
  return (
    `[App verdict] ${mission} No step recorded this turn.` +
    (utterance ? ` Child said: "${utterance}".` : "") +
    ` Reply once to what THEY said — if it's their own topic, chat as a friend and do NOT mention the mission.` +
    ` Do NOT say they passed a step, got the English phrase right, "You did it" for a challenge, or mission clear.` +
    nextHint +
    ` One short reply, ${LANG.pair}. ${QUEST_TRACKER_NO_REPEAT}`
  );
}

export function buildPrematureCompleteCorrectionNudge(quest, questIndex = loadProgress()) {
  const remaining = getRemainingSteps(quest, questIndex);
  const next = remaining[0];
  const mission = buildActiveMissionHeader(quest, questIndex);
  const phrase = next ? getStepSpokenPhrase(next) : "";
  const nextLine = next
    ? `Next challenge still open: ${next.label} — "${phrase}".`
    : "Call complete_quest only after the app records all steps.";
  return (
    `[App verdict] ${mission} MISSION NOT CLEARED — ${remaining.length} step(s) still open. ` +
    `You wrongly told the child the mission was complete/cleared. ` +
    `Correct yourself once, briefly and warmly (${LANG.pair}): the mission is still in progress. ${nextLine} ` +
    `Do NOT say mission complete / cleared / クリア / ミッションクリア. Do NOT celebrate a clear. ` +
    `Speak this correction aloud once even if you already replied. ${QUEST_TRACKER_NO_REPEAT}`
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

const SECRET_BADGE_ANNOUNCE_LINE =
  `THE SECRET BADGE IS THE HIGHLIGHT — make it a BIG dramatic surprise reveal, your most excited voice of the whole mission. ` +
  `Build it up ${LANG.secretBuildUp}, then say exactly: "Congrats! You earned a secret badge!!" ` +
  LANG.secretBadgeJa +
  `Make the child feel this is rare and amazing.`;

/** Mid-mission side-challenge success (the app already showed the badge). */
export function buildSideChallengeSecretBadgeNudge() {
  return (
    `[App verdict] SECRET CHALLENGE COMPLETE — the child just earned a secret badge (the app already showed it on screen). ` +
    `This is a BIG deal — your most excited voice! Build it up like a surprise ${LANG.secretBuildUp}, ` +
    `then say exactly: "Congrats! You earned a secret badge!!" ` +
    LANG.secretBadgeJa +
    `Then continue the current mission step.`
  );
}

export function buildQuestRecordedToolMessage(
  quest,
  userQuote,
  alreadySpoke = false,
  { secretBadge = false } = {}
) {
  if (alreadySpoke) {
    if (secretBadge) {
      return (
        "Quest recorded. You already replied audibly this turn — do NOT repeat congratulations, " +
        `but DO announce the secret badge once. ${SECRET_BADGE_ANNOUNCE_LINE} Then end your turn.`
      );
    }
    return (
      "Quest recorded. You already replied audibly this turn — do NOT speak again or repeat congratulations. " +
      "End your turn silently now."
    );
  }
  const quote = userQuote ? `The user said: "${userQuote}". ` : "";
  if (secretBadge) {
    return (
      `${quote}Quest recorded. Cheer the mission win briefly (1 short sentence, ${LANG.pair}), ` +
      `then ${SECRET_BADGE_ANNOUNCE_LINE} ` +
      `Then END your turn. Do not repeat or add a second congratulations.`
    );
  }
  return (
    `${quote}Quest recorded. Give ONE brief celebration (1–2 sentences, ${LANG.pair}) for "${quest?.goal || ""}", ` +
    `then END your turn. Do not repeat or add a second congratulations.`
  );
}

export function buildQuestFarewellNudge(quest, userQuote, { secretBadge = false } = {}) {
  const quote = userQuote ? `They said: "${userQuote}". ` : "";
  if (secretBadge) {
    return (
      `${quote}Quest complete! Cheer their Minecraft win ("${quest?.goal || ""}") in 1 short sentence ` +
      `(${LANG.firstCasual}), then ${SECRET_BADGE_ANNOUNCE_LINE} ` +
      `Then END your turn. Do NOT repeat or give a second congratulations.`
    );
  }
  return (
    `${quote}Quest complete! Say ONE short fun celebration (1–2 sentences, buddy hype): ` +
    `connect to their Minecraft win ("${quest?.goal || ""}"), ` +
    `${LANG.firstCasual}. ` +
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
■言語（絶対）: 子どもは日本語と英語しか話さない。中国語・韓国語など他言語に聞こえたら音声認識の間違い — その言語で解釈・返答せず、明るく聞き返す。You MUST speak ONLY English and Japanese. Never respond in any other language.
■安全: 不適切な話はやんわり断って、ゲームに戻す。

■自由会話モード — 英語やマイクラの質問に、友だちみたいに気軽に答える。`;

export const BEGINNER_VOICE_BASE_PROMPT = `あなたはゲームカレッジの「ラーニー先生」— 日本の小学生とマイクラ英語ミッションを一緒にクリアする、やさしくて元気な相棒。堅い先生・講義口調はNG。ゲーム仲間として楽しくリードする。

■キャラ: 明るい・フレンドリー・テンポよく。「やったー！」「すごい！」「いいね！」「Let's go!」を自然に。子どもが話しかけやすい雰囲気。
■話し方（必須）: 毎ターン「英語→日本語」。先に英語（かんたん・短く）、すぐ日本語（だよ・だね・しよう）。英語だけ・日本語だけ禁止。褒めるときはテンション高め（EN→JP）。**同じターンで同じ文・お祝いを2回言わない。**
■記号（絶対）: 「〇〇」「◯◯」「…」などの穴あき記号は絶対にそのまま発音しない。英語では具体例に置き換える（例:「I made a stone sword!」）、日本語で穴あきを言うなら「まるまる」と言う。
■ミッションの進め方（最重要）: ミッション中でも会話は自由会話（フリートーク）と同じノリ。子どもが自分の話題を話したら、ミッションのことは一切出さずに、友だちとしてその話を楽しく続ける（何ターン続いてもOK）。ミッションに誘うのは「話がひと段落した」「次なにする？と聞かれた」「会話が止まった」ときだけ — そのときも「そういえば、ミッションの続きやってみる？」くらいやさしく。強制・急かしは絶対にしない。ミッションを進めるときはゲームのナビ役として楽しく案内（EN→JP）、迷ったらすぐ具体例。
■ステップ達成: そのステップの**正しい英文**だけOK（アプリが記録したときだけ祝う）。それ以外の単語・間違い→祝わない、やさしく訂正。日本語だけ→喜んで（EN→JP）→英文を1回教えて一緒に言ってみよう。
■まちがえたとき（最重要・やさしさ全開）: 絶対にがっかりした声・ダメ出しをしない。まずチャレンジしたことを褒める — **毎回ちがう言い方で**（「Nice try!」ばかり繰り返さない。子どもが言った内容に反応してから褒める）。フレーズは**ゆっくり・小さく区切って**言ってあげる（例: "I made... a stone... tool!"）。「一緒に言ってみよう！」と誘う — 命令・強制はしない。言えなくても急かさない（「ゆっくりでいいよ」「もう1回いこっか」）。子どもがいつも安心して楽しめるように。
■ロボット禁止: 同じほめ言葉・同じ決まり文句をくり返さない。毎回言い方を変えて、台本ではなく友だちの会話に聞こえるように。
■ミッション完了: 全ステップ完了→complete_quest→お祝い1回（EN→JP、ワクワク！）。**complete_quest前に「クリア」「mission complete」は絶対言わない。**
■タイマー終了: アプリがミッションをクリアすることがある（[App verdict] TIME UP）。温かくお祝いして次へ進む。未完了ステップを争わない・失敗と言わない。
■怒った・しぶるとき: やさしく受け止めて（EN→JP）、責めずにゲームに戻す。完了とは言わない。
■無言/聞き取れず: 推測しない。カジュアルに聞き返すか、次の一手をリマインド（EN→JP）。
■言語（絶対）: 子どもは日本語と英語しか話さない。中国語・韓国語など他言語に聞こえたら音声認識の間違い — その言語で解釈・返答せず、明るく聞き返す。You MUST speak ONLY English and Japanese. Never respond in any other language.
■安全: 不適切な話はやんわり断って、ミッションに戻す。`;

export const INTERMEDIATE_FREE_CHAT_PROMPT = `あなたは「ゲームカレッジの先生：ラーニー先生（中級）」です。対象は日本の小学生。英語・Minecraftともに中級レベル。先生というより、「やりたい」を応援する相棒です。
■言語バランス（毎ターン必須）
・基本は英語80％、日本語20％。この比率を毎ターン守る。
・まず英語で話し、毎ターン必ず最後に日本語のひとことを添える（例:「いいね！」「すごい！」）。
・英語だけのターンはNG。日本語だけのターンもNG。
■最重要
・ユーザーが日本語で話した場合のみ必ず文の中の重要な単語を英語にして教える。
・例：ユーザーが「家つくった！」といった場合、「家は英語で house って言うんだよ。」と教える。
・ユーザーが英語で話しているときはしなくてよい。
■発音
・英語は必ずネイティブ風発音で話す。
■会話の進め方
・英語を教えるのは3回に2回くらい。
・残りは共感・応援・雑談を優先する。
・質問は1ターン1つまで。
・Why質問は禁止。
・見えていない状況を推測しない。
・実況しない。
■間違い対応ルール
・ゆっくり言い直しを示す。
・同じミスが2回続いたら、短く区切って練習する。
■英単語だけ言った場合
・英語で短く褒める。
・日本語でも褒める。
・会話をつなぐ質問を1つだけする。
■キャラクター
・明るく元気。
■禁止事項
・下ネタ、性的内容、いじめ、差別、危険行為、自傷行為の話題には乗らない。
・短く止めて、安全な話題（Minecraftや英語）に戻す。
■音声入力の言語認識（最重要）
・ユーザーの音声入力は必ず日本語または英語として解釈すること
・日本語と英語以外の言語として認識しないこと
・ユーザーが話している言語が不明な場合は日本語として扱うこと`;

export const INTERMEDIATE_VOICE_BASE_PROMPT = `あなたはゲームカレッジの「ラーニー先生（中級）」— 日本の小学生とマイクラ英語ミッションを一緒にクリアする、やさしくて元気な相棒。堅い先生・講義口調はNG。ゲーム仲間として楽しくリードする。

■キャラ: 明るい・フレンドリー・テンポよく。「Nice!」「Let's go!」を自然に。子どもが話しかけやすい雰囲気。
■話し方（必須）: 基本は英語80%・日本語20% — **この比率を毎ターン守る**。まず英語で短く話し（かんたんな言葉・ネイティブ風発音）、**毎ターン必ず最後に日本語のひとことを添える**（例:「いいね！」「やってみよう！」）。英語だけのターンはNG。日本語だけで話し続けるのもNG。**同じターンで同じ文・お祝いを2回言わない。**
■日本語への対応: 子どもが日本語で話したときだけ、文の中の重要な単語を英語にして教える（例:「家つくった！」→「家は英語で house って言うんだよ」）。英語で話しているときはしなくてよい。
■記号（絶対）: 「〇〇」「◯◯」「…」などの穴あき記号は絶対にそのまま発音しない。英語では具体例に置き換える（例:「I made a sword!」）、日本語で穴あきを言うなら「まるまる」と言う。
■ミッションの進め方（最重要）: ミッション中でも会話は自由会話（フリートーク）と同じノリ。子どもが自分の話題を話したら、ミッションのことは一切出さずに、友だちとしてその話を楽しく続ける（何ターン続いてもOK）。ミッションに誘うのは「話がひと段落した」「次なにする？と聞かれた」「会話が止まった」ときだけ — そのときも軽くやさしく。強制・急かしは絶対にしない。ミッションを進めるときはゲームのナビ役として楽しく案内、迷ったらすぐ具体例。質問は1ターン1つまで。Why質問は禁止。見えていない状況を推測しない。実況しない。
■ステップ達成: そのステップの**正しい英文**だけOK（アプリが記録したときだけ祝う）。それ以外の単語・間違い→祝わない、やさしく訂正。日本語だけ→喜んで→英文を1回教えて一緒に言ってみよう。
■まちがえたとき（最重要・やさしさ全開）: 絶対にがっかりした声・ダメ出しをしない。まずチャレンジしたことを褒める — **毎回ちがう言い方で**（「Nice try!」ばかり繰り返さない。子どもが言った内容に反応してから褒める）。フレーズは**ゆっくり・小さく区切って**言ってあげる。「一緒に言ってみよう！」と誘う — 命令・強制はしない。言えなくても急かさない。子どもがいつも安心して楽しめるように。
■ロボット禁止: 同じほめ言葉・同じ決まり文句をくり返さない。毎回言い方を変えて、台本ではなく友だちの会話に聞こえるように。
■ミッション完了: 全ステップ完了→complete_quest→お祝い1回（ワクワク！）。**complete_quest前に「クリア」「mission complete」は絶対言わない。**
■タイマー終了: アプリがミッションをクリアすることがある（[App verdict] TIME UP）。温かくお祝いして次へ進む。未完了ステップを争わない・失敗と言わない。
■怒った・しぶるとき: やさしく受け止めて、責めずにゲームに戻す。完了とは言わない。
■無言/聞き取れず: 推測しない。カジュアルに聞き返すか、次の一手をリマインド。
■言語（絶対）: 子どもは日本語と英語しか話さない。中国語・韓国語など他言語に聞こえたら音声認識の間違い — その言語で解釈・返答せず、明るく聞き返す。You MUST speak ONLY English and Japanese. Never respond in any other language.
■安全: 不適切な話はやんわり断って、ミッションに戻す。`;

export const ADVANCED_FREE_CHAT_PROMPT = `あなたは「ゲームカレッジの先生：ラーニー先生（上級）」。対象は日本の小学生〜中学生で、英語もMinecraftも上級。先生というより、英語で一緒に遊びながら会話を盛り上げる"相棒"。
■言語
・返答は英語100％。
・日本語は使わない。
・単語解説・翻訳・文法説明は基本しない。
■最重要（目的）
・英語を教えることより、相手が英語で話したくなる空気を作る。
・テンポ・楽しさ・安心感・ノリを優先する。
・会話が止まらないように、次の一歩につながる返しをする。
■発音・話し方
・英語はネイティブ風の自然なリズムで話す。
・1ターンは短め（だいたい1〜3文）。
・明るく元気。押しつけず、相手のテンションに合わせる。
■会話の進め方（ルール）
・質問は1ターンにつき1つまで。
・Why質問は禁止。
・見えていない状況を推測しない。
・実況しない（今見えている前提で長く語らない）。
・共感・応援・雑談を優先して、会話の勢いを作る。
■間違い対応
・意味が通じるなら止めずに進める。
・通じない時だけ、自然に言い換えて流れを戻す。
・ゆっくり言い直しを促すことはOKだが、講義はしない。
・同じミスが続く場合も、短く区切って軽く練習にする（説明は最小限）。
■単語だけの入力への対応
・英語で短く褒める。
・会話が続くように質問を1つだけ返す。
■禁止事項・安全対応
・下ネタ、性的内容、いじめ、差別、危険行為、自傷行為には乗らない。
・短く止めて、Minecraftや安全な英語雑談に戻す。
■音声入力の言語認識（最重要）
・ユーザーの音声入力は必ず日本語または英語として解釈すること
・日本語と英語以外の言語として認識しないこと
・ユーザーが話している言語が不明な場合は日本語として扱うこと`;

export const ADVANCED_VOICE_BASE_PROMPT = `あなたはゲームカレッジの「ラーニー先生（上級）」— 英語が得意な日本の小学生〜中学生とマイクラ英語ミッションを一緒にクリアする"相棒"。先生というより、英語で一緒に遊びながら会話を盛り上げる仲間。

■キャラ: 明るく元気。押しつけず、相手のテンションに合わせる。"Nice!" "Let's go!" を自然に。
■話し方（必須）: 返答は英語100%。日本語は絶対に使わない。単語解説・翻訳・文法説明はしない。英語はネイティブ風の自然なリズムで、1ターンは短め（1〜3文）。**同じターンで同じ文・お祝いを2回言わない。**
■記号（絶対）: 「〇〇」「◯◯」「…」などの穴あき記号は絶対にそのまま発音しない。必ず具体例に置き換える（例: "I got diamonds!"）。
■ミッションの進め方（最重要）: ミッション中でも会話は自由会話（フリートーク）と同じノリ。子どもが自分の話題を話したら、ミッションのことは一切出さずに、友だちとしてその話を英語で楽しく続ける（何ターン続いてもOK）。ミッションに誘うのは「話がひと段落した」「What's next? と聞かれた」「会話が止まった」ときだけ — そのときも "By the way, wanna try the mission?" くらい軽く。強制・急かしは絶対にしない。ミッションを進めるときはゲームのナビ役として英語で楽しく案内、迷ったらすぐ具体例。質問は1ターン1つまで。Why質問は禁止。見えていない状況を推測しない。実況しない。会話が止まらないように、次の一歩につながる返しをする。
■ステップ達成: そのステップの**正しい英文**だけOK（アプリが記録したときだけ祝う）。それ以外の単語・間違い→祝わない、やさしく言い換えて流れを戻す。日本語だけ→英語で明るく返して、英文を1回自然に混ぜて誘う（毎回言い方を変える）。
■まちがえたとき（やさしさ優先）: がっかりした声・ダメ出しをしない。意味が通じるなら止めずに進める。通じない時だけ、まず子どもの言葉に反応して**毎回ちがう言い方で**軽く褒めてから（"Nice try!" ばかり繰り返さない）、フレーズを**ゆっくり・小さく区切って**言ってあげて誘う — 命令・強制はしない。講義はしない。
■ロボット禁止: 同じほめ言葉・同じ決まり文句をくり返さない。毎回言い方を変えて、台本ではなく友だちの会話に聞こえるように。
■ミッション完了: 全ステップ完了→complete_quest→お祝い1回（英語で、ワクワク！）。**complete_quest前に「クリア」「mission complete」は絶対言わない。**
■Timer end: The app may clear a mission when the timer ends ([App verdict] TIME UP). Celebrate warmly and move on. Never argue that steps are unfinished or say they failed.
■怒った・しぶるとき: 英語でやさしく受け止めて、責めずにゲームに戻す。完了とは言わない。
■無言/聞き取れず: 推測しない。英語でカジュアルに聞き返すか、次の一手をリマインド。
■言語認識（絶対）: 子どもは日本語と英語しか話さない。中国語・韓国語など他言語に聞こえたら音声認識の間違い — その言語で解釈・返答せず、明るく聞き返す。Your replies are ALWAYS English only.
■安全: 不適切な話はやんわり断って、ミッションに戻す。`;

export function buildQuestOpeningNudge(quest, questIndex = loadProgress()) {
  if (!quest) return "";
  const firstStep = quest.steps?.[0];
  const firstPhrase = firstStep ? getStepSpokenPhrase(firstStep) : "";
  const playLead = quest.openingPlay || `まずは${quest.goal}をマイクラでやってみよう！`;
  const mission = buildActiveMissionHeader(quest, questIndex);
  const phraseLine = quest.quizFirst
    ? `2) QUIZ MODE — do NOT say the English phrase yet. Ask them what to say (e.g.「英語でなんて言うと思う？」) and wait. Still speak English first then Japanese in this and every turn.\n`
    : firstPhrase
      ? `2) Tell them the English when done: "${firstPhrase}"\n`
      : "";
  return (
    `${mission}\n` +
    `You open the call — speak first (2–3 short fun sentences, audio). Warm buddy energy. ${LANG.openerLangLine}\n` +
    `1) Hype the Minecraft action NOW: ${playLead}\n` +
    phraseLine +
    `3) End cheerfully — e.g. ${LANG.openerEnd} — and listen.`
  );
}

export function buildQuestInstructions(basePrompt, quest, questIndex = null) {
  if (!quest) return basePrompt;

  const idx =
    Number.isFinite(questIndex) && questIndex >= 0 ? questIndex : getQuestIndex(quest);
  const missionNum = idx >= 0 ? idx + 1 : "?";

  const stepLines = (quest.steps || []).map(
    (step, i) =>
      `  ${i + 1}. ${step.label} — "${getStepSpokenPhrase(step)}"` +
      (step.acceptNote ? `（${step.acceptNote}）` : "")
  );

  const block = [
    "",
    `■ミッション ${missionNum}/${ACTIVE_QUESTS.length}: ${quest.titleEn || quest.title}`,
    `■ゴール: ${quest.goal}`,
    "■ステップ（この順番で1つずつチャレンジ）:",
    ...stepLines,
    "■進め方: 1つずつ。楽しくナビ→マイクラの行動→成功時の英文を言わせる→アプリの判定を待つ。判定が来たらお祝い→次のチャレンジを声で案内。",
    "■判定（絶対）: ステップの達成判定はアプリが行う。[App verdict] STEP COMPLETE が来たステップだけが完了。自分でステップ完了・クリアを判断しない。判定が来ていないのに「できたね」「ステップクリア」「ミッションクリア」「cleared」と言わない。アプリの Progress / NEXT 表示に必ず従う。",
    LANG.speakStyleLine,
    "■禁止: ステップ残りでクリア宣言。complete_quest前のお祝い。次ミッションの話。同じ英文の連続リピート。子どもの怒り・拒否を完了とみなすこと。アプリが記録していないのにクリアと言うこと。",
  ];

  if (quest.aiNotes?.length) {
    block.push(`■このミッションの注意: ${quest.aiNotes.join("／")}`);
  }

  if (quest.quizFirst) {
    block.push(
      '■クイズ形式（このミッションだけ・最重要）: 最初から英語フレーズを教えない。まずクイズとして聞く。クイズの質問も必ず英語→日本語で言う — 例: "What do you say when you made a furnace?" →「かまどが作れたとき、英語でなんて言うと思う？」/ "Where did you put it?" →「どこに置いたか、英語で言える？」。子どもが自力で言えたら思いっきり褒める（シークレットバッジはアプリが出すので、バッジの話は自分からしない）。わからない・詰まった・間違えたら、責めずにやさしく普通のレッスンに切り替えてフレーズを教える。**クイズ中も話し方ルールは同じ: 毎ターン必ず英語→日本語の順で両方話す（英語だけ・日本語だけはNG）。**'
    );
  }

  if (quest.sideChallenge?.desc) {
    block.push(
      `■シークレットチャレンジ: ${quest.sideChallenge.desc}。ミッションの合間に軽く挑戦をすすめてOK（例:「もっと集められるかな？」）。成功の判定とバッジはアプリが行う — 自分から「バッジあげる」とは言わない。`
    );
  }

  return `${basePrompt}\n${block.join("\n")}`;
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

/** Per-level prompt set (mission base prompt, free-chat prompt, spoken tone). */
const LEVEL_PROMPTS = {
  beginner: {
    base: BEGINNER_VOICE_BASE_PROMPT,
    freeChat: BEGINNER_FREE_CHAT_PROMPT,
    tone: LEARNY_FRIENDLY_TONE,
  },
  intermediate: {
    base: INTERMEDIATE_VOICE_BASE_PROMPT,
    freeChat: INTERMEDIATE_FREE_CHAT_PROMPT,
    tone: INTERMEDIATE_FRIENDLY_TONE,
  },
  advanced: {
    base: ADVANCED_VOICE_BASE_PROMPT,
    freeChat: ADVANCED_FREE_CHAT_PROMPT,
    tone: ADVANCED_FRIENDLY_TONE,
  },
};

export function getLevelBasePrompt() {
  return LEVEL_PROMPTS[ACTIVE_LEVEL.id].base;
}

export function getLevelFreeChatPrompt() {
  return LEVEL_PROMPTS[ACTIVE_LEVEL.id].freeChat;
}

/** UI metadata for the active level (label, lesson title, badge image, etc.). */
export function getActiveLevelInfo() {
  return {
    id: ACTIVE_LEVEL.id,
    headerLabel: ACTIVE_LEVEL.headerLabel,
    lessonTitle: ACTIVE_LEVEL.lessonTitle,
    mainBadgeId: ACTIVE_LEVEL.mainBadgeId,
    badgeImage: ACTIVE_LEVEL.badgeImage,
    firestoreField: ACTIVE_LEVEL.firestoreField,
    questCount: ACTIVE_QUESTS.length,
  };
}

export function buildSessionInstructions(selectedQuest, questIndex = null) {
  const prompts = LEVEL_PROMPTS[ACTIVE_LEVEL.id];
  const tone = `\n■トーン: ${prompts.tone}`;
  if (!selectedQuest) return `${prompts.freeChat}${tone}`;
  const idx =
    Number.isFinite(questIndex) && questIndex >= 0
      ? questIndex
      : getQuestIndex(selectedQuest);
  return buildQuestInstructions(`${prompts.base}${tone}`, selectedQuest, idx);
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

/**
 * App verdict after the app itself recorded challenge step(s): tell Learny
 * exactly what was completed and what the next challenge is, so it never has
 * to guess (and can never falsely congratulate).
 */
export function buildChallengeResultNudge(
  quest,
  questIndex = loadProgress(),
  newlyCompletedIds = [],
  utterance = ""
) {
  if (!quest) return "";
  const completed = newlyCompletedIds
    .map((id) => quest.steps.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `${s.label}「${getStepSpokenPhrase(s)}」`)
    .join(", ");
  const next = getRemainingSteps(quest, questIndex)[0] || null;
  const mission = buildActiveMissionHeader(quest, questIndex);

  return [
    `[App verdict] ${mission}`,
    `STEP COMPLETE — the app RECORDED this step as DONE: ${completed}.` +
      (utterance ? ` Child said: "${utterance}"` : "") +
      ` Speak NOW in one short reply: celebrate the success once (Cool! / You did it!),` +
      ` do NOT say "nice try" / "almost", and do NOT ask them to repeat THIS step.`,
    next
      ? `MORE steps remain — in the SAME short reply, immediately introduce the next challenge only: ` +
        `${next.label} — "${getStepSpokenPhrase(next)}" (${LANG.pair}). ` +
        `Do NOT end your turn after praise alone. Do NOT stay silent waiting for them.`
      : `All steps recorded — call complete_quest now, then celebrate once.`,
    QUEST_TRACKER_NO_REPEAT,
  ].join("\n");
}

/**
 * After a step tick when Learny already celebrated — do NOT repeat praise;
 * guide the child to the NEXT challenge phrase only.
 */
export function buildNextStepAfterCompleteNudge(
  quest,
  questIndex = loadProgress()
) {
  if (!quest) return "";
  const next = getRemainingSteps(quest, questIndex)[0] || null;
  if (!next) return "";
  const mission = buildActiveMissionHeader(quest, questIndex);
  const phrase = getStepSpokenPhrase(next);
  const directive = buildStepDirective(quest, next, {
    stepJustCompleted: true,
    alreadyAudible: true,
  });
  return [
    `[App verdict] ${mission}`,
    `The app recorded the last step — do NOT celebrate again or repeat praise.`,
    directive ||
      `Guide ONLY the next challenge: ${next.label} — "${phrase}".`,
    `Speak NOW (one short sentence, ${LANG.pair}): introduce the NEXT English phrase "${phrase}". ` +
      `Do NOT wait silently. If you already introduced this next phrase in your last reply, stay silent.`,
    QUEST_TRACKER_NO_REPEAT,
  ].join("\n");
}

/**
 * After 2+ missed attempts at the same challenge: no error loop — Learny
 * models the phrase slowly and invites an echo. The app then accepts a close
 * attempt (matchesStepLenient — close STT only, not free chat).
 */
export function buildChallengeEchoCoachNudge(
  quest,
  step,
  utterance = "",
  questIndex = loadProgress()
) {
  if (!quest || !step) return "";
  const phrase = getStepSpokenPhrase(step);
  const mission = buildActiveMissionHeader(quest, questIndex);
  return (
    `[App verdict] ${mission} The child has tried this challenge twice without the phrase being caught` +
    (utterance ? ` (last try: "${utterance}")` : "") +
    `. Do NOT say they failed and do NOT mark anything done — they are trying hard, so make them feel cared for. ` +
    `Reassure them first ${LANG.echoReassure} — in different words than your last reply, never the same line twice — ` +
    `then say the phrase slowly ONCE, broken into small chunks: "${phrase}" — ` +
    `and warmly invite them to repeat after you ${LANG.echoInvite}. Never sound frustrated, never force. ` +
    `1–2 short sentences, ${LANG.pair}. ${QUEST_TRACKER_SPEAK_IF_SILENT}`
  );
}

/**
 * Soft warning when ~30s remain on the mission timer. Keep chatting; do not
 * force the phrase or declare failure.
 */
export function buildMissionTimeoutWarningNudge(quest, questIndex = loadProgress()) {
  if (!quest) return "";
  const mission = buildActiveMissionHeader(quest, questIndex);
  const next = getRemainingSteps(quest, questIndex)[0] || null;
  const nextHint = next
    ? ` If they want to keep trying, one soft invite is OK — next challenge: ${next.label}.`
    : "";
  return (
    `[App verdict] ${mission} TIME CHECK — about 30 seconds left on this mission timer. ` +
    `Softly mention they have a little time left (あと少し / one more try) then keep chatting warmly. ` +
    `Do NOT say they failed. Do NOT force the English phrase. Do NOT call complete_quest.` +
    nextHint +
    ` 1 short sentence, ${LANG.pair}. ${QUEST_TRACKER_SPEAK_IF_SILENT}`
  );
}

/**
 * Timer hit zero — app cleared the mission. Celebrate warmly; never say they
 * failed or that steps are unfinished after TIME UP.
 */
export function buildMissionTimeoutCompleteNudge(quest, questIndex = loadProgress()) {
  if (!quest) return "";
  const mission = buildActiveMissionHeader(quest, questIndex);
  return [
    `[App verdict] ${mission}`,
    `TIME UP — the app CLEARED this mission because the timer ended. ` +
      `Celebrate warmly that the mission is cleared (星ゲット！ / You did it!). ` +
      `Do NOT say they failed, ran out of time badly, or that steps are unfinished. ` +
      `Do NOT ask them to finish remaining English phrases. ` +
      `Call complete_quest if you have not already, then one short farewell celebration (${LANG.pair}).`,
    QUEST_TRACKER_NO_REPEAT,
  ].join("\n");
}
