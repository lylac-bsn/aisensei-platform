/** Intermediate Lesson 1 — Minecraft mission chain (one quest per voice call). */
export const INTERMEDIATE_LESSON_TITLE = "中級レッスン：マイクラチャレンジ";

export const INTERMEDIATE_QUESTS = [
  {
    id: 1,
    title: "クエスト1",
    titleEn: "Upgrade your base",
    goal: "きょてんを1か所よくしよう",
    hint: "例：「I want to improve my base!」→「I made it better!」",
    openingPlay:
      "今日はきょてんをパワーアップ！どこを良くするか1つ決めよう。チェスト整理でもベッドでも畑でもOK。決めたら「I want to improve my base!」って言ってみよう！",
    aiNotes: [
      "画面は見えていない前提で話す（見えているふりをしない）",
      "子どもが何を改善したか短く言えたら達成でOK",
      "英語は短文中心",
      "質問は1ターンに1つまで",
    ],
    steps: [
      {
        id: "decide_improvement",
        label: "よくする場所を決めた",
        display: "I want to improve my 〇〇!",
        spokenPhrase:
          'I want to improve my base! (an example — the child picks any spot: "I want to change my chest!", "I will make my farm better!"... anything counts. In Japanese, say the blank as「まるまる」— NEVER pronounce the symbol 〇〇)',
        patterns: [
          "I want to improve my base",
          "i want to improve",
          "i will improve",
          "i want to change",
          "i will change",
          "i want to make it better",
          "i will make it better",
          "improve my base",
          "change my chest",
          "change my bed",
          "change my farm",
        ],
        coachNote:
          "「I want to improve my base」= きょてんをよくしたい。improve（インプルーブ）= よくする、base（ベース）= きょてん",
        japaneseHints: ["よくする", "きれいに", "決めた", "チェスト", "ベッド", "畑", "整理", "直す"],
      },
      {
        id: "report_change",
        label: "何を変えたか伝えた",
        display: "I made it better!",
        patterns: [
          "I made it better",
          "made it better",
          "i made my base better",
          "I improved my base",
          "improved my base",
          "improved the base",
          "i improved it",
          "I changed this part",
          "changed this part",
          "i changed it",
          "organized my chest",
          "organized the chest",
          "cleaned my chest",
          "placed a bed",
          "put a bed",
          "made a farm",
          "built a farm",
          "placed a furnace",
        ],
        coachNote:
          "「I made it better」= もっとよくした。better（ベター）= もっといい。何を変えたか教えてね！",
        japaneseHints: ["変えた", "置いた", "作った", "整理した", "きれいにした", "できた", "直した"],
      },
    ],
  },
  {
    id: 2,
    title: "クエスト2",
    titleEn: "Craft a better tool",
    goal: "よりよい道具を1つ作ろう",
    hint: "例：「I will make a sword!」→「I made a sword!」",
    openingPlay:
      "今日はもっといい道具を作ろう！剣・ツルハシ・斧・シャベル、どれにする？決めたら「I will make a sword!」みたいに言ってみよう！",
    aiNotes: [
      "Why質問は禁止（「どっちにする？」のような2択はOK）",
      "作った物を言えたらまず褒める",
      "理由は無理に言わせない",
    ],
    steps: [
      {
        id: "choose_tool",
        label: "作る道具を決めた",
        display: "I will make a 〇〇!",
        spokenPhrase:
          'I will make a sword! (an example — sword, pickaxe, axe, shovel are all OK. In Japanese, say the blank as「まるまる」— NEVER pronounce the symbol 〇〇)',
        patterns: [
          "I will make a sword",
          "i will make a pickaxe",
          "i will make an axe",
          "i will make a shovel",
          "i will make a tool",
          "i want to make a sword",
          "i want to make a pickaxe",
          "i want to make an axe",
          "i want to make a shovel",
          "i want to make a tool",
        ],
        coachNote:
          "「I will make a sword」= 剣を作るよ。will（ウィル）= 〜するよ、make（メイク）= 作る。好きな道具でOK！",
        japaneseHints: ["剣", "ツルハシ", "斧", "シャベル", "作る", "決めた", "にする"],
      },
      {
        id: "made_tool",
        label: "作って伝えた",
        display: "I made a 〇〇!",
        spokenPhrase:
          'I made a sword! (an example — the child names the tool THEY made: sword, pickaxe, axe, shovel. In Japanese, say the blank as「まるまる」— NEVER pronounce the symbol 〇〇)',
        patterns: [
          "I made a sword",
          "I made a pickaxe",
          "I made an axe",
          "I made a shovel",
          "made a sword",
          "made a pickaxe",
          "made an axe",
          "made a shovel",
          "made a tool",
          "crafted a sword",
          "crafted a pickaxe",
          "crafted an axe",
          "crafted a shovel",
          "i need this tool",
        ],
        coachNote:
          "「I made a sword」= 剣を作った。made（メイド）= 作った。作れたら教えてね！",
        japaneseHints: ["作った", "作れた", "できた", "クラフト", "完成"],
      },
    ],
  },
  {
    id: 3,
    title: "クエスト3",
    titleEn: "Get ready for a cave",
    goal: "どうくつに行く準備をしよう",
    hint: "例：「I need torches!」「I need food!」→「I'm ready!」",
    sideChallenge: {
      id: "hidden_prep_int",
      label: "シークレットチャレンジ",
      desc: "松明と食べ物のほかに、もう1つ必要なものを英語で言う（例:「I need a sword!」）",
    },
    openingPlay:
      "どうくつ探検の準備をしよう！暗いから松明、お腹が空くから食べ物が必要だね。「I need torches!」って言ってみよう！",
    aiNotes: [
      "実際に洞窟へ行かなくても成立する（準備ベースで進める）",
      "子どもの短い報告をそのまま拾う",
      "実況しない",
    ],
    steps: [
      {
        id: "need_torches",
        label: "松明が必要と言った",
        patterns: [
          "I need torches",
          "need torches",
          "i need a torch",
          "i need torch",
          "need a torch",
          "need torch",
          "i need light",
        ],
        coachNote:
          "「I need torches」= 松明が必要。need（ニード）= 必要、torch（トーチ）= 松明。どうくつは暗いからね！",
        japaneseHints: ["松明", "たいまつ", "トーチ", "明かり", "暗い"],
      },
      {
        id: "need_food_prep",
        label: "食べ物が必要と言った",
        patterns: [
          "I need food",
          "need food",
          "i need some food",
          "need some food",
          "i need meat",
          "i need bread",
        ],
        coachNote:
          "「I need food」= 食べ物が必要。food（フード）= 食べ物。おなかが空いたら大変！",
        japaneseHints: ["食べ物", "ごはん", "お肉", "パン", "食料"],
      },
      {
        id: "ready_cave",
        label: "準備OK",
        patterns: [
          "I'm ready",
          "im ready",
          "i am ready",
          "ready to go",
          "ready now",
          "ready",
        ],
        coachNote:
          "「I'm ready」= 準備できた。ready（レディ）= 準備OK。全部そろったら言ってみよう！",
        japaneseHints: ["準備", "できた", "行くよ", "行こう", "レディ", "オッケー"],
      },
    ],
  },
  {
    id: 4,
    title: "クエスト4",
    titleEn: "Find something useful",
    goal: "役立つものを1つ見つけよう",
    hint: "例：「I found iron!」→「It's useful!」",
    openingPlay:
      "探検スタート！役に立つものを1つ探してみよう。てつでも石炭でもどうくつでも村でもOK。見つけたら「I found iron!」みたいに言ってみよう！",
    aiNotes: [
      "何を見つけたか1つ言えれば成立",
      "見えていない状況を推測しない",
      "会話を広げる時も質問は1つだけ",
    ],
    steps: [
      {
        id: "found_useful",
        label: "役立つものを見つけた",
        display: "I found 〇〇!",
        spokenPhrase:
          'I found iron! (an example — the child names what THEY found: iron, coal, a cave, a village... In Japanese, say the blank as「まるまる」— NEVER pronounce the symbol 〇〇)',
        patterns: [
          "I found iron",
          "found iron",
          "I found coal",
          "found coal",
          "I found a cave",
          "found a cave",
          "I found a village",
          "found a village",
          "i found diamonds",
          "found diamonds",
          "found something useful",
        ],
        coachNote:
          "「I found iron」= てつを見つけた。found（ファウンド）= 見つけた。見つけたものを教えてね！",
        japaneseHints: ["見つけ", "あった", "発見", "鉄", "石炭", "洞窟", "村"],
      },
      {
        id: "its_useful",
        label: "役に立つ！",
        patterns: [
          "It's useful",
          "it is useful",
          "its useful",
          "so useful",
          "very useful",
          "useful",
        ],
        coachNote:
          "「It's useful!」= これ役に立つ！useful（ユースフル）= 役に立つ。いい発見を自慢しちゃおう！",
        japaneseHints: ["役に立つ", "便利", "使える", "いいもの"],
      },
    ],
  },
  {
    id: 5,
    title: "クエスト5",
    titleEn: "Mini English report",
    goal: "英語でミニほうこくをしよう",
    hint: "例：「I made a sword!」「I found iron!」→「Next, I want to explore!」",
    hiddenBadge: { id: "hidden_report_int" },
    openingPlay:
      "ラストミッション！今日の冒険を英語でミニほうこくしよう。作ったものか見つけたものを1つ、「I made a sword!」か「I found iron!」みたいに言ってみて！",
    aiNotes: [
      "英語を教えるのは3回に2回くらい（残りは共感・応援・雑談を優先）",
      "日本語で話した時だけ重要語を英語化する",
      "長く講義しない",
    ],
    steps: [
      {
        id: "report_made_or_found",
        label: "作った/見つけたものを言う",
        display: "I made 〇〇! / I found 〇〇!",
        spokenPhrase:
          'I made a sword! or I found iron! (examples — the child reports anything THEY made or found today. In Japanese, say the blank as「まるまる」— NEVER pronounce the symbol 〇〇)',
        patterns: ["I made ...", "i made", "made", "I found ...", "i found", "found"],
        coachNote:
          "「I made ◯◯」= ◯◯を作った、「I found ◯◯」= ◯◯を見つけた。今日の冒険を思い出そう！",
        japaneseHints: ["作っ", "見つけ", "できた", "あった", "発見"],
      },
      {
        id: "next_want",
        label: "次にしたいことを言う",
        display: "Next, I want to 〇〇!",
        spokenPhrase:
          'Next, I want to explore! (an example — the child says whatever THEY want to do next: build, explore, find diamonds... anything counts. In Japanese, say the blank as「まるまる」— NEVER pronounce the symbol 〇〇)',
        patterns: [
          "Next, I want to ...",
          "next i want to",
          "i want to",
          "want to",
          "i will",
          "i'm going to",
        ],
        coachNote:
          "「Next, I want to explore」= 次は探検したい。next（ネクスト）= 次に。次の冒険を教えてね！",
        japaneseHints: ["したい", "やりたい", "つぎは", "今度", "次"],
      },
    ],
  },
];
