import { AQUARIUM_PART1 } from "./lessons/aquarium-part1.js";
import { AQUARIUM_PART2 } from "./lessons/aquarium-part2.js";

const LESSONS = { part1: AQUARIUM_PART1, part2: AQUARIUM_PART2 };

const LEVEL_META = {
  beginner: { id: "beginner", headerLabel: "ビギナー", firestoreField: "beginnerProgress" },
  intermediate: {
    id: "intermediate",
    headerLabel: "中級",
    firestoreField: "intermediateProgress",
  },
  advanced: { id: "advanced", headerLabel: "上級", firestoreField: "advancedProgress" },
};

export const LESSON_BADGES_KEY = "gc_homework_lessonBadges";
export const BADGE_REVOCATIONS_KEY = "gc_hw_badge_revocations";

function resolveLevelId() {
  try {
    const fromGlobal =
      (typeof window !== "undefined" && window.GC_LEVEL) || globalThis.GC_LEVEL;
    if (fromGlobal && LEVEL_META[fromGlobal]) return fromGlobal;
  } catch {
    // ignore
  }
  return "beginner";
}

function resolveLessonId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("lesson");
    if (fromQuery === "part1" || fromQuery === "part2") return fromQuery;
    const fromGlobal =
      (typeof window !== "undefined" && window.GC_LESSON) || globalThis.GC_LESSON;
    if (fromGlobal === "part1" || fromGlobal === "part2") return fromGlobal;
  } catch {
    // ignore
  }
  return "part1";
}

export const ACTIVE_LEVEL_ID = resolveLevelId();
export const ACTIVE_LESSON_ID = resolveLessonId();

export function getActiveLevelId() {
  return ACTIVE_LEVEL_ID;
}

export function getActiveLessonId() {
  return ACTIVE_LESSON_ID;
}

export function getActiveLevelInfo() {
  return LEVEL_META[ACTIVE_LEVEL_ID];
}

export function getLesson(lessonId = ACTIVE_LESSON_ID) {
  return LESSONS[lessonId] || LESSONS.part1;
}

export function getActiveLesson() {
  return getLesson(ACTIVE_LESSON_ID);
}

function storageKey(lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  return `gc_hw_${levelId}_${lessonId}_state`;
}

function part1CompleteKey(levelId = ACTIVE_LEVEL_ID) {
  return `gc_hw_${levelId}_part1_complete`;
}

export function emptyState(lessonId = ACTIVE_LESSON_ID) {
  return {
    lessonId,
    segmentIndex: 0,
    completedSegmentIds: [],
    memories: {},
    phrasesSpoken: [],
    badges: [],
    stars: 0,
    complete: false,
  };
}

export function loadLessonState(lessonId = ACTIVE_LESSON_ID) {
  try {
    const raw = localStorage.getItem(storageKey(lessonId));
    if (!raw) return emptyState(lessonId);
    const parsed = JSON.parse(raw);
    return { ...emptyState(lessonId), ...parsed, lessonId };
  } catch {
    return emptyState(lessonId);
  }
}

export function saveLessonStateFor(state, lessonId, levelId = ACTIVE_LEVEL_ID) {
  try {
    localStorage.setItem(storageKey(lessonId, levelId), JSON.stringify(state));
  } catch {
    // ignore
  }
  if (lessonId === "part1" && state.complete) {
    try {
      localStorage.setItem(part1CompleteKey(levelId), "1");
    } catch {
      // ignore
    }
  }
}

export function saveLessonState(state, lessonId = ACTIVE_LESSON_ID) {
  saveLessonStateFor(state, lessonId, ACTIVE_LEVEL_ID);
}

export function isPart1Complete(levelId = ACTIVE_LEVEL_ID) {
  try {
    if (localStorage.getItem(part1CompleteKey(levelId)) === "1") return true;
    const s = JSON.parse(localStorage.getItem(storageKey("part1", levelId)) || "{}");
    return Boolean(s.complete);
  } catch {
    return false;
  }
}

export function getLessonBadgeIds(lessonId = ACTIVE_LESSON_ID) {
  return (getLesson(lessonId).badges || []).map((b) => b.id);
}

