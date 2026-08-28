/**
 * Homework Learny voice session (Gemini Live). Replaces Minecraft quest session.
 */
import { GeminiLiveAPI, MultimodalLiveResponseType } from "./gemini-api.js";
import { AudioStreamer, AudioPlayer } from "./media-utils.js";
import {
  RecordMemoryTool,
  CompleteSegmentTool,
  AwardBadgeTool,
} from "./lesson-tools.js";
import {
  matchesPatterns,
  normalizeText,
  getActiveLevelInfo,
  getActiveLesson,
  getActiveLessonId,
  loadLessonState,
  getCurrentSegment,
  getSegmentById,
  completeSegment,
  recordMemory,
  recordLessonBadge,
  getLesson,
  buildLessonInstructions,
  buildOpeningNudge,
  buildAdvanceNudge,
  buildHandoffOpeningNudge,
  buildSilencePrompt,
  getClickChoices,
  isPart1Complete,
  getSegmentChapterMeta,
  resetLesson,
  getActiveLevelId,
} from "./lesson-engine.js";
import { resolveProxyUrl } from "./proxy-config.js";
import { QuestSfx } from "./quest-sfx.js";

const DEBUG_MODE =
  new URLSearchParams(window.location.search).has("debug") ||
  (() => {
    try {
      return localStorage.getItem("learny_debug") === "1";
    } catch {
      return false;
    }
  })();

const nativeConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const logBuffer = [];
window.__learnyLog = logBuffer;
function dbg(event, detail) {
  const entry = {
    t: new Date().toISOString().slice(11, 23),
    event,
    ...(detail !== undefined ? { detail } : {}),
  };
  logBuffer.push(entry);
  if (logBuffer.length > 400) logBuffer.shift();
  if (DEBUG_MODE) nativeConsole.log(`[learny ${entry.t}] ${event}`, detail ?? "");
}

if (!DEBUG_MODE) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

const projectId = "ai-sensei-8849b";
const model = "gemini-live-2.5-flash-native-audio";
const LEVEL_INFO = getActiveLevelInfo();
const LESSON = getActiveLesson();
let activeProxyUrl = resolveProxyUrl();

const voice = "Kore";
const temperature = 0.9;
const volumeLevel = 80;
const SILENCE_PROMPT_MS = 30000;
/** Part 1: reconnect Live after these segments complete (fresh system instructions). */
const PART1_HANDOFF_AFTER = new Set(["ch0", "quiz1", "daily1", "ch6"]);
const HANDOFF_MARKER = "__HANDOFF__";

const btnAction = document.getElementById("btn-action");
const btnMute = document.getElementById("btn-mute");
const btnRetry = document.getElementById("btn-retry");
const btnSend = document.getElementById("btn-send");
const chatInput = document.getElementById("chat-input");
const chatArea = document.getElementById("chat-area");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const questBanner = document.getElementById("quest-banner");
const questBannerNum = document.getElementById("quest-banner-num");
const questBannerTitleEn = document.getElementById("quest-banner-title-en");
const questBannerGoal = document.getElementById("quest-banner-goal");
const questBannerHint = document.getElementById("quest-banner-hint");
const questBannerProgress = document.getElementById("quest-banner-progress");
const questSteps = document.getElementById("quest-steps");
const questBadgeLabel = document.querySelector(".quest-badge-label");
const emptyState = document.getElementById("empty-state");
const questModal = document.getElementById("quest-modal");
const questModalTitle = document.getElementById("quest-modal-title");
const questModalBody = document.getElementById("quest-modal-body");
const questModalNext = document.getElementById("quest-modal-next");
const questModalDone = document.getElementById("quest-modal-done");
const questSkipBtn = document.getElementById("quest-skip-btn");
const choiceBar = document.getElementById("lesson-choice-bar");

const ICON_PHONE =
  '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.97-1.16a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const ICON_PHONE_OFF =
  '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M10.7 13.3 5 19"/><path d="M14.3 10.7 19 5"/><path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h2a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

let client = null;
let audioStreamer = null;
let audioPlayer = null;
let connected = false;
let audioStreaming = false;
let actionState = "idle";
let isMuted = false;
let intentionalDisconnect = false;
let isAutoReconnecting = false;
/** Fresh Live reconnect at a Part 1 chapter hinge (not drop-resume). */
let isChapterHandoff = false;
let isHandoffRunning = false;
let pendingHandoffTimer = null;
let pendingHandoffQuote = "";
/** Skip sending the child's turn on the old socket when a handoff was just scheduled. */
let skipOutboundForHandoff = false;
/** Options for the next kickOpeningTurn (handoff / stuck retry survive SETUP_COMPLETE). */
let pendingOpeningKickOpts = null;
let sessionResumeHandle = null;
let chatMessages = [];
let openingSent = false;
let userActivityOpen = false;
let lastSilenceUserSpeechAt = 0;
let lastSilenceAssistantDoneAt = Date.now();
let lastSilencePromptAt = 0;
let silenceWatchId = null;
let pendingReplyWatchId = null;
let pendingReplyText = "";
let leadWatchId = null;
let leadWatchArmedFor = "";
let assistantTranscriptOpen = false;
let assistantTurnTranscript = "";
let turnEndProcessed = false;
let idleGeneration = 0;
let renderChatScheduled = false;
let awaitingAssistantReply = false;
let turnCloseTimer = null;
let lastOutboundText = "";
let lastOutboundAt = 0;
let lastSideEffectKey = "";
let lastSideEffectAt = 0;
let lastVadUserText = "";
let lastVadUserAt = 0;
let lastUserTurnAt = 0;
let lastAssistantAudioAt = 0;
let lastTranscriptChunkAt = 0;
/** After Learny answers the child, block coach client_content until the child speaks again. */
let blockCoachUntilUserSpeaks = false;
/** Max one hidden coach note per user turn — stops apology / translation nudge loops. */
let coachNudgesSinceLastUserTurn = 0;
let postTurnNudgesForUserKey = "";
let lastAssistantBubbleAt = 0;
let typedSendSkippedForVoice = false;
let userTurnSentViaClientText = false;
const VOICE_TYPED_DEDUP_MS = 5000;
const TRANSCRIPT_SETTLE_MS = 2200;
const sentTeacherNotes = new Set();
const REPLY_WATCH_MS = 1200;
const REPLY_WATCH_RETRY_MS = 1200;
const REPLY_WATCH_MAX = 2;
const LEAD_WATCH_MS = 2800;
const PLAYBACK_IDLE_MS = 250;
const CH2_SEARCH_RALLIES = 3;
const questSfx = new QuestSfx();

/** Tracks the sand-search chat phase so Learny does ~3 rallies before "found sand yet?" */
let ch2Search = { phase: "idle", rallies: 0, lastEverydayKey: "", askedKeys: [] };

const CH2_EVERYDAY_BANK = [
  {
    key: "waves",
    label: "Can you hear the waves?",
    test: /wave|waves|きこえる|うみの\s*おと|なみ/i,
  },
  {
    key: "ocean_mountains",
    label: "Do you like the ocean or the mountains?",
    test: /ocean or the mountains|うみと\s*やま|どっちが\s*すき/i,
  },
  {
    key: "hot",
    label: "Is it hot?",
    test: /\bis it hot\b|あつい[？?]|きょうは\s*あつい/i,
  },
  {
    key: "see",
    label: "What do you see?",
    test: /what do you see|なにが\s*みえる|何が\s*見える/i,
  },
  {
    key: "tired",
    label: "Are you tired?",
    test: /are you tired|つかれた|つかれて/i,
  },
];

function resetCh2Search() {
  ch2Search = { phase: "idle", rallies: 0, lastEverydayKey: "", askedKeys: [] };
}

function detectCh2EverydayKey(text) {
  const t = String(text || "");
  if (!t) return "";
  if (/have you found.*sand|found sand yet|let me know when you find|みつけたら|みつからない/i.test(t)) {
    return "";
  }
  for (const item of CH2_EVERYDAY_BANK) {
    if (item.test.test(t)) return item.key;
  }
  return "";
}

function ch2UnusedEverydaySuggestions() {
  const asked = new Set(ch2Search.askedKeys || []);
  if (ch2Search.lastEverydayKey) asked.add(ch2Search.lastEverydayKey);
  const unused = CH2_EVERYDAY_BANK.filter((item) => !asked.has(item.key));
  const pool = unused.length ? unused : CH2_EVERYDAY_BANK.filter((item) => item.key !== ch2Search.lastEverydayKey);
  return (pool.length ? pool : CH2_EVERYDAY_BANK)
    .slice(0, 3)
    .map((item) => item.label)
    .join(" / ");
}

function rememberCh2EverydayFromAssistant(text) {
  const key = detectCh2EverydayKey(text);
  if (!key) return;
  ch2Search.lastEverydayKey = key;
  if (!ch2Search.askedKeys.includes(key)) {
    ch2Search.askedKeys.push(key);
  }
}

function ch2AntiRepeatRule() {
  const lastKey = ch2Search.lastEverydayKey;
  const lastLabel = CH2_EVERYDAY_BANK.find((item) => item.key === lastKey)?.label || "";
  const suggestions = ch2UnusedEverydaySuggestions();
  return (
    "Ask ONE NEW everyday question — never repeat the same question the child just answered. " +
    (lastLabel ? `FORBIDDEN: ask again "${lastLabel}". ` : "") +
    `Prefer: ${suggestions}.`
  );
}
let final1Quiz = {
  indices: [],
  cursor: 0,
  answered: 0,
  lastAnsweredPromptJa: "",
  answeredPrompts: [],
};
let bannerSegmentId = "";

const ENDING1_BEATS = [
  {
    en: "Perfect! We made a fish tank together! Thank you for helping!",
    coach: "Beat 1 ONLY: Perfect! We made a fish tank together! Thank you for helping! JP: ぱーふぇくと！ いっしょに すいそうを つくれたね！ てつだって くれて ありがとう！ Then STOP and WAIT.",
  },
  {
    en: "Hold on... we don't have any fish in the fish tank! That's for next time!",
    coach: "Beat 2 ONLY: Hold on... we don't have any fish in the fish tank! That's for next time! JP: あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだよ！ Then WAIT.",
  },
  {
    en: "What kind of fish should we catch?",
    coach: "Beat 3 ONLY: What kind of fish should we catch? JP: どんな おさかなを つかまえよう？ Then WAIT for their idea.",
  },
  {
    en: "How many do we want?",
    coach: "Beat 4 ONLY: How many do we want? JP: なんびき ほしい？ Then WAIT for their answer.",
  },
  {
    en: "Hmm... I can't stop thinking about it!",
    coach: "Beat 5 ONLY: Hmm... I can't stop thinking about it! JP: うーん… ワクワク しちゃう！ Then WAIT.",
  },
  {
    en: "Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time!",
    coach: "Beat 6 FINAL ONLY: Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time! JP: つぎの まいんくらふと レッスンで この すいそうを かざって おさかなを いれて かんせい させよう！ また ね！ Do NOT add more lines.",
    final: true,
  },
];

let ending1Beat = { userTurns: 0, hangUpScheduled: false, advancedForUserKey: "" };

function resetEnding1Beat() {
  ending1Beat = { userTurns: 0, hangUpScheduled: false, advancedForUserKey: "" };
}

function getEnding1NextBeatIndex() {
  return Math.min(ending1Beat.userTurns + 1, ENDING1_BEATS.length - 1);
}

function buildEnding1OutboundCoach({ afterAdvance = false } = {}) {
  if (getCurrentSegment()?.id !== "ending1") return "";
  const idx = afterAdvance ? getEnding1BeatIndex() : getEnding1NextBeatIndex();
  const beat = ENDING1_BEATS[idx];
  if (!beat) return "";
  return (
    "[Teacher note — do not read aloud] Child replied — react briefly to what they said, then say ONLY this next ending beat (English then ひらがな), then WAIT. " +
    beat.coach +
    beginnerTurnHint()
  );
}

function flushEnding1NextBeatCoach(source = "voice") {
  if (getCurrentSegment()?.id !== "ending1") return;
  const beat = ENDING1_BEATS[getEnding1BeatIndex()];
  if (!beat) return;
  const key = `ending1-next-${ending1Beat.userTurns}`;
  if (sentTeacherNotes.has(key)) return;
  const note =
    "[Teacher note — do not read aloud] Child replied — react briefly, then say ONLY this next ending beat (English then ひらがな), then WAIT. " +
    beat.coach +
    beginnerTurnHint();
  const trySend = (attempt = 0) => {
    if (actionState !== "active" || !client?.connected) return;
    if (assistantIsSpeaking() && attempt < 12) {
      setTimeout(() => trySend(attempt + 1), 250);
      return;
    }
    sendTeacherNote(key, note, { allowRetry: attempt < 12 });
    if (!sentTeacherNotes.has(key) && attempt < 12) {
      setTimeout(() => trySend(attempt + 1), 300);
    }
  };
  trySend();
}

function getEnding1BeatIndex() {
  return Math.min(ending1Beat.userTurns, ENDING1_BEATS.length - 1);
}

function ending1CoachHint() {
  if (getCurrentSegment()?.id !== "ending1") return "";
  const idx = getEnding1BeatIndex();
  const beat = ENDING1_BEATS[idx];
  if (!beat) return " Ending done — quick goodbye only.";
  return (
    ` Ending step ${idx + 1}/${ENDING1_BEATS.length} — ONE beat per turn, then WAIT. ` +
    `${beat.coach} FORBIDDEN: saying multiple beats in one message.`
  );
}

