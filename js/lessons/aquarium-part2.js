/** Homework lesson: aquarium Part 2 (week-3 review: decorations, fish, put fish in tank). */

/** Japanese phrase elicits — phrase MUST be inside 「」 then の えいごを 選んでね！ */
export const PART2_ELICIT_JA = {
  ch1PutKelp: "「ここに こんぶを おいた」の えいごを 選んでね！",
  ch1PutCoral: "「ここに さんごを おいた」の えいごを 選んでね！",
  ch1ChooseThis: "「これ を えらぶ」の えいごを 選んでね！",
  ch1LikeCoral: "「この さんごが すき」の えいごを 選んでね！",
  ch1LooksCool: "「かっこいい！」の えいごを 選んでね！",
  ch2GoOcean: "「うみに いこう！」の えいごを 選んでね！",
  ch2FoundFish: "「おさかなを みつけた！」の えいごを 選んでね！",
  ch2BlueFish: "「あおい おさかなを みつけた！」の えいごを 選んでね！",
  ch2WantFish: "「この おさかなが ほしい」の えいごを 選んでね！",
  ch2ChooseFish: "「この おさかなを えらぶ」の えいごを 選んでね！",
  ch3CaughtFish: "「おさかなを つかまえた！」の えいごを 選んでね！",
  ch3HaveFish: "「おさかなを もってる！」の えいごを 選んでね！",
  ch4PutInTank: "「おさかなを すいそうに いれた」の えいごを 選んでね！",
  ch4PutItHere: "「ここに いれた」の えいごを 選んでね！",
  ch4LookFish: "「みて！おさかなが いる！」の えいごを 選んでね！",
  ch5FishCountAsk: "すいそうに おさかなが なんびき いたか おぼえてる？",
  ch5FishCount: "「おさかなが [fishCount]ひき いる」の えいごを 選んでね！",
  ch5ThreeFish: "「おさかなが 3びき いる」の えいごを 選んでね！",
  ch5FiveFish: "「おさかなが 5ひき いる」の えいごを 選んでね！",
};

/** Chapter 1 Beat 1 — word-for-word from learnie_aquarium_quest_part2.md */
export const PART2_CH1_BEAT1_SPEAK =
  "Let's remember how you decorated your tank! " + PART2_ELICIT_JA.ch1PutKelp;

/** Chapter 2 Beat 1 — word-for-word from learnie_aquarium_quest_part2.md */
export const PART2_CH2_BEAT1_SPEAK =
  "Do you remember going to find fish? " + PART2_ELICIT_JA.ch2GoOcean;

/** Chapter 3 Beat 1 — word-for-word from learnie_aquarium_quest_part2.md */
export const PART2_CH3_BEAT1_SPEAK =
  "You caught the fish with a bucket! " + PART2_ELICIT_JA.ch3CaughtFish;

/** Chapter 4 Beat 1 — word-for-word from learnie_aquarium_quest_part2.md */
export const PART2_CH4_BEAT1_SPEAK =
  "You caught the fish. What did you do next? " + PART2_ELICIT_JA.ch4PutInTank;

/** Chapter 5 Beat A1 — fish-count number picker (1–10). */
export const PART2_CH5_BEAT1_SPEAK =
  "Do you remember how many fish were in your tank? " + PART2_ELICIT_JA.ch5FishCountAsk;

/** Chapter 6 Beat 1 — teacher-question recognition (は どれ？) */
export const PART2_CH6_BEAT1_SPEAK =
  "Your teacher may ask this question! 「なにいろを えらびましたか？」は どれ？";

/** Ending intro — one combined Turn A (then free talk until 終わりにする). */
export const PART2_ENDING_INTRO_SPEAK =
  "Perfect! You remembered a lot about your aquarium! ぱーふぇくと！このまえの すいぞくかんのこと、たくさん おもいだせたね！ " +
  "You remembered the decorations and the fish too! かざりも おさかなも おもいだせたね！ " +
  "Your teacher might ask you some of the same questions next time! " +
  "つぎの レッスンで せんせいが おなじ しつもんを するかもしれないよ！ " +
  "You'll be ready! これで ばっちりだね！";

/** Ending finale — only after 終わりにする. */
export const PART2_ENDING_FINALE_SPEAK =
  "If you play Minecraft again, try using today's English too! See you next time! " +
  "つぎに まいんくらふとで あそぶときも、きょうの えいごを つかってみてね！またね！";

/** @deprecated Use PART2_ENDING_INTRO_SPEAK */
export const PART2_ENDING_TURN_A_SPEAK = PART2_ENDING_INTRO_SPEAK;
/** @deprecated Intro now includes former Turn B */
export const PART2_ENDING_TURN_B_SPEAK = "";
/** @deprecated Use PART2_ENDING_FINALE_SPEAK */
export const PART2_ENDING_TURN_C_SPEAK = PART2_ENDING_FINALE_SPEAK;

/** Join mcq beat EN lead + Japanese elicit exactly (no paraphrase). */
export function part2McqBeatSpeak(beat) {
  const en = String(beat?.learnyEn || "").trim();
  const ja = String(beat?.learnyJa || "").trim();
  if (en && ja) return `${en} ${ja}`;
  return en || ja || "";
}

