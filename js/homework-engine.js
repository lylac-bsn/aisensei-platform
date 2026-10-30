/**
 * Vocabulary homework generator and grader.
 *
 * Question documents keep answer keys. toPublic() is the only shape that may
 * be stored where a student can read it. Grading is deterministic.
 */

const TYPES = ["multipleChoice", "matching", "spelling", "sentence"];
const LEVELS = ["beginner", "intermediate", "advanced"];
const BANK_EN = ["Cat", "Dog", "Fish", "Bird", "Apple", "Book", "Water", "Milk", "Red", "Blue", "Big", "Small"];
const UNCOUNTABLE = new Set(["water", "milk", "juice", "rice", "bread", "money"]);
const SPACED_SEPARATORS = ["\t", " – ", " — ", " - ", " － ", " / ", " ／ ", " = ", " ＝ ", " : ", " ： "];

function norm(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function clip(value, max) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max);
}

function hasKana(value) {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(value);
}

function hasLatin(value) {
  return /[A-Za-z]/.test(value);
}

function lettersOnly(value) {
  return String(value || "").normalize("NFKC").replace(/[^A-Za-z]/g, "").toLowerCase();
}

function makeRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle(list, random) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function clampCount(value, pairCount) {
  const fallback = Math.min(12, Math.max(pairCount, 1));
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.round(number)));
}

function splitPair(text) {
  for (const separator of SPACED_SEPARATORS) {
    const at = text.indexOf(separator);
    if (at > 0 && at < text.length - separator.length) {
      return [text.slice(0, at).trim(), text.slice(at + separator.length).trim()];
    }
  }
  return null;
}

function parseVocabulary(text) {
  const pairs = [];
  const errors = [];
  const seenJa = new Set();
  const seenEn = new Set();
  let duplicates = 0;
  String(text || "").split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const columns = trimmed.split("|").map((part) => part.trim());
    const halves = splitPair(columns[0]);
    if (!halves) {
      errors.push(`${index + 1}行目を読み取れません。「さかな - fish」のように書いてください。`);
      return;
    }
    let ja = clip(halves[0], 40);
    let en = clip(halves[1], 40);
    if (hasLatin(ja) && hasKana(en) && !hasKana(ja)) {
      [ja, en] = [en, ja];
    }
    if (!hasKana(ja) || !hasLatin(en)) {
      errors.push(`${index + 1}行目は日本語と英語の組にしてください。`);
      return;
    }
    const jaKey = norm(ja);
    const enKey = norm(en);
    if (seenJa.has(jaKey) || seenEn.has(enKey)) {
      duplicates += 1;
      return;
    }
    seenJa.add(jaKey);
    seenEn.add(enKey);
    if (pairs.length >= 30) return;
    pairs.push({
      ja,
      en,
      sentenceJa: clip(columns[1] || "", 80),
      sentenceEn: clip(columns[2] || "", 120),
    });
  });
  const warnings = [];
  if (duplicates) warnings.push(`同じ単語 ${duplicates} 件は除きました。`);
  if (pairs.length >= 30) warnings.push("単語は30件まで使います。");
  return { pairs, errors, warnings };
}

function nounTokens(en) {
  const word = en.trim().toLowerCase();
  if (UNCOUNTABLE.has(word)) return [word];
  return [/^[aeiou]/i.test(word) ? "an" : "a", word];
}

function templatesFor(pair, level) {
  const ja = pair.ja;
  const word = pair.en.trim().toLowerCase();
  const noun = nounTokens(pair.en);
  const theNoun = UNCOUNTABLE.has(word) ? [word] : ["the", word];
  if (level === "advanced") {
    return [
      { ja: `あそこに ${ja} が あります。`, en: ["There", "is", ...noun, "over", "there"] },
      { ja: `わたしは ${ja} を みました。`, en: ["I", "saw", ...theNoun] },
    ];
  }
  if (level === "intermediate") {
    return [
      { ja: `わたしは ${ja} を みつけました。`, en: ["I", "found", ...theNoun] },
      { ja: `${ja} は どこですか。`, en: ["Where", "is", ...theNoun] },
    ];
  }
  return [
    { ja: `これは ${ja} です。`, en: ["This", "is", ...noun] },
    { ja: `わたしは ${ja} が すきです。`, en: ["I", "like", ...theNoun] },
  ];
}