function assistantEnding1Monologue(text) {
  const t = String(text || "").toLowerCase();
  let hits = 0;
  if (/perfect|fish tank together|made a fish tank/i.test(t)) hits += 1;
  if (/hold on|don't have any fish|no fish in the fish tank/i.test(t)) hits += 1;
  if (/what kind of fish/i.test(t)) hits += 1;
  if (/how many do we want/i.test(t)) hits += 1;
  if (/can't stop thinking/i.test(t)) hits += 1;
  if (/next minecraft lesson|decorate this tank/i.test(t)) hits += 1;
  return hits >= 2;
}

function looksLikeEnding1FinalLine(text) {
  return /next minecraft|decorate this tank|finish it|see you next time|また\s*ね|つぎの.*まいんくらふと/i.test(
    String(text || "")
  );
}

/** Avoid hang-up on the first words of the closing line — wait for a full goodbye. */
function looksLikeEnding1FinalLineComplete(text) {
  const t = String(text || "").toLowerCase();
  const hasOpen = /next minecraft|つぎの.*まいんくらふと|decorate this tank/.test(t);
  const hasClose = /see you next|また\s*ね|finish it|かんせいさせ/.test(t);
  return hasOpen && hasClose;
}

function maybeNotifyEnding1NextBeat() {
  flushEnding1NextBeatCoach("notify");
}

function maybeAdvanceEnding1Beat(userText, { skipNotify = false } = {}) {
  if (getCurrentSegment()?.id !== "ending1") return false;
  const userKey = normalizeUserText(userText);
  if (userKey && ending1Beat.advancedForUserKey === userKey) {
    dbg("ending1 advance skipped; already advanced for this reply");
    if (!skipNotify) flushEnding1NextBeatCoach("retry");
    return false;
  }
  ending1Beat.advancedForUserKey = userKey;
  ending1Beat.userTurns += 1;
  updateLessonBanner();
  if (!skipNotify) maybeNotifyEnding1NextBeat();
  return true;
}

function scheduleEndCallAfterEnding() {
  if (ending1Beat.hangUpScheduled) return;
  ending1Beat.hangUpScheduled = true;
  stopSilenceWatch();

  const hangUp = () => {
    if (actionState !== "active") return;
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
    notifyCallState();
  };

  const waitForPlaybackDone = () => {
    if (actionState !== "active" || !client?.connected) return;
    const left = assistantPlaybackMsLeft();
    if (left > PLAYBACK_IDLE_MS) {
      setTimeout(waitForPlaybackDone, Math.min(left + 150, 400));
      return;
    }
    // Grace after audio queue drains — final line is long (EN + JP).
    setTimeout(hangUp, 3200);
  };

  whenAssistantIdle(() => {
    // TURN_COMPLETE often arrives before the last audio chunks are queued.
    setTimeout(waitForPlaybackDone, 1500);
  }, "ending-hangup");
}

function maybeCompleteEnding1AndHangUp(userText = "") {
  const state = loadLessonState();
  if (state.lessonId !== "part1") return false;
  const seg = getCurrentSegment(state);
  if (seg?.id !== "ending1" && !state.complete) return false;
  if (!state.completedSegmentIds.includes("ending1")) {
    const result = completeSegment("ending1", { userQuote: userText });
    if (!result.ok) return false;
    try {
      questSfx.playQuestComplete();
    } catch {
      // ignore
    }
    updateLessonBanner();
    showLessonCompleteModal();
  }
  scheduleEndCallAfterEnding();
  return true;
}

function maybeEnding1HangUpCheck() {
  if (ending1Beat.hangUpScheduled) return;
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (seg?.id !== "ending1" && !state.complete) return;
  if (!turnEndProcessed) return;
  if (!looksLikeEnding1FinalLineComplete(lastAssistantText())) return;
  maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
}

let ending1HangUpWatchId = null;

function clearEnding1HangUpWatch() {
  if (ending1HangUpWatchId) {
    clearTimeout(ending1HangUpWatchId);
    ending1HangUpWatchId = null;
  }
}

/** Poll until the full goodbye is in the transcript, then auto hang-up. */
function ensureEnding1HangUpWatch() {
  if (actionState !== "active" || !client?.connected || ending1Beat.hangUpScheduled) return;
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (seg?.id !== "ending1" && !state.complete) return;

  clearEnding1HangUpWatch();
  const tick = (attempt = 0) => {
    ending1HangUpWatchId = null;
    if (actionState !== "active" || !client?.connected || ending1Beat.hangUpScheduled) return;
    if (looksLikeEnding1FinalLineComplete(lastAssistantText()) && turnEndProcessed) {
      maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
      return;
    }
    if (attempt < 90) {
      ending1HangUpWatchId = setTimeout(() => tick(attempt + 1), 400);
    }
  };
  tick();
}

function maybeEnding1AwaitingReplyNudge() {
  if (getCurrentSegment()?.id !== "ending1") return;
  if (!awaitingAssistantReply) return;
  if (hasAssistantReplySinceUser(lastPendingUserText || recentUserMessages(1)[0] || "")) return;
  flushEnding1NextBeatCoach("await");
}

function maybeEnding1CoachNudge() {
  if (getCurrentSegment()?.id !== "ending1") return;
  const assistant = lastAssistantText();
  if (!assistantEnding1Monologue(assistant)) return;
  const idx = getEnding1BeatIndex();
  whenAssistantIdle(() => {
    sendTeacherNote(
      `ending1-coach-${idx}`,
      "[Teacher note — do not read aloud] Ending is a CONVERSATION — ONE short beat per turn only. " +
        "You combined multiple beats — wrong. " +
        ending1CoachHint() +
        beginnerTurnHint()
    );
  }, "ending1-coach");
}

function resetFinal1Quiz() {
  final1Quiz = {
    indices: [],
    cursor: 0,
    answered: 0,
    lastAnsweredPromptJa: "",
    answeredPrompts: [],
  };
}

function shuffleIndices(n) {
  const arr = [...Array(n).keys()];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initFinal1QuizIfNeeded() {
  if (getCurrentSegment()?.id !== "final1") return;
  if (final1Quiz.indices.length) return;
  const items = getCurrentSegment().items || [];
  const pick = Math.min(items.length, 5 + Math.floor(Math.random() * 2));
  final1Quiz.indices = shuffleIndices(items.length).slice(0, pick);
  final1Quiz.cursor = 0;
  final1Quiz.answered = 0;
}

function getCurrentFinal1Item() {
  initFinal1QuizIfNeeded();
  const seg = getCurrentSegment();
  if (seg?.id !== "final1") return null;
  const idx = final1Quiz.indices[final1Quiz.cursor];
  if (idx === undefined) return null;
  return seg.items?.[idx] || null;
}

function currentFinal1Prompt() {
  const item = getCurrentFinal1Item();
  return item?.promptHira || item?.promptJa || item?.promptEn || "";
}

function final1PromptCore(prompt) {
  return String(prompt || "")
    .replace(/は\s*英語で[？?]?/g, "")
    .replace(/は\s*えいごで[？?]?/g, "")
    .replace(/[「」！!？?\s]/g, "")
    .trim();
}

function final1RemainingCount() {
  initFinal1QuizIfNeeded();
  return Math.max(0, final1Quiz.indices.length - final1Quiz.cursor);
}

function matchesFinal1Answer(userText, item) {
  if (!item) return false;
  if (matchesPatterns(userText, item.patterns || [])) return true;
  const n = normalizeText(userText);
  if (!n) return false;
  for (const choice of item.choices || []) {
    const core = normalizeText(String(choice).replace(/[!?.]/g, ""));
    if (core && (n === core || n.includes(core) || core.includes(n))) return true;
  }
  const ans = normalizeText(String(item.answer || "").replace(/[!?.]/g, ""));
  if (ans && (n === ans || n.includes(ans) || ans.includes(n))) return true;
  return false;
}

function assistantRepeatsFinal1Prompt(assistant, prompt) {
  const core = final1PromptCore(prompt);
  if (!core || core.length < 2) return false;
  const a = String(assistant || "").replace(/\s/g, "").replace(/[「」]/g, "");
  return a.includes(core.replace(/\s/g, ""));
}

function assistantDoubledFinal1Prompt(assistant) {
  const t = String(assistant || "");
  const cueRe =
    /(?:['「『][^'」』]+['」』]|[\u3040-\u309F]{2,24}[！!]?)\s*は\s*(?:英語|えいご)で[？?]?/gi;
  const prompts = t.match(cueRe) || [];
  if (prompts.length < 2) return false;
  const norm = (s) => String(s).replace(/\s/g, "").replace(/[「」'""]/g, "").toLowerCase();
  const n0 = norm(prompts[0]);
  return prompts.slice(1).some((p) => {
    const pn = norm(p);
    return pn === n0 || pn.includes(n0) || n0.includes(pn);
  });
}

/** One consolidated coach note per turn — multiple final1 notes caused doubled speech. */
function maybeFinal1CoachNudge() {
  if (getCurrentSegment()?.id !== "final1") return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  const assistant = lastAssistantText();
  let next = currentFinal1Prompt();

  if (!next && final1Quiz.answered > 0) {
    whenAssistantIdle(() => {
      sendTeacherNote(
        "final1-done",
        "[Teacher note — do not read aloud] Final challenge quiz is FINISHED. " +
          "Do NOT ask another quiz question. Praise briefly, then call complete_segment(final1)." +
          beginnerTurnHint()
      );
    }, "final1-coach");
    return;
  }
  if (!next) return;

  const item = getCurrentFinal1Item();
  const currentCue = item?.promptHira || item?.promptJa || "";
  const doubled = assistantDoubledFinal1Prompt(assistant);
  const userAnsweredCurrent = item && user.trim() && matchesFinal1Answer(user, item);
  const repeatsCurrent = currentCue && assistantRepeatsFinal1Prompt(assistant, currentCue);
  const repeatsAnswered =
    final1Quiz.lastAnsweredPromptJa &&
    assistantRepeatsFinal1Prompt(assistant, final1Quiz.lastAnsweredPromptJa);
  const wrongPrompt = assistantAskedWrongFinal1Prompt(assistant);
  const bare = assistantBareFinal1Question(assistant);
  const kanji = assistantHasKanji(assistant);
  const story = looksLikeFinal1StoryQuestion(assistant) && !/(?:英語|えいご)で/.test(assistant);

  if (userAnsweredCurrent && repeatsCurrent && final1Quiz.answeredPrompts.at(-1) !== currentCue) {
    maybeAdvanceFinal1Quiz(user);
    maybeCompleteFinal1FromClient(user);
    next = currentFinal1Prompt();
  }

  const needCoach =
    doubled ||
    (userAnsweredCurrent && repeatsCurrent) ||
    (repeatsAnswered && user.trim()) ||
    wrongPrompt ||
    bare ||
    kanji ||
    story;
  if (!needCoach) return;

  const remaining = final1RemainingCount();
  whenAssistantIdle(() => {
    sendTeacherNote(
      `final1-coach-${final1Quiz.answered}-${final1Quiz.cursor}`,
      "[Teacher note — do not read aloud] ONE short message only — never repeat the same line twice. " +
        (doubled ? "You doubled the question — say each cue ONCE. " : "") +
        (kanji ? "Use ひらがな ONLY. " : "") +
        (bare ? "Include the full cue, not bare は えいごで？. " : "") +
        (wrongPrompt || story ? "Use ONLY the listed cue. " : "") +
        (userAnsweredCurrent && repeatsCurrent
          ? "Child already answered — praise, then NEXT cue (not the same one). "
          : "") +
        (next
          ? `Ask EXACTLY once: ${next}` +
            (remaining === 1 ? " (LAST question — then complete_segment(final1).)" : "")
          : "Quiz done — call complete_segment(final1).") +
        beginnerTurnHint()
    );
  }, "final1-coach");
}

function maybeAdvanceFinal1Quiz(userText) {
  if (getCurrentSegment()?.id !== "final1") return false;
  const item = getCurrentFinal1Item();
  if (!item) return false;
  if (!matchesFinal1Answer(userText, item)) return false;
  const answeredPromptJa = item.promptHira || item.promptJa || item.promptEn || "";
  final1Quiz.lastAnsweredPromptJa = answeredPromptJa;
  if (answeredPromptJa) final1Quiz.answeredPrompts.push(answeredPromptJa);
  final1Quiz.answered += 1;
  final1Quiz.cursor += 1;
  updateLessonBanner();
  return true;
}

function countFinal1ItemsAnswered() {
  initFinal1QuizIfNeeded();
  return final1Quiz.answered;
}

function canCompleteFinal1Part1() {
  if (getActiveLessonId() !== "part1") return true;
  if (getCurrentSegment().id !== "final1") return true;
  initFinal1QuizIfNeeded();
  return !getCurrentFinal1Item() && final1Quiz.answered > 0;
}

function final1CoachHint() {
  const seg = getCurrentSegment();
  if (seg?.id !== "final1") return "";
  initFinal1QuizIfNeeded();
  const done = final1Quiz.answered;
  const total = final1Quiz.indices.length;
  const next = currentFinal1Prompt();
  const remaining = final1RemainingCount();
  const doneList = final1Quiz.answeredPrompts.slice(-3).join(" / ");
  return (
    ` Final1: ${done}/${total} done, ${remaining} left.` +
    (doneList ? ` Already answered (do NOT repeat): ${doneList}.` : "") +
    (next
      ? ` EXACT cue NOW (ひらがな only): ${next}` +
        (remaining === 1 ? " (LAST quiz item — say さいごの もんだい！ then this cue.)" : "")
      : " Quiz finished — call complete_segment(final1) now, then ending script.") +
    " FORBIDDEN: inventing questions, bare は えいごで？, kanji in Japanese."
  );
}

function peekNextFinal1Prompt() {
  initFinal1QuizIfNeeded();
  const seg = getCurrentSegment();
  if (seg?.id !== "final1") return "";
  const idx = final1Quiz.indices[final1Quiz.cursor + 1];
  if (idx === undefined) return "";
  const item = seg.items?.[idx];
  return item?.promptHira || item?.promptJa || item?.promptEn || "";
}

function assistantHasKanji(text) {
  return /[\u4E00-\u9FFF]/.test(String(text || ""));
}

function assistantAskedWrongFinal1Prompt(assistant) {
  const item = getCurrentFinal1Item();
  if (!item) return false;
  const a = String(assistant || "");
  if (!/は\s*英語で|は\s*えいごで|英語で？|えいごで？/.test(a)) return false;
  const cores = [item.promptHira, item.promptJa]
    .filter(Boolean)
    .map(final1PromptCore)
    .filter(Boolean);
  return !cores.some((core) => a.replace(/\s/g, "").includes(core.replace(/\s/g, "")));
}

function assistantBareFinal1Question(assistant) {
  const a = String(assistant || "");
  if (!/は\s*英語で[？?]?|は\s*えいごで[？?]?|英語で？|えいごで？/.test(a)) return false;
  return !/[がをにでのとも]{1,2}|すな|がらす|すいそう|かんじ|いろ|さかな/.test(a);
}

function maybeCompleteFinal1FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "final1") return false;
  initFinal1QuizIfNeeded();
  if (getCurrentFinal1Item()) return false;
  if (final1Quiz.answered < 1) return false;
  const result = completeSegment("final1", { userQuote: userText });
  if (!result.ok) return false;
  dbg("final1 auto-complete", userText);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  updateLessonBanner();
  configureGeminiClient(client);
  setTimeout(() => {
    if (actionState !== "active" || !client?.connected) return;
    whenAssistantIdle(() => {
      sendTeacherNote("advance-final1", buildAdvanceNudge(result.state));
    }, "final1-advance-seg");
  }, 350);
  return true;
}

function looksLikeFinal1StoryQuestion(text) {
  return /how do you say|you need sand|build your tank|need sand to build/i.test(String(text || "").toLowerCase());
}

function looksLikeDirectionPick(text) {
  const t = String(text || "").trim();
  return /^(left|right|みぎ|ひだり|右|左)$/i.test(t) || /\b(left|right)\b/i.test(t);
}

function looksLikeFoundSand(text) {
  const t = String(text || "").trim();
  if (/\b(i found some sand|i found sand|found some sand|found sand)\b/i.test(t)) return "phrase";
  if (/みつけた|見つけた|found it|見っけた|あった|すな.*(みつ|見つ)|見つけ.*すな/i.test(t)) return "found";
  // After "Have you found sand yet?", short yes = found (NOT everyday chat).
  if (
    assistantAskedFoundSandQuestion() &&
    looksLikeCh2ShortAck(t) &&
    !userSaysStillSearchingSand(t)
  ) {
    return "found";
  }
  return "";
}

function assistantAskedFoundSandQuestion(text = lastAssistantText()) {
  return /have you found.*sand|found sand yet|found any sand|すな.*(みつかった|みつけた)|みつかった[？?]|すなはみつかった/i.test(
    String(text || "")
  );
}

/** Sand-search coaching only on Ch2 (or after Ch1 phrases are done and dialog drifted). */
function isCh2SandSearchContext() {
  const segId = getCurrentSegment()?.id;
  if (segId === "ch2") return true;
  if (segId === "ch1" && !canCompleteCh1Part1()) return false;
  if (segId && segId !== "ch1" && segId !== "ch2") return false;
  const tail = [lastAssistantText(), ...recentUserMessages(4)].join(" ");
  return /still looking for sand|find sand|found sand yet|let me know when you find|have you found.*sand|すな.*(さが|探|みつ)|みつけたら|みつからない/i.test(
    tail
  );
}

function assistantAskedEverydayQuestion(text) {
  const t = String(text || "");
  if (/have you found.*sand|found sand yet|still looking for sand|let me know when you find|keep looking|みつけたら/i.test(t)) {
    return false;
  }
  if (/[？?]/.test(t)) return true;
  return /ocean|mountain|wave|tired|hot|cold|what do you see|weather|sleepy|hungry|あつい|つかれた|うみ|やま|なみ|おと|きこえる|なにが.*みえる|ねむい|おなか|different place|try a/i.test(
    t
  );
}

function needsCh2ElicitPhrase(assistantText, userText) {
  if (!isCh2SandSearchContext()) return false;
  if (userHasFoundSandPhrase()) return false;
  if (looksLikeFoundSand(userText) !== "found") return false;
  const a = String(assistantText || "");
  if (/i found some sand|can you say|say.*in english|いってみて|えいご/i.test(a)) return false;
  return /found|みつかった|みつけた|すご|great|やった|みつけ/i.test(a);
}

function buildCh2OutboundCoach(userText) {
  if (!isCh2SandSearchContext()) return "";
  const t = String(userText || "").trim();
  const assistant = lastAssistantText();
  const found = looksLikeFoundSand(t);

  if (/i put sand|put sand here|on the bottom|すいそうにいれ|砂を入れ/i.test(assistant)) {
    return (
      "[Teacher note — do not read aloud] WRONG chapter beat. Stay on Chapter 2. " +
      "FORBIDDEN: put sand in the tank / on the bottom (Chapter 6). " +
      "If they found sand: elicit I found some sand! then complete_segment(ch2). Next is Chapter 3 make glass." +
      beginnerTurnHint()
    );
  }

  if (found === "found") {
    return (
      "[Teacher note — do not read aloud] Child found sand (うん/はい/yes counts after Have you found sand yet?). " +
      "Speak ONE reply: short praise + Can you say, I found some sand! / 「I found some sand!」いってみて！ then WAIT. " +
      "FORBIDDEN: hungry, food, another everyday chat, put sand in the tank, Chapter 6." +
      beginnerTurnHint()
    );
  }
  if (found === "phrase") {
    return (
      "[Teacher note — do not read aloud] Child said I found some sand! Praise briefly, call complete_segment(ch2) NOW, " +
      "then Chapter 3: what do we do with sand to make glass? → I need to make glass. " +
      "FORBIDDEN: put sand in the tank / on the bottom." +
      beginnerTurnHint()
    );
  }
  if (userSaysStillSearchingSand(t)) {
    return (
      "[Teacher note — do not read aloud] Child still searching. React + ask ONE NEW everyday question. " +
      ch2AntiRepeatRule() +
      " Do NOT repeat Let me know when you find sand or Keep looking." +
      beginnerTurnHint()
    );
  }
  if (ch2Search.phase === "search" && ch2Search.rallies < CH2_SEARCH_RALLIES) {
    return (
      `[Teacher note — do not read aloud] Ch2 search chat ${ch2Search.rallies}/${CH2_SEARCH_RALLIES}. ` +
      "React briefly to the child, then " +
      ch2AntiRepeatRule() +
      " NOT Have you found sand yet?. NOT put sand in the tank." +
      beginnerTurnHint()
    );
  }
  if (assistantAskedFoundSandQuestion(assistant) && !userSaysStillSearchingSand(t)) {
    return (
      "[Teacher note — do not read aloud] You asked Have you found sand yet?. Treat a yes/うん as FOUND. " +
      "Elicit I found some sand! now — do NOT continue everyday chat." +
      beginnerTurnHint()
    );
  }
  return "";
}

function maybeCh2CorrectiveNudge() {
  if (!isCh2SandSearchContext()) return;
  const assistant = lastAssistantText();
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";

  if (needsCh2ElicitPhrase(assistant, user)) {
    whenAssistantIdle(() => {
      sendTeacherNote(
        `ch2-elicit-${normalizeUserText(user)}`,
        "[Teacher note — do not read aloud] Child found sand. Praise was OK but you MUST help them say " +
          "I found some sand! in English this turn (Can you say...? / いってみて)." +
          beginnerTurnHint() +
          " Do not stop after praise alone."
      );
    }, "ch2-elicit");
    return;
  }

  if (ch2Search.phase !== "search" || ch2Search.rallies >= CH2_SEARCH_RALLIES) return;
  if (assistantAskedEverydayQuestion(assistant)) return;
  if (/let me know when you find|みつけたら.*おしえ/i.test(assistant)) return;
  if (!/have you found|found sand yet|keep looking|さがして/i.test(assistant)) return;

  whenAssistantIdle(() => {
    sendTeacherNote(
      `ch2-rally-${ch2Search.rallies}-${normalizeUserText(user)}`,
      `[Teacher note — do not read aloud] ${ch2CoachHint()} Ask ONE everyday question now.`
    );
  }, "ch2-rally");
}

function recentUserMessages(limit = 10) {
  return chatMessages
    .filter((m) => m.type === "user" || m.type === "user-transcript")
    .slice(-limit)
    .map((m) => String(m.text || "").trim())
    .filter(Boolean);
}

function userSaysStillSearchingSand(text) {
  const t = String(text || "").trim();
  return /まだ|not yet|haven't found|have not found|didn't find|みつからない|見つからない|not at the|まだ.*いない|まだ.*みつ/i.test(
    t
  );
}

/** Ch2 may only complete after the child actually said the English sand phrase in chat. */
function userHasFoundSandPhrase() {
  return recentUserMessages().some((t) => looksLikeFoundSand(t) === "phrase");
}

function canCompleteCh2Part1() {
  if (userSaysStillSearchingSand(recentUserMessages().slice(-1)[0] || "")) return false;
  if (recentUserMessages(4).some(userSaysStillSearchingSand)) return false;
  return userHasFoundSandPhrase();
}

function userHasNeedGlassPhrase() {
  return recentUserMessages().some((t) => /\b(i need glass|need glass)\b/i.test(t));
}

function userHasNeedToMakeGlassPhrase() {
  return recentUserMessages().some((t) => /\b(i need to make glass|need to make glass)\b/i.test(t));
}

function userHasNeedSandPhrase() {
  return recentUserMessages().some((t) => /\b(i need sand|need sand)\b/i.test(t));
}

function canCompleteCh1Part1() {
  return userHasNeedGlassPhrase() && userHasNeedSandPhrase();
}

function userHasImDonePhrase() {
  return recentUserMessages().some((t) => /\b(i'?m done|im done|i am done)\b/i.test(t));
}

function looksLikeTankReadyPhrase(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (/\b(my tanks? is ready|tank is ready|tanks is ready)\b/.test(t)) return true;
  if (/my tank.*\bready\b/.test(t)) return true;
  return matchesPatterns(t, ["my tank is ready", "tank is ready", "my tanks is ready"]);
}

function userHasTankReadyPhrase() {
  return recentUserMessages().some(looksLikeTankReadyPhrase);
}

function canCompleteCh6Part1() {
  return userHasTankReadyPhrase();
}

function looksLikeCh6PutSandHere(text) {
  return matchesPatterns(text, ["i put sand here", "put sand here"]);
}

function looksLikeCh6BottomPhrase(text) {
  return matchesPatterns(text, [
    "on the bottom",
    "put the sand",
    "put sand on the bottom",
    "sand on the bottom",
  ]);
}

function userCh6PhraseProgress() {
  const msgs = recentUserMessages();
  return {
    putSand: msgs.some(looksLikeCh6PutSandHere),
    bottom: msgs.some(looksLikeCh6BottomPhrase),
    imDone: msgs.some((t) => /\b(i'?m done|im done|i am done)\b/i.test(t)),
    tankReady: msgs.some(looksLikeTankReadyPhrase),
  };
}

function ch6NextStepHint() {
  const p = userCh6PhraseProgress();
  if (!p.putSand && !p.bottom) return "Next phrase: I put sand here.";
  if (!p.bottom) return "Next phrase: I put the sand on the bottom.";
  if (!p.imDone) return "Next phrase: I'm done! (sand step finished).";
  if (!p.tankReady) return "Next phrase: My tank is ready!";
  return "Child finished ch6 phrases — call complete_segment(ch6).";
}

function ch6CoachHint() {
  if (getCurrentSegment()?.id !== "ch6") return "";
  if (userHasImDonePhrase() && !userHasTankReadyPhrase()) {
    return (
      " Ch6: child said I'm done! — praise ONLY, then Can you say My tank is ready? " +
      "NEVER Almost, おしい, or not yet after I'm done!"
    );
  }
  const p = userCh6PhraseProgress();
  if (p.bottom) {
    return " Ch6: child said the bottom phrase — praise and move to I'm done! Do NOT backtrack to I put sand here.";
  }
  if (p.putSand) {
    return " Ch6: child said I put sand here — praise, then I put the sand on the bottom.";
  }
  return ` Ch6: ${ch6NextStepHint()}`;
}

function buildCh6OutboundCoach(userText) {
  if (getCurrentSegment()?.id !== "ch6") return "";
  const t = String(userText || "").trim();
  if (looksLikeCh6BottomPhrase(t)) {
    return (
      "\n\n[Coach — never read aloud: Child said the BOTTOM phrase (put sand on the bottom counts!). " +
      "Praise — Great! Do NOT ask for I put sand here again. Next: Can you say, I'm done! " +
      "FORBIDDEN: stuck, どうしたの, or a second message before the child speaks." +
      `${beginnerTurnHint()}]`
    );
  }
  if (looksLikeCh6PutSandHere(t)) {
    return (
      "\n\n[Coach — never read aloud: Child said I put sand here. Praise, then teach I put the sand on the bottom. " +
      "One message only — wait after Can you say…?" +
      `${beginnerTurnHint()}]`
    );
  }
  if (/\b(i'?m done|im done|i am done)\b/i.test(t)) {
    return (
      "\n\n[Coach — never read aloud: Child said I'm done! correctly. Praise (Great! / いいね!). " +
      "Then teach My tank is ready! — do NOT say Almost, not yet, or we haven't put fish in yet as a correction." +
      `${beginnerTurnHint()}]`
    );
  }
  if (looksLikeTankReadyPhrase(t)) {
    return (
      "\n\n[Coach — never read aloud: Child said My tank is ready! Praise. Tank is ready for fish LATER — still ZERO fish. " +
      "call complete_segment(ch6)." +
      `${beginnerTurnHint()}]`
    );
  }
  const hint = ch6CoachHint();
  return hint ? `\n\n[Coach — never read aloud:${hint}${beginnerTurnHint()}]` : "";
}

function looksLikeCh6ImDoneRejection(assistantText, userText) {
  if (getCurrentSegment()?.id !== "ch6") return false;
  if (!/\b(i'?m done|im done|i am done)\b/i.test(userText)) return false;
  const a = String(assistantText || "").toLowerCase();
  return (
    /almost|おしい|not yet|まだ|not done|haven't put|have not put|no fish yet|put any in yet|we haven't/i.test(a) ||
    (/my tank is ready/i.test(a) && /almost|but we|おしい/i.test(a))
  );
}

function maybeCh6CorrectiveNudge() {
  if (getCurrentSegment()?.id !== "ch6") return;
  const assistant = lastAssistantText();
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (!looksLikeCh6ImDoneRejection(assistant, user)) return;
  whenAssistantIdle(() => {
    sendTeacherNote(
      `ch6-im-done-${normalizeUserText(user)}`,
      "[Teacher note — do not read aloud] Child said I'm done! as you asked. WRONG: Almost / おしい / not yet. " +
        "Praise: Great! You're done with the sand! Then: Can you say, My tank is ready? / 「My tank is ready」っていってみて！" +
        beginnerTurnHint()
    );
  }, "ch6-im-done");
}

function sharesPhraseTeachTarget(a, b) {
  const re = /i put the sand on the bottom|i put sand here|my tank is ready|i am done|i'm done|im done/i;
  const ma = String(a || "").match(re)?.[0]?.toLowerCase();
  const mb = String(b || "").match(re)?.[0]?.toLowerCase();
  return Boolean(ma && mb && ma === mb);
}

function assistantMessagesTooSimilar(a, b) {
  const na = normalizeUserText(a);
  const nb = normalizeUserText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return sharesPhraseTeachTarget(a, b);
}

function userSpokeSinceLastAssistantBubble() {
  let lastAsst = -1;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type === "assistant") {
      lastAsst = i;
      break;
    }
  }
  if (lastAsst < 0) return true;
  for (let i = lastAsst + 1; i < chatMessages.length; i++) {
    if (chatMessages[i].type === "user") return true;
  }
  return false;
}

function isLikelySameTurnContinuation(text, prevText) {
  const t = String(text || "").trim();
  const p = String(prevText || "").trim();
  if (!t || !p) return false;
  if (userSpokeSinceLastAssistantBubble()) return false;
  if (/は英語で[？?]/.test(p) && looksLikeNewAssistantReply(t)) return false;
  if (/[\u3040-\u309F]/.test(t) && /[a-zA-Z]/.test(p)) return true;
  if (/[\u3040-\u309F]/.test(t) && /[\u3040-\u309F]/.test(p) && Date.now() - lastAssistantBubbleAt < 8000) {
    return true;
  }
  return false;
}

function shouldSuppressBackToBackAssistant(text) {
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type !== "assistant") return false;
  if (isLikelySameTurnContinuation(text, last.text)) return false;
  if (Date.now() - lastAssistantBubbleAt > 20000) return false;
  if (sharesPhraseTeachTarget(last.text, text)) return true;
  if (assistantMessagesTooSimilar(last.text, text)) return true;
  return false;
}

function userAlreadyGotLeadReplySinceLastTurn() {
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (!user.trim() || !hasAssistantReplySinceUser(user)) return false;
  return endsWithLeadPrompt(lastAssistantText());
}

function skipPostTurnCoachNudges() {
  return userAlreadyGotLeadReplySinceLastTurn();
}

function runPostTurnCoachNudges() {
  if (actionState !== "active" || !client?.connected) return;
  const text = lastAssistantText().trim();
  if (!text) return;

  maybeEnding1HangUpCheck();

  // Learny already answered — any client_content coach note here causes a second spoken turn.
  if (blockCoachUntilUserSpeaks) {
    dbg("post-turn coaches skipped; waiting for child");
    return;
  }

  onCh2AssistantText(text);
}

function looksLikeStuckPrompt(text) {
  return /stuck|どうした|having trouble|a little stuck/i.test(String(text || ""));
}

function maybeCh6WrongPhraseNudge() {
  if (getCurrentSegment()?.id !== "ch6") return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (!looksLikeCh6BottomPhrase(user) && !looksLikeCh6PutSandHere(user)) return;
  const assistant = lastAssistantText();
  if (looksLikeCh6BottomPhrase(user) && /i put sand here|put sand here/i.test(assistant)) {
    if (!/on the bottom|i'?m done|my tank is ready/i.test(assistant)) {
      whenAssistantIdle(() => {
        sendTeacherNote(
          "ch6-accept-bottom",
          "[Teacher note — do not read aloud] Child already said put sand on the bottom. " +
            "WRONG to ask for I put sand here again. Praise them, then Can you say, I'm done! — ONE message, then wait." +
            beginnerTurnHint()
        );
      }, "ch6-accept-bottom");
      return;
    }
  }
  if (userAlreadyGotLeadReplySinceLastTurn()) return;
  if (!looksLikeStuckPrompt(assistant)) return;
  whenAssistantIdle(() => {
    sendTeacherNote(
      "ch6-no-stuck",
      "[Teacher note — do not read aloud] Child just answered — do NOT say stuck or どうしたの. " +
        "One short praise + ONE next Can you say…? then WAIT. No second message." +
        beginnerTurnHint()
    );
  }, "ch6-no-stuck");
}

function maybeCompleteCh6FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch6") return false;
  if (!looksLikeTankReadyPhrase(userText)) return false;
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return false;
  dbg("ch6 auto-complete", userText);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (afterSegmentAdvanced(seg.id, result, { lastQuote: userText })) {
    return true;
  }
  setTimeout(() => {
    if (actionState !== "active" || !client?.connected) return;
    whenAssistantIdle(() => {
      sendTeacherNote("advance-ch6", buildAdvanceNudge(result.state));
    }, "ch6-advance");
  }, 350);
  return true;
}

function maybeCh6AdvanceNudge() {
  if (getCurrentSegment()?.id !== "ch6" || !userHasTankReadyPhrase()) return;
  const tankMsg = recentUserMessages().slice().reverse().find(looksLikeTankReadyPhrase) || "";
  const assistant = lastAssistantText();
  if (/can you say|っていってみて|say.*my tank is ready/i.test(assistant)) return;
  const praisedReady =
    /perfect|ぱっちり|great job today|well done today/i.test(assistant) ||
    (/great job|nice job|good job/i.test(assistant) && looksLikeTankReadyPhrase(assistant)) ||
    /finish up|おしまい|ready to finish/i.test(assistant);
  if (!praisedReady) return;

  if (tankMsg) {
    const result = completeSegment("ch6", { userQuote: tankMsg });
    if (result.ok) {
      if (!result.alreadyDone) {
        dbg("ch6 late auto-complete", tankMsg);
        try {
          questSfx.playQuestComplete();
        } catch {
          // ignore
        }
      }
      if (afterSegmentAdvanced("ch6", result, { lastQuote: tankMsg })) {
        return;
      }
      whenAssistantIdle(() => {
        sendTeacherNote("advance-ch6-late", buildAdvanceNudge(result.state));
      }, "ch6-advance-late");
      return;
    }
  }

  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ch6") return;
    sendTeacherNote(
      "ch6-call-complete",
      "[Teacher note — do not read aloud] Chapter 6 is complete — child said My tank is ready! " +
        "Call complete_segment(ch6) NOW. Do NOT ask if today's lesson is over — Final challenge is next." +
        beginnerTurnHint()
    );
  }, "ch6-call-complete");
}

const PART1_POST_QUIZ1_IDS = new Set(["ch4", "ch5", "daily1", "ch6", "final1", "ending1"]);

function isQuiz1CompletedInState() {
  return loadLessonState().completedSegmentIds.includes("quiz1");
}

function countQuiz1ItemsAnswered() {
  const seg = getCurrentSegment();
  if (seg?.id !== "quiz1") return 0;
  const msgs = recentUserMessages(24);
  let n = 0;
  for (const item of seg.items || []) {
    const patterns = item.patterns || [];
    const hit = msgs.some((t) => {
      if (matchesPatterns(t, patterns)) return true;
      if (item.acceptAny && /ガラス|glass|作った|made/i.test(t)) return true;
      return false;
    });
    if (hit) n += 1;
  }
  return n;
}

function canCompleteQuiz1Part1() {
  if (getActiveLessonId() !== "part1") return true;
  if (getCurrentSegment().id !== "quiz1") return true;
  return countQuiz1ItemsAnswered() >= 3;
}

function quiz1CoachHint() {
  const seg = getCurrentSegment();
  if (seg?.id !== "quiz1") return "";
  const done = countQuiz1ItemsAnswered();
  return (
    ` Quiz1: ${done}/4 items done. Use ONLY listed quiz prompts — one at a time. ` +
    "FORBIDDEN: I put glass here, walls, color, dye. After 3–4 items → complete_segment(quiz1)."
  );
}

function looksLikeSkippedQuizContent(text) {
  const t = String(text || "").toLowerCase();
  return /put glass|building a tank|made a tank|what color|blue dye|need a dye|i choose|found a flower/i.test(t);
}

function maybeQuiz1SkipNudge() {
  if (getActiveLessonId() !== "part1" || getCurrentSegment().id !== "quiz1") return;
  const assistant = lastAssistantText();
  if (!looksLikeSkippedQuizContent(assistant)) return;
  whenAssistantIdle(() => {
    sendTeacherNote(
      "quiz1-no-skip",
      "[Teacher note — do not read aloud] You skipped Mini quiz 1. STOP Chapter 4/5 content. " +
        "Ask quiz item 1 now: ガラスが必要 → I need glass. One listed item per turn." +
        beginnerTurnHint()
    );
  }, "quiz1-skip");
}

function looksLikeMoodAnswer(text) {
  return /いい気分|気分|げんき|元気|うれしい|たのしい|楽しい|fine|good|great|happy|ok|okay|not so good|tired|sleepy|つかれ|だるい|まあまあ|so-so/i.test(
    String(text || "")
  );
}

function looksLikeWrongThankYouForMood(assistantText) {
  const t = String(assistantText || "");
  if (!/thank you|thanks|ありがとう/i.test(t)) return false;
  return !/great|glad|good to hear|that's nice|hope you feel|よかった|いいね|残念|だいじょうぶ/i.test(t);
}

function looksLikeCh1WrongThankYou(assistantText, userText) {
  if (!/thank you|thanks|ありがとう/i.test(String(assistantText || ""))) return false;
  if (looksLikeMoodAnswer(userText)) return true;
  if (userSaidGlassAnswer(userText)) return true;
  if (userSaidCh1Confused(userText)) return true;
  return false;
}

function maybeCh1MoodReactionNudge() {
  if (getCurrentSegment()?.type !== "warmup") return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (!looksLikeMoodAnswer(user) || !looksLikeWrongThankYouForMood(lastAssistantText())) return;
  whenAssistantIdle(() => {
    sendTeacherNote(
      "mood-react-warmup",
      "[Teacher note — do not read aloud] Wrong reaction: child answered HOW THEY FEEL — say That's great! / Glad to hear it! JP: よかった！ / いいね！ — NOT Thank you / ありがとう. " +
        "Then ask ONE follow-up on their mood or topic — still no tank yet." +
        beginnerTurnHint()
    );
  }, "mood-react");
}

function buildCh1CoachNote(userText, { postTurn = false } = {}) {
  const user = String(userText || "").trim();
  if (!user) return "";
  const assistant = postTurn ? lastAssistantText() : "";

  if (postTurn && assistantDoubledTeachPhrase(assistant)) return "";

  if (postTurn && assistantCh1SelfAnswered(assistant)) {
    return "WRONG: you asked a question but then said I need glass / I need sand yourself. NEVER answer for the child — ask ONE question, then WAIT for their reply.";
  }

  if (!userHasNeedGlassPhrase()) {
    const glassCtx = userSaidGlassAnswer(user) || recentUserMessages(4).some(userSaidGlassAnswer);
    if (looksLikeCh1PutGlassPhrase(user)) {
      return "WRONG phrase for Chapter 1. Child said I put glass here — that is later. Redirect ONCE: Nice try! Say I need glass. Can you say, I need glass? FORBIDDEN: ask put-glass again.";
    }
    if (glassCtx) {
      if (postTurn) {
        if (looksLikeCh1WrongThankYou(assistant, user)) {
          return "No Thank you — praise ガラス, teach I need glass ONCE (English then ひらがな), then wait.";
        }
        if (
          looksLikeCh1WrongGlassQuestion(assistant) ||
          looksLikeCh1PrematureSand(assistant) ||
          (/that'?s right/i.test(assistant) &&
            !/\b(i need glass|can you say.*glass|「I need glass」)/i.test(assistant))
        ) {
          return "After ガラス: ONE message — praise, then Can you say I need glass ONCE. FORBIDDEN: I put glass here, 置きたい, sand, making-glass question.";
        }
        if (
          /\bcan you say.*glass|「I need glass」/i.test(assistant) &&
          !assistantDoubledTeachPhrase(assistant)
        ) {
          return "";
        }
      } else {
        return "Child said ガラス/glass (Step 1). Speak ONE short reply out loud now: praise + Can you say, I need glass? (English then matching ひらがな). Say each part ONCE — NEVER I put glass here / 置きたい.";
      }
    } else if (userSaidCh1Confused(user)) {
      return postTurn
        ? "Child confused — clarify tank needs glass, then teach I need glass ONCE. No sand yet. No I put glass here."
        : "Child confused at Step 1 — ONE short clarify + teach I need glass ONCE. No sand. No I put glass here.";
    }
  } else if (!userHasNeedSandPhrase()) {
    if (/\bi need glass\b/i.test(user) || /\bneed glass\b/i.test(user)) {
      return (
        "Child already said I need glass. Speak ONE reply out loud: short praise, then Step 2 ONLY — " +
        "To make glass in Minecraft, what do we need? (English then ひらがな). WAIT for sand. " +
        "FORBIDDEN: ask Can you say I need glass again."
      );
    }
    if (userSaidSandAnswer(user)) {
      return "Child said sand — praise, then teach I need sand ONCE. Wait after.";
    }
    if (userSaidCh1Confused(user)) {
      return "Step 2 confused — ONE line: glass needs sand in Minecraft, ask what we need, then I need sand. Do NOT explain sand twice.";
    }
    if (postTurn && assistantCh1SandMonologue(assistant)) {
      return "You explained sand twice — ask To make glass in Minecraft what do we need? ONCE, then wait.";
    }
  }
  return "";
}

/** Send before the model replies — late notes after speech starts cause doubled lines. */
function maybeCh1CoachOnUserTurn(userText, { fromVoice = false } = {}) {
  if (getCurrentSegment()?.id !== "ch1") return;
  if (fromVoice) return;
  const note = buildCh1CoachNote(userText, { postTurn: false });
  if (!note) return;
  sendTeacherNote(
    `ch1-coach-${normalizeUserText(userText).slice(0, 20)}`,
    "[Teacher note — do not read aloud] " + note + beginnerTurnHint()
  );
}

function maybeCh1CoachNudge() {
  if (getCurrentSegment()?.id !== "ch1") return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  const note = buildCh1CoachNote(user, { postTurn: true });
  if (!note) return;
  whenAssistantIdle(() => {
    sendTeacherNote(
      `ch1-post-${normalizeUserText(user).slice(0, 20)}`,
      "[Teacher note — do not read aloud] " +
        note +
        " Do NOT repeat any line you already said in your last message." +
        beginnerTurnHint()
    );
  }, "ch1-post");
}

function userSaidGlassAnswer(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\b(i need glass|need glass)\b/i.test(t)) return false;
  return /ガラス|^glass$/i.test(t) || (/\bglass\b/i.test(t) && t.length < 24);
}

function userSaidSandAnswer(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\b(i need sand|need sand)\b/i.test(t)) return false;
  return /^(砂|すな|sand)$/i.test(t) || (/\b(sand|砂|すな)\b/i.test(t) && t.length < 20);
}

function userSaidCh1Confused(text) {
  return /^(何|なに|what|\?|？|わからない|分からない|は\?|え\?)/i.test(String(text || "").trim());
}

function looksLikeCh1WrongGlassQuestion(text) {
  const t = String(text || "");
  if (/what do you need to make (the )?glass|make glass.*what do you (need|think)|ガラス.*(なに|何).*いる/i.test(t)) {
    return true;
  }
  // Model jumped to Chapter 3/4 "I put glass here" instead of "I need glass".
  if (
    /i put glass|put glass here|ガラスを?\s*置|置きたい|(ガラス|glass).{0,12}なんて言う|なんて言う.{0,12}(ガラス|glass)/i.test(
      t
    ) &&
    !/\bi need glass\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function looksLikeCh1PutGlassPhrase(text) {
  return /\b(i put glass|put glass here)\b/i.test(String(text || ""));
}

function buildCh1OutboundCoach(userText) {
  if (getCurrentSegment()?.id !== "ch1") return "";
  const user = String(userText || "").trim();
  if (!user) return "";
  const assistant = lastAssistantText();

  // Model jumped into sand-search while still on Chapter 1.
  if (
    !canCompleteCh1Part1() &&
    /found sand|have you found|let me know when you find|beach|river|ビーチ|かわ|さがして|すなを.*みつけ/i.test(
      assistant
    )
  ) {
    return (
      "[Teacher note — do not read aloud] Still CHAPTER 1. Do NOT sand-search yet. " +
      (userHasNeedGlassPhrase()
        ? "Elicit I need sand, then wait. After both phrases, Chapter 2 begins."
        : "Finish glass step first (I need glass), then I need sand. FORBIDDEN: Have you found sand / beach search.") +
      beginnerTurnHint()
    );
  }

  if (!userHasNeedGlassPhrase() || /\b(i need glass|need glass)\b/i.test(user)) {
    if (looksLikeCh1PutGlassPhrase(user) || looksLikeCh1WrongGlassQuestion(assistant)) {
      if (!/\b(i need glass|need glass)\b/i.test(user)) {
        return (
          "[Teacher note — do not read aloud] Chapter 1 ONLY. WRONG to teach or accept I put glass here / ガラスを置きたい. " +
          "Praise briefly if needed, then teach ONCE: Can you say, I need glass? / 「I need glass」いってみて！ then WAIT. " +
          "FORBIDDEN: I put glass here, placing glass, sand, Step 2." +
          beginnerTurnHint()
        );
      }
    }
  }

  const note = buildCh1CoachNote(user, { postTurn: false });
  if (!note) return "";
  return "[Teacher note — do not read aloud] " + note + beginnerTurnHint();
}

function looksLikeCh1PrematureSand(text) {
  if (userHasNeedGlassPhrase()) return false;
  return /\b(sand|need sand|すな|砂)\b/i.test(String(text || ""));
}

function assistantCh1SandMonologue(text) {
  const t = String(text || "").toLowerCase();
  let hits = 0;
  if (/to make glass.*sand|need sand to make glass|you need sand/i.test(t)) hits += 1;
  if (/what do you think you need|なにがいるとおもう/i.test(t)) hits += 1;
  if (/ガラスには.*すな|すなでできる/i.test(t)) hits += 1;
  return hits >= 2;
}

function ch1CoachHint() {
  if (!userHasNeedGlassPhrase()) {
    if (recentUserMessages(4).some(userSaidGlassAnswer)) {
      return (
        " Ch1 Step 1b: child said glass/ガラス — praise then Can you say, I need glass? / 「I need glass」いってみて！ " +
        'FORBIDDEN: "What do you need to make glass?", sand, Step 2.'
      );
    }
    return (
      ' Ch1 Step 1 ONLY: ask "What do I need to make a tank? Something transparent and hard." ' +
      "Do NOT say Can you say I need glass yet unless they already said glass."
    );
  }
  if (!userHasNeedSandPhrase()) {
    return (
      ' Ch1 Step 2: ask "To make glass in Minecraft, what do we need?" → sand → Can you say I need sand? ' +
      "ONE sand explanation per turn — no repeating."
    );
  }
  return "";
}

function looksLikeCh2ShortAck(text) {
  const t = String(text || "").trim();
  return /^(うん+|ん+|はい|ええ|ok+|okay|yes|yeah|yep|sure|ね|うんうん)$/i.test(t);
}

function ch2CoachHint() {
  if (!isCh2SandSearchContext()) return "";
  if (ch2Search.phase === "done") return "";
  const rallies = ch2Search.rallies;
  const need = Math.max(0, CH2_SEARCH_RALLIES - rallies);
  if (ch2Search.phase !== "checking" && need > 0) {
    return (
      ` Ch2 search chat ${rallies}/${CH2_SEARCH_RALLIES}: ${ch2AntiRepeatRule()} ` +
      `FORBIDDEN this turn: Have you found sand yet?, Keep looking, repeat Let me know when you find sand.`
    );
  }
  if (looksLikeFoundSand(lastPendingUserText || recentUserMessages(1)[0] || "") === "found") {
    return " Ch2: Child found sand — praise + help them say I found some sand! in English. Do NOT stop after praise.";
  }
  return (
    " Ch2: OK to ask Have you found sand yet? If child says まだ/not yet: one NEW everyday question — " +
    ch2AntiRepeatRule() +
    " Do NOT repeat Let me know when you find sand."
  );
}

function onCh2AssistantText(text) {
  if (!isCh2SandSearchContext()) {
    if (getCurrentSegment()?.id !== "ch2") resetCh2Search();
    return;
  }
  if (/let me know when you find|みつけたら.*おしえ|すなを.*みつけたら/i.test(text)) {
    ch2Search.phase = "search";
    ch2Search.rallies = 0;
    ch2Search.lastEverydayKey = "";
    return;
  }
  if (/have you found.*sand|found sand yet|found any sand|still looking for sand|すな.*(みつかった|みつけた)|みつかった\？/i.test(text)) {
    if (ch2Search.rallies >= CH2_SEARCH_RALLIES) {
      ch2Search.phase = "checking";
    } else {
      dbg("ch2 premature found-sand question", { rallies: ch2Search.rallies });
    }
  }
  if (assistantAskedEverydayQuestion(text)) {
    rememberCh2EverydayFromAssistant(text);
    if (ch2Search.phase === "idle") ch2Search.phase = "search";
  }
}

/** Client tracks Ch2 search phase — coach hints tell Learny how many casual chats remain. */
function handleCh2SearchProgress(userText) {
  if (!isCh2SandSearchContext()) {
    if (getCurrentSegment()?.id !== "ch2") resetCh2Search();
    return;
  }

  const found = looksLikeFoundSand(userText);
  if (found === "phrase") {
    ch2Search.phase = "done";
    return;
  }
  if (found === "found") {
    ch2Search.phase = "checking";
    return;
  }

  if (userSaysStillSearchingSand(userText)) {
    if (ch2Search.phase === "checking") {
      ch2Search.phase = "search";
    }
    return;
  }

  const assistant = lastAssistantText();
  const shortAck = looksLikeCh2ShortAck(userText);

  // うん after "Let me know when you find sand" is NOT a search-chat rally.
  if (
    shortAck &&
    /let me know when you find|みつけたら.*おしえ/i.test(assistant) &&
    !detectCh2EverydayKey(assistant)
  ) {
    if (ch2Search.phase === "idle") {
      ch2Search.phase = "search";
      ch2Search.rallies = 0;
    }
    return;
  }

  if (looksLikeDirectionPick(userText) && (ch2Search.phase === "idle" || ch2Search.phase === "search")) {
    if (ch2Search.phase === "idle") {
      ch2Search.phase = "search";
      ch2Search.rallies = 0;
    }
    // Left/right choice starts the walk — everyday chat comes next; don't count as a rally.
    if (/left or right|みぎ|ひだり|どっちにいく/i.test(assistant) || !assistantAskedEverydayQuestion(assistant)) {
      return;
    }
  }

  if (ch2Search.phase === "idle") {
    // Beach/river pick or first answer — enter search so coaches fire.
    ch2Search.phase = "search";
  }

  if (ch2Search.phase !== "search") return;

  if (!assistantAskedEverydayQuestion(assistant)) {
    dbg("ch2 rally skipped; no everyday question yet", userText.slice(0, 24));
    return;
  }

  // Count うん/yes to waves/hot/etc. as a completed search rally.
  rememberCh2EverydayFromAssistant(assistant);
  ch2Search.rallies += 1;
  dbg("ch2 rally", { rallies: ch2Search.rallies, last: ch2Search.lastEverydayKey, user: String(userText || "").slice(0, 24) });
  if (ch2Search.rallies >= CH2_SEARCH_RALLIES) {
    ch2Search.phase = "checking";
  }
}

let lastPendingUserText = "";

function beginnerTurnHint() {
  if (LEVEL_INFO.id !== "beginner") return "";
  return " BEGINNER: English first, then ひらがな with the SAME meaning — never English-only, never いってみて alone.";
}

function assistantHasBeginnerJapanese(text) {
  return /[\u3040-\u309F]/.test(String(text || ""));
}

function assistantBeginnerJapaneseIncomplete(text) {
  if (LEVEL_INFO.id !== "beginner") return false;
  const t = String(text || "").trim();
  if (!t || !assistantHasBeginnerJapanese(t)) return false;

  if (/sorry|apolog|ごめん|まえは.*やく|もう一度/i.test(t)) return false;

  const withoutQuotedLatin = t
    .replace(/「[^」]*」/g, "")
    .replace(/'[^']*'/g, "")
    .replace(/"[^"]*"/g, "");
  const hiraganaChars = (t.match(/[\u3040-\u309F]/g) || []).length;
  const latinChars = (withoutQuotedLatin.match(/[a-zA-Z]/g) || []).length;
  if (latinChars < 15) return false;

  if (/っていってみて|っていってみる|いってみて！/.test(t) && hiraganaChars >= 12) return false;

  const jpOnly = t.replace(/[^\u3040-\u309F]/g, "");
  if (
    hiraganaChars <= 10 &&
    /^(いってみて|っていってみて|きいてみて|さあ|よし|ね|かな|そうだね|いいね|ばっちり|すごいね|いいよ)[！!？?]*$/.test(jpOnly)
  ) {
    return true;
  }

  if (latinChars >= 30 && hiraganaChars < latinChars * 0.35) return true;
  if (latinChars >= 50 && hiraganaChars < 18) return true;

  return false;
}

function maybeBeginnerJapaneseNudge() {
  if (LEVEL_INFO.id !== "beginner") return;
  if (userAlreadyGotLeadReplySinceLastTurn()) return;
  if (!assistantTranscriptSettled()) return;
  if (getCurrentSegment()?.type === "warmup") return;
  const text = lastAssistantText().trim();
  if (!text || assistantDoubledTeachPhrase(text)) return;
  if (assistantBubbleHasStackedQuestions(text)) return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (needsCh2ElicitPhrase(text, user)) return;

  // JP often arrives in a second transcription chunk — never "say it again" while still settling.
  if (!assistantHasBeginnerJapanese(text)) {
    if (/\b(?:did you|do you|are you|what|how|will you)\b/i.test(text)) return;
    whenAssistantIdle(() => {
      if (!assistantTranscriptSettled() || assistantHasBeginnerJapanese(lastAssistantText())) return;
      sendTeacherNote(
        "beginner-jp-only",
        "[Teacher note — do not read aloud] BEGINNER: append ひらがな with the SAME meaning to your LAST line only. " +
          "Do NOT repeat the English question or ask a second question. One line only, then WAIT."
      );
    }, "beginner-jp");
    return;
  }

  if (!assistantBeginnerJapaneseIncomplete(text)) return;
  // Incomplete JP after full settle — display trim handles stacked text; do not trigger another spoken turn.
}

function notifyParentProgress() {
  try {
    window.parent.postMessage({ type: "gc_quest_progress_update" }, "*");
  } catch {
    // ignore
  }
}

function notifyCallState() {
  try {
    window.parent.postMessage({ type: "gc_call_state", state: actionState }, "*");
  } catch {
    // ignore
  }
}

export function updateLessonBanner() {
  const state = loadLessonState();
  const lesson = getLesson(state.lessonId);
  const segment = getCurrentSegment(state);
  if (segment.id === "final1" && bannerSegmentId !== "final1") {
    resetFinal1Quiz();
  }
  if (segment.id === "ending1" && bannerSegmentId !== "ending1") {
    resetEnding1Beat();
  }
  bannerSegmentId = segment.id;
  const n = state.segmentIndex + 1;
  const chapter = getSegmentChapterMeta(segment);
  if (questBadgeLabel) questBadgeLabel.textContent = chapter.label;
  if (questBannerNum) {
    if (chapter.num === "") {
      questBannerNum.textContent = "";
      questBannerNum.style.display = "none";
    } else {
      questBannerNum.style.display = "";
      questBannerNum.textContent = chapter.num;
    }
  }
  if (questBannerTitleEn) questBannerTitleEn.textContent = segment.titleEn || lesson.titleEn;
  if (questBannerGoal) questBannerGoal.textContent = segment.title;
  if (questBannerHint) {
    if (segment.id === "final1") {
      initFinal1QuizIfNeeded();
      const qDone = final1Quiz.answered;
      const qTotal = final1Quiz.indices.length;
      const qLeft = final1RemainingCount();
      questBannerHint.textContent =
        qLeft > 0
          ? `いま：クイズ ${qDone}/${qTotal}（あと${qLeft}問でおわり）`
          : "いま：クイズ おわり！ エンディングへ";
    } else if (segment.id === "ending1") {
      const step = Math.min(ending1Beat.userTurns + 1, ENDING1_BEATS.length);
      questBannerHint.textContent = `いま：おわりの おはなし ${step}/${ENDING1_BEATS.length}（1つずつ話そう）`;
    } else {
      questBannerHint.textContent = segment.goal ? `いま：${segment.goal}` : "";
    }
  }
  if (questBannerProgress) {
    questBannerProgress.textContent = `${n} / ${lesson.segments.length}`;
  }
  if (questBanner) {
    questBanner.classList.toggle("lesson-complete", Boolean(state.complete));
  }
  if (questSteps) {
    questSteps.innerHTML = "";
    const mem = Object.entries(state.memories || {});
    if (mem.length) {
      const el = document.createElement("div");
      el.className = "quest-banner-hint";
      el.textContent = mem.map(([k, v]) => `${v}`).join(" · ");
      questSteps.appendChild(el);
    }
  }
  if (questSkipBtn) {
    questSkipBtn.hidden = true;
    questSkipBtn.disabled = true;
  }
  renderChoiceBar(segment);
  notifyParentProgress();
}

function renderChoiceBar(segment) {
  if (!choiceBar) return;
  choiceBar.innerHTML = "";
  if (actionState !== "active") {
    choiceBar.hidden = true;
    return;
  }
  if (segment?.input !== "speak_or_click") {
    choiceBar.hidden = true;
    return;
  }
  let item = null;
  if (segment?.id === "final1") {
    item = getCurrentFinal1Item();
    if (!item) {
      choiceBar.hidden = true;
      return;
    }
  } else {
    const rows = getClickChoices(segment).slice(0, 4);
    if (!rows.length) {
      choiceBar.hidden = true;
      return;
    }
    item = rows[Math.min(loadLessonState().stars, rows.length - 1)] || rows[0];
  }
  choiceBar.hidden = false;
  const title = document.createElement("p");
  title.className = "lesson-choice-title";
  title.textContent = "言いにくいときは、ここから選んでもいいよ";
  choiceBar.appendChild(title);
  const opts = item.choices?.length ? item.choices : [item.answer];
  opts.slice(0, 3).forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lesson-choice-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      sendUserText(label);
    });
    choiceBar.appendChild(btn);
  });
}

function normalizeUserText(text) {
  return String(text || "").trim().toLowerCase();
}

function isRecentVoiceDuplicate(text) {
  const t = normalizeUserText(text);
  if (!t || !lastVadUserAt) return false;
  return normalizeUserText(lastVadUserText) === t && Date.now() - lastVadUserAt < VOICE_TYPED_DEDUP_MS;
}

function looksLikeNewAssistantReply(text) {
  return /^(yes[,!.]?|you got it|nice[!]?|great[!]?|good[!]?|perfect|that'?s right|okay|sure|correct|awesome)/i.test(
    String(text || "").trim()
  );
}

function assistantDoubledTeachPhrase(text) {
  const t = String(text || "");
  const normPhrase = (s) =>
    String(s || "")
      .replace(/\s/g, "")
      .replace(/[「」'""]/g, "")
      .toLowerCase();

  const canMatches = [...t.matchAll(/can you say,?\s*[^?!]+[?!]?/gi)];
  if (canMatches.length >= 2 && normPhrase(canMatches[0][0]) === normPhrase(canMatches[1][0])) {
    return true;
  }

  const jpMatches = [...t.matchAll(/「[^」]+」(?:っていってみて|と言ってみて)[！!]?/g)];
  if (jpMatches.length >= 2 && jpMatches[0][0] === jpMatches[1][0]) {
    return true;
  }

  return false;
}

function trimDuplicateTeachPhrase(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  const normPhrase = (s) =>
    String(s || "")
      .replace(/\s/g, "")
      .replace(/[「」'""]/g, "")
      .toLowerCase();

  const canMatches = [...t.matchAll(/can you say,?\s*[^?!]+[?!]?/gi)];
  if (canMatches.length >= 2) {
    const first = normPhrase(canMatches[0][0]);
    for (let i = 1; i < canMatches.length; i += 1) {
      if (normPhrase(canMatches[i][0]) === first) {
        t = t.slice(0, canMatches[i].index).trim();
        break;
      }
    }
  }

  const jpMatches = [...t.matchAll(/「[^」]+」(?:っていってみて|と言ってみて)[！!]?/g)];
  if (jpMatches.length >= 2) {
    const first = jpMatches[0][0];
    for (let i = 1; i < jpMatches.length; i += 1) {
      if (jpMatches[i][0] === first) {
        t = t.slice(0, jpMatches[i].index).trim();
        break;
      }
    }
  }

  return t;
}

function countEnglishLeadIns(text) {
  return [
    ...String(text || "").matchAll(
      /\b(?:what|how|when|where|who|why|did you|do you|are you|will you|shall we|have you)\b/gi
    ),
  ].length;
}

function trimDuplicateStackedQuestions(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  const firstQEnd = t.search(/[？?]/);
  if (firstQEnd < 0) return t;
  const tail = t.slice(firstQEnd + 1);
  if (!tail.trim()) return t;

  const yokatta = [...tail.matchAll(/よかった[！!]?/g)];
  if (yokatta.length >= 2) {
    return t.slice(0, firstQEnd + 1 + yokatta[1].index).trim();
  }

  const enQRe =
    /\b(?:what|how|when|where|who|why|do you|did you|can you|are you|will you|shall we|have you)\b[^?]*[？?]/gi;
  const tailQuestions = [...tail.matchAll(enQRe)];
  if (tailQuestions.length >= 1) {
    return t.slice(0, firstQEnd + 1 + tailQuestions[0].index).trim();
  }

  const secondEn = tail.search(
    /\b(?:what|how|when|where|who|why|did you|do you|are you|will you|shall we|have you)\b/i
  );
  if (secondEn >= 0 && secondEn < 120) {
    return t.slice(0, firstQEnd + 1 + secondEn).trim();
  }

  return t;
}

function assistantBubbleHasStackedQuestions(text) {
  if (countEnglishLeadIns(text) >= 2) return true;
  const t = String(text || "");
  if ((t.match(/[？?]/g) || []).length >= 2) return true;
  if ((t.match(/よかった[！!]?/g) || []).length >= 2) return true;
  return false;
}

function chunkStartsStackedEnglishBeat(chunk, prev) {
  const c = String(chunk || "").trim();
  if (!c || !/\b(?:what|how|when|where|who|why|did you|do you|are you|will you|shall we|have you|that'?s great|glad to hear)\b/i.test(c)) {
    return false;
  }
  const p = String(prev || "");
  if (countEnglishLeadIns(p) >= 1) return true;
  if (/\b(?:did you|do you|are you|what|how)\b/i.test(p)) return true;
  if (/[？?]/.test(p)) return true;
  if (/[\u3040-\u309F]/.test(p) && /[a-zA-Z]/.test(p) && c.length > 12) return true;
  return false;
}

function chunkWouldStackQuestions(prev, chunk) {
  if (chunkStartsStackedEnglishBeat(chunk, prev)) return true;
  if (!assistantBubbleHasStackedQuestions(prev)) {
    return assistantBubbleHasStackedQuestions(`${prev}${chunk}`);
  }
  return /\b(?:what|how|when|where|who|did you|do you|are you|will you|have you)\b/i.test(String(chunk || ""));
}

function assistantTranscriptSettled() {
  if (assistantIsSpeaking()) return false;
  if (assistantTranscriptOpen && Date.now() - lastTranscriptChunkAt < TRANSCRIPT_SETTLE_MS) return false;
  return Date.now() - lastTranscriptChunkAt >= TRANSCRIPT_SETTLE_MS;
}

function trimDuplicateAssistantQuizPrompt(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  t = t.replace(/(\b(?:you\s+)?got\s+it!?\s*)+it!\s*/gi, "$1");
  t = t.replace(/(\bthat'?s\s+(?:right|it)!?\s*)+it!\s*/gi, "$1");
  t = t.replace(/\s+it!\s+(?=['「'\u3040])/gi, " ");

  const cueRe =
    /(?:['「『][^'」』]+['」』]|[\u3040-\u309F]{2,24}[！!]?)\s*は\s*(?:英語|えいご)で[？?]?/gi;
  const prompts = t.match(cueRe) || [];
  if (prompts.length >= 2) {
    const norm = (s) => String(s).replace(/\s/g, "").replace(/[「」'""]/g, "").toLowerCase();
    const firstNorm = norm(prompts[0]);
    for (let i = 1; i < prompts.length; i += 1) {
      const pn = norm(prompts[i]);
      if (pn === firstNorm || pn.includes(firstNorm) || firstNorm.includes(pn)) {
        const cutAt = t.indexOf(prompts[i], t.indexOf(prompts[0]) + prompts[0].length);
        if (cutAt > 0) {
          t = t.slice(0, cutAt).trim();
          break;
        }
      }
    }
  }

  const bracketed = t.match(/(「[^」]+」は英語で？)/g);
  if (bracketed && bracketed.length >= 2) {
    const first = bracketed[0];
    if (bracketed.every((p) => p === first)) {
      const secondAt = t.indexOf(first, t.indexOf(first) + first.length);
      if (secondAt > 0) t = t.slice(0, secondAt).trim();
    }
  }
  return t;
}

function chunkRepeatsPrevEnglish(chunk, prev) {
  const c = String(chunk || "").trim();
  const p = String(prev || "").trim();
  if (!c || !p) return false;
  const cn = c.replace(/\s/g, "").toLowerCase();
  const pn = p.replace(/\s/g, "").toLowerCase();
  // Longer chunk is a correction/extension, not a duplicate re-transcription.
  if (cn.length > pn.length * 1.08) return false;
  if (cn.startsWith(pn) && c.length <= p.length) return true;
  const words = c.match(/\b[a-z]{3,}\b/gi) || [];
  if (words.length < 2) return false;
  const en = p.toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (en.includes(w.toLowerCase())) hits += 1;
  }
  return hits >= Math.max(2, Math.ceil(words.length * 0.55)) && c.length <= p.length * 1.05;
}

function trimRetranscribedEnglishTail(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  const yokatta = [...t.matchAll(/よかった[！!]?/g)];
  if (yokatta.length >= 2) {
    t = t.slice(0, yokatta[1].index).trim();
  }

  const jpIdx = t.search(/[\u3040-\u309F]/);
  if (jpIdx < 0) return t;
  let lastJpEnd = jpIdx;
  for (let i = jpIdx; i < t.length; i += 1) {
    if (/[\u3040-\u309F]/.test(t[i])) lastJpEnd = i;
  }
  const tail = t.slice(lastJpEnd + 1);
  if (!/[a-zA-Z]/.test(tail)) return t;
  const enBefore = t.slice(0, lastJpEnd + 1).toLowerCase();
  const tailWords = (tail.match(/\b[a-z]{3,}\b/gi) || []).map((w) => w.toLowerCase());
  if (tailWords.length < 2) return t;
  const hits = tailWords.filter((w) => enBefore.includes(w)).length;
  if (hits >= 2) return t.slice(0, lastJpEnd + 1).trim();
  return t;
}

function fixEnglishSpacing(text) {
  let t = String(text || "");
  t = t.replace(/([!?.,])([A-Za-z])/g, "$1 $2");
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
  t = t.replace(/([!?.,])([\u3040-\u309F])/g, "$1 $2");
  t = t.replace(/([a-zA-Z])([\u3040-\u309F])/g, "$1 $2");
  t = t.replace(/ {2,}/g, " ");
  return t;
}

function trimDuplicateJapanesePhrases(text) {
  let t = String(text || "");
  t = t.replace(/([\u3040-\u309F]{5,}?)\1+/g, "$1");
  const runs = t.match(/きょうは[\u3040-\u309F]{2,18}/g);
  if (runs && runs.length >= 2) {
    const norm = (s) => s.replace(/\s/g, "");
    for (let i = 1; i < runs.length; i += 1) {
      const a = norm(runs[0]);
      const b = norm(runs[i]);
      if (a === b || a.includes(b) || b.includes(a)) {
        const secondAt = t.indexOf(runs[i], t.indexOf(runs[0]) + runs[0].length);
        if (secondAt > 0) {
          t = t.slice(0, secondAt).trim();
          break;
        }
      }
    }
  }
  return t;
}

function joinTranscriptParts(prev, chunk) {
  const p = String(prev || "");
  const c = String(chunk || "");
  if (!p) return c;
  if (!c) return p;
  if (/[a-zA-Z!?]$/.test(p.trim()) && /^[a-zA-Z]/.test(c.trim())) {
    return p + " " + c;
  }
  return p + c;
}

function pickTranscriptChunk(prev, chunk, { finished = false } = {}) {
  const p = String(prev || "").trim();
  const c = String(chunk || "").trim();
  if (!c) return p;
  if (!p) return c;
  const pn = p.replace(/\s/g, "").toLowerCase();
  const cn = c.replace(/\s/g, "").toLowerCase();
  // Gemini Live STT is usually cumulative — prefer the longer/more complete string.
  if (cn === pn) return c.length >= p.length ? c : p;
  if (cn.startsWith(pn)) return c;
  if (pn.startsWith(cn)) return p;
  if (finished && cn.length >= pn.length) return c;
  if (finished && pn.length > cn.length) return p;
  return mergeTranscriptChunk(p, c);
}

function resetAssistantTurnTranscript() {
  assistantTurnTranscript = "";
}

function applyAssistantTranscriptChunk(chunk, { finished = false } = {}) {
  const c = String(chunk || "").trim();
  if (!c && !finished) return false;
  if (c && isMetaAssistantLeak(c)) return false;

  const last = chatMessages[chatMessages.length - 1];
  const needNewBubble =
    !assistantTranscriptOpen || last?.type !== "assistant" || userSpokeSinceLastAssistantBubble();

  if (needNewBubble) resetAssistantTurnTranscript();

  if (c) {
    const before = assistantTurnTranscript;
    assistantTurnTranscript = pickTranscriptChunk(assistantTurnTranscript, c, { finished });
    if (assistantTurnTranscript === before && before) {
      dbg("transcript chunk dropped", c.slice(0, 48));
    }
  }

  const display = sanitizeAssistantBubbleText(assistantTurnTranscript);
  if (!display) return false;

  if (emptyState) emptyState.style.display = "none";
  if (needNewBubble) {
    chatMessages.push({ type: "assistant", text: display, sttEnterPending: true });
    lastAssistantBubbleAt = Date.now();
  } else if (last?.type === "assistant") {
    last.text = display;
  }
  assistantTranscriptOpen = true;
  scheduleRenderChat();
  return true;
}

function chunkRepeatsAssistantTail(chunk, prev) {
  const c = String(chunk || "").trim();
  const p = String(prev || "").trim();
  if (c.length < 20 || p.length < 30) return false;
  const norm = (s) => s.replace(/\s/g, "").toLowerCase();
  if (norm(p).includes(norm(c)) && c.length >= p.length * 0.35) return true;
  const can = c.match(/can you say/i);
  if (can && norm(p).includes(norm(c.slice(0, Math.min(c.length, 48))))) return true;
  return false;
}

function chunkMostlyDuplicatesPrev(chunk, prev) {
  const c = String(chunk || "").replace(/\s/g, "");
  const p = String(prev || "").replace(/\s/g, "");
  if (c.length < 10 || p.length < 10) return false;
  if (p.endsWith(c) || c === p) return true;
  if (p.includes(c) && c.length > p.length * 0.35) return true;
  const tail = p.slice(-Math.min(p.length, c.length + 24));
  return tail.includes(c);
}

function sanitizeAssistantBubbleText(text) {
  // Display-only: spacing + obvious exact duplicates. Never cut mid-sentence words.
  return fixEnglishSpacing(
    trimDuplicateJapanesePhrases(String(text || "").trim())
  );
}

function mergeTranscriptChunk(prev, chunk) {
  const p = String(prev || "");
  const c = String(chunk || "");
  if (!c) return p;
  if (!p) return c;
  if (c === p) return p;

  const pt = p.trim();
  const ct = c.trim();
  if (ct.startsWith(pt)) return c;
  if (pt.startsWith(ct)) return p;
  if (p.endsWith(c)) return p;
  if (c.endsWith(p)) return c;

  // Overlap join for incremental STT deltas (e.g. "Hello! How" + "How are you today?").
  const maxOverlap = Math.min(pt.length, ct.length, 120);
  for (let len = maxOverlap; len >= 3; len -= 1) {
    if (pt.slice(-len).toLowerCase() === ct.slice(0, len).toLowerCase()) {
      return joinTranscriptParts(pt.slice(0, -len).trimEnd(), ct.slice(len).trimStart());
    }
  }

  return joinTranscriptParts(p, c);
}

function sameTranscriptBubble(lastType, incomingType) {
  if (!lastType || !incomingType) return false;
  if (lastType === incomingType) return true;
  const userTypes = new Set(["user", "user-transcript"]);
  return userTypes.has(lastType) && userTypes.has(incomingType);
}

function addMessage(text, type, mode = "new") {
  const t = String(text || "");
  if (!t) return;
  const storedType = type === "user-transcript" ? "user" : type;
  if (storedType === "assistant" && isMetaAssistantLeak(t)) {
    dbg("drop meta assistant leak", t.slice(0, 64));
    return;
  }
  if (emptyState) emptyState.style.display = "none";
  if (mode === "append" && chatMessages.length) {
    const last = chatMessages[chatMessages.length - 1];
    if (sameTranscriptBubble(last.type, storedType) || sameTranscriptBubble(last.type, type)) {
      if (storedType === "assistant" || type === "user-transcript" || storedType === "user") {
        last.text =
          storedType === "assistant"
            ? sanitizeAssistantBubbleText(mergeTranscriptChunk(last.text, t))
            : mergeTranscriptChunk(last.text, t);
      } else {
        last.text = (last.text || "") + t;
      }
      scheduleRenderChat();
      return;
    }
  }
  if (mode === "new" && storedType === "assistant") {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.type === "assistant" && isLikelySameTurnContinuation(t, last.text)) {
      last.text = sanitizeAssistantBubbleText(mergeTranscriptChunk(last.text, t));
      scheduleRenderChat();
      return;
    }
    if (shouldSuppressBackToBackAssistant(t)) {
      dbg("suppress back-to-back assistant", t.slice(0, 48));
      return;
    }
  }
  chatMessages.push({
    type: storedType,
    text: storedType === "assistant" ? sanitizeAssistantBubbleText(t) : t,
    sttEnterPending: storedType === "assistant",
  });
  if (storedType === "assistant") lastAssistantBubbleAt = Date.now();
  scheduleRenderChat();
}

function renderChatNow() {
  if (!chatArea) return;
  const keepEmpty = emptyState;
  if (!chatMessages.length) {
    chatArea.innerHTML = "";
    if (keepEmpty) {
      chatArea.appendChild(keepEmpty);
      keepEmpty.style.display = "";
    }
    return;
  }

  const rows = chatArea.querySelectorAll(".msg-row");
  if (rows.length === chatMessages.length && chatMessages.length > 0) {
    const lastMsg = chatMessages[chatMessages.length - 1];
    const lastRow = rows[rows.length - 1];
    const lastBubble = lastRow?.querySelector(".msg-bubble");
    if (
      lastMsg.type === "assistant" &&
      lastRow?.classList.contains("assistant") &&
      lastBubble &&
      lastBubble.textContent !== lastMsg.text
    ) {
      lastBubble.textContent = lastMsg.text;
      chatArea.scrollTop = chatArea.scrollHeight;
      return;
    }
  }

  chatArea.innerHTML = "";
  chatMessages.forEach((msg) => {
    const row = document.createElement("div");
    row.className = `msg-row ${msg.type}`;
    if (msg.sttEnterPending) {
      row.classList.add("stt-enter");
      msg.sttEnterPending = false;
    }
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = msg.text;
    row.appendChild(bubble);
    chatArea.appendChild(row);
  });
  chatArea.scrollTop = chatArea.scrollHeight;
}

function scheduleRenderChat() {
  if (renderChatScheduled) return;
  renderChatScheduled = true;
  requestAnimationFrame(() => {
    renderChatScheduled = false;
    renderChatNow();
  });
}

function renderChat() {
  scheduleRenderChat();
}

function setActionBtnContent(iconHtml, label) {
  btnAction.innerHTML = `${iconHtml}<span>${label}</span>`;
}

function updateActionUI() {
  if (isChapterHandoff || (actionState === "connecting" && isHandoffRunning)) {
    statusDot.className = "status-indicator connecting";
    statusText.textContent = "つぎへ じゅんび中";
  } else if (connected) {
    statusDot.className = "status-indicator connected";
    statusText.textContent = "おはなし中";
  } else {
    statusDot.className = "status-indicator";
    statusText.textContent = "オフライン";
  }
  if (actionState === "connecting") {
    btnAction.className = "action-btn connecting header-call-btn";
    btnAction.innerHTML = isChapterHandoff || isHandoffRunning
      ? '<span class="action-spinner"></span><span>つぎへ...</span>'
      : '<span class="action-spinner"></span><span>接続中...</span>';
  } else if (actionState === "active") {
    btnAction.className = "action-btn active header-call-btn";
    setActionBtnContent(ICON_PHONE_OFF, "おわる");
  } else {
    btnAction.className = "action-btn idle header-call-btn";
    setActionBtnContent(ICON_PHONE, "はじめる");
  }
  const callLive = actionState === "active";
  const handoffBusy = isHandoffRunning || isChapterHandoff;
  if (btnMute) {
    btnMute.classList.add("visible");
    btnMute.disabled = !callLive || handoffBusy;
    btnMute.classList.toggle("muted", isMuted && callLive);
    btnMute.textContent = isMuted && callLive ? "🔇" : "🎙️";
    btnMute.title =
      !callLive
        ? "電話中にミュートできるよ"
        : isMuted
          ? "マイクオフ（文字は送れるよ）"
          : "マイクミュート";
  }
  if (btnRetry) {
    btnRetry.hidden = actionState === "idle";
    btnRetry.disabled = !callLive || handoffBusy || isAutoReconnecting;
  }
  if (btnSend) btnSend.disabled = !callLive || handoffBusy;
  if (chatInput) chatInput.disabled = !callLive || handoffBusy;
  notifyCallState();
  updateLessonBanner();
}

function sendClientText(text, { force = false } = {}) {
  if (!client?.connected) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  const now = Date.now();
  if (!force && t === lastOutboundText && now - lastOutboundAt < 2000) {
    dbg("sendClientText deduped", t.slice(0, 48));
    return false;
  }
  lastOutboundText = t;
  lastOutboundAt = now;
  // Only close an open mic activity — bare activity_end with manual VAD can
  // stall the next client_content turn (opening / muted text).
  if (userActivityOpen) {
    client.signalActivityEnd?.();
    userActivityOpen = false;
  }
  return client.sendTextMessage(t);
}

/** Hidden coaching — deduped so we never stack notes that make Learny repeat herself. */
function isThrottledCoachNote(key) {
  if (!key) return false;
  if (key === "opening" || key === "silence") return false;
  if (key.startsWith("advance-")) return false;
  if (key.startsWith("final1-coach-")) return false;
  if (key.startsWith("ending1-coach-")) return false;
  if (key.startsWith("ending1-next-")) return false;
  if (key === "final1-done") return false;
  if (key.startsWith("advance-final1")) return false;
  if (key.startsWith("reply-")) return false;
  return true;
}

function isMetaAssistantLeak(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^\[?\s*(internal coach|teacher note)\b/i.test(t)) return true;
  if (/^teacher note ignored/i.test(t)) return true;
  if (/^\[internal\b/i.test(t)) return true;
  if (
    /^\[.*(?:child hasn't replied|hasn't replied yet|as instructed|do not read aloud).*\]$/i.test(t)
  ) {
    return true;
  }
  return false;
}

function formatTeacherNote(text) {
  return (
    "[HIDDEN coach for your NEXT spoken reply to the child. Do not read this note aloud. " +
    "You MUST still speak your reply out loud (English then ひらがな).]\n" +
    String(text || "").replace(/^\[Teacher note[^\]]*\]\s*/i, "")
  );
}

function waitingOnChildAfterQuestion() {
  if (userSpokeSinceLastAssistantBubble()) return false;
  return endsWithLeadPrompt(lastAssistantText());
}

function buildSessionStartNudge() {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId === "part1" && seg?.id === "ch1" && (userHasNeedGlassPhrase() || userHasNeedSandPhrase())) {
    const hint = ch1CoachHint();
    if (hint) {
      return (
        "[Teacher note — do not read aloud] Resume mid-Chapter 1. " +
        hint +
        beginnerTurnHint()
      );
    }
  }
  if (state.segmentIndex > 0 || (state.completedSegmentIds?.length || 0) > 0) {
    return buildAdvanceNudge(state);
  }
  return buildOpeningNudge(state);
}

function kickOpeningTurn(opts = {}) {
  if (opts && (opts.handoff || opts.reason)) {
    pendingOpeningKickOpts = { ...opts };
  }
  const kickOpts = pendingOpeningKickOpts || opts || {};
  if (openingSent || !client?.connected) return false;
  if (actionState !== "active" && actionState !== "connecting") return false;
  openingSent = true;
  pendingOpeningKickOpts = null;
  blockCoachUntilUserSpeaks = false;
  const state = loadLessonState();
  let nudge;
  if (kickOpts.handoff || kickOpts.reason === "stuck_retry") {
    nudge = buildHandoffOpeningNudge(state, {
      lastQuote: kickOpts.lastQuote || "",
      reason: kickOpts.reason || "handoff",
    });
  } else {
    nudge = buildSessionStartNudge();
  }
  return sendClientText(formatTeacherNote(nudge), { force: true });
}

function sendTeacherNote(key, text, { allowRetry: _allowRetry = true } = {}) {
  // Only segment advances + long-idle silence may inject client_content.
  // Other coaches go through outbound prefixes on the child's turn.
  const allowed =
    key === "silence" ||
    key.startsWith("advance-") ||
    key.startsWith("ending1-next-");
  if (!allowed) {
    dbg("coach note disabled", key);
    return false;
  }
  if (!key || sentTeacherNotes.has(key)) return false;

  if (isThrottledCoachNote(key) && coachNudgesSinceLastUserTurn >= 1) {
    dbg("coach nudge capped", key);
    return false;
  }
  if (assistantIsSpeaking()) {
    dbg("teacher note dropped; assistant speaking", key);
    return false;
  }
  const allowWhileAwaiting =
    key === "opening" ||
    key.startsWith("advance-") ||
    key.startsWith("advance-final1") ||
    key.startsWith("ending1-next-");
  if (awaitingAssistantReply && !allowWhileAwaiting) {
    dbg("teacher note blocked", key);
    return false;
  }
  if (waitingOnChildAfterQuestion() && !allowWhileAwaiting) {
    dbg("teacher note blocked; waiting on child answer", key);
    return false;
  }
  sentTeacherNotes.add(key);
  if (isThrottledCoachNote(key)) coachNudgesSinceLastUserTurn += 1;
  dbg("teacher note", key);
  assistantTranscriptOpen = false;
  return sendClientText(formatTeacherNote(text));
}

function scheduleAssistantTurnEnd() {
  if (turnCloseTimer) clearTimeout(turnCloseTimer);
  turnCloseTimer = setTimeout(() => {
    turnCloseTimer = null;
    if (assistantTurnTranscript.trim()) {
      applyAssistantTranscriptChunk("", { finished: true });
    }
    assistantTranscriptOpen = false;
    runPostTurnCoachNudgesWhenSettled();
  }, 900);
}

function runPostTurnCoachNudgesWhenSettled(attempt = 0) {
  if (actionState !== "active" || !client?.connected) return;
  if (!assistantTranscriptSettled()) {
    if (attempt < 12) {
      setTimeout(() => runPostTurnCoachNudgesWhenSettled(attempt + 1), 350);
      return;
    }
  }
  runPostTurnCoachNudges();
}

function cancelAssistantTurnEnd() {
  if (turnCloseTimer) {
    clearTimeout(turnCloseTimer);
    turnCloseTimer = null;
  }
  // Late transcription after TURN_COMPLETE must still run post-turn coaches.
  if (turnEndProcessed) scheduleAssistantTurnEnd();
}

function bumpIdleGeneration() {
  idleGeneration += 1;
  sentTeacherNotes.clear();
}

function closeOpenAudioTurn() {
  audioStreamer?.resetVoiceGate?.();
  if (userActivityOpen) {
    client?.signalActivityEnd?.();
    userActivityOpen = false;
  }
}

function bindVoiceGateActivity() {
  if (!audioStreamer) return;
  audioStreamer.voiceGateHangoverMs = 450;
  audioStreamer.onVoiceGateChange = (open) => {
    if (actionState !== "active" || !client?.connected) return;
    if (isMuted) return;
    if (open) {
      // Don't open a user turn while Learny is still talking.
      if (assistantIsSpeaking()) return;
      if (userActivityOpen) return;
      client.signalActivityStart?.();
      userActivityOpen = true;
      return;
    }
    // Child stopped speaking (local gate closed) — hand the turn to Learny now.
    if (!userActivityOpen) return;
    client.signalActivityEnd?.();
    userActivityOpen = false;
  };
}

/** Gemini audio arrives in a burst; wall-clock playback often continues after TURN_COMPLETE. */
function assistantPlaybackMsLeft() {
  try {
    return Math.max(0, audioPlayer?.getPlaybackMsRemaining?.() || 0);
  } catch {
    return 0;
  }
}

function assistantIsSpeaking() {
  return assistantPlaybackMsLeft() > PLAYBACK_IDLE_MS;
}

/**
 * Run fn only after Learny's queued audio has finished.
 * Sending client_content / activity_end while she is still playing makes Live API
 * interrupt her — that is the main mid-sentence cutoff when the mic is muted.
 */
function whenAssistantIdle(fn, label = "idle") {
  const gen = idleGeneration;
  const wait = () => {
    if (gen !== idleGeneration) return;
    if (actionState !== "active" || !client?.connected) return;
    const left = assistantPlaybackMsLeft();
    if (left > PLAYBACK_IDLE_MS) {
      dbg("wait playback", { label, left });
      setTimeout(wait, Math.min(left + 50, 800));
      return;
    }
    fn();
  };
  wait();
}

function clearPendingReplyWatch() {
  if (pendingReplyWatchId) {
    clearTimeout(pendingReplyWatchId);
    pendingReplyWatchId = null;
  }
  pendingReplyText = "";
}

function clearLeadWatch() {
  if (leadWatchId) {
    clearTimeout(leadWatchId);
    leadWatchId = null;
  }
}

function assistantAskedQuestion(text) {
  const t = String(text || "");
  if (/[？?]/.test(t)) return true;
  return /\b(?:what|how|when|where|who|why|did you|do you|are you|will you|shall we|have you)\b/i.test(t);
}

function endsWithLeadPrompt(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const tail = t.slice(-160);
  if (/[？?]/.test(tail)) return true;
  if (assistantAskedQuestion(tail)) return true;
  if (/let me know|when you find|find sand|みつけたら|おしえて|tell me when/i.test(tail)) return true;
  return /(かな|できる|つくれる|作れる|いる|どっち|なに|何|どう|しよう|してみ|いえる|言える|いってみて|ってみて|will you|what do|what's|what color|what time|shall we|can you|do you|can we|are you|say with me|try saying|repeat after|in english|together)\s*[!！.。]*$/i.test(
    tail
  );
}

function needsContinuationNudge(text) {
  const t = String(text || "").trim();
  if (!t || endsWithLeadPrompt(t)) return false;
  if (assistantAskedQuestion(t)) return false;
  if (
    /^(that'?s right|nice|good|great|cool|perfect|okay|yes|awesome|correct|そうだね|いいね|ばっちり|すごい|そのとおり)[!.！\s]*([\u3040-\u309F\s！!。.]*)?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (t.length < 100 && !/[？?]/.test(t.slice(-80)) && /(that'?s right|nice!|good!|great!|perfect|そうだね|いいね)/i.test(t)) {
    return true;
  }
  return false;
}

function segmentContinuationHint() {
  const seg = getCurrentSegment();
  if (seg?.id === "ch1") {
    return ch1CoachHint() || " Ch1: next step question (glass or sand phrase).";
  }
  if (seg?.id === "ch2") {
    return ch2CoachHint() || " Ch2: next everyday question or Have you found sand yet?";
  }
  if (seg?.id === "ch3") {
    return " Ch3: next phrase (I need to make glass / I made glass) or Let me know when you're done.";
  }
  if (seg?.id === "quiz1") {
    return quiz1CoachHint() || " Quiz1: NEXT listed quiz item.";
  }
  if (seg?.type === "daily_english" || seg?.id === "daily1") {
    return (
      " Daily English: if still chatting, ONE more everyday question. " +
      "If you said back to the tank, ask the NEXT tank step — never stop at That's right / そうだね."
    );
  }
  if (seg?.id === "ch6") {
    return ch6CoachHint() || " Ch6: next sand phrase, then I'm done!, then My tank is ready!";
  }
  if (seg?.id === "final1") {
    return final1CoachHint() || " Final1: 〜は英語で？ prompts only.";
  }
  if (seg?.id === "ending1") {
    return ending1CoachHint();
  }
  if (seg?.type === "warmup") {
    return " Warmup: ONE follow-up on their topic, or tank invite when chat feels done.";
  }
  return " Ask ONE clear question or Can you say… invite for the current segment.";
}

function maybeContinuationNudge() {
  const text = lastAssistantText();
  if (!needsContinuationNudge(text)) return;
  if (userAlreadyGotLeadReplySinceLastTurn()) return;
  whenAssistantIdle(() => {
    if (!needsContinuationNudge(lastAssistantText())) return;
    dbg("continuation nudge", text.slice(0, 60));
    sendTeacherNote(
      `lead-cont-${normalizeUserText(text).slice(0, 32)}`,
      "[Teacher note — do not read aloud] You stopped after praise only. " +
        "Continue NOW with exactly ONE forward question (do not repeat the praise)." +
        segmentContinuationHint() +
        beginnerTurnHint()
    );
  }, "lead-cont");
}

function finishAssistantTurn() {
  if (turnEndProcessed) return;
  turnEndProcessed = true;
  lastSilenceAssistantDoneAt = Date.now();
  const gotReply =
    !pendingReplyText || hasAnyAssistantActivitySinceUserTurn(pendingReplyText);
  if (gotReply) {
    awaitingAssistantReply = false;
    clearPendingReplyWatch();
    blockCoachUntilUserSpeaks = true;
  }
  scheduleAssistantTurnEnd();
  if (getCurrentSegment()?.id === "ending1" || loadLessonState().complete) {
    ensureEnding1HangUpWatch();
  }
}

function armLeadWatch() {
  if (actionState !== "active" || !client?.connected) return;
  if (blockCoachUntilUserSpeaks) return;
  if (userAlreadyGotLeadReplySinceLastTurn()) return;
  const text = lastAssistantText();
  if (!text.trim()) return;
  if (assistantAskedQuestion(text)) return;
  if (endsWithLeadPrompt(text)) return;
  if (leadWatchArmedFor === text) return;
  clearLeadWatch();
  leadWatchArmedFor = text;
  const delay = LEAD_WATCH_MS + assistantPlaybackMsLeft();
  leadWatchId = setTimeout(() => {
    leadWatchId = null;
    if (actionState !== "active" || !client?.connected) return;
    if (lastAssistantText() !== text) return;
    if (endsWithLeadPrompt(text)) return;
    const last = chatMessages[chatMessages.length - 1];
    if (last?.type !== "assistant") return;
    whenAssistantIdle(() => {
      if (lastAssistantText() !== text) return;
      if (endsWithLeadPrompt(text)) return;
      if (chatMessages[chatMessages.length - 1]?.type !== "assistant") return;
      dbg("lead watchdog", text.slice(0, 80));
      sendTeacherNote(
        `lead-${text.slice(0, 48)}`,
        `[Teacher note] Your last line ended without a question, so the child is waiting.${segmentContinuationHint()}${beginnerTurnHint()} Continue NOW with one short reaction if needed + exactly ONE question (English then ひらがな with the same meaning). Do NOT repeat your previous sentence.`
      );
    }, "lead");
  }, delay);
}

function hasAssistantReplySinceUser(userText) {
  const needle = normalizeUserText(userText);
  if (!needle) return false;
  let userIdx = -1;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type !== "user") continue;
    if (normalizeUserText(chatMessages[i].text) === needle) {
      userIdx = i;
      break;
    }
  }
  if (userIdx < 0) return false;
  for (let i = userIdx + 1; i < chatMessages.length; i++) {
    if (chatMessages[i].type === "assistant" && String(chatMessages[i].text || "").trim()) {
      return true;
    }
  }
  return false;
}

/** True if Learny started answering (audio or visible text) after the child's last turn. */
function hasAnyAssistantActivitySinceUserTurn(userText = pendingReplyText) {
  if (!lastUserTurnAt) return false;
  if (lastAssistantAudioAt >= lastUserTurnAt) return true;
  if (assistantIsSpeaking()) return true;
  if (userText && hasAssistantReplySinceUser(userText)) return true;
  return false;
}

/** Tool replies must stay SILENT — WHEN_IDLE coach text triggers extra spoken turns. */
function toolReplyScheduling(_preferSilent = "SILENT") {
  return "SILENT";
}

function markAssistantTranscriptChunk() {
  lastSilenceAssistantDoneAt = Date.now();
  lastTranscriptChunkAt = Date.now();
}

function lastAssistantText() {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type === "assistant") return String(chatMessages[i].text || "");
  }
  return "";
}

function looksLikeAgree(text, { afterTankInvite = false } = {}) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 40) return false;
  if (
    /^(ok+|okay|yes|yeah|yep|sure|of course|let'?s go|うん+|はい|ええ|いいよ|やる|たすける|手伝う|いいね)$/i.test(t)
  ) {
    return true;
  }
  if (afterTankInvite && /^(good|great|nice|cool|sounds good|いい|よろしく)$/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeTankInvite(text) {
  return /will you help|help me make|help me|いっしょに.*つく|つくれる[？?]|手伝|すいそう.*つく/i.test(
    String(text || "").toLowerCase()
  );
}

function looksLikeCh1Step1Question(text) {
  return /what do i need to make a tank|transparent and hard|とうめい.*かたい|すいそう.*なにが.*いる/i.test(
    String(text || "").toLowerCase()
  );
}

function assistantCh1SelfAnswered(text) {
  const t = String(text || "").toLowerCase();
  if (looksLikeCh1Step1Question(text)) {
    if (/can you say.*i need glass/i.test(t)) return false;
    if (/\bi need glass\b/.test(t)) return true;
  }
  if (/to make glass in minecraft|what do we need/i.test(t)) {
    if (/can you say.*i need sand/i.test(t)) return false;
    if (/\bi need sand\b/.test(t)) return true;
  }
  return false;
}

function trimCh1SelfAnswer(text) {
  let t = String(text || "").trim();
  if (!assistantCh1SelfAnswered(t)) return t;
  const cut = t.search(/\bi need (?:glass|sand)\b/i);
  if (cut > 0) t = t.slice(0, cut).trim().replace(/[.!?\s…]+$/u, "").trim();
  return t;
}

function looksLikeWarmupChatQuestion(text) {
  return /what did you do|how are you|are you hungry|what time|what color|what do you like|what'?s your favorite|did you eat|きょうはなに|どうですか|おなか|好き|なにをして/i.test(
    String(text || "").toLowerCase()
  );
}

function countWarmupUserReplies() {
  if (getCurrentSegment()?.type !== "warmup") return 0;
  return chatMessages.filter((m) => m.type === "user").length;
}

function warmupTankInviteAllowedYet() {
  return countWarmupUserReplies() >= 2;
}

/** Everyday chat + tank invite (or multiple questions) in one bubble — child never got to answer. */
function assistantWarmupStackedTurn(text) {
  const t = String(text || "");
  if (looksLikeTankInvite(t)) {
    if (assistantSkippedWarmupWait(t)) return true;
    if (looksLikeWarmupChatQuestion(t)) {
      const inviteAt = t.search(/oh[!,.]?\s*today i want|will you help|そうだ！.*きょうは|いっしょに.*つくれる/i);
      if (inviteAt > 0) {
        const before = t.slice(0, inviteAt);
        if (/[？?]/.test(before) || looksLikeWarmupChatQuestion(before)) return true;
      }
    }
    return false;
  }
  return (t.match(/[？?]/g) || []).length >= 2;
}

function assistantWarmupInviteOnly(text) {
  const t = String(text || "");
  return looksLikeTankInvite(t) && !assistantWarmupStackedTurn(t);
}

/** Tank invite + Chapter 1 in one bubble — child never got to answer. */
function assistantSkippedWarmupWait(text) {
  const t = String(text || "");
  if (!looksLikeTankInvite(t)) return false;
  return (
    looksLikeCh1Step1Question(t) ||
    /\bthank you\b.*tank|ありがとう.*(すいそう|水槽)/i.test(t) ||
    /what do i need to make a tank/i.test(t)
  );
}

function assistantBeforeLastUserMessage() {
  let seenUser = false;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type === "user") {
      if (!seenUser) {
        seenUser = true;
        continue;
      }
      break;
    }
    if (seenUser && chatMessages[i].type === "assistant") {
      return String(chatMessages[i].text || "");
    }
  }
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type === "assistant") return String(chatMessages[i].text || "");
  }
  return "";
}

function canCompleteWarmupPart1(userQuote = "") {
  const agreeText = userQuote || recentUserMessages(1)[0] || "";
  const inviteMsg = assistantBeforeLastUserMessage();
  const afterInvite = assistantWarmupInviteOnly(inviteMsg);
  if (!looksLikeAgree(agreeText, { afterTankInvite: afterInvite })) return false;
  if (!afterInvite) return false;
  return true;
}

function lastAssistantInvitedTankHelp() {
  return looksLikeTankInvite(lastAssistantText());
}

function buildWarmupUserCoachNote(userText) {
  if (getCurrentSegment()?.type !== "warmup") return "";
  if (looksLikeAgree(userText) && assistantWarmupInviteOnly(assistantBeforeLastUserMessage())) {
    return (
      "[Teacher note — do not read aloud] Child agreed to help with the tank. Say Thank you! / Great! (English then ひらがな) ONLY — then STOP. " +
      "Do NOT ask about glass or sand yet; Chapter 1 begins on your next turn after warmup completes." +
      beginnerTurnHint()
    );
  }
  if (looksLikeAgree(userText)) return "";
  const replies = countWarmupUserReplies();
  if (replies < 2) {
    return (
      "[Teacher note — do not read aloud] " +
      `Warmup (${replies}/2+ replies before tank invite): react briefly, ONE everyday follow-up only (English then ひらがな), then WAIT. ` +
      "FORBIDDEN this turn: fish tank, Will you help, すいそう, aquarium, Minecraft, a second English question." +
      beginnerTurnHint()
    );
  }
  return (
    "[Teacher note — do not read aloud] Enough warmup chat. If inviting now: tank invite ONLY — Will you help me make a fish tank? / いっしょに つくれる？ — then STOP. " +
    "Do NOT also ask What did you do today or any other question in the same turn." +
    beginnerTurnHint()
  );
}

function maybeWarmupCoachOnUserTurn(userText, { fromVoice = false } = {}) {
  const note = buildWarmupUserCoachNote(userText);
  if (!note) return;
  if (fromVoice) return;
  const replies = countWarmupUserReplies();
  sendTeacherNote(
    `warmup-user-${replies}-${normalizeUserText(userText).slice(0, 16)}`,
    note
  );
}

function maybeWarmupCoachNudge() {
  const seg = getCurrentSegment();
  if (seg?.type !== "warmup") return;
  const assistant = lastAssistantText();
  if (!assistantWarmupStackedTurn(assistant)) return;

  if (!looksLikeTankInvite(assistant) && assistantBubbleHasStackedQuestions(assistant)) {
    dbg("warmup stacked questions — display trimmed, skip extra coach turn");
    return;
  }

  let note = "[Teacher note — do not read aloud] WRONG: you moved on without waiting for the child. ";
  if (looksLikeTankInvite(assistant) && looksLikeWarmupChatQuestion(assistant)) {
    note +=
      "You combined an everyday question AND the tank invite in ONE turn. " +
      "Those must be separate turns — ask the follow-up, WAIT for their answer, then invite on a later turn.";
  } else if (assistantSkippedWarmupWait(assistant)) {
    note +=
      "You combined tank invite + Chapter 1. Invite only (いっしょに つくれる？), then WAIT for yes — no Thank you, no glass question.";
  } else {
    note += "ONE question per turn only — then WAIT for the child to answer before your next line.";
  }

  whenAssistantIdle(() => {
    sendTeacherNote("warmup-stack", note + beginnerTurnHint());
  }, "warmup-stack");
}

/** If Learny invited help and the child said yes, finish warmup before the API sees the reply. */
function maybeCompleteWarmupFromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (seg?.type !== "warmup") return "";
  if (!canCompleteWarmupPart1(userText)) return "";
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return "";
  dbg("warmup auto-complete", seg.id);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (afterSegmentAdvanced(seg.id, result, { lastQuote: userText })) {
    return HANDOFF_MARKER;
  }
  return buildAdvanceNudge(result.state);
}

/** After child says I made glass, finish ch3 and nudge Mini quiz 1 (not Chapter 4). */
function maybeCompleteCh3FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch3") return false;
  if (!/\b(i made glass|made glass)\b/i.test(userText)) return false;
  if (!userHasNeedToMakeGlassPhrase()) return false;
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return false;
  dbg("ch3 auto-complete", userText);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  updateLessonBanner();
  configureGeminiClient(client);
  setTimeout(() => {
    if (actionState !== "active" || !client?.connected) return;
    whenAssistantIdle(() => {
      sendTeacherNote("advance-ch3", buildAdvanceNudge(result.state));
    }, "ch3-advance");
  }, 350);
  return true;
}

