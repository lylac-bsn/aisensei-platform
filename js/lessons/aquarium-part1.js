/** Homework lesson: aquarium Part 1 (week-2 review of week-1 tank prep). No fish. */

export const AQUARIUM_PART1 = {
  id: "part1",
  title: "魚を迎える準備をしよう！",
  titleEn: "Get the tank ready",
  weekNote: "Week 2 homework — after the week-1 in-person class.",
  stopRule:
    "Never catch fish, never finish an aquarium. End with tank ready and NO fish.",
  badges: [
    {
      id: "sand_finder",
      label: "Sand Finder",
      desc: "砂を見つける英語が言えた",
      afterSegment: "ch2",
    },
    {
      id: "glass_maker",
      label: "Glass Maker",
      desc: "ガラスを作る英語が言えた",
      afterSegment: "ch3",
    },
    {
      id: "color_designer",
      label: "Color Designer",
      desc: "好きな色のガラスが言えた",
      afterSegment: "ch5",
    },
    {
      id: "tank_builder",
      label: "Tank Builder",
      desc: "水槽の準備ができた",
      afterSegment: "ch6",
    },
    {
      id: "quick_answer_p1",
      label: "Quick Answer",
      desc: "突然の日常英会話に答えた",
      afterSegment: "daily1",
    },
    {
      id: "english_talker_p1",
      label: "English Speaker",
      desc: "英語のフレーズをたくさん言えた",
      minPhrases: 8,
    },
  ],
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
        "Natural chat, not a quiz. Opening: How are you today? only. ONE question per turn — always WAIT for the child. After 2+ chat exchanges, a SEPARATE turn for tank invite: Oh! Today I want to make a fish tank. Will you help me make it? JP (ひらがな): そうだ！きょうは らーにーせんせいの すいそうづくりを てつだってほしいんだ。いっしょに つくれる？ FORBIDDEN: everyday question + tank invite in the same turn. After yes/ok: call complete_segment(ch0) — do NOT ask about glass/sand until Chapter 1.",
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
      coach:
        "Step 1 FIRST (never skip): What do I need to make a tank? Something transparent and hard → glass → then Can you say I need glass? " +
        "Step 2 ONLY after I need glass: To make glass in Minecraft, what do we need? → sand → Can you say I need sand? " +
        "Never open Ch1 with Can you say I need glass. Never ask glass or sand together. " +
        "FORBIDDEN in Ch1: I put glass here, ガラスを置きたい — that is a later chapter.",
    },
    {
      id: "ch2",
      type: "choice",
      title: "砂を探しに行こう！",
      titleEn: "Let's find sand",
      goal: "場所を選んで I found some sand!",
      memoryKey: "searchPlace",
      choices: [
        { id: "beach", label: "ビーチ / ocean" },
        { id: "river", label: "川 / river" },
      ],
      extraChoices: ["left", "right"],
      targets: [
        {
          id: "found_sand",
          phrase: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
        },
      ],
      coach:
        "Learny cannot see the screen. beach/river (record searchPlace) → left/right → Let me know when you find sand! " +
        "MANDATORY ~3 everyday chat turns while searching (ocean or mountains? can you hear the waves? hot? what do you see?) — do NOT skip to Have you found sand? early. " +
        "After 3 chats: Have you found sand yet? When child says yes/うん/みつけた: praise → I found some sand! in English → only then complete_segment(ch2). " +
        "FORBIDDEN before English phrase: We have sand / すながある. FORBIDDEN: put sand in tank / on the bottom (Ch6). Next after Ch2 is Ch3 make glass. " +
        "If child says not yet / まだ: ask a NEW everyday question — never repeat Let me know when you find sand.",
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
      coach:
        "Step 1: Child found sand in Ch2. Praise briefly, then what do we do with sand to make glass? → I need to make glass. Hint furnace if stuck. Learny can't see screen — Let me know when you're done! " +
        "Never say We have sand if the child is still searching. " +
        "Step 2: Child says I made glass! → praise → call complete_segment(ch3) immediately. Next is Mini quiz 1 — do NOT teach I put glass here yet (that is Chapter 4 after the quiz).",
    },
    {
      id: "quiz1",
      type: "quiz",
      title: "ミニクイズ1",
      titleEn: "Mini quiz 1",
      goal: "ここまでのフレーズを3〜5問。",
      items: [
        {
          promptJa: "ガラスが必要",
          answer: "I need glass.",
          patterns: ["i need glass", "need glass"],
          choices: ["I need glass.", "I found glass.", "I made sand."],
        },
        {
          promptJa: "砂を見つけた！",
          answer: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
          choices: ["I found some sand!", "I need some sand.", "I made a tank!"],
        },
        {
          promptEn: "Which one means “I need sand”?",
          answer: "I need sand.",
          patterns: ["i need sand", "need sand"],
          choices: ["I need sand.", "I need glass.", "I found a fish."],
        },
        {
          promptJa: "“I made glass!” はどういう意味？",
          answer: "ガラスを作った",
          acceptAny: true,
          speakAfter: "I made glass!",
          patterns: ["i made glass", "made glass", "ガラス"],
        },
      ],
      coach:
        "Use ONLY these quiz prompts (one at a time): ガラスが必要→I need glass / 砂を見つけた→I found some sand! / I need sand?→I need sand / I made glass! meaning→ガラスを作った then say I made glass! " +
        "Beginner: 2-choice then SAY the English. Japanese OK for meaning — praise, model English, next item. " +
        "FORBIDDEN: made-up questions (sand color, etc.). After 3–4 items: complete_segment(quiz1). Always lead to the NEXT quiz item — never go silent.",
    },
    {
      id: "ch4",
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
      coach:
        "Build walls with glass. Let them choose where / what shape. Use I put glass here, I'm building a tank, I made a tank!, It looks good!",
    },
    {
      id: "ch5",
      type: "scaffold",
      title: "好きな色を選ぼう",
      titleEn: "Choose a color",
      goal: "子どもの好きな色をストーリーに使う。blueに固定しない。",
      memoryKey: "favoriteColor",
      ask: "What color do you like?",
      targets: [
        { id: "need_dye", phrase: "I need a dye.", patterns: ["i need a dye", "need a dye", "need dye"] },
        { id: "found_flower", phrase: "I found a flower!", patterns: ["i found a flower", "found a flower"] },
        {
          id: "choose_color",
          phrase: "I choose ___.",
          patterns: ["i choose", "i chose", "choose"],
        },
        {
          id: "made_color_glass",
          phrase: "I made ___ glass.",
          patterns: ["i made", "made", "glass"],
        },
        {
          id: "like_color",
          phrase: "I like this color.",
          patterns: ["i like this color", "like this color", "favorite color"],
        },
      ],
      coach:
        "Ask What color do you like? Record favoriteColor from the child. NEVER assume blue. Use that color in I choose X / I made X glass. Also I need a dye, I found a flower!, I like this color / This is my favorite color.",
    },
    {
      id: "daily1",
      type: "daily_english",
      title: "突然英会話！",
      titleEn: "Daily English",
      goal: "Minecraftから離れて2〜4問。",
      sampleQuestions: [
        "What's your favorite food?",
        "What time is it?",
        "Are you tired?",
        "What did you eat today?",
        "Do you like the ocean or the mountains?",
        "What's your favorite animal?",
      ],
      completeWithoutEnglish: true,
      coach:
        "Leave the tank story. Ask 2–4 everyday questions (not the same list every time). Expand one answer if natural. Then: Nice! Back to the tank.",
    },
    {
      id: "ch6",
      type: "story",
      title: "水槽の底を作ろう",
      titleEn: "Sand on the bottom",
      goal: "底に砂。My tank is ready = 魚を迎える準備（水族館完成ではない）。",
      targets: [
        { id: "put_sand", phrase: "I put sand here.", patterns: ["i put sand here", "put sand here"] },
        {
          id: "bottom",
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
      coach:
        "Put sand on the bottom. One phrase at a time: I put sand here → on the bottom → I need more sand (optional) → I'm done! (sand step done) → My tank is ready! (ready for fish later — NOT aquarium finished; ZERO fish). When child says I'm done! after you asked: praise only — NEVER Almost or おしい. Do NOT invent I need water.",
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
          promptJa: "ガラスがいる！は英語で？",
          promptHira: "がらすが いる！は えいごで？",
          answer: "I need glass.",
          patterns: ["i need glass", "need glass"],
          choices: ["I need glass.", "I found glass.", "I made sand."],
        },
        {
          promptJa: "砂を見つけた！は英語で？",
          promptHira: "すなを みつけた！は えいごで？",
          answer: "I found some sand!",
          patterns: ["i found some sand", "found some sand", "found sand"],
          choices: ["I found some sand!", "I need some sand.", "I made a tank!"],
        },
        {
          promptJa: "ガラスを作った！は英語で？",
          promptHira: "がらすを つくった！は えいごで？",
          answer: "I made glass!",
          patterns: ["i made glass", "made glass"],
          choices: ["I made glass!", "I need glass.", "I found sand."],
        },
        {
          promptJa: "もっと砂が必要！は英語で？",
          promptHira: "もっと すなが ひつよう！は えいごで？",
          answer: "I need more sand.",
          patterns: ["i need more sand", "need more sand"],
          choices: ["I need more sand.", "I need glass.", "I'm done!"],
        },
        {
          promptJa: "魚を入れられる準備ができた！は英語で？",
          promptHira: "さかなを いれられる じゅんびが できた！は えいごで？",
          answer: "My tank is ready!",
          patterns: ["my tank is ready", "tank is ready"],
          choices: ["My tank is ready!", "I need fish.", "I'm building a tank."],
        },
        {
          promptJa: "ガラスをここに置いた！は英語で？",
          promptHira: "がらすを ここに おいた！は えいごで？",
          answer: "I put glass here.",
          patterns: ["i put glass", "put glass here"],
          choices: ["I put glass here.", "I put sand here.", "I made glass!"],
        },
        {
          promptJa: "水槽を作ってる！は英語で？",
          promptHira: "すいそうを つくってる！は えいごで？",
          answer: "I'm building a tank.",
          patterns: ["building a tank", "i'm building", "i made a tank", "made a fish tank", "making a tank"],
          choices: ["I'm building a tank.", "I made a tank!", "My tank is ready!"],
        },
        {
          promptJa: "できた！は英語で？",
          promptHira: "できた！は えいごで？",
          answer: "I'm done!",
          patterns: ["im done", "i am done", "i'm done"],
          choices: ["I'm done!", "I'm building a tank.", "It looks good!"],
        },
        {
          promptJa: "いい感じ！は英語で？",
          promptHira: "いい かんじ！は えいごで？",
          answer: "It looks good!",
          patterns: ["looks good", "it looks good", "its great", "it's great", "that's great", "thats great", "so great", "very good"],
          choices: ["It looks good!", "I'm done!", "I choose blue."],
        },
        {
          promptJa: "好きな色を選ぶ！は英語で？",
          promptHira: "すきな いろを えらぶ！は えいごで？",
          answer: "I choose ___.",
          patterns: ["i choose", "i chose"],
          choices: ["I choose blue.", "I need a dye.", "I made glass!"],
        },
      ],
      coach:
        "Open: Final challenge time! さいごの チャレンジだよ！ Then ONE random 〜は えいごで？ item at a time from the list (ひらがな only when speaking Japanese). " +
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
