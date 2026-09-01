/** Homework lesson: aquarium Part 1 (week-2 review of week-1 tank prep). No fish. */

/** Japanese phrase elicits — phrase MUST be inside 「」 before って英語/えいごで言ってみて. */
export const PART1_ELICIT_JA = {
  needGlass: "「がらすが ひつよう」って えいごで いってみて！",
  needSand: "「すなが ひつよう」って えいごで いってみて！",
  foundSand: "あ！すな あった！「すなを みつけた！」って えいごで いってみて！",
  ch3NeedGlass: "「がらすを つくらないと」って えいごで いってみて！",
  ch3MadeGlass: "「がらすを つくった」って えいごで いってみて！",
  ch5Building: "「すいそうを つくってる」って えいごで いってみて！",
  ch5MadeTank: "「すいそうを つくった」って えいごで いってみて！",
  ch5LooksGood: "「いい かんじに できた！」って えいごで いってみて！",
  ch6MoreSand: "「もっと すなが ひつよう」って えいごで いってみて！",
  ch6ImDone: "「できた！」って えいごで いってみて！",
  ch6TankReady: "「さかなを いれられる じゅんびが できた！」って えいごで いってみて！",
};

export const CH6_BEAT1_SPEAK =
  "Let's make a basement inside the tank! すいそうの そこに すなを おこう！できたら えいごで おしえてね！";

export const CH6_BEAT2_SPEAK =
  "Do we have enough sand? " + PART1_ELICIT_JA.ch6MoreSand;

export const CH6_BEAT3_SPEAK = "Are you done? " + PART1_ELICIT_JA.ch6ImDone;

export const CH6_BEAT4_SPEAK =
  "Is the tank ready for the fishes to swim? " + PART1_ELICIT_JA.ch6TankReady;

