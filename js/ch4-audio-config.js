import { CH4_PICKER_COLORS, colorToJaLabel } from "./mcq-audio-config.js";

/** Beat A2 + Beat B combined — one audible turn after the colour is chosen. */
export function ch4MakeTellSpeak(colorEn) {
  const color = String(colorEn || "orange").trim();
  const colorJa = colorToJaLabel(color);
  return (
    "Let's make " +
    color +
    " coloured glass! Tell me when you make one! " +
    colorJa +
    "いろの がらすを つくろう！つくれたら「" +
    colorJa +
    "いろの がらすを つくった！」って えいごで おしえてね！"
  );
}

export const CH4_AUDIO_SCRIPTS = Object.freeze(
  CH4_PICKER_COLORS.map((color) =>
    Object.freeze({
      key: `beginner-part1-ch4-make-tell-${color}`,
      color,
      text: ch4MakeTellSpeak(color),
      source: `beginner:part1.ch4.makeTell.${color}`,
    })
  )
);