export function loadBadgeRevocations() {
  try {
    const arr = JSON.parse(localStorage.getItem(BADGE_REVOCATIONS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveBadgeRevocations(ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  try {
    localStorage.setItem(BADGE_REVOCATIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function revokeBadgesForLesson(lessonId = ACTIVE_LESSON_ID) {
  const ids = new Set(getLessonBadgeIds(lessonId));
  if (!ids.size) return [];
  const cleared = loadEarnedLessonBadges().filter((id) => !ids.has(id));
  saveEarnedLessonBadges(cleared);
  saveBadgeRevocations([...loadBadgeRevocations(), ...ids]);
  return [...ids];
}

export function resetLesson(lessonId = ACTIVE_LESSON_ID, levelId = ACTIVE_LEVEL_ID) {
  const state = emptyState(lessonId);
  saveLessonStateFor(state, lessonId, levelId);
  if (lessonId === "part1") {
    try {
      localStorage.removeItem(part1CompleteKey(levelId));
    } catch {
      // ignore
    }
  }
  revokeBadgesForLesson(lessonId);
  return state;
}

export function getSegments(lessonId = ACTIVE_LESSON_ID) {
  return getLesson(lessonId).segments;
}

export function getCurrentSegment(state = loadLessonState()) {
  const segments = getSegments(state.lessonId);
  const idx = Math.min(state.segmentIndex, segments.length - 1);
  return segments[idx];
}

export function getSegmentById(id, lessonId = ACTIVE_LESSON_ID) {
  return getSegments(lessonId).find((s) => s.id === id) || null;
}

/** Banner labels from the homework markdown (CHAPTER 0, QUIZ 1, …). */
export function getSegmentChapterMeta(segment) {
  const id = String(segment?.id || "");
  const ch = id.match(/^ch(\d+)$/);
  if (ch) return { label: "CHAPTER", num: ch[1] };
  const quiz = id.match(/^quiz(\d+)$/);
  if (quiz) return { label: "QUIZ", num: quiz[1] };
  if (id.startsWith("daily")) return { label: "DAILY", num: "" };
  if (id.startsWith("final")) return { label: "FINAL", num: "" };
  if (id.startsWith("ending")) return { label: "END", num: "" };
  if (id.startsWith("mix")) return { label: "MIX", num: "" };
  return { label: "CHAPTER", num: "" };
}

export function formatSegmentChapter(segment) {
  const { label, num } = getSegmentChapterMeta(segment);
  return num === "" ? label : `${label} ${num}`;
}

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesPatterns(text, patterns = []) {
  const n = normalizeText(text);
  if (!n) return false;
  return patterns.some((p) => n.includes(normalizeText(p)));
}

export function loadEarnedLessonBadges() {
  try {
    const arr = JSON.parse(localStorage.getItem(LESSON_BADGES_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveEarnedLessonBadges(ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  try {
    localStorage.setItem(LESSON_BADGES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function recordLessonBadge(badgeId) {
  if (!badgeId) return loadEarnedLessonBadges();
  const next = saveEarnedLessonBadges([...loadEarnedLessonBadges(), badgeId]);
  saveBadgeRevocations(loadBadgeRevocations().filter((id) => id !== badgeId));
  const state = loadLessonState();
  if (!state.badges.includes(badgeId)) {
    state.badges = [...state.badges, badgeId];
    saveLessonState(state);
  }
  return next;
}

export function recordPhrase(phrase) {
  const p = String(phrase || "").trim();
  if (!p) return loadLessonState();
  const state = loadLessonState();
  if (!state.phrasesSpoken.includes(p)) {
    state.phrasesSpoken = [...state.phrasesSpoken, p].slice(-80);
    saveLessonState(state);
  }
  return state;
}

export function recordMemory(key, value) {
  const k = String(key || "").trim();
  const v = String(value || "").trim();
  if (!k || !v) return { ok: false, reason: "empty" };
  const lesson = getActiveLesson();
  if (lesson.memories && !lesson.memories.includes(k)) {
    return { ok: false, reason: "unknown_key" };
  }
  const state = loadLessonState();
  state.memories = { ...state.memories, [k]: v };
  saveLessonState(state);
  return { ok: true, memories: state.memories };
}

function countsAsStar(segment) {
  return ["story", "scaffold", "quiz", "final_challenge", "mix_review", "recap"].includes(
    segment?.type
  );
}

export function completeSegment(segmentId, { userQuote = "", saidTogether = false } = {}) {
  const state = loadLessonState();
  const lesson = getLesson(state.lessonId);
  const segment = getSegmentById(segmentId, state.lessonId);
  if (!segment) return { ok: false, reason: "unknown_segment" };

  const current = getCurrentSegment(state);
  if (segment.id !== current.id && !state.completedSegmentIds.includes(segment.id)) {
    return { ok: false, reason: "not_current", currentId: current.id };
  }

  // Idempotent: already finished this chapter — do not rewind or re-award.
  if (state.completedSegmentIds.includes(segment.id)) {
    const idxDone = lesson.segments.findIndex((s) => s.id === segment.id);
    if (idxDone >= 0 && state.segmentIndex <= idxDone) {
      state.segmentIndex = Math.min(idxDone + 1, lesson.segments.length - 1);
      saveLessonState(state);
    }
    return {
      ok: true,
      alreadyDone: true,
      state,
      next: getCurrentSegment(state),
      lessonComplete: state.complete,
    };
  }

  const loose = Boolean(segment.completeWithoutEnglish) || saidTogether;
  const quote = userQuote || "";
  if (!loose && segment.targets?.length) {
    const hit = segment.targets.some((t) => matchesPatterns(quote, t.patterns));
    if (!hit && segment.items?.length) {
      const itemHit = segment.items.some((it) => matchesPatterns(quote, it.patterns || []));
      if (!itemHit) return { ok: false, reason: "no_target_phrase" };
    } else if (!hit && !segment.items?.length) {
      if (segment.id === "ch6" && state.lessonId === "part1") {
        const tankReady = matchesPatterns(quote, [
          "my tank is ready",
          "tank is ready",
          "my tanks is ready",
        ]);
        if (!tankReady) return { ok: false, reason: "no_target_phrase" };
      } else {
        return { ok: false, reason: "no_target_phrase" };
      }
    }
  }

  if (!state.completedSegmentIds.includes(segment.id)) {
    state.completedSegmentIds = [...state.completedSegmentIds, segment.id];
    if (countsAsStar(segment)) state.stars = (state.stars || 0) + 1;
  }
  if (quote && /[a-zA-Z]/.test(quote)) {
    if (!state.phrasesSpoken.includes(quote.trim())) {
      state.phrasesSpoken = [...state.phrasesSpoken, quote.trim()].slice(-80);
    }
  }

  const idx = lesson.segments.findIndex((s) => s.id === segment.id);
  if (idx >= 0) {
    state.segmentIndex = Math.min(idx + 1, lesson.segments.length - 1);
  }
  if (segment.type === "ending" || idx === lesson.segments.length - 1) {
    state.complete = true;
    state.segmentIndex = lesson.segments.length - 1;
  }

  for (const badge of lesson.badges || []) {
    if (badge.afterSegment === segment.id) {
      if (!state.badges.includes(badge.id)) state.badges.push(badge.id);
      recordLessonBadge(badge.id);
    }
    if (badge.minPhrases && state.phrasesSpoken.length >= badge.minPhrases) {
      if (!state.badges.includes(badge.id)) state.badges.push(badge.id);
      recordLessonBadge(badge.id);
    }
    if (badge.requiresPart1Complete && state.complete && isPart1Complete()) {
      if (badge.afterSegment === segment.id || segment.type === "ending") {
        if (!state.badges.includes(badge.id)) state.badges.push(badge.id);
        recordLessonBadge(badge.id);
      }
    }
  }

  saveLessonState(state);
  return { ok: true, state, next: getCurrentSegment(state), lessonComplete: state.complete };
}

const BADGE_EMOJI = {
  sand_finder: "🏖️",
  glass_maker: "🪟",
  color_designer: "🎨",
  tank_builder: "🐠",
  quick_answer_p1: "⚡",
  english_talker_p1: "💬",
  fish_finder: "🐟",
  aquarium_memory: "💭",
  quick_answer_p2: "⚡",
  aquarium_speaker: "🗣️",
  aquarium_master: "🏆",
};

function mapBadgeCatalog(badges) {
  return (badges || []).map((b) => ({
    id: b.id,
    label: b.label,
    desc: b.desc,
    hint: b.desc,
    emoji: BADGE_EMOJI[b.id] || "⭐",
  }));
}

export function getBadgeCatalogForLesson(lessonId = ACTIVE_LESSON_ID) {
  return mapBadgeCatalog(getLesson(lessonId).badges);
}

export function getBadgeCatalog() {
  return mapBadgeCatalog([...AQUARIUM_PART1.badges, ...AQUARIUM_PART2.badges]);
}

export function getStarCount(lessonId = ACTIVE_LESSON_ID) {
  return loadLessonState(lessonId).stars || 0;
}

export function getTotalStarSlots(lessonId = ACTIVE_LESSON_ID) {
  return getSegments(lessonId).filter(countsAsStar).length;
}

export function buildProgressSnapshot(levelId = ACTIVE_LEVEL_ID) {
  const part1 = loadLessonStateFor("part1", levelId);
  const part2 = loadLessonStateFor("part2", levelId);
  return {
    part1,
    part2,
    part1Complete: Boolean(part1.complete),
    lessonBadges: loadEarnedLessonBadges(),
    stars: (part1.stars || 0) + (part2.stars || 0),
  };
}

export function loadLessonStateFor(lessonId, levelId) {
  try {
    const raw = localStorage.getItem(storageKey(lessonId, levelId));
    if (!raw) return emptyState(lessonId);
    return { ...emptyState(lessonId), ...JSON.parse(raw), lessonId };
  } catch {
    return emptyState(lessonId);
  }
}

function memoryBlock(memories) {
  const entries = Object.entries(memories || {}).filter(([, v]) => v);
  if (!entries.length) {
    return "Known memories: NONE. Do not invent tank color, fish, decorations, or counts.";
  }
  return (
    "Known memories (ONLY these — never invent extra): " +
    entries.map(([k, v]) => `${k}=${v}`).join("; ")
  );
}

function japaneseOutputRule(levelId) {
  const hiraganaOnly =
    "JAPANESE OUTPUT (mandatory whenever you speak Japanese): Write ONLY in ひらがな — no kanji, no katakana, no romaji. " +
    "This is for TTS pronunciation. Examples: がらす (not ガラス), すな (not 砂), すいそう (not 水槽), とうめい (transparent — NOT みえて), マインクラフト → まいんくらふと.";
  if (levelId === "beginner") {
    return (
      hiraganaOnly +
      " BEGINNER (CRITICAL): EVERY spoken turn = English first, then ひらがな with the SAME MEANING in the SAME utterance. " +
      "The child cannot understand English — Japanese must repeat the full idea, not a one-word tag. " +
      "Good: \"Can you hear the waves? うみの おと、きこえる？\" " +
      "Good: \"Great! To put sand down, you can say, I put sand here. いいね！ すなを おくときは 「I put sand here」っていってみて！\" " +
      "BAD: \"Great! ... I put sand here. いってみて！\" — いってみて alone skips the instruction."
    );
  }
  return hiraganaOnly + " Keep it short and natural for kids. Intermediate/advanced: English first; Japanese gloss in ひらがな only when you add one.";
}

function scaffoldingLine(levelId) {
  if (levelId === "beginner") {
    return [
      japaneseOutputRule(levelId),
      "BEGINNER JAPANESE = SAME MEANING AS ENGLISH: Every English sentence needs a ひらがな sentence that says the same thing — natural kid speech, but cover ALL of the English.",
      "FORBIDDEN after English: only いってみて / っていってみて / いいね / そうだね / ばっちり alone — that leaves the child with no translation.",
      "Forbidden JP: わたしの すいそうを てつだってくれますか / すいそうを てつだう. Use すいそうづくりを てつだってほしい / いっしょに すいそうを つくれる？",
      "Forbidden JP: みえて for transparent — say とうめいで かたい. Thank-you: ありがとう, not すごいね alone.",
      "Never say English-only. Never stack two English questions before Japanese. One idea at a time.",
      "Every line must end with Japanese ひらがな after the English — including praise, hints, and questions.",
      "If they answer in Japanese, praise, then model a short English version and invite them to repeat — still EN then full-meaning ひらがな.",
      "Hints: 2-choice is OK after they are stuck.",
    ].join(" ");
  }
  return [
    japaneseOutputRule(levelId),
    "Intermediate/advanced: elicit English first. If stuck, then 2-choice. A short ひらがな gloss after English is OK, not required on every line.",
  ].join(" ");
}

function leadTheTurnRule(levelId = ACTIVE_LEVEL_ID) {
  const lines = [
    "LEAD THE CONVERSATION (mandatory every spoken turn, including warmup and story):",
    "Never end a turn with only a comment, praise, or restatement (bad: \"Sand is right!\" / \"That's cool!\" and then silence).",
    "Same turn: one short reaction (optional) + exactly ONE question or phrase-repeat invite. Then wait.",
    "Never change topic in the same turn as reacting to their last answer.",
    "Forbidden: two questions in one utterance. Forbidden: stopping after Nice! / I see! / That's cool! / Sand is right! / That's right! そうだね! alone.",
    "Forbidden: TWO spoken replies in a row without the child speaking — ONE message per child turn, then wait.",
    "Bad end (never do this): \"That's right! そうだね!\" with no next question. Good end: \"That's right! Can you say, I need sand? ばっちり！「I need sand」いってみて！\"",
    "Forbidden open filler: What should we do next? / つぎは？ alone — always name the next homework step (e.g. make glass → I need to make glass).",
  ];
  if (levelId === "beginner") {
    lines.push(
      "BEGINNER: Same turn = English then ひらがな with the SAME meaning — even praise (e.g. \"That's cool! すごいね！\") and every question must be fully translated, not just いってみて.",
      "Speak each line ONCE only. One English sentence + one Japanese translation = one turn. NEVER repeat the English. NEVER say the same Japanese phrase twice."
    );
  }
  return lines.join(" ");
}

function ch3StoryRule() {
  return [
    "CHAPTER 3 ONLY — make glass from sand. Two phrases: I need to make glass → I made glass!",
    "Step 1: Child already found sand in Chapter 2. Brief praise, then ask what to do with sand to make glass → elicit I need to make glass. Hint furnace if stuck. Learny cannot see the screen — Let me know when you're done making it!",
    "Do NOT say We have sand or すながある unless the child just said they found sand in this session. Never assume sand if they said they are still searching.",
    "Step 2: When child says I made glass!: praise — Great job! Then call complete_segment(ch3) immediately.",
    "NEXT segment is Mini quiz 1 (NOT Chapter 4 yet). Do NOT say I put glass here or build walls — walls come AFTER the quiz.",
    "FORBIDDEN on Chapter 3: I put sand here, put sand in the tank, on the bottom, すいそうにいれ — that is Chapter 6 only.",
    "FORBIDDEN: What do you need to do next? after I made glass. You may propose a silly wrong action in Step 1.",
  ].join(" ");
}

function quiz1Rule() {
  return [
    "MINI QUIZ 1 ONLY — review phrases from Chapters 1–3. Use ONLY the listed quiz items — never invent questions (FORBIDDEN: what color is the sand?, random trivia).",
    "One item per turn. Beginner: 2-choice, then child SAYS the English answer.",
    "Japanese answers OK (e.g. クリーム色, ガラスを作った) — praise, give the English phrase, then ask the NEXT quiz item immediately.",
    "If child says もしもし / hello / are you there: respond warmly and repeat ONE quiz question — never go silent.",
    "After 3–4 items done: call complete_segment(quiz1). Then Chapter 4 (build tank walls) begins.",
    "FORBIDDEN on quiz1: I put glass here, I'm building a tank, What color do you like, dye, flowers — those are later chapters.",
    "Every turn must end with the next quiz question or complete_segment — never stop after praise alone.",
  ].join(" ");
}

function daily1Rule() {
  return [
    "DAILY ENGLISH ONLY — 2–4 everyday questions away from the tank (food, colors, animals, etc.).",
    "Every turn: short reaction + exactly ONE question. FORBIDDEN: stopping after Nice / That's right / そうだね with no next question.",
    "When daily chat feels done: Nice! Back to the tank! よし、すいそうにもどろう！ then immediately ONE tank homework question.",
    "After 2–4 daily questions OR after back-to-the-tank bridge + one tank beat: call complete_segment(daily1).",
    "Never go silent after praise — always lead to the next question or complete_segment.",
  ].join(" ");
}

function ch2ChoiceRule() {
  return [
    "CHAPTER 2 ONLY — sand search. Learny CANNOT see the child's screen — never say Look! Sand! or I found some sand! as if Learny saw it.",
    "Order: (1) beach or river → record_memory searchPlace, (2) left or right, (3) Let me know when you find sand! / すなを みつけたら おしえてね！",
    "(4) MANDATORY ~3 chat rallies while searching — NOT optional. One everyday question per turn: Do you like the ocean or the mountains? うみと やま、どっちが すき？ Can you hear the waves? うみの おと、きこえる？ Is it hot? きょうは あつい？ What do you see? なにが みえる？ React to their answer each time.",
    "(5) ONLY AFTER ~3 search chats: Have you found sand yet? / まだ すな みつからない？",
    "(6) When they say they found it — including うん/はい/yes after Have you found sand yet? — praise → help them say in English: I found some sand! Only after that English phrase, call complete_segment(ch2).",
    "After Have you found sand yet?: うん/はい/yes/みつけた = THEY FOUND IT. Do NOT ask hungry/food/another everyday chat. Elicit I found some sand! immediately.",
    "CRITICAL: Never repeat the same everyday question after the child answered (e.g. do NOT ask Can you hear the waves? twice). うん/はい after an everyday question is an answer — react, then ask a DIFFERENT question.",
    "FORBIDDEN during Ch2: We have sand / Okay we have sand / すながある / What do we need to do next for glass — that is Chapter 3.",
    "FORBIDDEN during Ch2: I put sand here, put it in the tank, on the bottom, すいそうにいれ — that is Chapter 6 only. After I found some sand! → complete_segment(ch2) → Chapter 3 make glass.",
    "FORBIDDEN: skipping straight from direction to Have you found sand? or I found some sand! FORBIDDEN: What should we do next? alone.",
    "If child says not yet / still searching / まだ: ask a NEW everyday question (ocean or mountains? can you hear the waves? hot? what do you see?) — do NOT repeat Let me know when you find sand or Keep looking.",
    "Short acks (うん/ok/yes) after Let me know when you find sand (NOT after Have you found sand yet?) are NOT search chats — follow with your first everyday question.",
    "If they pick ocean/beach: react warmly, then ask a beach question (Can you hear the waves? Is it hot? What do you see?) — not Are you tired?",
  ].join(" ");
}

function ch6StoryRule() {
  return [
    "CHAPTER 6 ONLY — put sand on the bottom of the tank.",
    "Phrase order (guide): I put sand here → I put the sand on the bottom → I need more sand (if needed) → I'm done! → My tank is ready!",
    "Accept close variants: put sand on the bottom / sand on the bottom = I put the sand on the bottom. Praise and move forward — NEVER backtrack to an earlier phrase.",
    "FORBIDDEN: sand color, transparent sand, how to get sand, stuck, どうしたの when the child just answered. ONE reply per child turn, then WAIT.",
    "I'm done! means the SAND-ON-BOTTOM step is finished — NOT the whole aquarium.",
    "When you teach Can you say I'm done! and the child says I'm done / im done: praise ONLY (Great! / いいね!) — then teach My tank is ready!",
    "FORBIDDEN after I'm done!: Almost, おしい, not yet, まだ, that's wrong, we haven't put fish in yet as a correction.",
    "My tank is ready! means ready for fish LATER — still ZERO fish in the tank. Teach it AFTER I'm done!, with praise.",
    "Do NOT invent I need water or other off-script phrases — stay on sand/bottom targets only.",
    "When child says My tank is ready! (typos like my tanks is ready are OK): praise, then call complete_segment(ch6) immediately — do NOT ask if today's lesson is over first.",
    "complete_segment(ch6) only after the child says My tank is ready! in English.",
  ].join(" ");
}

function final1Rule() {
  return [
    "FINAL CHALLENGE ONLY — review phrases from the whole Part 1 lesson.",
    "FIRST line when Final challenge begins: Final challenge time! さいごの チャレンジだよ！ Are you ready? じゅんびは できてる？",
    "After yes/ok: ask ONE item per turn — format MUST be the EXACT listed cue + は えいごで？ (ひらがな ONLY for Japanese — no kanji, no katakana).",
    "Examples (speak exactly): がらすが いる！は えいごで？ / すなを みつけた！は えいごで？ / がらすを つくった！は えいごで？",
    "Use ONLY the current listed quiz prompt from coach — do NOT invent questions or say bare は えいごで？ without the cue phrase.",
    "Beginner: 2–3 on-screen choices OR child says the English. Praise → NEXT listed item immediately.",
    "After the child answers correctly: NEVER ask the same item again — always move to the NEXT different listed item.",
    "Say さいごの もんだい！ / one more question! ONLY when exactly ONE item remains in the quiz.",
    "After the LAST item is answered: praise briefly, then call complete_segment(final1) immediately — do NOT ask another quiz question.",
    "FORBIDDEN on final1: story mode, inventing quiz prompts, bare は えいごで？, kanji/katakana in Japanese, repeating answered items.",
    "Every turn: English first, then ひらがな with the SAME full meaning.",
  ].join(" ");
}

function ending1Rule() {
  return [
    "ENDING ONLY — this is a CONVERSATION with the child, not a monologue.",
    "ONE beat per turn — English first, then same-meaning ひらがな. Then STOP and WAIT for the child.",
    "Beat 1: Perfect! We made a fish tank together! Thank you for helping! → WAIT",
    "Beat 2 (after child replies): Hold on... we don't have any fish in the fish tank! That's for next time! → WAIT",
    "Beat 3: What kind of fish should we catch? → WAIT for their fish idea",
    "Beat 4: How many do we want? → WAIT for their number",
    "Beat 5: Hmm... I can't stop thinking about it! → WAIT",
    "Beat 6 FINAL: Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time! → then call complete_segment(ending1)",
    "FORBIDDEN: combining multiple beats in one message; skipping WAIT; catching fish or finishing the aquarium.",
    "Every turn: English first, then ひらがな with the SAME full meaning.",
  ].join(" ");
}

function final1StartNudge() {
  return (
    "[Teacher note — do not read aloud] FINAL CHALLENGE starts NOW. " +
    "Line 1: Final challenge time! さいごの チャレンジだよ！ Are you ready? じゅんびは できてる？ " +
    "After yes: ask ONE listed item — EXACT cue in ひらがな + は えいごで？ (e.g. がらすが いる！は えいごで？). " +
    "Never invent questions or bare は えいごで？. After last item answered → complete_segment(final1) immediately."
  );
}

function ending1StartNudge() {
  return (
    "[Teacher note — do not read aloud] ENDING starts NOW — conversation mode, ONE beat only. " +
    "Say ONLY Beat 1: Perfect! We made a fish tank together! Thank you for helping! " +
    "JP: ぱーふぇくと！ いっしょに すいそうを つくれたね！ てつだって くれて ありがとう！ " +
    "Then WAIT for the child — do NOT say beats 2–6 yet."
  );
}

function ch1StoryRule() {
  return [
    "CHAPTER 1 ONLY — two separate steps, never skip Step 1.",
    "Do NOT ask How are you in Chapter 1 — warmup chat is already done.",
    "FIRST line when Chapter 1 begins: react briefly to what they JUST said, then Step 1 question ONLY — What do I need to make a tank? Something transparent and hard.",
    "Reaction rules: mood/feeling (good/fine/tired/いい気分/元気) → That's great! / Glad to hear it! JP: よかった！ / いいね！ — NEVER Thank you / ありがとう for mood.",
    "Only after they agreed to HELP with the tank → Thank you! / Great! JP: ありがとう！ / やった！",
    "Step 1: ask What do I need to make a tank? Something transparent and hard — then STOP. NEVER say I need glass or answer glass for the child; THEY must say glass first.",
    "FORBIDDEN as the first Chapter 1 line: Can you say I need glass, I need glass (as your own answer), I need to make glass, sand, glass or sand.",
    "JP ひらがな for Step 1 question (same meaning as English): すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。",
    "Forbidden JP for transparent: みえて — use とうめい. Forbidden for mood: ありがとう / Thank you.",
    "After they say glass (English or ガラス) for the TANK → praise → Can you say, I need glass? / ばっちり！「I need glass」いってみて！",
    "Say each teach line ONCE per turn — NEVER repeat Can you say… or いってみて twice in the same message.",
    "FORBIDDEN after tank/glass answer: I put glass here, ガラスを置きたい, なんて言う for placing glass, What do you need to make glass?, sand, Step 2 — those come ONLY after the child says I need glass. Chapter 1 teach phrase is ONLY I need glass — NEVER I put glass here.",
    "If they wrongly say I put glass here in Chapter 1: gently redirect — Nice try! In this step we say I need glass. Can you say, I need glass?",
    "If they say sand in Step 1: Sand comes later! Redirect to transparent/hard/glass — never Almost!",
    "Step 2 ONLY after the child says I need glass: To make glass in Minecraft, what do we need? → sand → Can you say I need sand?",
    "Step 2: ONE sand explanation per turn — do NOT say sand twice in different words in the same message.",
    "If stuck in Step 1, hint transparent/hard — never sand as a choice in Step 1.",
    "complete_segment(ch1) only after BOTH I need glass and I need sand from the child.",
    "FORBIDDEN on Ch1: Still looking for sand, Have you found sand, running to find sand, Let me know when you find sand — that gameplay is Chapter 2.",
  ].join(" ");
}

function quiz1StartNudge() {
  return (
    "[Teacher note — do not read aloud] MINI QUIZ 1 starts NOW. Do NOT jump to Chapter 4 (I put glass here) or Chapter 5 (color/dye). " +
    "Ask ONE quiz item at a time from the list ONLY. First: ガラスが必要 → child says I need glass. " +
    "Then 砂を見つけた → I found some sand!, then I need sand?, then I made glass! meaning. " +
    "After 3–4 items answered, call complete_segment(quiz1). FORBIDDEN this segment: I put glass here, building walls, What color do you like, dye."
  );
}

function ch1StartNudge() {
  return (
    "[Teacher note — do not read aloud] Chapter 1 starts now. Do NOT ask How are you — warmup is done. " +
    "React briefly to what they JUST said: if mood/feeling (いい気分, fine, good, tired…) → That's great! / Glad to hear it! JP: よかった！ / いいね！ — NOT Thank you / ありがとう. " +
    "Only if they agreed to HELP with the tank → Thank you! / Great! JP: ありがとう！ / やった！ " +
    "Then ask ONLY Step 1: What do I need to make a tank? Something transparent and hard. " +
    "JP ひらがな: すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。 " +
    "FORBIDDEN: saying I need glass yourself, answering glass for the child, Can you say I need glass, sand. " +
    "STOP after the question — the CHILD must say glass before you teach any phrase."
  );
}

function warmupRules(segment, lessonId) {
  if (segment?.type !== "warmup") return "";
  const must =
    lessonId === "part1"
      ? "No fixed question list. After the greeting, follow what the child said with natural everyday questions (food, games, colors, etc. are optional — never force What's your favorite summer food?). Stay on their topic 1–2 turns. Do NOT jump to the tank in the same turn as reacting."
      : "Do not rush into the aquarium. Chat like a real teacher first. Stay on their topic 1–2 turns before any homework bridge.";
  const bridge =
    lessonId === "part1"
      ? "ONLY on a later, separate turn, after the chat feels done, invite them: \"Oh! Today I want to make a fish tank. Will you help me make it?\" JP (ひらがな only): 「そうだ！きょうは らーにーせんせいの すいそうづくりを てつだってほしいんだ。いっしょに つくれる？」 Never すいそうを てつだって. That invite turn must END with the help question — then STOP. FORBIDDEN same turn: Thank you, What do I need to make a tank, glass, sand, complete_segment(ch0). Wait for yes/ok. As soon as they agree on the NEXT turn, call complete_segment(ch0) BEFORE saying anything about glass or sand. While CURRENT SEGMENT is still warmup/ch0, do NOT teach glass, sand, or I need glass."
      : "ONLY on a later, separate turn: \"Remember the Minecraft aquarium class? Shall we remember YOUR tank?\" Japanese (ひらがな only): 「このまえの まいんくらふとで つくった すいそう、おもいだそうか？」 Wait for yes/ok, then call complete_segment for warmup before recall questions.";
  return [
    "WARMUP / CHAPTER 0 — natural conversation rules:",
    "Start with a greeting + one easy question only (How are you today? is enough for the first turn).",
    "How are you answers: mood/feeling → That's great! / Glad to hear it! / Hope you feel better! JP: よかった！ / いいね！ — NOT Thank you / ありがとう (thank-you is only for help or gifts).",
    "Follow their answer with ONE everyday follow-up question — then STOP and wait for the child. Never two questions in one turn.",
    "FORBIDDEN in one turn: everyday chat question + fish tank invite. Those must be separate turns after the child answers each time.",
    "Over the warmup, 2–4 real Q&A exchanges before the tank invite. Do not read a question list.",
    must,
    bridge,
  ].join(" ");
}

export function buildLessonInstructions(state = loadLessonState(), levelId = ACTIVE_LEVEL_ID) {
  const lesson = getLesson(state.lessonId);
  const segment = getCurrentSegment(state);
  const targets = (segment.targets || [])
    .map((t) => t.phrase)
    .join(" / ");
  const items = (segment.items || [])
    .map((it) => it.promptJa || it.promptEn || it.answer)
    .join("; ");

  return [
    "You are ラーニー先生 (Learny), a warm Japanese-English homework tutor for children.",
    "This is HOMEWORK between real Minecraft classes — not live co-play. Do not ask them to share a screen or play Minecraft now.",
    lesson.weekNote,
    lesson.stopRule,
    scaffoldingLine(levelId),
    leadTheTurnRule(levelId),
    warmupRules(segment, state.lessonId),
    segment.id === "ch1" && state.lessonId === "part1" ? ch1StoryRule() : "",
    segment.id === "ch2" && state.lessonId === "part1" ? ch2ChoiceRule() : "",
    segment.id === "ch3" && state.lessonId === "part1" ? ch3StoryRule() : "",
    segment.id === "quiz1" && state.lessonId === "part1" ? quiz1Rule() : "",
    segment.id === "daily1" && state.lessonId === "part1" ? daily1Rule() : "",
    segment.id === "ch6" && state.lessonId === "part1" ? ch6StoryRule() : "",
    segment.id === "final1" && state.lessonId === "part1" ? final1Rule() : "",
    segment.id === "ending1" && state.lessonId === "part1" ? ending1Rule() : "",
    "If they forget: hint → word choices → 2–3 options → say the English together. Never treat forgetting as failure.",
    "If they go off-topic: answer 1–3 turns, then return. Conversation over forcing a phrase.",
    "After success, echo the correct English once. Do not stall on pronunciation or grammar.",
    "Never invent facts about THEIR tank. Only use Known memories or what they just said.",
    memoryBlock(state.memories),
    `Lesson: ${lesson.title} (${lesson.titleEn})`,
    `CURRENT SEGMENT ${state.segmentIndex + 1}/${lesson.segments.length}: ${segment.id} [${segment.type}] ${segment.title}`,
    segment.goal ? `Goal: ${segment.goal}` : "",
    targets ? `Target phrases: ${targets}` : "",
    items ? `Quiz/challenge prompts: ${items}` : "",
    segment.coach || "",
    "Tools: record_memory when the child states a fact (color, place, count). complete_segment when this segment's goal is met (warmup/recall/daily/ending can complete without English). award_badge when a listed badge is earned.",
    levelId === "beginner"
      ? "REMINDER: Every spoken turn = English then ひらがな with the SAME meaning. English-only or いってみて-only Japanese is never OK for beginner."
      : "Sound like a human teacher, not a system.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOpeningNudge(state = loadLessonState()) {
  const segment = getCurrentSegment(state);
  if (segment.type === "warmup") {
    return (
      "[Teacher note — do not read this aloud.] CHAPTER 0: greet the child like a real English teacher. " +
      "First turn ONLY: Hi/Hello + ONE question (How are you today?). Then ひらがな with the same meaning. Then wait. " +
      "Do not mention Minecraft or the tank yet. After mood/feeling: That's great! / Glad to hear it! — NOT Thank you. Then ONE follow-up question on their topic — then WAIT. No tank invite until after 2+ chat exchanges."
    );
  }
  if (state.lessonId === "part1" && segment.id === "ch1") {
    return ch1StartNudge();
  }
  if (state.lessonId === "part1" && segment.id === "final1") {
    return final1StartNudge();
  }
  if (state.lessonId === "part1" && segment.id === "ending1") {
    return ending1StartNudge();
  }
  return (
    `[Teacher note — do not read this aloud as a script.] Start this segment now: ${segment.title}. ${segment.coach} ` +
    "Open with one short beat that ENDS with a question, then wait. Beginner: English then ひらがな with the same meaning."
  );
}

export function buildAdvanceNudge(state = loadLessonState()) {
  const segment = getCurrentSegment(state);
  if (state.lessonId === "part1" && segment.id === "ch1") {
    return ch1StartNudge();
  }
  if (state.lessonId === "part1" && segment.id === "ch2") {
    return (
      "[Teacher note — do not read aloud] Chapter 2: sand search. Ask beach or river first, then left or right, " +
      "then Let me know when you find sand! すなを みつけたら おしえてね！ Beginner: English then ひらがな every turn. " +
      "Do NOT skip to I need glass or We have sand. FORBIDDEN: put sand in the tank / Chapter 6."
    );
  }
  if (state.lessonId === "part1" && segment.id === "ch3") {
    return (
      "[Teacher note — do not read aloud] Chapter 3 starts NOW. Child found sand. Brief praise, then ask what we do with sand to make glass → " +
      "elicit I need to make glass. FORBIDDEN: I put sand here, put sand in the tank, on the bottom, すいそうにいれ (Chapter 6). " +
      "FORBIDDEN: I put glass here (Chapter 4). Beginner: English then ひらがな."
    );
  }
  if (state.lessonId === "part1" && segment.id === "quiz1") {
    return quiz1StartNudge();
  }
  if (state.lessonId === "part1" && segment.id === "final1") {
    return final1StartNudge();
  }
  if (state.lessonId === "part1" && segment.id === "ending1") {
    return ending1StartNudge();
  }
  return (
    `[Teacher note] The previous chapter is done. Move to: ${segment.title} (${segment.type}). ${segment.coach} ` +
    "Do not recap everything. One new beat that ENDS with a question, then wait. Beginner: English then ひらがな with the same meaning."
  );
}

/**
 * Opening coach after a fresh Live reconnect at a chapter boundary (or stuck retry).
 * Stricter than mid-socket advance notes — this session must start CURRENT segment only.
 */
export function buildHandoffOpeningNudge(
  state = loadLessonState(),
  { lastQuote = "", reason = "handoff" } = {}
) {
  const segment = getCurrentSegment(state);
  const quote = String(lastQuote || "").trim().slice(0, 120);
  const quoteBit = quote ? ` Child's last line: "${quote}".` : "";
  const retryBit =
    reason === "stuck_retry"
      ? " Stuck-retry: do NOT recap the whole lesson. One fresh beat for THIS segment only."
      : " Fresh Live session after chapter handoff. Previous chapter is DONE — do not continue it.";
  const start = buildOpeningNudge(state).replace(/^\[Teacher note[^\]]*\]\s*/i, "");
  return (
    `[Teacher note — do not read aloud]${retryBit}${quoteBit} ` +
    `CURRENT ONLY: ${segment.id} [${segment.type}] ${segment.title}. ${start}`
  );
}

export function buildSilencePrompt(state = loadLessonState(), levelId = ACTIVE_LEVEL_ID) {
  const segment = getCurrentSegment(state);
  const lang =
    levelId === "advanced"
      ? "English only"
      : levelId === "beginner"
        ? "one English sentence, then ひらがな with the same meaning"
        : "English then a short Japanese tag";
  return (
    `[Teacher note] The child has been quiet about 30 seconds. One short friendly check-in (${lang}) — ` +
    `ONE question only, wait after it. Tied softly to ${segment.title}. Never mention timers or the app.`
  );
}

export function getClickChoices(segment) {
  if (!segment || segment.input !== "speak_or_click") return [];
  return (segment.items || []).map((it) => ({
    label: it.promptJa || it.promptEn || it.answer,
    answer: it.answer,
    patterns: it.patterns || [],
    choices: it.choices || [it.answer],
  }));
}