/** Finish Ch1 when both I need glass + I need sand are said — keeps banner in sync. */
function maybeCompleteCh1FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch1") return "";
  if (!canCompleteCh1Part1()) return "";
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok || result.alreadyDone) return "";
  dbg("ch1 auto-complete", userText);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  updateLessonBanner();
  configureGeminiClient(client);
  return buildAdvanceNudge(result.state);
}

/** Finish Ch2 after English I found some sand! — hand off to Chapter 3 make glass. */
function maybeCompleteCh2FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch2") return "";
  if (!canCompleteCh2Part1()) return "";
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok || result.alreadyDone) return "";
  dbg("ch2 auto-complete", userText);
  ch2Search.phase = "done";
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  updateLessonBanner();
  configureGeminiClient(client);
  return buildAdvanceNudge(result.state);
}

function armPendingReplyWatch(userText, attempt = 0, { fromVoice = false } = {}) {
  if (pendingReplyWatchId) {
    clearTimeout(pendingReplyWatchId);
    pendingReplyWatchId = null;
  }
  pendingReplyText = userText;
  const delay = attempt === 0 ? REPLY_WATCH_MS : REPLY_WATCH_RETRY_MS;
  pendingReplyWatchId = setTimeout(() => {
    pendingReplyWatchId = null;
    if (actionState !== "active" || !client?.connected) return;
    if (hasAssistantReplySinceUser(userText) || hasAnyAssistantActivitySinceUserTurn(userText)) {
      awaitingAssistantReply = false;
      pendingReplyText = "";
      return;
    }

    const nudge = () => {
      if (actionState !== "active" || !client?.connected) return;
      if (hasAssistantReplySinceUser(userText) || hasAnyAssistantActivitySinceUserTurn(userText)) {
        awaitingAssistantReply = false;
        pendingReplyText = "";
        return;
      }
      if (fromVoice) {
        if (attempt === 0) {
          dbg("voice force activity_end", userText.slice(0, 32));
          closeOpenAudioTurn();
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          return;
        }
        if (!userTurnSentViaClientText) {
          dbg("voice reply fallback text turn", userText.slice(0, 32));
          const ch1Coach = buildCh1OutboundCoach(userText);
          const ch2Coach = buildCh2OutboundCoach(userText);
          const coach = ch1Coach || ch2Coach;
          const outbound = coach
            ? `${formatTeacherNote(coach)}\n\n[Child said:] ${userText}`
            : `[Child said:] ${userText}`;
          sendClientText(outbound, { force: true });
          userTurnSentViaClientText = true;
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          return;
        }
        if (attempt + 1 < REPLY_WATCH_MAX * 2) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
        } else {
          awaitingAssistantReply = false;
          pendingReplyText = "";
        }
        return;
      }

      // Typed / muted path: never wait on playback — resend a forced nudge.
      dbg("typed reply watchdog", { userText, attempt });
      const ch1Coach = buildCh1OutboundCoach(userText);
      const ch2Coach = buildCh2OutboundCoach(userText);
      const endingCoach =
        getCurrentSegment()?.id === "ending1" ? buildEnding1OutboundCoach({ afterAdvance: true }) : "";
      let outbound = `[Child said:] ${userText}\n\n[Internal] Reply NOW out loud in one short turn (English then ひらがな).`;
      if (ch1Coach) outbound = `${formatTeacherNote(ch1Coach)}\n\n[Child said:] ${userText}`;
      else if (ch2Coach) outbound = `${formatTeacherNote(ch2Coach)}\n\n[Child said:] ${userText}`;
      else if (endingCoach) outbound = `${endingCoach}\n\n[Child said:] ${userText}`;
      closeOpenAudioTurn();
      audioPlayer?.interrupt?.();
      sendClientText(outbound, { force: true });
      userTurnSentViaClientText = true;
      if (attempt + 1 < REPLY_WATCH_MAX + 1) {
        armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
      } else {
        awaitingAssistantReply = false;
        pendingReplyText = "";
      }
    };

    // Voice: wait until Learny finishes speaking so we don't barge in.
    // Text/muted: nudge immediately — playback wait was leaving kids stuck.
    if (fromVoice && assistantIsSpeaking()) {
      whenAssistantIdle(nudge, "reply");
    } else {
      nudge();
    }
  }, delay);
}

