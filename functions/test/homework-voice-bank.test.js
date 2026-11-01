const test = require("node:test");
const assert = require("node:assert/strict");

test("homework voice lines cover prompts, choices, and tiles", async () => {
  const {
    linesForQuestions,
    readingMatches,
    isTrivialVoiceLine,
    cacheKey,
    RETRY_LINES,
  } = await import("../../js/homework-voice-lines.js");
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
  assert.equal(readingMatches("Fish", ""), false);
  assert.equal(readingMatches("I", ""), true);
  assert.equal(isTrivialVoiceLine("I"), true);
  assert.equal(isTrivialVoiceLine("Fish"), false);
  assert.equal(readingMatches("Fish", "Fi", { finished: false }), false);
  assert.equal(readingMatches("りんご", ""), false);
  assert.ok(RETRY_LINES.includes("Nice try！もう一度！"));
  assert.ok(RETRY_LINES.includes("Not that one..."));
  assert.ok(RETRY_LINES.length >= 4);
});

test("speechLooksOk rejects quiet and squeal-like buffers", async () => {
  const { speechLooksOk } = await import("../../js/homework-voice-bank.js");
  const silence = new Float32Array(24000 * 0.4);
  assert.equal(speechLooksOk(silence), false);

  const speechy = new Float32Array(24000 * 0.5);
  for (let i = 0; i < speechy.length; i += 1) {
    const t = i / 24000;
    // Mix of formant-ish tones with amplitude envelope (not a flat whistle).
    const envelope = 0.35 + 0.25 * Math.sin(2 * Math.PI * 3 * t);
    speechy[i] = envelope * (
      0.35 * Math.sin(2 * Math.PI * 220 * t)
      + 0.2 * Math.sin(2 * Math.PI * 440 * t)
      + 0.08 * Math.sin(2 * Math.PI * 880 * t)
    );
  }
  assert.equal(speechLooksOk(speechy), true);

  const squeal = new Float32Array(24000 * 0.7);
  for (let i = 0; i < squeal.length; i += 1) {
    squeal[i] = 0.35 * Math.sin(2 * Math.PI * 4500 * (i / 24000));
  }
  assert.equal(speechLooksOk(squeal), false);
});
