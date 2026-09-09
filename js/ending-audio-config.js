/** Fixed Beginner Part 1 ending lines hosted as pre-generated Gemini TTS. */
export const ENDING1_INTRO_SPEAK =
  "Perfect! We made a fish tank together! Thank you for helping! ぱーふぇくと！ いっしょに すいそうを つくれたね！ てつだって くれて ありがとう！ " +
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！ " +
  "What kind of fish should we catch? どんな おさかなを つかまえよう？";

export const ENDING1_FINALE_SPEAK =
  "Hmm... I can't stop thinking about it! うーん… わくわく しちゃう！ " +
  "Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time! " +
  "つぎの まいんくらふと レッスンで この すいそうを かざって おさかなを いれて かんせい させよう！ また ね！";

/** A goodbye only counts as Turn C after the explicit 終わりにする action. */
export function isEnding1FinaleTranscript(
  text,
  { finaleRequested = false, displayLocked = false } = {}
) {
  if (!finaleRequested || displayLocked) return false;
  return /next minecraft|decorate this tank|see you next time|また\s*ね|つぎの.*まいんくらふと/i.test(
    String(text || "")
  );
}

export const ENDING_AUDIO_SCRIPTS = Object.freeze([
  Object.freeze({
    key: "beginner-part1-turn-a",
    text: ENDING1_INTRO_SPEAK,
    source: "beginner:part1.ending1.turnA",
  }),
  Object.freeze({
    key: "beginner-part1-turn-c",
    text: ENDING1_FINALE_SPEAK,
    source: "beginner:part1.ending1.turnC",
  }),
]);