function processUserProgressSideEffects(userText, { skipWarmup = false, fromVoice = false, skipCh2 = false } = {}) {
  const t = String(userText || "").trim();
  if (!t) return;
  const sideKey = normalizeUserText(t);
  const now = Date.now();
  if (sideKey === lastSideEffectKey && now - lastSideEffectAt < 1500) {
    dbg("side effects deduped", t.slice(0, 32));
    return;
  }
  lastSideEffectKey = sideKey;
  lastSideEffectAt = now;
  lastUserTurnAt = now;
  coachNudgesSinceLastUserTurn = 0;
  postTurnNudgesForUserKey = "";
  lastPendingUserText = t;
  blockCoachUntilUserSpeaks = false;
  assistantTranscriptOpen = false;
  resetAssistantTurnTranscript();
  maybeWarmupCoachOnUserTurn(t, { fromVoice });
  maybeCh1CoachOnUserTurn(t, { fromVoice });
  userTurnSentViaClientText = fromVoice ? false : userTurnSentViaClientText;
  bumpIdleGeneration();
  clearLeadWatch();
  leadWatchArmedFor = "";
  turnEndProcessed = false;
  awaitingAssistantReply = true;
  if (!skipCh2) handleCh2SearchProgress(t);
  if (!skipWarmup) {
    maybeCompleteWarmupFromClient(t);
  }
  // Voice path has no typed outbound coach — inject Ch2 coaches when the model
  // must change course (found-sand elicit, or next NEW everyday question).
  if (fromVoice && !userTurnSentViaClientText) {
    const coach = buildCh2OutboundCoach(t);
    const needVoiceCoach =
      Boolean(coach) &&
      (looksLikeFoundSand(t) === "found" ||
        looksLikeFoundSand(t) === "phrase" ||
        userSaysStillSearchingSand(t) ||
        (ch2Search.phase === "search" &&
          ch2Search.rallies > 0 &&
          ch2Search.rallies <= CH2_SEARCH_RALLIES));
    if (needVoiceCoach) {
      sendClientText(`${formatTeacherNote(coach)}\n\n[Child said:] ${t}`, { force: true });
      userTurnSentViaClientText = true;
    }
  }
  maybeCompleteCh1FromClient(t);
  maybeCompleteCh2FromClient(t);
  maybeCompleteCh3FromClient(t);
  maybeCompleteCh6FromClient(t);
  maybeAdvanceFinal1Quiz(t);
  maybeCompleteFinal1FromClient(t);
  maybeAdvanceEnding1Beat(t, {
    skipNotify: userTurnSentViaClientText && getCurrentSegment()?.id === "ending1",
  });
  armPendingReplyWatch(t, 0, { fromVoice });
}

