#!/usr/bin/env node

import { allLessons } from "../js/lessons/lesson-catalog.js";
import { formatChoiceLabel } from "../js/mcq-engine.js";
import {
  MCQ_AUDIO_COLORS,
  MCQ_AUDIO_FISH_COUNTS,
  expandMcqAudioPlaceholders,
  expandMcqAudioFishPlaceholders,
  mcqAudioSpokenText,
  normalizeMcqAudioLabel,
} from "../js/mcq-audio-config.js";

const labels = new Map();

function addLabel(rawLabel, source) {
  const template = String(rawLabel || "").trim();
  if (!template) return;
  const hasColor = /\[color(?:Ja)?\]|___/i.test(template);
  const hasFishCount = /\[fishCount(?:Minus1|Plus1)?\]/i.test(template);

  if (hasColor && hasFishCount) {
    for (const color of MCQ_AUDIO_COLORS) {
      for (const count of MCQ_AUDIO_FISH_COUNTS) {
        let expanded = expandMcqAudioPlaceholders(template, color);
        expanded = expandMcqAudioFishPlaceholders(expanded, count);
        addExpandedLabel(expanded, source, { color, fishCount: count });
      }
    }
  } else if (hasColor) {
    for (const color of MCQ_AUDIO_COLORS) {
      const expanded = expandMcqAudioPlaceholders(template, color);
      addExpandedLabel(expanded, source, { color });
    }
  } else if (hasFishCount) {
    for (const count of MCQ_AUDIO_FISH_COUNTS) {
      const expanded = expandMcqAudioFishPlaceholders(template, count);
      addExpandedLabel(expanded, source, { fishCount: count });
    }
  } else {
    addExpandedLabel(template, source, {});
  }
}

function addExpandedLabel(expanded, source, meta) {
  const display = formatChoiceLabel(expanded);
  const key = normalizeMcqAudioLabel(display);
  if (!key || labels.has(key)) return;
  labels.set(key, {
    key,
    display,
    spokenText: mcqAudioSpokenText(expanded),
    source,
    ...meta,
  });
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
