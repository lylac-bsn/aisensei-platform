/**
 * Gemini tools for homework Learny (replaces complete_quest).
 */

export class RecordMemoryTool {
  constructor() {
    this.name = "record_memory";
    this.description =
      "Save a fact the CHILD actually said about their tank or choices. Never invent. Keys: favoriteColor, searchPlace, tankColor, decorations, fishColor, fishCount, favoriteFish, favoritePart.";
    this.parameters = {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Child's words (short)" },
      },
    };
    this.requiredParameters = ["key", "value"];
  }

  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      behavior: "NON_BLOCKING",
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
  }

  runFunction() {}
  functionToCall(p) {
    this.runFunction(p);
  }
}

export class CompleteSegmentTool {
  constructor() {
    this.name = "complete_segment";
    this.description =
      "Call when the CURRENT homework chapter goal is done. warmup/recall/daily_english/ending/choice may complete without English. story/scaffold/quiz/final need the child said (or repeated together) a target phrase. said_together=true if you modeled it and they echoed. Do NOT call early — wait for the exact English phrase first.";
    this.parameters = {
      type: "object",
      properties: {
        segment_id: { type: "string", description: "Current segment id, e.g. ch2" },
        user_quote: { type: "string", description: "Latest child utterance if any" },
        said_together: {
          type: "boolean",
          description: "True if you said it together after a hint",
        },
      },
    };
    this.requiredParameters = ["segment_id"];
  }

  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      behavior: "NON_BLOCKING",
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
  }

  runFunction() {}
  functionToCall(p) {
    this.runFunction(p);
  }
}

export class AwardBadgeTool {
  constructor() {
    this.name = "award_badge";
    this.description =
      "Award a homework badge id from the lesson list when its condition is met. Never award aquarium_master in Part 1.";
    this.parameters = {
      type: "object",
      properties: {
        badge_id: { type: "string" },
      },
    };
    this.requiredParameters = ["badge_id"];
  }

  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      behavior: "NON_BLOCKING",
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
  }

  runFunction() {}
  functionToCall(p) {
    this.runFunction(p);
  }
}