function sendUserText(text) {
  const t = String(text || "").trim();
  if (!t) return;
  if (isHandoffRunning || isChapterHandoff || actionState === "connecting") {
    addMessage("ちょっとまってね — つぎの章のじゅんび中だよ。", "system");
    return;
  }
  if (!client?.connected || actionState !== "active") {
    addMessage("右上の「はじめる」を押してから送ってね。", "system");
    return;
  }
  lastSilenceUserSpeechAt = Date.now();
  addMessage(t, "user");
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  cancelAssistantTurnEnd();
  // Text path (often with mic muted): close any open voice activity and stop
  // playback so Gemini answers the typed turn immediately.
  closeOpenAudioTurn();
  // Always clear playback clock so reply-watch isn't blocked by stale audio timing.
  audioPlayer?.interrupt?.();
  handleCh2SearchProgress(t);
  lastPendingUserText = t;

  // Keep outbound short — long coach prefixes slow the Live reply.
  // Critical chapter coaches (Ch1/Ch2) stay on the child's turn to keep flow on-script.
  const advanceNote =
    maybeCompleteWarmupFromClient(t) ||
    maybeCompleteCh1FromClient(t) ||
    maybeCompleteCh2FromClient(t);
  const ch1Coach = buildCh1OutboundCoach(t);
  const ch2Coach = buildCh2OutboundCoach(t);
  let outbound = t;
  const handoffNow = advanceNote === HANDOFF_MARKER || skipOutboundForHandoff;
  if (handoffNow) {
    outbound = "";
  } else if (advanceNote) {
    outbound = `${advanceNote}\n\n[Child said:] ${t}`;
  } else if (ch1Coach) {
    outbound = `${formatTeacherNote(ch1Coach)}\n\n[Child said:] ${t}`;
  } else if (ch2Coach) {
    outbound = `${formatTeacherNote(ch2Coach)}\n\n[Child said:] ${t}`;
  } else if (getCurrentSegment()?.id === "ending1") {
    const endingCoach = buildEnding1OutboundCoach();
    if (endingCoach) outbound = `${endingCoach}\n\n[Child said:] ${t}`;
  }

  if (handoffNow) {
    typedSendSkippedForVoice = false;
    userTurnSentViaClientText = false;
    dbg("typed send skipped; chapter handoff pending");
  } else if (isRecentVoiceDuplicate(t)) {
    dbg("typed send skipped; voice turn already sent", t.slice(0, 32));
    typedSendSkippedForVoice = true;
    userTurnSentViaClientText = false;
  } else {
    typedSendSkippedForVoice = false;
    userTurnSentViaClientText = Boolean(sendClientText(outbound));
  }
  processUserProgressSideEffects(t, { skipWarmup: true, skipCh2: true });
}

