/**
 * Homework lesson: aquarium Part 3 — Presentation Practice (beginner).
 * Script source: learnie_aquarium_quest_part3.md — keep both in sync.
 *
 * Beats use `part3Beats` / `part3Sets` (not `mcqBeats`) so the Part 1/2 MCQ
 * runtime never picks them up. Tokens in {braces} are resolved from the
 * learner's Chapter 0 answers via resolvePart3Text().
 */

export const PART3_GLASS_COLORS = Object.freeze([
  "blue",
  "red",
  "green",
  "yellow",
  "orange",
  "pink",
  "purple",
  "white",
]);

export const PART3_FISH_COLORS = Object.freeze([
  "blue",
  "orange",
  "red",
  "yellow",
  "pink",
  "purple",
  "white",
  "green",
]);

/** Chapter 0 Beat 2 buttons. */
export const PART3_DECORATION1_CHOICES = Object.freeze([
  "Coral",
  "Red Coral",
  "Pink Coral",
  "Blue Coral",
  "Yellow Coral",
  "Kelp",
  "Amethyst",
  "Soul Sand",
]);

/** Chapter 0 Beat 3 pool — decoration1 is removed, leaving 8 buttons. */
export const PART3_DECORATION2_POOL = Object.freeze([
  "Coral",
  "Red Coral",
  "Pink Coral",
  "Purple Coral",
  "Blue Coral",
  "Yellow Coral",
  "Kelp",
  "Amethyst",
  "Soul Sand",
]);

export const PART3_FISH_CHOICES = Object.freeze([
  "Cod",
  "Salmon",
  "Tropical Fish",
  "Puffer Fish",
]);

/** Chapter 0 Beat 4 distractors — existing Part 3 aquarium items, never saved. */
export const PART3_FISH_DISTRACTORS = Object.freeze([
  "Coral",
  "Kelp",
  "Amethyst",
  "Soul Sand",
]);

/** ひらがな adjectives for 「[color] がらす」 / 「[color] ねったいぎょ」. */
export const PART3_COLOR_JA = Object.freeze({
  blue: "あおい",
  red: "あかい",
  green: "みどりの",
  yellow: "きいろい",
  orange: "おれんじの",
  pink: "ぴんくの",
  purple: "むらさきの",
  white: "しろい",
});

export const PART3_DECORATION_JA = Object.freeze({
  coral: "さんご",
  "red coral": "あかい さんご",
  "pink coral": "ぴんくの さんご",
  "purple coral": "むらさきの さんご",
  "blue coral": "あおい さんご",
  "yellow coral": "きいろい さんご",
  kelp: "こんぶ",
  amethyst: "あめじすと",
  "soul sand": "そうるさんど",
});

export const PART3_FISH_JA = Object.freeze({
  cod: "たら",
  salmon: "さけ",
  "puffer fish": "ふぐ",
  "tropical fish": "ねったいぎょ",
});

export const PART3_RETRY_SPEAK = "おしい！もういちど！";

/** Reaction phrases — one per finished section, never all at once. */
export const PART3_REACTIONS = Object.freeze([
  { en: "That looks great!", ja: "みためが いいね！" },
  { en: "That's cool!", ja: "すごいね！かっこいい！" },
  { en: "So creative!", ja: "はっそうが すごいね！" },
  { en: "Nice one!", ja: "いいね！" },
]);

export const PART3_ENDING_TURNS = Object.freeze([
  "Great job! You practiced your whole presentation! ぐれーと じょぶ！さいしょから さいごまで れんしゅう できたね！",
  "You talked about your glass, decorations, and fish! がらすも かざりも おさかなも えいごで いえたね！",
  "Now you're ready to show your aquarium to your teacher! Good luck! これで せんせいの まえでも はっぴょう できるね！がんばってね！",
]);

const CH6_INTRO_EN = "Let's say these two sentences together!";
const CH6_INTRO_JA = "この 2つを つづけて いってみよう！";

/** Full presentation (Final Challenge) — `blank` is hidden on round 2. */
const PRESENTATION_LINES = Object.freeze([
  { text: "I'm {name}.", blank: "" },
  { text: "This is my aquarium.", blank: "aquarium" },
  { text: "I chose {glassColor} glass.", blank: "glass" },
  { text: "I put {decoration1} here.", blank: "{decoration1}" },
  { text: "I put {decoration2} here.", blank: "{decoration2}" },
  { text: "I chose {presentationFishWithArticle}.", blank: "{fishBlank}" },
  { text: "I like this fish.", blank: "fish" },
]);

