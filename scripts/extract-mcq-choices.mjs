#!/usr/bin/env node

import { allLessons } from "../js/lessons/lesson-catalog.js";
import { formatChoiceLabel } from "../js/mcq-engine.js";
import {
  MCQ_AUDIO_COLORS,
  expandMcqAudioPlaceholders,
  mcqAudioSpokenText,
  normalizeMcqAudioLabel,
} from "../js/mcq-audio-config.js";

const labels = new Map();

function addLabel(rawLabel, source) {
  const template = String(rawLabel || "").trim();
  if (!template) return;
  const hasColor = /\[color(?:Ja)?\]|___/i.test(template);
  const variants = hasColor ? MCQ_AUDIO_COLORS : [null];
  for (const color of variants) {
    const expanded = color ? expandMcqAudioPlaceholders(template, color) : template;
    const display = formatChoiceLabel(expanded);
    const key = normalizeMcqAudioLabel(display);
    if (!key || labels.has(key)) continue;
    labels.set(key, {
      key,
      display,
      spokenText: mcqAudioSpokenText(expanded),
      source,
      ...(color ? { color } : {}),
    });
  }
}

function visit(value, path = "lesson") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => visit(child, `${path}[${index}]`));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === "choices" && Array.isArray(child)) {
      child.forEach((choice, index) => {
        const label =
          typeof choice === "string"
            ? choice
            : choice && typeof choice === "object"
              ? choice.label
              : "";
        addLabel(label, `${childPath}[${index}]`);
      });
    }
    visit(child, childPath);
  }
}

allLessons().forEach((lesson, index) => {
  visit(lesson, `${lesson.levelId || "level"}:${lesson.id || index}`);
});

process.stdout.write(
  JSON.stringify(
    [...labels.values()].sort((a, b) => a.key.localeCompare(b.key)),
    null,
    2
  )
);