function configureGeminiClient(geminiClient) {
  const state = loadLessonState();
  geminiClient.functions = [];
  geminiClient.functionsMap = {};
  geminiClient.systemInstructions = buildLessonInstructions(state, LEVEL_INFO.id);
  geminiClient.inputAudioTranscription = true;
  geminiClient.outputAudioTranscription = true;
  geminiClient.googleGrounding = false;
  geminiClient.enableAffectiveDialog = false;
  geminiClient.responseModalities = ["AUDIO"];
  geminiClient.voiceName = voice;
  geminiClient.temperature = temperature;
  geminiClient.proactivity = { proactiveAudio: false };
  // Manual activity markers from the local voice gate — automatic server VAD
  // waits on ambient noise and often delays Learny's reply by several seconds.
  geminiClient.automaticActivityDetection = {
    disabled: true,
  };
  geminiClient.addFunction(new RecordMemoryTool());
  geminiClient.addFunction(new CompleteSegmentTool());
  geminiClient.addFunction(new AwardBadgeTool());
  geminiClient.setEnableFunctionCalls(true);
  // Chapter handoff always clears sessionResumeHandle; drop-resume may set it.
  geminiClient.resumeHandle = sessionResumeHandle || null;
}

function handleTools(functionCalls) {
  const toolResponses = [];
  const queueReply = (id, name, body, scheduling = "SILENT") => {
    if (!id || !client) {
      dbg("tool missing id", { name, body });
      return;
    }
    toolResponses.push({ id, name, responseBody: body, scheduling });
  };

  functionCalls.forEach((functionCall) => {
    const { id, name, args } = functionCall;
    if (name === "record_memory") {
      const result = recordMemory(args?.key, args?.value);
      queueReply(id, name, {
        result: result.ok ? "ok" : "ignored",
        message: result.ok
          ? "Memory saved. Use only this fact later."
          : "Do not invent. Ask the child again.",
      }, toolReplyScheduling());
      updateLessonBanner();
      return;
    }
    if (name === "award_badge") {
      const bid = args?.badge_id || args?.badgeId;
      if (bid === "aquarium_master" && getActiveLessonId() === "part1") {
        queueReply(id, name, {
          result: "not_yet",
          message: "Aquarium Master is Part 2 only.",
        }, toolReplyScheduling());
        return;
      }
      recordLessonBadge(bid);
      queueReply(id, name, { result: "ok" }, toolReplyScheduling());
      notifyParentProgress();
      return;
    }
    if (name === "complete_segment") {
      let sid = args?.segment_id || args?.segmentId || getCurrentSegment().id;
      let quote = args?.user_quote || args?.userQuote || "";
      const together = Boolean(args?.said_together || args?.saidTogether);
      if (sid === "ch6" && getActiveLessonId() === "part1" && !quote && userHasTankReadyPhrase()) {
        quote =
          recentUserMessages()
            .slice()
            .reverse()
            .find(looksLikeTankReadyPhrase) || quote;
      }
      if (sid === "ch1" && getActiveLessonId() === "part1" && !canCompleteCh1Part1()) {
        const msg = !userHasNeedGlassPhrase()
          ? "Chapter 1 Step 1 is not done. Ask What do I need to make a tank? Something transparent and hard — wait for glass, then I need glass. Do NOT skip to sand yet."
          : "Chapter 1 Step 2 is not done. Child has not said I need sand yet. Ask To make glass in Minecraft, what do we need?";
        queueReply(id, name, { result: "not_yet", message: msg }, toolReplyScheduling());
        return;
      }
      if (sid === "ch3" && getActiveLessonId() === "part1" && !userHasNeedToMakeGlassPhrase()) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              "Chapter 3 Step 1 not done. Ask what we do with sand to make glass → I need to make glass. Do NOT complete until the child has said that phrase.",
          },
          toolReplyScheduling()
        );
        return;
      }
      const warmupSeg = getSegmentById(sid) || getCurrentSegment();
      if (
        (sid === "ch0" || warmupSeg?.type === "warmup") &&
        getActiveLessonId() === "part1" &&
        !canCompleteWarmupPart1(quote)
      ) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              "Warmup NOT done. Ask: Will you help me make a fish tank? (いっしょに つくれる？) on its OWN turn — then STOP and WAIT for yes/ok. " +
              "Do NOT combine everyday chat + tank invite in one message. " +
              "Do NOT say Thank you or ask about glass/sand until the child agrees on a later turn.",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch2" && getActiveLessonId() === "part1" && !canCompleteCh2Part1()) {
        const stillSearching = userSaysStillSearchingSand(
          quote || recentUserMessages().slice(-1)[0] || ""
        );
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message: stillSearching
              ? "Child said not yet / まだ. Ask ONE new everyday question (ocean/mountains? can you hear the waves? hot? what do you see?). " +
                "Do NOT repeat Let me know when you find sand or Keep looking. " +
                ch2CoachHint()
              : "Chapter 2 is NOT done. The child has not said I found some sand! in English yet. " +
                "Never say We have sand. " +
                (ch2CoachHint() ||
                  "Stay in Ch2 search chat before Have you found sand yet?") +
                " Only call complete_segment(ch2) after they clearly say I found some sand! in English.",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "quiz1" && getActiveLessonId() === "part1" && !canCompleteQuiz1Part1()) {
        const done = countQuiz1ItemsAnswered();
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              `Mini quiz 1 is NOT done (${done}/4 items). Ask the NEXT listed quiz question only. ` +
              "FORBIDDEN: I put glass here, building walls, color, dye. " +
              "After 3–4 quiz answers, call complete_segment(quiz1).",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch6" && getActiveLessonId() === "part1" && !canCompleteCh6Part1()) {
        const msg = userHasImDonePhrase()
          ? "Chapter 6 is NOT done yet. Child said I'm done! — praise that, then teach My tank is ready! " +
            "Do NOT say Almost or おしい. complete_segment(ch6) only after My tank is ready! in English."
          : ch6CoachHint() ||
            "Chapter 6: sand phrases in order → I'm done! → My tank is ready! before complete_segment(ch6).";
        queueReply(id, name, { result: "not_yet", message: msg }, toolReplyScheduling());
        return;
      }
      if (sid === "final1" && getActiveLessonId() === "part1" && !canCompleteFinal1Part1()) {
        initFinal1QuizIfNeeded();
        const done = countFinal1ItemsAnswered();
        const total = final1Quiz.indices.length || 5;
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              `Final challenge is NOT done (${done}/${total} items). Ask the EXACT NEXT cue in ひらがな from coach only. ` +
              "FORBIDDEN: inventing questions, bare は えいごで？, kanji. " +
              (currentFinal1Prompt() ? `Next cue: ${currentFinal1Prompt()}` : "") +
              " After the last item is answered, call complete_segment(final1).",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (
        sid === "ending1" &&
        getActiveLessonId() === "part1" &&
        ending1Beat.userTurns < ENDING1_BEATS.length - 1
      ) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              "Ending is NOT done yet — ONE beat per turn, then wait for the child. " +
              ending1CoachHint(),
          },
          toolReplyScheduling()
        );
        return;
      }
      if (PART1_POST_QUIZ1_IDS.has(sid) && getActiveLessonId() === "part1" && !isQuiz1CompletedInState()) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              "Mini quiz 1 is NOT finished. Stay on quiz1 — one listed item at a time. " +
              "Do NOT teach I put glass here, tank walls, or colors until complete_segment(quiz1) succeeds.",
          },
          toolReplyScheduling()
        );
        return;
      }
      const result = completeSegment(sid, { userQuote: quote, saidTogether: together });
      if (!result.ok) {
        queueReply(id, name, {
          result: "not_yet",
          message: `Stay on this chapter. Reason: ${result.reason}. Softly continue; do not scold.`,
        }, toolReplyScheduling());
        return;
      }
      if (!result.alreadyDone) {
        try {
          questSfx.playQuestComplete();
        } catch {
          // ignore
        }
      }
      updateLessonBanner();
      if (result.lessonComplete) {
        queueReply(
          id,
          name,
          {
            result: "ok",
            message: "Lesson complete. Say goodbye briefly if you have not already — do NOT repeat the full ending.",
          },
          "SILENT"
        );
        showLessonCompleteModal();
        ensureEnding1HangUpWatch();
        return;
      }
      configureGeminiClient(client);
      const willHandoff = !result.alreadyDone && shouldHandoffAfter(sid);
      const advanceMsg = result.alreadyDone
        ? "Already on the next chapter. Continue that chapter; end with one question."
        : willHandoff
          ? "Segment complete. Client is reconnecting for the next chapter — stay silent until the new session opens."
          : buildAdvanceNudge(result.state) ||
            "Segment advanced. Continue from system instructions. One short beat ending with a question.";
      queueReply(
        id,
        name,
        {
          result: "ok",
          message: advanceMsg,
        },
        "SILENT"
      );
      if (!result.alreadyDone) {
        if (willHandoff) {
          scheduleChapterHandoff({
            reason: `after-${sid}`,
            lastQuote: quote,
          });
        } else {
          const advanceKey = `advance-${sid}-${result.state.segmentIndex}`;
          setTimeout(() => {
            if (actionState !== "active" || !client?.connected) return;
            if (isHandoffRunning || isChapterHandoff) return;
            sendTeacherNote(advanceKey, buildAdvanceNudge(result.state));
          }, 400);
        }
      }
      return;
    }
    queueReply(id, name, { result: "ok" }, toolReplyScheduling());
  });

  if (toolResponses.length) {
    dbg("tool responses", toolResponses.map((r) => ({ name: r.name, scheduling: r.scheduling })));
    client.sendToolResponses(toolResponses);
  }
}

