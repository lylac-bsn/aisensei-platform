const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseVocabulary,
  generateHomework,
  gradeAnswer,
  preparePack,
  toPublic,
  updateSentence,
} = require("../homework-engine");

const SAMPLE = `さかな - Fish
ねこ - Cat
いぬ - Dog
りんご - Apple
みず - Water
ほん - Book`;

test("parses a Japanese-English list and drops duplicates", () => {
  const parsed = parseVocabulary(`${SAMPLE}\nねこ - kitten\nTシャツ - T-shirt`);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.pairs.length, 7);
  assert.equal(parsed.pairs[0].en, "Fish");
  assert.equal(parsed.pairs[6].en, "T-shirt");
  assert.equal(parsed.duplicates || parsed.warnings.some((item) => item.includes("同じ単語")), parsed.warnings.some((item) => item.includes("同じ単語")));
});

test("builds four exercise types without putting answers on the public question", () => {
  const { pairs } = parseVocabulary(SAMPLE);
  const first = generateHomework(pairs, { seed: 4, level: "beginner" });
  const again = generateHomework(pairs, { seed: 4, level: "beginner" });
  assert.deepEqual(first.questions.map((question) => question.id), again.questions.map((question) => question.id));
  const types = new Set(first.questions.map((question) => question.type));
  assert.equal(types.size, 4);
  const spelling = first.questions.find((question) => question.type === "spelling");
  const published = toPublic(spelling);
  assert.equal(published.answer, undefined);
  assert.equal(JSON.stringify(published).includes(spelling.answer), false);
  const choice = first.questions.find((question) => question.type === "multipleChoice");
  assert.equal(toPublic(choice).answer, undefined);
  assert.equal(toPublic(choice).choices.length, 4);
  const articles = generateHomework(parseVocabulary("りんご - Apple\nみず - Water").pairs, {
    seed: 1,
    count: 4,
    types: { multipleChoice: false, matching: false, spelling: false },
  });
  assert.equal(articles.questions.find((question) => question.vocabKey === "apple").display, "This is an apple");
  assert.equal(articles.questions.find((question) => question.vocabKey === "water").display, "I like water");
});

test("grades without caring about capitalization and accepts a shorter like-sentence", () => {
  const { pairs } = parseVocabulary("さかな - fish\nねこ - cat");
  const pack = generateHomework(pairs, {
    seed: 2,
    count: 6,
    types: { multipleChoice: false, matching: false, spelling: true, sentence: true },
  });
  const spelling = pack.questions.find((question) => question.type === "spelling" && question.vocabKey === "fish");
  assert.equal(gradeAnswer(spelling, "FISH").correct, true);
  assert.equal(gradeAnswer(spelling, "fog").correct, false);
  assert.match(gradeAnswer(spelling, "fog").solution, /fish/i);
  const sentence = pack.questions.find((question) => question.display.startsWith("I like"));
  assert.equal(gradeAnswer(sentence, ["I", "like", "cat"]).correct, true);
  assert.equal(gradeAnswer(sentence, ["cat", "I", "like"]).correct, false);
  const matching = generateHomework(pairs, { seed: 5, count: 1, types: { multipleChoice: false, spelling: false, sentence: false } });
  const board = matching.questions[0];
  const pair = board.pairs[0];
  assert.equal(gradeAnswer(board, { leftId: pair.leftId, rightId: pair.rightId }).correct, true);
  assert.equal(gradeAnswer(board, { leftId: pair.leftId, rightId: "nope" }).correct, false);
});

test("does not assign unapproved sentences", () => {
  const { pairs } = parseVocabulary(SAMPLE);
  const pack = generateHomework(pairs, { seed: 1, count: 8 });
  const blocked = preparePack(pack.questions, { assigning: true });
  assert.equal(blocked.ok, false);
  const edited = pack.questions.map((question) => (
    question.type === "sentence" ? { ...question, approved: true, sentenceSource: "teacher" } : question
  ));
  const ready = preparePack(edited, { assigning: true });
  assert.equal(ready.ok, true);
  assert.equal(ready.publicQuestions.some((question) => "answer" in question), false);
  const sentence = pack.questions.find((question) => question.type === "sentence");
  const changed = updateSentence(sentence, { promptJa: "わたしは さかなを みつけた", sentence: "I found the fish.", approved: true }, pairs, 9);
  assert.equal(changed.error, "");
  assert.equal(gradeAnswer(changed.question, ["I", "found", "the", "fish"]).correct, true);
});

test("flags a multiple-choice question when the list cannot fill four choices", () => {
  const { pairs } = parseVocabulary("さかな - Fish\nねこ - Cat");
  const pack = generateHomework(pairs, { seed: 3, count: 1, types: { matching: false, spelling: false, sentence: false } });
  assert.equal(pack.questions[0].review, true);
  assert.equal(pack.questions[0].choices.length, 4);
  assert.equal(gradeAnswer(pack.questions[0], "Fish").correct, true);
});