export const AQUARIUM_PART1 = {
  id: "part1",
  title: "魚を迎える準備をしよう！",
  titleEn: "Get the tank ready",
  weekNote: "Week 2 homework — after the week-1 in-person class.",
  stopRule:
    "Never catch fish, never finish an aquarium. End with tank ready and NO fish.",
  // Badges paused until end-of-lesson scoring is designed.
  badges: [],
  memories: ["favoriteColor", "searchPlace"],
  segments: [
    {
      id: "ch0",
      type: "warmup",
      title: "まずは今日のおしゃべり",
      titleEn: "Chat first",
      goal: "いきなり復習を始めない。日常英語を2〜4問。",
      sampleQuestions: [
        "How are you today?",
        "What time is it?",
        "Are you hungry?",
        "What did you eat today?",
        "What's your favorite summer food?",
        "What color do you like?",
        "Do you like the ocean or the mountains?",
        "What did you do today?",
      ],
      coach:
        "Natural human chat, not a quiz and not a robot. Opening ONCE: Hello! How are you today? こんにちは！きょうは どうですか？ — never say How are you twice. " +
        "ONE question per turn — always WAIT. After mood (good/fine/ok): That's great! What did you do today? よかった！きょうは なにを したの？ — NOT lunch/hungry/games; NOT Thank you. " +
        "Later beats: warm varied praise + ONE follow-up (full EN then full ひらがな) — do NOT always say That's great!. " +
        "When they share news (studied / cafe / school / game…): show real interest (name it + a tiny human comment), ask ONE curious follow-up about THAT, WAIT — never hollow Oh! then jump mid-chat; never robotic You X! What did you X? every time. " +
        "After 3+ real chat exchanges, ONE invite turn: warm short reaction to their last line + Oh! Today… in the SAME message — " +
        "e.g. Okay! Oh! Today I want to make a fish tank. Will you help me make it? そっか！そうだ！きょうは らーにーせんせいの すいそうづくりを てつだってほしいんだ。いっしょに つくれる？ " +
        "FORBIDDEN: bare Oh! Today with no reaction; everyday chat question + tank invite; Japanese-only invite; doubled greetings. After yes/ok: call complete_segment(ch0) — do NOT ask about glass/sand until Chapter 1.",
      completeWithoutEnglish: true,
    },
    {
      id: "ch1",
      type: "story",
      title: "ガラスが足りない！",
      titleEn: "We need glass",
      goal: "I need glass. → I need sand.",
      targets: [
        { id: "need_glass", phrase: "I need glass.", patterns: ["i need glass", "need glass"] },
        { id: "need_sand", phrase: "I need sand.", patterns: ["i need sand", "need sand"] },
      ],
      mcqBeats: [
        {
          id: "tank_need",
          learnyEn: "What do I need to make a tank? Something transparent and hard.",
          learnyJa: "すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。",
          choices: ["glass", "wood", "water", "dirt"],
          answer: "glass",
          patterns: ["glass", "ガラス", "がらす"],
        },
        {
          id: "need_glass",
          learnyEn: "Can you say it in English?",
          learnyJa: PART1_ELICIT_JA.needGlass,
          choices: ["I need glass.", "I found glass.", "I made sand.", "I need water."],
          answer: "I need glass.",
          patterns: ["i need glass", "need glass"],
        },
        {
          id: "make_glass_need",
          learnyEn: "To make glass in Minecraft, what do we need?",
          learnyJa: "まいくらふとで がらすを つくるには、なにが いるかな？",
          choices: ["sand", "water", "wood", "stone"],
          answer: "sand",
          patterns: ["sand", "すな", "砂"],
        },
        {
          id: "need_sand",
          learnyEn: "Can you say it in English?",
          learnyJa: PART1_ELICIT_JA.needSand,
          choices: ["I need sand.", "I found sand.", "I need glass.", "I made glass."],
          answer: "I need sand.",
          patterns: ["i need sand", "need sand"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 1 — use on-screen 4-choice buttons. One beat at a time. " +
        "Ask the current mcq beat (EN then ひらがな), then WAIT for the button/tap. " +
        `For phrase elicits use Japanese cue: ${PART1_ELICIT_JA.needGlass} / ${PART1_ELICIT_JA.needSand} — do NOT say Can you say, I need glass/sand. ` +
        "If wrong: soft おしい！もういちど！ Do NOT reveal the answer. If correct: praise, then next beat. " +
        "After I need sand correct: complete_segment(ch1) → Chapter 2. " +
        "FORBIDDEN: I put glass here.",
    },
    {
      id: "ch2",
      type: "choice",
      title: "砂を探しに行こう！",
      titleEn: "Let's find sand",
      goal: "場所を選んで I found some sand!",
      memoryKey: "searchPlace",
      choices: [
        { id: "beach", label: "ビーチ / beach" },
        { id: "mountains", label: "やま / mountains" },
      ],
      extraChoices: ["left", "right"],
      targets: [
        {
          id: "found_sand",
          phrase: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
        },
      ],
      mcqBeats: [
        {
          id: "place",
          learnyEn: "Let's go find some sand! Do you want to go to the beach or the mountains?",
          learnyJa: "すなを さがしに いこう！ びーちと やま、どっちに いく？",
          choices: ["beach", "mountains", "river", "forest"],
          answer: "beach",
          patterns: ["beach", "ocean", "mountains", "mountain", "やま", "ビーチ", "うみ"],
          // Either beach OR mountains is accepted via patterns; see acceptAnyOf
          acceptAnyOf: ["beach", "mountains", "ocean", "mountain", "やま", "ビーチ", "うみ"],
          memoryKey: "searchPlace",
          memoryFromChoice: true,
        },
        {
          id: "direction",
          learnyEn: "Do you want to go to the left or right?",
          learnyJa: "ひだりと みぎ、どっちに いく？",
          choices: ["left", "right", "straight", "back"],
          answer: "left",
          patterns: ["left", "right", "ひだり", "みぎ"],
          acceptAnyOf: ["left", "right", "ひだり", "みぎ"],
        },
        {
          id: "found_sand",
          learnyEn: "We found some sand! Can you say it in English?",
          learnyJa: PART1_ELICIT_JA.foundSand,
          choices: ["I found some sand!", "I need sand.", "I made glass!", "I put sand here."],
          answer: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
          completeSegmentOnCorrect: true,
          // Shown after free-talk beats 3–4 (hot / see)
          afterFreeTalk: true,
        },
      ],
      coach:
        "CHAPTER 2 order: (1) place MCQ buttons (beach/mountains OK), (2) left/right MCQ, " +
        "(3–4 FREE TALK — no buttons, REQUIRED): Is it hot outside? → What can you see around you? " +
        `After they answer see: react briefly, then speak We found some sand! Can you say it in English? / ${PART1_ELICIT_JA.foundSand} ` +
        "FORBIDDEN after left/right: jump to We found some sand. FORBIDDEN after see: Keep looking / Take your time / ゆっくり探して. " +
        "(do NOT say Can you say, I found some sand). Show found-sand MCQ. Correct → complete_segment(ch2). " +
        "Wrong MCQ: おしい！もういちど！ never reveal answer.",
    },
    {
      id: "ch3",
      type: "story",
      title: "ガラスを作ろう！",
      titleEn: "Make glass",
      goal: "I need to make glass. → I made glass!",
      targets: [
        {
          id: "need_make",
          phrase: "I need to make glass.",
          patterns: ["i need to make glass", "need to make glass", "make glass"],
        },
        {
          id: "made_glass",
          phrase: "I made glass!",
          patterns: ["i made glass", "made glass"],
        },
      ],
      mcqBeats: [
        {
          id: "need_make",
          learnyEn: "Let's make some glass!",
          learnyJa: PART1_ELICIT_JA.ch3NeedGlass,
          choices: [
            "I need to make glass.",
            "I found some sand!",
            "I need sand.",
            "I put glass here.",
          ],
          answer: "I need to make glass.",
          patterns: ["i need to make glass", "need to make glass"],
        },
        {
          id: "made_glass",
          learnyEn: "Are you done making the glass?",
          learnyJa: PART1_ELICIT_JA.ch3MadeGlass,
          choices: ["I made glass!", "I need glass.", "I found sand.", "I made a tank!"],
          answer: "I made glass!",
          patterns: ["i made glass", "made glass"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        `CHAPTER 3 — 4-choice MCQ buttons. Beat1 speak: Let's make some glass! ${PART1_ELICIT_JA.ch3NeedGlass} ` +
        "(do NOT say Can you say, I need to make glass). Correct: I need to make glass → " +
        `Beat2 speak: Are you done making the glass? ${PART1_ELICIT_JA.ch3MadeGlass} ` +
        "(do NOT say Can you say, I made glass). Correct: I made glass → complete_segment(ch3) → Mini quiz 1. " +
        "Wrong: soft retry, no answer reveal.",
    },
    {
      id: "quiz1",
      type: "quiz",
      title: "ミニクイズ1",
      titleEn: "Mini quiz 1",
      goal: "ここまでのフレーズを3問。",
      items: [
        {
          id: "q_need_glass",
          promptJa: "ガラスが必要",
          promptHira: "がらすが ひつよう",
          speak:
            "くいずたいむ！「がらすが ひつよう」は えいごで？",
          answer: "I need glass.",
          patterns: ["i need glass", "need glass"],
          choices: ["I need glass.", "I found some sand!", "I need sand.", "I made glass!"],
        },
        {
          id: "q_found_sand",
          promptJa: "砂を見つけた",
          promptHira: "すなを みつけた",
          speak:
            "じゃあ つぎは 「すなを みつけた」は えいごで？",
          answer: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
          choices: ["I found some sand!", "I need sand.", "I need glass.", "I made glass!"],
        },
        {
          id: "q_made_glass",
          promptJa: "ガラスを作った！",
          promptHira: "がらすを つくった",
          speak:
            "じゃあ つぎは 「がらすを つくった！」は えいごで？",
          answer: "I made glass!",
          patterns: ["i made glass", "made glass"],
          choices: ["I made glass!", "I need glass.", "I found some sand!", "I need to make glass."],
        },
      ],
      coach:
        "MINI QUIZ 1 — 4-choice MCQ buttons. Speak FULL Japanese ひらがな only (no English-first beginner pattern). " +
        "FIXED order, one item per turn — use each item's speak line EXACTLY: " +
        "(1) くいずたいむ！「がらすが ひつよう」は えいごで？ " +
        "(2) じゃあ つぎは 「すなを みつけた」は えいごで？ " +
        "(3) じゃあ つぎは 「がらすを つくった！」は えいごで？ " +
        "WAIT for a 4-button tap. Wrong: soft おしい！もういちど — do NOT reveal the answer. " +
        "After a correct tap: ONE short varied praise (rotate — never すごい every time) + echo the CORRECT English once, then the NEXT speak line (never repeat the same item). " +
        "FORBIDDEN: すなが ひつよう as a quiz item, inventing questions, English Which one means…, oral どっち 2-choice, walls/color. " +
        "After all 3 correct: complete_segment(quiz1) → Chapter 4 (What's your favorite color?).",
    },
    {
      id: "ch4",
      type: "scaffold",
      title: "好きな色を選ぼう",
      titleEn: "Choose a color",
      goal: "好きな色を聞いて、その色のガラスを作る。",
      memoryKey: "favoriteColor",
      ask: "What's your favorite color?",
      targets: [
        {
          id: "made_color_glass",
          phrase: "I made ___ glass.",
          patterns: ["i made", "made", "glass"],
        },
      ],
      mcqBeats: [
        {
          id: "made_color_glass",
          learnyEn: "Tell me when you make one!",
          learnyJa: "つくれたら「[colorJa]いろの がらすを つくった！」って えいごで おしえてね！",
          choices: ["I made [color] glass!", "I need a dye.", "I put glass here.", "I made a tank!"],
          answer: "I made [color] glass!",
          patterns: ["i made", "glass"],
          completeSegmentOnCorrect: true,
          afterFreeAsk: true,
        },
      ],
      coach:
        "CHAPTER 4 — Beat A1: What's your favorite color? (NO buttons). Record favoriteColor. " +
        "Beat A2 (next turn): Let's make [color] coloured glass! / [colorJa]いろの がらすを つくろう！ — ONE turn only. " +
        "Beat B (next turn): Tell me when you make one! + つくれたら「[colorJa]いろの がらすを つくった！」って えいごで おしえてね！ THEN show MCQ. " +
        "Wrong: soft retry. Correct I made [color] glass! → complete_segment(ch4). NEVER show MCQ before Beat B.",
    },
    {
      id: "ch5",
      type: "story",
      title: "水槽の壁を作ろう",
      titleEn: "Build the tank walls",
      goal: "ガラスで壁を作る。",
      targets: [
        { id: "put_glass", phrase: "I put glass here.", patterns: ["i put glass", "put glass here"] },
        {
          id: "building",
          phrase: "I'm building a tank.",
          patterns: ["im building a tank", "i am building a tank", "building a tank"],
        },
        { id: "made_tank", phrase: "I made a tank!", patterns: ["i made a tank", "made a tank"] },
        { id: "looks_good", phrase: "It looks good!", patterns: ["it looks good", "looks good"] },
      ],
      mcqBeats: [
        {
          id: "put_glass",
          learnyEn: "Now let's make a tank wall! Where do you want to put the glass? Tell me!",
          learnyJa: "すいそうの かべを つくろう！どこに がらすを おく？おけたら えいごで おしえて！",
          choices: ["I put glass here.", "I put sand here.", "I made glass!", "I need glass."],
          answer: "I put glass here.",
          patterns: ["i put glass", "put glass here"],
        },
        {
          id: "building",
          learnyEn: "Tell me what you're building!",
          learnyJa: PART1_ELICIT_JA.ch5Building,
          choices: ["I'm building a tank.", "I made a tank!", "It looks good!", "I need sand."],
          answer: "I'm building a tank.",
          patterns: ["building a tank", "im building a tank", "i am building a tank"],
        },
        {
          id: "made_tank",
          learnyEn: "Are you done making it?",
          learnyJa: PART1_ELICIT_JA.ch5MadeTank,
          choices: ["I made a tank!", "I'm building a tank.", "I put glass here.", "My tank is ready!"],
          answer: "I made a tank!",
          patterns: ["i made a tank", "made a tank"],
        },
        {
          id: "looks_good",
          learnyEn: "How does it look?",
          learnyJa: PART1_ELICIT_JA.ch5LooksGood,
          choices: ["It looks good!", "I made glass!", "I'm done!", "I need more sand."],
          answer: "It looks good!",
          patterns: ["it looks good", "looks good"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 5 — 4-choice MCQ in order: Beat1 Now let's make a tank wall! Where do you want to put the glass? Tell me! → I put glass here → " +
        "Beat2 Tell me what you're building! 「すいそうを つくってる」→ I'm building a tank → Beat3 Are you done making it? 「すいそうを つくった」→ I made a tank! → " +
        "Beat4 How does it look? 「いい かんじに できた！」→ It looks good! Wrong: soft retry, never reveal. Last correct → complete_segment(ch5).",
    },
    {
      id: "daily1",
      type: "daily_english",
      title: "突然英会話！",
      titleEn: "Daily English",
      goal: "好きな動物から始めて4ラリー以上。",
      sampleQuestions: [
        "Oh by the way, do you have a favourite animal?",
        "What's your favorite food?",
        "What time is it?",
        "What did you eat today?",
        "Do you like the ocean or the mountains?",
      ],
      completeWithoutEnglish: true,
      coach:
        "Start EXACTLY: Oh by the way, do you have a favourite animal? そういえば、[name]は すきな どうぶつとか いるの？ " +
        "FORBIDDEN: Let's practice today's English. At least 4 chat rallies (reaction + ONE question). " +
        "FORBIDDEN: favorite color / すきな いろ — already chosen in Chapter 4 (favoriteColor). " +
        "Then EXACTLY: Nice! Now let's get back to the tank! いいね！じゃあ すいそう つくりに もどろう！ " +
        "FORBIDDEN: Are you tired? / つかれた？",
    },
    {
      id: "ch6",
      type: "story",
      title: "水槽の底を作ろう",
      titleEn: "Sand on the bottom",
      goal: "底に砂。My tank is ready = 魚を迎える準備（水族館完成ではない）。",
      targets: [
        {
          id: "put_sand",
          phrase: "I put the sand on the bottom.",
          patterns: ["on the bottom", "put the sand", "put sand on the bottom", "sand on the bottom"],
        },
        { id: "more_sand", phrase: "I need more sand.", patterns: ["i need more sand", "need more sand"] },
        { id: "im_done", phrase: "I'm done!", patterns: ["im done", "i am done", "i'm done"] },
        {
          id: "tank_ready",
          phrase: "My tank is ready!",
          patterns: ["my tank is ready", "tank is ready", "my tanks is ready", "tanks is ready"],
        },
      ],
      mcqBeats: [
        {
          id: "put_sand",
          learnyEn: "Let's make a basement inside the tank!",
          learnyJa: "すいそうの そこに すなを おこう！できたら えいごで おしえてね！",
          choices: [
            "I put the sand on the bottom.",
            "I put sand here.",
            "I put glass here.",
            "I'm done!",
          ],
          answer: "I put the sand on the bottom.",
          patterns: ["on the bottom", "put the sand", "put sand on the bottom", "sand on the bottom"],
        },
        {
          id: "more_sand",
          learnyEn: "Do we have enough sand?",
          learnyJa: PART1_ELICIT_JA.ch6MoreSand,
          choices: ["I need more sand.", "I need glass.", "I'm done!", "I found some sand!"],
          answer: "I need more sand.",
          patterns: ["i need more sand", "need more sand"],
        },
        {
          id: "im_done",
          learnyEn: "Are you done?",
          learnyJa: PART1_ELICIT_JA.ch6ImDone,
          choices: ["I'm done!", "My tank is ready!", "I put sand here.", "It looks good!"],
          answer: "I'm done!",
          patterns: ["im done", "i am done", "i'm done"],
        },
        {
          id: "tank_ready",
          learnyEn: "Is the tank ready for the fishes to swim?",
          learnyJa: PART1_ELICIT_JA.ch6TankReady,
          choices: ["My tank is ready!", "I'm done!", "I need fish.", "I made a tank!"],
          answer: "My tank is ready!",
          patterns: ["my tank is ready", "tank is ready"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 6 — 4 MCQ beats: Beat1 Let's make a basement inside the tank! → I put the sand on the bottom → " +
        "Beat2 Do we have enough sand? 「もっと すなが ひつよう」→ more sand → Beat3 Are you done? 「できた！」→ I'm done! → " +
        "Beat4 Is the tank ready for the fishes to swim? 「さかなを いれられる じゅんびが できた！」→ My tank is ready! " +
        "Wrong: soft retry. Last correct → complete_segment(ch6). ZERO fish.",
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
          id: "need-glass",
          promptJa: "ガラスが必要！は英語で？",
          promptHira: "がらすが ひつよう！は えいごで？",
          promptMatch: /(?:がらす|ガラス).*(?:ひつよう|いる|必要)/,
          answer: "I need glass.",
          patterns: ["i need glass", "need glass"],
          choices: ["I need glass.", "I found glass.", "I made sand.", "I need water."],
        },
        {
          id: "found-sand",
          promptJa: "砂を見つけた！は英語で？",
          promptHira: "すなを みつけた！は えいごで？",
          promptMatch: /(?:すな|砂).*(?:みつけ|見つけ)/,
          answer: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
          choices: ["I found some sand!", "I need some sand.", "I made a tank!", "I need water."],
        },
        {
          id: "made-glass",
          promptJa: "ガラスを作った！は英語で？",
          promptHira: "がらすを つくった！は えいごで？",
          answer: "I made glass!",
          patterns: ["i made glass", "made glass"],
          choices: ["I made glass!", "I need glass.", "I found sand.", "I need water."],
        },
        {
          id: "need-more-sand",
          promptJa: "もっと砂が必要！は英語で？",
          promptHira: "もっと すなが ひつよう！は えいごで？",
          answer: "I need more sand.",
          patterns: ["i need more sand", "need more sand"],
          choices: ["I need more sand.", "I need glass.", "I'm done!", "I need water."],
        },
        {
          id: "tank-ready",
          promptJa: "魚を入れられる準備ができた！は英語で？",
          promptHira: "さかなを いれられる じゅんびが できた！は えいごで？",
          answer: "My tank is ready!",
          patterns: ["my tank is ready", "tank is ready"],
          choices: ["My tank is ready!", "I need fish.", "I'm building a tank.", "I need water."],
        },
        {
          id: "put-glass",
          promptJa: "ガラスをここに置いた！は英語で？",
          promptHira: "がらすを ここに おいた！は えいごで？",
          answer: "I put glass here.",
          patterns: ["i put glass", "put glass here"],
          choices: ["I put glass here.", "I put sand here.", "I made glass!", "I need water."],
        },
        {
          id: "building-tank",
          promptJa: "水槽を作ってる！は英語で？",
          promptHira: "すいそうを つくってる！は えいごで？",
          answer: "I'm building a tank.",
          patterns: ["building a tank", "i'm building", "i made a tank", "made a fish tank", "making a tank"],
          choices: ["I'm building a tank.", "I made a tank!", "My tank is ready!", "I need water."],
        },
        {
          id: "im-done",
          promptJa: "できた！は英語で？",
          promptHira: "できた！は えいごで？",
          answer: "I'm done!",
          patterns: ["im done", "i am done", "i'm done"],
          choices: ["I'm done!", "I'm building a tank.", "It looks good!", "I need water."],
        },
        {
          id: "looks-good",
          promptJa: "いい感じ！は英語で？",
          promptHira: "いい かんじ！は えいごで？",
          answer: "It looks good!",
          patterns: ["looks good", "it looks good", "its great", "it's great", "that's great", "thats great", "so great", "very good"],
          choices: ["It looks good!", "I'm done!", "I choose blue.", "I need water."],
        },
        {
          id: "made-red-glass",
          promptJa: "赤いガラスを作った！は英語で？",
          promptHira: "あかい がらすを つくった！は えいごで？",
          answer: "I made red glass.",
          patterns: ["i made red glass", "made red glass", "i made", "glass"],
          choices: ["I made red glass.", "I need a dye.", "I made glass!", "I need water."],
        },
      ],
      coach:
        "Open: Final challenge time! Let's go! さいごのチャレンジだよ！レッツゴー！ then IMMEDIATELY the first 〜は えいごで？ item (ひらがな only). " +
        "FORBIDDEN: Are you ready? / じゅんびは できてる？. Then ONE random item per turn from the list. " +
        "Beginner: on-screen 2–3 choices, child SAYS or taps the English answer. After ALL queued items answered → complete_segment(final1). " +
        "Say さいごの もんだい！ only when exactly ONE item remains. FORBIDDEN: inventing questions, bare は英語で？ without the listed cue phrase.",
    },
    {
      id: "ending1",
      type: "ending",
      title: "水槽の準備できた！",
      titleEn: "Tank ready — no fish yet",
      goal: "6つの短い会話：褒める→魚ゼロ→どんな魚？→何匹？→ワクワク→次回予告。",
      completeWithoutEnglish: true,
      coach:
        "CONVERSATION — one beat per turn, then WAIT for the child. Never combine beats. " +
        "1) Perfect! We made a fish tank together! Thank you for helping! → wait " +
        "2) Hold on... no fish yet! That's for next time! → wait " +
        "3) What kind of fish should we catch? → wait " +
        "4) How many do we want? → wait " +
        "5) Hmm... I can't stop thinking about it! → wait " +
        "6) Next Minecraft lesson we'll decorate and add fish! See you next time! → complete_segment(ending1). " +
        "English then ひらがな each beat. NEVER catch fish or finish the aquarium.",
    },
  ],
};
