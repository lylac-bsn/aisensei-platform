import { AQUARIUM_PART1 } from "./aquarium-part1.js?v=20260910-accuracy-best-1";
import { AQUARIUM_PART2 } from "./aquarium-part2.js?v=20260910-accuracy-best-1";
import { AQUARIUM_INTERMEDIATE_PART1 } from "./aquarium-intermediate-part1.js?v=20260910-accuracy-best-1";
import { AQUARIUM_INTERMEDIATE_PART2 } from "./aquarium-intermediate-part2.js?v=20260910-accuracy-best-1";
import { AQUARIUM_ADVANCED_PART1 } from "./aquarium-advanced-part1.js?v=20260910-accuracy-best-1";
import { AQUARIUM_ADVANCED_PART2 } from "./aquarium-advanced-part2.js?v=20260910-accuracy-best-1";

export const LESSON_CATALOG = Object.freeze({
  beginner: Object.freeze({
    part1: AQUARIUM_PART1,
    part2: AQUARIUM_PART2,
  }),
  intermediate: Object.freeze({
    part1: AQUARIUM_INTERMEDIATE_PART1,
    part2: AQUARIUM_INTERMEDIATE_PART2,
  }),
  advanced: Object.freeze({
    part1: AQUARIUM_ADVANCED_PART1,
    part2: AQUARIUM_ADVANCED_PART2,
  }),
});

export function lessonFor(levelId, lessonId) {
  return (
    LESSON_CATALOG[levelId]?.[lessonId] ||
    LESSON_CATALOG.beginner.part1
  );
}

export function allLessons() {
  return Object.values(LESSON_CATALOG).flatMap((level) =>
    Object.values(level)
  );
}
