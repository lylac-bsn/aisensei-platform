/** Homework lesson: aquarium Part 2 (week-3 review: decorations, fish, put fish in tank). */

/** Japanese phrase elicits — phrase MUST be inside 「」 then の えいごを 選んでね！ */
export const PART2_ELICIT_JA = {
  ch1PutKelp: "「ここに こんぶを おいた」の えいごを 選んでね！",
  ch1PutCoral: "「ここに さんごを おいた」の えいごを 選んでね！",
  ch1ChooseThis: "「これを えらぶ」の えいごを 選んでね！",
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
  ch5FishCount: "「おさかなが [N]ひき いる」の えいごを 選んでね！",
  ch5ThreeFish: "「おさかなが 3びき いる」の えいごを 選んでね！",
  ch5FiveFish: "「おさかなが 5ひき いる」の えいごを 選んでね！",
};

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
  badges: [],
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
        "Natural human chat, not a quiz and not a robot. Opening ONCE: Hello! How are you today? こんにちは！きょうは どうですか？ — never say How are you twice. " +
        "ONE question per turn — always WAIT. After mood (good/fine/ok): That's great! What did you do today? よかった！きょうは なにを したの？ — NOT Thank you. " +
        "After 3+ real chat exchanges, ONE invite turn: warm short reaction to their last line + Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together! — " +
        "e.g. Okay! Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together! " +
        "そっか！そうだ！このまえ まいんくらふとで つくった すいぞくかん、おぼえてる？いっしょに おもいだしてみよう！ " +
        "After the invite, ANY child reply (yes/no/ok/anything) → call complete_segment(ch0) immediately.",
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
        "CHAPTER 1 — use on-screen 4-choice buttons. One beat at a time. " +
        "Ask the current mcq beat (EN then ひらがな), then WAIT for the button/tap. " +
        "For phrase elicits use Japanese cue inside 「」 — do NOT say the English answer aloud. " +
        "If wrong: soft おしい！もういちど！ Do NOT reveal the answer. If correct: praise, then next beat. " +
        "After It looks cool! correct: complete_segment(ch1) → Chapter 2.",
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
        "CHAPTER 2 — use on-screen 4-choice buttons. One beat at a time. " +
        "Ask the current mcq beat (EN then ひらがな), then WAIT for the button/tap. " +
        "For phrase elicits use Japanese cue inside 「」 — do NOT say the English answer aloud. " +
        "If wrong: soft おしい！もういちど！ Do NOT reveal the answer. If correct: praise, then next beat. " +
        "After I choose this fish. correct: complete_segment(ch2) → Chapter 3.",
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
        "CHAPTER 3 — use on-screen 4-choice buttons. Two beats only. " +
        "Ask the current mcq beat (EN then ひらがな), then WAIT for the button/tap. " +
        "For phrase elicits use Japanese cue inside 「」 — do NOT say the English answer aloud. " +
        "If wrong: soft おしい！もういちど！ Do NOT reveal the answer. If correct: praise, then next beat. " +
        "After I have a fish! correct: complete_segment(ch3) → Mini quiz 1.",
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
        "MINI QUIZ 1 — 4-choice MCQ buttons. Speak FULL Japanese ひらがな only (no English-first beginner pattern). " +
        "FIXED order, one item per turn — use each item's speak line EXACTLY word-by-word: " +
        "(1) くいずたいむ！「ここに さんごを おいた」は えいごで？ " +
        "(2) じゃあ つぎは「この おさかなが ほしい」は えいごで？ " +
        "(3) じゃあ つぎは「おさかなを つかまえた！」は えいごで？ " +
        "WAIT for a 4-button tap. Wrong: soft おしい！もういちど — do NOT reveal the answer. " +
        "After a correct tap: ONE short varied praise + echo the CORRECT English once, then the NEXT speak line. " +
        "After all 3 correct: complete_segment(quiz1) → Chapter 4.",
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
        "CHAPTER 4 — use on-screen 4-choice buttons. Three beats. " +
        "Ask the current mcq beat (EN then ひらがな), then WAIT for the button/tap. " +
        "For phrase elicits use Japanese cue inside 「」 — do NOT say the English answer aloud. " +
        "If wrong: soft おしい！もういちど！ Do NOT reveal the answer. If correct: praise, then next beat. " +
        "After Look! There's a fish! correct: complete_segment(ch4) → DAILY ENGLISH.",
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
        "Start EXACTLY: Oh by the way, [name], what did you eat today? そういえば、[name]さんは きょう なにを たべたの？ " +
        "FORBIDDEN: Let's practice today's English. At least 4 NATURAL chat rallies. " +
        "Each turn: react to their exact words (vary the reaction), stay on their topic 1–2 turns, ask ONE follow-up about THAT, then WAIT. " +
        "FORBIDDEN: re-asking facts they already answered; abrupt topic jumps with no bridge. " +
        "Then ONE turn: FIRST short specific reaction naming their last words, " +
        "THEN EXACTLY: Nice! Now let's get back to your aquarium! いいね！じゃあ すいぞくかんの はなしに もどろう！ " +
        "Finish speaking before complete_segment(daily1). " +
        "FORBIDDEN: Are you tired? / つかれた？ / favorite color.",
    },
    {
      id: "ch5",
      type: "mixed",
      title: "魚は何匹いた？",
      titleEn: "How many fish?",
      goal: "魚の数を聞いて、動的MCQ → There are [N] fish → 固定 three/five fish ビート。",
      memoryKey: "fishCount",
      askFishCount: true,
      targets: [
        { id: "fish_count", phrase: "There are [N] fish.", patterns: ["there are", "there is", "fish"] },
        { id: "three_fish", phrase: "There are three fish.", patterns: ["there are three fish", "three fish"] },
        { id: "five_fish", phrase: "There are five fish.", patterns: ["there are five fish", "five fish"] },
      ],
      mcqBeats: [
        {
          id: "fish_count_dynamic",
          learnyEn: "You had [fishCount] fish!",
          learnyJa: "「おさかなが [fishCount]ひき いる」の えいごを 選んでね！",
          choices: ["There are [fishCount] fish.", "There are [fishCountMinus1] fish.", "There are [fishCountPlus1] fish.", "There is [fishCount] fish."],
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
        },
        {
          id: "five_fish",
          learnyEn: "How about five fish?",
          learnyJa: PART2_ELICIT_JA.ch5FiveFish,
          choices: ["There are five fish.", "There is five fish.", "I have five glass.", "I found five sand."],
          answer: "There are five fish.",
          patterns: ["there are five fish", "five fish"],
          completeSegmentOnCorrect: true,
        },
      ],
      coach:
        "CHAPTER 5 — MIXED format with FREE ASK then MCQ. " +
        "Beat A1 (NO BUTTONS): Speak EXACTLY: Do you remember how many fish were in your tank? " +
        "すいそうに おさかなが なんびき いたか おぼえてる？ Then WAIT. " +
        "Record their answer as fishCount (1, 2, 3, 4, 5, etc.). Accept numbers in any form. " +
        "If they don't remember: That's okay! About how many do you think there were? " +
        "だいじょうぶ！だいたい なんびき くらいだったと おもう？ " +
        "After they give a number → record_memory(fishCount, N) → Beat A2 dynamic MCQ: " +
        "Show 4 choices with their number (e.g., There are four fish.). " +
        "If fishCount=1: correct is 'There is one fish.' — use singular. " +
        "After correct → Beat A3: How about three fish? → Then Beat A4: How about five fish? " +
        "After five fish correct: complete_segment(ch5) → Chapter 6.",
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
        "CHAPTER 6 — Teacher questions as MCQ. Five beats. " +
        "Ask the current mcq beat (EN then ひらがな), then WAIT for the button/tap. " +
        "These are QUESTION recognition beats — the child picks which English question matches the Japanese meaning. " +
        "If wrong: soft おしい！もういちど！ Do NOT reveal the answer. If correct: praise, then next beat. " +
        "After Do you like your aquarium? correct: complete_segment(ch6) → Final Challenge.",
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
          promptJa: "これを えらぶ！は英語で？",
          promptHira: "これを えらぶ！は えいごで？",
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
        "Open: Final challenge time! Let's go! さいごの ちゃれんじだよ！れっつごー！ then IMMEDIATELY the first 〜は えいごで？ item (ひらがな only). " +
        "FORBIDDEN: Are you ready? / じゅんびは できてる？. Then ONE random item per turn from the list. " +
        "Beginner: on-screen 4 choices, child taps the English answer. After ALL queued items answered → complete_segment(final1). " +
        "Say さいごの もんだい！ only when exactly ONE item remains. FORBIDDEN: inventing questions, bare は英語で？ without the listed cue phrase.",
    },
    {
      id: "ending1",
      type: "ending",
      title: "水族館を思い出せた！",
      titleEn: "Remembered your aquarium",
      goal: "ターンA → ターンB → ターンC → 自動切断。フリートークなし。",
      completeWithoutEnglish: true,
      autoDisconnect: true,
      noFreeTalk: true,
      coach:
        "ENDING — Part 2 has THREE FIXED TURNS only, then auto-disconnect. NO free-talk. " +
        "Turn A: Perfect! You remembered a lot about your aquarium! / " +
        "ぱーふぇくと！このまえの すいぞくかんのこと、たくさん おもいだせたね！ " +
        "You remembered the decorations and the fish too! / かざりも おさかなも おもいだせたね！ " +
        "Turn B: Your teacher might ask you some of the same questions next time! / " +
        "つぎの レッスンで せんせいが おなじ しつもんを するかもしれないよ！ " +
        "You'll be ready! / これで ばっちりだね！ " +
        "Turn C: If you play Minecraft again, try using today's English too! See you next time! / " +
        "つぎに まいんくらふとで あそぶときも、きょうの えいごを つかってみてね！また ね！ " +
        "After Turn C: call complete_segment(ending1) → auto-disconnect immediately. " +
        "FORBIDDEN: free-talk / 終わりにする button / asking about fish count / additional questions.",
    },
  ],
};
