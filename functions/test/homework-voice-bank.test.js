const test = require("node:test");
const assert = require("node:assert/strict");

test("homework voice lines cover prompts, choices, and tiles", async () => {
  const { linesForQuestions, readingMatches, cacheKey, RETRY_LINES } = await import("../../js/homework-voice-lines.js");
  const lines = linesForQuestions([
    {
      type: "multipleChoice",
      promptJa: "すいぞうは英語で？",
      speak: { prompt: { text: "すいぞうは英語で？", lang: "ja" } },
      choices: ["Turtle", "Tank", "Fish", "Sea"],
      answer: "Tank",
    },
    {
      type: "matching",
      promptJa: "にほんごと えいごを つなげよう",
      speak: { prompt: { text: "にほんごと えいごを つなげよう", lang: "ja" } },
      left: [{ text: "さかな" }],
      right: [{ text: "Fish" }],
    },
    {
      type: "sentence",
      tiles: ["I", "like", "fish"],
      answer: ["I", "like", "fish"],
    },
  ]);
  assert.ok(lines.includes("すいぞうは英語で？"));
  assert.ok(lines.includes("Tank"));
  assert.ok(lines.includes("にほんごと えいごを つなげよう"));
  assert.ok(lines.includes("さかな"));
  assert.ok(lines.includes("I"));
  assert.ok(lines.includes("like"));
  assert.ok(lines.includes("fish"));
  assert.ok(lines.includes("I like fish"));
  assert.equal(cacheKey("  Fish "), cacheKey("fish"));
  assert.equal(cacheKey("I"), cacheKey("i"));
  assert.equal(readingMatches("Fish", "Fish."), true);
  assert.equal(readingMatches("Fish", "<say>Fish</say>"), true);
  assert.equal(readingMatches("Fish", "The answer is fish and also a story"), false);
  assert.equal(readingMatches("すいぞうは英語で？", "すいぞうは英語で"), true);
  assert.equal(readingMatches("すいぞうは英語で？", "aquarium"), false);
  assert.equal(readingMatches("Fish", ""), true);
  assert.ok(RETRY_LINES.includes("Nice try！もう一度！"));
  assert.ok(RETRY_LINES.includes("Not that one..."));
  assert.ok(RETRY_LINES.length >= 4);
});
