const test = require("node:test");
const assert = require("node:assert/strict");

test("result sound resets on a miss and celebrates every fifth correct answer", async () => {
  const { resultSound } = await import("../../js/homework-sfx.js");
  assert.deepEqual(resultSound(4, false), { streak: 0, name: "incorrect" });
  let streak = 0;
  const names = [];
  for (let i = 0; i < 6; i += 1) {
    const next = resultSound(streak, true);
    streak = next.streak;
    names.push(next.name);
  }
  assert.deepEqual(names, ["correct", "correct", "correct", "correct", "streak", "correct"]);
  assert.equal(resultSound(5, false).streak, 0);
});
