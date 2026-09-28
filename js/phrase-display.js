/**
 * Learned-phrase list as the child sees it (「覚えたフレーズ」).
 * Shared by the student dashboard and the admin progress panel so both
 * always show the same phrases.
 */
import { part3PhraseJa } from "./lessons/aquarium-presentation.js?v=20260928-variant-kind";

const PHRASE_TRANSLATIONS_JA = Object.freeze({
  glass: "がらす",
  sand: "すな",
  beach: "びーち",
  mountains: "やま",
  left: "ひだり",
  right: "みぎ",
  ok: "おっけー",
  okay: "おっけー",
  yes: "はい",
  // Part 1
  "i need glass": "がらすが ひつよう",
  "i need sand": "すなが ひつよう",
  "i found some sand": "すなを みつけた",
  "i found sand": "すなを みつけた",
  "i need to make glass": "がらすを つくらないと",
  "i made glass": "がらすを つくった",
  "i put glass here": "ここに がらすを おいた",
  "i'm building a tank": "すいそうを つくっている",
  "i am building a tank": "すいそうを つくっている",
  "i made a tank": "すいそうを つくった",
  "it looks good": "いい かんじに できた",
  "i put the sand on the bottom": "すいそうの そこに すなを おいた",
  "i put sand on the bottom": "すいそうの そこに すなを おいた",
  "i need more sand": "もっと すなが ひつよう",
  "i'm done": "できた",
  "i am done": "できた",
  "my tank is ready": "すいそうの じゅんびが できた",
  // Part 2
  "i put kelp here": "ここに こんぶを おいた",
  "i put coral here": "ここに さんごを おいた",
  "i choose this one": "これを えらぶ",
  "i like this coral": "この さんごが すき",
  "it looks cool": "かっこいい！",
  "let's go to the ocean": "うみに いこう！",
  "lets go to the ocean": "うみに いこう！",
  "i found a fish": "おさかなを みつけた！",
  "i found a blue fish": "あおい おさかなを みつけた！",
  "i want this fish": "この おさかなが ほしい",
  "i choose this fish": "この おさかなを えらぶ",
  "i caught a fish": "おさかなを つかまえた！",
  "i have a fish": "おさかなを もってる！",
  "i put the fish in the tank": "おさかなを すいそうに いれた",
  "i put it in here": "ここに いれた",
  "look there's a fish": "みて！おさかなが いる！",
  "there's a fish": "おさかなが いる！",
  "there is a fish": "おさかなが いる！",
  "there is one fish": "おさかなが 1ぴき いる",
  "there are three fish": "おさかなが 3びき いる",
  "there are five fish": "おさかなが 5ひき いる",
});

const COLOR_TRANSLATIONS_JA = Object.freeze({
  red: "あか",
  blue: "あお",
  green: "みどり",
  yellow: "きいろ",
  orange: "おれんじ",
  purple: "むらさき",
  pink: "ぴんく",
  black: "くろ",
  white: "しろ",
  brown: "ちゃいろ",
  gray: "はいいろ",
  grey: "はいいろ",
});

export function phraseTranslationJa(phrase) {
  const key = String(phrase || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.!?。！？]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (PHRASE_TRANSLATIONS_JA[key]) return PHRASE_TRANSLATIONS_JA[key];

  const colorGlass = key.match(/^i made (.+) glass$/);
  if (colorGlass) {
    const color = COLOR_TRANSLATIONS_JA[colorGlass[1]] || colorGlass[1];
    return `${color}いろの がらすを つくった`;
  }

  const colorFish = key.match(/^i found a (.+) fish$/);
  if (colorFish) {
    const color = COLOR_TRANSLATIONS_JA[colorFish[1]] || colorFish[1];
    return `${color} おさかなを みつけた！`;
  }

  const countFish = key.match(/^there are (\w+) fish$/);
  if (countFish) {
    const n = countFish[1];
    const countJa =
      {
        one: "1ぴき",
        two: "2ひき",
        three: "3びき",
        four: "4ひき",
        five: "5ひき",
        six: "6ひき",
        seven: "7ひき",
        eight: "8ひき",
        nine: "9ひき",
        ten: "10ぴき",
      }[n] || n;
    return `おさかなが ${countJa} いる`;
  }
  return "";
}

function canonicalSearchPlace(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?。！？]+$/g, "")
    .replace(/\s+/g, " ");
  if (["mountain", "mountains", "the mountains", "やま", "山"].includes(key)) {
    return "mountains";
  }
  if (["beach", "the beach", "ocean", "びーち", "ビーチ", "うみ", "海"].includes(key)) {
    return "beach";
  }
  return "";
}

/** Recover the Chapter 2 place from the strongest persisted choice evidence. */
export function resolveSearchPlace(lessonState = {}) {
  const remembered = canonicalSearchPlace(lessonState.memories?.searchPlace);
  if (remembered) return remembered;

  const log = Array.isArray(lessonState.mcqLog) ? lessonState.mcqLog : [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i];
    if (entry?.segmentId !== "ch2" || entry?.beatId !== "place" || !entry?.correct) continue;
    const selected = canonicalSearchPlace(entry.choice);
    if (selected) return selected;
  }

  const placeSummary = lessonState.mcqSummary?.["ch2.place"];
  if (placeSummary?.lastCorrect) {
    const selected = canonicalSearchPlace(placeSummary.lastChoice);
    if (selected) return selected;
  }

  // "mountains" was never the legacy default answer, so it is safe evidence
  // even in a partial state. A lone legacy "beach" is ambiguous and omitted.
  for (const phrase of lessonState.phrasesSpoken || []) {
    const english = typeof phrase === "string" ? phrase : phrase?.english;
    if (canonicalSearchPlace(english) === "mountains") return "mountains";
  }
  return "";
}

/** Reconcile the learned-place row while preserving all other phrase entries. */
export function phrasesForChildDisplay(lessonState = {}, { reconcileSearchPlace = false } = {}) {
  const phrases = Array.isArray(lessonState.phrasesSpoken)
    ? lessonState.phrasesSpoken
    : [];
  if (!reconcileSearchPlace) return phrases;

  const chosenPlace = resolveSearchPlace(lessonState);
  const result = [];
  let placeAdded = false;
  for (const phrase of phrases) {
    const english = typeof phrase === "string" ? phrase : phrase?.english || "";
    if (!canonicalSearchPlace(english)) {
      result.push(phrase);
      continue;
    }
    if (!chosenPlace || placeAdded) continue;
    result.push(
      typeof phrase === "object"
        ? {
            ...phrase,
            english: chosenPlace,
            japanese: phraseTranslationJa(chosenPlace),
          }
        : chosenPlace
    );
    placeAdded = true;
  }
  if (chosenPlace && !placeAdded) result.push(chosenPlace);
  return result;
}

/** English + ひらがな gloss for one phrase row, as rendered to the child. */
export function phraseRowForDisplay(phrase, lessonId) {
  const english = typeof phrase === "string" ? phrase : phrase?.english || "";
  const japanese =
    (typeof phrase === "object" && phrase?.japanese) ||
    (lessonId === "part3" && part3PhraseJa(english)) ||
    phraseTranslationJa(english);
  return { english, japanese: japanese || "" };
}
