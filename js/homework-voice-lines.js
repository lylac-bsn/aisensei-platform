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

/** Empty transcripts are accepted. A Japanese line must come back as Japanese. */
export function readingMatches(label, said) {
  const heard = String(said || "").replace(/<\/?say>/gi, " ").trim();
  if (!heard) return true;
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(label);
  if (japanese) return /[\u3040-\u30ff\u4e00-\u9fff]/.test(heard);
  const expected = transcriptWords(label);
  const got = transcriptWords(heard);
  if (!expected.length || !got.length) return true;
  if (got.length > expected.length + 3) return false;
  return expected.every((word, index) => got[index] === word);
}