function handleMessage(message) {
  // Hang-up / idle: ignore late Live messages so Learny cannot keep talking.
  if (actionState !== "active" && actionState !== "connecting") return;
  if (intentionalDisconnect && message.type === MultimodalLiveResponseType.AUDIO) {
    return;
  }
  switch (message.type) {
    case MultimodalLiveResponseType.TEXT:
      markAssistantTranscriptChunk();
      if (isMetaAssistantLeak(message.data)) break;
      if (!client?.outputAudioTranscription) addMessage(message.data, "assistant");
      break;
    case MultimodalLiveResponseType.AUDIO:
      if (!audioPlayer || audioPlayer.destroyed) break;
      lastAssistantAudioAt = Date.now();
      lastSilenceAssistantDoneAt = Date.now();
      // Stop mic hangover so we don't barge into Learny's reply.
      audioStreamer?.resetVoiceGate?.();
      audioPlayer.play(message.data);
      break;
    case MultimodalLiveResponseType.INPUT_TRANSCRIPTION:
      addMessage(message.data.text, "user-transcript", "append");
      if (message.data.finished && message.data.text?.trim()) {
        lastSilenceUserSpeechAt = Date.now();
        const spoken = message.data.text.trim();
        lastVadUserText = spoken;
        lastVadUserAt = Date.now();
        handleCh2SearchProgress(spoken);
        lastPendingUserText = spoken;
        // Transcription finished ⇒ user turn is done. Force activity_end and
        // close the mic gate so Gemini starts speaking immediately.
        closeOpenAudioTurn();
        processUserProgressSideEffects(spoken, { fromVoice: true, skipCh2: true });
      }
      break;
    case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION: {
      const chunk = String(message.data.text || "");
      const finished = Boolean(message.data.finished);
      if (!chunk.trim() && !finished) break;
      cancelAssistantTurnEnd();
      applyAssistantTranscriptChunk(chunk, { finished });
      if (chunk.trim() || finished) markAssistantTranscriptChunk();
      if (pendingReplyText && hasAssistantReplySinceUser(pendingReplyText)) {
        awaitingAssistantReply = false;
        clearPendingReplyWatch();
      }
      break;
    }
    case MultimodalLiveResponseType.TURN_COMPLETE:
      finishAssistantTurn();
      break;
    case MultimodalLiveResponseType.SETUP_COMPLETE:
      dbg("setup complete");
      kickOpeningTurn();
      ensureSilenceWatch();
      break;
    case MultimodalLiveResponseType.TOOL_CALL: {
      const functionCalls =
        message.data.functionCalls || message.data.function_calls || [];
      handleTools(functionCalls);
      break;
    }
    case MultimodalLiveResponseType.INTERRUPTED:
      if (audioPlayer) audioPlayer.interrupt();
      assistantTranscriptOpen = false;
      cancelAssistantTurnEnd();
      break;
    default:
      break;
  }
}

