/** Fixed Beginner ending lines hosted as pre-generated Gemini TTS. */
export const ENDING1_INTRO_SPEAK =
  "Perfect! We made a fish tank together! Thank you for helping! ぱーふぇくと！ いっしょに すいそうを つくれたね！ てつだって くれて ありがとう！ " +
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！ " +
  "What kind of fish should we catch? どんな おさかなを つかまえよう？";

export const ENDING1_FINALE_SPEAK =
  "Hmm... I can't stop thinking about it! うーん… わくわく しちゃう！ " +
  "Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time! " +
  "つぎの まいんくらふと レッスンで この すいそうを かざって おさかなを いれて かんせい させよう！ また ね！";

/** Part 2 ending intro — one combined clip (then free talk until 終わりにする). */
export const PART2_ENDING_INTRO_SPEAK =
  "Perfect! You remembered a lot about your aquarium! ぱーふぇくと！このまえの すいぞくかんのこと、たくさん おもいだせたね！ " +
  "You remembered the decorations and the fish too! かざりも おさかなも おもいだせたね！ " +
  "Your teacher might ask you some of the same questions next time! " +
  "つぎの レッスンで せんせいが おなじ しつもんを するかもしれないよ！ " +
  "You'll be ready! これで ばっちりだね！ " +
  "Now, let's chat freely with Teacher Learny! それじゃあラーニー先生と自由に会話してみよう！";

/** Part 2 ending finale — only after 終わりにする. */
export const PART2_ENDING_FINALE_SPEAK =
  "If you play Minecraft again, try using today's English too! See you next time! " +
  "つぎに まいんくらふとで あそぶときも、きょうの えいごを つかってみてね！またね！";

/**
 * Part 3 wrong-answer line. Hosted because Live pads this short Japanese-only
 * line with its own praise ("Great! おしい…"). Must equal PART3_RETRY_SPEAK.
 */
export const PART3_RETRY_AUDIO_KEY = "beginner-part3-retry";
export const PART3_RETRY_AUDIO_TEXT = "おしい！もういちど！";

/** A goodbye only counts as Turn C after the explicit 終わりにする action. */
export function isEnding1FinaleTranscript(
  text,
  { finaleRequested = false, displayLocked = false } = {}
) {
  if (!finaleRequested || displayLocked) return false;
  return /next minecraft|decorate this tank|see you next time|また\s*ね|つぎの.*まいんくらふと|today'?s english|きょうの\s*えいご/i.test(
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
  Object.freeze({
    key: "beginner-part2-intro",
    text: PART2_ENDING_INTRO_SPEAK,
    source: "beginner:part2.ending1.intro",
  }),
  Object.freeze({
    key: "beginner-part2-finale",
    text: PART2_ENDING_FINALE_SPEAK,
    source: "beginner:part2.ending1.finale",
  }),
  Object.freeze({
    key: PART3_RETRY_AUDIO_KEY,
    text: PART3_RETRY_AUDIO_TEXT,
    source: "beginner:part3.retry",
  }),
]);
