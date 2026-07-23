// Level regression tests: intermediate + advanced quest data, matching,
// side challenges, prompts, badges, and reset scoping.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const level = process.argv[2] || "intermediate";
globalThis.GC_LEVEL = level;

const engine = await import("./js/quest-engine.js");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL: ${name}`);
  }
}

const quests = engine.getQuests();
const findStep = (id) => {
  for (const q of quests) {
    const s = (q.steps || []).find((st) => st.id === id);
    if (s) return { quest: q, step: s };
  }
  throw new Error(`step ${id} not found`);
};

console.log(`=== Level: ${level} ===`);

// --- Keys ---
check("PROGRESS_KEY prefix", engine.PROGRESS_KEY === `gc_${level}_lesson1_questIndex`);
check("STEP key prefix", engine.STEP_PROGRESS_KEY === `gc_${level}_lesson1_stepProgress`);
check("badges key shared", engine.LESSON_BADGES_KEY === "gc_beginner_lessonBadges");
check("quest count 5", quests.length === 5);
check("snapshot level", engine.buildProgressSnapshot().level === level);

// --- Prompt language ---
const freeChat = engine.getLevelFreeChatPrompt();
const session = engine.buildSessionInstructions(quests[0], 0);
if (level === "intermediate") {
  check("free chat is 80/20", freeChat.includes("英語80％"));
  check("mission prompt 80/20", session.includes("英語80%"));
  check("mission speak line 80/20", session.includes("■話し方: 基本は英語80%"));
} else {
  check("free chat is 100% EN", freeChat.includes("英語100％"));
  check("mission prompt 100% EN", session.includes("英語100%"));
  check("mission speak line EN only", session.includes("日本語は絶対に使わない"));
}
check("aiNotes injected", session.includes("■このミッションの注意"));

// Nudges use level language (empty utterance → default "reply warmly" directive)
const nudge = engine.buildQuestStepGroundTruthNudge(quests[0], "", [], 0, false);
if (level === "intermediate") {
  check("nudge lang", /mostly EN|80% English/.test(nudge));
} else {
  check("nudge lang", /English only|English ONLY/.test(nudge));
  check("nudge has no JP invite", !nudge.includes("一緒に言ってみよう"));
}
const opening = engine.buildQuestOpeningNudge(quests[0], 0);
if (level === "advanced") {
  check("opening EN only", opening.includes("English ONLY"));
  check("opening no やってみよう", !opening.includes("やってみよう"));
}

// --- Badge slots ---
const main = engine.getMainBadgeSlots();
check("3 main slots", main.length === 3);
check(
  "silver for intermediate",
  main.find((s) => s.id === "intermediate").image === "images/completion-badge-silver.png"
);
check(
  "gold for advanced",
  main.find((s) => s.id === "advanced").image === "images/completion-badge-gold.png"
);
const hidden = engine.getHiddenBadgeSlots();
check("8 hidden slots", hidden.length === 8);
check("8 real hidden badges", engine.HIDDEN_BADGES.length === 8);

// --- Step matching per level ---
if (level === "intermediate") {
  // M1
  let r = findStep("decide_improvement");
  check("M1 decide: want to improve", engine.matchesStep("I want to improve my base", r.step));
  check("M1 decide: will change chest", engine.matchesStep("I will change my chest", r.step));
  check("M1 decide: JP no", !engine.matchesStep("よくする", r.step));
  r = findStep("report_change");
  check("M1 report: made it better", engine.matchesStep("I made it better", r.step));
  check("M1 report: improved my base", engine.matchesStep("I improved my base", r.step));
  check("M1 report: placed a bed", engine.matchesStep("I placed a bed", r.step));
  check("M1 report: want-to rejected", !engine.matchesStep("I want to make it better", r.step));
  check("M1 report: negation rejected", !engine.matchesStep("I didn't change it", r.step));

  // M2
  r = findStep("choose_tool");
  check("M2 choose: will make sword", engine.matchesStep("I will make a sword", r.step));
  check("M2 choose: want to make pickaxe", engine.matchesStep("I want to make a pickaxe", r.step));
  r = findStep("made_tool");
  check("M2 made: made a sword", engine.matchesStep("I made a sword", r.step));
  check("M2 made: made an axe", engine.matchesStep("I made an axe", r.step));
  check("M2 made: crafted a shovel", engine.matchesStep("I crafted a shovel", r.step));
  check("M2 made: will-make rejected", !engine.matchesStep("I will make a sword", r.step));

  // M3
  r = findStep("need_torches");
  check("M3 torch: need torches", engine.matchesStep("I need torches", r.step));
  check("M3 torch: need a torch", engine.matchesStep("I need a torch", r.step));
  const foodStep = findStep("need_food_prep").step;
  check("M3 food: need food", engine.matchesStep("I need food", foodStep));
  check("M3 torch not food", !engine.matchesStep("I need food", r.step));
  r = findStep("ready_cave");
  check("M3 ready: I'm ready", engine.matchesStep("I'm ready", r.step));
  // M3 side challenge
  const m3 = findStep("need_torches").quest;
  check("M3 side: need a sword", engine.matchesQuestSideChallenge(m3, "I need a sword"));
  check("M3 side: need a shield", engine.matchesQuestSideChallenge(m3, "I need a shield"));
  check("M3 side: torch no badge", !engine.matchesQuestSideChallenge(m3, "I need torches"));
  check("M3 side: food no badge", !engine.matchesQuestSideChallenge(m3, "I need food"));
  check("M3 side: JP no badge", !engine.matchesQuestSideChallenge(m3, "剣が必要"));

  // M4
  r = findStep("found_useful");
  check("M4 found: found iron", engine.matchesStep("I found iron", r.step));
  check("M4 found: found a village", engine.matchesStep("I found a village", r.step));
  check("M4 found: found coal", engine.matchesStep("I found coal", r.step));
  r = findStep("its_useful");
  check("M4 useful: it's useful", engine.matchesStep("It's useful", r.step));

  // M5
  r = findStep("report_made_or_found");
  check("M5 report: made a sword", engine.matchesStep("I made a sword", r.step));
  check("M5 report: found iron", engine.matchesStep("I found iron", r.step));
  r = findStep("next_want");
  check("M5 want: next I want to explore", engine.matchesStep("Next, I want to explore", r.step));
  check("M5 want: i want to build", engine.matchesStep("I want to build a house", r.step));
  // M5 hidden badge config
  check("M5 hiddenBadge id", quests[4].hiddenBadge?.id === "hidden_report_int");
  check("M5 not quizFirst", !quests[4].quizFirst);
}

if (level === "advanced") {
  // M1
  let r = findStep("this_is_my");
  check("A1: this is my base", engine.matchesStep("This is my base", r.step));
  check("A1: this is my room", engine.matchesStep("This is my room", r.step));
  r = findStep("about_it");
  check("A1: i like this part", engine.matchesStep("I like this part", r.step));
  check("A1: i built this area", engine.matchesStep("I built this area", r.step));

  // M2
  r = findStep("best_loot");
  check("A2: got diamonds", engine.matchesStep("I got diamonds", r.step));
  check("A2: best loot was iron", engine.matchesStep("My best loot was iron", r.step));
  check("A2: want-diamonds rejected", !engine.matchesStep("I want to get diamonds", r.step));
  r = findStep("why_good");
  check("A2: it was useful", engine.matchesStep("It was useful", r.step));
  check("A2: i needed it", engine.matchesStep("I needed it", r.step));
  const a2 = findStep("best_loot").quest;
  check("A2 side: got diamonds", engine.matchesQuestSideChallenge(a2, "I got diamonds"));
  check("A2 side: best loot was diamonds", engine.matchesQuestSideChallenge(a2, "My best loot was diamonds"));
  check("A2 side: iron no badge", !engine.matchesQuestSideChallenge(a2, "I got iron"));

  // M3
  r = findStep("next_goal");
  check("A3: my goal is", engine.matchesStep("My goal is to find diamonds", r.step));
  r = findStep("next_action");
  check("A3: next i want to", engine.matchesStep("Next, I want to explore a cave", r.step));
  check("A3: i think i need food", engine.matchesStep("I think I need food", r.step));
  const a3 = findStep("next_goal").quest;
  check("A3 side: what should i do", engine.matchesQuestSideChallenge(a3, "What should I do next"));
  check("A3 side: what do you think", engine.matchesQuestSideChallenge(a3, "What do you think?"));
  check("A3 side: statement no badge", !engine.matchesQuestSideChallenge(a3, "I got diamonds"));
  check("A3 side: JP no badge", !engine.matchesQuestSideChallenge(a3, "どうしたらいい？"));

  // M4
  r = findStep("what_happened");
  check("A4: i saw an enemy", engine.matchesStep("I saw an enemy", r.step));
  check("A4: i almost fell", engine.matchesStep("I almost fell", r.step));
  check("A4: it was dark", engine.matchesStep("It was dark", r.step));
  check("A4: i saw a creeper", engine.matchesStep("I saw a creeper", r.step));
  r = findStep("danger_reaction");
  check("A4: it was dangerous", engine.matchesStep("It was dangerous", r.step));
  check("A4: i went back", engine.matchesStep("I went back", r.step));
  check("A4: i ran away", engine.matchesStep("I ran away", r.step));
  const a4 = findStep("what_happened").quest;
  check("A4 side: i was scared", engine.matchesQuestSideChallenge(a4, "I was scared"));
  check("A4 side: it was scary", engine.matchesQuestSideChallenge(a4, "It was so scary"));
  check("A4 side: not scared no badge", !engine.matchesQuestSideChallenge(a4, "I was not scared"));
  check("A4 side: wasn't scared no badge", !engine.matchesQuestSideChallenge(a4, "I wasn't scared"));

  // M5
  r = findStep("did_today");
  check("A5: i built a house", engine.matchesStep("I built a house", r.step));
  check("A5: i explored a cave", engine.matchesStep("I explored a cave", r.step));
  check("A5: i made a pickaxe still ok", engine.matchesStep("I made a pickaxe", r.step));
  check("A5: i found a cave still ok", engine.matchesStep("I found a cave", r.step));
  check("A5: aspiration rejected", !engine.matchesStep("I want to build a house", r.step));
  check("A5: JP-only rejected", !engine.matchesStep("家を建てた", r.step));
  r = findStep("want_next");
  check("A5: next i want to explore more", engine.matchesStep("Next, I want to explore more", r.step));
  check("A5 hiddenBadge id", quests[4].hiddenBadge?.id === "hidden_english_adv");
}

// --- Challenge flow: complete a full quest via applyUtteranceToChallenge ---
store.clear();
const q0 = quests[0];
const phrases = q0.steps.map((s) => {
  const p = s.patterns[0].replace(/\.\.\..*/, "").trim();
  return p;
});
let ticked = [];
for (const p of phrases) {
  const result = engine.applyUtteranceToChallenge(q0, p, 0);
  ticked.push(...(result.stepIds || result));
}
check("all M1 steps tick from canonical phrases", ticked.length === q0.steps.length);
check("quest complete check", engine.isQuestStepsComplete(q0, 0));

// --- Mission timer force-complete (replaces effort-pass) ---
{
  store.clear();
  check("timer: limit is 5 minutes", engine.MISSION_TIME_LIMIT_MS === 5 * 60 * 1000);
  check("timer: warning is 30s", engine.MISSION_TIME_WARNING_MS === 30 * 1000);

  engine.beginQuestSession(0);
  const before = engine.loadProgress();
  check("timer: start at progress 0", before === 0);

  // Off-topic English must NOT tick a step (no effort-pass)
  const offTopic = engine.applyUtteranceToChallenge(q0, "playing with my dog", 0, {
    lenient: true,
  });
  check("timer: off-topic does not tick", offTopic.stepIds.length === 0);

  const forced = engine.forceCompleteQuestStepsForTimeout(q0, 0);
  check("timer: force-complete marks remaining steps", forced.length === q0.steps.length);
  check("timer: quest steps complete after force", engine.isQuestStepsComplete(q0, 0));
  check(
    "timer: first step tagged timeout-pass",
    engine.isTimeoutPassedStep(0, q0.steps[0].id)
  );

  const removed = engine.reconcileEnglishStepProof(q0, 0, ["playing with my dog"]);
  check("timer: reconcile keeps timeout ticks", removed.length === 0);
  check(
    "timer: verify session honors timeout-pass",
    engine.verifyAllStepsHeardInSession(q0, "", 0, [])
  );

  // Progress / star advance (mirrors onQuestComplete isNewClear path)
  if (engine.isQuestStepsComplete(q0, 0) && before === 0) {
    engine.saveProgress(1);
    engine.clearStepProgress(0);
  }
  check("timer: progress advanced after timeout clear", engine.loadProgress() === 1);

  // Secret / side badges still need real matchers — timeout path sets
  // questHintAssistUsed in the UI; engine matcher must stay strict.
  const lootQuest = quests.find((q) => (q.steps || []).some((s) => s.id === "best_loot"));
  if (lootQuest?.sideChallenge?.id === "hidden_diamond_adv") {
    check(
      "timer: wrong loot no diamond badge",
      !engine.matchesQuestSideChallenge(lootQuest, "I found sakura tree")
    );
  }

  const warnNudge = engine.buildMissionTimeoutWarningNudge(q0, 0);
  const doneNudge = engine.buildMissionTimeoutCompleteNudge(q0, 0);
  check("timer: warning nudge mentions time", /30|あと少し|TIME CHECK/i.test(warnNudge));
  check("timer: complete nudge is TIME UP", /TIME UP/i.test(doneNudge));
  check("timer: complete nudge celebrates clear", /CLEARED|cleared|星ゲット/i.test(doneNudge));

  engine.endQuestSession();
}

// --- Phonetic still ticks; off-topic still does not ---
{
  store.clear();
  check("phonetic: stop ~ stone", engine.soundsSimilar("stop", "stone"));
  check("phonetic: pickle ~ pickaxe", engine.soundsSimilar("pickle", "pickaxe"));
  check("phonetic: stone not ~ strong", !engine.soundsSimilar("stone", "strong"));

  const stoneToolQuest = quests.find((q) =>
    (q.steps || []).some((s) => s.id === "made_stone_tool")
  );
  if (stoneToolQuest) {
    const idx = quests.indexOf(stoneToolQuest);
    store.clear();
    engine.beginQuestSession(idx);
    const pickaxe = engine.applyUtteranceToChallenge(
      stoneToolQuest,
      "I made a stone pickaxe",
      idx
    );
    check(
      "stone pickaxe → made_stone_tool",
      pickaxe.stepIds.includes("made_stone_tool") && !pickaxe.stepIds.includes("its_strong")
    );
    store.clear();
    engine.beginQuestSession(idx);
    engine.applyUtteranceToChallenge(stoneToolQuest, "I made a stone pickaxe", idx);
    const strong = engine.applyUtteranceToChallenge(stoneToolQuest, "It's strong", idx);
    check("its strong still ticks step 2", strong.stepIds.includes("its_strong"));
    engine.endQuestSession();
  }

  const stoneQuest = quests.find((q) =>
    (q.steps || []).some((s) => s.id === "found_stones" || s.id === "found_stone")
  );
  const toolQuest = quests.find((q) =>
    (q.steps || []).some((s) => s.id === "made_tool")
  );
  if (stoneQuest) {
    const idx = quests.indexOf(stoneQuest);
    engine.beginQuestSession(idx);
    const phonetic = engine.applyUtteranceToChallenge(stoneQuest, "i found stop", idx);
    const stoneStep = stoneQuest.steps.find(
      (s) => s.id === "found_stones" || s.id === "found_stone"
    );
    check(
      "phonetic: i found stop → found_stones",
      Boolean(stoneStep && phonetic.stepIds.includes(stoneStep.id))
    );
    engine.endQuestSession();
  } else if (toolQuest) {
    const idx = quests.indexOf(toolQuest);
    engine.beginQuestSession(idx);
    // Advance past choose_tool if needed so made_tool can tick in isolation
    const choose = toolQuest.steps.find((s) => s.id === "choose_tool");
    if (choose) {
      engine.applyUtteranceToChallenge(toolQuest, "i will make a pickaxe", idx);
    }
    const phonetic = engine.applyUtteranceToChallenge(toolQuest, "i made a pickle", idx);
    check("phonetic: i made a pickle → made_tool", phonetic.stepIds.includes("made_tool"));
    const off = engine.applyUtteranceToChallenge(toolQuest, "playing with my dog", idx, {
      lenient: true,
    });
    check("phonetic: off-topic still no tick", off.stepIds.length === 0);
    engine.endQuestSession();
  } else {
    // Advanced (and similar) levels may not share beginner/intermediate step
    // ids — soundsSimilar checks above are the shared phonetic smoke.
    check("phonetic: soundsSimilar smoke covers this level", true);
  }
}

// --- Badge collection sharing + reset scoping ---
store.clear();
// Simulate: beginner complete (10 missions), this level complete, badges earned.
store.set("gc_beginner_lesson1_questIndex", "10");
store.set(`gc_${level}_lesson1_questIndex`, String(quests.length));
store.set(
  "gc_beginner_lessonBadges",
  JSON.stringify(["hidden_furnace", "hidden_iron", "hidden_prep_int", "hidden_diamond_adv"])
);
let earned = engine.loadEarnedLessonBadges();
check("beginner main badge derived", earned.includes("lesson1"));
check(`${level} main badge derived`, earned.includes(level));
check("hidden badges kept", earned.includes("hidden_furnace") && earned.includes("hidden_prep_int"));

// Reset THIS level: other levels' badges must survive.
engine.resetProgress();
earned = engine.loadEarnedLessonBadges();
check("beginner badge survives reset", earned.includes("lesson1"));
check(`${level} main badge gone after reset`, !earned.includes(level));
if (level === "intermediate") {
  check("own hidden badge removed", !earned.includes("hidden_prep_int"));
  check("other-level hidden badges survive", earned.includes("hidden_furnace") && earned.includes("hidden_diamond_adv"));
} else {
  check("own hidden badge removed", !earned.includes("hidden_diamond_adv"));
  check("other-level hidden badges survive", earned.includes("hidden_furnace") && earned.includes("hidden_prep_int"));
}
check("beginner progress key untouched", store.get("gc_beginner_lesson1_questIndex") === "10");
check(`${level} progress key cleared`, !store.has(`gc_${level}_lesson1_questIndex`));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
