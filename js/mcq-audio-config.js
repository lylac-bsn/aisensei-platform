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

/** Kid-facing Ch4 fallback picker when they name a colour outside the lesson set. */
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
  const color = normalizeMcqAudioLabel(value);
  return MCQ_AUDIO_COLORS.includes(color) ? color : "";
}

export function colorToJaLabel(colorEn) {
  const color = normalizeAllowedFavoriteColor(colorEn) || "orange";
  return COLOR_JA[color] || color;
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