export const AQUARIUM_PART2 = {
  id: "part2",
  levelId: "beginner",
  architecture: "beginner-part2-v1",
  instructionLevel: "beginner",
  inputMode: "buttons",
  badgePrefix: "p2",
  title: "水族館を思い出そう！",
  titleEn: "Remember your aquarium",
  weekNote: "Week 3 homework — review decorations → find fish → catch fish → put fish in tank.",
  stopRule:
    "This lesson INCLUDES fish. Decorations + fish are part of Part 2.",
  badges: [
    {
      id: "p2_chapter_bronze",
      family: "chapter",
      tier: "bronze",
      label: "チャプター ブロンズ",
      desc: "Chapter 0 をクリア",
      image: "images/completion-badge-bronze.png",
    },
    {
      id: "p2_chapter_silver",
      family: "chapter",
      tier: "silver",
      label: "チャプター シルバー",
      desc: "ミニクイズ1までクリア",
      image: "images/completion-badge-silver.png",
    },
    {
      id: "p2_chapter_gold",
      family: "chapter",
      tier: "gold",
      label: "チャプター ゴールド",
      desc: "Part 2 をさいごまでクリア",
      image: "images/completion-badge-gold.png",
    },
    {
      id: "p2_freetalk_bronze",
      family: "freetalk",
      tier: "bronze",
      label: "フリートーク ブロンズ",
      desc: "おしまいで英語を1文はなした",
      image: "images/completion-badge-bronze.png",
    },
    {
      id: "p2_freetalk_silver",
      family: "freetalk",
      tier: "silver",
      label: "フリートーク シルバー",
      desc: "おしまいで英語を2文はなした",
      image: "images/completion-badge-silver.png",
    },
    {
      id: "p2_freetalk_gold",
      family: "freetalk",
      tier: "gold",
      label: "フリートーク ゴールド",
      desc: "おしまいで英語を3文はなした",
      image: "images/completion-badge-gold.png",
    },
    {
      id: "p2_accuracy_bronze",
      family: "accuracy",
      tier: "bronze",
      label: "いっぱつせいかい ブロンズ",
      desc: "4択をさいしょの1かいで正解できた数が50%より上",
      image: "images/completion-badge-bronze.png",
    },
    {
      id: "p2_accuracy_silver",
      family: "accuracy",
      tier: "silver",
      label: "いっぱつせいかい シルバー",
      desc: "4択をさいしょの1かいで正解できた数が75%より上",
      image: "images/completion-badge-silver.png",
    },
    {
      id: "p2_accuracy_gold",
      family: "accuracy",
      tier: "gold",
      label: "いっぱつせいかい ゴールド",
      desc: "4択をぜんぶさいしょの1かいで正解できた",
      image: "images/completion-badge-gold.png",
    },
  ],
  memories: ["fishCount"],
  segments: [
    {
      id: "ch0",
      type: "warmup",
      title: "まずは今日のおしゃべり",
      titleEn: "Chat first",
      goal: "いきなり復習を始めない。日常英語を2〜4問。",
      sampleQuestions: [
        "How are you today?",
        "What did you do today?",
        "What time is it?",
      ],
      coach:
        "CHAPTER 0 — prioritize natural everyday chat over reading a rigid script. Direct them gently to the ending invite after ~3 exchanges. " +
        "Flow: (1) Opening ONCE: Hello! How are you today? こんにちは！きょうは どうですか？ — never How are you twice. WAIT. " +
        "(2) After mood: reaction + What did you do today? よかった！きょうは なにを したの？ — NOT Thank you; do not swap for lunch/hungry. " +
        "(3) After they share something: reaction to THEIR words + ONE different follow-up — never repeat the same question. " +
        "If no/nothing/とくにない: Okay! / そっか！ + at most ONE different question. " +
        "(4) After ~3 chat turns, ending invite: short reaction that NAMES their last words, THEN EXACTLY: Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together! " +
        "そうだ！このまえ まいんくらふとで つくった すいぞくかん、おぼえてる？いっしょに おもいだしてみよう！ " +
        "FORBIDDEN: bare Oh!/Okay!/そっか with no reaction (e.g. after grape → react to grape cake first). " +
        "(5) ANY child reply after that invite (yes/no/ok/anything) → call complete_segment(ch0) immediately → Chapter 1.",
      completeWithoutEnglish: true,
    },
    {
      id: "ch1",
      type: "story",
      title: "水槽を飾ろう",
      titleEn: "Decorate the tank",
      goal: "I put kelp here. → I put coral here. → I choose this one. → I like this coral. → It looks cool!",
      targets: [
        { id: "put_kelp", phrase: "I put kelp here.", patterns: ["i put kelp here", "put kelp here"] },
        { id: "put_coral", phrase: "I put coral here.", patterns: ["i put coral here", "put coral here"] },
        { id: "choose_this", phrase: "I choose this one.", patterns: ["i choose this one", "choose this one"] },
        { id: "like_coral", phrase: "I like this coral.", patterns: ["i like this coral", "like this coral"] },
        { id: "looks_cool", phrase: "It looks cool!", patterns: ["it looks cool", "looks cool"] },
      ],
      mcqBeats: [
        {
          id: "put_kelp",
          learnyEn: "Let's remember how you decorated your tank!",
          learnyJa: PART2_ELICIT_JA.ch1PutKelp,
          choices: ["I put kelp here.", "I found kelp here.", "I need kelp.", "I like kelp."],
          answer: "I put kelp here.",
          patterns: ["i put kelp here", "put kelp here"],
        },
        {
          id: "put_coral",
          learnyEn: "How about coral?",
          learnyJa: PART2_ELICIT_JA.ch1PutCoral,
          choices: ["I put coral here.", "I found coral here.", "I want coral.", "I made coral."],
          answer: "I put coral here.",
          patterns: ["i put coral here", "put coral here"],
        },
        {
          id: "choose_this",
          learnyEn: "You had different decorations!",
          learnyJa: PART2_ELICIT_JA.ch1ChooseThis,
          choices: ["I choose this one.", "I put this one.", "I found this one.", "I need this one."],
          answer: "I choose this one.",
          patterns: ["i choose this one", "choose this one"],
        },
        {
          id: "like_coral",
          learnyEn: "You found coral you liked!",
          learnyJa: PART2_ELICIT_JA.ch1LikeCoral,
          choices: ["I like this coral.", "I need this coral.", "I found this coral.", "I put this coral."],
          answer: "I like this coral.",
          patterns: ["i like this coral", "like this coral"],
        },
        {
          id: "looks_cool",
          learnyEn: "Your tank looked great!",
          learnyJa: PART2_ELICIT_JA.ch1LooksCool,
          choices: ["It looks cool!", "I need more!", "I found it!", "It is a fish!"],
          answer: "It looks cool!",
          patterns: ["it looks cool", "looks cool"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 1 — on-screen 4-choice. ONE beat per turn. FORBIDDEN: reveal the English answer aloud. " +
        `Beat 1 (opening, no praise prefix) EXACT: ${PART2_CH1_BEAT1_SPEAK} Then WAIT. ` +
        `Beat 2 after correct: short reaction + EXACT How about coral? ${PART2_ELICIT_JA.ch1PutCoral} Then WAIT. ` +
        `Beat 3 after correct: short reaction + EXACT You had different decorations! ${PART2_ELICIT_JA.ch1ChooseThis} Then WAIT. ` +
        "Beat 3 CRITICAL AUDIO: inside 「」 say これ・を・えらぶ (kore wo). FORBIDDEN: ここに えらぶ / ここにえらぶ. " +
        `Beat 4 after correct: short reaction + EXACT You found coral you liked! ${PART2_ELICIT_JA.ch1LikeCoral} Then WAIT. ` +
        `Beat 5 after correct: short reaction + EXACT Your tank looked great! ${PART2_ELICIT_JA.ch1LooksCool} Then WAIT. ` +
        "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. " +
        "After It looks cool! is correct: complete_segment(ch1) immediately → Chapter 2. " +
        "FORBIDDEN: complete_segment before Beat 5; jump to うみに いこう / fish before all 5 beats.",
    },
    {
      id: "ch2",
      type: "story",
      title: "魚を探そう",
      titleEn: "Find fish",
      goal: "Let's go to the ocean! → I found a fish! → I found a blue fish! → I want this fish. → I choose this fish.",
      targets: [
        { id: "go_ocean", phrase: "Let's go to the ocean!", patterns: ["let's go to the ocean", "go to the ocean"] },
        { id: "found_fish", phrase: "I found a fish!", patterns: ["i found a fish", "found a fish"] },
        { id: "blue_fish", phrase: "I found a blue fish!", patterns: ["i found a blue fish", "found a blue fish"] },
        { id: "want_fish", phrase: "I want this fish.", patterns: ["i want this fish", "want this fish"] },
        { id: "choose_fish", phrase: "I choose this fish.", patterns: ["i choose this fish", "choose this fish"] },
      ],
      mcqBeats: [
        {
          id: "go_ocean",
          learnyEn: "Do you remember going to find fish?",
          learnyJa: PART2_ELICIT_JA.ch2GoOcean,
          choices: ["Let's go to the ocean!", "Let's make the ocean!", "I found the ocean!", "I like the ocean!"],
          answer: "Let's go to the ocean!",
          patterns: ["let's go to the ocean", "go to the ocean"],
        },
        {
          id: "found_fish",
          learnyEn: "You found a fish!",
          learnyJa: PART2_ELICIT_JA.ch2FoundFish,
          choices: ["I found a fish!", "I caught a fish!", "I have a fish!", "I want a fish!"],
          answer: "I found a fish!",
          patterns: ["i found a fish", "found a fish"],
        },
        {
          id: "blue_fish",
          learnyEn: "You found a blue fish!",
          learnyJa: PART2_ELICIT_JA.ch2BlueFish,
          choices: ["I found a blue fish!", "I want a blue fish!", "I have a blue fish!", "I put a blue fish!"],
          answer: "I found a blue fish!",
          patterns: ["i found a blue fish", "found a blue fish"],
        },
        {
          id: "want_fish",
          learnyEn: "You found a fish you wanted!",
          learnyJa: PART2_ELICIT_JA.ch2WantFish,
          choices: ["I want this fish.", "I found this fish.", "I put this fish.", "I like the ocean."],
          answer: "I want this fish.",
          patterns: ["i want this fish", "want this fish"],
        },
        {
          id: "choose_fish",
          learnyEn: "You decided which fish you wanted!",
          learnyJa: PART2_ELICIT_JA.ch2ChooseFish,
          choices: ["I choose this fish.", "I want this fish.", "I caught this fish.", "I found this fish."],
          answer: "I choose this fish.",
          patterns: ["i choose this fish", "choose this fish"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 2 — on-screen 4-choice. ONE beat per turn. FORBIDDEN: reveal the English answer aloud. " +
        `Beat 1 (opening, no praise prefix) EXACT: ${PART2_CH2_BEAT1_SPEAK} Then WAIT. ` +
        `Beat 2 after correct: short reaction + EXACT You found a fish! ${PART2_ELICIT_JA.ch2FoundFish} Then WAIT. ` +
        `Beat 3 after correct: short reaction + EXACT You found a blue fish! ${PART2_ELICIT_JA.ch2BlueFish} Then WAIT. ` +
        `Beat 4 after correct: short reaction + EXACT You found a fish you wanted! ${PART2_ELICIT_JA.ch2WantFish} Then WAIT. ` +
        `Beat 5 after correct: short reaction + EXACT You decided which fish you wanted! ${PART2_ELICIT_JA.ch2ChooseFish} Then WAIT. ` +
        "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. " +
        "After I choose this fish. is correct: complete_segment(ch2) immediately → Chapter 3. " +
        "FORBIDDEN: complete_segment before Beat 5; jump to catch/bucket / Chapter 3 before all 5 beats.",
    },
    {
      id: "ch3",
      type: "story",
      title: "魚を捕まえよう",
      titleEn: "Catch the fish",
      goal: "I caught a fish! → I have a fish!",
      targets: [
        { id: "caught_fish", phrase: "I caught a fish!", patterns: ["i caught a fish", "caught a fish"] },
        { id: "have_fish", phrase: "I have a fish!", patterns: ["i have a fish", "have a fish"] },
      ],
      mcqBeats: [
        {
          id: "caught_fish",
          learnyEn: "You caught the fish with a bucket!",
          learnyJa: PART2_ELICIT_JA.ch3CaughtFish,
          choices: ["I caught a fish!", "I found a fish!", "I made a fish!", "I need a fish!"],
          answer: "I caught a fish!",
          patterns: ["i caught a fish", "caught a fish"],
        },
        {
          id: "have_fish",
          learnyEn: "Now you have the fish!",
          learnyJa: PART2_ELICIT_JA.ch3HaveFish,
          choices: ["I have a fish!", "I found a fish!", "I want a fish!", "I put a fish!"],
          answer: "I have a fish!",
          patterns: ["i have a fish", "have a fish"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 3 — on-screen 4-choice. TWO beats only. FORBIDDEN: reveal the English answer aloud. " +
        `Beat 1 (opening, no praise prefix) EXACT: ${PART2_CH3_BEAT1_SPEAK} Then WAIT. ` +
        `Beat 2 after correct: short reaction + EXACT Now you have the fish! ${PART2_ELICIT_JA.ch3HaveFish} Then WAIT. ` +
        "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. " +
        "After I have a fish! is correct: complete_segment(ch3) immediately → Mini quiz 1. " +
        "FORBIDDEN: complete_segment before Beat 2; jump to Mini quiz / put fish in tank before both catch beats.",
    },
    {
      id: "quiz1",
      type: "quiz",
      title: "ミニクイズ1",
      titleEn: "Mini quiz 1",
      goal: "ここまでのフレーズを3問。",
      items: [
        {
          id: "q_put_coral",
          promptJa: "ここに さんごを おいた",
          promptHira: "ここに さんごを おいた",
          speak: "くいずたいむ！「ここに さんごを おいた」は えいごで？",
          answer: "I put coral here.",
          patterns: ["i put coral here", "put coral here"],
          choices: ["I put coral here.", "I found coral here.", "I choose this one.", "I like this coral."],
        },
        {
          id: "q_want_fish",
          promptJa: "この おさかなが ほしい",
          promptHira: "この おさかなが ほしい",
          speak: "じゃあ つぎは「この おさかなが ほしい」は えいごで？",
          answer: "I want this fish.",
          patterns: ["i want this fish", "want this fish"],
          choices: ["I want this fish.", "I choose this fish.", "I found a fish!", "I have a fish!"],
        },
        {
          id: "q_caught_fish",
          promptJa: "おさかなを つかまえた！",
          promptHira: "おさかなを つかまえた！",
          speak: "じゃあ つぎは「おさかなを つかまえた！」は えいごで？",
          answer: "I caught a fish!",
          patterns: ["i caught a fish", "caught a fish"],
          choices: ["I caught a fish!", "I found a fish!", "I have a fish!", "I want this fish."],
        },
      ],
      coach:
        "MINI QUIZ 1 — 4-choice MCQ. Speak FULL Japanese ひらがな only (no English-first; do NOT read English choices aloud). " +
        "FIXED order, exactly 3 items — use each speak line EXACTLY word-by-word: " +
        "(1 opening, no praise) くいずたいむ！「ここに さんごを おいた」は えいごで？ → I put coral here. " +
        "(2 after correct = reaction + echo correct English +) じゃあ つぎは「この おさかなが ほしい」は えいごで？ → I want this fish. " +
        "(3 after correct = reaction + echo correct English +) じゃあ つぎは「おさかなを つかまえた！」は えいごで？ → I caught a fish! " +
        "Item 1 MUST start with くいずたいむ — FORBIDDEN starting with じゃあ つぎは or skipping to item 2/3. " +
        "WAIT for a 4-button tap. Wrong tap: rotate a soft bilingual retry (Nice try / So close / Oops / ざんねん / ちがうみたい — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer; repeat the SAME speak line. " +
        "After all 3 correct: complete_segment(quiz1) immediately → Chapter 4.",
    },
    {
      id: "ch4",
      type: "story",
      title: "魚を水槽に入れよう",
      titleEn: "Put fish in tank",
      goal: "I put the fish in the tank. → I put it in here. → Look! There's a fish!",
      targets: [
        { id: "put_in_tank", phrase: "I put the fish in the tank.", patterns: ["i put the fish in the tank", "put the fish in the tank"] },
        { id: "put_it_here", phrase: "I put it in here.", patterns: ["i put it in here", "put it in here"] },
        { id: "look_fish", phrase: "Look! There's a fish!", patterns: ["look there's a fish", "there's a fish"] },
      ],
      mcqBeats: [
        {
          id: "put_in_tank",
          learnyEn: "You caught the fish. What did you do next?",
          learnyJa: PART2_ELICIT_JA.ch4PutInTank,
          choices: ["I put the fish in the tank.", "I found the fish in the tank.", "I caught the fish in the tank.", "I want the fish in the tank."],
          answer: "I put the fish in the tank.",
          patterns: ["i put the fish in the tank", "put the fish in the tank"],
        },
        {
          id: "put_it_here",
          learnyEn: "How about \"ここに いれた\"?",
          learnyJa: PART2_ELICIT_JA.ch4PutItHere,
          choices: ["I put it in here.", "I found it in here.", "I want it in here.", "I made it in here."],
          answer: "I put it in here.",
          patterns: ["i put it in here", "put it in here"],
        },
        {
          id: "look_fish",
          learnyEn: "You looked in the tank and saw a fish!",
          learnyJa: PART2_ELICIT_JA.ch4LookFish,
          choices: ["Look! There's a fish!", "Look! I need a fish!", "Look! I made a fish!", "Look! I want glass!"],
          answer: "Look! There's a fish!",
          patterns: ["look there's a fish", "there's a fish"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 4 — on-screen 4-choice. THREE beats. FORBIDDEN: reveal the English answer aloud. " +
        `Beat 1 (opening, no praise prefix) EXACT: ${PART2_CH4_BEAT1_SPEAK} Then WAIT. ` +
        `Beat 2 after correct: short reaction + EXACT How about "ここに いれた"? ${PART2_ELICIT_JA.ch4PutItHere} Then WAIT. ` +
        `Beat 3 after correct: short reaction + EXACT You looked in the tank and saw a fish! ${PART2_ELICIT_JA.ch4LookFish} Then WAIT. ` +
        "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. " +
        "After Look! There's a fish! is correct: complete_segment(ch4) immediately → DAILY ENGLISH. " +
        "FORBIDDEN: complete_segment before Beat 3; jump to Daily English / fish count before all 3 beats.",
    },
    {
      id: "daily1",
      type: "daily_english",
      title: "突然英会話！",
      titleEn: "Daily English",
      goal: "食べ物の話から始めて4ラリー以上。",
      sampleQuestions: [
        "What did you eat today?",
        "What's your favorite food?",
        "Do you like curry?",
      ],
      completeWithoutEnglish: true,
      coach:
        "PURPOSE: natural free-talk — make English learning FUN. React playfully; genuine conversation, NOT a quiz. " +
        "Start EXACTLY: Oh by the way, [name], what did you eat today? そういえば、[name]さんは きょう なにを たべたの？ " +
        "FORBIDDEN: Let's practice today's English. " +
        "Then chat naturally for at least 4 rallies: fun reaction to their exact words + ONE follow-up about THAT topic, WAIT. " +
        "FORBIDDEN: re-asking facts they already answered; abrupt topic jumps with no bridge. " +
        "When 4+ rallies reached: FIRST short specific reaction naming their last words, " +
        "THEN EXACTLY: Nice! Now let's get back to your aquarium! いいね！じゃあ すいぞくかんの はなしに もどろう！ " +
        "FORBIDDEN on that turn: any new everyday question (Was it…? / だった？) — reaction + bridge ONLY. " +
        "Finish speaking that line, then complete_segment(daily1) → Chapter 5. " +
        "FORBIDDEN: Are you tired? / つかれた？ / favorite color; complete_segment before 4 rallies or before the bridge.",
    },
    {
      id: "ch5",
      type: "mixed",
      title: "魚は何匹いた？",
      titleEn: "How many fish?",
      goal: "1〜10の数を選ぶ → There are [N] fish → three/five fish。",
      memoryKey: "fishCount",
      askFishCount: true,
      targets: [
        { id: "fish_count", phrase: "There are [N] fish.", patterns: ["there are", "there is", "fish"] },
        { id: "three_fish", phrase: "There are three fish.", patterns: ["there are three fish", "three fish"] },
        { id: "five_fish", phrase: "There are five fish.", patterns: ["there are five fish", "five fish"] },
      ],
      mcqBeats: [
        {
          id: "ask_fish_count",
          learnyEn: "Do you remember how many fish were in your tank?",
          learnyJa: PART2_ELICIT_JA.ch5FishCountAsk,
          // Runtime picker 1–10 (not listed here so extract-mcq won't make option audio).
          fishCountPicker: true,
          choices: [],
          answer: "1",
          acceptAnyOf: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
          patterns: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
          memoryKey: "fishCount",
          memoryFromChoice: true,
        },
        {
          id: "fish_count_dynamic",
          learnyEn: "You had [fishCount] fish!",
          learnyJa: PART2_ELICIT_JA.ch5FishCount,
          choices: [
            "There are [fishCount] fish.",
            "There are [fishCountMinus1] fish.",
            "There are [fishCountPlus1] fish.",
            "There is [fishCount] fish.",
          ],
          answer: "There are [fishCount] fish.",
          patterns: ["there are", "fish"],
          dynamicFishCount: true,
          afterFreeAsk: true,
        },
        {
          id: "three_fish",
          learnyEn: "How about three fish?",
          learnyJa: PART2_ELICIT_JA.ch5ThreeFish,
          choices: ["There are three fish.", "There is three fish.", "I have three glass.", "I found three fish."],
          answer: "There are three fish.",
          patterns: ["there are three fish", "three fish"],
          afterFreeAsk: true,
        },
        {
          id: "five_fish",
          learnyEn: "How about five fish?",
          learnyJa: PART2_ELICIT_JA.ch5FiveFish,
          choices: ["There are five fish.", "There is five fish.", "I have five glass.", "I found five sand."],
          answer: "There are five fish.",
          patterns: ["there are five fish", "five fish"],
          afterFreeAsk: true,
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 5 — number picker then MCQ. " +
        `Beat A1 (10 number buttons 1–10, NO option audio): Speak EXACTLY: ${PART2_CH5_BEAT1_SPEAK} Then WAIT for a number tap. ` +
        "When they tap N → record_memory(fishCount, N) → Beat A2. " +
        "Beat A2 (dynamic MCQ using their N; option audio OK for 1–10): short reaction + EXACT You had [N] fish! " +
        "「おさかなが [N]ひき いる」の えいごを 選んでね！ (1→There is one fish.; else There are [N] fish.). " +
        "Beat A3 after correct: short reaction + EXACT How about three fish? " +
        `${PART2_ELICIT_JA.ch5ThreeFish} → There are three fish. ` +
        "Beat A4 after correct: short reaction + EXACT How about five fish? " +
        `${PART2_ELICIT_JA.ch5FiveFish} → There are five fish. → complete_segment(ch5) → Chapter 6. ` +
        "FORBIDDEN: inventing a count; skip A1; unlocking A2 before a number tap.",
    },
    {
      id: "ch6",
      type: "story",
      title: "先生からの質問チャレンジ",
      titleEn: "Teacher questions",
      goal: "先生が聞きそうな質問5問。",
      targets: [
        { id: "what_color", phrase: "What color did you choose?", patterns: ["what color did you choose"] },
        { id: "what_fish", phrase: "What fish did you choose?", patterns: ["what fish did you choose"] },
        { id: "how_many", phrase: "How many fish are in your tank?", patterns: ["how many fish", "in your tank"] },
        { id: "what_like", phrase: "What do you like about your aquarium?", patterns: ["what do you like", "about your aquarium"] },
        { id: "do_like", phrase: "Do you like your aquarium?", patterns: ["do you like your aquarium"] },
      ],
      mcqBeats: [
        {
          id: "what_color",
          learnyEn: "Your teacher may ask this question!",
          learnyJa: "「なにいろを えらびましたか？」は どれ？",
          choices: ["What color did you choose?", "What fish did you choose?", "How many fish are there?", "Do you like your aquarium?"],
          answer: "What color did you choose?",
          patterns: ["what color did you choose"],
        },
        {
          id: "what_fish",
          learnyEn: "How about this one?",
          learnyJa: "「どの おさかなを えらびましたか？」は どれ？",
          choices: ["What fish did you choose?", "What color did you choose?", "What fish did you find?", "How many fish are there?"],
          answer: "What fish did you choose?",
          patterns: ["what fish did you choose"],
        },
        {
          id: "how_many",
          learnyEn: "Your teacher might ask about the number of fish!",
          learnyJa: "「すいそうに おさかなが なんびき いますか？」は どれ？",
          choices: ["How many fish are in your tank?", "What fish are in your tank?", "Where is your tank?", "Do you like your tank?"],
          answer: "How many fish are in your tank?",
          patterns: ["how many fish", "in your tank"],
        },
        {
          id: "what_like",
          learnyEn: "How about this question?",
          learnyJa: "「すいぞくかんの どんなところが すき？」は どれ？",
          choices: ["What do you like about your aquarium?", "What do you need for your aquarium?", "Where is your aquarium?", "How many aquariums do you have?"],
          answer: "What do you like about your aquarium?",
          patterns: ["what do you like", "about your aquarium"],
        },
        {
          id: "do_like",
          learnyEn: "Last one!",
          learnyJa: "「じぶんの すいぞくかんが すき？」は どれ？",
          choices: ["Do you like your aquarium?", "Do you need an aquarium?", "Did you find an aquarium?", "Can you make an aquarium?"],
          answer: "Do you like your aquarium?",
          patterns: ["do you like your aquarium"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 6 — Teacher QUESTION recognition MCQ (child picks which English question matches the Japanese). Five beats. " +
        "FORBIDDEN: reveal the English answer aloud; の えいごを 選んでね (use は どれ？). " +
        `Beat 1 (opening, no praise prefix) EXACT: ${PART2_CH6_BEAT1_SPEAK} → What color did you choose? Then WAIT. ` +
        "Beat 2 after correct: short reaction + EXACT How about this one? 「どの おさかなを えらびましたか？」は どれ？ → What fish did you choose? Then WAIT. " +
        "Beat 3 after correct: short reaction + EXACT Your teacher might ask about the number of fish! 「すいそうに おさかなが なんびき いますか？」は どれ？ → How many fish are in your tank? Then WAIT. " +
        "Beat 4 after correct: short reaction + EXACT How about this question? 「すいぞくかんの どんなところが すき？」は どれ？ → What do you like about your aquarium? Then WAIT. " +
        "Beat 5 after correct: short reaction + EXACT Last one! 「じぶんの すいぞくかんが すき？」は どれ？ → Do you like your aquarium? Then WAIT. " +
        "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. " +
        "After Do you like your aquarium? is correct: complete_segment(ch6) immediately → Final Challenge. " +
        "FORBIDDEN: complete_segment before Beat 5; jump to Final Challenge early; complete_segment(final1) or Ending before Final Challenge questions.",
    },
    {
      id: "final1",
      type: "final_challenge",
      input: "speak_or_click",
      title: "ファイナルチャレンジ",
      titleEn: "Final challenge",
      goal: "ランダム5〜6問。「〜は英語で？」形式のみ。",
      items: [
        {
          id: "put-kelp",
          promptJa: "ここに こんぶを おいた！は英語で？",
          promptHira: "ここに こんぶを おいた！は えいごで？",
          answer: "I put kelp here.",
          patterns: ["i put kelp here", "put kelp here"],
          choices: ["I put kelp here.", "I found kelp.", "I need kelp.", "I like kelp."],
        },
        {
          id: "put-coral",
          promptJa: "ここに さんごを おいた！は英語で？",
          promptHira: "ここに さんごを おいた！は えいごで？",
          answer: "I put coral here.",
          patterns: ["i put coral here", "put coral here"],
          choices: ["I put coral here.", "I found coral.", "I want coral.", "I made coral."],
        },
        {
          id: "choose-this",
          promptJa: "これ を えらぶ！は英語で？",
          promptHira: "これ を えらぶ！は えいごで？",
          answer: "I choose this one.",
          patterns: ["i choose this one", "choose this one"],
          choices: ["I choose this one.", "I put this one.", "I found this one.", "I need this one."],
        },
        {
          id: "like-coral",
          promptJa: "この さんごが すき！は英語で？",
          promptHira: "この さんごが すき！は えいごで？",
          answer: "I like this coral.",
          patterns: ["i like this coral", "like this coral"],
          choices: ["I like this coral.", "I need this coral.", "I found this coral.", "I put this coral."],
        },
        {
          id: "looks-cool",
          promptJa: "かっこいい！は英語で？",
          promptHira: "かっこいい！は えいごで？",
          answer: "It looks cool!",
          patterns: ["it looks cool", "looks cool"],
          choices: ["It looks cool!", "I need more!", "I found it!", "It is a fish!"],
        },
        {
          id: "go-ocean",
          promptJa: "うみに いこう！は英語で？",
          promptHira: "うみに いこう！は えいごで？",
          answer: "Let's go to the ocean!",
          patterns: ["let's go to the ocean", "go to the ocean"],
          choices: ["Let's go to the ocean!", "Let's make the ocean!", "I found the ocean!", "I like the ocean!"],
        },
        {
          id: "found-fish",
          promptJa: "おさかなを みつけた！は英語で？",
          promptHira: "おさかなを みつけた！は えいごで？",
          answer: "I found a fish!",
          patterns: ["i found a fish", "found a fish"],
          choices: ["I found a fish!", "I caught a fish!", "I have a fish!", "I want a fish!"],
        },
        {
          id: "blue-fish",
          promptJa: "あおい おさかなを みつけた！は英語で？",
          promptHira: "あおい おさかなを みつけた！は えいごで？",
          answer: "I found a blue fish!",
          patterns: ["i found a blue fish", "found a blue fish"],
          choices: ["I found a blue fish!", "I want a blue fish!", "I have a blue fish!", "I put a blue fish!"],
        },
        {
          id: "want-fish",
          promptJa: "この おさかなが ほしい！は英語で？",
          promptHira: "この おさかなが ほしい！は えいごで？",
          answer: "I want this fish.",
          patterns: ["i want this fish", "want this fish"],
          choices: ["I want this fish.", "I found this fish.", "I put this fish.", "I like the ocean."],
        },
        {
          id: "choose-fish",
          promptJa: "この おさかなを えらぶ！は英語で？",
          promptHira: "この おさかなを えらぶ！は えいごで？",
          answer: "I choose this fish.",
          patterns: ["i choose this fish", "choose this fish"],
          choices: ["I choose this fish.", "I want this fish.", "I caught this fish.", "I found this fish."],
        },
        {
          id: "caught-fish",
          promptJa: "おさかなを つかまえた！は英語で？",
          promptHira: "おさかなを つかまえた！は えいごで？",
          answer: "I caught a fish!",
          patterns: ["i caught a fish", "caught a fish"],
          choices: ["I caught a fish!", "I found a fish!", "I made a fish!", "I need a fish!"],
        },
        {
          id: "have-fish",
          promptJa: "おさかなを もってる！は英語で？",
          promptHira: "おさかなを もってる！は えいごで？",
          answer: "I have a fish!",
          patterns: ["i have a fish", "have a fish"],
          choices: ["I have a fish!", "I found a fish!", "I want a fish!", "I put a fish!"],
        },
        {
          id: "put-tank",
          promptJa: "おさかなを すいそうに いれた！は英語で？",
          promptHira: "おさかなを すいそうに いれた！は えいごで？",
          answer: "I put the fish in the tank.",
          patterns: ["i put the fish in the tank", "put the fish in the tank"],
          choices: ["I put the fish in the tank.", "I found the fish in the tank.", "I caught the fish in the tank.", "I want the fish in the tank."],
        },
        {
          id: "put-it-here",
          promptJa: "ここに いれた！は英語で？",
          promptHira: "ここに いれた！は えいごで？",
          answer: "I put it in here.",
          patterns: ["i put it in here", "put it in here"],
          choices: ["I put it in here.", "I found it in here.", "I want it in here.", "I made it in here."],
        },
        {
          id: "look-fish",
          promptJa: "みて！おさかなが いる！は英語で？",
          promptHira: "みて！おさかなが いる！は えいごで？",
          answer: "Look! There's a fish!",
          patterns: ["look there's a fish", "there's a fish"],
          choices: ["Look! There's a fish!", "Look! I need a fish!", "Look! I made a fish!", "Look! I want glass!"],
        },
        {
          id: "three-fish",
          promptJa: "おさかなが 3びき いる！は英語で？",
          promptHira: "おさかなが 3びき いる！は えいごで？",
          answer: "There are three fish.",
          patterns: ["there are three fish", "three fish"],
          choices: ["There are three fish.", "There is three fish.", "I have three fish.", "I found three fish."],
        },
        {
          id: "five-fish",
          promptJa: "おさかなが 5ひき いる！は英語で？",
          promptHira: "おさかなが 5ひき いる！は えいごで？",
          answer: "There are five fish.",
          patterns: ["there are five fish", "five fish"],
          choices: ["There are five fish.", "There is five fish.", "I have five fish.", "I found five fish."],
        },
      ],
      coach:
        "Open EXACTLY: Final challenge time! Let's go! さいごの ちゃれんじだよ！れっつごー！ " +
        "then IMMEDIATELY the first 〜は えいごで？ item (ひらがな only) in the SAME turn. " +
        "FORBIDDEN: Are you ready? / じゅんびは できてる？. " +
        "Client picks RANDOM 5〜6 questions from the Part 2 list — ask ONE listed item per turn (exact cue + は えいごで？). " +
        "Beginner: on-screen 4 choices; child taps the English answer. Wrong tap: rotate a soft bilingual retry (Nice try / So close / Oops / ざんねん / ちがうみたい — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. " +
        "After correct: brief praise + next cue in the SAME turn. Say さいごの もんだい！ only when exactly ONE item remains. " +
        "After ALL queued items answered → complete_segment(final1) → Ending. " +
        "FORBIDDEN: inventing questions; bare は英語で？; Part 1 glass/sand cues.",
    },
    {
      id: "ending1",
      type: "ending",
      title: "水族館を思い出せた！",
      titleEn: "Remembered your aquarium",
      goal: "イントロ→フリートーク→「終わりにする」でフィナーレ→切断。英語返答回数でフリートークバッジ。",
      completeWithoutEnglish: true,
      autoDisconnect: true,
      coach:
        "ENDING — same structure as Part 1: client intro → free talk → 終わりにする → client finale. " +
        "Turn A / intro EXACT (ONE message, then WAIT): Perfect! You remembered a lot about your aquarium! " +
        "ぱーふぇくと！このまえの すいぞくかんのこと、たくさん おもいだせたね！ " +
        "You remembered the decorations and the fish too! かざりも おさかなも おもいだせたね！ " +
        "Your teacher might ask you some of the same questions next time! " +
        "つぎの レッスンで せんせいが おなじ しつもんを するかもしれないよ！ You'll be ready! これで ばっちりだね！ " +
        "Then FREE TALK: follow the child's topic; NEVER steer to ending; NEVER say goodbye until 終わりにする. " +
        "After 終わりにする ONLY — finale EXACT: If you play Minecraft again, try using today's English too! See you next time! " +
        "つぎに まいんくらふとで あそぶときも、きょうの えいごを つかってみてね！またね！ then complete_segment(ending1). " +
        "Freetalk badge: English reply ×3 gold / ×2 silver / ×1 bronze. " +
        "FORBIDDEN: Part 1 fish-tank ending lines; inventing How many; goodbye before 終わりにする.",
    },
  ],
};