function lineRange(from, to) {
  return PRESENTATION_LINES.slice(from, to).map((line) => ({ ...line }));
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

export function part3Article(nounPhrase) {
  return /^[aeiou]/i.test(String(nounPhrase || "").trim()) ? "an" : "a";
}

/** `blue tropical fish` → `a blue tropical fish`; `orange …` → `an orange …`. */
export function part3PresentationFishWithArticle(presentationFish) {
  const fish = lower(presentationFish);
  if (!fish) return "";
  return `${part3Article(fish)} ${fish}`;
}

export function part3PresentationFishJa(memories = {}) {
  const fishType = lower(memories.fishType);
  if (fishType === "tropical fish") {
    const color = PART3_COLOR_JA[lower(memories.fishColor)] || "";
    return `${color} ${PART3_FISH_JA["tropical fish"]}`.trim();
  }
  return PART3_FISH_JA[fishType] || "";
}

/** Word hidden on Final round 2 for the fish line. */
function fishBlank(memories = {}) {
  const fishType = lower(memories.fishType);
  if (fishType === "tropical fish") return "tropical";
  return fishType;
}

/** Resolve {tokens} for display, Speak EXACTLY scripts, and choice labels. */
export function resolvePart3Text(text, memories = {}, extras = {}) {
  const fishColor = lower(memories.fishColor);
  const presentationFish = lower(memories.presentationFish);
  const values = {
    name: String(memories.name || "").trim(),
    glassColor: lower(memories.glassColor),
    glassColorJa: PART3_COLOR_JA[lower(memories.glassColor)] || "",
    otherColor: lower(extras.otherColor),
    decoration1: lower(memories.decoration1),
    decoration1Ja: PART3_DECORATION_JA[lower(memories.decoration1)] || "",
    decoration2: lower(memories.decoration2),
    decoration2Ja: PART3_DECORATION_JA[lower(memories.decoration2)] || "",
    fishColor,
    fishColorJa: PART3_COLOR_JA[fishColor] || "",
    fishArticle: part3Article(fishColor),
    presentationFish,
    presentationFishWithArticle: part3PresentationFishWithArticle(presentationFish),
    presentationFishJa: part3PresentationFishJa(memories),
    fishBlank: fishBlank(memories),
  };
  return String(text || "")
    .replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Join Learny's English lead + ひらがな line exactly (either may be empty). */
export function part3BeatSpeak(beat, memories = {}, extras = {}) {
  const en = resolvePart3Text(beat?.learnyEn || "", memories, extras);
  const ja = resolvePart3Text(beat?.learnyJa || "", memories, extras);
  return [en, ja].filter(Boolean).join(" ").trim();
}

/** Chapter 4 / Quiz Q3 pick the beat variant for the learner's fish. */
export function part3FishVariantKey(memories = {}) {
  const fishType = lower(memories.fishType);
  if (fishType === "tropical fish") return "tropical";
  if (fishType === "puffer fish") return "puffer";
  if (fishType === "salmon" || fishType === "cod") return fishType;
  return "";
}

export function resolvePart3Beat(beat, memories = {}) {
  if (!beat?.variants) return beat || null;
  const key = part3FishVariantKey(memories);
  const variant = key ? beat.variants[key] : null;
  return variant ? { ...variant, id: beat.id } : null;
}

const HIRA_ROMAJI = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo", びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゔ: "vu",
};

function katakanaToHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** Passport-style Hepburn (long vowels dropped: ゆうき → Yuki, しょうた → Shota). */
export function part3RomanizeKana(text) {
  const hira = katakanaToHiragana(text);
  let out = "";
  for (let i = 0; i < hira.length; i += 1) {
    const ch = hira[i];
    if (ch === "っ") {
      const next = HIRA_ROMAJI[hira.slice(i + 1, i + 3)] || HIRA_ROMAJI[hira[i + 1]] || "";
      out += next.startsWith("ch") ? "t" : next.charAt(0);
      continue;
    }
    if (ch === "ー") continue;
    const pair = HIRA_ROMAJI[hira.slice(i, i + 2)];
    if (pair) {
      out += pair;
      i += 1;
      continue;
    }
    out += HIRA_ROMAJI[ch] ?? ch;
  }
  return out.replace(/ou/g, "o").replace(/uu/g, "u").replace(/oo/g, "o");
}

function capitalizeWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * English form of the account display name for `I'm [name].`
 * Kana is romanized; Latin names/emails keep their letters; kanji stays as-is.
 */
export function part3EnglishName(displayName) {
  let raw = String(displayName || "").normalize("NFKC").trim();
  if (!raw) return "";
  if (raw.includes("@")) raw = raw.split("@")[0];
  raw = raw.replace(/(?:さん|くん|ちゃん|様|さま)$/u, "").trim();
  if (/[A-Za-z]/.test(raw) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)) {
    const letters = raw.replace(/[^A-Za-z\s'-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!letters) return "";
    return /[A-Z]/.test(letters) ? letters : capitalizeWords(letters);
  }
  if (/^[\u3040-\u30ff\s・ー]+$/u.test(raw)) {
    return capitalizeWords(part3RomanizeKana(raw.replace(/・/g, " ")));
  }
  return raw;
}

export const AQUARIUM_PART3 = {
  id: "part3",
  levelId: "beginner",
  architecture: "beginner-part3-v1",
  instructionLevel: "beginner",
  inputMode: "buttons",
  badgePrefix: "p3",
  title: "水族館の発表を練習しよう！",
  titleEn: "Presentation Practice",
  weekNote: "このあとのリアルレッスンで、自分が作った水族館について英語で発表できるように練習する。",
  stopRule: "Presentation practice only — use the learner's own Chapter 0 answers.",
  badges: [],
  memories: [
    "name",
    "glassColor",
    "decoration1",
    "decoration2",
    "fishType",
    "fishColor",
    "presentationFish",
  ],
  segments: [
    {
      id: "p3ch0",
      type: "story",
      chapterMeta: { label: "CHAPTER", num: "0" },
      title: "どんな水族館を作ったか思い出そう",
      titleEn: "Remember your aquarium",
      goal: "つくった すいぞくかんを えらぼう（8択）",
      part3Beats: [
        {
          id: "glassColor",
          kind: "pick",
          learnyEn: "First, let's remember your aquarium! What color glass did you choose?",
          learnyJa: "まずは じぶんの すいぞくかんを おもいだそう！なにいろの がらすを えらんだ？",
          choices: PART3_GLASS_COLORS,
          memoryKey: "glassColor",
        },
        {
          id: "decoration1",
          kind: "pick",
          learnyEn: "What did you put in your aquarium?",
          learnyJa: "すいぞくかんに なにを おいた？",
          choices: PART3_DECORATION1_CHOICES,
          memoryKey: "decoration1",
        },
        {
          id: "decoration2",
          kind: "pick",
          noPraise: true,
          learnyEn: "Nice! What else did you put in your aquarium?",
          learnyJa: "いいね！ほかには なにを おいた？",
          choices: PART3_DECORATION2_POOL,
          excludeMemory: "decoration1",
          memoryKey: "decoration2",
        },
        {
          id: "fishType",
          kind: "pick",
          learnyEn: "What fish did you choose?",
          learnyJa: "どんな おさかなを えらんだ？",
          choices: [...PART3_FISH_CHOICES, ...PART3_FISH_DISTRACTORS],
          accept: PART3_FISH_CHOICES,
          memoryKey: "fishType",
        },
        {
          id: "fishColor",
          kind: "pick",
          onlyIfFishType: "tropical fish",
          learnyEn: "What color was your tropical fish?",
          learnyJa: "ねったいぎょは なにいろだった？",
          choices: PART3_FISH_COLORS,
          memoryKey: "fishColor",
        },
      ],
    },
    {
      id: "p3ch1",
      type: "story",
      chapterMeta: { label: "CHAPTER", num: "1" },
      title: "自己紹介から練習しよう",
      titleEn: "Start with your introduction",
      goal: "ただしい えいごを えらぼう（4択）",
      part3Beats: [
        {
          id: "imName",
          kind: "mcq",
          learnyEn: "Let's start your presentation!",
          learnyJa: "「わたしは {name} です」の えいごを えらんでね！",
          choices: ["I'm {name}.", "This is {name}.", "I like {name}.", "My aquarium is {name}."],
          answer: "I'm {name}.",
          nameAudio: true,
        },
        {
          id: "thisIsMyAquarium",
          kind: "mcq",
          learnyEn: "Now introduce your aquarium!",
          learnyJa: "「これが わたしの すいぞくかんです」の えいごを えらんでね！",
          choices: [
            "This is my aquarium.",
            "This is my fish.",
            "I like my aquarium.",
            "I chose my aquarium.",
          ],
          answer: "This is my aquarium.",
        },
      ],
    },
    {
      id: "p3ch2",
      type: "story",
      chapterMeta: { label: "CHAPTER", num: "2" },
      title: "ガラスの色を紹介しよう",
      titleEn: "Talk about your glass",
      goal: "ただしい えいごを えらぼう（4択）",
      part3Beats: [
        {
          id: "choseGlass",
          kind: "mcq",
          learnyEn: "Do you remember the color you told me?",
          learnyJa: "「{glassColorJa} がらすを えらびました」の えいごを えらんでね！",
          choices: [
            "I chose {glassColor} glass.",
            "I put {glassColor} glass here.",
            "I found {glassColor} glass.",
            "I chose {otherColor} glass.",
          ],
          answer: "I chose {glassColor} glass.",
          needsOtherColor: true,
        },
      ],
    },
    {
      id: "p3ch3",
      type: "story",
      chapterMeta: { label: "CHAPTER", num: "3" },
      title: "飾りを紹介しよう",
      titleEn: "Talk about your decorations",
      goal: "ただしい えいごを えらぼう（4択）",
      part3Beats: [
        {
          id: "putDecoration1",
          kind: "mcq",
          learnyEn: "You told me you put {decoration1} in your aquarium!",
          learnyJa: "「ここに {decoration1Ja}を おきました」の えいごを えらんでね！",
          choices: [
            "I put {decoration1} here.",
            "I chose {decoration1}.",
            "I found {decoration1}.",
            "I like this fish.",
          ],
          answer: "I put {decoration1} here.",
        },
        {
          id: "putDecoration2",
          kind: "mcq",
          learnyEn: "And you also had {decoration2}!",
          learnyJa: "「ここに {decoration2Ja}を おきました」の えいごを えらんでね！",
          choices: [
            "I put {decoration2} here.",
            "I chose {decoration2}.",
            "I found {decoration2}.",
            "I need {decoration2}.",
          ],
          answer: "I put {decoration2} here.",
        },
      ],
    },
    {
      id: "p3ch4",
      type: "story",
      chapterMeta: { label: "CHAPTER", num: "4" },
      title: "魚を紹介しよう",
      titleEn: "Talk about your fish",
      goal: "ただしい えいごを えらぼう（4択）",
      part3Beats: [
        {
          id: "choseFish",
          kind: "mcq",
          variants: {
            tropical: {
              learnyEn: "You chose {fishArticle} {fishColor} tropical fish!",
              learnyJa: "「{fishColorJa} ねったいぎょを えらびました」の えいごを えらんでね！",
              choices: [
                "I chose {fishArticle} {fishColor} tropical fish.",
                "I found {fishArticle} {fishColor} tropical fish.",
                "I put {fishArticle} {fishColor} tropical fish here.",
                "I like {fishColor} glass.",
              ],
              answer: "I chose {fishArticle} {fishColor} tropical fish.",
            },
            salmon: {
              learnyEn: "You chose a salmon!",
              learnyJa: "「さけを えらびました」の えいごを えらんでね！",
              choices: ["I chose a salmon.", "I found a salmon.", "I put salmon here.", "I need a salmon."],
              answer: "I chose a salmon.",
            },
            // The script lists only the Cod / Puffer Fish choices; the Learny line
            // follows the Salmon pattern.
            cod: {
              learnyEn: "You chose a cod!",
              learnyJa: "「たらを えらびました」の えいごを えらんでね！",
              choices: ["I chose a cod.", "I found a cod.", "I put cod here.", "I need a cod."],
              answer: "I chose a cod.",
            },
            puffer: {
              learnyEn: "You chose a puffer fish!",
              learnyJa: "「ふぐを えらびました」の えいごを えらんでね！",
              choices: [
                "I chose a puffer fish.",
                "I found a puffer fish.",
                "I put a puffer fish here.",
                "I need a puffer fish.",
              ],
              answer: "I chose a puffer fish.",
            },
          },
        },
      ],
    },
    {
      id: "p3ch5",
      type: "story",
      chapterMeta: { label: "CHAPTER", num: "5" },
      title: "好きな魚を伝えよう",
      titleEn: "Say how you feel about your fish",
      goal: "ただしい えいごを えらぼう（4択）",
      part3Beats: [
        {
          id: "likeThisFish",
          kind: "mcq",
          learnyEn: "You chose your fish. Now tell us how you feel about it!",
          learnyJa: "「この おさかなが すきです」の えいごを えらんでね！",
          choices: ["I like this fish.", "I chose this fish.", "I found this fish.", "I put this fish here."],
          answer: "I like this fish.",
        },
      ],
    },
    {
      id: "p3quiz",
      type: "story",
      chapterMeta: { label: "QUIZ", num: "" },
      title: "発表フレーズを確認しよう",
      titleEn: "Mini Quiz",
      goal: "ミニクイズ（4択・3もん）",
      part3Beats: [
        {
          id: "q1Glass",
          kind: "mcq",
          learnyJa: "「{glassColorJa} がらすを えらびました」は えいごで？",
          choices: [
            "I chose {glassColor} glass.",
            "I put {glassColor} glass here.",
            "I chose {otherColor} glass.",
            "I found {glassColor} glass.",
          ],
          answer: "I chose {glassColor} glass.",
          needsOtherColor: true,
        },
        {
          id: "q2Decoration",
          kind: "mcq",
          learnyJa: "「ここに {decoration1Ja}を おきました」は えいごで？",
          choices: [
            "I put {decoration1} here.",
            "I chose {decoration1}.",
            "I found {decoration1}.",
            "I like {decoration1} fish.",
          ],
          answer: "I put {decoration1} here.",
        },
        {
          id: "q3Fish",
          kind: "mcq",
          variants: {
            tropical: {
              learnyJa: "「{presentationFishJa}を えらびました」は えいごで？",
              choices: [
                "I chose {fishArticle} {fishColor} tropical fish.",
                "I found {fishArticle} {fishColor} tropical fish.",
                "I put {fishArticle} {fishColor} tropical fish here.",
                "I chose {glassColor} glass.",
              ],
              answer: "I chose {fishArticle} {fishColor} tropical fish.",
            },
            salmon: {
              learnyJa: "「{presentationFishJa}を えらびました」は えいごで？",
              choices: ["I chose a salmon.", "I found a salmon.", "I put salmon here.", "I chose {glassColor} glass."],
              answer: "I chose a salmon.",
            },
            cod: {
              learnyJa: "「{presentationFishJa}を えらびました」は えいごで？",
              choices: ["I chose a cod.", "I found a cod.", "I put cod here.", "I chose {glassColor} glass."],
              answer: "I chose a cod.",
            },
            puffer: {
              learnyJa: "「{presentationFishJa}を えらびました」は えいごで？",
              choices: [
                "I chose a puffer fish.",
                "I found a puffer fish.",
                "I put a puffer fish here.",
                "I chose {glassColor} glass.",
              ],
              answer: "I chose a puffer fish.",
            },
          },
        },
      ],
    },
    {
      id: "p3ch6",
      type: "presentation",
      chapterMeta: { label: "CHAPTER", num: "6" },
      title: "2文ずつ発表しよう",
      titleEn: "Present two sentences at a time",
      goal: "2つの ぶんを つづけて いってみよう",
      // The script gives the instruction line once (Set 1); it is repeated as
      // the cue for Sets 2–4.
      part3Sets: [
        { id: "set1", learnyEn: CH6_INTRO_EN, learnyJa: CH6_INTRO_JA, lines: lineRange(0, 2) },
        { id: "set2", learnyEn: CH6_INTRO_EN, learnyJa: CH6_INTRO_JA, lines: lineRange(2, 4) },
        { id: "set3", learnyEn: CH6_INTRO_EN, learnyJa: CH6_INTRO_JA, lines: lineRange(4, 6) },
        { id: "set4", learnyEn: CH6_INTRO_EN, learnyJa: CH6_INTRO_JA, lines: lineRange(5, 7) },
      ],
    },
    {
      id: "p3ch7",
      type: "presentation",
      chapterMeta: { label: "CHAPTER", num: "7" },
      title: "半分ずつ発表しよう",
      titleEn: "Present half at a time",
      goal: "まえの はんぶん → うしろの はんぶん",
      part3Sets: [
        {
          id: "firstHalf",
          learnyEn: "Great! Let's try the first half!",
          learnyJa: "いいね！まずは まえの はんぶんを いってみよう！",
          lines: lineRange(0, 4),
        },
        {
          id: "secondHalf",
          learnyEn: "Nice! Now let's try the second half!",
          learnyJa: "いいね！つぎは うしろの はんぶんを いってみよう！",
          lines: lineRange(4, 7),
        },
      ],
    },
    {
      id: "p3final",
      type: "presentation",
      chapterMeta: { label: "FINAL", num: "" },
      title: "最初から発表しよう",
      titleEn: "Final Challenge",
      goal: "さいしょから さいごまで はっぴょうしよう",
      part3Sets: [
        {
          id: "round1",
          learnyEn: "Final presentation practice! Let's go!",
          learnyJa: "さいごの はっぴょう れんしゅうだよ！れっつごー！",
          lines: lineRange(0, 7),
        },
        { id: "round2", cloze: true, lines: lineRange(0, 7) },
      ],
    },
    {
      id: "p3ending",
      type: "ending",
      chapterMeta: { label: "END", num: "" },
      title: "発表の準備ばっちり！",
      titleEn: "Ready for your presentation!",
      goal: "",
    },
  ],
};