function attachClientHandlers(geminiClient) {
  geminiClient.onReceiveResponse = (message) => handleMessage(message);
  geminiClient.onErrorMessage = (msg) => dbg("gemini error", msg);
  geminiClient.onGoAway = () => {
    dbg("goAway — reconnecting");
    if (
      intentionalDisconnect ||
      isChapterHandoff ||
      isHandoffRunning ||
      actionState !== "active" ||
      isAutoReconnecting
    ) {
      return;
    }
    resumeSessionAfterDrop();
  };
  geminiClient.onSessionResumptionUpdate = (handle) => {
    if (intentionalDisconnect || isChapterHandoff || isHandoffRunning || actionState === "idle") {
      return;
    }
    sessionResumeHandle = handle;
  };
  geminiClient.onClose = () => {
    connected = false;
    if (
      !intentionalDisconnect &&
      !isChapterHandoff &&
      !isHandoffRunning &&
      sessionResumeHandle &&
      actionState === "active"
    ) {
      resumeSessionAfterDrop();
    } else {
      updateActionUI();
    }
  };
}

async function connectAPI() {
  client = new GeminiLiveAPI(activeProxyUrl, projectId, model);
  configureGeminiClient(client);
  attachClientHandlers(client);
  dbg("connecting", { proxy: activeProxyUrl, lesson: LESSON.id });
  await client.connect();
  connected = true;
  if (!audioStreamer) audioStreamer = new AudioStreamer(client);
  else audioStreamer.updateClient(client);
  bindVoiceGateActivity();
  if (!audioPlayer?.isInitialized) {
    audioPlayer = audioPlayer || new AudioPlayer();
    await audioPlayer.init();
  }
  audioPlayer.setVolume(volumeLevel / 100);
}

function resetVoiceSessionUI({ lessonId } = {}) {
  if (lessonId && lessonId !== getActiveLessonId()) return;

  if (actionState === "active" || actionState === "connecting") {
    disconnectAPI();
    actionState = "idle";
  }

  openingSent = false;
  sessionResumeHandle = null;
  intentionalDisconnect = false;
  postTurnNudgesForUserKey = "";
  lastPendingUserText = "";
  bannerSegmentId = "";
  resetCh2Search();
  resetFinal1Quiz();
  resetEnding1Beat();
  clearPendingReplyWatch();
  clearLeadWatch();
  clearEnding1HangUpWatch();
  cancelAssistantTurnEnd();
  chatMessages = [];
  assistantTranscriptOpen = false;
  resetAssistantTurnTranscript();
  blockCoachUntilUserSpeaks = false;
  turnEndProcessed = false;
  awaitingAssistantReply = false;
  sentTeacherNotes.clear();
  bumpIdleGeneration();

  if (questModal) {
    questModal.classList.remove("active");
    questModal.setAttribute("aria-hidden", "true");
  }

  renderChatNow();
  updateLessonBanner();
  updateActionUI();
}

function shouldHandoffAfter(completedSegmentId) {
  return getActiveLessonId() === "part1" && PART1_HANDOFF_AFTER.has(completedSegmentId);
}

function clearPendingHandoffTimer() {
  if (pendingHandoffTimer) {
    clearTimeout(pendingHandoffTimer);
    pendingHandoffTimer = null;
  }
}

/**
 * After a hinge segment completes: schedule a fresh Live reconnect for the next segment.
 * Returns true if handoff was scheduled (caller should skip advance teacher notes).
 */
function scheduleChapterHandoff({ reason, lastQuote = "" } = {}) {
  if (isHandoffRunning || actionState === "idle") return false;
  skipOutboundForHandoff = true;
  pendingHandoffQuote = String(lastQuote || "").trim();
  clearPendingHandoffTimer();
  dbg("schedule chapter handoff", { reason, quote: pendingHandoffQuote.slice(0, 40) });
  pendingHandoffTimer = setTimeout(() => {
    pendingHandoffTimer = null;
    handoffToCurrentSegment({
      reason: reason || "handoff",
      lastQuote: pendingHandoffQuote,
    });
  }, 280);
  return true;
}

/**
 * Tear down Live client + speaker but keep the mic stream for a soft chapter handoff.
 */
function teardownLiveForHandoff() {
  intentionalDisconnect = true;
  stopSilenceWatch();
  clearEnding1HangUpWatch();
  clearPendingReplyWatch();
  clearLeadWatch();
  leadWatchArmedFor = "";
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  awaitingAssistantReply = false;
  cancelAssistantTurnEnd();
  bumpIdleGeneration();
  sessionResumeHandle = null;
  openingSent = false;
  userActivityOpen = false;
  if (audioPlayer) {
    audioPlayer.destroy();
    audioPlayer = null;
  }
  if (audioStreamer) {
    audioStreamer.pauseStreaming();
    audioStreamer.updateClient(null);
  }
  if (client) {
    client.onReceiveResponse = () => {};
    client.onGoAway = () => {};
    client.onSessionResumptionUpdate = () => {};
    client.onClose = () => {};
    client.disconnect();
    client = null;
  }
  connected = false;
}

/**
 * Soft in-call reconnect: fresh system instructions for the CURRENT segment.
 * Does not use session resumption (that would restore the old chapter context).
 */
async function handoffToCurrentSegment({ reason = "handoff", lastQuote = "" } = {}) {
  if (isHandoffRunning) return false;
  if (actionState === "idle") return false;
  if (isAutoReconnecting) return false;

  isHandoffRunning = true;
  isChapterHandoff = true;
  skipOutboundForHandoff = false;
  const quote = lastQuote || pendingHandoffQuote || "";
  pendingHandoffQuote = "";
  actionState = "connecting";
  updateActionUI();
  if (reason !== "stuck_retry") {
    addMessage("よくできた！つぎいこう…", "system");
  } else {
    addMessage("もういちどつなぐね…", "system");
  }
  dbg("chapter handoff start", { reason, segment: getCurrentSegment()?.id });

  pendingOpeningKickOpts = {
    handoff: true,
    lastQuote: quote,
    reason,
  };
  teardownLiveForHandoff();

  try {
    intentionalDisconnect = false;
    audioPlayer = new AudioPlayer();
    await audioPlayer.init();
    audioPlayer.setVolume(volumeLevel / 100);

    await connectAPI();
    if (audioStreamer) {
      audioStreamer.updateClient(client);
      bindVoiceGateActivity();
      audioStreamer.setMuted(isMuted);
      if (!isMuted) {
        await audioStreamer.ensureStreaming();
        audioStreamer.resumeStreaming();
        audioStreaming = true;
      } else {
        audioStreamer.pauseStreaming();
        audioStreaming = false;
      }
    }
    actionState = "active";
    openingSent = false;
    lastSilenceUserSpeechAt = Date.now();
    lastSilenceAssistantDoneAt = Date.now();
    kickOpeningTurn({ handoff: true, lastQuote: quote, reason });
    ensureSilenceWatch();
    updateActionUI();
    dbg("chapter handoff done", { reason, segment: getCurrentSegment()?.id });
    return true;
  } catch (error) {
    dbg("chapter handoff failed", String(error?.message || error));
    addMessage("つぎの章につなげなかったよ。もういちど押してみてね。", "system");
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
    return false;
  } finally {
    isHandoffRunning = false;
    isChapterHandoff = false;
    intentionalDisconnect = false;
    updateActionUI();
  }
}

/**
 * Shared post-complete_segment advance: handoff at hinges, else advance teacher note.
 */
function afterSegmentAdvanced(completedId, result, { lastQuote = "" } = {}) {
  if (!result?.ok || result.alreadyDone) return false;
  updateLessonBanner();
  if (shouldHandoffAfter(completedId)) {
    scheduleChapterHandoff({
      reason: `after-${completedId}`,
      lastQuote,
    });
    return true;
  }
  if (client) configureGeminiClient(client);
  return false;
}

function disconnectAPI() {
  clearPendingHandoffTimer();
  skipOutboundForHandoff = false;
  isChapterHandoff = false;
  isHandoffRunning = false;
  intentionalDisconnect = true;
  stopSilenceWatch();
  clearEnding1HangUpWatch();
  clearPendingReplyWatch();
  clearLeadWatch();
  leadWatchArmedFor = "";
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  awaitingAssistantReply = false;
  cancelAssistantTurnEnd();
  bumpIdleGeneration();
  resetCh2Search();
  resetFinal1Quiz();
  resetEnding1Beat();
  sessionResumeHandle = null;
  pendingOpeningKickOpts = null;
  // Kill speaker first so buffered PCM cannot finish after hang-up.
  if (audioPlayer) {
    audioPlayer.destroy();
    audioPlayer = null;
  }
  if (client) {
    // Drop handlers before close so queued WS frames cannot revive speech.
    client.onReceiveResponse = () => {};
    client.onGoAway = () => {};
    client.onSessionResumptionUpdate = () => {};
    client.onClose = () => {};
    client.disconnect();
    client = null;
  }
  if (audioStreamer) {
    audioStreamer.stop();
    audioStreamer = null;
    audioStreaming = false;
  }
  connected = false;
  openingSent = false;
  userActivityOpen = false;
}

async function resumeSessionAfterDrop() {
  if (isAutoReconnecting || isHandoffRunning || isChapterHandoff) return;
  isAutoReconnecting = true;
  bumpIdleGeneration();
  try {
    intentionalDisconnect = true;
    if (client) {
      client.disconnect();
      client = null;
    }
    intentionalDisconnect = false;
    await connectAPI();
    if (audioStreamer) {
      audioStreamer.updateClient(client);
      bindVoiceGateActivity();
    }
    if (!chatMessages.some((m) => m.type === "assistant")) {
      openingSent = false;
      kickOpeningTurn();
    }
    ensureSilenceWatch();
  } catch {
    bumpIdleGeneration();
    addMessage("接続が切れちゃった。もう一度スタートしてね。", "system");
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
  }
  isAutoReconnecting = false;
}

function tickSilenceWatch() {
  if (actionState !== "active" || !client?.connected) {
    stopSilenceWatch();
    return;
  }
  if (assistantIsSpeaking()) return;
  if (getCurrentSegment()?.id === "ending1") return;
  const quiet = Date.now() - Math.max(lastSilenceUserSpeechAt, lastSilenceAssistantDoneAt);
  if (quiet < SILENCE_PROMPT_MS || Date.now() - lastSilencePromptAt < SILENCE_PROMPT_MS) return;
  lastSilencePromptAt = Date.now();
  whenAssistantIdle(() => {
    if (actionState !== "active" || !client?.connected) return;
    sendTeacherNote("silence", buildSilencePrompt());
  }, "silence");
}

function startSilenceWatch() {
  if (silenceWatchId) return;
  silenceWatchId = setInterval(tickSilenceWatch, 4000);
}

function stopSilenceWatch() {
  if (!silenceWatchId) return;
  clearInterval(silenceWatchId);
  silenceWatchId = null;
}

function ensureSilenceWatch() {
  if (actionState === "active") startSilenceWatch();
  else stopSilenceWatch();
}

async function handleActionButton() {
  if (actionState === "connecting" || actionState === "active") {
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
    return;
  }
  if (getActiveLessonId() === "part2" && !isPart1Complete()) {
    addMessage("Part 1 を先に終わらせてから Part 2 をやろう！", "system");
    return;
  }
  actionState = "connecting";
  openingSent = false;
  userActivityOpen = false;
  sessionResumeHandle = null;
  intentionalDisconnect = false;
  isMuted = false;
  resetCh2Search();
  resetFinal1Quiz();
  resetEnding1Beat();
  clearPendingReplyWatch();
  chatMessages = [];
  assistantTranscriptOpen = false;
  resetAssistantTurnTranscript();
  blockCoachUntilUserSpeaks = false;
  turnEndProcessed = false;
  awaitingAssistantReply = false;
  sentTeacherNotes.clear();
  postTurnNudgesForUserKey = "";
  lastSideEffectKey = "";
  lastSideEffectAt = 0;
  lastOutboundText = "";
  lastOutboundAt = 0;
  renderChatNow();
  updateActionUI();
  try {
    if (!audioStreamer) audioStreamer = new AudioStreamer(null);
    await audioStreamer.start();
    audioStreamer.pauseStreaming();
    audioPlayer = audioPlayer || new AudioPlayer();
    if (!audioPlayer.isInitialized) {
      await audioPlayer.init();
      audioPlayer.setVolume(volumeLevel / 100);
    }
    await questSfx.ensureContext();
    await connectAPI();
    audioStreamer.updateClient(client);
    bindVoiceGateActivity();
    audioStreamer.setMuted(false);
    await audioStreamer.ensureStreaming();
    audioStreaming = true;
    actionState = "active";
    lastSilenceUserSpeechAt = Date.now();
    lastSilenceAssistantDoneAt = Date.now();
    updateActionUI();
    ensureSilenceWatch();
    // SETUP_COMPLETE can arrive while still "connecting"; retry opening once active.
    kickOpeningTurn();
  } catch (error) {
    dbg("connect failed", String(error?.message || error));
    disconnectAPI();
    actionState = "idle";
    addMessage("接続できなかったよ。もう一度はじめるを押してみてね。", "system");
    updateActionUI();
  }
}

function showLessonCompleteModal() {
  if (!questModal) return;
  questModal.setAttribute("aria-hidden", "false");
  questModal.classList.add("active");
  const state = loadLessonState();
  const lesson = getLesson(state.lessonId);
  if (questModalTitle) questModalTitle.textContent = "よくできたね！";
  if (questModalBody) {
    questModalBody.textContent =
      state.lessonId === "part1"
        ? "水槽の準備できた！お魚はまだいないよ。次のレッスンのあと、Part 2 で思い出そう。"
        : `${lesson.title} おしまい！ラーニー先生とたくさん英語で話せたね。`;
  }
  if (questModalNext) questModalNext.style.display = "none";
  if (questModalDone) {
    questModalDone.textContent = "OK";
    questModalDone.onclick = () => {
      questModal.classList.remove("active");
      questModal.setAttribute("aria-hidden", "true");
    };
  }
}

function toggleMute() {
  if (actionState !== "active" || !audioStreamer) return;
  isMuted = !isMuted;
  audioStreamer.setMuted(isMuted);
  if (isMuted) {
    // Hand the turn back so typed chat works immediately while muted.
    closeOpenAudioTurn();
  }
  updateActionUI();
}

btnAction?.addEventListener("click", () => handleActionButton());
btnMute?.addEventListener("click", () => toggleMute());
btnRetry?.addEventListener("click", () => {
  if (actionState !== "active" || isHandoffRunning || isChapterHandoff) return;
  handoffToCurrentSegment({ reason: "stuck_retry" });
});
btnSend?.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  sendUserText(text);
});
chatInput?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    sendUserText(text);
  }
});

window.addEventListener("beforeunload", () => disconnectAPI());
window.addEventListener("message", (e) => {
  if (e.data?.type === "gc_reset_lesson") {
    const lessonId = e.data.lessonId || getActiveLessonId();
    resetLesson(lessonId, getActiveLevelId());
    resetVoiceSessionUI({ lessonId });
  }
  if (e.data?.type === "gc_end_call") {
    if (actionState === "active" || actionState === "connecting") {
      disconnectAPI();
      actionState = "idle";
      updateActionUI();
    }
  }
});

updateLessonBanner();
updateActionUI();
dbg("homework voice ready", { level: LEVEL_INFO.id, lesson: LESSON.id });
