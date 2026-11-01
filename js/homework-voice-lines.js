/** Spoken when an answer is wrong. The student retries; the answer is not read. */
export const RETRY_LINES = Object.freeze([
  "Nice try！もう一度！",
  "Not that one...",
  "Almost! もう一度！",
  "One more try!",
  "Not yet. もういちど！",
  "So close! Try again.",
]);

export function cacheKey(text) {
  return String(text || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

/** Every line a question can speak: the prompt, the choices, and the words. */
export function linesForQuestions(questions) {
  const lines = [];
  const push = (value) => {
    const text = String(value || "").trim();
    if (text) lines.push(text);
  };
  (questions || []).forEach((question) => {
    push(question?.speak?.prompt?.text);
    push(question?.promptJa);
    push(question?.promptEn);
    (question?.choices || []).forEach(push);
    (question?.left || []).forEach((item) => push(item?.text));
    (question?.right || []).forEach((item) => push(item?.text));
    (question?.tiles || []).forEach(push);
    // Individual answer tokens (sentence chips) plus the joined phrase.
    if (Array.isArray(question?.answer)) {
      question.answer.forEach(push);
      push(question.answer.join(" "));
    } else {
      push(question?.answer);
    }
    push(question?.display);
  });
  return lines;
}

function transcriptWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .match(/[a-z']+/g) || [];
}

/**
 * Very short chips often get empty STT from Live ("I", "a", single kana).
 * Only those may pass without a transcript; everything else must be heard.
 */
export function isTrivialVoiceLine(label) {
  const text = String(label || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text) return true;
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
  if (japanese) {
    const chars = [...text.replace(/\s+/g, "")].length;
    return chars <= 1;
  }
  const words = text.split(/\s+/).filter(Boolean);
  const letters = text.replace(/[^a-zA-Z']/g, "").length;
  return words.length <= 1 && letters <= 2;
}

/**
 * Short vocab chips ("りんご", "Fish") — Live STT is often empty or romaji.
 * Audio quality gates still apply; long prompts still require a transcript.
 */
export function isShortVocabLine(label) {
  const text = String(label || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text || isTrivialVoiceLine(text)) return true;
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
  if (japanese) {
    const chars = [...text.replace(/\s+/g, "")].length;
    return chars <= 4;
  }
  const words = text.split(/\s+/).filter(Boolean);
  const letters = text.replace(/[^a-zA-Z']/g, "").length;
  return words.length === 1 && letters <= 10;
}

/**
 * True when the output transcript is a plausible reading of the script line.
 * Non-trivial lines require a non-empty transcript (empty STT used to accept noise clips).
 */
export function readingMatches(label, said, { finished = true } = {}) {
  const heard = String(said || "").replace(/<\/?say>/gi, " ").trim();
  const trivial = isTrivialVoiceLine(label);
  if (!heard) return trivial;
  // Incomplete STT that is still far shorter than the script is not good enough.
  if (!finished && !trivial) {
    const target = String(label || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    if (heard.replace(/\s+/g, "").length < Math.max(2, Math.floor(target.replace(/\s+/g, "").length * 0.45))) {
      return false;
    }
  }
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(label);
  if (japanese) return /[\u3040-\u30ff\u4e00-\u9fff]/.test(heard);
  const expected = transcriptWords(label);
  const got = transcriptWords(heard);
  if (!expected.length) return true;
  if (!got.length) return trivial;
  if (got.length > expected.length + 3) return false;
  return expected.every((word, index) => got[index] === word);
}