function sentenceAlternates(tokens) {
  const accepts = [tokens];
  if (norm(tokens[0]) === "i" && norm(tokens[1]) === "like" && norm(tokens[2]) === "the" && tokens.length > 3) {
    accepts.push([tokens[0], tokens[1], ...tokens.slice(3)]);
  }
  return accepts;
}

function tokenize(text) {
  return clip(text, 120).replace(/[.!?。！？]+$/g, "").split(/\s+/).filter(Boolean);
}

function spellingSlots(word) {
  const slots = [];
  for (const character of word) {
    if (/[A-Za-z]/.test(character)) slots.push({ type: "letter" });
    else if (character === " ") slots.push({ type: "gap" });
    else slots.push({ type: "mark", text: character });
  }
  return slots;
}

function firstLetter(word) {
  const letters = lettersOnly(word);
  return letters ? letters[0].toUpperCase() : "";
}

function takeDistractors(answer, pool, random, need) {
  const usedBank = [];
  const picked = [];
  const seen = new Set([norm(answer)]);
  shuffle(pool, random).forEach((item) => {
    if (picked.length >= need) return;
    const key = norm(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    picked.push(item);
  });
  if (picked.length < need) {
    shuffle(BANK_EN, random).forEach((item) => {
      if (picked.length >= need) return;
      const key = norm(item);
      if (seen.has(key)) return;
      seen.add(key);
      picked.push(item);
      usedBank.push(item);
    });
  }
  return { picked, usedBank };
}

function makeMultipleChoice(pair, pairs, random, id) {
  const others = pairs.filter((item) => norm(item.en) !== norm(pair.en)).map((item) => item.en);
  const { picked, usedBank } = takeDistractors(pair.en, others, random, 3);
  if (!picked.length) return null;
  return {
    id,
    type: "multipleChoice",
    promptJa: `${pair.ja}は英語で？`,
    promptEn: "",
    speak: { prompt: { text: `${pair.ja}は英語で？`, lang: "ja" } },
    choices: shuffle([pair.en, ...picked], random),
    answer: pair.en,
    display: pair.en,
    vocabKey: norm(pair.en),
    review: usedBank.length > 0,
  };
}

function makeMatching(group, random, id) {
  if (group.length < 2) return null;
  const left = shuffle(group.map((pair, index) => ({ id: `${id}-l${index}`, text: pair.ja })), random);
  const right = shuffle(group.map((pair, index) => ({ id: `${id}-r${index}`, text: pair.en })), random);
  const pairs = group.map((pair, index) => ({
    leftId: `${id}-l${index}`,
    rightId: `${id}-r${index}`,
  }));
  return {
    id,
    type: "matching",
    promptJa: "にほんごと えいごを つなげよう",
    promptEn: "日本語をタップして、合う英語をタップしよう！",
    speak: { prompt: { text: "にほんごと えいごを つなげよう", lang: "ja" } },
    left,
    right,
    pairs,
    answer: "",
    vocabKey: group.map((pair) => norm(pair.en)).join(","),
    review: group.length < 4,
  };
}

function makeSpelling(pair, hints, id) {
  const letters = lettersOnly(pair.en);
  if (letters.length < 2 || letters.length > 16) return null;
  return {
    id,
    type: "spelling",
    promptJa: `${pair.ja}は英語で？`,
    promptEn: "",
    speak: { prompt: { text: `${pair.ja}は英語で？`, lang: "ja" } },
    slots: spellingSlots(pair.en.trim()),
    hint: hints ? firstLetter(pair.en) : "",
    answer: pair.en.trim(),
    display: pair.en.trim(),
    vocabKey: norm(pair.en),
    review: false,
  };
}

function extraTiles(tokens, pairs, random, direction) {
  const pool = direction === "en-to-ja"
    ? ["です", "ます", "わたし", "これ", ...pairs.map((pair) => pair.ja)]
    : ["my", "big", "small", "there", "like", "see", ...pairs.map((pair) => pair.en.toLowerCase())];
  const unused = pool.filter((item) => item && !tokens.some((token) => norm(token) === norm(item)));
  return shuffle(unused, random).filter((item, index, list) => list.findIndex((other) => norm(other) === norm(item)) === index).slice(0, 2);
}

function makeSentence(pair, pairs, level, direction, random, id, templateIndex) {
  let promptJa = "";
  let promptEn = "";
  let tokens = [];
  let source = "template";
  let approved = false;
  if (pair.sentenceEn) {
    tokens = tokenize(pair.sentenceEn);
    promptJa = pair.sentenceJa || `${pair.ja}`;
    promptEn = "";
    source = "teacher";
    // Teacher-supplied sentences still need review before publishing.
    approved = false;
    direction = "ja-to-en";
  } else if (direction === "en-to-ja") {
    const template = templatesFor(pair, level)[templateIndex % 2];
    tokens = template.ja.replace(/[。！？]/g, "").split(/\s+/).filter(Boolean);
    promptJa = "えいごを にほんごに しよう";
    promptEn = template.en.join(" ");
    if (tokens.length < 2) return null;
  } else {
    const template = templatesFor(pair, level)[templateIndex % 2];
    tokens = template.en;
    promptJa = template.ja;
    promptEn = "";
  }
  if (tokens.length < 2 || tokens.length > 10) return null;
  const tiles = shuffle([...tokens, ...extraTiles(tokens, pairs, random, direction)], random);
  return {
    id,
    type: "sentence",
    promptJa,
    promptEn,
    speak: promptEn
      ? { prompt: { text: promptEn, lang: "en" } }
      : { prompt: { text: promptJa, lang: "ja" } },
    direction: direction === "en-to-ja" && source !== "teacher" ? "en-to-ja" : "ja-to-en",
    tiles,
    answer: tokens,
    accept: sentenceAlternates(tokens),
    display: tokens.join(" "),
    vocabKey: norm(pair.en),
    review: source !== "teacher",
    approved,
    sentenceSource: source,
  };
}

function matchGroups(pairs) {
  const pending = [...pairs];
  const groups = [];
  while (pending.length >= 2) {
    let size = 5;
    if (pending.length < 4) size = pending.length;
    else if (pending.length === 4 || pending.length === 6 || pending.length === 7 || pending.length === 8) size = pending.length === 8 ? 4 : Math.min(5, pending.length);
    if (pending.length > 5 && pending.length < 8) size = 5;
    if (pending.length === 6 || pending.length === 7) {
      groups.push(pending.splice(0, 5));
      break;
    }
    groups.push(pending.splice(0, Math.min(size, pending.length)));
    if (groups[groups.length - 1].length < 2) {
      groups.pop();
      break;
    }
  }
  return groups;
}

function generateHomework(pairs, options = {}) {
  const source = Array.isArray(pairs) ? pairs.filter((pair) => pair?.ja && pair?.en) : [];
  const warnings = [...(options.warnings || [])];
  if (!source.length) return { questions: [], warnings, error: "日本語と英語の単語を入力してください。" };
  const level = LEVELS.includes(options.level) ? options.level : "beginner";
  const types = {
    multipleChoice: options.types?.multipleChoice !== false,
    matching: options.types?.matching !== false,
    spelling: options.types?.spelling !== false,
    sentence: options.types?.sentence !== false,
  };
  if (!TYPES.some((type) => types[type])) {
    return { questions: [], warnings, error: "問題の種類を1つ以上選んでください。" };
  }
  const hints = options.hints != null ? Boolean(options.hints) : level === "beginner";
  const direction = options.sentenceDirection === "en-to-ja" ? "en-to-ja" : "ja-to-en";
  const random = makeRandom(options.seed);
  const shuffleWords = options.shuffleWords !== false;
  // Random mode shuffles the word list so small question counts cover more than the top rows.
  const list = shuffleWords ? shuffle(source, random) : source;
  const buckets = [];

  if (types.multipleChoice) {
    const items = list.map((pair, index) => makeMultipleChoice(pair, list, random, `mc-${index + 1}`)).filter(Boolean);
    if (items.some((item) => item.review)) warnings.push("4択のまちがい選択肢が足りない単語は、用意した単語で補いました。確認してください。");
    if (items.length) buckets.push(items);
    else warnings.push("4択を作れる単語がありません。");
  }
  if (types.matching) {
    const items = matchGroups(list).map((group, index) => makeMatching(group, random, `match-${index + 1}`)).filter(Boolean);
    if (list.length < 4) warnings.push("線つなぎは4〜5語が目安です。単語が少ないので短い問題にしています。");
    if (items.length) buckets.push(items);
  }
  if (types.spelling) {
    const items = list.map((pair, index) => makeSpelling(pair, hints, `spell-${index + 1}`)).filter(Boolean);
    if (items.length < list.length) warnings.push("短すぎる、または記号だけの英語はスペリングから除きました。");
    if (items.length) buckets.push(items);
  }
  if (types.sentence) {
    const items = list.map((pair, index) => makeSentence(pair, list, level, direction, random, `sent-${index + 1}`, index)).filter(Boolean);
    if (items.length) buckets.push(items);
    else warnings.push("文をつくる問題を作れませんでした。");
  }

  const poolSize = buckets.reduce((sum, bucket) => sum + bucket.length, 0);
  const autoCount = options.count == null || options.count === "";
  const requestedRaw = autoCount ? NaN : Number(options.count);
  const count = autoCount
    ? Math.min(16, poolSize)
    : clampCount(options.count, list.length);
  // Compare against what the teacher asked for (before the 100-cap).
  const wanted = autoCount || !Number.isFinite(requestedRaw)
    ? count
    : Math.max(1, Math.round(requestedRaw));
  const questions = [];
  const cursors = buckets.map(() => 0);
  let moved = true;
  while (questions.length < count && moved) {
    moved = false;
    buckets.forEach((bucket, index) => {
      if (questions.length >= count) return;
      const item = bucket[cursors[index]];
      if (!item) return;
      cursors[index] += 1;
      questions.push(item);
      moved = true;
    });
  }
  if (!questions.length) return { questions: [], warnings, error: "この単語リストでは問題を作れません。" };
  if (questions.length < wanted) warnings.push(`最大${questions.length}問です。`);
  return {
    questions,
    warnings: [...new Set(warnings)],
    error: "",
    settings: {
      level,
      types,
      hints,
      sentenceDirection: direction,
      count,
      seed: Number(options.seed) || 1,
      shuffleWords,
    },
  };
}

function makeByType(type, pair, pairs, options, random, id) {
  if (type === "multipleChoice") return makeMultipleChoice(pair, pairs, random, id);
  if (type === "spelling") return makeSpelling(pair, options.hints != null ? Boolean(options.hints) : options.level === "beginner", id);
  if (type === "sentence") {
    return makeSentence(pair, pairs, options.level || "beginner", options.sentenceDirection || "ja-to-en", random, id, 0);
  }
  return null;
}

function regenerateAt(questions, index, pairs, options = {}) {
  const current = questions[index];
  if (!current) return { questions, error: "問題が見つかりません。" };
  const random = makeRandom(options.seed || Date.now());
  let next = null;
  if (current.type === "matching") {
    const group = current.left.map((item) => pairs.find((pair) => pair.ja === item.text)).filter(Boolean);
    next = makeMatching(group.length >= 2 ? group : pairs.slice(0, Math.min(5, pairs.length)), random, current.id);
  } else {
    const pair = pairs.find((item) => norm(item.en) === current.vocabKey) || pairs[index % pairs.length];
    next = pair ? makeByType(current.type, pair, pairs, options, random, current.id) : null;
  }
  if (!next) return { questions, error: "この問題は作り直せません。" };
  const copy = questions.slice();
  copy[index] = next;
  return { questions: copy, error: "" };
}

function updateSentence(question, edit, pairs, seed) {
  if (!question || question.type !== "sentence") return { error: "文の問題ではありません。" };
  const tokens = tokenize(edit?.sentence || "");
  if (tokens.length < 2) return { error: "2語以上の英文にしてください。" };
  if (tokens.length > 10) return { error: "文は10語までにしてください。" };
  const random = makeRandom(seed || 1);
  const tiles = shuffle([...tokens, ...extraTiles(tokens, pairs || [], random, "ja-to-en")], random);
  return {
    error: "",
    question: {
      ...question,
      promptJa: clip(edit?.promptJa || question.promptJa, 80),
      promptEn: "",
      direction: "ja-to-en",
      tiles,
      answer: tokens,
      accept: sentenceAlternates(tokens),
      display: tokens.join(" "),
      approved: Boolean(edit?.approved),
      sentenceSource: "teacher",
      review: false,
      speak: { prompt: { text: clip(edit?.promptJa || question.promptJa, 80), lang: "ja" } },
    },
  };
}

function updateQuestion(question, edit = {}) {
  if (!question) return { error: "問題がありません。" };
  if (question.type === "sentence") return { error: "文づくりは専用の編集を使ってください。" };
  const promptJa = clip(edit.promptJa ?? question.promptJa, 80);
  if (!promptJa) return { error: "問題文を入力してください。" };

  if (question.type === "multipleChoice") {
    const choices = (edit.choices || question.choices || [])
      .map((choice) => clip(choice, 40))
      .filter(Boolean)
      .slice(0, 4);
    if (choices.length < 2) return { error: "選択肢を2つ以上入れてください。" };
    const answer = clip(edit.answer ?? question.answer, 40);
    if (!choices.some((choice) => norm(choice) === norm(answer))) {
      return { error: "正解は選択肢の中から選んでください。" };
    }
    return {
      error: "",
      question: {
        ...question,
        promptJa,
        speak: { prompt: { text: promptJa, lang: "ja" } },
        choices,
        answer,
        display: answer,
        review: false,
      },
    };
  }

  if (question.type === "spelling") {
    const answer = clip(edit.answer ?? question.answer ?? question.display, 40).trim();
    if (lettersOnly(answer).length < 2) return { error: "スペリングの正解が短すぎます。" };
    if (lettersOnly(answer).length > 16) return { error: "スペリングの正解が長すぎます。" };
    return {
      error: "",
      question: {
        ...question,
        promptJa,
        speak: { prompt: { text: promptJa, lang: "ja" } },
        answer,
        display: answer,
        slots: spellingSlots(answer),
        hint: question.hint ? firstLetter(answer) : "",
        review: false,
      },
    };
  }

  if (question.type === "matching") {
    const pairEdits = Array.isArray(edit.pairs) ? edit.pairs : null;
    if (!pairEdits || !pairEdits.length) {
      return { error: "正しい組み合わせを入力してください。" };
    }
    const leftById = new Map((question.left || []).map((item) => [item.id, { ...item }]));
    const rightById = new Map((question.right || []).map((item) => [item.id, { ...item }]));
    const pairs = [];
    for (const row of pairEdits) {
      const ja = clip(row.ja, 40);
      const en = clip(row.en, 40);
      if (!ja || !en) return { error: "すべての正しい組み合わせを入力してください。" };
      const leftId = row.leftId || `match-l${pairs.length}`;
      const rightId = row.rightId || `match-r${pairs.length}`;
      leftById.set(leftId, { id: leftId, text: ja });
      rightById.set(rightId, { id: rightId, text: en });
      pairs.push({ leftId, rightId });
    }
    if (pairs.length < 2) return { error: "線つなぎは2組以上にしてください。" };
    const random = makeRandom(Date.now());
    const left = shuffle([...leftById.values()].filter((item) => pairs.some((pair) => pair.leftId === item.id)), random);
    const right = shuffle([...rightById.values()].filter((item) => pairs.some((pair) => pair.rightId === item.id)), random);
    return {
      error: "",
      question: {
        ...question,
        promptJa,
        speak: { prompt: { text: promptJa, lang: "ja" } },
        left,
        right,
        pairs,
        vocabKey: pairs.map((pair) => norm(rightById.get(pair.rightId)?.text)).filter(Boolean).join(","),
        review: false,
      },
    };
  }

  return { error: "この問題タイプは編集できません。" };
}

function setHintMode(questions, enabled) {
  return questions.map((question) => {
    if (question.type !== "spelling") return question;
    return { ...question, hint: enabled ? firstLetter(question.answer) : "" };
  });
}

function toPublic(question) {
  const base = {
    id: question.id,
    type: question.type,
    promptJa: question.promptJa || "",
    promptEn: question.promptEn || "",
    speak: question.speak?.prompt ? { prompt: question.speak.prompt } : null,
  };
  if (question.type === "multipleChoice") return { ...base, choices: question.choices || [] };
  if (question.type === "matching") return { ...base, left: question.left || [], right: question.right || [] };
  if (question.type === "spelling") {
    return { ...base, slots: question.slots || [], hint: question.hint || "" };
  }
  return {
    ...base,
    tiles: question.tiles || [],
    slotCount: Array.isArray(question.answer) ? question.answer.length : Number(question.slotCount || 0),
    direction: question.direction || "ja-to-en",
  };
}

/** Firestore forbids nested arrays; store accept as [{ tokens: string[] }]. */
function encodeAccept(accept) {
  if (!Array.isArray(accept) || !accept.length) return null;
  return accept.map((sequence) => {
    if (Array.isArray(sequence)) {
      return { tokens: sequence.map((token) => clip(String(token || ""), 40)).filter(Boolean) };
    }
    if (sequence && typeof sequence === "object" && Array.isArray(sequence.tokens)) {
      return { tokens: sequence.tokens.map((token) => clip(String(token || ""), 40)).filter(Boolean) };
    }
    return { tokens: tokenize(sequence) };
  }).filter((row) => row.tokens.length);
}

function decodeAcceptSequences(accept, fallbackAnswer) {
  if (!Array.isArray(accept) || !accept.length) {
    return Array.isArray(fallbackAnswer) ? [fallbackAnswer] : [];
  }
  return accept.map((sequence) => {
    if (Array.isArray(sequence)) return sequence;
    if (sequence && typeof sequence === "object" && Array.isArray(sequence.tokens)) return sequence.tokens;
    return tokenize(sequence);
  }).filter((sequence) => Array.isArray(sequence) && sequence.length);
}

function toSecret(question) {
  return {
    type: question.type,
    answer: question.answer,
    pairs: question.pairs || null,
    accept: encodeAccept(question.accept),
    display: question.display || "",
    vocabKey: question.vocabKey || "",
  };
}

function gradeAnswer(question, answer) {
  if (!question) return { correct: false, solution: "" };
  if (question.type === "matching") {
    const correct = (question.pairs || []).some((pair) => pair.leftId === answer?.leftId && pair.rightId === answer?.rightId);
    return { correct, solution: "" };
  }
  if (question.type === "spelling") {
    const correct = lettersOnly(answer) === lettersOnly(question.answer);
    return { correct, solution: correct ? "" : (question.display || question.answer || "") };
  }
  if (question.type === "sentence") {
    const tokens = Array.isArray(answer) ? answer : tokenize(answer);
    const got = tokens.map(norm).join(" ");
    const accepts = decodeAcceptSequences(question.accept, question.answer);
    const correct = accepts.some((sequence) => (sequence || []).map(norm).join(" ") === got);
    const solution = Array.isArray(question.answer) ? question.answer.join(" ") : (question.display || "");
    return { correct, solution: correct ? "" : solution };
  }
  const correct = norm(answer) === norm(question.answer);
  return { correct, solution: correct ? "" : (question.display || question.answer || "") };
}

function coversTokens(tokens, tiles) {
  const pool = (tiles || []).map(norm);
  return (tokens || []).every((token) => {
    const at = pool.indexOf(norm(token));
    if (at < 0) return false;
    pool.splice(at, 1);
    return true;
  });
}

function preparePack(rawQuestions, options = {}) {
  if (!Array.isArray(rawQuestions) || !rawQuestions.length || rawQuestions.length > 100) {
    return { ok: false, error: "問題は1〜100問にしてください。" };
  }
  const ids = new Set();
  const questions = [];
  for (const raw of rawQuestions) {
    const id = clip(raw?.id, 40);
    if (!/^[\w-]{1,40}$/.test(id) || ids.has(id) || !TYPES.includes(raw?.type)) {
      return { ok: false, error: "問題の形式が正しくありません。" };
    }
    ids.add(id);
    const question = {
      ...raw,
      id,
      promptJa: clip(raw.promptJa, 80),
      promptEn: clip(raw.promptEn, 120),
    };
    if (question.type !== "sentence" && question.direction !== "en-to-ja" && !question.promptJa && question.type !== "matching") {
      return { ok: false, error: "問題の文が空です。" };
    }
    if (question.type === "multipleChoice") {
      const choices = (question.choices || []).map((choice) => clip(choice, 40)).filter(Boolean).slice(0, 4);
      if (choices.length < 2 || !choices.some((choice) => norm(choice) === norm(question.answer))) {
        return { ok: false, error: "4択の正解が選択肢にありません。" };
      }
      question.choices = choices;
      question.answer = clip(question.answer, 40);
    } else if (question.type === "matching") {
      const left = question.left || [];
      const right = question.right || [];
      const pairs = question.pairs || [];
      if (left.length < 2 || left.length > 5 || left.length !== right.length || pairs.length !== left.length) {
        return { ok: false, error: "線つなぎのペアを確認してください。" };
      }
      const leftIds = new Set(left.map((item) => item.id));
      const rightIds = new Set(right.map((item) => item.id));
      const paired = pairs.every((pair) => leftIds.has(pair.leftId) && rightIds.has(pair.rightId));
      if (!paired) return { ok: false, error: "線つなぎのペアを確認してください。" };
    } else if (question.type === "spelling") {
      if (lettersOnly(question.answer).length < 2) return { ok: false, error: "スペリングの正解が短すぎます。" };
      question.hint = question.hint ? firstLetter(question.answer) : "";
    } else if (question.type === "sentence") {
      if (!Array.isArray(question.answer) || question.answer.length < 2 || !coversTokens(question.answer, question.tiles)) {
        return { ok: false, error: "文の単語タイルを確認してください。" };
      }
      question.accept = encodeAccept(question.accept || sentenceAlternates(question.answer));
    }
    if (options.assigning && !question.approved) {
      return { ok: false, error: "すべての問題の音声を確認してから出してください。" };
    }
    questions.push(question);
  }
  return {
    ok: true,
    error: "",
    questions,
    publicQuestions: questions.map(toPublic),
    secrets: Object.fromEntries(questions.map((question) => [question.id, toSecret(question)])),
  };
}

export {
  parseVocabulary,
  generateHomework,
  regenerateAt,
  updateSentence,
  updateQuestion,
  setHintMode,
  toPublic,
  toSecret,
  gradeAnswer,
  preparePack,
};
