/**
 * Homework Learny voice session (Gemini Live). Replaces Minecraft quest session.
 */
import { GeminiLiveAPI, MultimodalLiveResponseType } from "./gemini-api.js";
import { AudioStreamer, AudioPlayer } from "./media-utils.js";
import {
  RecordMemoryTool,
  CompleteSegmentTool,
} from "./lesson-tools.js";
import {
  matchesPatterns,
  normalizeText,
  getActiveLevelInfo,
  getActiveLesson,
  getActiveLessonId,
  loadLessonState,
  saveLessonState,
  getCurrentSegment,
  getSegmentById,
  completeSegment,
  recordMemory,
  getLesson,
  buildLessonInstructions,
  buildOpeningNudge,
  buildAdvanceNudge,
  buildHandoffOpeningNudge,
  getClickChoices,
  isPart1Complete,
  getSegmentChapterMeta,
  resetLesson,
  ensureChapterPlayCounted,
  getActiveLevelId,
  setLearnerDisplayName,
  daily1OpenSpeak,
  daily1BridgeTurnInstruction,
  final1OpenSpeak,
} from "./lesson-engine.js";
import { resolveProxyUrl } from "./proxy-config.js";
import { PART1_ELICIT_JA, CH6_BEAT1_SPEAK } from "./lessons/aquarium-part1.js";
import { QuestSfx } from "./quest-sfx.js";
import {
  getCurrentMcqBeat,
  getSegmentMcqBeats,
  isMcqCorrect,
  recordMcqAttempt,
  advanceMcqCursor,
  setMcqCursor,
  loadMcqCursor,
  resetMcqCursor,
  formatChoiceLabel,
  normalizeMcqChoice,
  getShuffledChoiceLabels,
  clearShuffledChoiceCache,
} from "./mcq-engine.js";

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

/** Intermediate: same lesson flow, voice answers only (no on-screen choice buttons). */
function isIntermediateVoiceOnly() {
  return getActiveLevelId() === "intermediate";
}

/** Spoken elicit cue for intermediate (no 「選んで」/button language). */
function elicitJaForActiveLevel(text) {
  const s = String(text || "");
  if (!isIntermediateVoiceOnly()) return s;
  return s.replace(/の\s*えいごを\s*選んでね！/g, "を えいごで いってみて！");
}

function intermediateAnswerWaitHint() {
  return "WAIT for the child to SPEAK the English answer (no on-screen buttons). Do NOT tell them to tap or choose a button.";
}

/** Rewrite button-centric teacher/coach notes for intermediate voice-only. */
function adaptTeacherNoteForLevel(text) {
  if (!isIntermediateVoiceOnly() || !text) return text || "";
  return elicitJaForActiveLevel(String(text))
    .replace(/4-choice MCQ buttons?/gi, "spoken English answers (no buttons)")
    .replace(/4-button MCQ/gi, "spoken English answers")
    .replace(/4-button tap/gi, "spoken English answer")
    .replace(/4-button choice/gi, "spoken English answer")
    .replace(/\(4-button\)/gi, "(spoken answer)")
    .replace(/WAIT for a 4-button tap\.?/gi, "WAIT for the child to speak the English.")
    .replace(/WAIT for the 4-button tap\.?/gi, "WAIT for the child to speak the English.")
    .replace(/WAIT for the button\/tap\.?/gi, "WAIT for the child to speak the English.")
    .replace(/Then WAIT for a 4-button tap\.?/gi, "Then WAIT for the child to speak the English.")
    .replace(/show 4-button MCQ/gi, "wait for spoken English")
    .replace(/on-screen 4-choice buttons/gi, "voice answers only")
    .replace(/child taps a 4-button choice/gi, "child speaks the English answer");
}

const voice = "Kore";
const temperature = 0.9;
const volumeLevel = 80;
/** Part 1: reconnect Live after these segments complete (fresh system instructions). */
const PART1_HANDOFF_AFTER = new Set(["ch0", "ch1", "ch2", "ch3", "quiz1", "ch4", "ch5", "daily1", "ch6"]);
const HANDOFF_MARKER = "__HANDOFF__";
/**
 * Chapter handoff uses a FAST hard reconnect (reuse mic/speaker; new Live session).
 * Soft same-socket handoff kept huge chat history and made next-chapter audio very slow.
 */
const HANDOFF_DELAY_MS = 0;

const btnAction = document.getElementById("btn-action");
const btnMute = document.getElementById("btn-mute");
const btnRetry = document.getElementById("btn-retry");
const btnEndingEnd = document.getElementById("btn-ending-end");
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
const learnyThinkingEl = document.getElementById("learny-thinking");
const questModal = document.getElementById("quest-modal");
const questModalTitle = document.getElementById("quest-modal-title");
const questModalBody = document.getElementById("quest-modal-body");
const questModalNext = document.getElementById("quest-modal-next");
const questModalDone = document.getElementById("quest-modal-done");
const questSkipBtn = document.getElementById("quest-skip-btn");
const choiceBar = document.getElementById("lesson-choice-bar");
const questLoadingOverlay = document.getElementById("quest-loading-overlay");
const questLoadingTitle = document.getElementById("quest-loading-title");
const questLoadingSub = document.getElementById("quest-loading-sub");

const ICON_PHONE =
  '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.97-1.16a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const ICON_PHONE_OFF =
  '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M10.7 13.3 5 19"/><path d="M14.3 10.7 19 5"/><path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h2a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
const ICON_MIC =
  '<svg class="btn-icon mute-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
const ICON_MIC_OFF =
  '<svg class="btn-icon mute-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2"/><path d="M12 19v4"/><path d="M8 23h8"/></svg>';

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
let handoffKickWatchId = null;
/** True from chapter handoff start until Learny begins speaking the new chapter. */
let chapterTransitionActive = false;
let chapterTransitionSafetyId = null;
let pendingHandoffQuote = "";
/** Skip sending the child's turn on the old socket when a handoff was just scheduled. */
let skipOutboundForHandoff = false;
/** Options for the next kickOpeningTurn (handoff / stuck retry survive SETUP_COMPLETE). */
let pendingOpeningKickOpts = null;
let sessionResumeHandle = null;
let chatMessages = [];
let openingSent = false;
let userActivityOpen = false;
let pendingReplyWatchId = null;
let pendingReplyText = "";
let leadWatchId = null;
let leadWatchArmedFor = "";
let assistantTranscriptOpen = false;
let assistantTurnTranscript = "";
let turnEndProcessed = false;
let idleGeneration = 0;
let renderChatScheduled = false;
let learnyThinkingShown = false;
let learnyThinkingHideTimer = null;
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
let repairIncompleteTimer = null;
const sentTeacherNotes = new Set();
const REPLY_WATCH_MS = 3200;
const REPLY_WATCH_RETRY_MS = 2800;
const REPLY_WATCH_MAX = 2;
/** Avoid interrupting the same stacked turn twice. */
let stackedSpeechInterruptedFor = "";
const LEAD_WATCH_MS = 2800;
const PLAYBACK_IDLE_MS = 250;
const CH2_SEARCH_RALLIES = 2;
const questSfx = new QuestSfx();

/**
 * Ch2 scripted beats:
 * place → direction → chat (hot, see) → waiting (quiet search) → checking → done
 */
let ch2Search = { phase: "place", rallies: 0, lastEverydayKey: "", askedKeys: [], answeredKeys: [] };
let ch2ElicitForceAt = 0;
let ch2ElicitCoachSentAt = 0;
let ch2PendingElicitForce = false;
let ch4BeatBForceAt = 0;
let ch4LetsMakeForceAt = 0;
const DAILY1_MIN_RALLIES = 4;
let daily1Chat = { rallies: 0, backToTankSpoken: false };
let daily1OpenForceAt = 0;
let daily1BridgeForceAt = 0;

const CH2_PLACE_SPEAK =
  "Let's go find some sand! Do you want to go to the beach or the mountains? すなを さがしに いこう！ びーちと やま、どっちに いく？";
const CH2_DIRECTION_SPEAK =
  "Do you want to go to the left or right? ひだりと みぎ、どっちに いく？";
const CH2_HOT_SPEAK = "Is it hot outside? そとは あつい？";
const CH2_SEE_SPEAK = "What can you see around you? まわりに なにが みえる？";
/** After beat 4 — go straight to found-sand elicit (no keep-looking wait). */
const CH2_ELICIT_FOUND_SPEAK =
  `We found some sand! Can you say it in English? ${PART1_ELICIT_JA.foundSand}`;
/** Legacy / recovery only — do not use as the normal post-see line. */
const CH2_WAITING_HINT =
  "Brief cheer only (OK! Keep looking! / がんばって！) then WAIT while they search. FORBIDDEN: inventing new questions.";

const CH2_EVERYDAY_BANK = [
  {
    key: "hot",
    label: "Is it hot outside?",
    speak: CH2_HOT_SPEAK,
    test: /is it hot|hot outside|そとは\s*あつい|きょうは\s*あつい|\bあつい[？?]/i,
  },
  {
    key: "see",
    label: "What can you see around you?",
    speak: CH2_SEE_SPEAK,
    test: /what can you see|what do you see|around you|まわりに|なにが\s*みえる|何が\s*見える/i,
  },
];

/** Never ask these in Ch2 / Daily English search chat. */
const FORBIDDEN_EVERYDAY_RE =
  /are you tired|tired yet|もう\s*つかれ|つかれた[？?]|つかれて|can you hear the waves|なみのおと|waves\?/i;

/** Daily English — color was already chosen in Chapter 4 (favoriteColor memory). */
const DAILY1_FORBIDDEN_COLOR_RE =
  /favorite color|favourite color|what color do you like|what about your (?:favorite|favourite) color|what'?s your color|すきな\s*いろ|好きな\s*いろ|どの\s*いろ/i;

function resetCh2Search() {
  ch2Search = { phase: "place", rallies: 0, lastEverydayKey: "", askedKeys: [], answeredKeys: [] };
  ch2ElicitCoachSentAt = 0;
  ch2PendingElicitForce = false;
  ch2ElicitForceAt = 0;
}

function ch2ResumeElicitUnlocked() {
  return Boolean(loadLessonState().segmentUi?.ch2?.foundElicitSpoken);
}

function persistCh2SearchState() {
  if (getCurrentSegment()?.id !== "ch2") return;
  const state = loadLessonState();
  const prev = state.segmentUi?.ch2 || {};
  state.segmentUi = {
    ...(state.segmentUi || {}),
    ch2: {
      phase: ch2Search.phase,
      rallies: ch2Search.rallies,
      lastEverydayKey: ch2Search.lastEverydayKey,
      askedKeys: [...(ch2Search.askedKeys || [])],
      answeredKeys: [...(ch2Search.answeredKeys || [])],
      hotAnsweredMsgIndex: Number(ch2Search.hotAnsweredMsgIndex) || 0,
      foundElicitSpoken:
        ch2AssistantSaidFoundElicit() || Boolean(prev.foundElicitSpoken),
    },
  };
  saveLessonState(state);
}

function restoreCh2PhaseFromMcqCursor() {
  const idx = loadMcqCursor("ch2");
  if (idx <= 0) ch2Search.phase = "place";
  else if (idx === 1) ch2Search.phase = "direction";
  else ch2Search.phase = "chat";
}

function restoreCh2SearchState() {
  if (getCurrentSegment()?.id !== "ch2") return;
  const saved = loadLessonState().segmentUi?.ch2;
  if (saved?.phase) {
    ch2Search = {
      phase: saved.phase,
      rallies: Number(saved.rallies) || 0,
      lastEverydayKey: String(saved.lastEverydayKey || ""),
      askedKeys: Array.isArray(saved.askedKeys) ? [...saved.askedKeys] : [],
      answeredKeys: Array.isArray(saved.answeredKeys) ? [...saved.answeredKeys] : [],
      hotAnsweredMsgIndex: Number(saved.hotAnsweredMsgIndex) || 0,
    };
  } else {
    restoreCh2PhaseFromMcqCursor();
  }
  syncCh2McqCursorFromPhase();
  if (saved?.foundElicitSpoken) {
    ch2Search.phase = "checking";
    const beats = getSegmentMcqBeats(getCurrentSegment());
    const idx = beats.findIndex((b) => b.id === "found_sand");
    if (idx >= 0) setMcqCursor("ch2", idx);
  }
}

function clearSegmentUi(segmentId) {
  const state = loadLessonState();
  if (!state.segmentUi?.[segmentId]) return;
  const next = { ...(state.segmentUi || {}) };
  delete next[segmentId];
  state.segmentUi = next;
  saveLessonState(state);
}

function segmentHasMcqProgress(segmentId, state = loadLessonState()) {
  if (loadMcqCursor(segmentId) > 0) return true;
  const prefix = `${segmentId}.`;
  return Object.keys(state.mcqSummary || {}).some((k) => k.startsWith(prefix));
}

function isMidChapterResume(state = loadLessonState()) {
  const segment = getCurrentSegment(state);
  if (!segment) return false;
  if (segmentHasMcqProgress(segment.id, state)) return true;
  if (segment.id === "ch2") {
    const p = state.segmentUi?.ch2?.phase;
    if (p && p !== "place" && p !== "idle") return true;
  }
  if (segment.id === "ch4" && state.memories?.favoriteColor) return true;
  return false;
}

function restoreChapterUiFromLessonState() {
  const segment = getCurrentSegment();
  if (segment?.id === "ch2") restoreCh2SearchState();
}

function buildMidChapterResumeNudge(state = loadLessonState()) {
  if (!isMidChapterResume(state)) return null;
  const segment = getCurrentSegment(state);
  if (!segment) return null;

  if (segment.id === "ch2") {
    restoreCh2SearchState();
    const speak = ch2NextScriptSpeak();
    return (
      "[Teacher note — do not read aloud] Resume mid-Chapter 2 (child reconnected). " +
      "Brief welcome back (one short line), then speak EXACTLY then WAIT: " +
      speak +
      " " +
      ch2AntiRepeatRule() +
      beginnerTurnHint()
    );
  }

  if (segment.id === "ch4" && state.memories?.favoriteColor) {
    const color = state.memories.favoriteColor;
    if (ch4AssistantSaidBeatB()) {
      return (
        "[Teacher note — do not read aloud] Resume mid-Chapter 4. Color is " +
        color +
        ". Re-speak make+tell if needed, then WAIT for MCQ: " +
        ch4CombinedMakeAndTellSpeak(color) +
        beginnerTurnHint()
      );
    }
    return (
      "[Teacher note — do not read aloud] Resume mid-Chapter 4. favoriteColor is " +
      color +
      ". Speak EXACTLY (Beat A2+B combined), then WAIT for MCQ: " +
      ch4CombinedMakeAndTellSpeak(color) +
      " FORBIDDEN: ask favorite color again / walls / say I made " +
      color +
      " glass yourself." +
      beginnerTurnHint()
    );
  }

  const beats = getSegmentMcqBeats(segment);
  const idx = loadMcqCursor(segment.id);
  if (beats.length && idx >= 0 && idx < beats.length) {
    const beat = beats[idx];
    const unlocked = mcqUnlockFlags(segment);
    const cur = getCurrentMcqBeat(segment, { unlocked });
    const target = cur?.beat || beat;
    return (
      "[Teacher note — do not read aloud] Resume mid-chapter (child reconnected). " +
      "Brief welcome back (one short line), then " +
      buildMcqSpeakCoach(target) +
      beginnerTurnHint()
    );
  }
  return null;
}

function detectCh2EverydayKey(text) {
  const t = String(text || "");
  if (!t) return "";
  if (
    /have you found.*sand|found sand yet|let me know when you find|みつけたら|みつからない|left or right|beach or the mountains|let'?s go find some sand/i.test(
      t
    )
  ) {
    return "";
  }
  for (const item of CH2_EVERYDAY_BANK) {
    if (item.test.test(t)) return item.key;
  }
  return "";
}

/** Rebuild askedKeys from recent chat so anti-repeat survives missed in-memory updates. */
function syncCh2AskedKeysFromChat() {
  for (const msg of recentAssistantMessages(20)) {
    rememberCh2EverydayFromAssistant(msg);
  }
}

function ch2HotWasAsked() {
  syncCh2AskedKeysFromChat();
  if ((ch2Search.askedKeys || []).includes("hot")) return true;
  return recentAssistantMessages(16).some((m) => detectCh2EverydayKey(m) === "hot");
}

function ch2AssistantSaidSeeQuestion(text = lastAssistantText()) {
  const t = String(text || "");
  if (!t) return false;
  return detectCh2EverydayKey(t) === "see" || /what can you see|around you|まわりに|なにが\s*みえる/i.test(t);
}

function ch2HotWasAnswered() {
  return (ch2Search.answeredKeys || []).includes("hot");
}

function ch2SeeWasAnswered() {
  return (ch2Search.answeredKeys || []).includes("see");
}

/** Both free-talk questions have been asked (beat 3 + beat 4). */
function ch2ChatBeatsAsked() {
  return ch2HotWasAsked() && ch2SeeWasAsked();
}

function syncCh2PhaseFromChat() {
  if (ch2Search.phase === "done" || ch2Search.phase === "checking") return;
  syncCh2AskedKeysFromChat();
  if (ch2Search.phase === "idle" || !ch2Search.phase) {
    ch2Search.phase = "place";
  }
  // If Learny already asked a chat question, catch phase up to chat.
  if (
    (ch2HotWasAsked() || ch2SeeWasAsked()) &&
    (ch2Search.phase === "place" || ch2Search.phase === "direction")
  ) {
    ch2Search.phase = "chat";
  }
  // Do NOT set waiting here from askedKeys/rallies — that skipped beat 4
  // (rallies was double-counted: once when asked, again when answered).
  // Waiting is set only after the child answers "see".
}

function ch2AskedLabels() {
  syncCh2AskedKeysFromChat();
  return CH2_EVERYDAY_BANK.filter((item) => (ch2Search.askedKeys || []).includes(item.key)).map(
    (item) => item.label
  );
}

function ch2AskedKeySet() {
  syncCh2AskedKeysFromChat();
  const asked = new Set(ch2Search.askedKeys || []);
  if (ch2Search.lastEverydayKey) asked.add(ch2Search.lastEverydayKey);
  const liveKey = detectCh2EverydayKey(lastAssistantText());
  if (liveKey) asked.add(liveKey);
  return asked;
}

function ch2NextEverydayItem() {
  const asked = ch2AskedKeySet();
  // Do not offer "see" until the child has answered "hot".
  const unused = CH2_EVERYDAY_BANK.filter((item) => {
    if (asked.has(item.key)) return false;
    if (item.key === "see" && !ch2HotWasAnswered()) return false;
    return true;
  });
  if (unused.length) return unused[0];
  return null;
}

function ch2NextEverydayQuestion() {
  const item = ch2NextEverydayItem();
  return item ? item.label : "(wait while they search)";
}

function ch2NextEverydaySpeak() {
  const item = ch2NextEverydayItem();
  if (item) return item.speak || item.label;
  // Prefer see only after hot was asked AND the child answered beat 3.
  if (ch2HotWasAsked() && ch2HotWasAnswered() && !ch2SeeWasAsked()) return CH2_SEE_SPEAK;
  if (ch2HotWasAsked() && !ch2HotWasAnswered()) return CH2_HOT_SPEAK;
  return CH2_ELICIT_FOUND_SPEAK;
}

function ch2AssistantSaidFoundElicit(text = lastAssistantText()) {
  return /we found some sand|you found some sand|あ[！!]\s*砂あった|「(?:すなを|砂を)見つけた」|(?:すなを|砂を)見つけた.*英語で/i.test(
    String(text || "")
  );
}

/** Keep MCQ cursor aligned when place/direction were answered by voice instead of buttons. */
function syncCh2McqCursorFromPhase() {
  if (getCurrentSegment()?.id !== "ch2") return;
  const beats = getSegmentMcqBeats(getCurrentSegment());
  if (!beats.length) return;
  const phase = ch2Search.phase || "place";
  let minIdx = 0;
  if (phase === "direction") minIdx = 1;
  else if (phase === "chat" || phase === "waiting" || phase === "checking" || phase === "done") {
    minIdx = beats.findIndex((b) => b.id === "found_sand");
    if (minIdx < 0) minIdx = Math.min(2, beats.length - 1);
  }
  const cur = loadMcqCursor("ch2");
  if (cur < minIdx) setMcqCursor("ch2", minIdx);
}

/** Show found-sand MCQ once Learny speaks the beat-5 elicit (even if phase was still chat). */
function ensureCh2FoundSandMcqReady() {
  if (getCurrentSegment()?.id !== "ch2") return false;
  if (!ch2AssistantSaidFoundElicit()) return false;
  syncCh2McqCursorFromPhase();
  const beats = getSegmentMcqBeats(getCurrentSegment());
  const idx = beats.findIndex((b) => b.id === "found_sand");
  if (idx >= 0 && loadMcqCursor("ch2") < idx) setMcqCursor("ch2", idx);
  if (ch2Search.phase !== "done") ch2Search.phase = "checking";
  persistCh2SearchState();
  return true;
}

/** True if beat-5 found-sand elicit was already spoken or forced since the child's last turn. */
function ch2FoundElicitAlreadyDelivered() {
  if (ch2ElicitCoachSentAt && Date.now() - ch2ElicitCoachSentAt < 30000) return true;
  if (ch2ElicitForceAt && Date.now() - ch2ElicitForceAt < 30000) return true;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const m = chatMessages[i];
    if (m.type === "user") break;
    if (m.type === "assistant" && ch2AssistantSaidFoundElicit(m.text)) return true;
  }
  return ch2AssistantSaidFoundElicit();
}

function sharesCh2FoundElicitBeat(a, b) {
  return ch2AssistantSaidFoundElicit(a) && ch2AssistantSaidFoundElicit(b);
}

function ch2LastAssistantWasSeeQuestion(text = lastAssistantText()) {
  const t = String(text || "");
  if (!t) return false;
  if (/keep looking|さがしてみて|take your time|ゆっくり探/i.test(t)) return false;
  return detectCh2EverydayKey(t) === "see" || /what can you see|around you|まわりに|なにが\s*みえる/i.test(t);
}

/** Hard-force beat 5 elicit (soft coaches are often ignored → Keep looking loops). */
function isCh2FoundElicitCoachNote(coach) {
  return (
    Boolean(coach) &&
    /We found some sand|found-sand elicit|Beat 4 answered|After What can you see|あ[！!]\s*砂あった|砂を見つけた/i.test(
      coach
    )
  );
}

function finalizeCh2ElicitForceAfterUserTurn(userText) {
  if (!ch2PendingElicitForce) return;
  if (getCurrentSegment()?.id !== "ch2" || ch2Search.phase !== "checking") {
    ch2PendingElicitForce = false;
    return;
  }
  const coach = buildCh2OutboundCoach(userText);
  if (isCh2FoundElicitCoachNote(coach)) {
    ch2ElicitCoachSentAt = Date.now();
    dbg("ch2 elicit coach on user turn; skip duplicate force");
  } else {
    armCh2ElicitForceAfterSee();
  }
  ch2PendingElicitForce = false;
}

function forceCh2FoundSandElicit(reason = "after-see") {
  if (!isCh2SandSearchContext()) return false;
  if (!client?.connected || actionState !== "active") return false;
  if (ch2FoundElicitAlreadyDelivered()) return false;
  if (ch2AssistantSaidFoundElicit()) return false;
  if (ch2ElicitCoachSentAt && Date.now() - ch2ElicitCoachSentAt < 15000) return false;
  if (ch2ElicitForceAt && Date.now() - ch2ElicitForceAt < 10000) return false;
  ch2Search.phase = "checking";
  ch2ElicitForceAt = Date.now();
  renderChoiceBar(getCurrentSegment());
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak EXACTLY NOW: " +
    CH2_ELICIT_FOUND_SPEAK +
    " Then WAIT for I found some sand! (4-button). No Keep looking / free-talk.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force ch2 found elicit", reason);
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

/** Short scripted-line coach — long praise/beginner notes made Ch2 Live replies very slow. */
function ch2ScriptCoach(speak, lead = "Continue") {
  return (
    "[Teacher note — do not read aloud] " +
    lead +
    ". ONE short react, then Speak EXACTLY: " +
    speak +
    " Then WAIT. EN + matching ひらがな."
  );
}

/** Resolve the next Ch2 line from chat progress — never re-ask an answered beat. */
function ch2RecoverSpeakLine(userText = "") {
  const user = String(userText || lastPendingUserText || recentUserMessages(1)[0] || "").trim();
  syncCh2PhaseFromChat();
  rememberCh2EverydayFromAssistant(lastAssistantText());
  if (user) rememberCh2EverydayAnswered(lastAssistantText());

  if (looksLikePlacePick(user) || (assistantAskedPlaceQuestion() && user && !looksLikeDirectionPick(user))) {
    if (ch2Search.phase === "place" || ch2Search.phase === "idle") ch2Search.phase = "direction";
  }
  if (
    looksLikeDirectionPick(user) ||
    (assistantAskedDirectionQuestion() && user && !looksLikePlacePick(user))
  ) {
    if (ch2Search.phase === "direction" || ch2Search.phase === "place") {
      ch2Search.phase = "chat";
    }
  }

  if (ch2HotWasAnswered() && !ch2SeeWasAsked()) return CH2_SEE_SPEAK;
  if (ch2HotWasAsked() && !ch2HotWasAnswered()) return CH2_HOT_SPEAK;
  if (ch2Search.phase === "direction" || (looksLikePlacePick(user) && !assistantAskedDirectionQuestion())) {
    return CH2_DIRECTION_SPEAK;
  }
  if (ch2Search.phase === "chat") return ch2NextEverydaySpeak() || CH2_HOT_SPEAK;
  if (ch2Search.phase === "checking" || ch2Search.phase === "waiting") return CH2_ELICIT_FOUND_SPEAK;
  // Only open with place if it has not already been asked in this chat.
  if (assistantAskedPlaceQuestion(recentAssistantMessages(8).join("\n")) && looksLikePlacePick(user)) {
    return CH2_DIRECTION_SPEAK;
  }
  return ch2NextScriptSpeak();
}

/** Force the next scripted Ch2 line when Gemini stalls (e.g. after うん on hot). */
function forceCh2ScriptLine(speak, reason = "ch2-script") {
  if (!isCh2SandSearchContext()) return false;
  if (!client?.connected || actionState !== "active") return false;
  const line = String(speak || "").trim();
  if (!line) return false;
  if (line === CH2_ELICIT_FOUND_SPEAK) return forceCh2FoundSandElicit(reason);
  // Never stack a force on top of a Live reply that already moved forward.
  const past = recentAssistantMessages(6).join("\n");
  const last = lastAssistantText();
  if (line === CH2_SEE_SPEAK && (ch2AssistantSaidSeeQuestion(last) || ch2AssistantSaidSeeQuestion(past))) {
    return false;
  }
  if (line === CH2_HOT_SPEAK && (detectCh2EverydayKey(last) === "hot" || /hot outside|そとは\s*あつい/i.test(past))) {
    return false;
  }
  if (line === CH2_DIRECTION_SPEAK && assistantAskedDirectionQuestion(past)) return false;
  if (line === CH2_PLACE_SPEAK && assistantAskedPlaceQuestion(past)) return false;
  if (sharesSameLeadQuestion(last, line) || (assistantAskedPlaceQuestion(last) && line === CH2_PLACE_SPEAK)) {
    return false;
  }
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak EXACTLY NOW: " +
    line +
    " Then WAIT. One short EN + ひらがな turn. FORBIDDEN: repeating the previous question.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force ch2 script line", reason, line.slice(0, 40));
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

/** Schedule a forced elicit if Learny does not say beat 5 after the child answered see. */
function armCh2ElicitForceAfterSee() {
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ch2") return;
    if (ch2Search.phase !== "checking" && ch2Search.phase !== "waiting") return;
    if (ch2FoundElicitAlreadyDelivered()) return;
    if (ch2ElicitCoachSentAt && Date.now() - ch2ElicitCoachSentAt < 12000) return;
    if (ch2AssistantSaidFoundElicit()) return;
    forceCh2FoundSandElicit("see-answered-no-elicit");
  }, "ch2-force-elicit");
}

/** Exact next line for the scripted Chapter 2 order. */
function ch2NextScriptSpeak() {
  syncCh2PhaseFromChat();
  const phase = ch2Search.phase || "place";
  if (phase === "place" || phase === "idle") return CH2_PLACE_SPEAK;
  if (phase === "direction") return CH2_DIRECTION_SPEAK;
  if (phase === "chat") {
    if (!ch2HotWasAsked()) return CH2_HOT_SPEAK;
    // Beat 3 must be answered before Beat 4.
    if (!ch2HotWasAnswered()) return CH2_HOT_SPEAK;
    if (!ch2SeeWasAsked()) return CH2_SEE_SPEAK;
    // After beat 4 is on screen / answered → found-sand elicit
    return CH2_ELICIT_FOUND_SPEAK;
  }
  if (phase === "waiting" || phase === "checking") return CH2_ELICIT_FOUND_SPEAK;
  return CH2_PLACE_SPEAK;
}

function ch2UnusedEverydaySuggestions() {
  const nextSpeak = ch2NextScriptSpeak();
  const asked = ch2AskedKeySet();
  const extras = CH2_EVERYDAY_BANK.filter((item) => !asked.has(item.key) && item.speak !== nextSpeak)
    .slice(0, 2)
    .map((item) => item.label);
  return [nextSpeak, ...extras].filter(Boolean).join(" / ");
}

function rememberCh2EverydayFromAssistant(text) {
  const key = detectCh2EverydayKey(text);
  if (!key) return;
  // Don't record Beat 4 as asked until Beat 3 has been answered.
  if (key === "see" && !ch2HotWasAnswered()) return;
  // Ignore premature Beat 4 lines that were spoken before the child answered Beat 3.
  if (key === "see" && Number.isFinite(ch2Search.hotAnsweredMsgIndex)) {
    const start = Number(ch2Search.hotAnsweredMsgIndex) || 0;
    const seeAfterHot = chatMessages.slice(start).some(
      (m) => m.type === "assistant" && detectCh2EverydayKey(m.text) === "see"
    );
    if (!seeAfterHot) return;
  }
  ch2Search.lastEverydayKey = key;
  if (!ch2Search.askedKeys.includes(key)) {
    ch2Search.askedKeys.push(key);
  }
}

function rememberCh2EverydayAnswered(assistantText = lastAssistantText()) {
  const key =
    detectCh2EverydayKey(assistantText) ||
    ch2Search.lastEverydayKey ||
    (ch2HotWasAsked() && !ch2HotWasAnswered() ? "hot" : "") ||
    (ch2SeeWasAsked() && !ch2SeeWasAnswered() ? "see" : "");
  if (!key) return;
  if (!Array.isArray(ch2Search.answeredKeys)) ch2Search.answeredKeys = [];
  if (!ch2Search.answeredKeys.includes(key)) {
    ch2Search.answeredKeys.push(key);
    if (key === "hot") {
      ch2Search.hotAnsweredMsgIndex = chatMessages.length;
      // Drop any premature Beat 4 mark from before the child answered Beat 3.
      ch2Search.askedKeys = (ch2Search.askedKeys || []).filter((k) => k !== "see");
    }
    persistCh2SearchState();
  }
}

function ch2SeeWasAsked() {
  // Premature Beat 4 (before Beat 3 answered) must not unlock later beats.
  if (!ch2HotWasAnswered()) return false;
  syncCh2AskedKeysFromChat();
  if ((ch2Search.askedKeys || []).includes("see")) return true;
  const start = Number(ch2Search.hotAnsweredMsgIndex) || 0;
  return chatMessages
    .slice(start)
    .some((m) => m.type === "assistant" && detectCh2EverydayKey(m.text) === "see");
}

function ch2EverydayRepeatCount(key) {
  if (!key) return 0;
  const item = CH2_EVERYDAY_BANK.find((i) => i.key === key);
  if (!item) return 0;
  return recentAssistantMessages(16).filter((m) => item.test.test(m)).length;
}

function ch2AntiRepeatRule() {
  const askedLabels = ch2AskedLabels();
  const next = ch2NextScriptSpeak();
  return (
    "Follow the Chapter 2 script in order. NEVER repeat a question the child already answered. " +
    "FORBIDDEN: Are you tired? / Can you hear the waves? / inventing other questions. " +
    (askedLabels.length ? `ALREADY ASKED chat: ${askedLabels.join(" / ")}. ` : "") +
    `Speak EXACTLY this next (EN then matching ひらがな), then WAIT: ${next}`
  );
}
let final1Quiz = {
  indices: [],
  cursor: 0,
  answered: 0,
  lastAnsweredPromptJa: "",
  answeredPrompts: [],
};
let final1OpenForceAt = 0;
let bannerSegmentId = "";

/** Ending = 2 spoken turns (intro combined, then finale after fish answer). */
const ENDING1_INTRO_COUNT = 1;
const ENDING1_FINALE_START_INDEX = 1;
const ENDING1_FINALE_COUNT = 1;

const ENDING1_INTRO_SPEAK =
  "Perfect! We made a fish tank together! Thank you for helping! ぱーふぇくと！ いっしょに すいそうを つくれたね！ てつだって くれて ありがとう！ " +
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！ " +
  "What kind of fish should we catch? どんな おさかなを つかまえよう？";

/** Second half of Turn A — used when Perfect already played so we never re-say Perfect. */
const ENDING1_INTRO_REMAINDER_SPEAK =
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！ " +
  "What kind of fish should we catch? どんな おさかなを つかまえよう？";

/** Hold-on patch when Gemini jumped to the fish question and skipped the middle. */
const ENDING1_HOLD_ON_SPEAK =
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！";

const ENDING1_FINALE_SPEAK =
  "Hmm... I can't stop thinking about it! うーん… わくわく しちゃう！ " +
  "Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time! " +
  "つぎの まいんくらふと レッスンで この すいそうを かざって おさかなを いれて かんせい させよう！ また ね！";

const ENDING1_BEATS = [
  {
    en: ENDING1_INTRO_SPEAK,
    jp: "",
    coach: "ENDING Turn A: client-owned exact script — stay silent until forced.",
  },
  {
    en: ENDING1_FINALE_SPEAK,
    jp: "",
    coach: "ENDING finale: client-owned goodbye after 終わりにする.",
    final: true,
  },
];

/** Pending delayed kick after final1 → ending1 (cancel on reset / second schedule). */
let ending1OpeningTimerId = null;

let ending1Beat = {
  userTurns: 0,
  autoSpoken: 0,
  autoCoachSent: 0,
  introNoteSent: false,
  introRepairSent: false,
  introDisplayLocked: false,
  introSeededAt: 0,
  introAudioSent: false,
  introKickInFlight: false,
  introHeardPerfect: false,
  introHeardHoldOn: false,
  introHeardFishQ: false,
  introHeardFishQAt: 0,
  /** After first Turn A speak finishes — drop any further Perfect audio. */
  introSpeechComplete: false,
  introFirstAudioAt: 0,
  introLastAudioPacketAt: 0,
  introPacketCount: 0,
  introTurnCompleteCount: 0,
  finaleSpoken: 0,
  finaleCoachSent: 0,
  finaleForceScheduled: false,
  finaleScheduledAt: 0,
  finaleNoteSent: false,
  freeTalk: false,
  freeTalkAnnounced: false,
  finaleRequested: false,
  hangUpScheduled: false,
  advancedForUserKey: "",
  lastForceAt: 0,
  lastForceKind: "",
};

/** Clears the delayed final1→ending kick timer when Turn A already started. */
function cancelEnding1OpeningTimer() {
  if (ending1OpeningTimerId) {
    clearTimeout(ending1OpeningTimerId);
    ending1OpeningTimerId = null;
  }
}

let ending1IntroQuietTimerId = null;
let ending1IntroSealIdleTimerId = null;

function clearEnding1IntroQuietTimer() {
  if (ending1IntroQuietTimerId) {
    clearTimeout(ending1IntroQuietTimerId);
    ending1IntroQuietTimerId = null;
  }
  if (ending1IntroSealIdleTimerId) {
    clearTimeout(ending1IntroSealIdleTimerId);
    ending1IntroSealIdleTimerId = null;
  }
}

/** Seal Turn A so a second Perfect generation cannot play (incl. audio-only ghost). */
function sealEnding1IntroSpeech(reason = "seal") {
  if (ending1Beat.introSpeechComplete) {
    // Already sealed — still kill any late audio.
    try {
      audioPlayer?.interrupt?.();
    } catch {
      // ignore
    }
    return;
  }
  ending1Beat.introSpeechComplete = true;
  ending1Beat.introAudioSent = true;
  ending1Beat.introNoteSent = true;
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
  cancelEnding1OpeningTimer();
  clearEnding1IntroQuietTimer();
  dbg("ending1 intro speech sealed", reason);
  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
}

/** Drop duplicate Turn A audio (Gemini ghost Perfect often has NO STT / no bubble). */
function shouldDropEnding1IntroAudio() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (ending1Beat.finaleRequested || ending1Beat.freeTalk) return false;
  if (ending1Beat.introSpeechComplete) return true;
  return false;
}

/**
 * Handle one AUDIO packet during ending Turn A.
 * Returns true if the packet must be dropped (ghost second Perfect with no transcription).
 */
function gateEnding1IntroAudioPacket() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (ending1Beat.finaleRequested || ending1Beat.freeTalk) return false;
  if (!(ending1Beat.introAudioSent || ending1Beat.introDisplayLocked || ending1Beat.introKickInFlight)) {
    return false;
  }
  if (ending1Beat.introSpeechComplete) return true;

  const now = Date.now();
  const kickAt = ending1Beat.introSeededAt || ending1Beat.introFirstAudioAt || now;
  const age = now - kickAt;
  const gap = ending1Beat.introLastAudioPacketAt ? now - ending1Beat.introLastAudioPacketAt : 0;

  if (!ending1Beat.introFirstAudioAt) {
    ending1Beat.introFirstAudioAt = now;
  }
  ending1Beat.introPacketCount = (ending1Beat.introPacketCount || 0) + 1;

  // Hard cap: one full Turn A is ~18–24s. Anything past this is a ghost restart.
  if (now - ending1Beat.introFirstAudioAt > 28000) {
    sealEnding1IntroSpeech("max-audio-duration");
    return true;
  }

  // Packet-stream gap after a real first burst = new model generation (often NO STT).
  // 900ms is above Live jitter but below a deliberate second speak.
  if (
    ending1Beat.introPacketCount > 25 &&
    gap > 900 &&
    (ending1Beat.introHeardPerfect ||
      ending1Beat.introHeardHoldOn ||
      ending1Beat.introHeardFishQ ||
      ending1Beat.introDisplayLocked ||
      age > 10000)
  ) {
    sealEnding1IntroSpeech("audio-gap-restart");
    return true;
  }

  ending1Beat.introLastAudioPacketAt = now;
  // Keep quiet-seal armed from packet activity (works even with zero STT).
  armEnding1IntroQuietSeal();
  return false;
}

/**
 * After fish/hold OR a long first burst with no STT: quiet means first speak ended —
 * seal before a ghost Perfect restart (audio-only, no bubble).
 */
function armEnding1IntroQuietSeal() {
  if (ending1Beat.introSpeechComplete) return;
  const age = Date.now() - (ending1Beat.introSeededAt || ending1Beat.introFirstAudioAt || Date.now());
  const canSealOnQuiet =
    ending1Beat.introHeardFishQ ||
    ending1Beat.introHeardHoldOn ||
    (ending1Beat.introDisplayLocked && age > 16000) ||
    (ending1Beat.introPacketCount || 0) > 100;
  if (!canSealOnQuiet) return;
  clearEnding1IntroQuietTimer();
  ending1IntroQuietTimerId = setTimeout(() => {
    ending1IntroQuietTimerId = null;
    if (getCurrentSegment()?.id !== "ending1") return;
    if (ending1Beat.finaleRequested || ending1Beat.freeTalk) return;
    // Playback still draining — wait a bit more.
    if (assistantIsSpeaking()) {
      armEnding1IntroQuietSeal();
      return;
    }
    sealEnding1IntroSpeech("quiet-after-intro");
  }, 1100);
}

/** After TURN_COMPLETE, wait for buffered PCM to finish, then seal (blocks ghost 2nd Perfect). */
function armEnding1IntroSealAfterTurnComplete() {
  if (getCurrentSegment()?.id !== "ending1") return;
  if (ending1Beat.finaleRequested || ending1Beat.freeTalk) return;
  if (ending1Beat.introSpeechComplete) return;
  if (!(ending1Beat.introAudioSent || ending1Beat.introDisplayLocked)) return;

  ending1Beat.introTurnCompleteCount = (ending1Beat.introTurnCompleteCount || 0) + 1;

  const trySeal = () => {
    if (getCurrentSegment()?.id !== "ending1") return;
    if (ending1Beat.introSpeechComplete) return;
    if (ending1Beat.finaleRequested || ending1Beat.freeTalk) return;
    const age = Date.now() - (ending1Beat.introSeededAt || ending1Beat.introFirstAudioAt || 0);
    // Prefer sealing once Turn A is "long enough" or fish/hold heard.
    // Avoid sealing a premature TURN_COMPLETE 2s into Perfect (would cut Hold-on).
    const fullEnough =
      ending1Beat.introHeardFishQ ||
      (ending1Beat.introHeardHoldOn && ending1Beat.introHeardPerfect) ||
      age >= 16000 ||
      (ending1Beat.introPacketCount || 0) > 120 ||
      ending1Beat.introTurnCompleteCount >= 2;
    if (!fullEnough) {
      // Schedule a hard seal after a full Turn A window so a no-STT double still gets cut.
      const wait = Math.max(500, 22000 - age);
      if (ending1IntroSealIdleTimerId) clearTimeout(ending1IntroSealIdleTimerId);
      ending1IntroSealIdleTimerId = setTimeout(() => {
        ending1IntroSealIdleTimerId = null;
        whenAssistantIdle(() => sealEnding1IntroSpeech("delayed-hard-seal"), "ending1-intro-hard-seal");
      }, wait);
      return;
    }
    sealEnding1IntroSpeech("turn-complete-idle");
  };

  whenAssistantIdle(() => {
    // Small delay so late audio packets of the SAME turn can still land.
    setTimeout(trySeal, 400);
  }, "ending1-intro-turn-seal");
}

/**
 * Gemini sometimes freestyles Perfect before the client kick — claim it as Turn A
 * instead of sending a second Perfect coach.
 */
function claimEnding1IntroIfGeminiStarted() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (ending1Beat.introAudioSent || ending1Beat.introNoteSent || ending1Beat.introKickInFlight) {
    return false;
  }
  if (!ending1Beat.introHeardPerfect && !ending1HasPerfectLeadInChat()) return false;
  cancelEnding1OpeningTimer();
  ending1Beat.introAudioSent = true;
  ending1Beat.introNoteSent = true;
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  if (!ending1Beat.introDisplayLocked) {
    seedEnding1IntroBubble();
  }
  dbg("ending1 intro claimed; Gemini already started Perfect");
  return true;
}

function resetEnding1Beat() {
  cancelEnding1OpeningTimer();
  clearEnding1IntroQuietTimer();
  ending1Beat = {
    userTurns: 0,
    autoSpoken: 0,
    autoCoachSent: 0,
    introNoteSent: false,
    introRepairSent: false,
    introDisplayLocked: false,
    introSeededAt: 0,
    introAudioSent: false,
    introKickInFlight: false,
    introHeardPerfect: false,
    introHeardHoldOn: false,
    introHeardFishQ: false,
    introHeardFishQAt: 0,
    introSpeechComplete: false,
    introFirstAudioAt: 0,
    introLastAudioPacketAt: 0,
    introPacketCount: 0,
    introTurnCompleteCount: 0,
    finaleSpoken: 0,
    finaleCoachSent: 0,
    finaleForceScheduled: false,
    finaleScheduledAt: 0,
    finaleNoteSent: false,
    freeTalk: false,
    freeTalkAnnounced: false,
    finaleRequested: false,
    hangUpScheduled: false,
    advancedForUserKey: "",
    lastForceAt: 0,
    lastForceKind: "",
  };
}

function ending1AutoIntroComplete() {
  return ending1Beat.autoSpoken >= ENDING1_INTRO_COUNT || assistantSaidEnding1Intro();
}

function ending1FinaleComplete() {
  return ending1Beat.finaleSpoken >= ENDING1_FINALE_COUNT || assistantSaidEnding1Finale();
}

function ending1BeatSpeak(beat) {
  if (!beat) return "";
  if (beat.en && String(beat.en).length > 80) return String(beat.en).trim();
  return (String(beat.en || "").trim() + " " + String(beat.jp || "").trim()).trim();
}

/** Full Turn A reached the fish question AND the Hold-on beat (exact script). */
function assistantSaidEnding1HoldOn(text = lastAssistantText()) {
  return /hold on|don'?t have any fish|no fish in the (?:fish )?tank/i.test(String(text || ""));
}

function assistantSaidEnding1FishQuestion(text = lastAssistantText()) {
  return /what kind of fish|どんな\s*おさかな/i.test(String(text || ""));
}

function ending1RecentAssistantBlob(limit = 8) {
  return recentAssistantMessages(limit).join("\n");
}

function assistantSaidEnding1Intro(text = lastAssistantText()) {
  // While the exact Turn A bubble is locked, do not treat STT/partials as "intro complete"
  // (that opened free talk and 終わりにする too early).
  if (ending1Beat.introDisplayLocked) return false;
  const t = `${ending1RecentAssistantBlob(8)}\n${String(text || "")}`;
  return assistantSaidEnding1FishQuestion(t);
}

/** Perfect lead only (partial Turn A — do not re-force Perfect). */
function assistantSaidEnding1PerfectLead(text = lastAssistantText()) {
  const t = String(text || "");
  return /perfect!?\s*we made a fish tank|ぱーふぇくと/i.test(t);
}

function ending1HasPerfectLeadInChat() {
  if (assistantSaidEnding1PerfectLead()) return true;
  return recentAssistantMessages(10).some((m) => assistantSaidEnding1PerfectLead(m));
}

function assistantSaidEnding1AutoBeat(beatIndex, text = lastAssistantText()) {
  if (beatIndex === 0) return assistantSaidEnding1Intro(text);
  return false;
}

function assistantSaidEnding1Finale(text = lastAssistantText()) {
  const t = String(text || "");
  return /next minecraft|decorate this tank|see you next time|また\s*ね|つぎの.*まいんくらふと/i.test(t);
}

function assistantSaidEnding1FinaleBeat(finaleIndex, text = lastAssistantText()) {
  if (finaleIndex === 0) return assistantSaidEnding1Finale(text);
  return false;
}

function assistantSaidEnding1Beat4(text = lastAssistantText()) {
  return /how many do we want|なんびき\s*ほしい/i.test(String(text || ""));
}

function ending1InventedFishCount(text = lastAssistantText(), userText = lastPendingUserText) {
  const t = String(text || "");
  const user = String(userText || "").trim();
  if (!t.trim()) return false;
  if (!/\b(five|four|three|two|one|six|ten)\b|ごひき|五匹|5\s*ひき|4\s*ひき|3\s*ひき|[1-9]\s*ひき/i.test(t)) {
    return false;
  }
  if (/\d+|ひき|匹|\b(one|two|three|four|five|six|ten|hundred|million)\b|いっぱい|たくさん|億/i.test(user)) {
    return false;
  }
  return true;
}

function ending1ForceAllowed(kind, { bypassCooldown = false } = {}) {
  const introFamily = /^(intro|intro-remainder|hold-on-patch)$/.test(String(kind || ""));
  const sameFamily =
    introFamily && /^(intro|intro-remainder|hold-on-patch)$/.test(String(ending1Beat.lastForceKind || ""));
  if (
    !bypassCooldown &&
    ending1Beat.lastForceAt &&
    Date.now() - ending1Beat.lastForceAt < 5500 &&
    (ending1Beat.lastForceKind === kind || sameFamily)
  ) {
    return false;
  }
  ending1Beat.lastForceAt = Date.now();
  ending1Beat.lastForceKind = kind;
  return true;
}

function syncEnding1AutoProgress() {
  if (assistantSaidEnding1Intro() || recentAssistantMessages(8).some((t) => assistantSaidEnding1Intro(t))) {
    ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
    ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
    enterEnding1FreeTalkIfReady();
  }
}

function syncEnding1FinaleProgress() {
  if (assistantSaidEnding1Finale() || recentAssistantMessages(8).some((t) => assistantSaidEnding1Finale(t))) {
    ending1Beat.finaleSpoken = Math.max(ending1Beat.finaleSpoken, 1);
    ending1Beat.finaleCoachSent = Math.max(ending1Beat.finaleCoachSent, 1);
  }
}

function isEnding1FreeTalkActive() {
  return (
    getCurrentSegment()?.id === "ending1" &&
    ending1AutoIntroComplete() &&
    !ending1Beat.finaleRequested &&
    !ending1FinaleComplete()
  );
}

function paintEndingEndButton() {
  if (!btnEndingEnd) return;
  const show = isEnding1FreeTalkActive() && actionState === "active";
  btnEndingEnd.hidden = !show;
  btnEndingEnd.disabled =
    !show || isHandoffRunning || isChapterHandoff || chapterTransitionActive || isAutoReconnecting;
}

/** After Turn A fish question — unrestricted free talk until 終わりにする. */
function enterEnding1FreeTalkIfReady() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  // Exact Turn A audio still playing — do not open free talk / 終わりにする yet.
  if (ending1Beat.introDisplayLocked) return false;
  if (!ending1AutoIntroComplete() || ending1Beat.finaleRequested || ending1FinaleComplete()) {
    return false;
  }
  const firstEnter = !ending1Beat.freeTalk;
  ending1Beat.freeTalk = true;
  paintEndingEndButton();
  if (firstEnter && !ending1Beat.freeTalkAnnounced) {
    ending1Beat.freeTalkAnnounced = true;
    whenAssistantIdle(() => {
      if (!isEnding1FreeTalkActive()) return;
      // Coach-only (may be disabled by whitelist) — free talk has no script restrictions.
      sendTeacherNote(
        "ending1-freetalk",
        "[Teacher note — do not read aloud] FREE TALK now — NO script, NO restrictions. " +
          "React warmly to whatever the child says and expand the topic. English then ひらがな is fine. " +
          "FORBIDDEN until 終わりにする: goodbye finale / Next Minecraft / See you next time / complete_segment / How many."
      );
    }, "ending1-freetalk");
  }
  return true;
}

/** 終わりにする — end free talk and speak Turn C. */
function endEnding1FreeTalkFromButton() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (actionState !== "active" || !client?.connected) return false;
  if (ending1FinaleComplete()) return false;
  syncEnding1AutoProgress();
  if (!ending1AutoIntroComplete()) {
    forceEnding1Intro("end-before-intro");
    return false;
  }
  // Already requested but Turn C never landed — allow button / retry to recover.
  if (ending1Beat.finaleRequested) {
    if (!ending1Beat.finaleNoteSent) {
      ending1Beat.finaleForceScheduled = false;
      ending1Beat.finaleNoteSent = false;
      ending1Beat.lastForceAt = 0;
      ending1Beat.lastForceKind = "";
      dbg("ending1 finale re-kick from end button");
      return kickEnding1FinaleChain("end-button-retry", { bypassCooldown: true });
    }
    return kickEnding1FinaleChain("end-button-retry", { bypassCooldown: true });
  }
  ending1Beat.finaleRequested = true;
  ending1Beat.freeTalk = false;
  // Cancel free-talk reply-watch / idle waits that were racing the goodbye kick.
  clearPendingReplyWatch();
  clearAwaitingAssistantReply();
  bumpIdleGeneration();
  paintEndingEndButton();
  updateLessonBanner();
  updateActionUI();
  addMessage("フリートークおわり！おわかれの じかんだよ", "system");
  dbg("ending1 free-talk ended by button");
  return kickEnding1FinaleChain("end-button", { bypassCooldown: true });
}

function ending1LooksOffScript(text = lastAssistantText()) {
  const t = String(text || "");
  if (!t.trim()) return false;
  // During free talk, only treat premature finale / how-many / repeated fish Q as off-script.
  if (isEnding1FreeTalkActive()) {
    if (
      assistantSaidEnding1Beat4(t) ||
      assistantSaidEnding1Finale(t) ||
      /see you next time|また\s*ね|next minecraft lesson/i.test(t)
    ) {
      return true;
    }
    // Re-asking the opening fish question after the child already answered.
    if (
      ending1Beat.userTurns >= 1 &&
      /どんな\s*お?さかな|どんな\s*お魚|what kind of fish/i.test(t)
    ) {
      return true;
    }
    return false;
  }
  if (ending1InventedFishCount(t)) return true;
  if (assistantSaidEnding1Beat4(t)) return true;
  if (assistantSaidEnding1Intro(t) || assistantSaidEnding1Finale(t)) {
    return false;
  }
  return /you'?re welcome|どういたしまして|what did you enjoy|いちばん\s*たのしかった|enjoy the most|blue sand|あおい\s*すな|making blue glass/i.test(
    t
  );
}

function forceEnding1Intro(reason = "kick-intro") {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (!client?.connected || (actionState !== "active" && actionState !== "connecting")) {
    return false;
  }
  // Gemini already started Perfect — claim it; never send a second Perfect coach.
  if (claimEnding1IntroIfGeminiStarted()) return false;
  // Hard one-shot audio gate — never send Perfect twice.
  if (
    ending1Beat.introSpeechComplete ||
    ending1Beat.introKickInFlight ||
    ending1Beat.introAudioSent ||
    ending1Beat.introNoteSent ||
    ending1Beat.autoCoachSent > 0 ||
    ending1Beat.introDisplayLocked
  ) {
    dbg("force ending1 intro blocked; audio already sent", reason);
    return false;
  }
  syncEnding1AutoProgress();
  if (ending1AutoIntroComplete() && !ending1Beat.introDisplayLocked) return false;
  // Already hearing/speaking Turn A — never re-kick.
  if (ending1Beat.introHeardPerfect || ending1HasPerfectLeadInChat()) {
    claimEnding1IntroIfGeminiStarted();
    dbg("force ending1 intro skipped; Perfect already heard", reason);
    return false;
  }
  if (!ending1ForceAllowed("intro")) return false;
  cancelEnding1OpeningTimer();
  // Lock BEFORE send so a parallel kickOpening / delayed timer cannot race a second Perfect.
  ending1Beat.introKickInFlight = true;
  ending1Beat.introAudioSent = true;
  ending1Beat.introNoteSent = true;
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak the following words EXACTLY ONCE in ONE turn, then STOP and WAIT. " +
    "Do NOT say Perfect / Hold on / what kind of fish twice. Do NOT restart from Perfect after finishing.\n" +
    ENDING1_INTRO_SPEAK;
  try {
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  dbg("force ending1 intro", reason);
  const ok = sendClientText(withEndingExactSpeakRule(formatTeacherNote(note)), { force: true });
  ending1Beat.introKickInFlight = false;
  if (ok) {
    seedEnding1IntroBubble();
  } else {
    ending1Beat.introAudioSent = false;
    ending1Beat.introNoteSent = false;
    ending1Beat.autoCoachSent = 0;
    ending1Beat.introDisplayLocked = false;
  }
  return ok;
}

/** Disabled — remainder forces cut Turn A and made Learny speak twice. */
function forceEnding1IntroRemainder(_reason = "intro-remainder") {
  return false;
}

/** Disabled — hold-on patches stacked on the live Turn A audio. */
function forceEnding1HoldOnPatch(_reason = "hold-on-patch") {
  return false;
}

function forceEnding1Beat4(_userText = "", _reason = "after-fish") {
  // How-many turn removed; free talk follows intro until 終わりにする.
  return false;
}

function forceEnding1Finale(reason = "end-button", { bypassCooldown = false } = {}) {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (!client?.connected || actionState !== "active") return false;
  // Finale only after free-talk end request.
  ending1Beat.finaleRequested = true;
  ending1Beat.freeTalk = false;
  syncEnding1FinaleProgress();
  if (ending1FinaleComplete()) {
    maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
    return false;
  }
  // One goodbye coach only — once speech is confirmed, never re-send.
  if (ending1Beat.finaleNoteSent && assistantSaidEnding1Finale()) return false;
  // Stuck schedule: note never landed — allow poke / end-button / safety retry to clear.
  if (ending1Beat.finaleForceScheduled && !ending1Beat.finaleNoteSent) {
    const age = Date.now() - (ending1Beat.finaleScheduledAt || 0);
    if (bypassCooldown || age > 2000) {
      ending1Beat.finaleForceScheduled = false;
      ending1Beat.lastForceAt = 0;
      ending1Beat.lastForceKind = "";
      dbg("ending1 finale schedule cleared for retry", { reason, age });
    } else {
      return false;
    }
  }
  if (ending1Beat.finaleNoteSent && !assistantSaidEnding1Finale()) {
    // Coach was sent but Learny never spoke Turn C — allow a forced retry.
    if (!bypassCooldown && !/poke|retry|safety|flush/i.test(String(reason || ""))) {
      return false;
    }
    ending1Beat.finaleNoteSent = false;
    ending1Beat.finaleForceScheduled = false;
    ending1Beat.lastForceAt = 0;
    ending1Beat.lastForceKind = "";
  }
  if (!ending1ForceAllowed("finale", { bypassCooldown })) return false;
  ending1Beat.finaleForceScheduled = true;
  ending1Beat.finaleScheduledAt = Date.now();
  ending1Beat.finaleCoachSent = Math.max(ending1Beat.finaleCoachSent, 1);
  paintEndingEndButton();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". FREE TALK is over (child tapped 終わりにする). " +
    "Speak EXACTLY this ONE goodbye message ONCE — do not repeat any part of it, do not split, do not wait: " +
    ENDING1_FINALE_SPEAK +
    " Then call complete_segment(ending1). FORBIDDEN: saying the goodbye twice / continuing free talk / How many / なんびき / asking another question.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  const send = () => {
    if (actionState !== "active" || !client?.connected) return false;
    if (getCurrentSegment()?.id !== "ending1") return false;
    syncEnding1FinaleProgress();
    if (ending1FinaleComplete()) {
      maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
      return false;
    }
    if (ending1Beat.finaleNoteSent && assistantSaidEnding1Finale()) return false;
    dbg("force ending1 finale", reason);
    const ok = sendClientText(withEndingExactSpeakRule(formatTeacherNote(note)), { force: true });
    if (ok) {
      ending1Beat.finaleNoteSent = true;
      ending1Beat.finaleCoachSent = Math.max(ending1Beat.finaleCoachSent, 1);
      // Do not seed the goodbye bubble — that made assistantSaidEnding1Finale() true
      // and hung up before Gemini spoke Turn C.
      armEnding1FinaleSpeechWatch();
    } else {
      ending1Beat.finaleForceScheduled = false;
    }
    return ok;
  };
  // Prefer idle send (avoids cutting leftover audio), but never hang forever.
  whenAssistantIdle(() => {
    setTimeout(send, 100);
  }, "ending1-force-finale");
  setTimeout(() => {
    if (actionState !== "active" || !client?.connected) return;
    if (getCurrentSegment()?.id !== "ending1") return;
    if (!ending1Beat.finaleRequested) return;
    if (ending1FinaleComplete() || assistantSaidEnding1Finale()) return;
    if (ending1Beat.finaleNoteSent) return;
    dbg("ending1 finale safety flush", reason);
    ending1Beat.finaleForceScheduled = false;
    send();
  }, 1800);
  return true;
}

function forceEnding1AutoBeat(beatIndex, reason = "chain") {
  return forceEnding1Intro(reason);
}

function forceEnding1FinaleBeat(_finaleIndex, reason = "chain") {
  return forceEnding1Finale(reason);
}

function kickEnding1AutoIntro() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  syncEnding1AutoProgress();
  if (ending1AutoIntroComplete()) return false;
  forceEnding1Intro("kick-intro");
  updateLessonBanner();
  return true;
}

function markEnding1IntroKickSent() {
  if (getCurrentSegment()?.id !== "ending1") return;
  ending1Beat.introNoteSent = true;
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  ending1Beat.introAudioSent = true;
}

function maybeChainEnding1AutoBeat() {
  if (getCurrentSegment()?.id !== "ending1") return;
  syncEnding1AutoProgress();
  updateLessonBanner();
  // Seal after this model turn's audio drains — kills audio-only ghost Perfect.
  armEnding1IntroSealAfterTurnComplete();
  // Full Turn A finished (fish Q heard) — seal immediately once idle.
  if (ending1Beat.introAudioSent && ending1Beat.introHeardFishQ) {
    whenAssistantIdle(() => sealEnding1IntroSpeech("turn-complete-fish"), "ending1-seal-fish");
  }
  if (ending1AutoIntroComplete()) {
    enterEnding1FreeTalkIfReady();
    return;
  }
  // Turn A already kicked / heard — never re-force (STT lag caused a second Perfect!).
  if (
    ending1Beat.introSpeechComplete ||
    ending1Beat.introNoteSent ||
    ending1Beat.autoCoachSent > 0 ||
    ending1Beat.introHeardPerfect ||
    ending1Beat.introDisplayLocked
  ) {
    return;
  }
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ending1") return;
    syncEnding1AutoProgress();
    if (ending1AutoIntroComplete()) {
      enterEnding1FreeTalkIfReady();
      return;
    }
    if (
      ending1Beat.introSpeechComplete ||
      ending1Beat.introNoteSent ||
      ending1Beat.autoCoachSent > 0 ||
      ending1Beat.introHeardPerfect
    ) {
      return;
    }
    forceEnding1Intro("auto-intro");
  }, "ending1-auto-intro");
}

function kickEnding1FinaleChain(reason = "kick-finale", { bypassCooldown = false } = {}) {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (!ending1Beat.finaleRequested) return false;
  syncEnding1FinaleProgress();
  if (ending1FinaleComplete()) {
    maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
    return false;
  }
  const ok = forceEnding1Finale(reason, { bypassCooldown });
  updateLessonBanner();
  paintEndingEndButton();
  return ok;
}

function maybeChainEnding1FinaleBeat() {
  if (getCurrentSegment()?.id !== "ending1") return;
  if (!ending1Beat.finaleRequested) return;
  syncEnding1FinaleProgress();
  updateLessonBanner();
  if (ending1FinaleComplete()) {
    maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
    return;
  }
  // Coach already sent / scheduled — wait for speech; do not re-force (causes double goodbye).
  if (ending1Beat.finaleNoteSent || ending1Beat.finaleForceScheduled) {
    return;
  }
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ending1") return;
    if (!ending1Beat.finaleRequested) return;
    if (ending1Beat.finaleNoteSent || ending1Beat.finaleForceScheduled) return;
    syncEnding1FinaleProgress();
    if (ending1FinaleComplete()) {
      maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
      return;
    }
    forceEnding1Finale("auto-finale");
  }, "ending1-finale");
}

function scheduleEnding1FinaleFollowUp() {
  // Finale is one combined message — no second follow-up line.
}

function maybeEnding1OffScriptNudge() {
  if (getCurrentSegment()?.id !== "ending1") return;
  syncEnding1AutoProgress();
  syncEnding1FinaleProgress();

  // Free talk: only repair if Learny jumps to goodbye / how-many early.
  if (isEnding1FreeTalkActive()) {
    const assistant = lastAssistantText();
    if (!ending1LooksOffScript(assistant)) return;
    whenAssistantIdle(() => {
      if (!isEnding1FreeTalkActive()) return;
      if (!ending1LooksOffScript(lastAssistantText())) return;
      sendTeacherNote(
        "ending1-freetalk-repair",
        "[Teacher note — do not read aloud] Still FREE TALK. " +
          "Do NOT say goodbye / Next Minecraft / How many. " +
          "Do NOT ask どんなおさかな / what kind of fish again if they already answered — react to their last words and ask something NEW. " +
          "Keep chatting naturally until the child taps 終わりにする."
      );
    }, "ending1-freetalk-repair");
    return;
  }

  // Finale in flight: never re-send the goodbye coach (bypassCooldown was double-speaking).
  if (ending1Beat.finaleRequested && !ending1FinaleComplete()) {
    if (ending1Beat.finaleNoteSent || ending1Beat.finaleForceScheduled) {
      return;
    }
    whenAssistantIdle(
      () => forceEnding1Finale("stuck-finale", { bypassCooldown: true }),
      "ending1-stuck-finale"
    );
    return;
  }

  // Turn A: never off-script-repair. One exact kick only — repairs caused cutoffs + doubles.
}

function getEnding1DisplayStep() {
  if (!ending1AutoIntroComplete()) return 1;
  if (ending1Beat.finaleRequested || ending1FinaleComplete()) return 3;
  return 2;
}

function getEnding1NextBeatIndex() {
  if (!ending1AutoIntroComplete()) return 0;
  return ENDING1_FINALE_START_INDEX;
}

function getEnding1BeatIndex() {
  if (!ending1AutoIntroComplete()) return 0;
  if (ending1Beat.finaleRequested || ending1FinaleComplete()) return ENDING1_FINALE_START_INDEX;
  return 0;
}

function buildEnding1OutboundCoach({ afterAdvance = false } = {}) {
  if (getCurrentSegment()?.id !== "ending1") return "";
  syncEnding1AutoProgress();
  // NEVER put ENDING1_INTRO_SPEAK in outbound — that caused a second Perfect audio with no bubble.
  if (!ending1AutoIntroComplete() || ending1Beat.introDisplayLocked) {
    return "[Teacher note — do not read aloud] Stay SILENT. Client owns Ending Turn A.";
  }
  if (ending1Beat.finaleRequested) {
    return (
      "[Teacher note — do not read aloud] Stay SILENT — client owns the goodbye finale."
    );
  }
  if (afterAdvance) return "";
  return "";
}

/** Free-talk nudge when Learny goes silent — keep chat moving without re-asking fish. */
function buildEnding1FreeTalkOutboundCoach(userText = "") {
  if (!isEnding1FreeTalkActive()) return "";
  const t = String(userText || "").trim().slice(0, 40);
  return (
    "[Teacher note — do not read aloud] FREE TALK — reply out loud NOW. " +
    (t ? `Child just said "${t}". React specifically to THAT and expand the topic. ` : "") +
    "ONE short warm turn. No script restrictions. English then ひらがな is fine. " +
    "FORBIDDEN: goodbye / Next Minecraft / See you next time / How many / complete_segment."
  );
}

/**
 * Recovery-only free-talk coach (no second "Child said:" package — that double-spoke).
 * Safe when the child turn was already delivered but Gemini stayed silent.
 */
function nudgeEnding1FreeTalkReply(userText = "") {
  if (!isEnding1FreeTalkActive()) return false;
  if (assistantIsSpeaking()) return false;
  if (hasAssistantReplySinceUser(userText)) return false;
  const quote = String(userText || "").trim().slice(0, 40);
  const note =
    "[Teacher note — do not read aloud] FREE TALK — reply out loud NOW to the child's last message" +
    (quote ? ` ("${quote}")` : "") +
    ". ONE short warm turn only. Do NOT re-ask what kind of fish / How many / goodbye.";
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function flushEnding1NextBeatCoach(source = "voice") {
  if (getCurrentSegment()?.id !== "ending1") return;
  syncEnding1AutoProgress();
  if (!ending1AutoIntroComplete()) {
    forceEnding1Intro("flush-" + source);
    return;
  }
  enterEnding1FreeTalkIfReady();
  if (ending1Beat.finaleRequested) {
    const retry = /reply-watch|poke|retry|end-button/.test(String(source || ""));
    kickEnding1FinaleChain("flush-" + source, {
      bypassCooldown: retry && !ending1FinaleComplete(),
    });
  }
}

function ending1CoachHint() {
  if (getCurrentSegment()?.id !== "ending1") return "";
  if (!ending1AutoIntroComplete()) {
    return " Ending intro: ONE combined message (thank you + no fish + what kind of fish?), then WAIT.";
  }
  if (ending1Beat.finaleRequested && !ending1FinaleComplete()) {
    return " Ending finale: ONE combined goodbye (わくわく + next Minecraft), then disconnect.";
  }
  return " Ending FREE TALK: no script — chat freely until child taps 終わりにする.";
}

function assistantEnding1Monologue(text) {
  const t = String(text || "").toLowerCase();
  let hits = 0;
  if (/perfect|fish tank together|made a fish tank/i.test(t)) hits += 1;
  if (/hold on|don't have any fish|no fish in the fish tank/i.test(t)) hits += 1;
  if (/what kind of fish/i.test(t)) hits += 1;
  if (/can't stop thinking/i.test(t)) hits += 1;
  if (/next minecraft lesson|decorate this tank/i.test(t)) hits += 1;
  return hits >= 3;
}

function looksLikeEnding1FinalLine(text) {
  return assistantSaidEnding1Finale(text);
}

function looksLikeEnding1FinalLineComplete(text) {
  const t = String(text || "").toLowerCase();
  const hasOpen = /next minecraft|つぎの.*まいんくらふと|decorate this tank|can't stop thinking|わくわく/.test(t);
  const hasClose = /see you next|また\s*ね|finish it|かんせいさせ/.test(t);
  return hasOpen && hasClose;
}

function maybeNotifyEnding1NextBeat() {
  flushEnding1NextBeatCoach("notify");
}

function maybeAdvanceEnding1Beat(userText, { skipNotify = false } = {}) {
  if (getCurrentSegment()?.id !== "ending1") return false;
  syncEnding1AutoProgress();
  if (!ending1AutoIntroComplete()) {
    if (!skipNotify) {
      whenAssistantIdle(() => forceEnding1Intro("early-user"), "ending1-early-user");
    }
    return false;
  }
  enterEnding1FreeTalkIfReady();
  if (ending1FinaleComplete() || ending1Beat.finaleRequested) return false;
  // Free talk: count child turns for banner only — never auto-force finale.
  const userKey = normalizeUserText(userText);
  if (userKey && ending1Beat.advancedForUserKey === userKey) {
    dbg("ending1 advance skipped; already counted this reply");
    return false;
  }
  ending1Beat.advancedForUserKey = userKey;
  ending1Beat.userTurns += 1;
  updateLessonBanner();
  paintEndingEndButton();
  return true;
}

function scheduleEndCallAfterEnding() {
  if (ending1Beat.hangUpScheduled) return;
  ending1Beat.hangUpScheduled = true;

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
    // Combined finale is long (EN+JP×2) — wait for playback to drain.
    setTimeout(hangUp, 4200);
  };

  whenAssistantIdle(() => {
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
  if (ending1FinaleSpeechWatchId) {
    clearTimeout(ending1FinaleSpeechWatchId);
    ending1FinaleSpeechWatchId = null;
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

function assistantSaidEnding1Beat1(text = lastAssistantText()) {
  return assistantSaidEnding1Intro(text);
}

function needsEnding1Opening() {
  return (
    getCurrentSegment()?.id === "ending1" &&
    !ending1AutoIntroComplete() &&
    ending1Beat.autoCoachSent === 0
  );
}

function forceEnding1OpeningAfterFinal1(reason = "final1-complete") {
  if (getCurrentSegment()?.id !== "ending1") return false;
  // Cut any freestyle Perfect immediately — client owns the one Turn A kick.
  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  if (claimEnding1IntroIfGeminiStarted()) {
    dbg("force ending1 opening skipped; claimed freestyle Perfect", reason);
    return false;
  }
  // Recover stuck kick ONLY when nothing was ever seeded/heard (never mid-Turn A).
  if (
    (ending1Beat.introNoteSent || ending1Beat.autoCoachSent > 0 || ending1Beat.introAudioSent) &&
    !ending1AutoIntroComplete() &&
    !ending1Beat.introDisplayLocked &&
    !ending1Beat.introHeardPerfect &&
    !ending1Beat.introSpeechComplete &&
    !ending1HasPerfectLeadInChat() &&
    /poke|recover|retry|already/i.test(String(reason || ""))
  ) {
    const seedAge = Date.now() - (ending1Beat.introSeededAt || 0);
    if (!ending1Beat.introSeededAt || seedAge > 10000) {
      ending1Beat.introNoteSent = false;
      ending1Beat.introAudioSent = false;
      ending1Beat.autoCoachSent = 0;
      ending1Beat.lastForceAt = 0;
      ending1Beat.lastForceKind = "";
    }
  }
  if (
    ending1Beat.introSpeechComplete ||
    ending1Beat.introNoteSent ||
    ending1Beat.autoCoachSent > 0 ||
    ending1Beat.introAudioSent ||
    ending1Beat.introDisplayLocked ||
    ending1Beat.introHeardPerfect
  ) {
    dbg("force ending1 opening skipped; already kicked", reason);
    return false;
  }
  dbg("force ending1 opening", reason);
  cancelEnding1OpeningTimer();
  // Wait for residual final1 audio to drain so Turn A is not stacked (double Perfect).
  const delayMs = isIntermediateVoiceOnly() ? 1100 : 700;
  const runKick = () => {
    if (getCurrentSegment()?.id !== "ending1") return;
    if (claimEnding1IntroIfGeminiStarted()) return;
    syncEnding1AutoProgress();
    if (
      ending1Beat.introSpeechComplete ||
      ending1Beat.introNoteSent ||
      ending1Beat.introAudioSent ||
      ending1Beat.introDisplayLocked ||
      ending1Beat.introHeardPerfect ||
      ending1AutoIntroComplete()
    ) {
      return;
    }
    kickEnding1AutoIntro();
  };
  ending1OpeningTimerId = setTimeout(() => {
    ending1OpeningTimerId = null;
    if (assistantIsSpeaking()) {
      whenAssistantIdle(() => runKick(), "ending1-after-final1");
      return;
    }
    runKick();
  }, delayMs);
  return true;
}

function maybeEnding1CoachNudge() {
  // Combined ending turns — do not scold for "combining beats".
}

function resetFinal1Quiz() {
  final1Quiz = {
    indices: [],
    cursor: 0,
    answered: 0,
    lastAnsweredPromptJa: "",
    answeredPrompts: [],
  };
  final1OpenForceAt = 0;
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
  if (final1Quiz.cursor >= final1Quiz.indices.length) return null;
  const idx = final1Quiz.indices[final1Quiz.cursor];
  if (idx === undefined) return null;
  return seg.items?.[idx] || null;
}

/** Quiz finished — snap cursor past the end so complete_segment / ending can run. */
function isFinal1QuizFinished() {
  initFinal1QuizIfNeeded();
  if (getCurrentSegment()?.id !== "final1") return false;
  const total = final1Quiz.indices.length;
  if (total < 1 || final1Quiz.answered < 1) return false;
  if (final1Quiz.answered >= total || final1Quiz.cursor >= total) {
    final1Quiz.cursor = Math.max(final1Quiz.cursor, total);
    return true;
  }
  const seg = getCurrentSegment();
  const allQueuedAnswered = final1Quiz.indices.every((idx) => {
    const item = seg.items?.[idx];
    return Boolean(item && final1ItemAlreadyAnswered(item));
  });
  if (allQueuedAnswered) {
    final1Quiz.cursor = total;
    final1Quiz.answered = Math.max(final1Quiz.answered, total);
    return true;
  }
  return false;
}

function normalizeFinal1MatchText(text) {
  return String(text || "")
    .replace(/[「」'"！!？?\s]/g, "")
    .replace(/ガラス/g, "がらす")
    .replace(/砂/g, "すな")
    .replace(/魚/g, "さかな")
    .replace(/水槽/g, "すいそう")
    .replace(/必要/g, "ひつよう")
    .replace(/赤/g, "あか")
    .toLowerCase();
}

/** Cue phrase inside 「…」はえいごで？ / bare …はえいごで？ */
function extractFinal1SpokenCue(text) {
  const t = String(text || "");
  const quoted = t.match(/[「『]([^」』]{1,40})[」』]\s*は\s*(?:英語|えいご)で/);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = t.match(
    /([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF][^は\n「『」』]{0,36}?)\s*は\s*(?:英語|えいご)で/
  );
  if (bare?.[1]) return bare[1].trim();
  return "";
}

function final1ItemCores(item) {
  if (!item) return [];
  return [
    ...new Set(
      [item.promptHira, item.promptJa, item.promptEn]
        .filter(Boolean)
        .map((p) => normalizeFinal1MatchText(final1PromptCore(p)))
        // Allow short cues like できた (len 3). Old >=4 filter dropped im-done entirely.
        .filter((core) => core.length >= 2)
    ),
  ];
}

/**
 * Score how well assistant text matches a Final1 item.
 * Prefer exact spoken-cue match + longer cores so 「できた！」≠ tank-ready.
 */
function final1ItemMatchScore(text, item) {
  if (!item) return 0;
  const raw = String(text || "");
  let best = 0;
  if (item.promptMatch && item.promptMatch.test(raw)) {
    best = Math.max(best, 50);
  }
  const a = normalizeFinal1MatchText(text);
  const spokenCue = normalizeFinal1MatchText(extractFinal1SpokenCue(text));
  for (const core of final1ItemCores(item)) {
    if (spokenCue) {
      if (spokenCue === core) {
        best = Math.max(best, 1000 + core.length);
      } else if (spokenCue.includes(core)) {
        // Longer spoken cue containing this core (e.g. tank-ready contains できた).
        best = Math.max(best, 800 + core.length);
      }
    }
    if (a.includes(core)) {
      best = Math.max(best, core.length);
    }
  }
  return best;
}

function final1ItemMentionedIn(text, item) {
  return final1ItemMatchScore(text, item) > 0;
}

function final1ItemKey(item) {
  return String(item?.id || item?.promptHira || item?.promptJa || "").trim();
}

function final1ItemAlreadyAnswered(item) {
  const key = final1ItemKey(item);
  return Boolean(key && final1Quiz.answeredPrompts.includes(key));
}

/**
 * Match the quiz item Learny actually asked — may differ from cursor if Learny skipped or went off-queue.
 * @param {string} [assistant]
 * @param {{ allowAnswered?: boolean }} [opts] allowAnswered: keep matching re-asked cues for MCQ/coach
 */
function resolveFinal1ItemFromAssistant(
  assistant = lastAssistantText(),
  { allowAnswered = false } = {}
) {
  initFinal1QuizIfNeeded();
  const seg = getCurrentSegment();
  if (seg?.id !== "final1" || !assistantAskedFinal1QuizQuestion(assistant)) return null;

  let best = null;
  let bestScore = 0;
  const consider = (item, queuePos, inQueue) => {
    if (!item) return;
    if (!allowAnswered && final1ItemAlreadyAnswered(item)) return;
    const score = final1ItemMatchScore(assistant, item);
    if (score <= 0) return;
    const betterScore = score > bestScore;
    const tiePreferInQueue = score === bestScore && best && inQueue && !best.inQueue;
    const tiePreferForward =
      score === bestScore &&
      best &&
      Boolean(inQueue) === Boolean(best.inQueue) &&
      queuePos >= final1Quiz.cursor &&
      best.queuePos < final1Quiz.cursor;
    if (betterScore || tiePreferInQueue || tiePreferForward) {
      bestScore = score;
      best = { item, queuePos, inQueue: Boolean(inQueue), score };
    }
  };

  for (let qi = 0; qi < final1Quiz.indices.length; qi += 1) {
    consider(seg.items?.[final1Quiz.indices[qi]], qi, true);
  }
  for (let ii = 0; ii < (seg.items || []).length; ii += 1) {
    if (final1Quiz.indices.includes(ii)) continue;
    consider(seg.items[ii], final1Quiz.cursor, false);
  }
  return best;
}

function findFinal1QueuePosFromAssistant(assistant) {
  const resolved = resolveFinal1ItemFromAssistant(assistant);
  if (!resolved?.inQueue || resolved.queuePos < 0) return -1;
  return resolved.queuePos;
}

function getDisplayedFinal1Item() {
  // Prefer what Learny spoke (even if already answered) so MCQ never shows the *next*
  // item's choices under a repeated 「できた！」 prompt.
  const spoken = resolveFinal1ItemFromAssistant(lastAssistantText(), {
    allowAnswered: true,
  });
  if (spoken) return spoken;
  const item = getCurrentFinal1Item();
  return item ? { item, queuePos: final1Quiz.cursor, inQueue: true } : null;
}

function syncFinal1CursorFromAssistant(assistant = lastAssistantText()) {
  if (getCurrentSegment()?.id !== "final1") return false;
  // Never rewind — re-asking an earlier cue used to pull the cursor back and
  // block canCompleteFinal1Part1 / ending advance after the quiz was finished.
  if (isFinal1QuizFinished()) return false;
  const resolved = resolveFinal1ItemFromAssistant(assistant);
  if (!resolved?.inQueue || resolved.queuePos < 0 || resolved.queuePos <= final1Quiz.cursor) {
    return false;
  }
  final1Quiz.cursor = resolved.queuePos;
  clearShuffledChoiceCache("final1");
  updateLessonBanner();
  renderChoiceBar(getCurrentSegment());
  dbg("final1 cursor synced", { queuePos: resolved.queuePos, prompt: assistant.slice(0, 60) });
  return true;
}

function final1ChoiceLabels(item) {
  const raw = [...(item?.choices || [])];
  const ans = String(item?.answer || "").trim();
  if (ans && !raw.some((c) => normalizeMcqChoice(c) === normalizeMcqChoice(ans))) {
    raw.unshift(ans);
  }
  return raw.slice(0, 4).map(formatChoiceLabel);
}

function assistantAskedFinal1QuizQuestion(text = "") {
  return /は\s*(?:英語|えいご)で|英語で？|えいごで？/.test(String(text || ""));
}

function final1OpenWithFirstQuestionSpeak() {
  initFinal1QuizIfNeeded();
  const first = currentFinal1Prompt();
  return first ? `${final1OpenSpeak()} ${first}` : final1OpenSpeak();
}

function forceFinal1OpenWithFirstQuestion(reason = "final1-open") {
  if (getCurrentSegment()?.id !== "final1") return false;
  if (!client?.connected || actionState !== "active") return false;
  if (final1Quiz.answered > 0) return false;
  if (assistantAskedFinal1QuizQuestion(lastAssistantText())) return false;
  if (final1OpenForceAt && Date.now() - final1OpenForceAt < 10000) return false;
  final1OpenForceAt = Date.now();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak EXACTLY ONE turn: " +
    final1OpenWithFirstQuestionSpeak() +
    " FORBIDDEN: Are you ready? / じゅんびは できてる？ / waiting for yes before the first quiz item." +
    beginnerTurnHint();
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force final1 open", reason);
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function maybeFinal1OpenNudge() {
  if (getCurrentSegment()?.id !== "final1") return;
  if (final1Quiz.answered > 0) return;
  const assistant = lastAssistantText();
  if (assistantAskedFinal1QuizQuestion(assistant)) return;
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "final1") return;
    if (assistantAskedFinal1QuizQuestion(lastAssistantText())) return;
    forceFinal1OpenWithFirstQuestion("final1-needs-first-question");
  }, "final1-open");
}

function buildPart1HandoffOpeningNudge(state, opts = {}) {
  const segment = getCurrentSegment(state);
  if (state?.lessonId === "part1" && segment?.id === "final1") {
    initFinal1QuizIfNeeded();
    const quote = String(opts.lastQuote || "").trim().slice(0, 60);
    const quoteBit = quote ? ` Child said "${quote}".` : "";
    const retryBit = opts.reason === "stuck_retry" ? " Stuck-retry." : "";
    return (
      `[Coach]${retryBit}${quoteBit} final1 ONLY. Speak EXACTLY ONE turn (no wait): ` +
      `${final1OpenWithFirstQuestionSpeak()} ` +
      "FORBIDDEN: Are you ready? / じゅんびは できてる？ / previous chapter."
    );
  }
  // Ch2 mid-progress / place answer must NOT re-open with beach-or-mountains.
  if (state?.lessonId === "part1" && segment?.id === "ch2") {
    restoreCh2SearchState();
    const quote = String(opts.lastQuote || "").trim();
    const retryBit = opts.reason === "stuck_retry" ? " Stuck-retry." : "";
    if (looksLikePlacePick(quote)) {
      ch2Search.phase = "direction";
      persistCh2SearchState();
    } else if (looksLikeDirectionPick(quote)) {
      ch2Search.phase = "chat";
      persistCh2SearchState();
    }
    const speak = ch2RecoverSpeakLine(quote);
    const quoteBit = quote ? ` Child said "${quote.slice(0, 40)}".` : "";
    return (
      `[Coach]${retryBit}${quoteBit} ch2 ONLY. Short react if needed, then Speak EXACTLY then WAIT: ` +
      speak +
      " FORBIDDEN: repeating beach/mountains if they already picked. FORBIDDEN: previous chapter."
    );
  }
  return buildHandoffOpeningNudge(state, opts);
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
  const n = normalizeText(userText);
  if (!n) return false;
  // Only the canonical answer (+ patterns) count — never treat distractor choices as correct.
  const ans = normalizeText(String(item.answer || "").replace(/[!?.]/g, ""));
  if (ans && (n === ans || n.includes(ans) || ans.includes(n))) return true;
  if (matchesPatterns(userText, item.patterns || [])) return true;
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
function final1AssistantPraiseOnly(text = "") {
  const t = String(text || "").trim();
  if (!t || assistantAskedFinal1QuizQuestion(t)) return false;
  return /^(you got it|that'?s right|excellent|great|nice|perfect|correct|ぱっちり|そのとおり)/i.test(t);
}

function maybeFinal1PraiseOnlyNudge() {
  if (getCurrentSegment()?.id !== "final1") return;
  const assistant = lastAssistantText();
  if (!final1AssistantPraiseOnly(assistant)) return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (!user.trim() || !hasAssistantReplySinceUser(user)) return;
  initFinal1QuizIfNeeded();
  const next = currentFinal1Prompt();
  if (!next) return;
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "final1") return;
    if (!final1AssistantPraiseOnly(lastAssistantText())) return;
    if (assistantAskedFinal1QuizQuestion(lastAssistantText())) return;
    sendTeacherNote(
      `final1-praise-cont-${final1Quiz.answered}-${final1Quiz.cursor}`,
      "[Teacher note — do not read aloud] Final1: do NOT repeat praise or You got it. " +
        "Ask the next cue ONLY in ONE short line: " +
        next +
        (final1RemainingCount() === 1 ? " (say This is the last question! or さいごの もんだい！ first.)" : "") +
        beginnerTurnHint()
    );
  }, "final1-praise-cont");
}

function maybeFinal1CoachNudge() {
  if (getCurrentSegment()?.id !== "final1") return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  const assistant = lastAssistantText();
  initFinal1QuizIfNeeded();

  // Finished quiz must advance even if Learny invented another はえいごで？ cue.
  if (isFinal1QuizFinished()) {
    const doneQuote = String(user || lastPendingUserText || "final challenge done").trim();
    if (maybeCompleteFinal1FromClient(doneQuote)) return;
  }

  let next = currentFinal1Prompt();

  // Next quiz cue already on screen — wait for child; extra coaches caused doubled speech.
  if (
    assistantAskedFinal1QuizQuestion(assistant) &&
    !assistantDoubledFinal1Prompt(assistant) &&
    !assistantHasKanji(assistant) &&
    !assistantAskedWrongFinal1Prompt(assistant)
  ) {
    return;
  }
  if (final1AssistantPraiseOnly(assistant)) return;

  if (!next && final1Quiz.answered > 0) {
    // Client owns the advance — Gemini often stalls on complete_segment(final1).
    const doneQuote = String(user || lastPendingUserText || "final challenge done").trim();
    if (maybeCompleteFinal1FromClient(doneQuote)) return;
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "final1") return;
      if (maybeCompleteFinal1FromClient(doneQuote)) return;
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

  const resolved =
    resolveFinal1ItemFromAssistant(assistant, { allowAnswered: true }) ||
    resolveFinal1ItemFromAssistant(assistant);
  const item = resolved?.item || getCurrentFinal1Item();
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
  const reaskedAnswered =
    Boolean(item) && final1ItemAlreadyAnswered(item) && assistantAskedFinal1QuizQuestion(assistant);

  if (userAnsweredCurrent && repeatsCurrent && item && !final1ItemAlreadyAnswered(item)) {
    maybeAdvanceFinal1Quiz(user);
    maybeCompleteFinal1FromClient(user);
    next = currentFinal1Prompt();
  }

  const needCoach =
    doubled ||
    (userAnsweredCurrent && repeatsCurrent) ||
    (repeatsAnswered && user.trim()) ||
    reaskedAnswered ||
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
        (reaskedAnswered || (userAnsweredCurrent && repeatsCurrent)
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
  syncFinal1CursorFromAssistant(lastAssistantText());
  const displayed =
    resolveFinal1ItemFromAssistant(lastAssistantText(), { allowAnswered: true }) ||
    getDisplayedFinal1Item();
  const item = displayed?.item || getCurrentFinal1Item();
  if (!item) return false;
  if (!matchesFinal1Answer(userText, item)) return false;
  const key = final1ItemKey(item);
  if (key && final1Quiz.answeredPrompts.includes(key)) return false;
  final1Quiz.lastAnsweredPromptJa = item.promptHira || item.promptJa || item.promptEn || "";
  if (key) final1Quiz.answeredPrompts.push(key);
  final1Quiz.answered += 1;
  if (displayed?.inQueue && displayed.queuePos >= 0) {
    final1Quiz.cursor = Math.max(final1Quiz.cursor, displayed.queuePos + 1);
  } else {
    final1Quiz.cursor = Math.min(final1Quiz.cursor + 1, final1Quiz.indices.length);
  }
  clearShuffledChoiceCache("final1");
  updateLessonBanner();
  renderChoiceBar(getCurrentSegment());
  return true;
}

function peekFinal1PromptAtCursor(cursor) {
  const seg = getCurrentSegment();
  if (seg?.id !== "final1") return "";
  const idx = final1Quiz.indices[cursor];
  if (idx === undefined) return "";
  const item = seg.items?.[idx];
  return item?.promptHira || item?.promptJa || item?.promptEn || "";
}

function buildFinal1OutboundCoach(userText) {
  if (getActiveLessonId() !== "part1" || getCurrentSegment()?.id !== "final1") return "";
  const resolved = resolveFinal1ItemFromAssistant(lastAssistantText(), {
    allowAnswered: true,
  });
  const item = resolved?.item;
  if (!item) return "";
  const t = String(userText || "").trim();
  if (!t) return "";

  const cue = item.promptHira || item.promptJa || "";
  if (!matchesFinal1Answer(t, item)) {
    const retry = pickMcqRetryPattern();
    return (
      "[Teacher note — do not read aloud] Final1 soft retry — wrong answer for current cue. " +
      "Speak EXACTLY this soft retry (EN then JP), then ask the SAME cue ONCE more. " +
      "Do NOT reveal the answer. Say: " +
      retry.speak +
      " Then cue: " +
      cue +
      beginnerTurnHint()
    );
  }

  initFinal1QuizIfNeeded();
  const nextCursor =
    resolved.inQueue && resolved.queuePos >= 0
      ? Math.max(final1Quiz.cursor, resolved.queuePos + 1)
      : final1Quiz.cursor + 1;
  const next = peekFinal1PromptAtCursor(nextCursor);
  const remaining = Math.max(0, final1Quiz.indices.length - nextCursor);

  if (!next) {
    return (
      "[Teacher note — do not read aloud] Final1 item correct. Brief praise, then complete_segment(final1). " +
      "FORBIDDEN: another quiz question." +
      beginnerTurnHint()
    );
  }
  return (
    "[Teacher note — do not read aloud] Final1 correct — ONE message only (praise + next cue together). " +
    "Brief varied praise, then in the SAME turn ask EXACTLY ONCE: " +
    next +
    (remaining === 1 ? " (LAST item — say This is the last question! or さいごの もんだい！ first.)" : "") +
    " FORBIDDEN: praise-only turn / two separate messages / repeat " +
    cue +
    "." +
    beginnerTurnHint()
  );
}

function handleFinal1ChoiceClick(label) {
  const segment = getCurrentSegment();
  if (segment?.id !== "final1") {
    sendUserText(label);
    return;
  }
  const resolved = resolveFinal1ItemFromAssistant(lastAssistantText()) || getDisplayedFinal1Item();
  const item = resolved?.item;
  if (!item) {
    sendUserText(label);
    return;
  }

  addUserAnswerBubble(label);
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  cancelAssistantTurnEnd();
  prepareForUserOutbound();
  lastPendingUserText = label;

  const correct = matchesFinal1Answer(label, item);
  const choices = final1ChoiceLabels(item);
  const event = recordMcqAttempt({
    segmentId: "final1",
    beatId: item.id || final1ItemKey(item) || "final1-item",
    learnyPrompt: item.promptHira || item.promptJa || item.promptEn || "",
    choice: label,
    correct,
    choices,
    answer: formatChoiceLabel(item.answer || ""),
  });
  try {
    event.level = getActiveLevelId();
  } catch {
    // ignore
  }
  notifyMcqActivity(event);
  notifyParentProgress();

  if (correct) {
    maybeAdvanceFinal1Quiz(label);
  }

  // Last item done → client completes + kicks ending. Do NOT send a final1
  // complete_segment coach (that raced the ending Perfect script / left Learny stuck).
  if (correct && isFinal1QuizFinished()) {
    clearPendingReplyWatch();
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    maybeCompleteFinal1FromClient(label);
    renderChoiceBar(getCurrentSegment());
    return;
  }

  const coach = buildFinal1OutboundCoach(label);
  dispatchChildTurn(label, coach || (correct ? "Brief praise, next Final1 cue." : buildMcqWrongRetryCoach()));

  renderChoiceBar(getCurrentSegment());
  if (!correct) {
    flashMcqIncorrectFeedback(label);
  }
}

function tryRouteFinal1Answer(text) {
  if (getCurrentSegment()?.id !== "final1") return false;
  if (!assistantAskedFinal1QuizQuestion(lastAssistantText())) return false;
  const resolved = resolveFinal1ItemFromAssistant(lastAssistantText(), {
    allowAnswered: true,
  });
  if (!resolved?.item) return false;
  const needle = normalizeMcqChoice(text);
  if (!needle) return false;
  const choices = final1ChoiceLabels(resolved.item);
  let label = choices.find((c) => normalizeMcqChoice(c) === needle) || "";
  if (!label && matchesFinal1Answer(text, resolved.item)) {
    label = formatChoiceLabel(resolved.item.answer) || String(text).trim();
  }
  // Intermediate voice-only: any spoken attempt on an active Final1 cue is logged.
  if (!label && isIntermediateVoiceOnly()) {
    label = String(text).trim();
  }
  if (!label) return false;
  handleFinal1ChoiceClick(label);
  return true;
}

function countFinal1ItemsAnswered() {
  initFinal1QuizIfNeeded();
  return final1Quiz.answered;
}

function canCompleteFinal1Part1() {
  if (getActiveLessonId() !== "part1") return true;
  if (getCurrentSegment().id !== "final1") return true;
  return isFinal1QuizFinished();
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
  if (!assistantAskedFinal1QuizQuestion(assistant)) return false;
  if (resolveFinal1ItemFromAssistant(assistant)) return false;
  const item = getCurrentFinal1Item();
  if (!item) return false;
  const a = String(assistant || "");
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
  if (!isFinal1QuizFinished()) return false;
  const quote = String(userText || lastPendingUserText || "final challenge done").trim();
  const result = completeSegment("final1", { userQuote: quote });
  if (!result.ok) {
    dbg("final1 auto-complete failed", result.reason || result);
    return false;
  }
  dbg("final1 auto-complete", quote);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  updateLessonBanner();
  renderChoiceBar(getCurrentSegment());
  if (client) configureGeminiClient(client);
  // Same one-shot soft kick as beginner — hard handoff / audio-recover re-kicks
  // caused Perfect Turn A to play twice on intermediate.
  forceEnding1OpeningAfterFinal1(result.alreadyDone ? "auto-complete-already" : "auto-complete");
  return true;
}

function looksLikeFinal1StoryQuestion(text) {
  return /how do you say|you need sand|build your tank|need sand to build/i.test(String(text || "").toLowerCase());
}

function looksLikeDirectionPick(text) {
  const t = String(text || "").trim();
  return /^(left|right|みぎ|ひだり|右|左)$/i.test(t) || /\b(left|right)\b/i.test(t);
}

function looksLikePlacePick(text) {
  const t = String(text || "").trim();
  return /beach|ocean|mountain|mountains|やま|山|ビーチ|うみ|海|river|かわ|川/i.test(t);
}

function assistantAskedPlaceQuestion(text = lastAssistantText()) {
  return /beach or the mountains|beach or.*mountain|let'?s go find some sand|ビーチと\s*やま|ビーチ.*やま/i.test(
    String(text || "")
  );
}

function assistantAskedDirectionQuestion(text = lastAssistantText()) {
  return /left or right|ひだりと\s*みぎ|left or the right|どっちに\s*いく/i.test(String(text || ""));
}

function assistantAskedLetMeKnow(text = lastAssistantText()) {
  return /let me know when you find|みつけたら.*おしえ/i.test(String(text || ""));
}

function looksLikeFoundSand(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  // Ch1 phrase — never treat as "found sand" in Chapter 2.
  if (/\bi need sand\b|すなが\s*ひつよう|砂が\s*必要/i.test(t)) return "";
  if (/\b(i found some sand|i found sand|found some sand|found sand)\b/i.test(t)) return "phrase";
  if (
    /みつけた|見つけた|found it|見っけた|あった|すな.*(みつ|見つ)|見つけ.*すな|sand.*(found|here)|found.*sand/i.test(
      t
    )
  ) {
    return "found";
  }
  // Bare 「すな」/「砂」/ sand during Chapter 2 search = child found sand (not Ch1 "I need sand").
  if (
    getCurrentSegment()?.id === "ch2" &&
    (/^(砂|すな|sand)[!！。．.]*$/i.test(t) ||
      /^(砂|すな|sand)\s*(だ|です|だよ|あった|みつけた|みっけた)?[!！。．.]*$/i.test(t) ||
      /^(あった|みつけた|みっけた)[!！。．.\s]*(砂|すな|sand)[!！。．.]*$/i.test(t))
  ) {
    return "found";
  }
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
  // Keep-looking lines are NOT free-talk questions (and must not block see→elicit advance).
  if (
    /have you found.*sand|found sand yet|still looking for sand|let me know when you find|keep looking|さがしてみて|take your time|みつけたら|left or right|beach or the mountains|let'?s go find some sand/i.test(
      t
    )
  ) {
    return false;
  }
  if (detectCh2EverydayKey(t)) return true;
  if (/[？?]/.test(t) && /hot|あつい|see around|なにが\s*みえる|まわり/i.test(t)) return true;
  return false;
}

function needsCh2ElicitPhrase(assistantText, userText) {
  if (!isCh2SandSearchContext()) return false;
  if (userHasFoundSandPhrase()) return false;
  if (looksLikeFoundSand(userText) !== "found") return false;
  const a = String(assistantText || "");
  if (/i found some sand|can you say|say.*in english|いってみて|えいご/i.test(a)) return false;
  // Assistant ignored sand and stayed on previous topic / everyday chat.
  if (/turtle|かめ|what else|ほかに|is it hot|あつい|waves|tired|つかれ|around you|みえる/i.test(a) && !/sand|すな|砂/i.test(a)) {
    return true;
  }
  return /found|みつかった|みつけた|すご|great|やった|みつけ/i.test(a);
}

function buildCh2OutboundCoach(userText) {
  if (!isCh2SandSearchContext()) return "";
  syncCh2PhaseFromChat();
  const t = String(userText || "").trim();
  const assistant = lastAssistantText();
  const found = looksLikeFoundSand(t);
  rememberCh2EverydayFromAssistant(assistant);

  if (FORBIDDEN_EVERYDAY_RE.test(assistant)) {
    return ch2ScriptCoach(ch2NextScriptSpeak(), "WRONG question (no tired/waves)");
  }

  if (/i put sand|put sand here|on the bottom|すいそうにいれ|砂を入れ/i.test(assistant)) {
    return (
      "[Teacher note — do not read aloud] Stay on Chapter 2. No put-sand-on-bottom (Ch6). " +
      "If found sand: elicit I found some sand! then complete_segment(ch2)."
    );
  }

  if (found === "found") {
    // Still on free-talk beats — do NOT jump to found-sand elicit.
    if (!ch2FreeTalkFinished() && (ch2Search.phase === "chat" || ch2Search.phase === "direction")) {
      const next = ch2NextEverydaySpeak() || CH2_HOT_SPEAK;
      return ch2ScriptCoach(
        next,
        "Free talk not done — no found-sand elicit yet"
      );
    }
    return ch2ScriptCoach(
      CH2_ELICIT_FOUND_SPEAK,
      "Child FOUND sand — do NOT say Can you say, I found some sand"
    );
  }
  if (found === "phrase") {
    return (
      "[Teacher note — do not read aloud] Child said I found some sand! Brief praise, complete_segment(ch2) NOW. " +
      "Next Ch3 glass. No put-sand-on-bottom."
    );
  }

  // Scripted beats: place → direction → hot → see → wait for found
  if (ch2Search.phase === "place" || ch2Search.phase === "idle") {
    if (looksLikePlacePick(t) || (assistantAskedPlaceQuestion(assistant) && t)) {
      return ch2ScriptCoach(CH2_DIRECTION_SPEAK, "Child picked a place");
    }
    return ch2ScriptCoach(CH2_PLACE_SPEAK, "Chapter 2 opening");
  }

  if (ch2Search.phase === "direction") {
    if (looksLikeDirectionPick(t) || (assistantAskedDirectionQuestion(assistant) && t)) {
      return ch2ScriptCoach(
        ch2NextEverydaySpeak() || CH2_HOT_SPEAK,
        "Child picked left/right — first chat is hot"
      );
    }
    return ch2ScriptCoach(CH2_DIRECTION_SPEAK, "Ask left/right");
  }

  if (ch2Search.phase === "waiting" || ch2Search.phase === "checking") {
    // See not asked yet — pull back to beat 4 only after beat 3 was answered.
    if (!ch2SeeWasAsked()) {
      ch2Search.phase = "chat";
      if (!ch2HotWasAnswered()) {
        return ch2ScriptCoach(CH2_HOT_SPEAK, "Still on Beat 3 — wait for answer");
      }
      return ch2ScriptCoach(CH2_SEE_SPEAK, "Ask Beat 4 — no Keep looking / found sand yet");
    }
    if (ch2FoundElicitAlreadyDelivered()) return "";
    return ch2ScriptCoach(
      CH2_ELICIT_FOUND_SPEAK,
      "After see — no Keep looking / Take your time"
    );
  }

  if (ch2Search.phase === "chat" || detectCh2EverydayKey(assistant)) {
    // Child just spoke on a free-talk turn — mark beat 3/4 answered before choosing next.
    rememberCh2EverydayAnswered(assistant);

    if (ch2SeeWasAsked() && ch2SeeWasAnswered() && !ch2NextEverydayItem()) {
      if (ch2FoundElicitAlreadyDelivered()) return "";
      return ch2ScriptCoach(
        CH2_ELICIT_FOUND_SPEAK,
        "Beat 4 answered — short react then found-sand elicit"
      );
    }
    if (ch2HotWasAsked() && !ch2HotWasAnswered()) {
      return ch2ScriptCoach(CH2_HOT_SPEAK, "Beat 3 still waiting — no see yet");
    }
    const next =
      ch2HotWasAnswered() && !ch2SeeWasAsked() ? CH2_SEE_SPEAK : ch2NextEverydaySpeak();
    return ch2ScriptCoach(
      next || CH2_SEE_SPEAK,
      t ? `Child said "${t.slice(0, 24)}"` : "Child answered"
    );
  }

  if (assistantAskedFoundSandQuestion(assistant) && !userSaysStillSearchingSand(t)) {
    return ch2ScriptCoach(
      CH2_ELICIT_FOUND_SPEAK,
      "Treat clear found answer as FOUND — elicit now"
    );
  }
  return "";
}

function forceCh2DifferentQuestion(repeatedKey) {
  if (!isCh2SandSearchContext()) return false;
  if (!client?.connected || actionState !== "active") return false;
  // Repeating beat 3 must re-ask beat 3 and WAIT — never skip to beat 4.
  const next =
    repeatedKey === "hot" && !ch2HotWasAnswered()
      ? CH2_HOT_SPEAK
      : repeatedKey === "see" && !ch2SeeWasAnswered()
        ? CH2_SEE_SPEAK
        : ch2NextScriptSpeak();
  const item = CH2_EVERYDAY_BANK.find((i) => i.key === repeatedKey);
  const forbidden = item?.label || repeatedKey;
  const note =
    "[Teacher note — do not read aloud] STOP. You repeated \"" +
    forbidden +
    "\". Discard that. Speak ONE short turn NOW with EXACTLY: " +
    next +
    " Then WAIT for the child. Do not ask " +
    forbidden +
    " again, and do NOT skip ahead." +
    beginnerTurnHint();
  closeOpenAudioTurn();
  audioPlayer?.interrupt?.();
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function maybeCh2RepeatNudge() {
  if (!isCh2SandSearchContext()) return;
  const assistant = lastAssistantText();
  const key = detectCh2EverydayKey(assistant);
  if (!key) return;
  if (ch2EverydayRepeatCount(key) < 2) return;
  const count = ch2EverydayRepeatCount(key);
  const noteKey = `ch2-repeat-${key}-${count}`;
  if (sentTeacherNotes.has(noteKey)) return;
  whenAssistantIdle(() => {
    if (ch2EverydayRepeatCount(key) < 2) return;
    if (sentTeacherNotes.has(noteKey)) return;
    sentTeacherNotes.add(noteKey);
    dbg("ch2 repeat force", { key, count, next: ch2NextEverydaySpeak() });
    // Soft teacher notes are often ignored — interrupt and force the next line.
    forceCh2DifferentQuestion(key);
  }, "ch2-repeat");
}

function maybeCh2CorrectiveNudge() {
  if (!isCh2SandSearchContext()) return;
  const assistant = lastAssistantText();
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";

  // Beat 5 already spoken or coach already sent — never stack another elicit turn.
  if (ch2FoundElicitAlreadyDelivered()) return;
  if (blockCoachUntilUserSpeaks && ch2AssistantSaidFoundElicit(assistant)) return;
  if (assistantTranscriptOpen || assistantTranscriptNeedsMoreTime(assistant)) return;

  // Skipped beat 4 after hot — force "What can you see" ONLY if the child already answered beat 3.
  if (
    ch2HotWasAsked() &&
    ch2HotWasAnswered() &&
    !ch2SeeWasAsked() &&
    /keep looking|さがして|がんばって|you can do it|わかった|still looking|we found some sand|you found some sand/i.test(
      assistant
    )
  ) {
    whenAssistantIdle(() => {
      if (ch2SeeWasAsked()) return;
      if (!ch2HotWasAnswered()) return;
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      sendClientText(
        withBeginnerSpeakRule(
          formatTeacherNote(
            "[Teacher note — do not read aloud] STOP. Child already answered Is it hot outside?. Ask beat 4 NOW. " +
              "Speak EXACTLY: " +
              CH2_SEE_SPEAK +
              " Then WAIT. FORBIDDEN: Keep looking / We found some sand." +
              beginnerTurnHint()
          )
        ),
        { force: true }
      );
    }, "ch2-skip-see");
    return;
  }

  // Beat 4 spoken before beat 3 was answered — pull back and WAIT on beat 3.
  if (ch2AssistantSaidSeeQuestion(assistant) && !ch2HotWasAnswered() && !ch2AssistantSaidFoundElicit(assistant)) {
    whenAssistantIdle(() => {
      if (ch2HotWasAnswered()) return;
      if (!ch2AssistantSaidSeeQuestion(lastAssistantText()) && ch2HotWasAsked()) return;
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      sendClientText(
        withBeginnerSpeakRule(
          formatTeacherNote(
            "[Teacher note — do not read aloud] STOP. You skipped waiting for Beat 3. " +
              "Speak EXACTLY: " +
              CH2_HOT_SPEAK +
              " Then WAIT for the child's answer. FORBIDDEN: What can you see around you? until they answer." +
              beginnerTurnHint()
          )
        ),
        { force: true }
      );
    }, "ch2-skip-hot-answer");
    return;
  }

  // After beat 4 answer: if Learny did anything except the found-sand elicit, force beat 5.
  if (
    (ch2Search.phase === "checking" || ch2Search.phase === "waiting" || ch2SeeWasAsked()) &&
    !ch2AssistantSaidFoundElicit(assistant) &&
    !ch2LastAssistantWasSeeQuestion(assistant) &&
    detectCh2EverydayKey(assistant) !== "hot" &&
    String(assistant || "").trim()
  ) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "ch2") return;
      if (ch2ElicitCoachSentAt && Date.now() - ch2ElicitCoachSentAt < 12000) return;
      if (ch2AssistantSaidFoundElicit(lastAssistantText())) return;
      if (ch2LastAssistantWasSeeQuestion(lastAssistantText())) return;
      forceCh2FoundSandElicit("post-see-wrong-line");
    }, "ch2-skip-elicit");
    return;
  }

  // Skipped beat 3–4 after left/right — force hot/see back on script.
  if (
    !ch2FreeTalkFinished() &&
    ch2AssistantSaidFoundElicit(assistant) &&
    (ch2Search.phase === "chat" || ch2Search.phase === "direction" || loadMcqCursor("ch2") >= 2)
  ) {
    whenAssistantIdle(() => {
      if (ch2FreeTalkFinished()) return;
      if (!ch2AssistantSaidFoundElicit(lastAssistantText())) return;
      const next = ch2NextEverydaySpeak() || CH2_HOT_SPEAK;
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      sendClientText(
        withBeginnerSpeakRule(
          formatTeacherNote(
            "[Teacher note — do not read aloud] STOP. You skipped free talk (Is it hot outside? → What can you see around you?). " +
              "Do NOT say We found some sand yet. Speak EXACTLY: " +
              next +
              " Then WAIT." +
              beginnerTurnHint()
          )
        ),
        { force: true }
      );
    }, "ch2-skip-freetalk");
    return;
  }

  if (needsCh2ElicitPhrase(assistant, user)) {
    if (!ch2FreeTalkFinished()) return;
    whenAssistantIdle(() => {
      sendTeacherNote(
        `ch2-elicit-${normalizeUserText(user)}`,
        "[Teacher note — do not read aloud] Child found sand" +
          (/すな|砂|^sand$/i.test(user) ? " (すな/sand)." : ".") +
          " You must react to the SAND — not the previous topic. " +
          "NOW: " +
          CH2_ELICIT_FOUND_SPEAK +
          " Then WAIT." +
          beginnerTurnHint()
      );
    }, "ch2-elicit");
    return;
  }

  if (ch2Search.phase !== "chat") return;
  if (assistantAskedEverydayQuestion(assistant)) return;
  if (assistantAskedLetMeKnow(assistant)) return;
  // Premature "found sand yet?" before chat beats — push back to script.
  if (!/have you found|found sand yet|keep looking|さがして/i.test(assistant)) return;

  whenAssistantIdle(() => {
    sendTeacherNote(
      `ch2-rally-${ch2Search.rallies}-${normalizeUserText(user)}`,
      `[Teacher note — do not read aloud] Too early. Speak the scripted next line: ${ch2NextScriptSpeak()}`
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

function recentAssistantMessages(limit = 10) {
  return chatMessages
    .filter((m) => m.type === "assistant")
    .slice(-limit)
    .map((m) => String(m.text || "").trim())
    .filter(Boolean);
}

function userHasPutGlassPhrase() {
  return recentUserMessages().some((t) => /\b(i put glass|put glass here)\b/i.test(t));
}

function userSaidPutGlassAction(text) {
  const t = String(text || "").trim();
  if (/\b(i put glass|put glass here)\b/i.test(t)) return true;
  return /おいた|置いた|おきました|置きました|put (?:it|the glass|glass)|i put\b/i.test(t);
}

function userHasBuildingTankPhrase() {
  return recentUserMessages().some((t) =>
    /\b(i'?m building a tank|im building a tank|i am building a tank|building a tank)\b/i.test(t)
  );
}

function userHasMadeTankPhrase() {
  return recentUserMessages().some((t) => /\b(i made a tank|made a tank)\b/i.test(t));
}

function userHasLooksGoodPhrase() {
  return recentUserMessages().some((t) => /\b(it looks good|looks good)\b/i.test(t));
}

function canFinishCh5Part1(userText = "") {
  if (/\b(it looks good|looks good)\b/i.test(String(userText || ""))) return true;
  return userHasLooksGoodPhrase();
}

function resetDaily1Chat() {
  daily1Chat = { rallies: 0, backToTankSpoken: false };
  daily1OpenForceAt = 0;
  daily1BridgeForceAt = 0;
}

function syncDaily1RalliesFromChat() {
  if (getCurrentSegment()?.id !== "daily1") return;
  let openerIdx = -1;
  for (let i = 0; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m?.type === "assistant" && assistantSaidDaily1AnimalOpener(m.text)) {
      openerIdx = i;
      break;
    }
  }
  if (openerIdx < 0) return;
  let count = 0;
  for (let i = openerIdx + 1; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m?.type === "user" || m?.type === "user-transcript") count += 1;
  }
  if (count > daily1Chat.rallies) {
    daily1Chat.rallies = count;
    dbg("daily1 rallies synced from chat", { rallies: daily1Chat.rallies });
  }
}

function daily1ReadyForBackToTank() {
  syncDaily1RalliesFromChat();
  return daily1Chat.rallies >= DAILY1_MIN_RALLIES;
}

function canCompleteDaily1Part1() {
  return daily1ReadyForBackToTank() && daily1Chat.backToTankSpoken;
}

function daily1CompleteBlockedMessage() {
  if (!daily1ReadyForBackToTank()) {
    return (
      "Daily English NOT done (" +
      daily1Chat.rallies +
      "/" +
      DAILY1_MIN_RALLIES +
      " rallies minimum). Continue ONE more everyday question — short reaction + NEW question. " +
      "FORBIDDEN: complete_segment(daily1), back to the tank, Chapter 6, basement/sand/tank MCQ. " +
      "Need " +
      (DAILY1_MIN_RALLIES - daily1Chat.rallies) +
      " more rally/rallies."
    );
  }
  if (!daily1Chat.backToTankSpoken) {
    return (
      "Daily English rallies done but bridge missing. " +
      daily1BridgeTurnInstruction(lastPendingUserText || recentUserMessages(1)[0] || "") +
      " then call complete_segment(daily1). FORBIDDEN: skip bridge / jump to Chapter 6."
    );
  }
  return "Daily English not ready to complete.";
}

function assistantCh6LeakDuringDaily1(text = "") {
  return /basement inside the tank|let'?s make a basement|すいそうの.*すなを.*おこう|put the sand on the bottom|put sand on the bottom|chapter 6|CHAPTER 6/i.test(
    String(text || "")
  );
}

function assistantSaidDaily1WrongOpener(text = "") {
  return /practice today'?s english|きょうの\s*えいごを\s*れんしゅう/i.test(String(text || ""));
}

function assistantSaidDaily1AnimalOpener(text = "") {
  return /favourite animal|favorite animal|すきな\s*どうぶつ/i.test(String(text || ""));
}

function assistantSaidDaily1BackToTank(text = "") {
  return /get back to the tank|back to the tank|すいそう\s*つくりに\s*もどろう|すいそう.*もどろう/i.test(
    String(text || "")
  );
}

function daily1KnownColorHint() {
  const color = String(loadLessonState()?.memories?.favoriteColor || "").trim();
  if (!color) return "No favorite-color questions.";
  return "No favorite-color questions (already chose " + color + ").";
}

function assistantAskedDaily1ForbiddenColor(text = "") {
  return DAILY1_FORBIDDEN_COLOR_RE.test(String(text || ""));
}

function handleDaily1ChatProgress(userText) {
  if (getCurrentSegment()?.id !== "daily1") {
    if (daily1Chat.rallies || daily1Chat.backToTankSpoken) resetDaily1Chat();
    return;
  }
  const t = String(userText || "").trim();
  if (!t) return;
  daily1Chat.rallies += 1;
  syncDaily1RalliesFromChat();
  dbg("daily1 rally", { rallies: daily1Chat.rallies });
}

function isDaily1ShortAck(text = "") {
  return /^(うん+|ん+|はい|ええ|えー|yeah|yes|yep|ok|okay)[.!！？?\s]*$/i.test(String(text || "").trim());
}

/** Spot robotic Daily English turns (same echo every time / ignored answers). */
function daily1UnnaturalAssistantPatterns(assistant = lastAssistantText(), user = "") {
  const a = String(assistant || "");
  const u = String(user || "").trim();
  const past = recentAssistantMessages(8);
  const issues = [];

  const dogEcho = past.filter((m) => /^(a dog|わんちゃん|いぬ[！!]?)/i.test(String(m).trim()) || /\ba dog[!！,.]/i.test(m)).length;
  if (dogEcho >= 2 && /\ba dog|わんちゃん|いぬ[！!]/i.test(a)) {
    issues.push("You keep opening with A dog!/いぬ！ — vary the reaction; do NOT echo the animal every turn.");
  }

  // Child already said they used to keep a pet; don't ask "did you have one before?"
  if (
    /飼ってた|かってた|used to (have|keep)|had a (dog|pet|cat)/i.test(u) &&
    /did you have|have one before|まえに\s*かって|かっていたの/i.test(a)
  ) {
    issues.push("Child already said they used to have one — do NOT ask Did you have one before? Acknowledge and ask something NEW about that (name, when, favorite memory).");
  }

  // Favourite animal → "パンダ" then "Do you like pandas?" is tautological (they already answered).
  const namedAnimal = u.match(
    /^(犬|いぬ|猫|ねこ|うさぎ|パンダ|ぱんだ|ライオン|鳥|とり|さかな|dog|cat|rabbit|panda|lion|bird|fish|hamster|トイプードル|toypoodle)[!！.。\s]*$/i
  );
  if (
    namedAnimal &&
    /do you like|are you a .+ fan|すき[？?]|好き[？?]|すきなの|好きなの/i.test(a)
  ) {
    issues.push(
      "Child already named their favourite animal (\"" +
        namedAnimal[1] +
        "\") — that MEANS they like it. FORBIDDEN: Do you like " +
        namedAnimal[1] +
        "? / すき？ Acknowledge and ask something NEW (seen one? zoo? cute? why?)."
    );
  }

  // Same animal echo + brand-new unrelated topic in one turn feels robotic.
  if (
    /\ba dog|わんちゃん|いぬ/i.test(a) &&
    /\b(video games?|game|テレビ|ゲーム|school|がっこう|food|たべもの)\b/i.test(a) &&
    !/by the way|そういえば|anyway|じゃあ/i.test(a)
  ) {
    issues.push("Abrupt topic jump. Soft-bridge if you change topics (Nice! By the way… / そうだね！そういえば…).");
  }

  return issues;
}

function buildDaily1NaturalTurnCoach(userText) {
  const t = String(userText || "").trim();
  const assistant = lastAssistantText();
  const issues = daily1UnnaturalAssistantPatterns(assistant, t);
  const issueBit = issues.length ? " FIX: " + issues[0] : "";

  if (isDaily1ShortAck(t)) {
    return (
      "Short yes (\"" +
      t.slice(0, 12) +
      "\"). Warm ack + ONE same-topic follow-up. No brand-new topic." +
      issueBit
    );
  }

  if (/飼ってた|かってた|used to|had a |もういない|昔いた/i.test(t)) {
    return (
      "They used to have a pet (\"" +
      t.slice(0, 36) +
      "\"). Ack that — don't re-ask. ONE past-pet follow-up." +
      issueBit
    );
  }

  if (/^(犬|いぬ|猫|ねこ|うさぎ|パンダ|ぱんだ|ライオン|鳥|とり|さかな|dog|cat|rabbit|panda|lion|bird|fish|トイプードル|toypoodle)[!！.。\s]*$/i.test(t)) {
    return (
      "Favourite animal is \"" +
      t.slice(0, 20) +
      "\" (already answered). Warm react naming it. " +
      "FORBIDDEN: Do you like " +
      t.slice(0, 12) +
      "? / すき？ — they already chose it. " +
      "ONE NEW follow-up (seen at zoo? why cute? pet one?). " +
      issueBit
    );
  }

  return (
    "React to \"" +
    t.slice(0, 40) +
    "\", ONE follow-up on that topic. No repeated echo / no random jumps." +
    issueBit
  );
}

function buildDaily1OutboundCoach(userText) {
  if (getActiveLessonId() !== "part1" || getCurrentSegment()?.id !== "daily1") return "";
  syncDaily1RalliesFromChat();
  const t = String(userText || "").trim();
  const past = recentAssistantMessages(10).join("\n");

  if (assistantSaidDaily1BackToTank(past) || assistantSaidDaily1BackToTank(lastAssistantText())) {
    daily1Chat.backToTankSpoken = true;
    return (
      "[Teacher note — do not read aloud] Bridge spoken. Call complete_segment(daily1) NOW. Stay quiet — Chapter 6 opens next. " +
      "FORBIDDEN: more pet/chat reaction."
    );
  }

  if (daily1ReadyForBackToTank()) {
    return (
      "[Teacher note — do not read aloud] " +
      daily1Chat.rallies +
      "+ rallies done. " +
      daily1BridgeTurnInstruction(t) +
      " Finish speaking fully. FORBIDDEN this turn: complete_segment / Chapter 6."
    );
  }

  if (!assistantSaidDaily1AnimalOpener(past) && !assistantSaidDaily1WrongOpener(lastAssistantText())) {
    return (
      "[Teacher note — do not read aloud] Speak EXACTLY: " +
      daily1OpenSpeak() +
      " Then WAIT. FORBIDDEN: Let's practice today's English."
    );
  }

  // Keep Daily English coaches SHORT — long notes make Live replies very slow.
  return (
    "[Teacher note — do not read aloud] Rally " +
    daily1Chat.rallies +
    "/" +
    DAILY1_MIN_RALLIES +
    ". " +
    buildDaily1NaturalTurnCoach(t) +
    " " +
    daily1KnownColorHint()
  );
}

function forceDaily1BackToTank(reason = "rallies-done", { bypassCooldown = false } = {}) {
  if (getCurrentSegment()?.id !== "daily1") return false;
  if (!client?.connected || actionState !== "active") return false;
  syncDaily1RalliesFromChat();
  if (!daily1ReadyForBackToTank()) return false;
  if (assistantSaidDaily1BackToTank(lastAssistantText())) {
    daily1Chat.backToTankSpoken = true;
    return false;
  }
  if (!bypassCooldown && daily1BridgeForceAt && Date.now() - daily1BridgeForceAt < 10000) {
    return false;
  }
  daily1BridgeForceAt = Date.now();
  const lastUser = String(lastPendingUserText || recentUserMessages(1)[0] || "").trim();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". " +
    daily1BridgeTurnInstruction(lastUser) +
    " Speak that full turn out loud NOW (finish speaking — do not only call tools). " +
    "FORBIDDEN this turn: complete_segment. Call complete_segment(daily1) only AFTER you finished speaking.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force daily1 back-to-tank", reason, daily1Chat.rallies);
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function forceDaily1Continue(reason = "need-more-rallies") {
  if (getCurrentSegment()?.id !== "daily1") return false;
  if (!client?.connected || actionState !== "active") return false;
  syncDaily1RalliesFromChat();
  if (daily1ReadyForBackToTank()) {
    return forceDaily1BackToTank(reason + "-bridge");
  }
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Rally " +
    daily1Chat.rallies +
    "/" +
    DAILY1_MIN_RALLIES +
    ". " +
    buildDaily1NaturalTurnCoach(lastPendingUserText || recentUserMessages(1)[0] || "") +
    " " +
    daily1KnownColorHint() +
    " No tank/Ch6 yet.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force daily1 continue", reason, daily1Chat.rallies);
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function maybeDaily1ContinueNudge() {
  if (getCurrentSegment()?.id !== "daily1") return;
  syncDaily1RalliesFromChat();
  const assistant = lastAssistantText();

  if (assistantCh6LeakDuringDaily1(assistant)) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (daily1ReadyForBackToTank()) forceDaily1BackToTank("skipped-to-ch6");
      else forceDaily1Continue("skipped-to-ch6");
    }, "daily1-skip-ch6");
    return;
  }

  // 4+ rallies but bridge not spoken — force the tank return (was previously a no-op return).
  if (daily1ReadyForBackToTank() && !assistantSaidDaily1BackToTank(assistant)) {
    if (awaitingAssistantReply) return;
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (awaitingAssistantReply) return;
      if (assistantSaidDaily1BackToTank(lastAssistantText())) {
        daily1Chat.backToTankSpoken = true;
        return;
      }
      forceDaily1BackToTank("missing-bridge");
    }, "daily1-bridge");
    return;
  }

  if (daily1ReadyForBackToTank()) return;

  if (!assistantAskedQuestion(assistant) && daily1Chat.rallies > 0 && String(assistant || "").trim()) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (daily1ReadyForBackToTank()) {
        forceDaily1BackToTank("praise-only-ready");
        return;
      }
      forceDaily1Continue("praise-only-no-question");
    }, "daily1-continue");
  }
}

function forceDaily1Open(reason = "wrong-opener") {
  if (getCurrentSegment()?.id !== "daily1") return false;
  if (!client?.connected || actionState !== "active") return false;
  if (assistantSaidDaily1AnimalOpener(lastAssistantText()) && !assistantSaidDaily1WrongOpener(lastAssistantText())) {
    return false;
  }
  if (daily1OpenForceAt && Date.now() - daily1OpenForceAt < 10000) return false;
  daily1OpenForceAt = Date.now();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak EXACTLY ONE turn: " +
    daily1OpenSpeak() +
    " FORBIDDEN: Let's practice today's English / きょうの えいごを れんしゅうしよう. Then WAIT." +
    beginnerTurnHint();
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force daily1 open", reason);
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function maybeDaily1CorrectiveNudge() {
  if (getCurrentSegment()?.id !== "daily1") return;
  syncDaily1RalliesFromChat();
  const assistant = lastAssistantText();
  const past = recentAssistantMessages(10).join("\n");

  if (assistantSaidDaily1BackToTank(assistant)) {
    daily1Chat.backToTankSpoken = true;
    maybeCompleteDaily1FromClient(lastPendingUserText || "");
    return;
  }

  // Stuck after 4+ rallies with no bridge — force it even mid-session.
  // Don't interrupt while Gemini is still generating the reply to the child's last turn.
  if (daily1ReadyForBackToTank() && !assistantSaidDaily1BackToTank(past)) {
    if (awaitingAssistantReply) return;
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (awaitingAssistantReply) return;
      if (assistantSaidDaily1BackToTank(lastAssistantText())) {
        daily1Chat.backToTankSpoken = true;
        return;
      }
      forceDaily1BackToTank("corrective-missing-bridge");
    }, "daily1-bridge");
    return;
  }

  if (assistantAskedDaily1ForbiddenColor(assistant)) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (!assistantAskedDaily1ForbiddenColor(lastAssistantText())) return;
      const note =
        "[Teacher note — do not read aloud] WRONG: favorite color question on Daily English. " +
        daily1KnownColorHint() +
        " Ask a DIFFERENT everyday question (food, hobby, weather, family, school — NOT color). " +
        "Rally " +
        daily1Chat.rallies +
        "/" +
        DAILY1_MIN_RALLIES +
        "+." +
        beginnerTurnHint();
      try {
        closeOpenAudioTurn();
        audioPlayer?.interrupt?.();
      } catch {
        // ignore
      }
      sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
    }, "daily1-no-color");
    return;
  }

  // Robotic chat: repeating "A dog!" / re-asking answered facts / abrupt jumps.
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  const flowIssues = daily1UnnaturalAssistantPatterns(assistant, user);
  if (flowIssues.length && daily1Chat.rallies > 0 && !daily1ReadyForBackToTank()) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (daily1ReadyForBackToTank()) return;
      if (!daily1UnnaturalAssistantPatterns(lastAssistantText(), user).length) return;
      const note =
        "[Teacher note — do not read aloud] UNNATURAL chat. " +
        flowIssues[0] +
        " Continue Daily English naturally: " +
        buildDaily1NaturalTurnCoach(user) +
        " Rally " +
        daily1Chat.rallies +
        "/" +
        DAILY1_MIN_RALLIES +
        "+." +
        beginnerTurnHint();
      try {
        closeOpenAudioTurn();
        audioPlayer?.interrupt?.();
      } catch {
        // ignore
      }
      sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
    }, "daily1-natural-flow");
    return;
  }

  if (
    assistantSaidDaily1WrongOpener(assistant) ||
    (!assistantSaidDaily1AnimalOpener(past) && daily1Chat.rallies === 0 && String(assistant || "").trim())
  ) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (assistantSaidDaily1AnimalOpener(lastAssistantText()) && !assistantSaidDaily1WrongOpener(lastAssistantText())) {
        return;
      }
      forceDaily1Open("wrong-daily1-opener");
    }, "daily1-opener");
    return;
  }

  if (!daily1ReadyForBackToTank() && assistantSaidDaily1BackToTank(assistant)) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (daily1ReadyForBackToTank()) return;
      const note =
        "[Teacher note — do not read aloud] Too early for back-to-tank (" +
        daily1Chat.rallies +
        "/" +
        DAILY1_MIN_RALLIES +
        " rallies). Continue Daily English — reaction + ONE everyday question. " +
        "FORBIDDEN: back to the tank / Let's practice today's English." +
        beginnerTurnHint();
      sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
    }, "daily1-early-bridge");
    return;
  }

  maybeDaily1ContinueNudge();
}

function buildCh5OutboundCoach(userText) {
  if (getActiveLessonId() !== "part1" || getCurrentSegment()?.id !== "ch5") return "";
  const t = String(userText || "").trim();
  const segment = getCurrentSegment();
  const beats = getSegmentMcqBeats(segment);
  const beatById = (id) => beats.find((b) => b.id === id);

  if (canFinishCh5Part1(t)) {
    return (
      "[Teacher note — do not read aloud] Chapter 5 done (It looks good!). Short praise, then call complete_segment(ch5). " +
      "NEXT is Daily English — start EXACTLY: " +
      daily1OpenSpeak() +
      " FORBIDDEN: Let's practice today's English / restart walls / dye/color." +
      beginnerTurnHint()
    );
  }

  if (/\b(i made a tank|made a tank)\b/i.test(t) || userHasMadeTankPhrase()) {
    const beat = beatById("looks_good");
    return (
      "[Teacher note — do not read aloud] Child said I made a tank! Short praise, then Speak EXACTLY Beat 4: " +
      buildMcqSpeakCoach(beat) +
      " FORBIDDEN: say It looks good yourself. FORBIDDEN: praise-only." +
      beginnerTurnHint()
    );
  }

  if (/\b(i'?m building a tank|im building a tank|i am building a tank|building a tank)\b/i.test(t) || userHasBuildingTankPhrase()) {
    const beat = beatById("made_tank");
    return (
      "[Teacher note — do not read aloud] Child said I'm building a tank. Short praise, then Speak EXACTLY Beat 3: " +
      buildMcqSpeakCoach(beat) +
      " FORBIDDEN: say I made a tank yourself. FORBIDDEN: praise-only." +
      beginnerTurnHint()
    );
  }

  if (/\b(i put glass|put glass here)\b/i.test(t) || userHasPutGlassPhrase()) {
    const beat = beatById("building");
    return (
      "[Teacher note — do not read aloud] Child said I put glass here. Short praise, then Speak EXACTLY Beat 2: " +
      buildMcqSpeakCoach(beat) +
      " FORBIDDEN: say I'm building a tank yourself. FORBIDDEN: praise-only." +
      beginnerTurnHint()
    );
  }

  const beat = beatById("put_glass");
  return (
    "[Teacher note — do not read aloud] Chapter 5 Beat 1 ONLY: Speak EXACTLY: " +
    buildMcqSpeakCoach(beat) +
    " FORBIDDEN: How big / what shape / Let me know when you put / Can you say, I put glass here? " +
    "FORBIDDEN: restart dye/color. FORBIDDEN: praise-only." +
    beginnerTurnHint()
  );
}

function buildCh4OutboundCoach(userText) {
  if (getActiveLessonId() !== "part1" || getCurrentSegment()?.id !== "ch4") return "";
  const t = String(userText || "").trim();

  if (/\b(i put glass|put glass here|i'?m building a tank|i made a tank)\b/i.test(t)) {
    return (
      "[Teacher note — do not read aloud] Chapter 4 is COLOR only. Stay on color glass. " +
      "FORBIDDEN: I put glass here / walls." +
      beginnerTurnHint()
    );
  }

  if (userHasMadeColorGlassPhrase(t) || canFinishCh4Part1(t)) {
    return (
      "[Teacher note — do not read aloud] Child said I made [color] glass! Short praise, call complete_segment(ch4). " +
      "NEXT is Chapter 5 walls — FORBIDDEN: more dye/flower, I put glass here yet." +
      beginnerTurnHint()
    );
  }

  const past = recentAssistantMessages(12).join("\n");
  const memories = loadLessonState()?.memories || {};
  const rememberedColor = String(memories.favoriteColor || "").trim();
  const colorFromUser = extractFavoriteColor(t);
  const colorName = colorFromUser || rememberedColor || "that";

  const askedFavorite = /favorite color|what color do you like|すきな\s*いろ|どの\s*いろ/i.test(past);
  const saidLetsMake = ch4AssistantSaidLetsMake(past);
  const askedLetMeKnowMake = ch4AssistantSaidBeatB(past);

  if (!askedFavorite && !colorFromUser && !rememberedColor) {
    return (
      "[Teacher note — do not read aloud] Chapter 4: ask ONLY What's your favorite color? すきな いろは？ Then WAIT. " +
      "Record favoriteColor. NEVER assume blue. FORBIDDEN: dye/flower phrases, walls." +
      beginnerTurnHint()
    );
  }

  if ((colorFromUser || looksLikeColorAnswer(t)) && !saidLetsMake) {
    maybeSaveCh4FavoriteColor(t);
    return (
      "[Teacher note — do not read aloud] Child named a color (" +
      colorName +
      "). Call record_memory(favoriteColor, " +
      colorName +
      ") if not saved. " +
      "Speak EXACTLY Beat A2+B COMBINED in ONE turn, then STOP and WAIT for the 4-button MCQ: " +
      ch4CombinedMakeAndTellSpeak(colorName) +
      " FORBIDDEN this turn: What's your favorite color? / すきな いろは？ / split into two turns / walls / " +
      "say I made " +
      colorName +
      " glass yourself / complete_segment(ch4)." +
      beginnerTurnHint()
    );
  }

  // Color already saved (reconnect / praise-loop recovery) — force combined make+tell.
  if (rememberedColor && !askedLetMeKnowMake) {
    return (
      "[Teacher note — do not read aloud] favoriteColor is " +
      rememberedColor +
      ". Speak EXACTLY Beat A2+B COMBINED NOW, then WAIT for MCQ: " +
      ch4CombinedMakeAndTellSpeak(rememberedColor) +
      " FORBIDDEN: praise-only, ask favorite color again, walls, complete_segment(ch4)." +
      beginnerTurnHint()
    );
  }

  if (saidLetsMake && askedLetMeKnowMake) {
    return (
      "[Teacher note — do not read aloud] Make+tell elicit already spoken. WAIT for I made " +
      colorName +
      " glass! on the buttons. " +
      "If child is stuck, gently repeat: " +
      ch4BeatBSpeak(colorName) +
      " FORBIDDEN: English inside 「」 — use " +
      ch4BeatBJaLine(colorName) +
      " only. FORBIDDEN: say the English answer yourself. FORBIDDEN: walls / complete_segment without the phrase." +
      beginnerTurnHint()
    );
  }

  return (
    "[Teacher note — do not read aloud] Chapter 4: favorite color → ONE combined make+tell line → I made [color] glass! MCQ. " +
    "Combined line: " +
    ch4CombinedMakeAndTellSpeak(colorName === "that" ? "orange" : colorName) +
    " FORBIDDEN: Did you make one?, I need a dye, walls, finishing Ch4 on color alone." +
    beginnerTurnHint()
  );
}

function extractFavoriteColor(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 40) return "";
  const map = [
    [/オレンジ|orange/, "orange"],
    [/あか|赤|red/, "red"],
    [/あお|青|blue/, "blue"],
    [/みどり|緑|green/, "green"],
    [/きいろ|黄色|yellow/, "yellow"],
    [/ピンク|pink/, "pink"],
    [/むらさき|紫|purple/, "purple"],
    [/しろ|白|white/, "white"],
    [/くろ|黒|black/, "black"],
    [/ちゃいろ|茶色|brown/, "brown"],
  ];
  for (const [re, name] of map) {
    if (re.test(t)) return name;
  }
  // Short English color word
  const m = t.match(/\b(orange|red|blue|green|yellow|pink|purple|white|black|brown|cyan|lime|magenta)\b/i);
  return m ? m[1].toLowerCase() : "";
}

function colorToJaLabel(colorEn) {
  const c = String(colorEn || "").trim().toLowerCase();
  const map = {
    orange: "おれんじ",
    red: "あか",
    blue: "あお",
    green: "みどり",
    yellow: "きいろ",
    pink: "ぴんく",
    purple: "むらさき",
    white: "しろ",
    black: "くろ",
    brown: "ちゃ",
    cyan: "しあん",
    lime: "らいむ",
    magenta: "まぜんた",
  };
  return map[c] || String(colorEn || "おれんじ");
}

function expandMcqColorPlaceholders(text, colorEn) {
  const color = String(colorEn || "orange");
  const colorJa = colorToJaLabel(color);
  return String(text || "")
    .replace(/\[colorJa\]/gi, colorJa)
    .replace(/\[color\]/gi, color)
    .replace(/___/g, color);
}

function ch4BeatBJaLine(colorEn = loadLessonState().memories?.favoriteColor || "orange") {
  return expandMcqColorPlaceholders(
    "つくれたら「[colorJa]いろの がらすを つくった！」って えいごで おしえてね！",
    colorEn
  );
}

function ch4BeatBSpeak(colorEn = loadLessonState().memories?.favoriteColor || "orange") {
  return "Tell me when you make one! " + ch4BeatBJaLine(colorEn);
}

function assistantCh4WrongBeatB(text = lastAssistantText()) {
  const t = String(text || "");
  if (!/tell me when you make|let me know when you make|when you make one|つくれたら/i.test(t)) {
    return false;
  }
  if (/つくれたら「[^」]*[a-zA-Z]/i.test(t)) return true;
  if (/「I made .+ glass/i.test(t)) return true;
  if (/つくれたら「/.test(t) && !/いろの\s*(?:がらす|ガラス)を\s*つくった/.test(t)) return true;
  return false;
}

function fixCh4BeatBBubble(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  const seg = getCurrentSegment()?.id;
  if (seg !== "ch4" && !/tell me when you make|つくれたら「/.test(t)) return t;
  if (!assistantCh4WrongBeatB(t)) return t;
  const color = loadLessonState()?.memories?.favoriteColor || "orange";
  const ja = ch4BeatBJaLine(color);
  if (/つくれたら「[^」]*」/.test(t)) {
    t = t.replace(/つくれたら「[^」]*」[^！!]*(?:[！!]|って\s*(?:英語|えいご)で\s*おしえてね[！!]?)?/i, ja);
  } else if (/tell me when you make/i.test(t)) {
    t = t.replace(/tell me when you make one![!.?\s]*/i, "Tell me when you make one! " + ja);
  }
  return t.trim();
}

function ch4AssistantSaidLetsMake(past = recentAssistantMessages(12).join("\n")) {
  return /let'?s make .+(coloured|colored)\s+glass|(?:^|[\s!！])[\w]+\s+(coloured|colored)\s+glass|いろの\s*(?:がらす|ガラス)を\s*つくろう|の\s*(?:がらす|ガラス)を\s*つくろう/i.test(
    String(past || "")
  );
}

/** Combined make+tell unlock — Japanese elicit is the source of truth (English phrasing often drifts). */
function ch4AssistantSaidBeatB(past = recentAssistantMessages(12).join("\n")) {
  const t = String(past || "");
  const hasJaElicit =
    /つくれたら「/.test(t) && /いろの\s*(?:がらす|ガラス)を\s*つくった/.test(t);
  if (!hasJaElicit) return false;
  // Still locked if Learny put the English answer inside 「」.
  if (/つくれたら「[^」]*[A-Za-z]/.test(t) || /「I made .+ glass/i.test(t)) return false;
  return true;
}

/** Strip favorite-color re-asks once a color is already saved. */
function stripCh4FavoriteColorReask(text) {
  if (getCurrentSegment()?.id !== "ch4" || !ch4HasFavoriteColor()) {
    return String(text || "");
  }
  let t = String(text || "");
  t = t.replace(/どんな\s*いろが\s*すき(?:かな|なの)?[？?！!\s]*/g, "");
  t = t.replace(/すきな\s*いろは[？?！!\s]*/g, "");
  t = t.replace(/好きな\s*色は[？?！!\s]*/g, "");
  t = t.replace(/What'?s your favou?rite colou?r\??[!.\s]*/gi, "");
  t = t.replace(/What colou?r do you like\??[!.\s]*/gi, "");
  t = t.replace(/What about your favou?rite colou?r\??[!.\s]*/gi, "");
  return t.replace(/\s{2,}/g, " ").trim();
}

function ch4AssistantReaskedFavoriteColor(text = lastAssistantText()) {
  if (!ch4HasFavoriteColor()) return false;
  return /favorite color|favou?rite color|what color do you like|どんな\s*いろが\s*すき|すきな\s*いろは|好きな\s*色は/i.test(
    String(text || "")
  );
}

function patchLastAssistantCh4BeatBIfWrong() {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const msg = chatMessages[i];
    if (msg.type !== "assistant") continue;
    if (!assistantCh4WrongBeatB(msg.text)) break;
    const fixed = fixCh4BeatBBubble(msg.text);
    if (fixed !== msg.text) {
      msg.text = fixed;
      scheduleRenderChat();
    }
    break;
  }
}

function ch4HasFavoriteColor() {
  return Boolean(String(loadLessonState()?.memories?.favoriteColor || "").trim());
}

function forceCh4LetsMake(reason = "stuck-after-color") {
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (!client?.connected || actionState !== "active") return false;
  const color = loadLessonState()?.memories?.favoriteColor || "orange";
  if (ch4AssistantSaidBeatB()) return false;
  if (ch4LetsMakeForceAt && Date.now() - ch4LetsMakeForceAt < 10000) return false;
  ch4LetsMakeForceAt = Date.now();
  ch4BeatBForceAt = Date.now();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak EXACTLY Beat A2+B COMBINED (one turn), then WAIT for MCQ: " +
    ch4CombinedMakeAndTellSpeak(color) +
    " FORBIDDEN: praise-only, favorite color again, walls, say I made " +
    color +
    " glass yourself, complete_segment(ch4)." +
    beginnerTurnHint();
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force ch4 make+tell", reason);
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

function forceCh4BeatB(reason = "wrong-elicit") {
  // Combined flow: if elicit incomplete, re-speak the full make+tell line.
  return forceCh4LetsMake(reason || "force-beat-b");
}

/** Unstick Ch4: color saved → combined make+tell + MCQ (Learny often praise-loops). */
function maybeCh4BeatBCorrectiveNudge() {
  if (getCurrentSegment()?.id !== "ch4") return;
  const assistant = lastAssistantText();
  const past = recentAssistantMessages(12).join("\n");

  if (ch4AssistantSaidBeatB(assistant) || ch4AssistantSaidBeatB(past)) {
    patchLastAssistantCh4BeatBIfWrong();
    refreshChoiceBarIfNeeded();
    return;
  }

  // Color already chosen but Learny asked favorite color again — force make+tell.
  if (ch4HasFavoriteColor() && ch4AssistantReaskedFavoriteColor(assistant)) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "ch4") return;
      if (!ch4HasFavoriteColor()) return;
      if (ch4AssistantSaidBeatB()) return;
      forceCh4LetsMake("ch4-reasked-color");
    }, "ch4-reask-color");
    return;
  }

  // Color chosen but still missing つくれたら elicit — force combined line.
  if (ch4HasFavoriteColor() && !ch4AssistantSaidBeatB(past)) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "ch4") return;
      if (ch4AssistantSaidBeatB()) {
        refreshChoiceBarIfNeeded();
        return;
      }
      if (!ch4HasFavoriteColor()) return;
      forceCh4LetsMake("ch4-stuck-after-color");
    }, "ch4-make-tell");
  }
}

function ch4LetsMakeSpeak(colorEn) {
  const color = String(colorEn || "orange").trim();
  const ja = colorToJaLabel(color) + "いろの がらすを つくろう！";
  return "Let's make " + color + " coloured glass! " + ja;
}

/** Beat A2 + Beat B in one turn (easier for kids). */
function ch4CombinedMakeAndTellSpeak(colorEn) {
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

function maybeSaveCh4FavoriteColor(userText) {
  if (getCurrentSegment()?.id !== "ch4") return;
  const color = extractFavoriteColor(userText);
  if (!color) return;
  const state = loadLessonState();
  if (state.memories?.favoriteColor === color) return;
  recordMemory("favoriteColor", color);
}

function looksLikeColorAnswer(text) {
  return Boolean(extractFavoriteColor(text));
}

function userHasMadeColorGlassPhrase(text = "") {
  const check = (t) => {
    const s = String(t || "").trim();
    if (!s) return false;
    // Reject bare Chapter 3 "I made glass!" — need a color/word before glass.
    if (/^\s*i made\s+glass\b/i.test(s) || /\bi made\s+glass\s*[!.]?\s*$/i.test(s)) {
      return false;
    }
    // I made orange glass! / I made red coloured glass!
    return /\bi made\s+(?:a\s+|some\s+)?[\w-]+(?:\s+(?:coloured|colored|[\w-]+)){0,2}\s+glass\b/i.test(s);
  };
  if (check(text)) return true;
  return recentUserMessages().some(check);
}

function canFinishCh4Part1(userText = "") {
  // Never auto-finish on color alone, and never on Ch3's "I made glass!".
  if (!ch4HasFavoriteColor()) return false;
  if (!ch4AssistantSaidBeatB()) return false;
  if (userHasMadeColorGlassPhrase(userText)) return true;
  return recentUserMessages().some((t) => userHasMadeColorGlassPhrase(t));
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
  const bottom = msgs.some(looksLikeCh6BottomPhrase);
  return {
    putSand: bottom,
    bottom,
    imDone: msgs.some((t) => /\b(i'?m done|im done|i am done)\b/i.test(t)),
    tankReady: msgs.some(looksLikeTankReadyPhrase),
  };
}

function userHasMoreSandPhrase() {
  return recentUserMessages().some((t) => /\b(i need more sand|need more sand)\b/i.test(t));
}

function ch6NextStepHint() {
  const p = userCh6PhraseProgress();
  if (!p.bottom) return "Next phrase: I put the sand on the bottom.";
  if (!p.imDone) return "Next phrase: I'm done! (sand step finished).";
  if (!p.tankReady) return "Next phrase: My tank is ready!";
  return "Child finished ch6 phrases — call complete_segment(ch6).";
}

function ch6CoachHint() {
  if (getCurrentSegment()?.id !== "ch6") return "";
  if (userHasImDonePhrase() && !userHasTankReadyPhrase()) {
    return (
      " Ch6: child said I'm done! — praise ONLY, then Beat 4 Is the tank ready for the fishes to swim? " +
      PART1_ELICIT_JA.ch6TankReady +
      " → My tank is ready! " +
      "NEVER Almost, おしい, or not yet after I'm done!"
    );
  }
  const p = userCh6PhraseProgress();
  if (p.imDone) {
    return " Ch6: child said I'm done! — praise, then Beat 4 My tank is ready!";
  }
  if (p.bottom && !p.imDone) {
    return " Ch6: after bottom phrase — Beat 2 " + PART1_ELICIT_JA.ch6MoreSand + " or Beat 3 " + PART1_ELICIT_JA.ch6ImDone + " per MCQ cursor. Do NOT backtrack.";
  }
  return ` Ch6: ${ch6NextStepHint()}`;
}

function buildCh6OutboundCoach(userText) {
  if (getCurrentSegment()?.id !== "ch6") return "";
  const t = String(userText || "").trim();
  const segment = getCurrentSegment();
  const beats = getSegmentMcqBeats(segment);
  const beatById = (id) => beats.find((b) => b.id === id);

  if (canCompleteCh6Part1() || looksLikeTankReadyPhrase(t) || userHasTankReadyPhrase()) {
    return (
      "\n\n[Coach — never read aloud: Child said My tank is ready! Praise. Tank ready for fish LATER — still ZERO fish. " +
      "call complete_segment(ch6)." +
      `${beginnerTurnHint()}]`
    );
  }

  if (/\b(i'?m done|im done|i am done)\b/i.test(t) || userHasImDonePhrase()) {
    const beat = beatById("tank_ready");
    return (
      "\n\n[Coach — never read aloud: Child said I'm done! correctly. Praise (Great! / いいね!). " +
      "Then Speak EXACTLY Beat 4: " +
      buildMcqSpeakCoach(beat) +
      " FORBIDDEN: Almost, not yet, or we haven't put fish in yet as a correction." +
      `${beginnerTurnHint()}]`
    );
  }

  if (/\b(i need more sand|need more sand)\b/i.test(t) || userHasMoreSandPhrase()) {
    const beat = beatById("im_done");
    return (
      "\n\n[Coach — never read aloud: Child said I need more sand. Short praise, then Speak EXACTLY Beat 3: " +
      buildMcqSpeakCoach(beat) +
      `${beginnerTurnHint()}]`
    );
  }

  if (looksLikeCh6BottomPhrase(t)) {
    const beat = beatById("more_sand");
    return (
      "\n\n[Coach — never read aloud: Child said the BOTTOM phrase (put sand on the bottom counts!). " +
      "Praise — Great! Next Speak EXACTLY Beat 2: " +
      buildMcqSpeakCoach(beat) +
      " FORBIDDEN: stuck, どうしたの, or a second message before the child speaks." +
      `${beginnerTurnHint()}]`
    );
  }

  if (looksLikeCh6PutSandHere(t) && !looksLikeCh6BottomPhrase(t)) {
    const beat = beatById("put_sand");
    return (
      "\n\n[Coach — never read aloud: Child said I put sand here — wrong for Beat 1. Soft retry. Speak EXACTLY Beat 1: " +
      buildMcqSpeakCoach(beat) +
      " Correct answer is I put the sand on the bottom." +
      `${beginnerTurnHint()}]`
    );
  }

  const beat = beatById("put_sand");
  return (
    "\n\n[Coach — never read aloud: Chapter 6 Beat 1 ONLY: Speak EXACTLY: " +
    buildMcqSpeakCoach(beat) +
    " FORBIDDEN: old Put sand on the bottom / I put sand here? / English-in-quotes elicits. FORBIDDEN: praise-only." +
    `${beginnerTurnHint()}]`
  );
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
        "Praise: Great! You're done with the sand! Then Speak EXACTLY Beat 4: " +
        buildMcqSpeakCoach(getSegmentMcqBeats(getCurrentSegment()).find((b) => b.id === "tank_ready")) +
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

/** Primary English question in a Learny bubble (ignores praise prefixes). */
function extractPrimaryEnglishQuestion(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const hits = t.match(
    /\b(?:(?:What|How|Where|When|Who|Why|Do|Did|Does|Are|Is|Can|Will|Shall|Have|Has)\b[^?？.!]{0,120}[?？])/gi
  );
  if (hits?.length) return hits[hits.length - 1].trim();
  if (assistantAskedPlaceQuestion(t)) return "beach-or-mountains";
  if (assistantAskedDirectionQuestion(t)) return "left-or-right";
  if (detectCh2EverydayKey(t) === "hot") return "hot-outside";
  if (detectCh2EverydayKey(t) === "see" || ch2AssistantSaidSeeQuestion(t)) return "see-around";
  return "";
}

function sharesSameLeadQuestion(a, b) {
  const qa = normalizeUserText(extractPrimaryEnglishQuestion(a));
  const qb = normalizeUserText(extractPrimaryEnglishQuestion(b));
  if (qa && qb && qa === qb) return true;
  if (assistantAskedPlaceQuestion(a) && assistantAskedPlaceQuestion(b)) return true;
  if (assistantAskedDirectionQuestion(a) && assistantAskedDirectionQuestion(b)) return true;
  const ka = detectCh2EverydayKey(a);
  const kb = detectCh2EverydayKey(b);
  if (ka && ka === kb) return true;
  return false;
}

function assistantMessagesTooSimilar(a, b) {
  const na = normalizeUserText(a);
  const nb = normalizeUserText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (sharesSameLeadQuestion(a, b)) return true;
  if (sharesCh2FoundElicitBeat(a, b)) return true;
  if (getCurrentSegment()?.id === "ch2" && ch2AssistantSaidFoundElicit(a) && ch2AssistantSaidFoundElicit(b)) {
    return true;
  }
  // Ending scripted turns often double when Live + client force both fire.
  if (getCurrentSegment()?.id === "ending1") {
    if (assistantSaidEnding1Beat4(a) && assistantSaidEnding1Beat4(b)) return true;
    if (assistantSaidEnding1Intro(a) && assistantSaidEnding1Intro(b)) return true;
    if (assistantSaidEnding1Finale(a) && assistantSaidEnding1Finale(b)) return true;
    // Partial Perfect lead repeating (before fish question lands).
    if (
      assistantSaidEnding1PerfectLead(a) &&
      assistantSaidEnding1PerfectLead(b) &&
      !assistantSaidEnding1Intro(a) &&
      !assistantSaidEnding1Intro(b)
    ) {
      return true;
    }
  }
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
  if (sharesSameLeadQuestion(t, p)) return true;
  if (/は英語で[？?]/.test(p) && looksLikeNewAssistantReply(t)) return false;
  // Live often splits one spoken turn into reaction + follow-up (two STT finishes).
  if (Date.now() - lastAssistantBubbleAt < 12000) {
    if (!endsWithLeadPrompt(p)) return true;
    if (/[\u3040-\u309F]/.test(t) && /[a-zA-Z]/.test(p)) return true;
    if (/[\u3040-\u309F]/.test(t) && /[\u3040-\u309F]/.test(p)) return true;
  }
  if (/[\u3040-\u309F]/.test(t) && /[a-zA-Z]/.test(p)) return true;
  if (/[\u3040-\u309F]/.test(t) && /[\u3040-\u309F]/.test(p) && Date.now() - lastAssistantBubbleAt < 8000) {
    return true;
  }
  return false;
}

function shouldSuppressBackToBackAssistant(text) {
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type !== "assistant") return false;
  // Same turn continuation → merge in addMessage, do not drop.
  if (isLikelySameTurnContinuation(text, last.text)) return false;
  if (sharesCh2FoundElicitBeat(text, last.text)) return true;
  if (getCurrentSegment()?.id === "ch2" && ch2AssistantSaidFoundElicit(text) && ch2AssistantSaidFoundElicit(last.text)) {
    return true;
  }
  if (Date.now() - lastAssistantBubbleAt > 20000) return false;
  if (sharesSameLeadQuestion(last.text, text)) return true;
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

  if (getCurrentSegment()?.type === "warmup") {
    tryCompleteWarmupIfUserAgreedAfterInvite();
  }

  // Missing ひらがな must be fixed even after a normal assistant turn.
  maybeBeginnerJapaneseNudge();
  maybeSystemBackendLeakNudge();

  // Praise-only / stalled lead — allow a follow-up spoken beat even after Learny just spoke.
  // Ch4 hard-forces Let's make / Beat B; soft continuation nudge would double-speak.
  // Ending 1→2→3 / 5→6 is client-chained — never arm lead/continuation free-chat.
  const endingScripted =
    getCurrentSegment()?.id === "ending1" &&
    (!ending1AutoIntroComplete() ||
      (ending1Beat.finaleCoachSent > 0 && !ending1FinaleComplete()));
  if (endingScripted) {
    maybeChainEnding1AutoBeat();
    maybeChainEnding1FinaleBeat();
    maybeEnding1OffScriptNudge();
  } else if (getCurrentSegment()?.id === "ch4" && ch4HasFavoriteColor() && !ch4AssistantSaidBeatB()) {
    maybeCh4BeatBCorrectiveNudge();
  } else if (needsContinuationNudge(text)) {
    maybeContinuationNudge();
  } else if (getCurrentSegment()?.id !== "ending1") {
    armLeadWatch();
  } else {
    maybeEnding1OffScriptNudge();
  }
  // Warmup corrective coaches only after the child has spoken at least once.
  if (!(getCurrentSegment()?.type === "warmup" && countWarmupUserReplies() < 1)) {
    maybeWarmupMoodFollowUpNudge();
    maybeWarmupCoachNudge();
  }
  maybeCh1InviteLoopNudge();
  maybeCh3StartLoopNudge();

  if (getCurrentSegment()?.id === "ch4") {
    // Already handled above when mid-progress; still patch wrong Beat B / show MCQ.
    if (!(ch4HasFavoriteColor() && !ch4AssistantSaidBeatB())) {
      maybeCh4BeatBCorrectiveNudge();
    }
  }

  if (getCurrentSegment()?.id === "daily1") {
    maybeDaily1CorrectiveNudge();
  }

  // ending1 chain/off-script already handled in endingScripted / else above — do not call twice.

  if (getCurrentSegment()?.id === "final1") {
    syncFinal1CursorFromAssistant(text);
    renderChoiceBar(getCurrentSegment());
    maybeFinal1OpenNudge();
    maybeFinal1PraiseOnlyNudge();
    maybeFinal1CoachNudge();
  }

  // Ch2: repair Are you tired?, repeated questions, or ignored 「すな」 even after a normal reply.
  if (getCurrentSegment()?.id === "ch2") {
    if (FORBIDDEN_EVERYDAY_RE.test(text)) onCh2AssistantText(text);
    maybeCh1DoneLoopNudge();
    maybeCh2RepeatNudge();
    maybeCh2CorrectiveNudge();
  }

  // Learny already answered — other client_content coaches wait for the child.
  if (blockCoachUntilUserSpeaks) {
    dbg("post-turn coaches skipped; waiting for child");
    return;
  }

  onCh2AssistantText(text);
}

function maybeCh1InviteLoopNudge() {
  // Soft handoff kept Live history — Learny re-asks the tank invite on Chapter 1.
  if (getCurrentSegment()?.id !== "ch1") return;
  const assistant = lastAssistantText();
  if (!looksLikeTankInvite(assistant)) return;
  // Real Ch1 glass question already present — leave it.
  if (looksLikeCh1Step1Question(assistant)) return;
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ch1") return;
    if (!looksLikeTankInvite(lastAssistantText())) return;
    if (looksLikeCh1Step1Question(lastAssistantText())) return;
    const note =
      "[Teacher note — do not read aloud] STOP. Warmup is done — do NOT ask Will you help / Oh! Today… again. " +
      "Speak EXACTLY Chapter 1 Step 1 NOW: Thank you! What do I need to make a tank? Something transparent and hard. " +
      "ありがとう！すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。 Then WAIT for glass." +
      beginnerTurnHint();
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
  }, "ch1-invite-loop");
}

/** Banner on Ch3 but Learny still stuck on Chapter 2 found-sand elicit. */
function maybeCh3StartLoopNudge() {
  if (getCurrentSegment()?.id !== "ch3") return;
  const assistant = lastAssistantText();
  if (/let'?s make some glass|ガラスが必要|are you done making the glass|ガラスを作った/i.test(assistant)) {
    return;
  }
  if (
    !/you found some sand|すなをみつけ|「(?:すなを|砂を)見つけた」|looking for sand|すなを\s*さが|keep looking|さがしてみて/i.test(
      assistant
    )
  ) {
    return;
  }
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ch3") return;
    if (/let'?s make some glass|ガラスが必要/i.test(lastAssistantText())) return;
    const note =
      "[Teacher note — do not read aloud] STOP. Chapter 2 is done — child already said I found some sand!. " +
      "Speak EXACTLY Chapter 3 NOW: Let's make some glass! " + PART1_ELICIT_JA.ch3NeedGlass + " " +
      "Then WAIT for the 4-button tap (I need to make glass). FORBIDDEN: You found some sand / keep searching." +
      beginnerTurnHint();
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
  }, "ch3-start-loop");
}

function maybeCh1DoneLoopNudge() {
  // Banner already on Ch2 but Learny re-asked Chapter 1 sand/glass step.
  if (getCurrentSegment()?.id !== "ch2") return;
  if (!userHasNeedSandPhrase()) return;
  const assistant = lastAssistantText();
  if (
    !/to make glass in minecraft|what do we need|can you say[, ]*[\"']?i need sand|「i need sand」/i.test(
      assistant
    )
  ) {
    return;
  }
  // Don't fire on real Ch2 lines.
  if (/beach or the mountains|left or right|let me know when you find|hot outside|see around/i.test(assistant)) {
    return;
  }
  whenAssistantIdle(() => {
    const note =
      "[Teacher note — do not read aloud] STOP. Chapter 1 is already done. " +
      "Do NOT ask To make glass… what do we need? or 「すなが ひつよう」の えいごを 選んでね！ / Can you say I need sand? again. " +
      "Speak EXACTLY Chapter 2 opening NOW: " +
      CH2_PLACE_SPEAK +
      " Then WAIT." +
      beginnerTurnHint();
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
    sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
  }, "ch1-done-loop");
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
            "WRONG to ask for I put sand here again. Praise them, then Speak EXACTLY Beat 2 or next MCQ beat per cursor — ONE message, then wait." +
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

/** Mini quiz 1 cursor — do NOT count Ch1–Ch3 history as quiz answers. */
let quiz1State = { cursor: 0, answered: 0, lastAdvanceNorm: "" };

function resetQuiz1State() {
  quiz1State = { cursor: 0, answered: 0, lastAdvanceNorm: "" };
  clearShuffledChoiceCache("quiz1");
}

function getQuiz1Items() {
  const seg = getCurrentSegment();
  if (seg?.id !== "quiz1") return [];
  return seg.items || [];
}

function getCurrentQuiz1Item() {
  const items = getQuiz1Items();
  if (!items.length) return null;
  if (quiz1State.cursor >= items.length) return null;
  return items[quiz1State.cursor];
}

function quiz1ItemSpeak(item) {
  if (!item) return "";
  if (item.speak) return item.speak;
  const cue = item.promptHira || item.promptJa || "";
  return `「${cue}」は えいごで？`;
}

function buildQuiz1SpeakCoach(item = getCurrentQuiz1Item()) {
  if (!item) return "";
  if (isIntermediateVoiceOnly()) {
    return (
      "Speak EXACTLY (every mora, including the cue inside 「」): " +
      quiz1ItemSpeak(item) +
      " FORBIDDEN shortcuts: がらすが英語で without ひつよう. " +
      "Then " +
      intermediateAnswerWaitHint() +
      " Do not speak English choices aloud."
    );
  }
  return (
    "Speak EXACTLY (every mora, including the cue inside 「」): " +
    quiz1ItemSpeak(item) +
    " FORBIDDEN shortcuts: がらすが英語で without ひつよう. " +
    "Then WAIT for a 4-button tap. Do not speak English choices aloud."
  );
}

function userMatchesQuiz1Item(userText, item) {
  if (!item) return false;
  const t = String(userText || "").trim();
  if (!t) return false;
  // Prefer full answer patterns; avoid counting earlier-chapter phrases via loose history.
  if (matchesPatterns(t, item.patterns || [])) return true;
  const ans = String(item.answer || "")
    .toLowerCase()
    .replace(/[!!.]+$/g, "")
    .trim();
  const norm = t.toLowerCase().replace(/[!!.]+$/g, "").trim();
  return Boolean(ans) && (norm === ans || norm === ans.replace(/\.$/, ""));
}

function isQuiz1CompletedInState() {
  return loadLessonState().completedSegmentIds.includes("quiz1");
}

function countQuiz1ItemsAnswered() {
  if (getCurrentSegment()?.id !== "quiz1") return 0;
  return quiz1State.answered;
}

function canCompleteQuiz1Part1() {
  if (getActiveLessonId() !== "part1") return true;
  if (getCurrentSegment().id !== "quiz1") return true;
  return quiz1State.answered >= getQuiz1Items().length && getQuiz1Items().length > 0;
}

function quiz1CoachHint() {
  const seg = getCurrentSegment();
  if (seg?.id !== "quiz1") return "";
  const total = getQuiz1Items().length || 3;
  const done = quiz1State.answered;
  const cur = getCurrentQuiz1Item();
  const mode = isIntermediateVoiceOnly()
    ? "Voice-only English answers (no buttons)."
    : "4-button MCQ.";
  return (
    ` Quiz1: ${done}/${total} done. Speak Japanese ひらがな only. ${mode} ` +
    (cur ? `${buildQuiz1SpeakCoach(cur)} ` : "All 3 done — call complete_segment(quiz1) → Chapter 4. ") +
    "FORBIDDEN: すなが ひつよう quiz, oral どっち, English Which one means…, walls, color."
  );
}

function maybeAdvanceQuiz1(userText) {
  if (getCurrentSegment()?.id !== "quiz1") return false;
  const item = getCurrentQuiz1Item();
  if (!item) return false;
  if (!userMatchesQuiz1Item(userText, item)) return false;
  const norm = `${normalizeUserText(userText)}#${item.id || quiz1State.cursor}`;
  if (quiz1State.lastAdvanceNorm === norm) return false;
  quiz1State.lastAdvanceNorm = norm;
  quiz1State.answered += 1;
  quiz1State.cursor += 1;
  clearShuffledChoiceCache("quiz1");
  dbg("quiz1 advance", {
    answered: quiz1State.answered,
    cursor: quiz1State.cursor,
    just: item.answer,
  });
  return true;
}

/** After the 3rd correct answer, finish quiz1 → Chapter 4 handoff. */
function maybeCompleteQuiz1FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "quiz1") return "";
  maybeAdvanceQuiz1(userText);
  if (!canCompleteQuiz1Part1()) return "";
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok || result.alreadyDone) return "";
  dbg("quiz1 auto-complete", userText);
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

function buildQuiz1OutboundCoach(userText) {
  if (getActiveLessonId() !== "part1" || getCurrentSegment()?.id !== "quiz1") return "";
  const t = String(userText || "").trim();
  const total = getQuiz1Items().length || 3;
  const item = getCurrentQuiz1Item();

  if (!item) {
    return (
      "[Teacher note — do not read aloud] Mini quiz 1 is DONE (" +
      total +
      "/" +
      total +
      "). Call complete_segment(quiz1) NOW. " +
      "Next is Chapter 4: What's your favorite color? FORBIDDEN: more quiz items." +
      beginnerTurnHint()
    );
  }

  // maybeAdvanceQuiz1 / maybeCompleteQuiz1FromClient already ran — if we just moved on,
  // previous item matches this user text.
  const prev = getQuiz1Items()[quiz1State.cursor - 1];
  const justAdvanced = Boolean(prev) && userMatchesQuiz1Item(t, prev);

  if (justAdvanced) {
    return (
      "[Teacher note — do not read aloud] Correct answer: " +
      (prev.answer || t) +
      ". ONE short varied praise (NOT すごい again if you just used it), echo 「" +
      (prev.answer || t) +
      "」, then " +
      buildQuiz1SpeakCoach(item) +
      " FORBIDDEN: praising a different phrase, asking すなが ひつよう." +
      beginnerTurnHint()
    );
  }

  if (userMatchesQuiz1Item(t, item)) {
    // Advance was missed somehow — coach still pushes next/complete.
    return (
      "[Teacher note — do not read aloud] Correct: " +
      (item.answer || t) +
      ". Advance the quiz cursor, praise, then ask the NEXT listed speak line (or complete_segment if last)." +
      beginnerTurnHint()
    );
  }

  return (
    "[Teacher note — do not read aloud] Stay on Mini quiz 1 item " +
    (quiz1State.cursor + 1) +
    "/" +
    total +
    ". If wrong: soft おしい！もういちど — do NOT reveal the answer. Then " +
    buildQuiz1SpeakCoach(item) +
    " Correct answer is: " +
    (item.answer || "") +
    ". FORBIDDEN: skip ahead, invent questions, walls/color, oral どっち." +
    beginnerTurnHint()
  );
}

function looksLikeSkippedQuizContent(text) {
  const t = String(text || "").toLowerCase();
  return /put glass|place (?:it|the glass)|building a tank|made a tank|what color|blue dye|need a dye|i choose|found a flower|かべのいろ|いろをえら|ガラスを\s*置/i.test(
    t
  );
}

function userHasMadeGlassPhrase() {
  return recentUserMessages().some((t) => /\b(i made glass|made glass)\b/i.test(t));
}

function canFinishCh3Part1(userText = "") {
  if (!userHasNeedToMakeGlassPhrase()) return false;
  // Child must actually say I made glass — never finish on うん after Learny wrongly claimed glass is done.
  if (/\b(i made glass|made glass)\b/i.test(String(userText || ""))) return true;
  return userHasMadeGlassPhrase();
}

function buildCh3OutboundCoach(userText) {
  if (getActiveLessonId() !== "part1" || getCurrentSegment()?.id !== "ch3") return "";
  const t = String(userText || "").trim();

  if (/\b(i made glass|made glass)\b/i.test(t) || canFinishCh3Part1(t)) {
    return (
      "[Teacher note — do not read aloud] Child said I made glass! Short praise ONLY, then call complete_segment(ch3). " +
      "NEXT is Mini quiz 1 — FORBIDDEN: I put glass here, walls, color/dye, tank is ready." +
      beginnerTurnHint()
    );
  }

  if (userHasNeedToMakeGlassPhrase()) {
    const past = recentAssistantMessages(8).join("\n");
    const askedDone =
      /are you done making the glass|ガラスを作った|つくれたら\s*おしえて|できたら\s*おしえて|let me know when you(?:'re| are)? done|can you say.*i made glass|いってみて.*i made glass/i.test(
        past
      );
    return (
      "[Teacher note — do not read aloud] Chapter 3 Step 2: child already said I need to make glass — glass is NOT done yet. " +
      (askedDone
        ? "Short encourage, then speak EXACTLY again: Are you done making the glass? " + PART1_ELICIT_JA.ch3MadeGlass + " "
        : "Speak EXACTLY: Are you done making the glass? " + PART1_ELICIT_JA.ch3MadeGlass + " Then WAIT. ") +
      "Do NOT say Can you say, I made glass. " +
      "FORBIDDEN: Perfect / Now we have glass / we can make the tank / praise-only with no question. " +
      "FORBIDDEN: color, walls, Mini quiz jump until I made glass!" +
      beginnerTurnHint()
    );
  }

  return (
    "[Teacher note — do not read aloud] Chapter 3 Step 1: Speak EXACTLY: Let's make some glass! " +
    PART1_ELICIT_JA.ch3NeedGlass +
    " " +
    "Then WAIT for I need to make glass. Do NOT say Can you say, I need to make glass. " +
    "Hint furnace/bake if stuck. FORBIDDEN: claim glass is done, walls, color." +
    beginnerTurnHint()
  );
}

/**
 * Keep Mini quiz 1 from being skipped into Ch4 walls / Ch5 color.
 * Used as outbound coach on the child's turn (teacher notes are mostly disabled).
 */
function buildQuizGateOutboundCoach(userText) {
  if (getActiveLessonId() !== "part1") return "";
  const seg = getCurrentSegment()?.id;
  const t = String(userText || "").trim();
  const assistant = lastAssistantText();

  if (seg === "ch3") {
    if (canFinishCh3Part1(t)) {
      return (
        "[Teacher note — do not read aloud] Chapter 3 is done (I made glass!). " +
        "Do NOT teach I put glass here or choose a wall color. " +
        "Brief praise only if needed — Mini quiz 1 starts next (ガラスが必要 → I need glass). " +
        "FORBIDDEN: place glass, walls, dye, color." +
        beginnerTurnHint()
      );
    }
    if (looksLikeSkippedQuizContent(assistant) || /\bi put glass\b|what color/i.test(t)) {
      return (
        "[Teacher note — do not read aloud] WRONG — still Chapter 3. " +
        "Finish I made glass! then Mini quiz 1. FORBIDDEN now: I put glass here, walls, color/dye." +
        beginnerTurnHint()
      );
    }
    return "";
  }

  if (seg === "quiz1") {
    return buildQuiz1OutboundCoach(userText);
  }
  return "";
}

function maybeQuiz1SkipNudge() {
  // Post-turn teacher notes are disabled; quiz gate is enforced via outbound coaches.
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

function maybeWarmupMoodFollowUpNudge() {
  if (getCurrentSegment()?.type !== "warmup") return;
  if (countWarmupUserReplies() < 1) return;
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  if (!user.trim()) return;
  const assistant = lastAssistantText();
  // Already on the correct after-mood beat — do not re-force it (causes loops / silent audio).
  if (looksLikeWarmupAfterMoodFollowUp(assistant)) return;
  if (!shouldCoachWarmupAfterMoodFollowUp(user)) return;

  let note = "";
  if (looksLikeWrongThankYouForMood(assistant)) {
    note =
      "[Teacher note — do not read aloud] Wrong reaction: child answered HOW THEY FEEL — NOT Thank you / ありがとう. " +
      `Say EXACTLY: ${WARMUP_AFTER_MOOD_SPEAK} FORBIDDEN: Did you eat lunch yet?; two questions; tank invite.`;
  } else if (looksLikeWarmupWrongAfterMoodFollowUp(assistant)) {
    note =
      "[Teacher note — do not read aloud] WRONG follow-up after How are you. Child said \"" +
      user.slice(0, 40) +
      "\" (mood/feeling). " +
      `Say EXACTLY: ${WARMUP_AFTER_MOOD_SPEAK} FORBIDDEN: Did you eat lunch yet? / Are you hungry? / What kind of games…; two questions; tank invite.`;
  } else return;

  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  whenAssistantIdle(() => {
    if (countWarmupUserReplies() < 1) return;
    if (looksLikeWarmupAfterMoodFollowUp(lastAssistantText())) return;
    sendTeacherNote(
      "warmup-mood-followup",
      withBeginnerSpeakRule(formatTeacherNote(note + beginnerTurnHint()))
    );
  }, "warmup-mood-followup");
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
      return "WRONG phrase for Chapter 1. Child said I put glass here — that is later. Redirect ONCE: Nice try! 「がらすが ひつよう」の えいごを 選んでね！ FORBIDDEN: ask put-glass again.";
    }
    if (glassCtx) {
      if (postTurn) {
        if (looksLikeCh1WrongThankYou(assistant, user)) {
          return "No Thank you — praise ガラス, then 「がらすが ひつよう」の えいごを 選んでね！ ONCE, then wait.";
        }
        if (
          looksLikeCh1WrongGlassQuestion(assistant) ||
          looksLikeCh1PrematureSand(assistant) ||
          (/that'?s right/i.test(assistant) &&
            !/\b(i need glass|can you say it in english|がらすが\s*ひつよう|ガラスが必要)/i.test(assistant))
        ) {
          return "After ガラス: ONE message — praise, then 「がらすが ひつよう」の えいごを 選んでね！ ONCE. Do NOT say Can you say, I need glass. FORBIDDEN: I put glass here, 置きたい, sand, making-glass question.";
        }
        if (
          /\bcan you say it in english|がらすが\s*ひつよう|ガラスが必要|「I need glass」|can you say.*i need glass/i.test(
            assistant
          ) &&
          !assistantDoubledTeachPhrase(assistant)
        ) {
          return "";
        }
      } else {
        return "Child said ガラス/glass (Step 1). Speak ONE short reply out loud now: praise + Can you say it in English? / 「がらすが ひつよう」の えいごを 選んでね！ Say each part ONCE — do NOT say the English answer I need glass aloud. NEVER I put glass here / 置きたい.";
      }
    } else if (userSaidCh1Confused(user)) {
      return postTurn
        ? "Child confused — clarify tank needs glass, then 「がらすが ひつよう」の えいごを 選んでね！ ONCE. No sand yet. No I put glass here."
        : "Child confused at Step 1 — ONE short clarify + 「がらすが ひつよう」の えいごを 選んでね！ ONCE. No sand. No I put glass here.";
    }
  } else if (!userHasNeedSandPhrase()) {
    if (/\bi need glass\b/i.test(user) || /\bneed glass\b/i.test(user)) {
      return (
        "Child already said I need glass. Acknowledge that FIRST (e.g. That's right! / せいかい！). " +
        "Then Step 2 ONLY: To make glass in Minecraft, what do we need? (English then ひらがな). WAIT for sand. " +
        "FORBIDDEN: Did you find the glass? / Have you found glass? / searching for glass; " +
        "ask がらすが ひつよう / I need glass again."
      );
    }
    if (postTurn && looksLikeCh1WrongFindGlass(assistant)) {
      return (
        "WRONG: Do NOT ask Did you find the glass? Child already said I need glass. " +
        "Redo: short praise, then To make glass in Minecraft, what do we need? WAIT for sand."
      );
    }
    if (userSaidSandAnswer(user)) {
      return "Child said sand — praise, then 「すなが ひつよう」の えいごを 選んでね！ ONCE. Do NOT say Can you say, I need sand. Wait after.";
    }
    if (userSaidCh1Confused(user)) {
      return "Step 2 confused — ONE line: glass needs sand in Minecraft, ask what we need, then 「すなが ひつよう」の えいごを 選んでね！ Do NOT explain sand twice.";
    }
    if (postTurn && assistantCh1SandMonologue(assistant)) {
      return "You explained sand twice — ask To make glass in Minecraft what do we need? ONCE, then wait.";
    }
  } else {
    // Both I need glass + I need sand are done — leave Chapter 1.
    return (
      "Chapter 1 DONE (I need glass + I need sand). Short praise only. " +
      "Call complete_segment(ch1) NOW. Next is Chapter 2 — speak: Let's go find some sand! Do you want to go to the beach or the mountains? " +
      "FORBIDDEN: ask To make glass in Minecraft what do we need? again, or すなが ひつよう / Can you say I need sand? again."
    );
  }
  return "";
}

/** Ch1 coach is injected on the child's outbound turn — not as a late pre-reply note. */
function maybeCh1CoachOnUserTurn(_userText, { fromVoice: _fromVoice = false } = {}) {
  // no-op: buildCh1OutboundCoach rides with buildChildOutbound (typed + voice).
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

function looksLikeCh1WrongFindGlass(text) {
  return /\b(did you find|have you found|find(ing)?)\b.{0,20}\bglass\b|がらすは\s*みつか|ガラス.*(みつか|みつけ)/i.test(
    String(text || "")
  );
}

function looksLikeCh1WrongGlassQuestion(text) {
  const t = String(text || "");
  if (looksLikeCh1WrongFindGlass(t)) return true;
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
      "Still CHAPTER 1. Do NOT sand-search yet. " +
      (userHasNeedGlassPhrase()
        ? "Elicit I need sand, then wait. After both phrases, Chapter 2 begins."
        : "Finish glass step first (I need glass), then I need sand. FORBIDDEN: Have you found sand / beach search.")
    );
  }

  if (userHasNeedGlassPhrase() && !userHasNeedSandPhrase() && looksLikeCh1WrongFindGlass(assistant)) {
    return (
      "WRONG last line: Did you find the glass? Child already said I need glass. " +
      "Acknowledge, then ask To make glass in Minecraft, what do we need? WAIT for sand."
    );
  }

  if (!userHasNeedGlassPhrase() || /\b(i need glass|need glass)\b/i.test(user)) {
    if (looksLikeCh1PutGlassPhrase(user) || looksLikeCh1WrongGlassQuestion(assistant)) {
      if (!/\b(i need glass|need glass)\b/i.test(user)) {
        return (
          "Chapter 1 ONLY. WRONG: I put glass here / ガラスを置きたい. " +
          "Praise briefly, then 「がらすが ひつよう」の えいごを 選んでね！ WAIT. " +
          "FORBIDDEN: speak I need glass aloud; sand; Step 2."
        );
      }
    }
  }

  const note = buildCh1CoachNote(user, { postTurn: false });
  if (!note) return "";
  return note;
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
        " Ch1 Step 1b: child said glass/ガラス — praise then Can you say it in English? / 「がらすが ひつよう」の えいごを 選んでね！ " +
        "Do NOT speak the English answer. FORBIDDEN: Can you say, I need glass?, \"What do you need to make glass?\", sand, Step 2."
      );
    }
    return (
      ' Ch1 Step 1 ONLY: ask "What do I need to make a tank? Something transparent and hard." ' +
      "Do NOT elicit がらすが ひつよう / I need glass yet unless they already said glass."
    );
  }
  if (!userHasNeedSandPhrase()) {
    return (
      ' Ch1 Step 2: ask "To make glass in Minecraft, what do we need?" → sand → 「すなが ひつよう」の えいごを 選んでね！ ' +
      "FORBIDDEN: Did you find the glass? / Can you say, I need sand."
    );
  }
  return (
    " Ch1 DONE — complete_segment(ch1). Next Chapter 2: Let's go find some sand! beach or mountains? " +
    "FORBIDDEN: repeat To make glass… what do we need? / I need sand."
  );
}

function looksLikeCh2ShortAck(text) {
  const t = String(text || "").trim();
  return /^(うん+|ん+|はい|ええ|ok+|okay|yes|yeah|yep|sure|ね|うんうん)$/i.test(t);
}

function ch2CoachHint() {
  if (!isCh2SandSearchContext()) return "";
  if (ch2Search.phase === "done") return "";
  if (looksLikeFoundSand(lastPendingUserText || recentUserMessages(1)[0] || "") === "found") {
    return " Ch2: Child found sand — speak: We found some sand! Can you say it in English? " + PART1_ELICIT_JA.foundSand + " Do NOT say Can you say, I found some sand.";
  }
  return ` Ch2 script next: ${ch2NextScriptSpeak()} ${ch2AntiRepeatRule()}`;
}

function onCh2AssistantText(text) {
  if (!isCh2SandSearchContext()) {
    if (getCurrentSegment()?.id !== "ch2") resetCh2Search();
    return;
  }
  const prevPhase = ch2Search.phase;
  if (FORBIDDEN_EVERYDAY_RE.test(text)) {
    whenAssistantIdle(() => {
      sendTeacherNote(
        `ch2-no-tired-${normalizeUserText(text).slice(0, 24)}`,
        "[Teacher note — do not read aloud] NEVER ask Are you tired? / Can you hear the waves? " +
          "Ask the scripted next line NOW: " +
          ch2NextScriptSpeak() +
          "." +
          beginnerTurnHint()
      );
    }, "ch2-no-tired");
  }
  if (assistantAskedPlaceQuestion(text) && (ch2Search.phase === "place" || ch2Search.phase === "idle")) {
    ch2Search.phase = "place";
  }
  if (assistantAskedDirectionQuestion(text) && ch2Search.phase !== "chat" && ch2Search.phase !== "waiting") {
    ch2Search.phase = "direction";
  }
  if (ch2AssistantSaidFoundElicit(text)) {
    ch2PendingElicitForce = false;
    ensureCh2FoundSandMcqReady();
    renderChoiceBar(getCurrentSegment());
  } else if (/let me know when you find|みつけたら.*おしえ|すなを.*みつけたら/i.test(text)) {
    // Legacy line — treat as ready for elicit after free talk.
    if (ch2SeeWasAsked()) ch2Search.phase = "checking";
    else ch2Search.phase = "waiting";
  } else if (assistantAskedEverydayQuestion(text)) {
    rememberCh2EverydayFromAssistant(text);
    if (ch2Search.phase === "place" || ch2Search.phase === "idle" || ch2Search.phase === "direction") {
      ch2Search.phase = "chat";
    }
  }
  if (prevPhase !== ch2Search.phase) {
    persistCh2SearchState();
    renderChoiceBar(getCurrentSegment());
  }
}

/** Client tracks Ch2 scripted beats so coaches stay on order. */
function handleCh2SearchProgress(userText) {
  if (!isCh2SandSearchContext()) {
    if (getCurrentSegment()?.id !== "ch2") resetCh2Search();
    return;
  }

  const prevPhase = ch2Search.phase;
  const assistant = lastAssistantText();
  const found = looksLikeFoundSand(userText);
  let armedElicitForce = false;

  // After beat 4 is on screen, ANY child reply advances to beat 5 elicit — do not wait for "I found sand".
  if (
    (ch2Search.phase === "chat" || ch2Search.phase === "waiting") &&
    (ch2LastAssistantWasSeeQuestion(assistant) || (ch2SeeWasAsked() && ch2HotWasAnswered() && !ch2AssistantSaidFoundElicit(assistant))) &&
    String(userText || "").trim() &&
    !looksLikeDirectionPick(userText) &&
    !looksLikePlacePick(userText)
  ) {
    // Prefer: last line was the see question. Also: see already asked and still not on elicit.
    if (ch2LastAssistantWasSeeQuestion(assistant) || detectCh2EverydayKey(assistant) === "see") {
      rememberCh2EverydayFromAssistant(assistant);
      rememberCh2EverydayAnswered(assistant);
      ch2Search.phase = "checking";
      armedElicitForce = true;
    } else if (ch2SeeWasAsked() && ch2HotWasAnswered() && ch2HotWasAsked() && ch2Search.phase === "chat") {
      // See was asked earlier; child replied to a keep-looking loop — still jump to elicit.
      rememberCh2EverydayAnswered(assistant);
      ch2Search.phase = "checking";
      armedElicitForce = true;
    }
  }

  if (found === "phrase" && (ch2FreeTalkFinished() || ch2Search.phase === "checking")) {
    ch2Search.phase = "done";
  } else if (found === "found" && (ch2FreeTalkFinished() || ch2SeeWasAsked())) {
    ch2Search.phase = "checking";
    if (!ch2AssistantSaidFoundElicit()) armedElicitForce = true;
  } else if (found === "phrase" || found === "found") {
    // Said found too early (before see) — stay on free-talk script.
    if (ch2Search.phase === "place" || ch2Search.phase === "idle" || ch2Search.phase === "direction") {
      // ignore
    } else if (!ch2SeeWasAsked()) {
      ch2Search.phase = "chat";
    }
  } else if (ch2Search.phase === "place" || ch2Search.phase === "idle") {
    const shortAck = looksLikeCh2ShortAck(userText);
    syncCh2PhaseFromChat();
    if (looksLikePlacePick(userText) || (assistantAskedPlaceQuestion(assistant) && userText)) {
      ch2Search.phase = "direction";
    }
  } else if (ch2Search.phase === "direction") {
    const shortAck = looksLikeCh2ShortAck(userText);
    if (
      looksLikeDirectionPick(userText) ||
      (assistantAskedDirectionQuestion(assistant) && userText) ||
      (shortAck && assistantAskedDirectionQuestion(assistant))
    ) {
      ch2Search.phase = "chat";
      ch2Search.rallies = 0;
    }
  } else if (ch2Search.phase === "chat" && !armedElicitForce) {
    syncCh2PhaseFromChat();
    rememberCh2EverydayAnswered(assistant);
    if (ch2LastAssistantWasSeeQuestion(assistant) || detectCh2EverydayKey(assistant) === "see") {
      rememberCh2EverydayFromAssistant(assistant);
      ch2Search.rallies += 1;
      ch2Search.phase = "checking";
      armedElicitForce = true;
    } else if (assistantAskedEverydayQuestion(assistant)) {
      rememberCh2EverydayFromAssistant(assistant);
      const lastKey = detectCh2EverydayKey(assistant);
      ch2Search.rallies += 1;
      dbg("ch2 rally", {
        rallies: ch2Search.rallies,
        last: lastKey || ch2Search.lastEverydayKey,
        user: String(userText || "").slice(0, 24),
      });
      // Only advance to elicit after see was asked AND this reply answered it.
      if (lastKey === "see" || (ch2SeeWasAsked() && ch2SeeWasAnswered() && ch2ChatBeatsAsked())) {
        ch2Search.phase = "checking";
        armedElicitForce = true;
      }
    } else {
      dbg("ch2 rally skipped; no chat question yet", userText.slice(0, 24));
    }
  }

  syncCh2McqCursorFromPhase();
  if (prevPhase !== ch2Search.phase) {
    persistCh2SearchState();
    renderChoiceBar(getCurrentSegment());
  }
  if (armedElicitForce && ch2Search.phase === "checking") {
    ch2PendingElicitForce = true;
  }
}

let lastPendingUserText = "";

function isQuizSpeakSegment() {
  const seg = getCurrentSegment();
  return seg?.type === "quiz" || seg?.id === "quiz1";
}

const RECENT_PRAISE_CHECKS = [
  { re: /すごい/i, label: "すごい" },
  { re: /that'?s right/i, label: "That's right" },
  { re: /せいかい/i, label: "せいかい" },
  { re: /そうだね/i, label: "そうだね" },
  { re: /\bnice!?\b/i, label: "Nice" },
  { re: /\bgreat!?\b/i, label: "Great" },
  { re: /よくでき/i, label: "よくできた" },
  { re: /ばっちり/i, label: "ばっちり" },
  { re: /いいね/i, label: "いいね" },
  { re: /\bperfect\b/i, label: "Perfect" },
  { re: /awesome/i, label: "Awesome" },
];

function praiseVariationHint() {
  const recent = recentAssistantMessages(8).join("\n");
  const used = RECENT_PRAISE_CHECKS.filter(({ re }) => re.test(recent)).map(({ label }) => label);
  if (!used.length) {
    return " PRAISE: use fresh words — do not default to すごい or That's right every turn.";
  }
  return (
    " PRAISE: do NOT repeat " +
    used.slice(0, 5).join(", ") +
    " (used recently). Pick a different short praise: Great job / Nice one / Yes! / やったね / ばっちり / You got it / そのとおり."
  );
}

function beginnerTurnHint() {
  const praise = praiseVariationHint();
  if (LEVEL_INFO.id !== "beginner") return praise;
  if (isQuizSpeakSegment()) {
    return praise + " QUIZ: speak Japanese ひらがな only for the question; child answers in English.";
  }
  return (
    praise +
    " BEGINNER: FULL English sentence, then FULL matching ひらがな in the SAME turn — " +
    "never English-only, never Japanese-only after a short English tag, never いってみて alone."
  );
}

/** Short rule prepended to the child's outbound so every Live reply stays EN→JP. */
function beginnerOutboundSpeakRule() {
  if (LEVEL_INFO.id !== "beginner") return "";
  if (isQuizSpeakSegment()) {
    return "[QUIZ] Speak Japanese ひらがな only. Ask the cue + は えいごで？ Then WAIT.";
  }
  return "[BEGINNER] Reply out loud NOW: full English, then matching ひらがな. One short turn. React to the child's line.";
}

function withBeginnerSpeakRule(outbound) {
  const rule = beginnerOutboundSpeakRule();
  if (!rule) return outbound;
  const body = String(outbound || "").trim();
  if (!body) return rule;
  if (/^\[(BEGINNER|QUIZ|ENDING)\]/i.test(body) || /BEGINNER — mandatory|QUIZ — mandatory/i.test(body)) {
    return body;
  }
  return `${rule}\n\n${body}`;
}

/**
 * Ending Turn A/C are long fixed scripts. The normal beginner "One short turn" rule
 * made Gemini cut off mid-sentence (e.g. at どんなおさかなを) and then restart.
 */
function withEndingExactSpeakRule(outbound) {
  const body = String(outbound || "").trim();
  if (!body) return body;
  if (/^\[ENDING\]/i.test(body)) return body;
  return (
    "[ENDING] Speak the EXACT script below ONCE in full — every English line and every ひらがな line. " +
    "Do NOT shorten, summarize, skip, or repeat. Then WAIT for the child.\n\n" +
    body
  );
}

/**
 * Child answer first — long coach-before-child prompts made Live slow and caused
 * Learny to ignore what the child actually said.
 */
function buildChildOutbound(childText, coachNote = "", { maxCoach = 420 } = {}) {
  const child = String(childText || "").trim();
  const coach = adaptTeacherNoteForLevel(String(coachNote || ""))
    .replace(/^\[Teacher note[^\]]*\]\s*/i, "")
    .replace(/^\[HIDDEN coach[^\]]*\]\s*/i, "")
    .trim();
  const parts = [];
  if (child) {
    parts.push(`Child said: "${child}"`);
    parts.push("Acknowledge that answer first, then continue with ONE short next beat.");
  }
  if (coach) {
    const limit = Math.max(120, Number(maxCoach) || 420);
    parts.push(`[Coach — do not read aloud] ${coach.slice(0, limit)}`);
  }
  return parts.join("\n");
}

/** Clear stale playback markers so reply-watch does not think Learny already answered. */
function prepareForUserOutbound() {
  closeOpenAudioTurn();
  try {
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  lastAssistantAudioAt = 0;
}

/**
 * Send child-first outbound and arm reply-watch (MCQ used to skip the watch → stuck forever).
 */
function dispatchChildTurn(childText, coachNote = "", { armWatch = true } = {}) {
  const outbound = buildChildOutbound(childText, coachNote);
  if (!outbound.trim()) return false;
  prepareForUserOutbound();
  const send = () => {
    if (actionState !== "active" || !client?.connected) return false;
    const ok = Boolean(sendClientText(withBeginnerSpeakRule(outbound), { force: true }));
    userTurnSentViaClientText = ok;
    if (armWatch && ok) {
      lastPendingUserText = String(childText || "").trim();
      lastUserTurnAt = Date.now();
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      armPendingReplyWatch(lastPendingUserText, 0, { fromVoice: false });
    }
    return ok;
  };
  // If Learny still has audio draining, wait so Live accepts the new turn.
  if (assistantIsSpeaking()) {
    whenAssistantIdle(() => {
      send();
    }, "child-turn");
    // Optimistically arm watch so a dropped send still gets one nudge.
    if (armWatch) {
      lastPendingUserText = String(childText || "").trim();
      lastUserTurnAt = Date.now();
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      userTurnSentViaClientText = false;
      armPendingReplyWatch(lastPendingUserText, 0, { fromVoice: false });
    }
    return true;
  }
  return send();
}

function assistantHasBeginnerJapanese(text) {
  return /[\u3040-\u309F]/.test(String(text || ""));
}

function assistantHasValidPhraseElicit(text) {
  const t = String(text || "");
  if (/「[^」]+」の\s*えいごを\s*選んで(?:ね)?/.test(t)) return true;
  // Legacy forms (older sessions / model drift)
  if (/「[^」]+」(?:って|と)\s*(?:英語|えいご)で\s*(?:言ってみて|いってみて)/.test(t)) return true;
  if (/あ[！!]\s*(?:砂あった|すな\s*あった)/.test(t)) return true;
  return false;
}

function assistantBeginnerJapaneseIncomplete(text) {
  if (LEVEL_INFO.id !== "beginner") return false;
  if (isQuizSpeakSegment()) return false;
  const t = String(text || "").trim();
  if (!t || !assistantHasBeginnerJapanese(t)) return false;
  if (assistantHasValidPhraseElicit(t)) return false;

  if (/sorry|apolog|ごめん|まえは.*やく|もう一度/i.test(t)) return false;

  // Complete bilingual beat ending in Japanese — do not force a repair turn
  // (those repairs often produced choppy / broken-sounding Japanese fragments).
  if (/[\u3040-\u309F]{6,}[^a-zA-Z]*[。！？!?ね]$/.test(t)) return false;
  if (/[\u3040-\u309F].*[？?！!]$/.test(t) && (t.match(/[\u3040-\u309F]/g) || []).length >= 8) {
    return false;
  }

  const withoutQuotedLatin = t
    .replace(/「[^」]*」/g, "")
    .replace(/'[^']*'/g, "")
    .replace(/"[^"]*"/g, "");
  const hiraganaChars = (t.match(/[\u3040-\u309F]/g) || []).length;
  const latinChars = (withoutQuotedLatin.match(/[a-zA-Z]/g) || []).length;
  if (latinChars < 15) return false;

  if (/の\s*えいごを\s*選んで|っていってみて|っていってみる|(?:って|と)(?:英語|えいご)で(?:言ってみて|いってみて)|いってみて！|言ってみて！|おしえてね/.test(t) && hiraganaChars >= 6) {
    return false;
  }

  const jpOnly = t.replace(/[^\u3040-\u309F]/g, "");
  if (
    hiraganaChars <= 10 &&
    /^(いってみて|っていってみて|きいてみて|さあ|よし|ね|かな|そうだね|いいね|ばっちり|ぱっちり|すごいね|いいよ)[！!？?]*$/.test(jpOnly)
  ) {
    return true;
  }

  if (latinChars >= 30 && hiraganaChars < latinChars * 0.35) return true;
  if (latinChars >= 50 && hiraganaChars < 18) return true;

  return false;
}

function assistantBeginnerEnglishIncomplete(text) {
  if (LEVEL_INFO.id !== "beginner") return false;
  if (isQuizSpeakSegment()) return false;
  const t = String(text || "").trim();
  if (!t || !assistantHasBeginnerJapanese(t)) return false;

  const withoutQuotedLatin = t
    .replace(/「[^」]*」/g, "")
    .replace(/'[^']*'/g, "")
    .replace(/"[^"]*"/g, "");
  const hiraganaChars = (t.match(/[\u3040-\u309F]/g) || []).length;
  const latinChars = (withoutQuotedLatin.match(/[a-zA-Z]/g) || []).length;
  if (hiraganaChars < 28) return false;

  // Short English praise + long Japanese idea (e.g. That's great! + Japanese tank invite only).
  if (
    /^(that'?s great|nice|good|cool|okay|perfect|great|awesome|glad to hear)[!！.。\s]*[\u3040-\u309F]/i.test(t) &&
    hiraganaChars >= 28 &&
    latinChars < 55
  ) {
    return true;
  }

  // Lots of Japanese vs little English — likely missing full English sentences.
  if (latinChars < 40 && hiraganaChars >= 40) return true;
  if (latinChars < hiraganaChars * 0.45 && hiraganaChars >= 36) return true;

  return false;
}

function countHowAreYouAsks(text) {
  return [...String(text || "").matchAll(/\bhow are you\b/gi)].length;
}

function assistantDoubledHowAreYou(text) {
  return countHowAreYouAsks(text) >= 2;
}

function trimDuplicateHowAreYou(text) {
  let t = String(text || "").trim();
  if (!assistantDoubledHowAreYou(t)) return t;
  const matches = [...t.matchAll(/\bhow are you\b/gi)];
  if (matches.length < 2) return t;
  const secondAt = matches[1].index;
  // Prefer cutting before the second English greeting ("Hello there! How are you…").
  const before = t.slice(0, secondAt);
  const helloThere = before.search(/\bhello there\b/i);
  const cutAt = helloThere >= 0 ? helloThere : secondAt;
  const trimmed = t.slice(0, cutAt).trim();
  // Keep through the first Japanese pair if we already have it.
  if (/[\u3040-\u309F]/.test(trimmed) && /[？?]/.test(trimmed)) return trimmed;
  return trimDuplicateStackedQuestions(t);
}

function maybeBeginnerJapaneseNudge() {
  if (LEVEL_INFO.id !== "beginner") return;
  // Quiz is Japanese-only by design — do not force English-then-Japanese repair.
  if (isQuizSpeakSegment()) return;
  // Ending Turn A is a long bilingual script — repair nudges caused a second Perfect!
  if (getCurrentSegment()?.id === "ending1") return;
  if (!assistantTranscriptSettled()) return;
  const text = lastAssistantText().trim();
  if (!text || assistantHasValidPhraseElicit(text)) return;

  const missingJp = !assistantHasBeginnerJapanese(text) || assistantBeginnerJapaneseIncomplete(text);
  const missingEn = assistantBeginnerEnglishIncomplete(text);
  const doubledHow = assistantDoubledHowAreYou(text);
  if (!missingJp && !missingEn && !doubledHow) return;

  const key = `beginner-jp-${normalizeUserText(text).slice(0, 48) || "turn"}`;
  whenAssistantIdle(() => {
    if (LEVEL_INFO.id !== "beginner" || isQuizSpeakSegment()) return;
    if (!assistantTranscriptSettled()) return;
    const latest = lastAssistantText().trim();
    if (assistantHasValidPhraseElicit(latest)) return;
    const stillMissingJp =
      !assistantHasBeginnerJapanese(latest) || assistantBeginnerJapaneseIncomplete(latest);
    const stillMissingEn = assistantBeginnerEnglishIncomplete(latest);
    const stillDoubled = assistantDoubledHowAreYou(latest);
    if (!stillMissingJp && !stillMissingEn && !stillDoubled) return;

    let note =
      "[Teacher note — do not read aloud] BEGINNER CRITICAL: repair your last turn. ";
    if (stillDoubled) {
      note +=
        "You said How are you TWICE — do NOT speak again with another greeting. WAIT for the child. ";
    } else if (stillMissingEn) {
      note +=
        "You spoke long Japanese without matching FULL English. NOW speak the missing English for that same idea, then matching ひらがな if needed. " +
        "Do NOT ask a new question. Then WAIT. ";
    } else {
      note +=
        "Your last spoken turn was English-only or missing full ひらがな. " +
        "NOW speak the Japanese ひらがな that matches the SAME meaning as what you just said. " +
        "Do NOT apologize or say you forgot Japanese. Do NOT repeat a long English recap or the same 「」 elicit again — short English OK only if needed, then the full ひらがな. Then WAIT.";
    }
    sendTeacherNote(key, note);
  }, "beginner-jp");
}

function notifyParentProgress() {
  try {
    window.parent.postMessage({ type: "gc_quest_progress_update" }, "*");
  } catch {
    // ignore
  }
}

function notifyMcqActivity(event) {
  if (!event) return;
  try {
    window.parent.postMessage({ type: "gc_activity_event", event }, "*");
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent("learny-activity", { detail: event }));
  } catch {
    // ignore
  }
}

function ch2FreeTalkFinished() {
  syncCh2PhaseFromChat();
  // Finished only after the child answered beat 4 (phase flips to checking).
  return (
    ch2Search.phase === "waiting" ||
    ch2Search.phase === "checking" ||
    ch2Search.phase === "done"
  );
}

function mcqUnlockFlags(segment) {
  const state = loadLessonState();
  const freeAsk =
    segment?.id === "ch4"
      ? Boolean(state.memories?.favoriteColor) && ch4AssistantSaidBeatB()
      : Boolean(state.memories?.favoriteColor);
  // Unlock found-sand MCQ only after free-talk beats 3–4 (hot / see), never from Ch1 "sand".
  const pending = looksLikeFoundSand(lastPendingUserText || "");
  const elicitSpoken = ch2AssistantSaidFoundElicit() || ch2ResumeElicitUnlocked();
  const freeTalk =
    elicitSpoken ||
    ch2Search.phase === "waiting" ||
    (ch2FreeTalkFinished() && (pending === "found" || pending === "phrase"));
  return { freeAsk, freeTalk };
}

/** Ch2 free-talk window: after left/right MCQ until found-sand elicit. */
function isCh2FreeTalkUi() {
  if (getCurrentSegment()?.id !== "ch2") return false;
  syncCh2PhaseFromChat();
  if (ch2AssistantSaidFoundElicit() || ch2ResumeElicitUnlocked()) return false;
  const p = ch2Search.phase || "place";
  // Hide buttons during hot/see only — show again for found-sand elicit.
  return p === "chat";
}

/** Ch4: hide MCQ until combined make+tell (Beat A2+B) is spoken. */
function isCh4FreeTalkUi() {
  if (getCurrentSegment()?.id !== "ch4") return false;
  return !ch4AssistantSaidBeatB();
}

/** True while tap-choice MCQ / quiz buttons are on screen (mic must stay off). */
function isMcqChoiceUiActive(segment = getCurrentSegment()) {
  // Intermediate is voice-only — never lock the mic for choice buttons.
  if (isIntermediateVoiceOnly()) return false;
  if (
    actionState !== "active" ||
    chapterTransitionActive ||
    isHandoffRunning ||
    isChapterHandoff ||
    skipOutboundForHandoff
  ) {
    return false;
  }
  if (isCh2FreeTalkUi() || isCh4FreeTalkUi()) return false;

  if (segment?.id === "quiz1") {
    return Boolean(getCurrentQuiz1Item());
  }

  if (segment?.id === "final1" && segment?.input === "speak_or_click") {
    if (!assistantAskedFinal1QuizQuestion(lastAssistantText())) return false;
    const displayed = getDisplayedFinal1Item();
    const item = displayed?.item || getCurrentFinal1Item();
    return Boolean(item);
  }

  const unlocked = mcqUnlockFlags(segment);
  const cur = getCurrentMcqBeat(segment, { unlocked });
  return Boolean(cur?.beat);
}

/** Remember mute preference across free-talk ↔ MCQ so we don't force-unmute forever. */
let micMutedBeforeMcq = null;

function forceMicMutedForMcq() {
  isMuted = true;
  try {
    audioStreamer?.setMuted?.(true);
    closeOpenAudioTurn();
    audioStreamer?.pauseStreaming?.();
  } catch {
    // ignore
  }
  audioStreaming = false;
}

async function restoreMicAfterMcqIfNeeded() {
  if (micMutedBeforeMcq === null) return;
  const wantUnmute = micMutedBeforeMcq === false;
  micMutedBeforeMcq = null;
  if (!wantUnmute) return;
  if (actionState !== "active" || !audioStreamer || isMcqChoiceUiActive()) return;
  isMuted = false;
  try {
    audioStreamer.setMuted(false);
    await audioStreamer.ensureStreaming();
    audioStreamer.resumeStreaming();
    audioStreaming = true;
  } catch {
    isMuted = true;
    audioStreaming = false;
  }
  updateActionUI();
}

function paintMuteButton() {
  if (!btnMute) return;
  const callLive = actionState === "active";
  const handoffBusy = isHandoffRunning || isChapterHandoff || chapterTransitionActive;
  const mcqLocksMic = callLive && isMcqChoiceUiActive();
  btnMute.classList.add("visible");
  btnMute.disabled = !callLive || handoffBusy || mcqLocksMic;
  btnMute.classList.toggle("muted", (isMuted || mcqLocksMic) && callLive);
  btnMute.innerHTML = (isMuted || mcqLocksMic) && callLive ? ICON_MIC_OFF : ICON_MIC;
  btnMute.title = !callLive
    ? isIntermediateVoiceOnly()
      ? "はじめるとマイクはオフのまま（こえで こたえるよ）"
      : "はじめるとマイクはオフのまま（ボタンで答えよう）"
    : mcqLocksMic
      ? "4択のときはマイクオフ（ボタンで答えよう）"
      : isMuted
        ? "マイクオフ（タップでオン）"
        : "タップでマイクをオフ";
  btnMute.setAttribute(
    "aria-label",
    !callLive || mcqLocksMic || isMuted ? "マイクオフ" : "マイクオン"
  );
}

/** Mute + lock mic whenever MCQ buttons are showing; restore prior mute when they hide. */
function syncMicForMcqMode() {
  const mcqOn = isMcqChoiceUiActive();
  if (mcqOn) {
    if (micMutedBeforeMcq === null) micMutedBeforeMcq = isMuted;
    if (!isMuted || audioStreaming) forceMicMutedForMcq();
    paintMuteButton();
    return;
  }
  if (micMutedBeforeMcq !== null) {
    void restoreMicAfterMcqIfNeeded();
  } else {
    paintMuteButton();
  }
}

function refreshChoiceBarIfNeeded() {
  renderChoiceBar(getCurrentSegment());
}

function resolveMcqChoices(beat) {
  if (!beat) return [];
  const color = loadLessonState().memories?.favoriteColor || "orange";
  const labels = (beat.choices || []).slice(0, 4).map((c) =>
    formatChoiceLabel(expandMcqColorPlaceholders(String(c), color))
  );
  const segmentId = getCurrentSegment()?.id || "mcq";
  const beatKey = beat.id || `beat-${loadMcqCursor(segmentId)}`;
  return getShuffledChoiceLabels(`${segmentId}:${beatKey}`, labels);
}

function resolveMcqAnswer(beat) {
  if (!beat) return "";
  const color = loadLessonState().memories?.favoriteColor || "orange";
  return formatChoiceLabel(expandMcqColorPlaceholders(String(beat.answer || ""), color));
}

function buildMcqSpeakCoach(beat) {
  if (!beat) return "";
  const color = loadLessonState().memories?.favoriteColor || "orange";
  const en = expandMcqColorPlaceholders(String(beat.learnyEn || ""), color);
  const ja = elicitJaForActiveLevel(
    expandMcqColorPlaceholders(String(beat.learnyJa || ""), color)
  );
  if (isIntermediateVoiceOnly()) {
    return (
      "Speak EXACTLY: " +
      en +
      " " +
      ja +
      " Then " +
      intermediateAnswerWaitHint() +
      " Do not reveal the answer. Do not list multiple-choice options aloud."
    );
  }
  const choices = resolveMcqChoices(beat).join(" / ");
  return (
    "Speak EXACTLY: " +
    en +
    " " +
    ja +
    " Then WAIT for a 4-button tap (" +
    choices +
    "). Do not reveal the answer."
  );
}

const MCQ_RETRY_PATTERNS = [
  {
    title: "おしい！ちがうよ — もういちど！",
    speak: "Nice try! Not quite — try again! おしい！ちがうよ。もういちど！",
  },
  {
    title: "ざんねん！もういっかい！",
    speak: "Almost! Give it another go! ざんねん！もう いっかい チャレンジしてね！",
  },
  {
    title: "ちがうみたい — もういちど！",
    speak: "Hmm, not that one. Try again! ん〜、ちがうみたい。もういちど えらんでね！",
  },
  {
    title: "おしい！つぎいこう！",
    speak: "So close! One more try! おしい！もう すこし！もういちど！",
  },
  {
    title: "いいちょうせん！もういちど！",
    speak: "Good try! Let's pick again! いい ちょうせんだよ！もういちど えらぼう！",
  },
  {
    title: "おっと！もういっかい！",
    speak: "Oops! Try a different one! おっと！べつの のを ためしてみて！",
  },
];

let mcqRetryPatternIndex = -1;

function pickMcqRetryPattern() {
  if (MCQ_RETRY_PATTERNS.length < 2) return MCQ_RETRY_PATTERNS[0];
  let next = Math.floor(Math.random() * MCQ_RETRY_PATTERNS.length);
  // Avoid saying the exact same retry line twice in a row.
  if (next === mcqRetryPatternIndex) {
    next = (next + 1) % MCQ_RETRY_PATTERNS.length;
  }
  mcqRetryPatternIndex = next;
  return MCQ_RETRY_PATTERNS[next];
}

/** @deprecated Prefer pickMcqRetryPattern(); kept as first-pattern aliases. */
const MCQ_RETRY_TITLE = MCQ_RETRY_PATTERNS[0].title;
const MCQ_RETRY_SPEAK = MCQ_RETRY_PATTERNS[0].speak;

function buildMcqWrongRetryCoach(reaskCoach = "") {
  const pattern = pickMcqRetryPattern();
  return (
    "[Teacher note — do not read aloud] Wrong MCQ choice. " +
    "Speak EXACTLY this soft retry (EN then JP), then re-ask the SAME question. " +
    "Do NOT reveal the correct answer. Do NOT advance. " +
    "Say: " +
    pattern.speak +
    (reaskCoach ? " Then: " + reaskCoach : "")
  );
}

/** Instant UI + soft sound so kids know the tap was wrong even before Learny speaks. */
function flashMcqIncorrectFeedback(wrongLabel) {
  try {
    questSfx.playTryAgain();
  } catch {
    // ignore
  }
  if (!choiceBar || choiceBar.hidden) return;
  const title = choiceBar.querySelector(".lesson-choice-title");
  // Prefer the pattern just chosen for the coach; fall back to a fresh pick for UI-only flashes.
  const pattern =
    mcqRetryPatternIndex >= 0
      ? MCQ_RETRY_PATTERNS[mcqRetryPatternIndex]
      : pickMcqRetryPattern();
  if (title) {
    title.textContent = pattern.title;
    title.classList.add("is-retry");
  }
  const needle = normalizeMcqChoice(wrongLabel);
  choiceBar.querySelectorAll(".lesson-choice-btn").forEach((btn) => {
    btn.classList.remove("is-wrong");
    if (needle && normalizeMcqChoice(btn.textContent) === needle) {
      btn.classList.add("is-wrong");
      btn.setAttribute("aria-invalid", "true");
    }
  });
}

function handleMcqChoiceClick(label) {
  const segment = getCurrentSegment();
  const unlocked = mcqUnlockFlags(segment);
  const cur = getCurrentMcqBeat(segment, { unlocked });
  if (!cur?.beat) {
    sendUserText(label);
    return;
  }
  const beat = cur.beat;
  const answer = resolveMcqAnswer(beat);
  const beatForMatch = { ...beat, answer, choices: resolveMcqChoices(beat) };
  const correct = isMcqCorrect(label, beatForMatch);
  const event = recordMcqAttempt({
    segmentId: segment.id,
    beatId: beat.id,
    learnyPrompt: `${beat.learnyEn || ""} ${beat.learnyJa || ""}`,
    choice: label,
    correct,
    choices: beatForMatch.choices,
    answer,
  });
  try {
    event.level = getActiveLevelId();
  } catch {
    // ignore
  }
  notifyMcqActivity(event);
  notifyParentProgress();

  if (!correct) {
    // Ch2→Ch3 desync: banner already on Ch3 but Learny still eliciting I found some sand.
    if (
      segment.id === "ch3" &&
      /i found some sand/i.test(label) &&
      /you found some sand|すなをみつけ|「(?:すなを|砂を)見つけた」|found some sand/i.test(lastAssistantText())
    ) {
      addUserAnswerBubble(label);
      dispatchChildTurn(
        label,
        "[Teacher note — do not read aloud] Chapter 2 is DONE. Speak EXACTLY Chapter 3 Beat 1 NOW: " +
          "Let's make some glass! " + PART1_ELICIT_JA.ch3NeedGlass + " " +
          "Then WAIT for I need to make glass (4-button). FORBIDDEN: You found some sand / keep searching."
      );
      renderChoiceBar(segment);
      return;
    }
    addUserAnswerBubble(label);
    const retry = buildMcqWrongRetryCoach(buildMcqSpeakCoach(beat));
    dispatchChildTurn(label, retry);
    renderChoiceBar(segment);
    flashMcqIncorrectFeedback(label);
    return;
  }

  if (beat.memoryFromChoice && beat.memoryKey) {
    recordMemory(beat.memoryKey, label);
  }
  const beats = getSegmentMcqBeats(segment);
  const { done } = advanceMcqCursor(segment.id, beats.length);

  if (segment.id === "ch2" && beat.id === "direction") {
    ch2Search.phase = "chat";
    ch2Search.rallies = 0;
    persistCh2SearchState();
  }

  if (beat.completeSegmentOnCorrect || done) {
    const result = completeSegment(segment.id, { userQuote: label });
    if (result.ok && !result.alreadyDone) {
      clearSegmentUi(segment.id);
      try {
        questSfx.playQuestComplete();
      } catch {
        // ignore
      }
      addUserAnswerBubble(label);
      if (afterSegmentAdvanced(segment.id, result, { lastQuote: label })) {
        renderChoiceBar(getCurrentSegment());
        return;
      }
      const nudge = buildAdvanceNudge(result.state);
      dispatchChildTurn(label, nudge || "Next chapter — one short opening beat.");
      renderChoiceBar(getCurrentSegment());
      return;
    }
  }

  const nextUnlocked = mcqUnlockFlags(getCurrentSegment());
  const next = getCurrentMcqBeat(getCurrentSegment(), { unlocked: nextUnlocked });
  let nextCoach = "Continue.";
  if (segment.id === "ch2" && beat.id === "direction") {
    nextCoach =
      "Speak EXACTLY: " +
      CH2_HOT_SPEAK +
      " Then WAIT. FORBIDDEN: You found some sand! / Can you say it in English? / skipping beat 3–4. " +
      "Next after they answer: " +
      CH2_SEE_SPEAK;
  } else if (next?.beat) {
    nextCoach = buildMcqSpeakCoach(next.beat);
  } else if (segment.id === "ch2") {
    nextCoach =
      "FREE TALK next (no buttons): Is it hot outside? → What can you see around you? Then We found some sand! elicit (FORBIDDEN: Keep looking).";
  }
  const praise =
    "Correct — ONE brief varied praise (do NOT repeat すごい / That's right if used recently), acknowledge \"" +
    label +
    "\", then " +
    nextCoach +
    (segment.id === "ch1"
      ? " FORBIDDEN: Did you find the glass? / Have you found glass? / searching for glass."
      : "");
  addUserAnswerBubble(label);
  dispatchChildTurn(label, praise);
  renderChoiceBar(getCurrentSegment());
}

/**
 * Typed answers that match the on-screen MCQ should use the same path as button taps
 * (progress + reply-watch). Also recovers cursor desync (e.g. buttons on beat 2 while
 * Learny still asked beat 1).
 * Intermediate voice-only: any spoken attempt on the active beat is logged (correct or not).
 */
function tryRouteTextToMcq(text) {
  const segment = getCurrentSegment();
  const beats = getSegmentMcqBeats(segment);
  if (!beats.length || segment?.id === "quiz1") return false;
  const unlocked = mcqUnlockFlags(segment);
  const cur = getCurrentMcqBeat(segment, { unlocked });
  if (!cur?.beat) return false;

  const needle = normalizeMcqChoice(text);
  if (!needle) return false;

  const matchBeatAt = (idx) => {
    const beat = beats[idx];
    if (!beat) return null;
    const answer = resolveMcqAnswer(beat);
    const choices = resolveMcqChoices(beat);
    const beatForMatch = { ...beat, answer, choices };
    if (isMcqCorrect(text, beatForMatch)) return formatChoiceLabel(answer) || formatChoiceLabel(text);
    const hit = choices.find((c) => normalizeMcqChoice(c) === needle);
    return hit || null;
  };

  let label = matchBeatAt(cur.index);
  if (!label) {
    for (let i = 0; i < cur.index; i += 1) {
      label = matchBeatAt(i);
      if (label) {
        setMcqCursor(segment.id, i);
        break;
      }
    }
  }
  if (!label && isIntermediateVoiceOnly()) {
    label = String(text).trim();
  }
  if (!label) return false;
  handleMcqChoiceClick(label);
  return true;
}

/** Intermediate: route quiz1 voice/typed answers through the same logger as button taps. */
let routingQuiz1Answer = false;
function tryRouteQuiz1Answer(text) {
  if (!isIntermediateVoiceOnly() || routingQuiz1Answer) return false;
  if (getCurrentSegment()?.id !== "quiz1") return false;
  if (!getCurrentQuiz1Item()) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  routingQuiz1Answer = true;
  try {
    handleQuiz1ChoiceClick(t);
  } finally {
    routingQuiz1Answer = false;
  }
  return true;
}

function handleQuiz1ChoiceClick(label) {
  const segment = getCurrentSegment();
  const item = getCurrentQuiz1Item();
  if (!item || segment?.id !== "quiz1") {
    sendUserText(label);
    return;
  }

  const choices = (item.choices || []).slice(0, 4).map(formatChoiceLabel);
  const correct = userMatchesQuiz1Item(label, item);
  const event = recordMcqAttempt({
    segmentId: "quiz1",
    beatId: item.id || `q${quiz1State.cursor + 1}`,
    learnyPrompt: quiz1ItemSpeak(item),
    choice: label,
    correct,
    choices,
    answer: item.answer || "",
  });
  try {
    event.level = getActiveLevelId();
  } catch {
    // ignore
  }
  notifyMcqActivity(event);
  notifyParentProgress();

  if (!correct) {
    addUserAnswerBubble(label);
    const retry = buildMcqWrongRetryCoach(buildQuiz1SpeakCoach(item));
    dispatchChildTurn(label, retry);
    renderChoiceBar(segment);
    flashMcqIncorrectFeedback(label);
    return;
  }

  // Correct — reuse existing quiz1 advance / Chapter 4 handoff path.
  sendUserText(label);
  renderChoiceBar(getCurrentSegment());
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
  if (segment.id === "quiz1" && bannerSegmentId !== "quiz1") {
    resetQuiz1State();
  }
  if (segment.id !== bannerSegmentId && getSegmentMcqBeats(segment).length) {
    // Fresh chapter: start MCQ from beat 0 (persisted mid-chapter cursor kept only while same banner).
    if (bannerSegmentId && bannerSegmentId !== segment.id) {
      resetMcqCursor(segment.id);
    }
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
    } else if (segment.id === "quiz1") {
      const qDone = quiz1State.answered;
      const qTotal = getQuiz1Items().length || 3;
      questBannerHint.textContent =
        qDone < qTotal
          ? isIntermediateVoiceOnly()
            ? `いま：ミニクイズ ${qDone}/${qTotal}（こえで こたえよう）`
            : `いま：ミニクイズ ${qDone}/${qTotal}（4択でこたえよう）`
          : "いま：ミニクイズ おわり！ Chapter 4 へ";
    } else if (segment.id === "ending1") {
      syncEnding1AutoProgress();
      enterEnding1FreeTalkIfReady();
      const step = getEnding1DisplayStep();
      if (!ending1AutoIntroComplete()) {
        questBannerHint.textContent = `いま：おわりの おはなし ${step}/3（はじめの ひとこと）`;
      } else if (ending1Beat.finaleRequested || ending1FinaleComplete()) {
        questBannerHint.textContent = `いま：おわりの おはなし ${step}/3（おわかれ）`;
      } else {
        questBannerHint.textContent =
          "いま：フリートーク（「終わりにする」でおしまいにできるよ）";
      }
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
  const inputArea = document.getElementById("input-area");
  choiceBar.innerHTML = "";
  const hide = () => {
    choiceBar.hidden = true;
    inputArea?.classList.remove("has-mcq");
    if (chatInput) {
      chatInput.placeholder = isIntermediateVoiceOnly()
        ? "こえで こたえてね（ひつようなときだけにゅうりょく）"
        : "自由会話のときだけ入力…";
    }
  };
  const show = () => {
    choiceBar.hidden = false;
    inputArea?.classList.add("has-mcq");
    if (chatInput) chatInput.placeholder = "ボタンで選ぶのがメインだよ";
  };

  // Intermediate: never show choice buttons — voice answers only (progress still logged).
  if (isIntermediateVoiceOnly()) {
    hide();
    syncMicForMcqMode();
    return;
  }

  // Hide MCQ while reconnecting / until Learny starts the new chapter.
  if (
    actionState !== "active" ||
    chapterTransitionActive ||
    isHandoffRunning ||
    isChapterHandoff ||
    skipOutboundForHandoff
  ) {
    hide();
    syncMicForMcqMode();
    return;
  }

  // Free-talk stretches (Ch2 chat/wait, Ch4 color ask before Beat B, etc.): no buttons.
  if (isCh2FreeTalkUi() || isCh4FreeTalkUi()) {
    hide();
    syncMicForMcqMode();
    return;
  }

  const appendChoices = (labels, onClick, titleText) => {
    show();
    const title = document.createElement("p");
    title.className = "lesson-choice-title";
    title.textContent = titleText;
    choiceBar.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "lesson-choice-grid";
    labels.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-choice-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => onClick(label));
      grid.appendChild(btn);
    });
    choiceBar.appendChild(grid);
  };

  if (segment?.id === "quiz1") {
    const item = getCurrentQuiz1Item();
    const total = getQuiz1Items().length || 3;
    if (!item) {
      hide();
      syncMicForMcqMode();
      return;
    }
    appendChoices(
      getShuffledChoiceLabels(
        `quiz1:${item.id || quiz1State.cursor}`,
        (item.choices || []).slice(0, 4).map(formatChoiceLabel)
      ),
      (label) => handleQuiz1ChoiceClick(label),
      `答えをタップ（${quiz1State.cursor + 1} / ${total}）`
    );
    syncMicForMcqMode();
    return;
  }

  if (segment?.id === "final1" && segment?.input === "speak_or_click") {
    if (!assistantAskedFinal1QuizQuestion(lastAssistantText())) {
      hide();
      syncMicForMcqMode();
      return;
    }
    syncFinal1CursorFromAssistant(lastAssistantText());
    const displayed = getDisplayedFinal1Item();
    const item = displayed?.item || getCurrentFinal1Item();
    if (!item) {
      hide();
      syncMicForMcqMode();
      return;
    }
    appendChoices(
      getShuffledChoiceLabels(
        `final1:${item.id || item.answer || "item"}`,
        final1ChoiceLabels(item)
      ),
      (label) => handleFinal1ChoiceClick(label),
      "答えをタップしてね"
    );
    syncMicForMcqMode();
    return;
  }

  const unlocked = mcqUnlockFlags(segment);
  const cur = getCurrentMcqBeat(segment, { unlocked });
  if (!cur?.beat) {
    hide();
    syncMicForMcqMode();
    return;
  }

  appendChoices(
    resolveMcqChoices(cur.beat),
    (label) => handleMcqChoiceClick(label),
    `答えをタップ（${cur.index + 1} / ${cur.total}）`
  );
  syncMicForMcqMode();
}

function normalizeUserText(text) {
  return String(text || "").trim().toLowerCase();
}

function isRecentVoiceDuplicate(text) {
  const t = normalizeUserText(text);
  if (!t || !lastVadUserAt) return false;
  return normalizeUserText(lastVadUserText) === t && Date.now() - lastVadUserAt < VOICE_TYPED_DEDUP_MS;
}

/** Voice turns already render a mic-only bubble — don't add a second text transcription. */
function shouldSuppressUserTextBubble(text = "") {
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "user" && last.fromMic) return true;
  if (isRecentVoiceDuplicate(text)) return true;
  // Intermediate is voice-first: any very recent VAD utterance → keep mic-only UI.
  if (
    isIntermediateVoiceOnly() &&
    lastVadUserAt &&
    Date.now() - lastVadUserAt < VOICE_TYPED_DEDUP_MS
  ) {
    return true;
  }
  return false;
}

function addUserAnswerBubble(text) {
  if (shouldSuppressUserTextBubble(text)) return;
  addMessage(text, "user");
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

  const jpMatches = [...t.matchAll(/「[^」]+」(?:の\s*えいごを\s*選んでね|っていってみて|と言ってみて)[！!]?/g)];
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

  const jpMatches = [
    ...t.matchAll(/「[^」]+」(?:の\s*えいごを\s*選んでね|っていってみて|と言ってみて|って英語で言ってみて)[！!]?/g),
  ];
  if (jpMatches.length >= 2) {
    const first = jpMatches[0][0];
    for (let i = 1; i < jpMatches.length; i += 1) {
      if (jpMatches[i][0] === first) {
        t = t.slice(0, jpMatches[i].index).trim();
        break;
      }
    }
  }

  const sandJa = [
    ...t.matchAll(/あ[！!]?\s*砂あった[^！!]*(?:の\s*えいごを\s*選んでね|って英語で言ってみて|っていってみて)[！!]?/g),
  ];
  if (sandJa.length >= 2) {
    t = t.slice(0, sandJa[1].index).trim();
  }

  return t;
}

function trimCh2StackedBeats(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  const hasFound = /we found some sand|you found some sand|あ[！!]\s*砂あった/i.test(t);
  const hasHot = /is it hot|そとは\s*あつい|あついね/i.test(t);
  const hasSee = /what can you see|まわりに|なにが\s*みえる/i.test(t);
  if (!hasFound || (!hasHot && !hasSee)) return t;

  const m = t.match(/(?:we found some sand|you found some sand|あ[！!]\s*砂あった)/i);
  if (m && m.index > 0) {
    t = t.slice(m.index).trim();
  }
  return t;
}

function trimDuplicateCh2FoundElicit(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  const enMatches = [...t.matchAll(/we found some sand[^?!]*(?:can you say[^?!]*)?[?!]?/gi)];
  if (enMatches.length >= 2) {
    const firstNorm = enMatches[0][0].replace(/\s/g, "").toLowerCase();
    for (let i = 1; i < enMatches.length; i += 1) {
      const curNorm = enMatches[i][0].replace(/\s/g, "").toLowerCase();
      if (curNorm.includes(firstNorm.slice(0, 28)) || firstNorm.includes(curNorm.slice(0, 28))) {
        t = t.slice(0, enMatches[i].index).trim();
        break;
      }
    }
  }

  const sandPartial = [
    ...t.matchAll(/(?:あ[！!]?\s*)?砂あった[^！!]*(?:の\s*えいごを\s*選んでね|って英語で言ってみて|っていってみて)[！!]?/g),
  ];
  if (sandPartial.length >= 2) {
    t = t.slice(0, sandPartial[1].index).trim();
  }

  return t;
}

function trimCh2AssistantBubble(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  t = trimCh2StackedBeats(t);
  t = trimDuplicateCh2FoundElicit(t);
  t = trimDuplicateTeachPhrase(t);
  return t;
}

function countEnglishLeadIns(text) {
  return [
    ...String(text || "").matchAll(
      /\b(?:what|how|when|where|who|why|did you|do you|are you|will you|shall we|have you|is it|can you)\b/gi
    ),
  ].length;
}

function countEnglishQuestions(text) {
  return [
    ...String(text || "").matchAll(
      /\b(?:what|how|when|where|who|why|did you|do you|can you|are you|will you|shall we|have you|is it)\b[^?？]{0,100}[？?]/gi
    ),
  ].length;
}

function assistantHasStackedEnglishQuestions(text) {
  return countEnglishQuestions(text) >= 2;
}

const ENGLISH_QUESTION_START_RE =
  /\b(?:what|how|when|where|who|why|do you|did you|can you|are you|will you|shall we|have you|is it)\b/gi;

/** Rough playback estimate — Gemini Live STT races ahead of realtime audio. */
function estimateSpeechMs(text) {
  const t = String(text || "");
  const jp = (t.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) || []).length;
  const en = (t.match(/[a-zA-Z0-9]/g) || []).length;
  return Math.min(14000, jp * 85 + en * 55 + 250);
}

/**
 * Keep EN question + matching ひらがな. Only drop a SECOND English question (and after).
 * Do NOT cut on the first bare ？ — that often lands inside the Japanese half and
 * made bubbles / interrupt logic chop Japanese mid-phrase.
 */
function trimDuplicateStackedQuestions(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  const yokatta = [...t.matchAll(/よかった[！!]?/g)];
  if (yokatta.length >= 2) {
    return t.slice(0, yokatta[1].index).trim();
  }

  const enStarts = [...t.matchAll(ENGLISH_QUESTION_START_RE)];
  if (enStarts.length < 2) return t;

  // Require the first English lead-in to have reached a ? before we treat a later
  // lead-in as a stacked second question (avoids cutting "What … hard. ありがとう…").
  const first = enStarts[0];
  const afterFirst = t.slice(first.index);
  const firstQEnd = afterFirst.search(/[？?]/);
  if (firstQEnd < 0) return t;
  const firstQAbsEnd = first.index + firstQEnd;
  const second = enStarts.find((m) => m.index > firstQAbsEnd);
  if (!second) return t;

  // Keep Japanese that belongs to the first beat (between first ? and second EN).
  return t.slice(0, second.index).trim();
}

function assistantBubbleHasStackedQuestions(text) {
  // EN + matching ひらがな both end with ？ — that is ONE bilingual beat, not stacked.
  if (assistantHasStackedEnglishQuestions(text)) return true;
  if ((String(text || "").match(/よかった[！!]?/g) || []).length >= 2) return true;
  return false;
}

function displayIsPrefixOfRaw(raw, display) {
  const r = String(raw || "").replace(/\s/g, "");
  const d = String(display || "").replace(/\s/g, "");
  if (!r || !d || d.length >= r.length - 4) return false;
  return r.startsWith(d);
}

/** Stop audio when Learny asks a second English question in the same turn (display already trims it). */
function maybeInterruptStackedAssistantSpeech(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return false;

  // Never cut Ending Turn A/C audio — stacked-interrupt was clipping どんなおさかなを mid-line.
  if (getCurrentSegment()?.id === "ending1") return false;

  let display = raw;
  if (getCurrentSegment()?.id === "ch2") {
    display = trimCh2AssistantBubble(raw);
  } else if (assistantHasStackedEnglishQuestions(raw)) {
    display = trimDuplicateStackedQuestions(raw);
  } else {
    return false;
  }

  if (!display || display.length >= raw.length - 8) return false;

  // Suffix keep (Ch2 dropped an earlier beat) — interrupting would clip the CURRENT Japanese.
  if (!displayIsPrefixOfRaw(raw, display)) {
    dbg("skip stacked interrupt; kept later beat", {
      kept: display.slice(0, 48),
      rawHead: raw.slice(0, 48),
    });
    return false;
  }

  const key = normalizeUserText(display).slice(0, 96);
  if (stackedSpeechInterruptedFor === key) return false;
  stackedSpeechInterruptedFor = key;

  // STT runs ahead of realtime playback. Interrupting immediately cuts the Japanese
  // half of the first beat mid-sentence ("broken Japanese"). Wait for the kept text.
  const waitMs = Math.max(0, estimateSpeechMs(display) - 350);
  dbg("schedule stacked assistant interrupt", {
    waitMs,
    kept: display.slice(0, 64),
    dropped: raw.slice(display.length, display.length + 64),
  });
  setTimeout(() => {
    if (stackedSpeechInterruptedFor !== key) return;
    if (actionState !== "active") return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
  }, waitMs);
  return true;
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
  // Only collapse exact adjacent repeats of a long hiragana run (STT stutter).
  // Avoid non-greedy backrefs that can eat legitimate repeated stems.
  t = t.replace(/([\u3040-\u309F]{6,})\1+/g, "$1");
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
  // When finished, prefer the longer complete string — late STT can send a shorter partial.
  if (finished && cn.length >= pn.length * 0.92) return c.length > p.length ? c : p;
  if (finished && pn.length > cn.length * 1.08) return p;
  return mergeTranscriptChunk(p, c);
}

function resetAssistantTurnTranscript() {
  assistantTurnTranscript = "";
}

function applyAssistantTranscriptChunk(chunk, { finished = false } = {}) {
  const c = String(chunk || "").trim();
  if (!c && !finished) return false;
  if (c && isMetaAssistantLeak(c)) return false;

  // Always track Perfect progress on ending1 (even before display lock) so we can
  // claim freestyle Perfect and cancel a second client kick.
  if (getCurrentSegment()?.id === "ending1" && c && !ending1Beat.finaleRequested) {
    trackEnding1IntroSttProgress(c);
    if (shouldInterruptEnding1IntroRestart(c)) {
      dbg("interrupt ending1 Turn A restart audio", c.slice(0, 40));
      sealEnding1IntroSpeech("stt-restart");
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
    }
  }

  // Ending Turn A display is client-owned exact script — ignore STT for the bubble.
  if (
    getCurrentSegment()?.id === "ending1" &&
    ending1Beat.introDisplayLocked &&
    !ending1Beat.finaleRequested
  ) {
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return true;
  }

  const last = chatMessages[chatMessages.length - 1];
  let needNewBubble =
    !assistantTranscriptOpen || last?.type !== "assistant" || userSpokeSinceLastAssistantBubble();

  // Resume a cut-off partial bubble (interrupt/handoff) instead of leaving a ghost line.
  if (
    needNewBubble &&
    last?.type === "assistant" &&
    !userSpokeSinceLastAssistantBubble() &&
    !isAssistantBubbleComplete(last.text)
  ) {
    assistantTurnTranscript = String(last.text || "");
    needNewBubble = false;
  } else if (needNewBubble) {
    resetAssistantTurnTranscript();
  }

  if (c) {
    cancelScheduledRepairIncompleteAssistantBubble();
    const before = assistantTurnTranscript;
    assistantTurnTranscript = pickTranscriptChunk(assistantTurnTranscript, c, { finished });
    if (assistantTurnTranscript === before && before) {
      dbg("transcript chunk dropped", c.slice(0, 48));
    }
  }

  const display = sanitizeAssistantBubbleText(assistantTurnTranscript);
  if (!display && !finished) return false;

  // Display trims a second English question; cut audio so kids don't hear a ghost follow-up.
  if (display) maybeInterruptStackedAssistantSpeech(assistantTurnTranscript);

  if (emptyState) emptyState.style.display = "none";
  if (
    needNewBubble &&
    display &&
    last?.type === "assistant" &&
    !userSpokeSinceLastAssistantBubble() &&
    (sharesCh2FoundElicitBeat(display, last.text) ||
      assistantMessagesTooSimilar(display, last.text) ||
      isLikelySameTurnContinuation(display, last.text) ||
      Date.now() - lastAssistantBubbleAt < 12000)
  ) {
    needNewBubble = false;
    assistantTurnTranscript = pickTranscriptChunk(String(last.text || ""), display, { finished: true });
  }
  if (needNewBubble && display) {
    // After Turn A, bare "Perfect!" restarts must not become a new waiting turn.
    if (isEnding1GhostPerfectRestart(display)) {
      dbg("suppress ending1 ghost Perfect restart", display.slice(0, 32));
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      assistantTranscriptOpen = false;
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
    // Re-asking the same lead question after a short child reply = classic double.
    if (
      sharesSameLeadQuestion(lastAssistantText(), display) &&
      Date.now() - lastAssistantBubbleAt < 25000
    ) {
      dbg("suppress re-asked lead question bubble", display.slice(0, 48));
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      assistantTranscriptOpen = false;
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
    if (
      last?.type === "assistant" &&
      shouldSuppressBackToBackAssistant(display)
    ) {
      dbg("suppress duplicate assistant STT bubble", display.slice(0, 48));
      last.text = sanitizeAssistantBubbleText(
        pickTranscriptChunk(String(last.text || ""), display, { finished: true })
      );
      assistantTurnTranscript = String(last.text || "");
      assistantTranscriptOpen = Boolean(display);
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
    chatMessages.push({ type: "assistant", text: display, sttEnterPending: true });
    lastAssistantBubbleAt = Date.now();
  } else if (last?.type === "assistant" && display) {
    last.text = display;
  }
  assistantTranscriptOpen = Boolean(display);
  scheduleRenderChat();
  updateLearnyThinkingUI();
  // Show Ch4 MCQ as soon as Beat B elicit appears (don't wait for turn end).
  if (getCurrentSegment()?.id === "ch4" && display && ch4AssistantSaidBeatB(display)) {
    refreshChoiceBarIfNeeded();
  }
  if (finished) {
    scheduleRepairIncompleteAssistantBubble();
    if (getCurrentSegment()?.id === "ch4" && ch4AssistantSaidBeatB()) {
      refreshChoiceBarIfNeeded();
    }
    if (getCurrentSegment()?.id === "ch4" && ch4HasFavoriteColor() && !ch4AssistantSaidBeatB()) {
      maybeCh4BeatBCorrectiveNudge();
    }
    if (getCurrentSegment()?.id === "final1") {
      syncFinal1CursorFromAssistant(display || lastAssistantText());
      refreshChoiceBarIfNeeded();
    }
    if (getCurrentSegment()?.id === "ch2" && ch2AssistantSaidFoundElicit(display || lastAssistantText())) {
      ensureCh2FoundSandMcqReady();
      refreshChoiceBarIfNeeded();
    }
  }
  return Boolean(display);
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

function assistantEnglishLooksTruncated(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\b(is|are|am|was|were|have|has|a|the|your|my)\s+(What|How|Do|Are|Did|Is|Can|Will)\b/.test(t)) {
    return true;
  }
  if (/[a-z]{2,}\s+(What|How|Do|Are|Did)\b/.test(t) && !/\?\s/.test(t.replace(/\?/g, "? "))) {
    return true;
  }
  return false;
}

function assistantTranscriptNeedsMoreTime(text = assistantTurnTranscript.trim() || lastAssistantText()) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (assistantEnglishLooksTruncated(t)) return true;
  if (LEVEL_INFO.id === "beginner" && !isQuizSpeakSegment()) {
    if (/[a-zA-Z]{12,}/.test(t) && !assistantHasBeginnerJapanese(t)) return true;
    if (assistantBeginnerJapaneseIncomplete(t)) return true;
  }
  return !isAssistantBubbleComplete(t);
}

function isAssistantBubbleComplete(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (assistantEnglishLooksTruncated(t)) return false;
  const seg = getCurrentSegment();
  if (
    (seg?.id === "daily1" || seg?.type === "daily_english") &&
    LEVEL_INFO.id === "beginner" &&
    /[a-zA-Z]{10,}/.test(t) &&
    !/[\u3040-\u309F]{8,}/.test(t)
  ) {
    return false;
  }
  const openBrackets = (t.match(/「/g) || []).length;
  const closeBrackets = (t.match(/」/g) || []).length;
  if (openBrackets > closeBrackets) return false;
  if (/[。！？!?]$/.test(t)) return true;
  if (/ね[!！]?$/.test(t)) return true;
  if (/」/.test(t) && /[？?！!]$/.test(t)) return true;
  return false;
}

function normalizeTranscriptPrefix(text) {
  return String(text || "")
    .replace(/\s/g, "")
    .replace(/[「」'""]/g, "")
    .toLowerCase();
}

const HANDOFF_SPEAK_LINES = {
  ch1:
    "Thank you! What do I need to make a tank? Something transparent and hard. ありがとう！すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。",
  ch2:
    "Let's go find some sand! Do you want to go to the beach or the mountains? すなを さがしに いこう！ びーちと やま、どっちに いく？",
  ch3: `Let's make some glass! ${PART1_ELICIT_JA.ch3NeedGlass}`,
  ch4: "What's your favorite color? すきな いろは？",
  ch5:
    "Now let's make a tank wall! Where do you want to put the glass? Tell me! すいそうの かべを つくろう！どこに がらすを おく？" +
    PART1_ELICIT_JA.ch5PutGlass,
  ch6: CH6_BEAT1_SPEAK,
};

function getHandoffSpeakLine(segment = getCurrentSegment()) {
  if (!segment) return "";
  if (segment.id === "daily1") return daily1OpenSpeak();
  return HANDOFF_SPEAK_LINES[segment.id] || "";
}

function getExpectedAssistantSpeakLine(segment = getCurrentSegment()) {
  if (!segment) return "";
  if (segment.id === "quiz1") {
    const item = getCurrentQuiz1Item();
    return item ? quiz1ItemSpeak(item) : "";
  }
  return getHandoffSpeakLine(segment);
}

function scheduleRepairIncompleteAssistantBubble() {
  if (repairIncompleteTimer) clearTimeout(repairIncompleteTimer);
  repairIncompleteTimer = setTimeout(() => {
    repairIncompleteTimer = null;
    repairIncompleteAssistantBubble();
  }, TRANSCRIPT_SETTLE_MS);
}

function cancelScheduledRepairIncompleteAssistantBubble() {
  if (!repairIncompleteTimer) return;
  clearTimeout(repairIncompleteTimer);
  repairIncompleteTimer = null;
}

function repairIncompleteAssistantBubble() {
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type !== "assistant") return false;
  const cur = String(last.text || "").trim();
  if (!cur || isAssistantBubbleComplete(cur)) return false;

  const expected = getExpectedAssistantSpeakLine();
  if (expected) {
    const curNorm = normalizeTranscriptPrefix(cur);
    const expNorm = normalizeTranscriptPrefix(expected);
    // Only fill in when the partial transcript is a strict prefix of the expected script
    // (e.g. handoff ghost line cut mid-bracket). Never replace via loose substring match.
    if (curNorm && expNorm.startsWith(curNorm) && curNorm.length < expNorm.length * 0.88) {
      last.text = sanitizeAssistantBubbleText(expected);
      assistantTurnTranscript = expected;
      scheduleRenderChat();
      dbg("repaired incomplete assistant bubble", cur.slice(0, 32));
      return true;
    }
  }

  if (cur.length < 52) {
    chatMessages.pop();
    scheduleRenderChat();
    dbg("dropped orphan partial assistant bubble", cur.slice(0, 32));
    return true;
  }
  return false;
}

function pruneTrailingIncompleteAssistants() {
  let changed = false;
  while (chatMessages.length) {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.type !== "assistant") break;
    if (isAssistantBubbleComplete(last.text)) break;
    chatMessages.pop();
    changed = true;
  }
  if (changed) {
    scheduleRenderChat();
    dbg("pruned trailing incomplete assistant bubble(s)");
  }
  resetAssistantTurnTranscript();
  assistantTranscriptOpen = false;
}

function ensureJapaneseElicitBrackets(text) {
  let t = String(text || "");
  if (!/って\s*(?:英語|えいご)で\s*(?:言|い)ってみて/.test(t)) return t;
  t = t.replace(
    /(?<!「)(?:がらすが\s*ひつよう|ガラスが必要)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「がらすが ひつよう」$1"
  );
  t = t.replace(
    /(?<!「)(?:すなが\s*ひつよう|砂が必要)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「すなが ひつよう」$1"
  );
  t = t.replace(
    /(?<!「)(?:すなを\s*みつけた!?|砂を\s*見つけた!?)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「すなを みつけた！」$1"
  );
  t = t.replace(
    /(?<!「)(?:がらすを\s*つくった|ガラスを\s*作った)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「がらすを つくった」$1"
  );
  t = t.replace(
    /(?<!「)(?:すいそうを\s*つくってる|すいそうを\s*作ってる)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「すいそうを つくってる」$1"
  );
  t = t.replace(
    /(?<!「)(?:すいそうを\s*つくった|すいそうを\s*作った)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「すいそうを つくった」$1"
  );
  t = t.replace(
    /(?<!「)(?:いい\s*かんじに\s*できた|いい感じに\s*できた)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「いい かんじに できた！」$1"
  );
  t = t.replace(
    /(?<!「)(?:すなを\s*そこに\s*おいた|砂を\s*底に\s*置いた)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「すなを そこに おいた」$1"
  );
  t = t.replace(
    /(?<!「)(?:もっと\s*すなが\s*ひつよう|もっと\s*砂が\s*必要)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「もっと すなが ひつよう」$1"
  );
  t = t.replace(
    /(?<!「)できた!?！(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「できた！」$1"
  );
  t = t.replace(
    /(?<!「)(?:さかなを\s*いれられる\s*じゅんびが\s*できた|魚を\s*入れられる\s*準備が\s*できた)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「さかなを いれられる じゅんびが できた！」$1"
  );
  return t;
}

/**
 * Learny may only speak English + Japanese. Live STT sometimes injects
 * Arabic/Bengali/etc. — strip any script outside the allowlist.
 */
function stripForeignScriptsFromAssistantText(text) {
  let t = String(text || "");
  // Allow: Latin (incl. accents), digits, JP kana/kanji, CJK/fullwidth punct, common punct, emoji/misc symbols.
  t = t.replace(
    /[^\sA-Za-z0-9.,!?;:'"“”‘’`~@#%&*()\-_=+[\]{}<>|/\\^+…·•—–〜ー。、「」『』（）？！：；・￥¥€£$\u00C0-\u024F\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF01-\uFF5E\u2600-\u27BF\u{1F300}-\u{1FAFF}]/gu,
    ""
  );
  // Collapse gaps left by removed foreign glyphs; keep normal English spacing.
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\s+([。、！？「」『』（）])/g, "$1");
  t = t.replace(/([。、！？])\s{2,}/g, "$1");
  return t.trim();
}

/**
 * Strip STT garble where Latin is glued onto Japanese (そうだ！Today…),
 * or where the opening English is wrongly restarted after Japanese.
 * Do NOT cut legitimate beginner EN→JA→EN→JA pairs (e.g. ending: ありがとう！ Hold on…).
 */
function trimCorruptEnglishRestartAfterJapanese(text) {
  let t = String(text || "");
  // Glued Latin right after kana/JP punct (common after foreign-script strip).
  // Keep legitimate next-beat openers (What / Hold / Hmm…) — only drop garble like Today.
  t = t.replace(
    /([\u3040-\u309F\u30A0-\u30FF！？。])([A-Za-z][A-Za-z'’]*)/g,
    (match, jp, word) => {
      if (
        /^(hold|what|how|hmm|next|that|tell|are|let|do|is|when|shall|can|perfect|thank|nice|great|okay|ok|yes|oh|we|i|you|now|so|well|good|cool|awesome)/i.test(
          word
        )
      ) {
        return `${jp} ${word}`;
      }
      return jp;
    }
  );

  const jpStart = t.search(/[\u3040-\u309F]{2,}/);
  if (jpStart < 0) return t;
  const head = t.slice(0, jpStart);
  const rest = t.slice(jpStart);
  const latinAt = rest.search(/[A-Za-z]/);
  if (latinAt < 0) return t;
  const enAfter = rest.slice(latinAt).trim();
  // Legitimate next English beats after a Japanese half.
  if (
    /^(hold on|what kind of fish|how many|hmm\b|next minecraft|that's for next|tell me what|are you done|let'?s make|do we have|is the tank)/i.test(
      enAfter
    )
  ) {
    return t;
  }
  const enBefore = head.toLowerCase();
  const afterHead = enAfter.toLowerCase().slice(0, 64);
  // Warmup-style STT loop: Japanese then a repeat of the invite English.
  if (
    /today i want|will you help|make a fish|i want to make|okay!?\s*oh|oh!?\s*today/i.test(afterHead) &&
    /today i want|will you help|make a fish|okay|oh!?\s*today/i.test(enBefore)
  ) {
    return (head + rest.slice(0, latinAt)).replace(/\s{2,}/g, " ").trim();
  }
  return t;
}

function sanitizeAssistantBubbleText(text) {
  let t = ensureJapaneseElicitBrackets(String(text || "").trim());
  t = stripForeignScriptsFromAssistantText(t);
  t = trimCorruptEnglishRestartAfterJapanese(t);
  t = fixCh4BeatBBubble(t);
  t = stripCh4FavoriteColorReask(t);
  if (getCurrentSegment()?.id === "quiz1") {
    t = trimDuplicateAssistantQuizPrompt(t);
  }
  if (getCurrentSegment()?.id === "ch2") {
    t = trimCh2AssistantBubble(t);
  }
  if (getCurrentSegment()?.id === "ending1") {
    t = trimEnding1IntroRestart(t);
  }
  // Display-only: spacing + clear duplicate greetings/questions + strip system leaks.
  return fixEnglishSpacing(
    trimDuplicateJapanesePhrases(
      stripSystemBackendSpeech(trimDuplicateHowAreYou(trimDuplicateStackedQuestions(t)))
    )
  );
}

/**
 * After Turn A is fully done, Gemini sometimes restarts with bare "Perfect!".
 * ONLY then — never during the first Turn A kick (that cut "Perfect! We…" off the start
 * and caused a second untranscribed speak).
 */
function isEnding1GhostPerfectRestart(text) {
  if (getCurrentSegment()?.id !== "ending1") return false;
  // Must already have finished Turn A (fish question in chat) before treating Perfect as a ghost.
  if (!ending1AutoIntroComplete()) return false;
  const t = String(text || "").trim();
  if (!t || t.length > 40) return false;
  if (/hold on|what kind of fish|どんな|fish tank together|てつだって/i.test(t)) return false;
  return /^(perfect!?|ぱーふぇくと[！!]?)\s*$/i.test(t);
}

/** Track Turn A STT progress while the seeded bubble is locked. */
function trackEnding1IntroSttProgress(chunk) {
  const t = String(chunk || "");
  if (/perfect!?\s*we made|ぱーふぇくと/i.test(t)) {
    ending1Beat.introHeardPerfect = true;
    // Freestyle Perfect before client kick — claim so we never send a second coach.
    claimEnding1IntroIfGeminiStarted();
  }
  if (/hold on|don'?t have any fish|おさかなが\s*1ぴき|おさかなが\s*いっぴき/i.test(t)) {
    ending1Beat.introHeardHoldOn = true;
  }
  if (assistantSaidEnding1FishQuestion(t)) {
    if (!ending1Beat.introHeardFishQ) {
      ending1Beat.introHeardFishQAt = Date.now();
    }
    ending1Beat.introHeardFishQ = true;
    ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
  }
  if (ending1Beat.introHeardFishQ || ending1Beat.introHeardHoldOn) {
    armEnding1IntroQuietSeal();
  }
}

/** True when STT shows Turn A restarting (second Perfect), not the first play-through. */
function shouldInterruptEnding1IntroRestart(chunk) {
  const t = String(chunk || "");
  if (!t) return false;
  const perfectEn = t.match(/perfect!?\s*we made a fish tank/gi) || [];
  const perfectJp = t.match(/ぱーふぇくと/g) || [];
  // Two Perfect leads in one transcript = restart.
  if (perfectEn.length >= 2 || perfectJp.length >= 2) return true;
  // First play-through cumulative STT still contains Perfect + fish once — never cut it.
  if (assistantSaidEnding1FishQuestion(t) && perfectEn.length < 2) return false;
  const trimmed = t.trim();
  // New speak starts with Perfect after fish was already heard (second Turn A beginning).
  if (
    ending1Beat.introHeardFishQ &&
    /^(perfect!?|ぱーふぇくと)/i.test(trimmed) &&
    !assistantSaidEnding1FishQuestion(trimmed) &&
    Date.now() - (ending1Beat.introHeardFishQAt || 0) > 1500
  ) {
    return true;
  }
  return false;
}

/**
 * Seed the chat with the exact Turn A script so STT cannot show a mid-sentence fragment.
 * Audio still comes from Gemini; display is client-owned for this beat.
 */
function seedEnding1IntroBubble() {
  const text = ENDING1_INTRO_SPEAK.trim();
  ending1Beat.introDisplayLocked = true;
  ending1Beat.introSeededAt = Date.now();
  // Do NOT mark autoSpoken yet — that unlocked free talk before audio finished.
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  assistantTurnTranscript = text;
  assistantTranscriptOpen = true;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "assistant" && !userSpokeSinceLastAssistantBubble()) {
    last.text = text;
    last.ending1Exact = true;
  } else {
    chatMessages.push({ type: "assistant", text, ending1Exact: true, sttEnterPending: true });
    lastAssistantBubbleAt = Date.now();
  }
  scheduleRenderChat();
  updateLearnyThinkingUI();
  updateLessonBanner();
  paintEndingEndButton();
  scheduleEnding1IntroUnlock();
}

let ending1FinaleSpeechWatchId = null;

function armEnding1FinaleSpeechWatch() {
  if (ending1FinaleSpeechWatchId) {
    clearTimeout(ending1FinaleSpeechWatchId);
    ending1FinaleSpeechWatchId = null;
  }
  ending1FinaleSpeechWatchId = setTimeout(() => {
    ending1FinaleSpeechWatchId = null;
    if (actionState !== "active" || !client?.connected) return;
    if (getCurrentSegment()?.id !== "ending1") return;
    if (!ending1Beat.finaleRequested) return;
    syncEnding1FinaleProgress();
    if (ending1FinaleComplete() || assistantSaidEnding1Finale()) {
      maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
      return;
    }
    // Coach went out but no goodbye speech — one recovery kick.
    dbg("ending1 finale speech watch retry");
    ending1Beat.finaleForceScheduled = false;
    ending1Beat.finaleNoteSent = false;
    kickEnding1FinaleChain("finale-speech-watch", { bypassCooldown: true });
  }, 6000);
}

/** Unlock free talk only after Turn A has actually been spoken (not on empty idle). */
function scheduleEnding1IntroUnlock() {
  const seedAt = ending1Beat.introSeededAt || Date.now();
  const minLockMs = 14000; // full EN+JP Turn A is long; early idle was opening free talk mid-script
  const tick = () => {
    if (getCurrentSegment()?.id !== "ending1") return;
    if (!ending1Beat.introDisplayLocked) return;
    const elapsed = Date.now() - seedAt;
    if (assistantIsSpeaking() || elapsed < minLockMs) {
      setTimeout(tick, 400);
      return;
    }
    // Playback drained and minimum lock elapsed.
    ending1Beat.introDisplayLocked = false;
    ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
    syncEnding1AutoProgress();
    enterEnding1FreeTalkIfReady();
    paintEndingEndButton();
    updateLessonBanner();
  };
  setTimeout(tick, 500);
}
function trimEnding1IntroRestart(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  const enFish = /what kind of fish should we catch\?/i.exec(t);
  if (!enFish) return t;
  let end = enFish.index + enFish[0].length;
  const afterEn = t.slice(end);
  const jpFish = /^\s*どんな\s*おさかな[^？?]{0,40}[？?]/.exec(afterEn);
  if (jpFish) end += jpFish[0].length;
  const head = t.slice(0, end).trim();
  const tail = t.slice(end).trim();
  if (!tail) return t;
  // Restart signals: Perfect lead again, thank-you JP, or Hold on after fish Q already done.
  if (
    /^(?:a fish tank together|perfect!?|thank you for helping|ぱーふぇくと|いっしょに\s*すいそう|てつだって|hold on)/i.test(
      tail
    ) ||
    /perfect!?\s*we made|hold on\.\.\.|we don'?t have any fish|ぱーふぇくと|てつだって\s*くれて/i.test(tail)
  ) {
    return head;
  }
  return t;
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

const VOICE_MIC_ICON_SVG =
  '<svg class="msg-voice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

function applyUserBubbleContent(bubble, msg) {
  if (!bubble) return;
  if (msg.fromMic) {
    bubble.classList.add("is-voice");
    bubble.setAttribute("aria-label", "マイクで話した");
    bubble.title = "マイクで話した";
    if (!bubble.querySelector(".msg-voice-icon")) {
      bubble.innerHTML = `${VOICE_MIC_ICON_SVG}<span class="visually-hidden">マイクで話した</span>`;
    }
    return;
  }
  bubble.classList.remove("is-voice");
  bubble.removeAttribute("aria-label");
  bubble.removeAttribute("title");
  if (bubble.querySelector(".msg-voice-icon")) {
    bubble.textContent = msg.text || "";
    return;
  }
  if (bubble.textContent !== (msg.text || "")) {
    bubble.textContent = msg.text || "";
  }
}

function addMessage(text, type, mode = "new") {
  const t = String(text || "");
  if (!t) return;
  const fromMic = type === "user-transcript";
  const storedType = fromMic ? "user" : type;
  if (storedType === "assistant" && isMetaAssistantLeak(t)) {
    dbg("drop meta assistant leak", t.slice(0, 64));
    return;
  }
  if (emptyState) emptyState.style.display = "none";
  if (mode === "append" && chatMessages.length) {
    const last = chatMessages[chatMessages.length - 1];
    const canMergeVoice = fromMic && last.type === "user" && last.fromMic;
    const canMergeAssistant = storedType === "assistant" && last.type === "assistant";
    const canMergeOther =
      !fromMic &&
      storedType !== "assistant" &&
      (sameTranscriptBubble(last.type, storedType) || sameTranscriptBubble(last.type, type));
    if (canMergeVoice || canMergeAssistant || canMergeOther) {
      if (storedType === "assistant" || fromMic || storedType === "user") {
        last.text =
          storedType === "assistant"
            ? sanitizeAssistantBubbleText(mergeTranscriptChunk(last.text, t))
            : mergeTranscriptChunk(last.text, t);
      } else {
        last.text = (last.text || "") + t;
      }
      if (fromMic) last.fromMic = true;
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
    if (
      sharesSameLeadQuestion(lastAssistantText(), t) &&
      Date.now() - lastAssistantBubbleAt < 25000
    ) {
      dbg("suppress re-asked lead question addMessage", t.slice(0, 48));
      return;
    }
    if (last?.type === "assistant" && sharesCh2FoundElicitBeat(t, last.text)) {
      dbg("suppress ch2 duplicate elicit bubble", t.slice(0, 48));
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
    fromMic: Boolean(fromMic),
    sttEnterPending: storedType === "assistant",
  });
  if (storedType === "assistant") lastAssistantBubbleAt = Date.now();
  scheduleRenderChat();
  if (storedType === "assistant") updateLearnyThinkingUI();
}

function renderChatNow() {
  if (!chatArea) return;
  const rows = Array.from(chatArea.querySelectorAll(":scope > .msg-row"));

  if (!chatMessages.length) {
    rows.forEach((row) => row.remove());
    appendChatChrome();
    updateLearnyThinkingUI();
    return;
  }

  // Shrink without wiping — full innerHTML rebuild re-fired fade animations on every bubble.
  while (rows.length > chatMessages.length) {
    rows.pop()?.remove();
  }

  const insertBeforeChrome = (row) => {
    if (learnyThinkingEl && learnyThinkingEl.parentElement === chatArea) {
      chatArea.insertBefore(row, learnyThinkingEl);
    } else {
      chatArea.appendChild(row);
    }
  };

  chatMessages.forEach((msg, i) => {
    let row = rows[i];
    if (!row) {
      row = document.createElement("div");
      row.className = `msg-row ${msg.type}`;
      const bubble = document.createElement("div");
      bubble.className = "msg-bubble";
      if (msg.type === "user") {
        applyUserBubbleContent(bubble, msg);
      } else {
        bubble.textContent = msg.text;
      }
      row.appendChild(bubble);
      insertBeforeChrome(row);
      rows[i] = row;
      if (msg.type === "assistant" && msg.sttEnterPending) {
        row.classList.add("stt-enter");
      } else if (msg.type === "user" || msg.type === "system") {
        row.classList.add("msg-enter");
      }
      msg.sttEnterPending = false;
      return;
    }

    if (!row.classList.contains(msg.type)) {
      row.className = `msg-row ${msg.type}`;
    }
    const bubble = row.querySelector(".msg-bubble");
    if (msg.type === "user") {
      applyUserBubbleContent(bubble, msg);
    } else if (bubble && bubble.textContent !== msg.text) {
      bubble.textContent = msg.text;
    }
    // Never re-apply enter animations on existing rows (causes chat flicker).
    msg.sttEnterPending = false;
  });

  appendChatChrome();
  updateLearnyThinkingUI();
  chatArea.scrollTop = chatArea.scrollHeight;
}

function shouldShowLearnyThinking() {
  if (actionState !== "active" || !client?.connected) return false;
  if (isHandoffRunning || isChapterHandoff || skipOutboundForHandoff) return false;
  if (!awaitingAssistantReply) return false;
  const userText = pendingReplyText || lastPendingUserText || "";
  return !hasAnyAssistantActivitySinceUserTurn(userText);
}

function resetLearnyThinking() {
  learnyThinkingShown = false;
  if (learnyThinkingHideTimer) {
    clearTimeout(learnyThinkingHideTimer);
    learnyThinkingHideTimer = null;
  }
  if (!learnyThinkingEl) return;
  learnyThinkingEl.hidden = true;
  learnyThinkingEl.classList.remove("is-visible", "is-hiding");
  learnyThinkingEl.setAttribute("aria-busy", "false");
}

function updateLearnyThinkingUI() {
  if (!learnyThinkingEl) return;
  const want = shouldShowLearnyThinking();
  if (want === learnyThinkingShown) {
    if (want && chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    return;
  }
  learnyThinkingShown = want;
  if (learnyThinkingHideTimer) {
    clearTimeout(learnyThinkingHideTimer);
    learnyThinkingHideTimer = null;
  }
  if (want) {
    if (emptyState) emptyState.style.display = "none";
    learnyThinkingEl.hidden = false;
    learnyThinkingEl.classList.remove("is-hiding");
    learnyThinkingEl.setAttribute("aria-busy", "true");
    requestAnimationFrame(() => {
      learnyThinkingEl.classList.add("is-visible");
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    });
    return;
  }
  learnyThinkingEl.classList.remove("is-visible");
  learnyThinkingEl.classList.add("is-hiding");
  learnyThinkingEl.setAttribute("aria-busy", "false");
  learnyThinkingHideTimer = setTimeout(() => {
    learnyThinkingHideTimer = null;
    if (!learnyThinkingShown) {
      learnyThinkingEl.hidden = true;
      learnyThinkingEl.classList.remove("is-hiding");
    }
  }, 440);
}

function appendChatChrome() {
  if (!chatArea) return;
  if (emptyState) {
    if (!chatMessages.length) {
      if (emptyState.parentElement !== chatArea) chatArea.appendChild(emptyState);
      emptyState.style.display = "";
    } else {
      emptyState.style.display = "none";
    }
  }
  if (learnyThinkingEl && learnyThinkingEl.parentElement !== chatArea) {
    chatArea.appendChild(learnyThinkingEl);
  }
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
  if (isChapterHandoff || chapterTransitionActive || (actionState === "connecting" && isHandoffRunning)) {
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
  // Choice bar may force-mute for MCQ — sync before painting the mic button.
  updateLessonBanner();
  paintMuteButton();
  paintEndingEndButton();
  const callLive = actionState === "active";
  const handoffBusy = isHandoffRunning || isChapterHandoff || chapterTransitionActive;
  if (btnRetry) {
    btnRetry.hidden = actionState === "idle";
    btnRetry.disabled = !callLive || handoffBusy || isAutoReconnecting;
  }
  if (btnSend) btnSend.disabled = !callLive || handoffBusy;
  if (chatInput) chatInput.disabled = !callLive || handoffBusy;
  notifyCallState();
}

function sendClientText(text, { force = false } = {}) {
  if (!client?.connected) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  // Hard block: never send a second Ending Turn A Perfect-script to Live (ghost second audio).
  // Allow the in-flight first kick (introKickInFlight) — blocking that left empty chat on はじめる.
  if (
    (ending1Beat.introSpeechComplete ||
      ending1Beat.introHeardPerfect ||
      (ending1Beat.introAudioSent && !ending1Beat.introKickInFlight)) &&
    /what kind of fish should we catch|perfect!?\s*we made a fish tank/i.test(t)
  ) {
    dbg("sendClientText blocked; ending1 intro audio already sent", t.slice(0, 48));
    return false;
  }
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
  if (key === "opening") return false;
  if (key.startsWith("advance-")) return false;
  if (key.startsWith("beginner-jp")) return false;
  if (key.startsWith("ch2-repeat")) return false;
  if (key.startsWith("no-system")) return false;
  if (key.startsWith("final1-coach-")) return false;
  if (key.startsWith("final1-praise-cont")) return false;
  if (key.startsWith("ending1-coach-")) return false;
  if (key.startsWith("ending1-next-")) return false;
  if (key.startsWith("ending1-auto-")) return false;
  if (key.startsWith("ending1-finale-")) return false;
  if (key === "ending1-freetalk") return false;
  if (key === "ending1-freetalk-repair") return false;
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
  // Pure system/backend leaks (no real teacher content).
  if (
    looksLikeSystemBackendLeak(t) &&
    !/\b(hello|hi|how are you|what|can you|great|nice|perfect|こんにちは|きょうは|すきな|がらす|すな)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function looksLikeSystemBackendLeak(text) {
  return /たいむ\s*あうと|タイム\s*アウト|\btime\s*-?\s*outs?\b|\btimed?\s*out\b|システム(?:エラー|の|が)?|バックエンド|\bbackend\b|\bwebsocket\b|\bapi\s*error\b|せつぞく(?:エラー|きれ)|接続エラー|サーバ[ー]?|アプリの|mic(?:rophone)?\s*(?:error|timeout)|remaining time|のこりじかん/i.test(
    String(text || "")
  );
}

/** Remove backend/system phrases from displayed assistant text (keep teacher lines). */
function stripSystemBackendSpeech(text) {
  const original = String(text || "");
  let t = original;
  if (!t) return t;
  const hadLeak = looksLikeSystemBackendLeak(original);
  // Remove timeout / system clauses; keep prior punctuation.
  t = t.replace(/(?:たいむ\s*あうと|タイム\s*アウト)[^.。!！?？]*/gi, "");
  t = t.replace(/\btime\s*-?\s*outs?\b[^.!?]*/gi, "");
  t = t.replace(/\btimed?\s*out\b[^.!?]*/gi, "");
  t = t.replace(/(?:システム(?:エラー)?|バックエンド|せつぞくエラー|接続エラー)[^.。!！?？]*/gi, "");
  if (hadLeak) {
    t = t.replace(/もういちどいってみてね[。．.!！]?/gi, "");
  }
  t = t.replace(/です。\s*$/g, "。");
  t = t.replace(/[。．]{2,}/g, "。");
  t = t.replace(/([？?])\s*([。．])/g, "$1");
  return t.replace(/\s{2,}/g, " ").replace(/^[,.。、\s]+|[,.。、\s]+$/g, "").trim();
}

function maybeSystemBackendLeakNudge() {
  const text = lastAssistantText().trim();
  if (!text || !looksLikeSystemBackendLeak(text)) return;
  whenAssistantIdle(() => {
    if (!looksLikeSystemBackendLeak(lastAssistantText())) return;
    sendTeacherNote(
      `no-system-${normalizeUserText(text).slice(0, 32)}`,
      "[Teacher note — do not read aloud] CRITICAL: You spoke system/backend words (timeout / たいむあうと / etc). " +
        "NEVER say those. Speak ONLY as Learny to the child. " +
        "If you need a repeat: Sorry, can you say that again? ごめんね、もういちど いってくれる？ " +
        "Otherwise continue the CURRENT segment with one normal teacher question. Do NOT apologize about timeout/system."
    );
  }, "no-system");
}

function formatTeacherNote(text) {
  return (
    "[Coach — do not read aloud. Speak your reply out loud.]\n" +
    adaptTeacherNoteForLevel(String(text || ""))
      .replace(/^\[Teacher note[^\]]*\]\s*/i, "")
      .replace(/^\[HIDDEN coach[^\]]*\]\s*/i, "")
  );
}

function waitingOnChildAfterQuestion() {
  if (userSpokeSinceLastAssistantBubble()) return false;
  return endsWithLeadPrompt(lastAssistantText());
}

function buildSessionStartNudge() {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  const midResume = buildMidChapterResumeNudge(state);
  if (midResume) return midResume;
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
  // Sending client_content before Live setupComplete often drops the turn —
  // that left kids stuck on "つぎいこう…" for many seconds.
  if (!client.sessionReady) {
    if (kickOpts.handoff || kickOpts.reason) {
      pendingOpeningKickOpts = { ...kickOpts };
    }
    dbg("kickOpening deferred; waiting setup");
    return false;
  }
  if (actionState !== "active" && actionState !== "connecting") return false;
  const state = loadLessonState();
  // Ending Turn A: only forceEnding1Intro may speak — never also send ending1StartNudge.
  if (getCurrentSegment(state)?.id === "ending1") {
    if (claimEnding1IntroIfGeminiStarted()) {
      openingSent = true;
      pendingOpeningKickOpts = null;
      return false;
    }
    const ok = forceEnding1Intro(kickOpts.reason || kickOpts.handoff ? "opening-handoff" : "opening");
    // Only lock openingSent after a successful kick so SETUP_COMPLETE→active retry works.
    if (ok) {
      openingSent = true;
      pendingOpeningKickOpts = null;
      blockCoachUntilUserSpeaks = false;
    } else if (ending1Beat.introAudioSent || ending1Beat.introNoteSent || ending1Beat.introSpeechComplete) {
      openingSent = true;
      pendingOpeningKickOpts = null;
    } else {
      dbg("ending1 opening kick failed; will retry", kickOpts.reason || "opening");
    }
    return ok;
  }
  openingSent = true;
  pendingOpeningKickOpts = null;
  blockCoachUntilUserSpeaks = false;
  let nudge;
  if (kickOpts.handoff || kickOpts.reason === "stuck_retry") {
    nudge = buildPart1HandoffOpeningNudge(state, {
      lastQuote: kickOpts.lastQuote || "",
      reason: kickOpts.reason || "handoff",
    });
  } else {
    nudge = buildSessionStartNudge();
  }
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(nudge)), { force: true });
}

function sendTeacherNote(key, text, { allowRetry: _allowRetry = true } = {}) {
  // Segment advances, ending beats, and beginner JP repair may inject client_content.
  // Other coaches go through outbound prefixes on the child's turn.
  const allowed =
    key.startsWith("advance-") ||
    key.startsWith("ending1-next-") ||
    key.startsWith("ending1-auto-") ||
    key.startsWith("ending1-finale-") ||
    key.startsWith("beginner-jp") ||
    key.startsWith("no-system") ||
    key.startsWith("lead-cont-") ||
    key.startsWith("lead-") ||
    key === "warmup-stack" ||
    key.startsWith("warmup-") ||
    key.startsWith("ch2-no-tired") ||
    key.startsWith("ch2-elicit") ||
    key.startsWith("ch2-rally") ||
    key.startsWith("ch2-repeat");
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
    key.startsWith("ending1-next-") ||
    key.startsWith("ending1-auto-") ||
    key.startsWith("ending1-finale-") ||
    key.startsWith("beginner-jp") ||
    key.startsWith("no-system") ||
    key.startsWith("lead-cont-") ||
    key.startsWith("lead-") ||
    key.startsWith("warmup-") ||
    key.startsWith("ch2-no-tired") ||
    key.startsWith("ch2-elicit") ||
    key.startsWith("ch2-repeat");
  if (awaitingAssistantReply && !allowWhileAwaiting) {
    dbg("teacher note blocked", key);
    return false;
  }
  // English-only turns often end with a question — still allow JP repair / lead repair.
  if (
    waitingOnChildAfterQuestion() &&
    !allowWhileAwaiting &&
    !key.startsWith("lead-cont-") &&
    !key.startsWith("lead-")
  ) {
    dbg("teacher note blocked; waiting on child answer", key);
    return false;
  }
  sentTeacherNotes.add(key);
  if (isThrottledCoachNote(key)) coachNudgesSinceLastUserTurn += 1;
  dbg("teacher note", key);
  assistantTranscriptOpen = false;
  return sendClientText(formatTeacherNote(text));
}

function scheduleAssistantTurnEnd(extendAttempt = 0) {
  if (turnCloseTimer) clearTimeout(turnCloseTimer);
  const delay =
    getCurrentSegment()?.id === "daily1" && assistantTranscriptNeedsMoreTime() ? 1900 : 900;
  turnCloseTimer = setTimeout(() => {
    turnCloseTimer = null;
    if (assistantTranscriptNeedsMoreTime() && extendAttempt < 4) {
      scheduleAssistantTurnEnd(extendAttempt + 1);
      return;
    }
    if (assistantTurnTranscript.trim()) {
      applyAssistantTranscriptChunk("", { finished: true });
    } else {
      scheduleRepairIncompleteAssistantBubble();
    }
    assistantTranscriptOpen = false;
    runPostTurnCoachNudgesWhenSettled();
  }, delay);
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
    if (isMuted || isMcqChoiceUiActive()) return;
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
  return /\b(?:what|how|when|where|who|why|did you|do you|are you|will you|shall we|have you|is it|can you)\b/i.test(
    t
  );
}

function endsWithLeadPrompt(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const tail = t.slice(-160);
  if (/[？?]/.test(tail)) return true;
  if (assistantAskedQuestion(tail)) return true;
  if (/let me know|when you find|find sand|みつけたら|おしえて|tell me when/i.test(tail)) return true;
  return /(かな|できる|つくれる|作れる|いる|どっち|なに|何|どう|しよう|してみ|いえる|言える|いってみて|ってみて|選んでね|will you|what do|what's|what color|what time|shall we|can you|do you|can we|are you|say with me|try saying|repeat after|in english|together)\s*[!！.。]*$/i.test(
    tail
  );
}

function looksLikePraiseOnlyAssistant(text) {
  const t = String(text || "").trim();
  if (!t || endsWithLeadPrompt(t) || assistantAskedQuestion(t)) return false;
  if (
    /^(that'?s right|nice(?:\s+one)?|good(?:\s+job)?|great(?:\s+job)?|cool|perfect|okay|ok|yes|awesome|correct|you got it|well done|そうだね|いいね|ばっちり|ぱっちり|すごい|そのとおり|やったね)[!！.。\s,]*/i.test(
      t
    ) &&
    t.length < 120 &&
    !/favourite? color|すきな\s*いろ|let'?s make|つくろう|tell me when|つくれたら|can you say|って\s*えいご/i.test(t)
  ) {
    return true;
  }
  if (
    t.length < 100 &&
    !/[？?]/.test(t.slice(-80)) &&
    /(that'?s right|nice(?:\s+one)?[!！]?|good[!！]|great[!！]|perfect|you got it|そうだね|いいね|ばっちり|ぱっちり)/i.test(t) &&
    !/favourite? color|すきな\s*いろ|let'?s make|つくろう|tell me when|つくれたら/i.test(t)
  ) {
    return true;
  }
  return false;
}

function needsContinuationNudge(text) {
  const t = String(text || "").trim();
  if (!t || endsWithLeadPrompt(t)) return false;
  // Ending Turn A / free talk are client-owned — continuation nudges re-opened with Perfect!
  if (getCurrentSegment()?.id === "ending1") return false;
  // Final1 user-turn coach already says praise + next cue — global continuation nudge caused double speech.
  if (getCurrentSegment()?.type === "final1") return false;
  // Warmup: never invent a next beat while waiting after How are you / What did you do…
  if (getCurrentSegment()?.type === "warmup") {
    if (countWarmupUserReplies() < 1) return false;
    if (findWarmupReplyAfterInvite()) return false;
  }
  if (assistantAskedQuestion(t)) return false;
  if (looksLikePraiseOnlyAssistant(t)) return true;
  // Ch4: color saved but still not past Let's make / Beat B — do not stop on praise.
  if (
    getCurrentSegment()?.id === "ch4" &&
    ch4HasFavoriteColor() &&
    !ch4AssistantSaidBeatB(t) &&
    !/tell me when you make|つくれたら「/i.test(t)
  ) {
    return true;
  }
  // Ch4: Let's make spoken but Beat B / MCQ not yet — do not stop on praise.
  if (
    getCurrentSegment()?.id === "ch4" &&
    !ch4AssistantSaidBeatB(t) &&
    /coloured glass|colored glass|いろの\s*がらす|の\s*がらすを\s*つくろう/i.test(t) &&
    !/tell me when you make|作れたら「|つくれたら「/i.test(t)
  ) {
    return true;
  }
  // Ch3 false finish / praise with no next lead.
  if (
    getCurrentSegment()?.id === "ch3" &&
    !/[？?]/.test(t) &&
    /now we (?:have|can)|we have glass|we can make (?:the )?glass|we can make the tank|ガラスもできた|がらすが\s*つくれる|これでガラス/i.test(t)
  ) {
    return true;
  }
  // Ch5: Learny said a CHILD target phrase herself, or ended without eliciting.
  if (
    getCurrentSegment()?.id === "ch5" &&
    !/[？?]/.test(t) &&
    !/can you say|っていってみて|いってみて|の\s*えいごを\s*選んで/i.test(t) &&
    /\b(i'?m building a tank|i made a tank|it looks good|i put glass)\b|すいそうを\s*作ってる|すいそうを\s*作った|いい感じに\s*できた/i.test(t)
  ) {
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
    return ch2CoachHint() || " Ch2: follow script — place → left/right → hot → see → We found some sand! elicit.";
  }
  if (seg?.id === "ch3") {
    if (userHasMadeGlassPhrase()) {
      return " Ch3 done: brief praise + complete_segment(ch3) → Mini quiz 1.";
    }
    if (userHasNeedToMakeGlassPhrase()) {
      return (
        " Ch3 Step 2: Are you done making the glass? " + PART1_ELICIT_JA.ch3MadeGlass + " → I made glass! " +
        "FORBIDDEN: Now we have glass / make the tank / praise-only."
      );
    }
    return " Ch3 Step 1: Let's make some glass! " + PART1_ELICIT_JA.ch3NeedGlass + " → I need to make glass.";
  }
  if (seg?.id === "ch4") {
    if (userHasMadeColorGlassPhrase() && ch4AssistantSaidBeatB()) {
      return " Ch4 done: praise + complete_segment(ch4) → Chapter 5 walls.";
    }
    if (ch4AssistantSaidBeatB()) {
      return " Ch4 make+tell spoken — WAIT for I made [color] glass! MCQ tap. FORBIDDEN: complete_segment / walls / repeat favorite color.";
    }
    if (ch4HasFavoriteColor()) {
      const color = loadLessonState().memories.favoriteColor;
      return (
        " Ch4: color saved (" +
        color +
        "). Speak EXACTLY Beat A2+B COMBINED NOW: " +
        ch4CombinedMakeAndTellSpeak(color) +
        " Then WAIT for MCQ. FORBIDDEN: praise-only / ask favorite color again / complete_segment."
      );
    }
    return (
      " Ch4: What's your favorite color? → ONE combined make+tell line → I made [color] glass! MCQ. " +
      "FORBIDDEN: finishing Ch4 on color alone / MCQ before つくれたら elicit."
    );
  }
  if (seg?.id === "ch5") {
    if (userHasLooksGoodPhrase()) {
      return " Ch5 done: praise + complete_segment(ch5) → Daily English.";
    }
    if (userHasMadeTankPhrase()) {
      return " Ch5: elicit Beat 4 How does it look? " + PART1_ELICIT_JA.ch5LooksGood + " → It looks good! FORBIDDEN: say it yourself / praise-only.";
    }
    if (userHasBuildingTankPhrase()) {
      return " Ch5: elicit Beat 3 Are you done making it? 「すいそうを作った」→ I made a tank! FORBIDDEN: say it yourself / praise-only.";
    }
    if (userHasPutGlassPhrase()) {
      return " Ch5: elicit Beat 2 Tell me what you're building! " + PART1_ELICIT_JA.ch5Building + " → I'm building a tank. FORBIDDEN: say it yourself / jump to I made a tank.";
    }
    return (
      " Ch5: Beat1 Now let's make a tank wall! Where do you want to put the glass? Tell me! → I put glass here → " +
      "Beat2 Tell me what you're building! " +
      PART1_ELICIT_JA.ch5Building +
      " → I'm building a tank → Beat3 Are you done making it? " +
      PART1_ELICIT_JA.ch5MadeTank +
      " → I made a tank! → " +
      "Beat4 How does it look? " +
      PART1_ELICIT_JA.ch5LooksGood +
      " → It looks good! ONE beat per turn. Never say target phrases yourself."
    );
  }
  if (seg?.id === "quiz1") {
    return quiz1CoachHint() || " Quiz1: NEXT listed quiz item.";
  }
  if (seg?.type === "daily_english" || seg?.id === "daily1") {
    if (daily1ReadyForBackToTank()) {
      return (
        " Daily English: 4+ rallies done — " +
        daily1BridgeTurnInstruction(lastPendingUserText || recentUserMessages(1)[0] || "") +
        " then complete_segment(daily1). FORBIDDEN: more everyday questions."
      );
    }
    return (
      " Daily English: rally " +
      daily1Chat.rallies +
      "/" +
      DAILY1_MIN_RALLIES +
      "+ — reaction + ONE everyday question. " +
      daily1KnownColorHint() +
      " FORBIDDEN: favorite color. FORBIDDEN: Let's practice today's English / back to the tank before 4 rallies."
    );
  }
  if (seg?.id === "ch6") {
    if (userHasTankReadyPhrase()) {
      return " Ch6 done: praise + complete_segment(ch6) → Final challenge.";
    }
    if (userHasImDonePhrase()) {
      return " Ch6: elicit Beat 4 Is the tank ready for the fishes to swim? 「さかなを いれられる じゅんびが できた！」→ My tank is ready! FORBIDDEN: Almost after I'm done!";
    }
    if (userHasMoreSandPhrase()) {
      return " Ch6: elicit Beat 3 Are you done? 「できた！」→ I'm done!";
    }
    if (userCh6PhraseProgress().bottom) {
      return " Ch6: elicit Beat 2 " + PART1_ELICIT_JA.ch6MoreSand + " → I need more sand. Do NOT backtrack to Beat 1.";
    }
    return (
      " Ch6: Beat1 Let's make a basement inside the tank! → I put the sand on the bottom → Beat2 " +
      PART1_ELICIT_JA.ch6MoreSand +
      " → more sand → Beat3 " +
      PART1_ELICIT_JA.ch6ImDone +
      " → I'm done! → " +
      "Beat4 Is the tank ready for the fishes to swim? " +
      PART1_ELICIT_JA.ch6TankReady +
      " → My tank is ready! ONE beat per turn."
    );
  }
  if (seg?.id === "final1") {
    return final1CoachHint() || " Final1: 〜は英語で？ prompts only.";
  }
  if (seg?.id === "ending1") {
    return ending1CoachHint();
  }
  if (seg?.type === "warmup") {
    return " Warmup: react on their topic first; invite turn = short reaction + Oh! Today… in the same message.";
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
        "Continue NOW with exactly ONE forward question (do not repeat the praise or reuse すごい / That's right)." +
        segmentContinuationHint() +
        beginnerTurnHint()
    );
  }, "lead-cont");
}

function finishAssistantTurn() {
  if (turnEndProcessed) return;
  turnEndProcessed = true;
  const gotReply =
    !pendingReplyText || hasAnyAssistantActivitySinceUserTurn(pendingReplyText);
  // Ending auto/finale chains must run even while audio is draining — do this
  // before we mark "waiting for child", which blocks other coaches.
  if (getCurrentSegment()?.id === "ending1") {
    maybeChainEnding1AutoBeat();
    maybeChainEnding1FinaleBeat();
    maybeEnding1OffScriptNudge();
  }
  if (gotReply) {
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    // During ending intro/finale client forces, keep chaining — do not lock coaches to "wait for child".
    const endingChaining =
      getCurrentSegment()?.id === "ending1" &&
      (!ending1AutoIntroComplete() ||
        (ending1Beat.finaleCoachSent > 0 && !ending1FinaleComplete()));
    if (!endingChaining) {
      blockCoachUntilUserSpeaks = true;
    }
  }
  scheduleAssistantTurnEnd();
  if (getCurrentSegment()?.id === "ending1" || loadLessonState().complete) {
    ensureEnding1HangUpWatch();
  }
}

function armLeadWatch() {
  if (actionState !== "active" || !client?.connected) return;
  // Allow lead repair when the last turn was praise-only; otherwise wait for the child.
  if (blockCoachUntilUserSpeaks && !needsContinuationNudge(lastAssistantText())) return;
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
  // Only count audio that arrived AFTER the user turn — leftover playback must not
  // look like a reply (that left kids stuck with no nudge).
  if (lastAssistantAudioAt >= lastUserTurnAt) return true;
  if (userText && hasAssistantReplySinceUser(userText)) return true;
  return false;
}

/** Tool replies must stay SILENT — WHEN_IDLE coach text triggers extra spoken turns. */
function toolReplyScheduling(_preferSilent = "SILENT") {
  return "SILENT";
}

function markAssistantTranscriptChunk() {
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
    /^(ok+|okay|k+|yes|yea+h?|yep|yup|ya|sure|of course|let'?s go|mhm+|uh[\s-]?huh|うん+|はい|ええ|いいよ|やる|たすける|手伝う|いいね)$/i.test(
      t
    )
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
  return /what did you do|anything fun|did you do|how are you|are you hungry|what time|what color|what do you like|what'?s your favorite|did you eat|きょうはなに|たのしいこと|どうですか|おなか|好き|なにをして|なにか\s*たのしい/i.test(
    String(text || "").toLowerCase()
  );
}

const WARMUP_AFTER_MOOD_SPEAK =
  "That's great! What did you do today? よかった！きょうは なにを したの？";

function looksLikeWarmupAfterMoodFollowUp(text) {
  return /what did you do today|what did you do\b|きょうは\s*なにを\s*した/i.test(String(text || ""));
}

function looksLikeWarmupWrongAfterMoodFollowUp(assistantText) {
  const t = String(assistantText || "");
  if (looksLikeWarmupAfterMoodFollowUp(t) || looksLikeTankInvite(t)) return false;
  return /eat lunch|lunch yet|おひる|ひるごはん|are you hungry|おなか|what kind of game|what did you eat|did you do anything fun|anything fun today/i.test(
    t
  );
}

function shouldCoachWarmupAfterMoodFollowUp(userText) {
  if (getCurrentSegment()?.type !== "warmup") return false;
  if (!looksLikeMoodAnswer(userText) || looksLikeWarmupNegativeReply(userText)) return false;
  if (hasSubstantiveWarmupContent(userText)) return false;
  return countWarmupUserReplies() === 1;
}

/** Short no / nothing answers — must NOT re-ask the same follow-up. */
function looksLikeWarmupNegativeReply(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 48) return false;
  return /^(no|nope|nah|not really|nothing|nothin'?g?|none|いいえ|いや|ううん|とくにない|なんでもない|べつに|特にない)([.!?！？\s]|$)/i.test(
    t
  );
}

/** Fingerprint of the last English/Japanese question so we can forbid repeats. */
function warmupQuestionFingerprint(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return "";
  const en = t.match(
    /((?:did you|do you|what|how|are you|will you|can you|shall we)[^?？!.!]{0,80})/i
  );
  if (en) {
    return en[1]
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
  }
  const ja = t.match(/([^。．!！?？]{0,40}[？?])/);
  if (ja) {
    return ja[1].replace(/\s+/g, "").slice(0, 40);
  }
  return "";
}

function lastWarmupQuestionBeforeUser() {
  return warmupQuestionFingerprint(assistantBeforeLastUserMessage());
}

function assistantRepeatedWarmupQuestion(assistantText, priorAssistantText) {
  const a = warmupQuestionFingerprint(assistantText);
  const b = warmupQuestionFingerprint(priorAssistantText);
  if (!a || !b) return false;
  if (a === b) return true;
  // Near-duplicate (e.g. "anything fun today" vs "なにかたのしいこと")
  const aCore = a.replace(/\b(today|きょうは|なにか|anything)\b/g, "").replace(/\s+/g, " ").trim();
  const bCore = b.replace(/\b(today|きょうは|なにか|anything)\b/g, "").replace(/\s+/g, " ").trim();
  if (aCore.length >= 8 && bCore.length >= 8 && (aCore.includes(bCore.slice(0, 12)) || bCore.includes(aCore.slice(0, 12)))) {
    return true;
  }
  // Same "fun today" family
  if (/fun|たのしい/.test(a) && /fun|たのしい/.test(b)) return true;
  return false;
}

function warmupAntiRepeatForbid() {
  const fp = lastWarmupQuestionBeforeUser();
  if (!fp) return "";
  return ` FORBIDDEN: repeat your previous question ("${fp}"). Ask something DIFFERENT or invite if ready.`;
}

function countWarmupUserReplies() {
  if (getCurrentSegment()?.type !== "warmup") return 0;
  return chatMessages.filter((m) => m.type === "user").length;
}

function lastUserMessageText() {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type === "user") return String(chatMessages[i].text || "");
  }
  return "";
}

/** Mood / yes-only answers — tank invite may follow later; no content to react to. */
function isWarmupMoodOrAckOnly(userText) {
  const t = String(userText || "").trim();
  if (!t) return true;
  if (looksLikeAgree(t) || looksLikeAgree(t, { afterTankInvite: true })) return true;
  if (
    /^(i'?m |i am )?(good|fine|ok|okay|great|tired|hungry|happy|sad|元気|げんき|いい|だいじょうぶ)[.!！？?]*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^(はい|うん|yes|yeah|yep|no|いいえ|nothin'?g|なんでもない)[.!！？?]*$/i.test(t)) {
    return true;
  }
  return false;
}

/** Child shared real everyday content (not just mood / yes). */
function hasSubstantiveWarmupContent(userText) {
  const t = String(userText || "").trim();
  if (!t || isWarmupMoodOrAckOnly(t)) return false;
  if (
    /\b(went|go|going|ate|eat|played|play|saw|see|watch|watched|cafe|school|park|friend|home|movie|game|swim|shop|bought|made|did|visited|study|studied|studying|homework|read|reading|drew|draw|drawing|slept|sleep|walked|walk|ran|run|cooked|cook|helped|help|worked|work|practiced|practice|english|math|lesson|class|soccer|football|baseball|piano|music)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /(カフェ|がっこう|こうえん|ともだち|うち|えいが|ゲーム|たべ|いった|あそ|みた|べんきょう|しゅくだい|よんだ|あるい|はしった)/i.test(
      t
    )
  ) {
    return true;
  }
  // Short activity answers like "i studied" / "played games"
  if (/^(i|i'?m|i am|we|my)\s+\w+/i.test(t) && !isWarmupMoodOrAckOnly(t)) return true;
  const words = t
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= 2 && !isWarmupMoodOrAckOnly(t);
}

function assistantMentionsUserContent(assistantText, userText) {
  const a = String(assistantText || "").toLowerCase();
  const u = String(userText || "").toLowerCase();
  const stop = new Set([
    "went",
    "the",
    "and",
    "you",
    "that",
    "this",
    "with",
    "have",
    "good",
    "today",
    "yesterday",
    "just",
    "some",
    "from",
    "was",
    "were",
    "did",
    "to",
    "for",
    "my",
    "a",
    "an",
    "i",
    "im",
    "was",
  ]);
  const tokens = u.match(/[a-zぁ-ん]{3,}/g) || [];
  const content = tokens.filter((tok) => !stop.has(tok));
  if (!content.length) return false;
  // studied ↔ study stem match
  return content.some((tok) => {
    if (a.includes(tok)) return true;
    if (tok.endsWith("ied") && a.includes(tok.slice(0, -3) + "y")) return true;
    if (tok.endsWith("ed") && a.includes(tok.slice(0, -2))) return true;
    if (tok.endsWith("ing") && a.includes(tok.slice(0, -3))) return true;
    return false;
  });
}

/** Tank invite that starts with bare Oh! Today… — missing a short reaction first. */
function assistantTankInviteMissingLeadReaction(text) {
  if (!looksLikeTankInvite(text)) return false;
  const t = String(text || "").trim();
  const inviteAt = t.search(
    /oh[!,.]?\s*today i want|will you help me make (?:a )?fish tank|そうだ[！!].*きょうは|いっしょに\s*つくれる/i
  );
  if (inviteAt < 0) return false;
  if (inviteAt === 0) return true;
  const before = t.slice(0, inviteAt).trim();
  if (before.length < 2) return true;
  // Only a hollow Oh!/Nice! before the invite still counts as missing a real reaction.
  if (/^(oh|nice|wow|cool|neat)[!！.。,]*$/i.test(before)) return true;
  return false;
}

/** Hollow Oh!/Nice! then tank invite — no real reaction. */
function assistantHollowThenTankInvite(text) {
  return assistantTankInviteMissingLeadReaction(text);
}

/** Tank invite right after the child shared news, with no real reaction to their words. */
function assistantJumpedTopicWithoutReacting(assistantText, userText = lastUserMessageText()) {
  if (!looksLikeTankInvite(assistantText)) return false;
  if (isWarmupMoodOrAckOnly(userText)) return false;
  if (assistantMentionsUserContent(assistantText, userText)) return false;
  // Any non-mood user answer + tank invite without naming their content = jump
  if (hasSubstantiveWarmupContent(userText) || assistantHollowThenTankInvite(assistantText)) {
    return true;
  }
  return false;
}

function warmupTankInviteAllowedYet() {
  // Need enough chat, and the child's LAST line must not be new content to react to.
  if (countWarmupUserReplies() < 3) return false;
  if (hasSubstantiveWarmupContent(lastUserMessageText())) return false;
  return true;
}

/** Everyday chat + tank invite (or multiple questions) in one bubble — child never got to answer. */
function assistantWarmupStackedTurn(text) {
  const t = String(text || "");
  if (assistantDoubledHowAreYou(t)) return true;
  if (assistantJumpedTopicWithoutReacting(t)) return true;
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
  return assistantHasStackedEnglishQuestions(t);
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
  // No user turn yet — do NOT fall back to the latest assistant line
  // (that falsely looked like a "repeated question" and auto-spoke That's great!).
  return "";
}

function canCompleteWarmupPart1(userQuote = "") {
  const quote = String(
    userQuote || findWarmupReplyAfterInvite() || recentUserMessages(1)[0] || ""
  ).trim();
  if (!quote) return false;
  // Any reply after the tank invite advances — yes, no, or anything else.
  if (findWarmupReplyAfterInvite()) return true;
  return assistantWarmupInviteOnly(assistantBeforeLastUserMessage());
}

/** Any user message that came right after Learny's fish-tank invite. */
function findWarmupReplyAfterInvite() {
  if (getCurrentSegment()?.type !== "warmup") return "";
  for (let i = 0; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m.type !== "user" && m.type !== "user-transcript") continue;
    const quote = String(m.text || "").trim();
    if (!quote) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (chatMessages[j].type !== "assistant") continue;
      if (assistantWarmupInviteOnly(chatMessages[j].text)) return quote;
      break;
    }
  }
  return "";
}

/** @deprecated alias — invite reply no longer requires agree wording */
function findWarmupAgreeAfterInvite() {
  return findWarmupReplyAfterInvite();
}

function tryCompleteWarmupIfUserAgreedAfterInvite() {
  if (getCurrentSegment()?.type !== "warmup") return false;
  const quote = findWarmupReplyAfterInvite();
  if (!quote) return false;
  const advance = maybeCompleteWarmupFromClient(quote);
  if (advance) {
    dbg("warmup recovered after invite reply", quote.slice(0, 24));
    return true;
  }
  return false;
}

function lastAssistantInvitedTankHelp() {
  return looksLikeTankInvite(lastAssistantText());
}

function suggestWarmupFollowUpHint(userText) {
  const t = String(userText || "").toLowerCase();
  if (looksLikeWarmupNegativeReply(t) || /nothing|nothin|なんでもない|とくにない/.test(t)) {
    return "Warm Okay! / そっか！だいじょうぶ！ Then ONE DIFFERENT gentle question (school? food? games?) — never re-ask the same fun/today question.";
  }
  if (/english|えいご/.test(t)) return "ONE follow-up about English (Was it fun?).";
  if (/stud|べんきょう|homework|しゅくだい/.test(t)) return "ONE follow-up about studying (Was it hard?).";
  if (/cafe|カフェ|eat|ate|food|たべ|ごはん/.test(t)) return "ONE follow-up about food (Was it yummy?).";
  if (/play|game|ゲーム|soccer|football|baseball|piano|music/.test(t)) {
    return "ONE follow-up about play (Was it fun?).";
  }
  if (/school|がっこう|class|lesson/.test(t)) return "ONE follow-up about school (Was school fun?).";
  return "React to their words + ONE natural follow-up (different from your last question).";
}

function buildWarmupUserCoachNote(userText) {
  if (getCurrentSegment()?.type !== "warmup") return "";
  // After tank invite, any reply advances to Ch1 — do not coach more warmup chat.
  if (assistantWarmupInviteOnly(assistantBeforeLastUserMessage())) {
    return "";
  }
  if (looksLikeAgree(userText)) return "";
  const snippet = String(userText || "").trim().slice(0, 100);
  const replies = countWarmupUserReplies();
  const followHint = suggestWarmupFollowUpHint(userText);
  const antiRepeat = warmupAntiRepeatForbid();

  // Child said no / nothing — acknowledge and move on; never loop the same question.
  if (looksLikeWarmupNegativeReply(userText)) {
    if (replies >= 3 || warmupTankInviteAllowedYet()) {
      return (
        `Child said "${snippet}" (no/nothing). Short Okay! / そっか！ THEN Oh! Today I want to make a fish tank. Will you help me make it? ` +
        `いっしょに つくれる？ Then WAIT — any reply advances to Chapter 1.` +
        antiRepeat
      );
    }
    // ONE concrete question only — listing two examples made Learny ask both (audio without text).
    return (
      `Child said "${snippet}" (no/nothing). Warm Okay! / そっか！だいじょうぶ！ ` +
      `Then speak EXACTLY ONE question (EN then matching ひらがな) and WAIT: Did you play anything fun? なにか たのしいこと した？ ` +
      `FORBIDDEN: a second question in the same turn; What did you do today? again; Did you do anything fun today? again.` +
      antiRepeat
    );
  }

  // Beat 2 after How are you — mood-only answers get the scripted today question.
  if (shouldCoachWarmupAfterMoodFollowUp(userText)) {
    return (
      `Child answered mood/feeling: "${snippet}". ` +
      `Speak EXACTLY: ${WARMUP_AFTER_MOOD_SPEAK} ` +
      `FORBIDDEN: Thank you / ありがとう; Did you eat lunch yet? / Are you hungry?; two questions; tank invite.` +
      antiRepeat
    );
  }

  // Child shared real news — react to THAT before any tank invite.
  if (hasSubstantiveWarmupContent(userText)) {
    return (
      `Child shared "${snippet}". Warm human reaction + ONE curious follow-up about that. ` +
      followHint +
      " FORBIDDEN: tank invite this turn; robotic You X! What did you X?" +
      antiRepeat
    );
  }

  if (replies < 3 || !warmupTankInviteAllowedYet()) {
    return (
      `Warmup ${replies}/3+. ${followHint} ONE follow-up, WAIT. FORBIDDEN: tank invite.` +
      antiRepeat
    );
  }
  return (
    `Invite turn: short reaction to "${snippet}" THEN Oh! Today I want to make a fish tank. Will you help me make it? ` +
    `そっか！そうだ！きょうは…いっしょに つくれる？ Then WAIT — any child reply advances to Chapter 1. FORBIDDEN: bare Oh! Today with no reaction.` +
    antiRepeat
  );
}

function maybeWarmupCoachOnUserTurn(_userText, { fromVoice: _fromVoice = false } = {}) {
  // Warmup coach is injected on the child's outbound turn (typed + voice) — not as a late note.
}

function maybeWarmupCoachNudge() {
  const seg = getCurrentSegment();
  if (seg?.type !== "warmup") return;
  // Opening beat must WAIT — never invent "That's great!" before the child answers.
  if (countWarmupUserReplies() < 1) return;
  if (waitingOnChildAfterQuestion() && !assistantWarmupStackedTurn(lastAssistantText())) return;

  const assistant = lastAssistantText();
  const lastUser = lastUserMessageText();
  if (!lastUser.trim()) return;
  const priorAssistant = assistantBeforeLastUserMessage();
  const jumped = assistantJumpedTopicWithoutReacting(assistant, lastUser);
  const inviteNeedsLead =
    looksLikeTankInvite(assistant) &&
    assistantTankInviteMissingLeadReaction(assistant) &&
    !hasSubstantiveWarmupContent(lastUser);
  const repeatedQ =
    Boolean(priorAssistant) &&
    assistantRepeatedWarmupQuestion(assistant, priorAssistant);

  if (repeatedQ && !looksLikeTankInvite(assistant)) {
    // Already on the correct after-mood line — stop looping silent audio / re-asks.
    if (looksLikeWarmupAfterMoodFollowUp(assistant) && looksLikeWarmupAfterMoodFollowUp(priorAssistant)) {
      return;
    }
    const note =
      "[Teacher note — do not read aloud] WRONG: you repeated the same question after the child already answered (\"" +
      lastUser.slice(0, 40) +
      "\"). Do NOT ask that again. " +
      (looksLikeWarmupNegativeReply(lastUser) || countWarmupUserReplies() >= 3
        ? "Say Okay! / そっか！ then Oh! Today I want to make a fish tank. Will you help me make it? いっしょに つくれる？ WAIT."
        : shouldCoachWarmupAfterMoodFollowUp(lastUser)
          ? `Say EXACTLY: ${WARMUP_AFTER_MOOD_SPEAK} — never a second question; never Did you eat lunch yet? after mood.`
          : "Warm reaction to their words + ONE DIFFERENT follow-up. FORBIDDEN: repeat the same question; invent That's great! without their mood answer.");
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    sendTeacherNote(
      `warmup-repeat-${normalizeUserText(lastUser).slice(0, 24)}`,
      withBeginnerSpeakRule(formatTeacherNote(note + beginnerTurnHint()))
    );
    return;
  }

  if (!assistantWarmupStackedTurn(assistant) && !jumped && !inviteNeedsLead) return;

  if (!looksLikeTankInvite(assistant) && assistantBubbleHasStackedQuestions(assistant)) {
    maybeInterruptStackedAssistantSpeech(assistant);
    dbg("warmup stacked questions — display trimmed, interrupt audio, skip extra coach turn");
    return;
  }

  let note = "[Teacher note — do not read aloud] WRONG: you moved on without waiting for the child. ";
  if (jumped) {
    note =
      "[Teacher note — do not read aloud] WRONG: child said \"" +
      lastUser.slice(0, 80) +
      "\" but you jumped to the fish tank without reacting. " +
      "STOP the tank invite. REACT specifically to their words first (e.g. You studied! Nice! What did you study? / べんきょうしたんだ！なにを べんきょうしたの？), WAIT. " +
      "Tank invite only on a later turn after the chat feels done.";
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    sendTeacherNote(
      `warmup-jump-${normalizeUserText(lastUser).slice(0, 24)}`,
      withBeginnerSpeakRule(formatTeacherNote(note + beginnerTurnHint()))
    );
    return;
  }
  if (inviteNeedsLead) {
    note =
      "[Teacher note — do not read aloud] WRONG: you started with bare Oh! Today… " +
      "Redo in ONE turn: short reaction to \"" +
      lastUser.slice(0, 40) +
      "\" THEN Oh! Today I want to make a fish tank. Will you help me make it? " +
      "Example: Okay! Oh! Today I want to make a fish tank… / そっか！そうだ！きょうは…いっしょに つくれる？ Then WAIT.";
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    sendTeacherNote(
      `warmup-invite-lead-${normalizeUserText(lastUser).slice(0, 24)}`,
      withBeginnerSpeakRule(formatTeacherNote(note + beginnerTurnHint()))
    );
    return;
  }
  if (looksLikeTankInvite(assistant) && looksLikeWarmupChatQuestion(assistant)) {
    note +=
      "You combined an everyday follow-up question AND the tank invite. " +
      "On the invite turn use: short reaction + Oh! Today… help question only — no extra What did you do… chat question.";
  } else if (assistantSkippedWarmupWait(assistant)) {
    note +=
      "You combined tank invite + Chapter 1. Invite only (reaction + いっしょに つくれる？), then WAIT — any reply advances — no Thank you, no glass question.";
  } else {
    note += "ONE question per turn only — then WAIT for the child to answer before your next line.";
  }

  whenAssistantIdle(() => {
    if (countWarmupUserReplies() < 1) return;
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

/** After child says I made glass, finish ch3 → Mini quiz 1 handoff. */
function maybeCompleteCh3FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch3") return "";
  if (!canFinishCh3Part1(userText)) return "";
  const result = completeSegment(seg.id, {
    userQuote:
      /\b(i made glass|made glass)\b/i.test(userText)
        ? userText
        : recentUserMessages()
            .slice()
            .reverse()
            .find((t) => /\b(i made glass|made glass)\b/i.test(t)) || userText,
  });
  if (!result.ok || result.alreadyDone) return "";
  dbg("ch3 auto-complete", userText);
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

/** After back-to-tank bridge, finish daily1 → Chapter 6 handoff. */
function maybeCompleteDaily1FromClient(userText = "") {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "daily1") return "";
  syncDaily1RalliesFromChat();
  if (assistantSaidDaily1BackToTank(lastAssistantText()) || assistantSaidDaily1BackToTank(recentAssistantMessages(6).join("\n"))) {
    daily1Chat.backToTankSpoken = true;
  }
  if (!canCompleteDaily1Part1()) return "";
  const result = completeSegment(seg.id, {
    userQuote: String(userText || lastPendingUserText || "daily english done").slice(0, 80),
  });
  if (!result.ok || result.alreadyDone) return "";
  dbg("daily1 auto-complete", daily1Chat.rallies);
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

/** After child says I made [color] glass!, finish ch4 → Chapter 5 walls handoff. */
function maybeCompleteCh4FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch4") return "";
  if (!canFinishCh4Part1(userText)) return "";
  const result = completeSegment(seg.id, {
    userQuote:
      userHasMadeColorGlassPhrase(userText)
        ? userText
        : recentUserMessages()
            .slice()
            .reverse()
            .find((t) => userHasMadeColorGlassPhrase(t)) || userText,
  });
  if (!result.ok || result.alreadyDone) return "";
  dbg("ch4 auto-complete", userText);
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

/** After child says It looks good!, finish ch5 → Daily English handoff. */
function maybeCompleteCh5FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch5") return "";
  if (!canFinishCh5Part1(userText)) return "";
  const result = completeSegment(seg.id, {
    userQuote:
      /\b(it looks good|looks good)\b/i.test(userText)
        ? userText
        : recentUserMessages()
            .slice()
            .reverse()
            .find((t) => /\b(it looks good|looks good)\b/i.test(t)) || userText,
  });
  if (!result.ok || result.alreadyDone) return "";
  dbg("ch5 auto-complete", userText);
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

/** Finish Ch1 when both I need glass + I need sand are said — hand off to Chapter 2. */
function maybeCompleteCh1FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (state.lessonId !== "part1" || seg?.id !== "ch1") return "";
  if (!canCompleteCh1Part1()) return "";
  // Prefer the sand phrase quote when both are done on this turn.
  const quote =
    /\b(i need sand|need sand)\b/i.test(String(userText || ""))
      ? userText
      : recentUserMessages()
          .slice()
          .reverse()
          .find((t) => /\b(i need sand|need sand)\b/i.test(t)) || userText;
  const result = completeSegment(seg.id, { userQuote: quote });
  if (!result.ok || result.alreadyDone) return "";
  dbg("ch1 auto-complete", quote);
  try {
    questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  resetCh2Search();
  if (afterSegmentAdvanced(seg.id, result, { lastQuote: quote })) {
    return HANDOFF_MARKER;
  }
  return buildAdvanceNudge(result.state);
}

/** Finish Ch2 after English I found some sand! — hard handoff to Chapter 3 make glass. */
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
  if (afterSegmentAdvanced(seg.id, result, { lastQuote: userText })) {
    return HANDOFF_MARKER;
  }
  return buildAdvanceNudge(result.state);
}

function clearAwaitingAssistantReply() {
  awaitingAssistantReply = false;
  pendingReplyText = "";
  updateLearnyThinkingUI();
}

function armPendingReplyWatch(userText, attempt = 0, { fromVoice = false } = {}) {
  if (pendingReplyWatchId) {
    clearTimeout(pendingReplyWatchId);
    pendingReplyWatchId = null;
  }
  pendingReplyText = userText;
  // Ch2: wait longer before forcing — early forces stacked on Gemini's real reply (= doubling).
  const delay = attempt === 0 ? REPLY_WATCH_MS : REPLY_WATCH_RETRY_MS;
  pendingReplyWatchId = setTimeout(() => {
    pendingReplyWatchId = null;
    if (actionState !== "active" || !client?.connected) return;
    // Free talk: only a chat bubble counts as a reply. Leftover playback audio from the
    // previous turn used to clear the watch and leave the child with no answer.
    const freeTalkWaiting =
      getCurrentSegment()?.id === "ending1" && isEnding1FreeTalkActive();
    if (freeTalkWaiting) {
      if (hasAssistantReplySinceUser(userText)) {
        clearAwaitingAssistantReply();
        return;
      }
    } else if (
      hasAssistantReplySinceUser(userText) ||
      hasAnyAssistantActivitySinceUserTurn(userText)
    ) {
      clearAwaitingAssistantReply();
      return;
    }

    const nudge = () => {
      if (actionState !== "active" || !client?.connected) return;
      if (freeTalkWaiting) {
        if (hasAssistantReplySinceUser(userText)) {
          clearAwaitingAssistantReply();
          return;
        }
      } else if (
        hasAssistantReplySinceUser(userText) ||
        hasAnyAssistantActivitySinceUserTurn(userText)
      ) {
        clearAwaitingAssistantReply();
        return;
      }
      if (fromVoice) {
        if (needsEnding1Opening()) {
          dbg("voice ending1 opening fallback", userText.slice(0, 32));
          kickEnding1AutoIntro();
          if (attempt + 1 < REPLY_WATCH_MAX) {
            armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          } else {
            clearAwaitingAssistantReply();
          }
          return;
        }
        if (getCurrentSegment()?.id === "ending1" && ending1Beat.finaleRequested) {
          dbg("voice ending1 finale reply-watch force", userText.slice(0, 32));
          flushEnding1NextBeatCoach("voice-reply-watch");
          if (attempt + 1 < REPLY_WATCH_MAX) {
            armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          } else {
            clearAwaitingAssistantReply();
          }
          return;
        }
        if (getCurrentSegment()?.id === "ending1" && isEnding1FreeTalkActive()) {
          // Free talk must freestyle — never re-send Child said:… (that double-spoke).
          if (attempt === 0) {
            closeOpenAudioTurn();
            armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
            return;
          }
          if (!userTurnSentViaClientText) {
            dbg("voice ending1 free-talk reply-watch", userText.slice(0, 32));
            sendClientText(
              withBeginnerSpeakRule(
                buildChildOutbound(
                  userText,
                  buildEnding1FreeTalkOutboundCoach(userText)
                )
              ),
              { force: true }
            );
            userTurnSentViaClientText = true;
          } else {
            dbg("voice ending1 free-talk recovery", userText.slice(0, 32));
            nudgeEnding1FreeTalkReply(userText);
          }
          if (attempt + 1 < REPLY_WATCH_MAX) {
            armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          } else {
            clearAwaitingAssistantReply();
          }
          return;
        }
        if (attempt === 0) {
          dbg("voice force activity_end", userText.slice(0, 32));
          closeOpenAudioTurn();
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          return;
        }
        if (!userTurnSentViaClientText) {
          dbg("voice reply fallback text turn", userText.slice(0, 32));
          if (getCurrentSegment()?.id === "daily1") {
            syncDaily1RalliesFromChat();
            if (daily1ReadyForBackToTank()) {
              forceDaily1BackToTank("voice-reply-watch-bridge", {
                bypassCooldown: attempt > 0,
              });
            } else {
              forceDaily1Continue("voice-reply-watch");
            }
            userTurnSentViaClientText = true;
            armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
            return;
          }
          if (getCurrentSegment()?.id === "ch2") {
            const next = ch2RecoverSpeakLine(userText);
            if (
              (ch2Search.phase === "checking" || ch2SeeWasAnswered()) &&
              !ch2FoundElicitAlreadyDelivered()
            ) {
              forceCh2FoundSandElicit("voice-reply-watch");
            } else {
              const placeAlreadyAsked = assistantAskedPlaceQuestion(
                recentAssistantMessages(8).join("\n")
              );
              if (!(next === CH2_PLACE_SPEAK && placeAlreadyAsked)) {
                forceCh2ScriptLine(next, "voice-reply-watch");
              }
            }
            userTurnSentViaClientText = true;
            armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
            return;
          }
          const coach =
            buildQuiz1OutboundCoach(userText) ||
            buildQuizGateOutboundCoach(userText) ||
            buildWarmupUserCoachNote(userText) ||
            buildCh5OutboundCoach(userText) ||
            buildDaily1OutboundCoach(userText) ||
            buildFinal1OutboundCoach(userText) ||
            buildCh4OutboundCoach(userText) ||
            buildCh3OutboundCoach(userText) ||
            buildCh1OutboundCoach(userText) ||
            buildCh2OutboundCoach(userText);
          if (
            getCurrentSegment()?.id === "ch2" &&
            isCh2FoundElicitCoachNote(coach) &&
            ch2FoundElicitAlreadyDelivered()
          ) {
            dbg("voice reply-watch skip duplicate ch2 elicit");
            clearAwaitingAssistantReply();
            return;
          }
          sendClientText(
            withBeginnerSpeakRule(
              buildChildOutbound(userText, coach || "Reply NOW — acknowledge the child's line first.")
            ),
            { force: true }
          );
          userTurnSentViaClientText = true;
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
          return;
        }
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: true });
        } else {
          clearAwaitingAssistantReply();
        }
        return;
      }

      // Typed / muted path: never wait on playback — resend a forced nudge.
      dbg("typed reply watchdog", { userText, attempt });
      if (needsEnding1Opening()) {
        kickEnding1AutoIntro();
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
        } else {
          clearAwaitingAssistantReply();
        }
        return;
      }
      if (getCurrentSegment()?.id === "ending1" && ending1Beat.finaleRequested) {
        flushEnding1NextBeatCoach("reply-watch");
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
        } else {
          clearAwaitingAssistantReply();
        }
        return;
      }
      if (getCurrentSegment()?.id === "ending1" && isEnding1FreeTalkActive()) {
        // Initial typed send already delivered child+coach. Re-sending Child said:…
        // made Gemini answer twice — recover with a teacher-only nudge instead.
        if (!userTurnSentViaClientText) {
          dbg("typed ending1 free-talk reply-watch", userText.slice(0, 32));
          sendClientText(
            withBeginnerSpeakRule(
              buildChildOutbound(userText, buildEnding1FreeTalkOutboundCoach(userText))
            ),
            { force: true }
          );
          userTurnSentViaClientText = true;
        } else if (attempt >= 1) {
          dbg("typed ending1 free-talk recovery", userText.slice(0, 32));
          nudgeEnding1FreeTalkReply(userText);
        } else {
          dbg("typed ending1 free-talk wait", userText.slice(0, 32));
        }
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
        } else {
          clearAwaitingAssistantReply();
        }
        return;
      }
      if (getCurrentSegment()?.id === "ending1") {
        // Intro not done yet — keep forcing Turn A.
        flushEnding1NextBeatCoach("reply-watch");
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
        } else {
          clearAwaitingAssistantReply();
        }
        return;
      }
      if (getCurrentSegment()?.id === "daily1") {
        syncDaily1RalliesFromChat();
        if (daily1ReadyForBackToTank()) {
          const forced = forceDaily1BackToTank("reply-watch-bridge", {
            bypassCooldown: attempt > 0,
          });
          if (!forced && !assistantSaidDaily1BackToTank(lastAssistantText())) {
            // Cooldown / soft miss — still ping a short speak-now note.
            sendClientText(
              withBeginnerSpeakRule(
                formatTeacherNote(
                  "[Teacher note — do not read aloud] Reply out loud NOW: " +
                    daily1BridgeTurnInstruction(
                      lastPendingUserText || recentUserMessages(1)[0] || ""
                    ) +
                    " Finish speaking. Do not call complete_segment this turn."
                )
              ),
              { force: true }
            );
          }
        } else {
          forceDaily1Continue("reply-watch");
        }
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
        } else {
          awaitingAssistantReply = false;
          pendingReplyText = "";
          updateLearnyThinkingUI();
        }
        return;
      }
      if (getCurrentSegment()?.id === "ch2") {
        // First miss: only close the audio turn. Forcing a script line too early
        // stacks on Gemini's in-flight reply and doubles Learny's question.
        if (attempt === 0) {
          closeOpenAudioTurn();
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
          return;
        }
        const next = ch2RecoverSpeakLine(userText);
        if (
          (ch2Search.phase === "checking" || ch2SeeWasAnswered()) &&
          !ch2FoundElicitAlreadyDelivered()
        ) {
          forceCh2FoundSandElicit("reply-watch");
        } else {
          const placeAlreadyAsked = assistantAskedPlaceQuestion(
            recentAssistantMessages(8).join("\n")
          );
          if (!(next === CH2_PLACE_SPEAK && placeAlreadyAsked)) {
            forceCh2ScriptLine(next, "reply-watch");
          }
        }
        if (attempt + 1 < REPLY_WATCH_MAX) {
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
        } else {
          awaitingAssistantReply = false;
          pendingReplyText = "";
          updateLearnyThinkingUI();
        }
        return;
      }
      const coach =
        buildQuiz1OutboundCoach(userText) ||
        buildQuizGateOutboundCoach(userText) ||
        buildWarmupUserCoachNote(userText) ||
        buildCh5OutboundCoach(userText) ||
        buildDaily1OutboundCoach(userText) ||
        buildFinal1OutboundCoach(userText) ||
        buildCh4OutboundCoach(userText) ||
        buildCh3OutboundCoach(userText) ||
        buildCh1OutboundCoach(userText) ||
        buildCh2OutboundCoach(userText) ||
        (getCurrentSegment()?.id === "ending1"
          ? buildEnding1OutboundCoach({ afterAdvance: true })
          : "");
      if (
        getCurrentSegment()?.id === "ch2" &&
        isCh2FoundElicitCoachNote(coach) &&
        ch2FoundElicitAlreadyDelivered()
      ) {
        dbg("reply-watch skip duplicate ch2 elicit");
        awaitingAssistantReply = false;
        pendingReplyText = "";
        return;
      }
      closeOpenAudioTurn();
      audioPlayer?.interrupt?.();
      sendClientText(
        withBeginnerSpeakRule(
          buildChildOutbound(userText, coach || "Reply NOW — acknowledge the child's line first.")
        ),
        { force: true }
      );
      userTurnSentViaClientText = true;
      if (attempt + 1 < REPLY_WATCH_MAX) {
        armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
      } else {
        awaitingAssistantReply = false;
        pendingReplyText = "";
      }
    };

    // Never barge in while Learny is still speaking — that caused a second spoken
    // question (often with no transcript) after a valid first reply.
    if (assistantIsSpeaking() || assistantPlaybackMsLeft() > 400) {
      whenAssistantIdle(nudge, "reply");
    } else {
      nudge();
    }
  }, delay);
}

function processUserProgressSideEffects(userText, { skipWarmup = false, fromVoice = false, skipCh2 = false, skipDaily1 = false } = {}) {
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
  stackedSpeechInterruptedFor = "";
  maybeWarmupCoachOnUserTurn(t, { fromVoice });
  maybeCh1CoachOnUserTurn(t, { fromVoice });
  userTurnSentViaClientText = false;
  bumpIdleGeneration();
  clearLeadWatch();
  leadWatchArmedFor = "";
  turnEndProcessed = false;
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  if (!skipCh2) handleCh2SearchProgress(t);
  if (!skipDaily1) handleDaily1ChatProgress(t);
  maybeSaveCh4FavoriteColor(t);
  if (!skipWarmup) {
    maybeCompleteWarmupFromClient(t);
  }
  // Chapter handoff owns the next spoken beat — do not arm reply-watch on the yes/agree turn.
  if (skipOutboundForHandoff || isHandoffRunning || isChapterHandoff) {
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    dbg("side effects: skip reply-watch; handoff pending");
    return;
  }
  // Voice path has no typed outbound coach — inject when course must change.
  if (fromVoice && !userTurnSentViaClientText) {
    const ch1Advance = maybeCompleteCh1FromClient(t);
    const ch2Advance = ch1Advance ? "" : maybeCompleteCh2FromClient(t);
    const ch3Advance = ch1Advance || ch2Advance ? "" : maybeCompleteCh3FromClient(t);
    const quiz1Advance = ch1Advance || ch2Advance || ch3Advance ? "" : maybeCompleteQuiz1FromClient(t);
    const ch4Advance =
      ch1Advance || ch2Advance || ch3Advance || quiz1Advance ? "" : maybeCompleteCh4FromClient(t);
    const ch5Advance =
      ch1Advance || ch2Advance || ch3Advance || quiz1Advance || ch4Advance
        ? ""
        : maybeCompleteCh5FromClient(t);
    if (
      ch1Advance === HANDOFF_MARKER ||
      ch2Advance === HANDOFF_MARKER ||
      ch3Advance === HANDOFF_MARKER ||
      quiz1Advance === HANDOFF_MARKER ||
      ch4Advance === HANDOFF_MARKER ||
      ch5Advance === HANDOFF_MARKER ||
      skipOutboundForHandoff
    ) {
      userTurnSentViaClientText = false;
    } else {
      const quiz1Coach = buildQuiz1OutboundCoach(t);
      const quizGate = buildQuizGateOutboundCoach(t);
      const warmupCoach = buildWarmupUserCoachNote(t);
      const ch3Coach = buildCh3OutboundCoach(t);
      const ch1Coach = buildCh1OutboundCoach(t);
      const daily1Coach = buildDaily1OutboundCoach(t);
      const final1Coach = buildFinal1OutboundCoach(t);
      const endingFreeTalkCoach = buildEnding1FreeTalkOutboundCoach(t);
      const coach =
        quiz1Coach ||
        quizGate ||
        warmupCoach ||
        ch3Coach ||
        ch1Coach ||
        daily1Coach ||
        final1Coach ||
        endingFreeTalkCoach ||
        buildCh5OutboundCoach(t) ||
        buildCh4OutboundCoach(t) ||
        buildCh2OutboundCoach(t);
      const needVoiceCoach =
        Boolean(coach) &&
        (Boolean(quiz1Coach) ||
          Boolean(quizGate) ||
          Boolean(warmupCoach) ||
          Boolean(ch3Coach) ||
          Boolean(ch1Coach) ||
          Boolean(daily1Coach) ||
          Boolean(final1Coach) ||
          Boolean(endingFreeTalkCoach) ||
          getCurrentSegment()?.id === "quiz1" ||
          getCurrentSegment()?.id === "daily1" ||
          getCurrentSegment()?.id === "final1" ||
          getCurrentSegment()?.id === "ending1" ||
          getCurrentSegment()?.id === "ch1" ||
          getCurrentSegment()?.id === "ch5" ||
          getCurrentSegment()?.id === "ch4" ||
          getCurrentSegment()?.id === "ch2" ||
          looksLikeFoundSand(t) === "found" ||
          looksLikeFoundSand(t) === "phrase" ||
          userSaysStillSearchingSand(t) ||
          ["place", "direction", "chat", "waiting", "checking"].includes(ch2Search.phase));
      if (needVoiceCoach) {
        if (isCh2FoundElicitCoachNote(coach) && ch2FoundElicitAlreadyDelivered()) {
          dbg("skip duplicate ch2 elicit voice coach");
        } else {
          if (isCh2FoundElicitCoachNote(coach)) ch2ElicitCoachSentAt = Date.now();
          sendClientText(withBeginnerSpeakRule(buildChildOutbound(t, coach)), { force: true });
          userTurnSentViaClientText = true;
        }
      }
    }
  }
  if (!fromVoice) maybeCompleteCh1FromClient(t);
  maybeCompleteCh2FromClient(t);
  if (!fromVoice) maybeCompleteCh3FromClient(t);
  if (!fromVoice) maybeCompleteQuiz1FromClient(t);
  if (!fromVoice) maybeCompleteCh4FromClient(t);
  if (!fromVoice) maybeCompleteCh5FromClient(t);
  maybeCompleteDaily1FromClient(t);
  maybeCompleteCh6FromClient(t);
  maybeAdvanceFinal1Quiz(t);
  const final1JustCompleted = maybeCompleteFinal1FromClient(t);
  if (!final1JustCompleted) {
    maybeAdvanceEnding1Beat(t, {
      // Always notify on ending — finale 5→6 must be client-kicked.
      skipNotify: false,
    });
  }
  if (skipOutboundForHandoff || isHandoffRunning || isChapterHandoff) {
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    dbg("side effects: skip reply-watch after handoff complete");
    return;
  }
  // Recover if banner is already Ch3 but Learny is still on found-sand talk.
  maybeCh3StartLoopNudge();
  finalizeCh2ElicitForceAfterUserTurn(t);
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
  // Prefer MCQ path when buttons are up — keeps progress + reply-watch in sync.
  // Intermediate: same path for voice/typed answers (no buttons).
  if (tryRouteFinal1Answer(t)) return;
  if (tryRouteQuiz1Answer(t)) return;
  if (tryRouteTextToMcq(t)) return;

  addUserAnswerBubble(t);
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  cancelAssistantTurnEnd();
  // Text path (often with mic muted): close any open voice activity and stop
  // playback so Gemini answers the typed turn immediately.
  prepareForUserOutbound();
  lastPendingUserText = t;
  if (getCurrentSegment()?.id === "daily1") handleDaily1ChatProgress(t);

  // Keep outbound short — long coach prefixes slow the Live reply.
  // Critical chapter coaches (Ch1/Ch2) stay on the child's turn to keep flow on-script.
  const advanceNote =
    maybeCompleteWarmupFromClient(t) ||
    maybeCompleteCh1FromClient(t) ||
    maybeCompleteCh2FromClient(t) ||
    maybeCompleteCh3FromClient(t) ||
    maybeCompleteQuiz1FromClient(t) ||
    maybeCompleteCh4FromClient(t) ||
    maybeCompleteCh5FromClient(t);
  const ch1Coach = buildCh1OutboundCoach(t);
  const ch2Coach = buildCh2OutboundCoach(t);
  const ch3Coach = buildCh3OutboundCoach(t);
  const ch4Coach = buildCh4OutboundCoach(t);
  const ch5Coach = buildCh5OutboundCoach(t);
  const daily1Coach = buildDaily1OutboundCoach(t);
  const final1Coach = buildFinal1OutboundCoach(t);
  const warmupCoach = buildWarmupUserCoachNote(t);
  const quiz1Coach = buildQuiz1OutboundCoach(t);
  const quizGateCoach = buildQuizGateOutboundCoach(t);
  // Child answer FIRST — long coach-before-child made Live slow and caused ignored answers.
  let coachNote = "";
  const handoffNow = advanceNote === HANDOFF_MARKER || skipOutboundForHandoff;
  if (handoffNow) {
    coachNote = "";
  } else if (advanceNote) {
    coachNote = advanceNote;
  } else if (quiz1Coach) {
    coachNote = quiz1Coach;
  } else if (quizGateCoach) {
    coachNote = quizGateCoach;
  } else if (warmupCoach) {
    coachNote = warmupCoach;
  } else if (ch3Coach) {
    coachNote = ch3Coach;
  } else if (ch5Coach) {
    coachNote = ch5Coach;
  } else if (daily1Coach) {
    coachNote = daily1Coach;
  } else if (final1Coach) {
    coachNote = final1Coach;
  } else if (ch4Coach) {
    coachNote = ch4Coach;
  } else if (ch1Coach) {
    coachNote = ch1Coach;
  } else if (ch2Coach) {
    if (isCh2FoundElicitCoachNote(ch2Coach) && ch2FoundElicitAlreadyDelivered()) {
      coachNote = "";
      dbg("skip duplicate ch2 elicit typed coach");
    } else {
      coachNote = ch2Coach;
      if (isCh2FoundElicitCoachNote(ch2Coach)) ch2ElicitCoachSentAt = Date.now();
    }
  } else if (getCurrentSegment()?.id === "ending1") {
    coachNote =
      buildEnding1OutboundCoach() || buildEnding1FreeTalkOutboundCoach(t) || "";
  }

  // Only client-own the goodbye after 終わりにする — free talk must reach Gemini normally.
  const endingFinaleOwnedTurn =
    getCurrentSegment()?.id === "ending1" &&
    ending1Beat.finaleRequested &&
    !ending1FinaleComplete();
  const endingClientOwnedTurn = endingFinaleOwnedTurn;

  // Daily English / Ch2: keep coach payload short — long notes stall Live replies.
  const segId = getCurrentSegment()?.id;
  const maxCoach = segId === "daily1" || segId === "ch2" ? 220 : 420;
  const outbound =
    handoffNow || endingClientOwnedTurn
      ? ""
      : buildChildOutbound(t, coachNote, { maxCoach });

  // Side effects BEFORE deferred send — bumpIdleGeneration() must not cancel whenAssistantIdle(sendNow).
  processUserProgressSideEffects(t, { skipWarmup: true, skipCh2: true, skipDaily1: true });

  if (handoffNow || endingClientOwnedTurn) {
    typedSendSkippedForVoice = false;
    userTurnSentViaClientText = endingClientOwnedTurn;
    if (endingFinaleOwnedTurn) {
      if (!ending1Beat.finaleCoachSent || !ending1FinaleComplete()) {
        kickEnding1FinaleChain("typed-finale-backup", { bypassCooldown: true });
      }
      dbg("typed send skipped; ending finale client-owned");
    } else {
      dbg("typed send skipped; chapter handoff pending");
    }
  } else if (isRecentVoiceDuplicate(t)) {
    dbg("typed send skipped; voice turn already sent", t.slice(0, 32));
    typedSendSkippedForVoice = true;
    if (!userTurnSentViaClientText && outbound.trim()) {
      sendClientText(withBeginnerSpeakRule(outbound), { force: true });
      userTurnSentViaClientText = true;
    }
  } else {
    typedSendSkippedForVoice = false;
    const sendNow = () => {
      if (actionState !== "active" || !client?.connected) return;
      userTurnSentViaClientText = Boolean(
        sendClientText(withBeginnerSpeakRule(outbound), { force: true })
      );
    };
  // prepareForUserOutbound() already interrupted playback — send immediately.
  // Cap wait so a stuck playback clock cannot leave the child on 考え中.
  if (assistantIsSpeaking()) {
    whenAssistantIdle(sendNow, "typed-send");
    setTimeout(() => {
      if (userTurnSentViaClientText) return;
      if (actionState !== "active" || !client?.connected) return;
      if (!outbound.trim()) return;
      dbg("typed-send safety flush");
      sendNow();
    }, 1200);
  } else {
    sendNow();
  }
  }
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
      if (result.ok && getCurrentSegment()?.id === "ch4") {
        renderChoiceBar(getCurrentSegment());
      }
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
              "Chapter 3 Step 1 not done. Speak: Let's make some glass! " + PART1_ELICIT_JA.ch3NeedGlass + " " +
              "Wait for I need to make glass. Do NOT complete until the child has said that phrase.",
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
              "Warmup NOT done. Ask: Will you help me make a fish tank? (いっしょに つくれる？) on its OWN turn — then STOP and WAIT. " +
              "Any child reply after that invite completes warmup — do NOT require yes/ok specifically. " +
              "Do NOT combine everyday chat + tank invite in one message. " +
              "Do NOT say Thank you or ask about glass/sand until the child has replied on a later turn.",
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
              ? "Child said not yet / まだ. Brief cheer and WAIT — they are still looking. " +
                "Do NOT say Let me know when you find some sand. Do NOT invent new questions. " +
                ch2CoachHint()
              : "Chapter 2 is NOT done. The child has not said I found some sand! in English yet. " +
                "Never say We have sand. " +
                (ch2CoachHint() ||
                  "Follow Ch2 script: place → left/right → hot → see → wait → I found some sand!") +
                " Only call complete_segment(ch2) after they clearly say I found some sand! in English.",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "daily1" && getActiveLessonId() === "part1" && !canCompleteDaily1Part1()) {
        queueReply(
          id,
          name,
          { result: "not_yet", message: daily1CompleteBlockedMessage() },
          toolReplyScheduling()
        );
        // Gemini often calls complete_segment with no spoken bridge — force the line
        // immediately so the child is not left on "考え中" forever.
        if (daily1ReadyForBackToTank() && !daily1Chat.backToTankSpoken) {
          setTimeout(() => {
            if (getCurrentSegment()?.id !== "daily1") return;
            if (!client?.connected || actionState !== "active") return;
            if (assistantSaidDaily1BackToTank(lastAssistantText())) {
              daily1Chat.backToTankSpoken = true;
              return;
            }
            forceDaily1BackToTank("blocked-complete-missing-bridge", { bypassCooldown: true });
          }, 400);
        }
        return;
      }
      if (getCurrentSegment()?.id === "daily1" && sid === "ch6") {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              "Still on Daily English — Chapter 6 NOT started. " + daily1CompleteBlockedMessage(),
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "quiz1" && getActiveLessonId() === "part1" && !canCompleteQuiz1Part1()) {
        const done = countQuiz1ItemsAnswered();
        const total = getQuiz1Items().length || 3;
        const cur = getCurrentQuiz1Item();
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              `Mini quiz 1 is NOT done (${done}/${total}). Ask EXACTLY: ` +
              (cur ? quiz1ItemSpeak(cur) : "next listed item") +
              " Then WAIT for a 4-button tap. Order: がらすが ひつよう → すなを みつけた → がらすを つくった. " +
              "FORBIDDEN: すなが ひつよう quiz, oral どっち, walls, color. After all 3, complete_segment(quiz1) → Chapter 4.",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch6" && getActiveLessonId() === "part1" && !canCompleteCh6Part1()) {
        const msg = userHasImDonePhrase()
          ? "Chapter 6 is NOT done yet. Child said I'm done! — praise that, then Beat 4 Is the tank ready for the fishes to swim? " +
            PART1_ELICIT_JA.ch6TankReady +
            " → My tank is ready! " +
            "Do NOT say Almost or おしい. complete_segment(ch6) only after My tank is ready! in English."
          : ch6CoachHint() ||
            "Chapter 6: Beat1 basement → I put the sand on the bottom → … → Beat4 My tank is ready! before complete_segment(ch6).";
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
        (!ending1Beat.finaleRequested ||
          (!ending1FinaleComplete() && !looksLikeEnding1FinalLineComplete(lastAssistantText())))
      ) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message: !ending1Beat.finaleRequested
              ? "Still FREE TALK after the fish question. Do NOT complete_segment yet. Chat freely until the child taps 終わりにする."
              : "Ending goodbye is NOT done yet — speak the Turn C finale (わくわく + Next Minecraft… See you next time!), then complete_segment(ending1). " +
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
      const nextSeg = getCurrentSegment(result.state);
      // Ending Turn A is client-forced — never also send ending1StartNudge (second Perfect!).
      const advanceMsg = result.alreadyDone
        ? "Already on the next chapter. Continue that chapter; end with one question."
        : willHandoff
          ? "Segment complete. Next chapter starts NOW on this session — stay silent; the client will open the next chapter."
          : nextSeg?.id === "ending1"
            ? "Segment complete. Stay SILENT — client owns Ending Turn A. Do NOT say Perfect / Hold on / what kind of fish."
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
        } else if (nextSeg?.id === "ending1") {
          // Client owns the intro kick (forceEnding1OpeningAfterFinal1 / kickEnding1AutoIntro).
          if (!ending1Beat.introNoteSent && ending1Beat.autoCoachSent === 0) {
            forceEnding1OpeningAfterFinal1("tool-advance");
          }
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
  if (
    intentionalDisconnect &&
    (message.type === MultimodalLiveResponseType.AUDIO ||
      message.type === MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION)
  ) {
    return;
  }
  switch (message.type) {
    case MultimodalLiveResponseType.TEXT:
      markAssistantTranscriptChunk();
      if (isMetaAssistantLeak(message.data)) break;
      if (!client?.outputAudioTranscription) {
        addMessage(message.data, "assistant");
        markChapterTransitionSpeaking();
      }
      break;
    case MultimodalLiveResponseType.AUDIO:
      if (!audioPlayer || audioPlayer.destroyed) break;
      // Ghost second Perfect often has ZERO STT — gate on audio packets alone.
      if (gateEnding1IntroAudioPacket() || shouldDropEnding1IntroAudio()) {
        dbg("drop ending1 duplicate Perfect audio packet");
        try {
          audioPlayer.interrupt?.();
        } catch {
          // ignore
        }
        break;
      }
      lastAssistantAudioAt = Date.now();
      updateLearnyThinkingUI();
      markChapterTransitionSpeaking();
      // Stop mic hangover so we don't barge into Learny's reply.
      audioStreamer?.resetVoiceGate?.();
      audioPlayer.play(message.data);
      break;
    case MultimodalLiveResponseType.INPUT_TRANSCRIPTION:
      addMessage(message.data.text, "user-transcript", "append");
      if (message.data.finished && message.data.text?.trim()) {
        const spoken = message.data.text.trim();
        lastVadUserText = spoken;
        lastVadUserAt = Date.now();
        handleCh2SearchProgress(spoken);
        lastPendingUserText = spoken;
        // Transcription finished ⇒ user turn is done. Force activity_end and
        // close the mic gate so Gemini starts speaking immediately.
        closeOpenAudioTurn();
        // Intermediate voice-only: route through MCQ/quiz handlers so admin progress matches taps.
        if (
          isIntermediateVoiceOnly() &&
          (tryRouteFinal1Answer(spoken) ||
            tryRouteQuiz1Answer(spoken) ||
            tryRouteTextToMcq(spoken))
        ) {
          break;
        }
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
      if (chunk.trim()) markChapterTransitionSpeaking();
      if (pendingReplyText && hasAssistantReplySinceUser(pendingReplyText)) {
        awaitingAssistantReply = false;
        updateLearnyThinkingUI();
        clearPendingReplyWatch();
      }
      break;
    }
    case MultimodalLiveResponseType.TURN_COMPLETE:
      finishAssistantTurn();
      break;
    case MultimodalLiveResponseType.SETUP_COMPLETE:
      dbg("setup complete");
      if (handoffKickWatchId) {
        clearTimeout(handoffKickWatchId);
        handoffKickWatchId = null;
      }
      kickOpeningTurn();
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
      scheduleRepairIncompleteAssistantBubble();
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
  ch4BeatBForceAt = 0;
  ch4LetsMakeForceAt = 0;
  resetDaily1Chat();
  resetFinal1Quiz();
  resetQuiz1State();
  resetEnding1Beat();
  clearPendingReplyWatch();
  clearLeadWatch();
  clearEnding1HangUpWatch();
  cancelAssistantTurnEnd();
  chatMessages = [];
  resetLearnyThinking();
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

/**
 * Parent lesson panel jumped chapters — localStorage already updated.
 * Refresh UI; if in a live call, reconnect with the new chapter opening.
 * Do NOT call jumpToSegment here (would double-count plays).
 */
async function applyChapterJumpFromParent({ lessonId, segmentId: _segmentId } = {}) {
  const activeLesson = getActiveLessonId();
  if (lessonId && lessonId !== activeLesson) return;

  const wasLive = actionState === "active" || actionState === "connecting";

  openingSent = false;
  pendingOpeningKickOpts = null;
  sessionResumeHandle = null;
  postTurnNudgesForUserKey = "";
  lastPendingUserText = "";
  bannerSegmentId = "";
  resetCh2Search();
  ch4BeatBForceAt = 0;
  ch4LetsMakeForceAt = 0;
  resetDaily1Chat();
  resetFinal1Quiz();
  resetQuiz1State();
  resetEnding1Beat();
  clearPendingReplyWatch();
  clearLeadWatch();
  clearEnding1HangUpWatch();
  cancelAssistantTurnEnd();
  chatMessages = [];
  resetLearnyThinking();
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

  restoreChapterUiFromLessonState();
  renderChatNow();
  updateLessonBanner();
  renderChoiceBar(getCurrentSegment());
  notifyParentProgress();

  if (!wasLive) {
    addMessage("章を切り替えたよ。はじめるを押してね。", "system");
    updateActionUI();
    return;
  }

  if (isHandoffRunning || isAutoReconnecting) {
    addMessage("章を切り替えたよ。はじめるを押してね。", "system");
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
    return;
  }

  isHandoffRunning = true;
  isChapterHandoff = true;
  beginChapterTransition(getCurrentSegment());
  actionState = "connecting";
  updateActionUI();
  addMessage("章を切り替えたよ…", "system");
  teardownLiveForHandoff();

  try {
    intentionalDisconnect = false;
    if (!audioPlayer || audioPlayer.destroyed || !audioPlayer.isInitialized) {
      audioPlayer = new AudioPlayer();
      await audioPlayer.init();
    } else {
      audioPlayer.interrupt();
    }
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
    pendingOpeningKickOpts = null;
    if (handoffKickWatchId) {
      clearTimeout(handoffKickWatchId);
      handoffKickWatchId = null;
    }
    handoffKickWatchId = setTimeout(() => {
      handoffKickWatchId = null;
      if (openingSent || actionState !== "active" || !client?.connected) return;
      client.sessionReady = true;
      kickOpeningTurn();
    }, 1200);
    if (client.sessionReady) kickOpeningTurn();
    updateActionUI();
  } catch (error) {
    dbg("chapter jump reconnect failed", String(error?.message || error));
    addMessage("つなぎなおせなかったよ。はじめるを押してみてね。", "system");
    endChapterTransition();
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
  } finally {
    isHandoffRunning = false;
    isChapterHandoff = false;
    intentionalDisconnect = false;
    updateActionUI();
  }
}

function shouldHandoffAfter(completedSegmentId) {
  return getActiveLessonId() === "part1" && PART1_HANDOFF_AFTER.has(completedSegmentId);
}

function formatChapterLoadingLabel(segment = getCurrentSegment()) {
  if (!segment) return "つぎの章";
  const meta = getSegmentChapterMeta(segment);
  const title = segment.titleEn || segment.title || "";
  if (meta.label === "CHAPTER" && meta.num) {
    return `Chapter ${meta.num}${title ? ` — ${title}` : ""}`;
  }
  if (meta.label === "QUIZ") return title ? `Quiz — ${title}` : "Quiz";
  return title || meta.label || "つぎの章";
}

function showChapterLoadingOverlay(segment = getCurrentSegment()) {
  if (!questLoadingOverlay) return;
  const label = formatChapterLoadingLabel(segment);
  if (questLoadingTitle) questLoadingTitle.textContent = "つぎの章へ…";
  if (questLoadingSub) questLoadingSub.textContent = `${label} をじゅんび中`;
  questLoadingOverlay.classList.add("active");
  questLoadingOverlay.setAttribute("aria-hidden", "false");
}

function hideChapterLoadingOverlay() {
  if (!questLoadingOverlay) return;
  questLoadingOverlay.classList.remove("active");
  questLoadingOverlay.setAttribute("aria-hidden", "true");
}

/** Start chapter-transition UI: loading sign + hide MCQ until Learny speaks. */
function beginChapterTransition(segment = getCurrentSegment()) {
  chapterTransitionActive = true;
  if (chapterTransitionSafetyId) {
    clearTimeout(chapterTransitionSafetyId);
    chapterTransitionSafetyId = null;
  }
  showChapterLoadingOverlay(segment);
  renderChoiceBar(segment);
  updateActionUI();
  // Safety: never leave kids without buttons forever if audio never arrives.
  chapterTransitionSafetyId = setTimeout(() => {
    chapterTransitionSafetyId = null;
    if (!chapterTransitionActive) return;
    dbg("chapter transition safety end");
    endChapterTransition();
  }, 10000);
}

/** Learny started the new chapter — drop loading and show MCQ if ready. */
function endChapterTransition() {
  if (!chapterTransitionActive && !questLoadingOverlay?.classList.contains("active")) {
    return;
  }
  chapterTransitionActive = false;
  if (chapterTransitionSafetyId) {
    clearTimeout(chapterTransitionSafetyId);
    chapterTransitionSafetyId = null;
  }
  hideChapterLoadingOverlay();
  scheduleRepairIncompleteAssistantBubble();
  renderChoiceBar(getCurrentSegment());
  updateActionUI();
}

function markChapterTransitionSpeaking() {
  if (!chapterTransitionActive) return;
  endChapterTransition();
}

function clearPendingHandoffTimer() {
  if (pendingHandoffTimer) {
    clearTimeout(pendingHandoffTimer);
    pendingHandoffTimer = null;
  }
  if (handoffKickWatchId) {
    clearTimeout(handoffKickWatchId);
    handoffKickWatchId = null;
  }
}

/**
 * After a hinge segment completes: open the next chapter on a FRESH Live session
 * (fast reconnect — reuses mic/speaker). Soft same-socket handoff was keeping the
 * full conversation history and made Learny's next opening take many seconds.
 */
function scheduleChapterHandoff({ reason, lastQuote = "" } = {}) {
  if (isHandoffRunning || actionState === "idle") return false;
  skipOutboundForHandoff = true;
  // Daily English already reacted to the child on the bridge turn — don't feed
  // that quote into Chapter 6 or Learny re-acks the pet before Beat 1.
  const quoteForNext =
    reason === "after-daily1" ? "" : String(lastQuote || "").trim();
  pendingHandoffQuote = quoteForNext;
  clearPendingHandoffTimer();

  const waitForBridgeSpeech = reason === "after-daily1";

  const startReconnect = () => {
    pendingHandoffTimer = null;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    clearPendingReplyWatch();
    clearLeadWatch();
    awaitingAssistantReply = false;
    pruneTrailingIncompleteAssistants();
    bumpIdleGeneration();
    beginChapterTransition(getCurrentSegment());
    dbg("schedule chapter handoff", {
      reason,
      mode: "fast-hard",
      quote: pendingHandoffQuote.slice(0, 40),
      waitedForSpeech: waitForBridgeSpeech,
    });
    handoffToCurrentSegment({
      reason: reason || "handoff",
      lastQuote: pendingHandoffQuote,
    });
  };

  if (waitForBridgeSpeech) {
    // STT often shows the bridge before audio finishes — don't interrupt mid-sentence.
    clearPendingReplyWatch();
    clearLeadWatch();
    awaitingAssistantReply = false;
    const safetyMs = Math.min(
      12000,
      Math.max(2800, estimateSpeechMs(lastAssistantText()) + 900)
    );
    dbg("handoff after-daily1 waiting for bridge speech", { safetyMs });
    let started = false;
    const startOnce = () => {
      if (started || isHandoffRunning || actionState === "idle") return;
      started = true;
      startReconnect();
    };
    whenAssistantIdle(startOnce, "handoff-after-daily1");
    pendingHandoffTimer = setTimeout(startOnce, safetyMs);
    return true;
  }

  // Default hinges: cut leftover praise audio immediately so kids aren't waiting on it.
  if (HANDOFF_DELAY_MS <= 0) startReconnect();
  else pendingHandoffTimer = setTimeout(startReconnect, HANDOFF_DELAY_MS);
  return true;
}

/**
 * @deprecated Soft same-socket handoff — kept only as an emergency fallback.
 * Prefer handoffToCurrentSegment (fresh session, short opening).
 */
async function softHandoffToCurrentSegment({ reason = "handoff", lastQuote = "" } = {}) {
  if (isHandoffRunning) return false;
  if (actionState === "idle") return false;
  if (!client?.connected) return false;

  isHandoffRunning = true;
  isChapterHandoff = true;
  skipOutboundForHandoff = false;
  const quote = lastQuote || pendingHandoffQuote || "";
  pendingHandoffQuote = "";
  beginChapterTransition(getCurrentSegment());

  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
    clearPendingReplyWatch();
    clearLeadWatch();
    leadWatchArmedFor = "";
    assistantTranscriptOpen = false;
    turnEndProcessed = false;
    awaitingAssistantReply = false;
    cancelAssistantTurnEnd();
    bumpIdleGeneration();
    openingSent = false;
    userTurnSentViaClientText = false;

    configureGeminiClient(client);
    updateLessonBanner();

    if (reason !== "stuck_retry") {
      addMessage("よくできた！つぎいこう…", "system");
    }

    const state = loadLessonState();
    const nudge = buildPart1HandoffOpeningNudge(state, {
      lastQuote: quote,
      reason: reason || "handoff",
    });
    const sent = sendClientText(
      withBeginnerSpeakRule(formatTeacherNote(nudge)),
      { force: true }
    );
    if (!sent) {
      dbg("soft handoff send failed; will hard reconnect", { reason });
      return false;
    }

    openingSent = true;
    lastAssistantAudioAt = 0;
    awaitingAssistantReply = false;
    clearPendingReplyWatch();
    updateActionUI();
    dbg("soft chapter handoff done", { reason, segment: getCurrentSegment()?.id });
    return true;
  } catch (error) {
    dbg("soft chapter handoff failed", String(error?.message || error));
    endChapterTransition();
    return false;
  } finally {
    isHandoffRunning = false;
    isChapterHandoff = false;
    updateActionUI();
  }
}

/**
 * Tear down Live client for chapter handoff — KEEP mic stream + speaker
 * (re-init of AudioWorklet was a major multi-second wait).
 */
function teardownLiveForHandoff() {
  intentionalDisconnect = true;
  clearEnding1HangUpWatch();
  clearPendingReplyWatch();
  clearLeadWatch();
  leadWatchArmedFor = "";
  assistantTranscriptOpen = false;
  resetAssistantTurnTranscript();
  pruneTrailingIncompleteAssistants();
  turnEndProcessed = false;
  awaitingAssistantReply = false;
  cancelAssistantTurnEnd();
  bumpIdleGeneration();
  sessionResumeHandle = null;
  openingSent = false;
  userActivityOpen = false;
  try {
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
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
 * Fast in-call reconnect: fresh system instructions for the CURRENT segment.
 * Reuses AudioPlayer + AudioStreamer so kids aren't stuck on worklet re-init.
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
  if (!chapterTransitionActive) beginChapterTransition(getCurrentSegment());
  actionState = "connecting";
  updateActionUI();
  renderChoiceBar(getCurrentSegment());
  if (getCurrentSegment()?.id === "daily1") resetDaily1Chat();
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
    // Reuse existing speaker when possible — AudioWorklet init is expensive.
    if (!audioPlayer || audioPlayer.destroyed || !audioPlayer.isInitialized) {
      audioPlayer = new AudioPlayer();
      await audioPlayer.init();
    } else {
      audioPlayer.interrupt();
    }
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
    // Wait for SETUP_COMPLETE to send the opening (sending early drops the turn).
    if (handoffKickWatchId) {
      clearTimeout(handoffKickWatchId);
      handoffKickWatchId = null;
    }
    handoffKickWatchId = setTimeout(() => {
      handoffKickWatchId = null;
      if (openingSent || actionState !== "active" || !client?.connected) return;
      // Setup event missed — force ready and kick so kids aren't stuck on つぎいこう.
      client.sessionReady = true;
      kickOpeningTurn({ handoff: true, lastQuote: quote, reason });
    }, 1200);
    if (client.sessionReady) {
      kickOpeningTurn({ handoff: true, lastQuote: quote, reason });
    }
    updateActionUI();
    dbg("chapter handoff done", { reason, segment: getCurrentSegment()?.id });
    return true;
  } catch (error) {
    dbg("chapter handoff failed", String(error?.message || error));
    addMessage("つぎの章につなげなかったよ。もういちど押してみてね。", "system");
    endChapterTransition();
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
  persistCh2SearchState();
  clearEnding1HangUpWatch();
  clearPendingReplyWatch();
  clearLeadWatch();
  leadWatchArmedFor = "";
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  awaitingAssistantReply = false;
  cancelAssistantTurnEnd();
  bumpIdleGeneration();
  chapterTransitionActive = false;
  if (chapterTransitionSafetyId) {
    clearTimeout(chapterTransitionSafetyId);
    chapterTransitionSafetyId = null;
  }
  hideChapterLoadingOverlay();
  resetCh2Search();
  resetFinal1Quiz();
  resetQuiz1State();
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
  micMutedBeforeMcq = null;
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
  } catch {
    bumpIdleGeneration();
    addMessage("接続が切れちゃった。もう一度スタートしてね。", "system");
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
  }
  isAutoReconnecting = false;
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
  // Fresh call on ending must re-kick Turn A (stale intro flags left empty chat).
  if (getCurrentSegment()?.id === "ending1") {
    resetEnding1Beat();
  }
  restoreChapterUiFromLessonState();
  const resumingMidChapter = isMidChapterResume();
  clearPendingReplyWatch();
  chatMessages = [];
  resetLearnyThinking();
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
  updateLessonBanner();
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
    audioStreamer.setMuted(isMuted);
    if (!isMuted) {
      await audioStreamer.ensureStreaming();
      audioStreamer.resumeStreaming();
      audioStreaming = true;
    } else {
      audioStreamer.pauseStreaming();
      audioStreaming = false;
    }
    actionState = "active";
    restoreChapterUiFromLessonState();
    renderChoiceBar(getCurrentSegment());
    if (resumingMidChapter) {
      addMessage("おかえり！ つづきから いこう！", "system");
    }
    updateActionUI();
    // First open of the current chapter counts as a play if never recorded.
    const cur = getCurrentSegment();
    if (cur?.id) ensureChapterPlayCounted(cur.id);
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

async function toggleMute() {
  if (actionState !== "active" || !audioStreamer) return;
  // MCQ / quiz buttons on screen: mic stays locked off (tap answers only).
  if (isMcqChoiceUiActive()) {
    forceMicMutedForMcq();
    updateActionUI();
    return;
  }
  isMuted = !isMuted;
  audioStreamer.setMuted(isMuted);
  if (isMuted) {
    // Hand the turn back so typed chat / MCQ works immediately while muted.
    closeOpenAudioTurn();
    audioStreamer.pauseStreaming();
    audioStreaming = false;
  } else {
    await audioStreamer.ensureStreaming();
    audioStreamer.resumeStreaming();
    audioStreaming = true;
  }
  updateActionUI();
}

btnAction?.addEventListener("click", () => handleActionButton());
btnMute?.addEventListener("click", () => toggleMute());
let pokeCooldownAt = 0;
const POKE_COOLDOWN_MS = 2800;

function buildPokeContinueNote() {
  const seg = getCurrentSegment();
  const user = String(lastPendingUserText || recentUserMessages(1)[0] || "").trim();
  const assistant = String(lastAssistantText() || "").trim();
  const parts = [
    "[Teacher note — do not read aloud] Child POKED you because you stopped responding. Continue NOW with ONE short spoken turn.",
    "Do NOT reconnect / do NOT say system words / do NOT apologize about being stuck.",
  ];
  if (user) parts.push('Previous child message: "' + user.slice(0, 120) + '"');
  if (assistant) parts.push("Your last line was: \"" + assistant.slice(0, 160) + "\"");
  if (seg?.id) {
    parts.push(
      "Current chapter: " +
        (seg.titleEn || seg.title || seg.id) +
        " (" +
        seg.id +
        "). Stay on this chapter."
    );
  }
  const hint = segmentContinuationHint();
  if (hint) parts.push(hint.trim());
  parts.push(
    "Acknowledge the child's last message if needed, then continue the scripted beat with ONE clear next line (English then matching ひらがな). End with a question when the script needs one."
  );
  return parts.join(" ");
}

function flashPokeButton() {
  if (!btnRetry) return;
  btnRetry.classList.remove("is-poking");
  // restart CSS animation
  void btnRetry.offsetWidth;
  btnRetry.classList.add("is-poking");
  setTimeout(() => btnRetry.classList.remove("is-poking"), 500);
}

/**
 * Soft poke — nudge Live to continue without reconnecting the chapter session.
 */
function pokeLearny() {
  if (actionState !== "active" || !client?.connected) return false;
  if (isHandoffRunning || isChapterHandoff || isAutoReconnecting) return false;
  if (pokeCooldownAt && Date.now() - pokeCooldownAt < POKE_COOLDOWN_MS) return false;
  pokeCooldownAt = Date.now();
  flashPokeButton();

  const seg = getCurrentSegment();
  dbg("poke learny", { segment: seg?.id, user: (lastPendingUserText || "").slice(0, 40) });
  notifyMcqActivity({
    type: "poke",
    level: LEVEL_INFO?.id || "beginner",
    segmentId: seg?.id || null,
    questTitle: seg?.title || seg?.id || "poke",
    source: "client",
  });

  // Scripted stuck paths: prefer exact beat forces over a generic continue.
  if (seg?.id === "final1") {
    initFinal1QuizIfNeeded();
    const quote = String(lastPendingUserText || recentUserMessages(1)[0] || "final challenge done").trim();
    if (isFinal1QuizFinished()) {
      if (maybeCompleteFinal1FromClient(quote)) return true;
      if (getCurrentSegment()?.id === "ending1") {
        forceEnding1OpeningAfterFinal1("poke-recover");
        return true;
      }
    }
    const next = currentFinal1Prompt();
    if (next) {
      try {
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      return sendClientText(
        withBeginnerSpeakRule(
          formatTeacherNote(
            "[Teacher note — do not read aloud] poke. Final1 — speak EXACTLY ONE turn: brief ack if needed, then ask ONCE: " +
              next +
              (final1RemainingCount() === 1 ? " (LAST question.)" : "") +
              " FORBIDDEN: inventing cues / bare は えいごで？." +
              beginnerTurnHint()
          )
        ),
        { force: true }
      );
    }
    if (maybeCompleteFinal1FromClient(quote)) return true;
  }
  if (seg?.id === "ending1") {
    syncEnding1AutoProgress();
    syncEnding1FinaleProgress();
    if (!ending1AutoIntroComplete()) {
      // Never clear the one-shot gate while Turn A is playing / seeded — that re-spoke Perfect.
      if (
        ending1Beat.introDisplayLocked ||
        ending1Beat.introHeardPerfect ||
        ending1HasPerfectLeadInChat() ||
        (ending1Beat.introNoteSent && ending1Beat.introSeededAt && Date.now() - ending1Beat.introSeededAt < 20000)
      ) {
        dbg("poke skipped; ending1 Turn A already in flight");
        return true;
      }
      // Dead kick only: flags set but nothing seeded/heard for a long time.
      if (
        (ending1Beat.introNoteSent || ending1Beat.introAudioSent || ending1Beat.autoCoachSent > 0) &&
        !ending1Beat.introSeededAt
      ) {
        ending1Beat.introNoteSent = false;
        ending1Beat.introAudioSent = false;
        ending1Beat.autoCoachSent = 0;
        ending1Beat.lastForceAt = 0;
        ending1Beat.lastForceKind = "";
      }
      forceEnding1Intro("poke");
      return true;
    }
    enterEnding1FreeTalkIfReady();
    if (ending1Beat.finaleRequested && !ending1FinaleComplete()) {
      // Recover stuck Turn C: scheduled/sent flags with no goodbye speech.
      if (!assistantSaidEnding1Finale()) {
        ending1Beat.finaleForceScheduled = false;
        if (ending1Beat.finaleNoteSent && Date.now() - (ending1Beat.finaleScheduledAt || 0) > 2500) {
          ending1Beat.finaleNoteSent = false;
        }
        ending1Beat.lastForceAt = 0;
        ending1Beat.lastForceKind = "";
      }
      kickEnding1FinaleChain("poke-finale", { bypassCooldown: true });
      return true;
    }
    // Free talk: fall through to generic continue poke.
  }
  if (seg?.id === "daily1") {
    syncDaily1RalliesFromChat();
    if (daily1ReadyForBackToTank() && !assistantSaidDaily1BackToTank(lastAssistantText())) {
      forceDaily1BackToTank("poke-bridge", { bypassCooldown: true });
      return true;
    }
  }

  const user = String(lastPendingUserText || recentUserMessages(1)[0] || "").trim();
  const note = buildPokeContinueNote();
  try {
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  if (user) {
    lastPendingUserText = user;
    armPendingReplyWatch(user, 0, { fromVoice: false });
  }
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

btnRetry?.addEventListener("click", () => {
  if (actionState !== "active" || isHandoffRunning || isChapterHandoff) return;
  if (tryCompleteWarmupIfUserAgreedAfterInvite()) return;
  pokeLearny();
});
btnEndingEnd?.addEventListener("click", () => {
  if (actionState !== "active" || isHandoffRunning || isChapterHandoff) return;
  endEnding1FreeTalkFromButton();
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
  if (e.data?.type === "gc_jump_segment") {
    applyChapterJumpFromParent({
      lessonId: e.data.lessonId || getActiveLessonId(),
      segmentId: e.data.segmentId,
    });
  }
  if (e.data?.type === "gc_user_profile") {
    setLearnerDisplayName(e.data.displayName || "");
  }
  if (e.data?.type === "gc_end_call") {
    if (actionState === "active" || actionState === "connecting") {
      disconnectAPI();
      actionState = "idle";
      updateActionUI();
    }
  }
});

restoreChapterUiFromLessonState();
updateLessonBanner();
updateActionUI();
window.parent.postMessage({ type: "gc_request_user_profile" }, "*");
dbg("homework voice ready", { level: LEVEL_INFO.id, lesson: LESSON.id });
