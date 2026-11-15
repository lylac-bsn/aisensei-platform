const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLessonQuestions, preparePack, lessonTranslationRows, lessonRowsFromConfirmed } = require("../homework-engine");

const PHRASE = {
  en: "I need wood.",
  ja: "木がひつよう",
  distractorsEn: ["I need wood.", "Wait for me.", "Where are you?", "I found iron."],
  distractorsJa: ["木がひつよう", "まって", "どこにいるの", "てつをみつけた"],
};

test("builds both multiple-choice directions and word order from a lesson phrase", () => {
  const built = buildLessonQuestions([
    PHRASE,
    {
      en: "Wait for me.",
      ja: "まって",
      distractorsEn: ["I need wood.", "Where are you?", "I found iron."],
      distractorsJa: ["木がひつよう", "どこにいるの", "てつをみつけた"],
    },
    {
      en: "wood",
      ja: "き",
      distractorsEn: ["stone", "iron", "water"],
      distractorsJa: ["いし", "てつ", "みず"],
    },
    {
      en: "Wood",
      ja: "もく",
      distractorsEn: ["stone", "iron", "water"],
      distractorsJa: ["いし", "てつ", "みず"],
    },
  ], { seed: 3 });

  assert.equal(built.error, "");
  assert.equal(built.vocab.length, 3);
  assert.equal(built.warnings.some((warning) => warning.includes("同じ英語")), true);

  const phrase = built.questions.filter((question) => question.lessonEn === "I need wood.");
  assert.equal(phrase.length, 3);
  const jaToEn = phrase.find((question) => question.lessonKind === "ja-to-en");
  const enToJa = phrase.find((question) => question.lessonKind === "en-to-ja");
  const order = phrase.find((question) => question.lessonKind === "order");
  assert.equal(jaToEn.answer, "I need wood.");
  assert.equal(jaToEn.choices.filter((choice) => choice.toLowerCase() === "i need wood.").length, 1);
  assert.equal(jaToEn.choices.length, 4);
  assert.equal(enToJa.answer, "木がひつよう");
  assert.equal(enToJa.promptEn, "I need wood.");
  assert.equal(enToJa.choices.filter((choice) => choice === "木がひつよう").length, 1);
  assert.deepEqual(order.answer, ["I", "need", "wood"]);
  assert.equal(order.type, "sentence");
  assert.equal(phrase.every((question) => question.source === "lesson" && question.approved === false), true);

  const word = built.questions.filter((question) => question.lessonEn === "wood");
  assert.equal(word.length, 2);
  assert.equal(word.some((question) => question.type === "sentence"), false);

  const packed = preparePack(built.questions);
  assert.equal(packed.ok, true);
  assert.equal(packed.publicQuestions.some((question) => Object.hasOwn(question, "answer")), false);
});

test("drops a distractor that repeats the correct answer and marks fallback choices", () => {
  const built = buildLessonQuestions([{
    en: "I need wood.",
    ja: "木がひつよう",
    distractorsEn: ["I need wood.", "I need wood."],
    distractorsJa: ["木がひつよう"],
  }], { seed: 2 });
  const jaToEn = built.questions.find((question) => question.lessonKind === "ja-to-en");
  assert.equal(jaToEn.choices.length, 4);
  assert.equal(jaToEn.choices.filter((choice) => choice.toLowerCase() === "i need wood.").length, 1);
  assert.equal(jaToEn.review, true);
  const packed = preparePack(built.questions);
  assert.equal(packed.ok, true);
});

test("keeps a lesson phrase longer than 40 characters through preparePack", () => {
  const en = "Please bring the small blue bucket over here.";
  const built = buildLessonQuestions([{
    en,
    ja: "バケツをもってきて",
    distractorsEn: ["Wait for me.", "Where are you?", "I found iron."],
    distractorsJa: ["まって", "どこにいるの", "てつをみつけた"],
  }], { seed: 4 });
  assert.ok(en.length > 40);
  const packed = preparePack(built.questions);
  assert.equal(packed.ok, true);
  const saved = packed.questions.find((question) => question.lessonKind === "ja-to-en");
  assert.equal(saved.answer, en);
  assert.equal(saved.choices.includes(en), true);
  const order = packed.questions.find((question) => question.lessonKind === "order");
  assert.deepEqual(order.answer, ["Please", "bring", "the", "small", "blue", "bucket", "over", "here"]);
});

test("keeps the teacher's confirmed Japanese when building lesson rows", () => {
  const translations = lessonTranslationRows(
    ["I love reading", "This is a pen"],
    [{ en: "This is a pen", ja: "これはペンです" }, { en: "I love reading", ja: "どくしょがすき" }],
  );
  assert.deepEqual(translations, [
    { en: "I love reading", ja: "どくしょがすき" },
    { en: "This is a pen", ja: "これはペンです" },
  ]);
  const rows = lessonRowsFromConfirmed(
    [{ en: "I love reading", ja: "ほんがすき" }, { en: "This is a pen", ja: "これはペン" }],
    [{ en: "I love reading", distractorsJa: ["あ", "い", "う"], distractorsEn: ["I like cats", "I like dogs", "I like birds"] }],
  );
  assert.equal(rows[0].ja, "ほんがすき");
  assert.deepEqual(rows[0].distractorsEn, ["I like cats", "I like dogs", "I like birds"]);
  assert.equal(rows[1].ja, "これはペン");
  const built = buildLessonQuestions(rows, { seed: 1 });
  const enToJa = built.questions.find((question) => question.lessonEn === "I love reading" && question.lessonKind === "en-to-ja");
  assert.equal(enToJa.answer, "ほんがすき");
});

test("skips a line when the Japanese meaning is missing", () => {
  const built = buildLessonQuestions([{ en: "Hello there.", ja: "" }], { seed: 1 });
  assert.equal(built.questions.length, 0);
  assert.match(built.error, /読み取れ/);
  assert.equal(built.warnings.some((warning) => warning.includes("日本語")), true);
});
