/** Advanced Lesson 1 — English-only Minecraft mission chain (one quest per voice call). */
export const ADVANCED_LESSON_TITLE = "上級レッスン：英語チャレンジ";

export const ADVANCED_QUESTS = [
  {
    id: 1,
    title: "クエスト1",
    titleEn: "Tell me about your base",
    goal: "自分のきょてんについて英語で話そう",
    hint: "例：「This is my base!」→「I like this part!」",
    openingPlay:
      "きょてんの好きな場所を1つ選んで、英語でしょうかいしよう！「This is my base!」って言ってみよう！",
    aiNotes: [
      "返答は英語100%（日本語は使わない）",
      "翻訳や文法説明はしない",
      "会話が続くように1つだけ質問を返す",
      "明るく短めに返す",
    ],
    steps: [
      {
        id: "this_is_my",
        label: "場所をしょうかいした",
        display: "This is my 〇〇!",
        spokenPhrase:
          'This is my base! (an example — the child introduces any spot: base, room, farm, area... NEVER pronounce the symbol 〇〇)',
        patterns: [
          "This is my base",
          "this is my room",
          "this is my farm",
          "this is my area",
          "this is my house",
          "this is my",
        ],
        coachNote:
          "「This is my base」= これが私のきょてん。好きな場所を英語でしょうかいしよう！",
      },
      {
        id: "about_it",
        label: "それについて話した",
        display: "I like this part! / I built this area!",
        spokenPhrase:
          'I like this part! or I built this area! (examples — one more sentence about the spot)',
        patterns: [
          "I like this part",
          "i like this",
          "i like it",
          "i like my",
          "I built this area",
          "built this area",
          "i built this",
          "i built it",
          "i made this",
        ],
        coachNote:
          "「I like this part」= ここが好き、「I built this area」= ここを作った。もうひとこと教えてね！",
      },
    ],
  },
  {
    id: 2,
    title: "クエスト2",
    titleEn: "Report your best loot",
    goal: "今日のいちばん良かったせんりひんを英語でほうこくしよう",
    hint: "例：「I got diamonds!」→「It was useful!」",
    sideChallenge: {
      id: "hidden_diamond_adv",
      label: "シークレットチャレンジ",
      desc: "今日のベストせんりひんがダイヤモンドだったら…？（例:「I got diamonds!」）",
    },
    openingPlay:
      "今日のベストせんりひんはなに？いちばん良かったアイテムを1つ決めて、「I got diamonds!」みたいに英語でほうこくしよう！",
    aiNotes: [
      "意味が通じるなら止めずに進める",
      "講義しない（テンポ優先）",
      "次につながる返しをする",
    ],
    steps: [
      {
        id: "best_loot",
        label: "ベストせんりひんを言った",
        display: "I got 〇〇!",
        spokenPhrase:
          'I got diamonds! or My best loot was iron! (examples — the child names THEIR best loot today. NEVER pronounce the symbol 〇〇)',
        patterns: [
          "I got diamonds",
          "i got diamond",
          "I got iron",
          "i got gold",
          "i got emeralds",
          "my best loot was iron",
          "my best loot was",
          "my best loot is",
          "i got",
          "i found",
        ],
        coachNote:
          "「I got diamonds」= ダイヤをゲットした、「My best loot was iron」= ベストせんりひんはてつ。今日のいちばんを教えて！",
      },
      {
        id: "why_good",
        label: "よかった理由を言った",
        display: "It was useful!",
        spokenPhrase:
          'It was useful! or I needed it! (examples — one short reason why it was good)',
        patterns: [
          "It was useful",
          "it's useful",
          "its useful",
          "i needed it",
          "i need it",
          "it was good",
          "it was great",
          "it was awesome",
          "it helps me",
          "it was helpful",
          "so useful",
        ],
        coachNote:
          "「It was useful!」= 役に立った、「I needed it!」= 必要だった。理由をひとことで！",
      },
    ],
  },
  {
    id: 3,
    title: "クエスト3",
    titleEn: "Plan your next move",
    goal: "次にすることを英語で決めよう",
    hint: "例：「My goal is to find diamonds!」→「Next, I want to explore!」",
    sideChallenge: {
      id: "hidden_question_adv",
      label: "シークレットチャレンジ",
      desc: "英語でラーニー先生にしつもんしてみよう（例:「What should I do next?」）",
    },
    openingPlay:
      "次の作戦会議！次の目標を1つ決めて、「My goal is to find diamonds!」みたいに英語で言ってみよう！",
    aiNotes: [
      "Why質問は禁止",
      "質問は1ターンに1つまで",
      "相手が話したくなる空気を優先する",
      "返答は英語100%",
    ],
    steps: [
      {
        id: "next_goal",
        label: "次の目標を決めた",
        display: "My goal is 〇〇!",
        spokenPhrase:
          'My goal is to find diamonds! (an example — any goal counts. NEVER pronounce the symbol 〇〇)',
        patterns: ["My goal is ...", "my goal is", "my goal was", "goal is", "my next goal"],
        coachNote:
          "「My goal is ◯◯」= 目標は◯◯。goal（ゴール）= 目標。次の目標を決めよう！",
      },
      {
        id: "next_action",
        label: "次にやることを言った",
        display: "Next, I want to 〇〇!",
        spokenPhrase:
          'Next, I want to explore a cave! or I think I need food! (examples — what they will do next. NEVER pronounce the symbol 〇〇)',
        patterns: [
          "Next, I want to ...",
          "next i want to",
          "i want to",
          "i think i need",
          "i will",
          "i'm going to",
        ],
        coachNote:
          "「Next, I want to explore」= 次は探検したい。次の一歩を英語で言ってみよう！",
      },
    ],
  },
  {
    id: 4,
    title: "クエスト4",
    titleEn: "Share a danger moment",
    goal: "あぶなかった場面を英語で話そう",
    hint: "例：「I saw an enemy!」→「It was dangerous!」",
    sideChallenge: {
      id: "hidden_feeling_adv",
      label: "シークレットチャレンジ",
      desc: "そのときのきもちを英語で言ってみよう（例:「I was scared!」）",
    },
    openingPlay:
      "冒険にはドキドキがつきもの！あぶなかった場面を1つ思い出して、「I saw an enemy!」みたいに何が起きたか英語で教えて！",
    aiNotes: [
      "共感・応援を優先（こわさを笑わない）",
      "会話を止めずに次の一歩につなげる",
      "返答は英語100%",
    ],
    steps: [
      {
        id: "what_happened",
        label: "何が起きたか言った",
        display: "I saw an enemy!",
        spokenPhrase:
          'I saw an enemy! or I almost fell! or It was dark! (examples — what happened in the danger moment)',
        patterns: [
          "I saw an enemy",
          "saw an enemy",
          "i saw a zombie",
          "i saw a creeper",
          "i saw a skeleton",
          "i saw a monster",
          "I almost fell",
          "almost fell",
          "i fell",
          "It was dark",
          "it was so dark",
          "an enemy attacked me",
          "a creeper exploded",
          "i almost died",
        ],
        coachNote:
          "「I saw an enemy」= 敵を見た、「I almost fell」= 落ちそうになった。何が起きたか教えて！",
      },
      {
        id: "danger_reaction",
        label: "どうだったか言った",
        display: "It was dangerous!",
        spokenPhrase:
          'It was dangerous! or I went back! (examples — how it felt or what they did)',
        patterns: [
          "It was dangerous",
          "so dangerous",
          "dangerous",
          "I went back",
          "went back",
          "i ran away",
          "i ran",
          "i escaped",
        ],
        coachNote:
          "「It was dangerous!」= あぶなかった！、「I went back!」= 引き返した。どうなったか教えて！",
      },
    ],
  },
  {
    id: 5,
    title: "クエスト5",
    titleEn: "English-only challenge",
    goal: "英語だけでミニ会話しよう",
    hint: "例：「I built a house!」「I explored a cave!」→「Next, I want to explore more!」",
    hiddenBadge: { id: "hidden_english_adv" },
    openingPlay:
      "ファイナルミッション、英語オンリーチャレンジ！今日したことを1つ、「I built a house!」か「I explored a cave!」みたいに英語で言ってみよう！",
    aiNotes: [
      "返答は1〜3文",
      "短く褒める",
      "会話が続くように1質問だけ返す",
      "日本語は使わない",
    ],
    steps: [
      {
        id: "did_today",
        label: "今日したことを言う",
        display: "I built 〇〇! / I explored 〇〇!",
        spokenPhrase:
          'I built a house! or I explored a cave! (examples — anything the child did today. NEVER pronounce the symbol 〇〇)',
        patterns: [
          "I built ...",
          "i built",
          "I explored ...",
          "i explored",
          "i explore",
          "i made",
          "i found",
        ],
        coachNote:
          "「I built ◯◯」= ◯◯を建てた、「I explored ◯◯」= ◯◯を探検した。今日の冒険をひとことで！",
      },
      {
        id: "want_next",
        label: "次にしたいことを言う",
        display: "Next, I want to 〇〇!",
        spokenPhrase:
          'Next, I want to explore more! (an example — anything they want to do next. NEVER pronounce the symbol 〇〇)',
        patterns: [
          "Next, I want to ...",
          "next i want to",
          "i want to",
          "want to",
          "i will",
          "i'm going to",
        ],
        coachNote:
          "「Next, I want to ◯◯」= 次は◯◯したい。次の冒険プランを言ってみよう！「Let's do it!」で締めてもかっこいい！",
      },
    ],
  },
];
