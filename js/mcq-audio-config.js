export const MCQ_AUDIO_COLORS = Object.freeze([
  "orange",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "white",
  "black",
  "brown",
  "cyan",
  "lime",
  "magenta",
]);

export const MCQ_AUDIO_FISH_COUNTS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const FISH_COUNT_WORDS = Object.freeze({
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
});

export function fishCountToWord(count) {
  const num = parseInt(count, 10);
  if (isNaN(num) || num < 1) return "one";
  return FISH_COUNT_WORDS[num] || String(num);
}

/** Kid-facing Ch4 Beat A1 colour MCQ (favorite colour — buttons only). */
export const CH4_PICKER_COLORS = Object.freeze([
  "orange",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
]);

const COLOR_JA = Object.freeze({
  orange: "おれんじ",
  red: "あか",
  blue: "あお",
  green: "みどり",
  yellow: "きいろ",
  pink: "ぴんく",
  purple: "むらさき",
  white: "しろ",
  black: "くろ",
  brown: "ちゃ",
  cyan: "しあん",
  lime: "らいむ",
  magenta: "まぜんた",
});

export function normalizeAllowedFavoriteColor(value) {
  const raw = String(value || "").trim();
  // Bilingual picker labels: "orange / おれんじ" → orange
  const enPart = raw.split(/\s*\/\s*/)[0];
  const color = normalizeMcqAudioLabel(enPart);
  return MCQ_AUDIO_COLORS.includes(color) ? color : "";
}

export function colorToJaLabel(colorEn) {
  const color = normalizeAllowedFavoriteColor(colorEn) || "orange";
  return COLOR_JA[color] || color;
}

/** Kid-facing Ch4 colour button: English + ひらがな. */
export function formatCh4ColorChoiceLabel(colorEn) {
  const color = normalizeAllowedFavoriteColor(colorEn);
  if (!color) return String(colorEn || "").trim();
  return `${color} / ${colorToJaLabel(color)}`;
}

export function normalizeMcqAudioLabel(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .toLocaleLowerCase("en-US");
}

export function expandMcqAudioPlaceholders(value, color) {
  const colorEn = normalizeAllowedFavoriteColor(color) || "orange";
  return String(value || "")
    .replace(/\[colorJa\]/gi, colorToJaLabel(colorEn))
    .replace(/\[color\]/gi, colorEn)
    .replace(/___/g, colorEn);
}

export function mcqAudioSpokenText(displayLabel) {
  const display = String(displayLabel || "").trim();
  const slashParts = display.split(/\s*\/\s*/).filter(Boolean);
  return slashParts.length > 1 ? slashParts[slashParts.length - 1] : display;
}

export function expandMcqAudioFishPlaceholders(value, fishCount) {
  const count = parseInt(fishCount, 10) || 1;
  const countWord = fishCountToWord(count);
  const countMinus1 = fishCountToWord(Math.max(1, count - 1));
  const countPlus1 = fishCountToWord(count + 1);
  let result = String(value || "")
    .replace(/\[fishCountMinus1\]/gi, countMinus1)
    .replace(/\[fishCountPlus1\]/gi, countPlus1)
    .replace(/\[fishCount\]/gi, countWord);
  result = result.replace(/There are one fish/gi, "There is one fish");
  return result;
}
