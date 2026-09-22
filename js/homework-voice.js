/**
 * Homework Learny voice session (Gemini Live). Replaces Minecraft quest session.
 */
import { GeminiLiveAPI, MultimodalLiveResponseType } from "./gemini-api.js";
import { AudioStreamer, AudioPlayer } from "./media-utils.js?v=20260910-mcq-unlock-1";
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
  buildEndingFreeTalkInstructions,
  buildDaily1Instructions,
  buildFinal1Instructions,
  buildOpeningNudge,
  buildAdvanceNudge,
  buildHandoffOpeningNudge,
  getClickChoices,
  getSegmentChapterMeta,
  resetLesson,
  ensureChapterPlayCounted,
  getActiveLevelId,
  setLearnerDisplayName,
  daily1OpenSpeak,
  daily1OpenSpeakPart2,
  daily1BackToAquariumSpeak,
  daily1BridgeTurnInstruction,
  final1OpenSpeak,
  usesBeginnerPart1Architecture,
  usesBeginnerPart2Architecture,
} from "./lesson-engine.js?v=20260921-admin-part-split";
import { resolveProxyUrl } from "./proxy-config.js";
import { PART1_ELICIT_JA, CH6_BEAT1_SPEAK } from "./lessons/aquarium-part1.js?v=20260921-retry-variety";
import { PART2_ELICIT_JA, PART2_CH1_BEAT1_SPEAK, PART2_CH2_BEAT1_SPEAK, PART2_CH3_BEAT1_SPEAK, PART2_CH4_BEAT1_SPEAK, PART2_CH5_BEAT1_SPEAK, PART2_CH6_BEAT1_SPEAK, PART2_ENDING_INTRO_SPEAK, PART2_ENDING_FINALE_SPEAK, PART2_ENDING_TURN_A_SPEAK, PART2_ENDING_TURN_B_SPEAK, PART2_ENDING_TURN_C_SPEAK, part2McqBeatSpeak } from "./lessons/aquarium-part2.js?v=20260922-part2-intro-tts";
import { QuestSfx } from "./quest-sfx.js";
import { recordEndingFreetalkEnglish } from "./badge-engine.js?v=20260921-admin-part-split";
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
} from "./mcq-engine.js?v=20260921-admin-part-split";
import {
  MCQ_AUDIO_COLORS,
  MCQ_AUDIO_FISH_COUNTS,
  CH4_PICKER_COLORS,
  normalizeMcqAudioLabel,
  normalizeAllowedFavoriteColor,
  colorToJaLabel as colorToJaFromConfig,
  formatCh4ColorChoiceLabel,
} from "./mcq-audio-config.js?v=20260916-part2-audio";
import { MCQ_AUDIO_MANIFEST } from "../audio/mcq/manifest.js?v=20260916-part2-audio";
import {
  ENDING1_FINALE_SPEAK,
  ENDING1_INTRO_SPEAK,
  isEnding1FinaleTranscript,
} from "./ending-audio-config.js?v=20260922-part2-intro-tts";
import { ENDING_AUDIO_MANIFEST } from "../audio/ending/manifest.js?v=20260922-part2-intro-tts";
import { EndingFreeTalkTurnQueue } from "./ending-freetalk-queue.js?v=20260909-ending-prewarm-2";
import { ch4MakeTellSpeak } from "./ch4-audio-config.js?v=20260910-ch4-static-1";
import { CH4_AUDIO_MANIFEST } from "../audio/ch4/manifest.js?v=20260910-ch4-static-1";

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

/** Input behavior comes from the selected level/part lesson script. */
function isVoiceOnlyLesson() {
  return LESSON.inputMode === "voice";
}

function usesTemplateArchitecture(state = loadLessonState()) {
  return usesBeginnerPart1Architecture(
    state?.lessonId || getActiveLessonId(),
    getActiveLevelId()
  );
}

function usesPart2Architecture(state = loadLessonState()) {
  return usesBeginnerPart2Architecture(
    state?.lessonId || getActiveLessonId(),
    getActiveLevelId()
  );
}

/** Part 1 or Part 2 beginner homework (shared warmup/handoff gates). */
function usesBeginnerHomeworkArchitecture(state = loadLessonState()) {
  return usesTemplateArchitecture(state) || usesPart2Architecture(state);
}

/** Part 2 ending: three fixed turns with waits, then auto-disconnect. */
function isEnding1Part2() {
  return getCurrentSegment()?.id === "ending1" && usesPart2Architecture();
}

function ending1ActiveIntroSpeak() {
  return isEnding1Part2() ? PART2_ENDING_INTRO_SPEAK : ENDING1_INTRO_SPEAK;
}

function ending1ActiveFinaleSpeak() {
  return isEnding1Part2() ? PART2_ENDING_FINALE_SPEAK : ENDING1_FINALE_SPEAK;
}

function ending1StaticIntroKey() {
  return isEnding1Part2() ? "beginner-part2-intro" : "beginner-part1-turn-a";
}

function ending1StaticFinaleKey() {
  return isEnding1Part2() ? "beginner-part2-finale" : "beginner-part1-turn-c";
}

function usesBeginnerInstructionProfile() {
  return LESSON.instructionLevel === "beginner";
}

/** Spoken elicit cue for intermediate (no 「選んで」/button language). */
function elicitJaForActiveLevel(text) {
  const s = String(text || "");
  if (!isVoiceOnlyLesson()) return s;
  return s.replace(/の\s*えいごを\s*選んでね！/g, "を えいごで いってみて！");
}

function intermediateAnswerWaitHint() {
  return "WAIT for the child to SPEAK the English answer (no on-screen buttons). Do NOT tell them to tap or choose a button.";
}

/** Rewrite button-centric teacher/coach notes for intermediate voice-only. */
function adaptTeacherNoteForLevel(text) {
  if (!isVoiceOnlyLesson() || !text) return text || "";
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
const PART1_HANDOFF_AFTER = new Set([
  "ch0",
  "ch1",
  "ch2",
  "ch3",
  "quiz1",
  "ch4",
  "ch5",
  "daily1",
  "ch6",
  // Turn A is local audio, but Phase 2 must not inherit Final Challenge history.
  "final1",
]);
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
/** One serialized chapter destination waiting for drop recovery to settle. */
let pendingChapterHandoff = null;
/**
 * Destination id for an in-flight scheduleChapterHandoff (wait → reconnect → opening).
 * Prevents client + Live tool both completing Daily from re-arming the MCQ gate
 * and cancelling the opening kick watch.
 */
let chapterHandoffArmedFor = "";
let handoffKickWatchId = null;
let openingKickFallbackId = null;
/** True from chapter handoff start until Learny begins speaking the new chapter. */
let chapterTransitionActive = false;
let chapterTransitionSafetyId = null;
let pendingHandoffQuote = "";
/** Skip sending the child's turn on the old socket when a handoff was just scheduled. */
let skipOutboundForHandoff = false;
/**
 * Destination segment id whose MCQ must stay hidden until that chapter's opening
 * actually starts (fixes Ch6 Beat-1 panel flashing during Daily→Ch6 bridge wait).
 */
let blockMcqUntilChapterOpening = "";
/** Options for the next kickOpeningTurn (handoff / stuck retry survive SETUP_COMPLETE). */
let pendingOpeningKickOpts = null;
let sessionResumeHandle = null;
let chatMessages = [];
let openingSent = false;
let userActivityOpen = false;
let voiceActivitySequence = 0;
let pendingReplyWatchId = null;
let pendingReplyText = "";
let pendingReplyKey = "";
let pendingReplyMode = "";
let pendingReplyReplayOutbound = "";
let pendingReplyReplaySent = false;
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
let lastAssistantRenderedAt = 0;
let lastAssistantProgressAt = 0;
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
const REPLY_WATCH_MS = 6500;
const REPLY_WATCH_RETRY_MS = 7000;
const REPLY_PROGRESS_GRACE_MS = 2600;
const REPLY_WATCH_MAX = 2; // Legacy delegate body below is unreachable; kept for safe rollback.
let replyWatchEpoch = 0;
let replyWatchAutoPoked = false;
let replyWatchSegmentId = "";
let replyWatchFromVoice = false;
let destructiveResetInProgress = false;
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
/** Client-owned Ch4 speech locks — prevent outbound+force double-speak and MCQ unlock races. */
let ch4PickerSpokenAt = 0;
let ch4MakeTellSentAt = 0;
let ch4MakeTellUnlocked = false;
/** True after the make+tell exact script was successfully sent to Live (blocks ghost second send). */
let ch4MakeTellAudioSent = false;
let ch4MakeTellKickInFlight = false;
/** Seeded exact make+tell bubble — ignore STT for display while locked. */
let ch4MakeTellDisplayLocked = false;
let ch4MakeTellSeededScript = "";
let ch4MakeTellHeardBeatBAt = 0;
/** Hosted Kore WAV playback — drop Live audio/transcript while pending (same as Ending Turn A). */
let ch4MakeTellStaticPending = false;
let ch4MakeTellSpeechComplete = false;
let ch4MakeTellExpectedEndAt = 0;
/** Seeded next-chapter opening — ignore late praise STT from the prior answer. */
let handoffOpeningDisplayLocked = false;
let handoffOpeningSeededScript = "";
/** After first audible opening, drop ghost restarts (same script, one bubble). */
let handoffOpeningSpeechSealed = false;
let handoffOpeningSeededAt = 0;
let handoffOpeningFirstAudioAt = 0;
let handoffOpeningLastAudioPacketAt = 0;
let handoffOpeningPacketCount = 0;
let handoffOpeningQuietSealId = null;
/** Live OUTPUT_TRANSCRIPTION for the current handoff opening (not the seeded bubble). */
let handoffOpeningLiveStt = "";
/** One-shot repair when Live skips the English lead-in. */
let handoffOpeningMissingEnRepairSent = false;
/** Seeded mid-chapter MCQ beat line — keep chat on that exact script until the child answers. */
let mcqBeatDisplayLocked = false;
/** Full bubble text (praise + exact elicit). */
let mcqBeatSeededScript = "";
/** Exact elicit only (no praise) — used to match Live STT. */
let mcqBeatSeededExact = "";
/**
 * Exact script still owed as audible speech. Survives display unlock so a silent
 * / praise-only Live turn cannot cancel auto-つつく while the bubble looks complete.
 */
let mcqBeatPendingExact = "";
/** Accumulated Live STT while a mid-chapter MCQ seed is locked (seeded bubble ≠ spoken). */
let mcqBeatLiveStt = "";
/** One-shot repair when Live praise-onlys and skips the next beat script. */
let mcqBeatMissingScriptRepairSent = false;
/** Bumped to cancel stale missing-script repair timers. */
let mcqScriptRepairGeneration = 0;
/** Last client Speak-EXACTLY for the current MCQ beat (dedupe auto-つつく / repair). */
let lastMcqExactSpeakAt = 0;
let lastMcqExactSpeakScript = "";
let mcqTranscriptPraiseIdx = 0;
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
  if (destructiveResetInProgress) {
    dbg("skip ch2 persistence during destructive reset");
    return;
  }
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

/**
 * Current-play MCQ progress only. Lifetime mcqSummary must NOT count — after a
 * lesson-panel chapter retry the cursor/segmentUi are reset to beat 1, but old
 * summary keys remain and used to falsely trigger mid-chapter resume.
 */
function segmentHasMcqProgress(segmentId, state = loadLessonState()) {
  return loadMcqCursor(segmentId) > 0;
}

function isMidChapterResume(state = loadLessonState()) {
  const segment = getCurrentSegment(state);
  if (!segment) return false;
  if (segmentHasMcqProgress(segment.id, state)) return true;
  // Part 1 only — Part 2 must not use Part 1 ch2 sand-search / ch4 colour UI phase.
  if (usesTemplateArchitecture(state) && segment.id === "ch2") {
    const p = state.segmentUi?.ch2?.phase;
    if (p && p !== "place" && p !== "idle") return true;
  }
  // favoriteColor alone is not mid-chapter — Chapter 4 retries start at Beat A
  // even when a prior play already stored a color memory.
  if (usesTemplateArchitecture(state) && segment.id === "ch4") {
    const p = state.segmentUi?.ch4?.phase;
    if (p && p !== "color" && p !== "idle" && p !== "start") return true;
  }
  return false;
}

function restoreChapterUiFromLessonState() {
  const segment = getCurrentSegment();
  // Part 1 Ch2 sand-search UI only — never restore into Part 2 find-fish.
  if (usesTemplateArchitecture() && segment?.id === "ch2") restoreCh2SearchState();
}

function buildMidChapterResumeNudge(state = loadLessonState()) {
  if (!isMidChapterResume(state)) return null;
  const segment = getCurrentSegment(state);
  if (!segment) return null;

  // Part 1 Ch2 sand search — NEVER use this for Part 2 (same segment id, different lesson).
  if (usesTemplateArchitecture(state) && segment.id === "ch2") {
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

  // Part 1 Ch4 colour / make+tell — NEVER use for Part 2 put-fish MCQ.
  if (usesTemplateArchitecture(state) && segment.id === "ch4") {
    const color = normalizeAllowedFavoriteColor(state.memories?.favoriteColor || "");
    if (!color) {
      return (
        "[Teacher note — do not read aloud] Resume Chapter 4 Beat A1 colour MCQ. " +
        "Speak EXACTLY then WAIT for a colour button: " +
        CH4_COLOR_ASK_SPEAK +
        " FORBIDDEN: accept spoken/typed colours / invent a colour." +
        beginnerTurnHint()
      );
    }
    if (color) {
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
let final1QuestionAudioReady = false;
let final1DisplayLocked = false;
let final1SeededScript = "";
let final1SeededItemId = "";
let final1SpeakKickAt = 0;
let final1MismatchRepairAt = 0;
let bannerSegmentId = "";

/** Ending = 2 spoken turns (intro combined, then finale after fish answer). */
const ENDING1_INTRO_COUNT = 1;
const ENDING1_FINALE_START_INDEX = 1;
const ENDING1_FINALE_COUNT = 1;

/** Second half of Turn A — used when Perfect already played so we never re-say Perfect. */
const ENDING1_INTRO_REMAINDER_SPEAK =
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！ " +
  "What kind of fish should we catch? どんな おさかなを つかまえよう？";

/** Hold-on patch when Gemini jumped to the fish question and skipped the middle. */
const ENDING1_HOLD_ON_SPEAK =
  "Hold on... we don't have any fish in the fish tank! That's for next time! あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！";

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

let endingAudioContext = null;
let endingAudioGainNode = null;
let activeEndingAudioSource = null;
let activeEndingAudioRequest = null;
let activeEndingAudioResolve = null;
let endingAudioPlaybackEndAt = 0;
let endingAudioRequestId = 0;
let endingStaticPausedMic = false;
const endingAudioBufferCache = new Map();

async function getEndingAudioContext() {
  if (!endingAudioContext || endingAudioContext.state === "closed") {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    endingAudioContext = new AudioContextCtor();
    endingAudioGainNode = endingAudioContext.createGain();
    endingAudioGainNode.gain.value = volumeLevel / 100;
    endingAudioGainNode.connect(endingAudioContext.destination);
  }
  if (endingAudioContext.state !== "running") {
    await endingAudioContext.resume();
  }
  return endingAudioContext;
}

function stopEndingStaticAudio() {
  endingAudioRequestId += 1;
  activeEndingAudioRequest?.abort();
  activeEndingAudioRequest = null;
  if (activeEndingAudioSource) {
    activeEndingAudioSource.onended = null;
    try {
      activeEndingAudioSource.stop();
    } catch {
      // Already stopped.
    }
    activeEndingAudioSource.disconnect();
  }
  activeEndingAudioSource = null;
  endingAudioPlaybackEndAt = 0;
  const resolve = activeEndingAudioResolve;
  activeEndingAudioResolve = null;
  resolve?.(false);
}

function endingStaticPlaybackMsLeft() {
  return Math.max(0, Math.ceil(endingAudioPlaybackEndAt - Date.now()));
}

function pauseMicForEndingStaticAudio() {
  endingStaticPausedMic = Boolean(audioStreaming && !isMuted);
  if (!endingStaticPausedMic) return;
  try {
    closeOpenAudioTurn();
    audioStreamer?.resetVoiceGate?.();
    audioStreamer?.pauseStreaming?.();
  } catch {
    // ignore
  }
  audioStreaming = false;
}

async function resumeMicAfterEndingStaticAudio() {
  if (!endingStaticPausedMic) return;
  // Keep the resume intent while the prewarmed socket is still completing
  // setup; SETUP_COMPLETE calls this again without losing the child mic.
  if (
    actionState !== "active" ||
    !client?.connected ||
    !client.sessionReady ||
    isMuted ||
    !audioStreamer
  ) {
    return;
  }
  endingStaticPausedMic = false;
  try {
    await audioStreamer.ensureStreaming();
    audioStreamer.resumeStreaming();
    audioStreaming = true;
  } catch {
    audioStreaming = false;
  }
}

/** Play a generated hosted lesson line without touching the Gemini Live turn. */
async function playHostedStaticAudio(manifest, key) {
  const manifestEntry = manifest[key];
  if (!manifestEntry?.path) throw new Error(`Missing hosted audio: ${key}`);

  stopEndingStaticAudio();
  const requestId = ++endingAudioRequestId;
  const context = await getEndingAudioContext();
  if (!context) throw new Error("Web Audio is unavailable");
  let buffer = endingAudioBufferCache.get(manifestEntry.path);
  if (!buffer) {
    const controller = new AbortController();
    activeEndingAudioRequest = controller;
    const response = await fetch(manifestEntry.path, {
      signal: controller.signal,
      cache: "force-cache",
    });
    if (!response.ok) throw new Error(`Hosted audio request failed: ${response.status}`);
    buffer = await context.decodeAudioData(await response.arrayBuffer());
    endingAudioBufferCache.set(manifestEntry.path, buffer);
  }
  if (requestId !== endingAudioRequestId) return false;
  activeEndingAudioRequest = null;

  return new Promise((resolve, reject) => {
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(endingAudioGainNode || context.destination);
      activeEndingAudioSource = source;
      activeEndingAudioResolve = resolve;
      endingAudioPlaybackEndAt = Date.now() + buffer.duration * 1000;
      source.onended = () => {
        if (activeEndingAudioSource !== source) return;
        source.disconnect();
        activeEndingAudioSource = null;
        activeEndingAudioResolve = null;
        endingAudioPlaybackEndAt = 0;
        if (key === "beginner-part1-turn-a" || key === "beginner-part2-intro") {
          ending1Timing("turn-a-ended");
        }
        resolve(true);
      };
      source.start();
      if (key === "beginner-part1-turn-a" || key === "beginner-part2-intro") {
        ending1TimingStartedAt = ending1TimingStartedAt || Date.now();
        ending1Timing("turn-a-started", {
          durationMs: Math.round(buffer.duration * 1000),
        });
      }
    } catch (error) {
      activeEndingAudioSource = null;
      activeEndingAudioResolve = null;
      endingAudioPlaybackEndAt = 0;
      reject(error);
    }
  });
}

async function playEndingStaticAudio(key) {
  return playHostedStaticAudio(ENDING_AUDIO_MANIFEST, key);
}

async function playCh4StaticAudio(key) {
  return playHostedStaticAudio(CH4_AUDIO_MANIFEST, key);
}

function prefetchEndingAudio() {
  for (const entry of Object.values(ENDING_AUDIO_MANIFEST)) {
    if (!entry?.path) continue;
    fetch(entry.path, { cache: "force-cache" }).catch(() => {
      // Playback has its own Gemini Live fallback.
    });
  }
}

function prefetchCh4Audio() {
  for (const entry of Object.values(CH4_AUDIO_MANIFEST || {})) {
    if (!entry?.path) continue;
    fetch(entry.path, { cache: "force-cache" }).catch(() => {
      // Playback has its own Gemini Live fallback.
    });
  }
}

prefetchEndingAudio();
prefetchCh4Audio();

/** Pending delayed kick after final1 → ending1 (cancel on reset / second schedule). */
let ending1OpeningTimerId = null;
const ending1FreeTalkTurnQueue = new EndingFreeTalkTurnQueue();
let ending1QueuedTurnReadyWatchId = null;
let ending1QueuedTurnReadyAttempts = 0;
const ENDING1_QUEUE_READY_RETRY_MS = 1200;
const ENDING1_QUEUE_READY_MAX_ATTEMPTS = 4;

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
  introStaticPending: false,
  finaleSpoken: 0,
  finaleCoachSent: 0,
  finaleForceScheduled: false,
  finaleScheduledAt: 0,
  finaleNoteSent: false,
  finaleStaticPending: false,
  finaleDisplayLocked: false,
  freeTalk: false,
  freeTalkAnnounced: false,
  freeTalkTopic: "",
  finaleRequested: false,
  hangUpScheduled: false,
  advancedForUserKey: "",
  lastForceAt: 0,
  lastForceKind: "",
};

let ending1TimingStartedAt = 0;
let ending1FirstOutboundAt = 0;
let ending1FirstRenderedAt = 0;

function ending1Timing(stage, detail = {}) {
  const startedAt = ending1TimingStartedAt || Date.now();
  dbg("ending-timing", {
    stage,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    ...detail,
  });
}

function resetEnding1Timing() {
  ending1TimingStartedAt = 0;
  ending1FirstOutboundAt = 0;
  ending1FirstRenderedAt = 0;
}

/** Clears the delayed final1→ending kick timer when Turn A already started. */
function cancelEnding1OpeningTimer() {
  if (ending1OpeningTimerId) {
    clearTimeout(ending1OpeningTimerId);
    ending1OpeningTimerId = null;
  }
}

function clearEnding1QueuedTurnReadyWatch() {
  if (ending1QueuedTurnReadyWatchId) {
    clearTimeout(ending1QueuedTurnReadyWatchId);
    ending1QueuedTurnReadyWatchId = null;
  }
  ending1QueuedTurnReadyAttempts = 0;
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

/** Part 2 intro ends on the free-chat invite, not the earlier You'll be ready / ばっちり line. */
function part2EndingIntroTailHeard() {
  return Boolean(isEnding1Part2() && ending1Beat.introHeardFishQ);
}

/** True while the first Part 2 intro playback must not be cut (sentence gaps are normal). */
function part2EndingIntroStillPlaying() {
  if (!isEnding1Part2() || ending1Beat.introSpeechComplete || part2EndingIntroTailHeard()) {
    return false;
  }
  const start = ending1Beat.introFirstAudioAt || 0;
  if (!start) return true;
  return Date.now() - start < 75000;
}

/** Seal Turn A so a second Perfect generation cannot play (incl. audio-only ghost). */
function sealEnding1IntroSpeech(reason = "seal") {
  // Free talk / post-intro Live must never be cut by a late intro seal.
  if (ending1Beat.freeTalk || isEnding1FreeTalkActive() || ending1Beat.finaleRequested) {
    return;
  }
  // Part 2 intro is Live-spoken and long. Sealing on a mid-script pause
  // interrupts Learny halfway through — but restart cuts must still land.
  const restartCut = /stt-restart|audio-gap-restart|max-audio/i.test(String(reason || ""));
  if (part2EndingIntroStillPlaying() && !restartCut) {
    dbg("part2 ending seal skipped; intro not finished", reason);
    return;
  }
  if (ending1Beat.introSpeechComplete) {
    // Already sealed — drop late packets at the gate; do not interrupt free-talk /
    // draining intro audio (that was cutting Learny halfway).
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
  // Only hard-cut on a clear ghost restart. Quiet / turn-complete seals used to
  // wipe the still-buffered ending of the first speak.
  if (restartCut) {
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
  }
}

/** Drop duplicate Turn A audio (Gemini ghost Perfect often has NO STT / no bubble). */
function shouldDropEnding1IntroAudio() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (ending1Beat.finaleRequested || ending1Beat.freeTalk || isEnding1FreeTalkActive()) {
    return false;
  }
  if (ending1Beat.introStaticPending) return true;
  if (ending1Beat.introSpeechComplete) return true;
  return false;
}

/**
 * Handle one AUDIO packet during ending Turn A.
 * Returns true if the packet must be dropped (ghost second Perfect with no transcription).
 */
function gateEnding1IntroAudioPacket() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (ending1Beat.finaleRequested || ending1Beat.freeTalk || isEnding1FreeTalkActive()) {
    return false;
  }
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

  // Hard cap: Part 1 Turn A is ~18–24s. Part 2 intro is four EN+JP lines (~45–60s).
  const maxIntroMs = isEnding1Part2() ? 75000 : 28000;
  if (now - ending1Beat.introFirstAudioAt > maxIntroMs) {
    sealEnding1IntroSpeech("max-audio-duration");
    return true;
  }

  // Packet-stream gap after a real first burst = new model generation (often NO STT).
  // Part 2: ignore short sentence pauses early on; after the closing line OR a long
  // first play, a gap means Live restarted Perfect from the top.
  const gapMeansRestart = isEnding1Part2()
    ? part2EndingIntroTailHeard() ||
      (ending1Beat.introHeardPerfect && age > 32000 && ending1Beat.introPacketCount > 80) ||
      age > 58000
    : ending1Beat.introHeardPerfect ||
      ending1Beat.introHeardHoldOn ||
      ending1Beat.introHeardFishQ ||
      ending1Beat.introDisplayLocked ||
      age > 10000;
  const gapMs = isEnding1Part2() && !part2EndingIntroTailHeard() ? 1400 : 900;
  if (ending1Beat.introPacketCount > 25 && gap > gapMs && gapMeansRestart) {
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
  const canSealOnQuiet = isEnding1Part2()
    ? part2EndingIntroTailHeard() || age > 75000
    : ending1Beat.introHeardFishQ ||
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
    // Part 2 Live often emits TURN_COMPLETE between sentences. Sealing then
    // cut "Your teacher might ask…" / "You'll be ready!".
    const fullEnough = isEnding1Part2()
      ? part2EndingIntroTailHeard() || age >= 75000
      : ending1Beat.introHeardFishQ ||
        (ending1Beat.introHeardHoldOn && ending1Beat.introHeardPerfect) ||
        age >= 16000 ||
        (ending1Beat.introPacketCount || 0) > 120 ||
        ending1Beat.introTurnCompleteCount >= 2;
    if (!fullEnough) {
      // Schedule a hard seal after a full Turn A window so a no-STT double still gets cut.
      const wait = Math.max(500, (isEnding1Part2() ? 75000 : 22000) - age);
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

/** Part 2 Ending intro — combined Perfect…You'll be ready (not Part 1 fish-tank). */
function assistantSaidPart2EndingIntro(text = lastAssistantText()) {
  const t = String(text || "");
  // ONLY the closing line. Mid-script 「おもいだせたね」 must not mark intro complete
  // (that unlocked free-talk / seal logic while Learny was still speaking).
  return /chat freely|自由に会話|じゆうに\s*かいわ/i.test(t);
}

function part2EndingIntroHeardInChat() {
  if (assistantSaidPart2EndingIntro()) return true;
  return recentAssistantMessages(10).some((m) => assistantSaidPart2EndingIntro(m));
}

/** Clear Part-1 Perfect-lead flags that blocked Part 2 intro kick (ぱーふぇくと). */
function clearFalsePart2EndingPerfectClaim(reason = "") {
  if (!isEnding1Part2()) return;
  if (ending1Beat.part2AssistantTurn >= 1 || ending1Beat.introKickInFlight) return;
  if (
    !(
      ending1Beat.introAudioSent ||
      ending1Beat.introNoteSent ||
      ending1Beat.autoCoachSent > 0 ||
      ending1Beat.introSpeechComplete
    )
  ) {
    return;
  }
  ending1Beat.introAudioSent = false;
  ending1Beat.introNoteSent = false;
  ending1Beat.introKickInFlight = false;
  ending1Beat.introSpeechComplete = false;
  ending1Beat.autoCoachSent = 0;
  ending1Beat.autoSpoken = 0;
  ending1Beat.lastForceAt = 0;
  ending1Beat.lastForceKind = "";
  dbg("part2 ending cleared false Perfect claim", reason);
}

/**
 * Own Part 2 intro from chat when Live freestyled the full script but the
 * client never sealed Turn A (needed so free talk / 終わりにする unlock).
 */
function ownPart2EndingIntroFromChat(reason = "") {
  if (!isEnding1Part2()) return false;
  if (ending1Beat.autoSpoken >= 1 && ending1Beat.introSpeechComplete) return true;
  if (!part2EndingIntroHeardInChat()) {
    clearFalsePart2EndingPerfectClaim(reason);
    return false;
  }
  cancelEnding1OpeningTimer();
  ending1Beat.part2AssistantTurn = 1;
  ending1Beat.introAudioSent = true;
  ending1Beat.introNoteSent = true;
  ending1Beat.introKickInFlight = false;
  ending1Beat.introSpeechComplete = true;
  ending1Beat.introDisplayLocked = false;
  ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  seedEnding1IntroBubble();
  dbg("part2 ending intro owned from chat", reason);
  enterEnding1FreeTalkIfReady();
  paintEndingEndButton();
  updateLessonBanner();
  return true;
}

/**
 * Gemini sometimes freestyles Perfect before the client kick — claim it as Turn A
 * instead of sending a second Perfect coach.
 */
function claimEnding1IntroIfGeminiStarted() {
  if (getCurrentSegment()?.id !== "ending1") return false;
  // Part 2: never claim via Part 1 Perfect-lead / historical chat on opening.
  // Fresh ending session always client-kicks intro; own-from-chat is recovery only.
  if (isEnding1Part2()) {
    if (ending1Beat.introKickInFlight) return false;
    if (
      ending1Beat.autoSpoken >= 1 &&
      ending1Beat.introSpeechComplete &&
      ending1Beat.part2AssistantTurn >= 1
    ) {
      return true;
    }
    clearFalsePart2EndingPerfectClaim("claim-skip-part2");
    return false;
  }
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
  clearEnding1QueuedTurnReadyWatch();
  ending1FreeTalkTurnQueue.reset();
  resetEnding1Timing();
  clearEnding1IntroQuietTimer();
  stopEndingStaticAudio();
  endingStaticPausedMic = false;
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
    introStaticPending: false,
    finaleSpoken: 0,
    finaleCoachSent: 0,
    finaleForceScheduled: false,
    finaleScheduledAt: 0,
    finaleNoteSent: false,
    finaleStaticPending: false,
    finaleDisplayLocked: false,
    freeTalk: false,
    freeTalkAnnounced: false,
    freeTalkTopic: "",
    finaleRequested: false,
    hangUpScheduled: false,
    advancedForUserKey: "",
    lastForceAt: 0,
    lastForceKind: "",
    /** Part 2: 0=none, 1=Turn A spoken, 2=Turn B, 3=Turn C */
    part2AssistantTurn: 0,
  };
}

function ending1AutoIntroComplete() {
  if (ending1Beat.autoSpoken >= ENDING1_INTRO_COUNT) return true;
  // Stale Perfect / ばっちり bubbles from an earlier ending run must not mark
  // intro complete on a fresh Final→Ending handoff (that skipped auto-start and
  // showed 終わりにする with no Turn A audio).
  if (
    !ending1Beat.introAudioSent &&
    !ending1Beat.introSpeechComplete &&
    !ending1Beat.introDisplayLocked &&
    !ending1Beat.introStaticPending &&
    !ending1Beat.introKickInFlight
  ) {
    return false;
  }
  return assistantSaidEnding1Intro();
}

function ending1FinaleComplete() {
  if (!ending1Beat.finaleRequested) return false;
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
  if (isEnding1Part2()) {
    return assistantSaidPart2EndingIntro(t);
  }
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
  return isEnding1FinaleTranscript(text, {
    finaleRequested: ending1Beat.finaleRequested,
    displayLocked: ending1Beat.finaleDisplayLocked,
  });
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
  // Do not promote free-talk from historical chat alone — that skipped Turn A
  // after Final Challenge when an older Perfect bubble was still in the log.
  if (
    !ending1Beat.introAudioSent &&
    !ending1Beat.introSpeechComplete &&
    !ending1Beat.introDisplayLocked &&
    !ending1Beat.introStaticPending &&
    !ending1Beat.introKickInFlight
  ) {
    return;
  }
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

/** After Turn A, follow the child's topic until an explicit 終わりにする action. */
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
    // Do not send a client_content note here. A note is a model turn, so it made
    // Gemini answer stale Final Challenge history before the child answered Turn A.
    // Phase 2 context is attached to the child's first real turn instead.
    dbg("ending1 free-talk ready; waiting for child");
  }
  if (!flushEnding1QueuedChildTurn("phase2-enter")) {
    armEnding1QueuedTurnReadyWatch();
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
  // Free talk is open conversation about the aquarium. Asking about fish / favorites
  // is natural — never treat that as off-script (a repair coach used to interrupt
  // mid-reply and glue on a second question, e.g. "…飼っているの？ to know about…").
  if (isEnding1FreeTalkActive()) {
    if (
      assistantSaidEnding1Beat4(t) ||
      assistantSaidEnding1Finale(t) ||
      /see you next time|また\s*ね|next minecraft lesson|did you have fun with (?:your|the).*lesson|how was (?:your|the).*lesson/i.test(
        t
      )
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
    if (isEnding1Part2()) clearFalsePart2EndingPerfectClaim("intro-blocked-" + reason);
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
  }
  syncEnding1AutoProgress();
  if (ending1AutoIntroComplete() && !ending1Beat.introDisplayLocked) return false;
  // Already hearing/speaking Turn A — never re-kick.
  if (!isEnding1Part2() && (ending1Beat.introHeardPerfect || ending1HasPerfectLeadInChat())) {
    claimEnding1IntroIfGeminiStarted();
    dbg("force ending1 intro skipped; Perfect already heard", reason);
    return false;
  }
  if (!ending1ForceAllowed(isEnding1Part2() ? "part2-a" : "intro")) return false;
  cancelEnding1OpeningTimer();
  // Lock BEFORE send so a parallel kickOpening / delayed timer cannot race a second Perfect.
  ending1Beat.introKickInFlight = true;
  ending1Beat.introAudioSent = true;
  ending1Beat.introNoteSent = true;
  ending1Beat.autoCoachSent = Math.max(ending1Beat.autoCoachSent, 1);
  ending1Beat.introStaticPending = true;
  if (isEnding1Part2()) ending1Beat.part2AssistantTurn = 1;
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  pauseMicForEndingStaticAudio();
  seedEnding1IntroBubble();
  // The fresh ending session is ready and local Turn A is now the audible
  // opening, so the chapter handoff overlay no longer represents real work.
  endChapterTransition();
  if (!ending1TimingStartedAt) ending1TimingStartedAt = Date.now();
  ending1Timing("turn-a-start", { sessionReady: Boolean(client?.sessionReady) });
  const staticKey = ending1StaticIntroKey();
  dbg("play static ending1 intro", reason, staticKey);
  playEndingStaticAudio(staticKey)
    .then(async (played) => {
      if (!played || getCurrentSegment()?.id !== "ending1") return;
      ending1Beat.introStaticPending = false;
      ending1Beat.introKickInFlight = false;
      ending1Beat.introDisplayLocked = false;
      ending1Beat.introSpeechComplete = true;
      ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
      ending1Beat.introHeardFishQ = true;
      assistantTranscriptOpen = false;
      resetAssistantTurnTranscript();
      clearEnding1IntroQuietTimer();
      await resumeMicAfterEndingStaticAudio();
      ending1Timing("turn-a-complete", { sessionReady: Boolean(client?.sessionReady) });
      dbg("static ending1 intro complete");
      enterEnding1FreeTalkIfReady();
      paintEndingEndButton();
      updateLessonBanner();
    })
    .catch(async (error) => {
      if (getCurrentSegment()?.id !== "ending1" || !ending1Beat.introStaticPending) return;
      nativeConsole.warn("Static ending intro playback failed; using Gemini Live", error);
      stopEndingStaticAudio();
      ending1Beat.introStaticPending = false;
      ending1Beat.introSeededAt = Date.now();
      scheduleEnding1IntroUnlock();
      await resumeMicAfterEndingStaticAudio();
      forceEnding1IntroViaLive(reason);
    });
  return true;
}

/** Recovery path only: ask Gemini Live to speak Turn A if hosted audio cannot start. */
function forceEnding1IntroViaLive(reason) {
  const exact = ending1ActiveIntroSpeak();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak the following words EXACTLY ONCE in ONE turn, then STOP and WAIT. " +
    (isEnding1Part2()
      ? "Do NOT say Perfect / You'll be ready twice. Do NOT restart after finishing. Do NOT start free-talk questions yet.\n"
      : "Do NOT say Perfect / Hold on / what kind of fish twice. Do NOT restart from Perfect after finishing.\n") +
    exact;
  try {
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  dbg("force ending1 intro", reason);
  const ok = sendClientText(withEndingExactSpeakRule(formatTeacherNote(note)), { force: true });
  ending1Beat.introKickInFlight = false;
  if (!ok) {
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
  ending1Beat.finaleRequested = true;
  ending1Beat.freeTalk = false;
  syncEnding1FinaleProgress();
  if (ending1FinaleComplete()) {
    maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
    return false;
  }
  // Part 2 and Part 1 both use one hosted finale clip (Live only as fallback).
  if (ending1Beat.finaleStaticPending) return false;
  if (ending1Beat.finaleNoteSent) {
    return forceEnding1FinaleViaLive(reason, { bypassCooldown });
  }

  ending1Beat.finaleStaticPending = true;
  ending1Beat.finaleDisplayLocked = true;
  ending1Beat.finaleForceScheduled = true;
  ending1Beat.finaleScheduledAt = Date.now();
  ending1Beat.finaleNoteSent = true;
  ending1Beat.finaleCoachSent = Math.max(ending1Beat.finaleCoachSent, 1);
  paintEndingEndButton();
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  pauseMicForEndingStaticAudio();
  seedEnding1FinaleBubble();
  const staticKey = ending1StaticFinaleKey();
  dbg("play static ending1 finale", reason, staticKey);
  playEndingStaticAudio(staticKey)
    .then((played) => {
      if (!played || getCurrentSegment()?.id !== "ending1") return;
      ending1Beat.finaleStaticPending = false;
      ending1Beat.finaleDisplayLocked = false;
      ending1Beat.finaleForceScheduled = false;
      ending1Beat.finaleSpoken = Math.max(ending1Beat.finaleSpoken, 1);
      dbg("static ending1 finale complete");
      updateLessonBanner();
      maybeCompleteEnding1AndHangUp(lastPendingUserText || "");
    })
    .catch(async (error) => {
      if (getCurrentSegment()?.id !== "ending1" || !ending1Beat.finaleStaticPending) return;
      nativeConsole.warn("Static ending finale playback failed; using Gemini Live", error);
      stopEndingStaticAudio();
      ending1Beat.finaleStaticPending = false;
      ending1Beat.finaleDisplayLocked = false;
      ending1Beat.finaleForceScheduled = false;
      ending1Beat.finaleNoteSent = false;
      removeEnding1FinaleBubble();
      await resumeMicAfterEndingStaticAudio();
      forceEnding1FinaleViaLive(reason, { bypassCooldown: true });
    });
  return true;
}

/** Recovery path only: ask Gemini Live to speak Turn C if hosted audio cannot start. */
function forceEnding1FinaleViaLive(reason = "end-button", { bypassCooldown = false } = {}) {
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
    ending1ActiveFinaleSpeak() +
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

  // Free talk: only repair premature goodbye / how-many / lesson-review — never
  // interrupt a natural aquarium question mid-turn.
  if (isEnding1FreeTalkActive()) {
    const assistant = lastAssistantText();
    if (!ending1LooksOffScript(assistant)) return;
    if (!assistantTranscriptSettled()) return;
    if (learnyIsBusySpeaking()) return;
    whenAssistantIdle(() => {
      if (!isEnding1FreeTalkActive()) return;
      if (learnyIsBusySpeaking() || !assistantTranscriptSettled()) return;
      if (!ending1LooksOffScript(lastAssistantText())) return;
      sendTeacherNote(
        "ending1-freetalk-repair",
        "[Teacher note — do not read aloud] Continue genuine OPEN-ENDED FREE TALK about the child's aquarium. " +
          (ending1Beat.freeTalkTopic
            ? `The child's current topic is "${String(ending1Beat.freeTalkTopic).slice(0, 80)}". `
            : "") +
          "React to their words and ask ONE friendly follow-up. Fish / decorations / favorites are all OK. " +
          "REQUIRED: English then matching ひらがな in the SAME turn — English-only is FORBIDDEN. " +
          "Never steer toward ending or mention the end button. " +
          "FORBIDDEN only: goodbye / Next Minecraft / How many / Did you have fun with your lesson / complete_segment."
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

/** Recovery-only prompt when a child turn received no response. */
function buildEnding1FreeTalkOutboundCoach(userText = "") {
  if (!isEnding1FreeTalkActive()) return "";
  const t = String(userText || "").trim().slice(0, 80);
  const normalized = normalizeUserText(t).replace(/[!?？。.,]+$/g, "").trim();
  const isClarification =
    /^(what|huh|sorry|pardon|what did you say|say that again|え|えっ|なに|なにそれ|もういちど)$/i.test(
      normalized
    );
  if (t && !isClarification) ending1Beat.freeTalkTopic = t;
  const topic = String(ending1Beat.freeTalkTopic || "").trim().slice(0, 80);
  return (
    "[ENDING PHASE 2 — do not read aloud] Open free talk about the child's Minecraft aquarium. " +
    (t ? `The child's latest words are exactly: "${t}". ` : "") +
    (topic
      ? `Their current topic cue is "${topic}". React specifically to that. `
      : "") +
    (isClarification && topic
      ? "They are asking for clarification, so briefly clarify and continue naturally about that same topic. "
      : "") +
    (/what do you (?:wanna|want to) know|なにを\s*しりたい|なにが\s*ききたい/i.test(t)
      ? "They invited YOU to ask — pick ONE concrete aquarium question (fish, decorations, favorite part, colors, etc.) and ask it naturally. "
      : "") +
    "Ignore stale warmup, quiz, Final Challenge, and generic lesson-retrospective questions. " +
    "Reply out loud NOW with ONE complete turn only: a specific reaction, then ONE natural, friendly follow-up. " +
    "REQUIRED bilingual shape: English first, then matching ひらがな with the SAME meaning in the SAME turn — English-only is FORBIDDEN. " +
    "Never restart, interrupt yourself, or start a second different question in the same turn. " +
    "No scripted progression or turn limit. Never steer toward ending; never mention the end button. " +
    "Keep child-safety and clear age-appropriate English with intelligible ひらがな support. " +
    "FORBIDDEN: Did you have fun with your lesson / generic lesson review / goodbye / Next Minecraft / See you next time / How many / complete_segment / English-only turns."
  );
}

function buildEnding1FreeTalkTurn(userText = "") {
  const child = String(userText || "").trim();
  const coach = buildEnding1FreeTalkOutboundCoach(child);
  if (!child || !coach) return "";
  return `Child said: "${child}"\n${coach}`;
}

function ending1FreeTalkSessionReady() {
  return Boolean(
    isEnding1FreeTalkActive() &&
      actionState === "active" &&
      client?.connected &&
      client.sessionReady &&
      !isHandoffRunning &&
      !isChapterHandoff &&
      !isAutoReconnecting
  );
}

function armEnding1QueuedTurnReadyWatch() {
  if (!ending1FreeTalkTurnQueue.peek() || ending1QueuedTurnReadyWatchId) return;
  // Turn A legitimately lasts much longer than setup. Start the bounded
  // readiness fallback only after local playback has opened Phase 2.
  if (!isEnding1FreeTalkActive()) return;
  ending1QueuedTurnReadyWatchId = setTimeout(() => {
    ending1QueuedTurnReadyWatchId = null;
    if (!ending1FreeTalkTurnQueue.peek() || !isEnding1FreeTalkActive()) return;
    if (flushEnding1QueuedChildTurn("readiness-watch")) return;

    ending1QueuedTurnReadyAttempts += 1;
    if (
      client?.connected &&
      !client.sessionReady &&
      ending1QueuedTurnReadyAttempts >= 2
    ) {
      // Same guarded setup fallback as chapter openings: the socket is open,
      // but setupComplete may have been delayed or lost.
      client.sessionReady = true;
      dbg("ending1 queued turn setup fallback");
      if (flushEnding1QueuedChildTurn("setup-fallback")) return;
    }
    if (ending1QueuedTurnReadyAttempts < ENDING1_QUEUE_READY_MAX_ATTEMPTS) {
      armEnding1QueuedTurnReadyWatch();
      return;
    }
    dbg("ending1 queued turn readiness failed", {
      connected: Boolean(client?.connected),
      sessionReady: Boolean(client?.sessionReady),
    });
    exposeSilentRetry("ending1-session-not-ready");
  }, ENDING1_QUEUE_READY_RETRY_MS);
}

function flushEnding1QueuedChildTurn(source = "ready") {
  const queued = ending1FreeTalkTurnQueue.peek();
  if (!queued || !ending1FreeTalkSessionReady()) return false;
  const outbound = buildEnding1FreeTalkTurn(queued.text);
  if (!outbound) return false;
  const sent = ending1FreeTalkTurnQueue.flush({
    ready: true,
    send: () => {
      prepareForUserOutbound();
      return Boolean(sendClientText(withEndingFreeTalkSpeakRule(outbound), { force: true }));
    },
  });
  if (!sent) {
    dbg("ending1 queued child turn send failed", { source, requestId: queued.requestId });
    armEnding1QueuedTurnReadyWatch();
    return false;
  }

  clearEnding1QueuedTurnReadyWatch();
  childTurnRequestId = Math.max(childTurnRequestId + 1, queued.requestId);
  userTurnSentViaClientText = true;
  lastPendingUserText = queued.text;
  lastUserTurnAt = Date.now();
  if (!ending1TimingStartedAt) ending1TimingStartedAt = queued.queuedAt;
  if (!ending1FirstOutboundAt) ending1FirstOutboundAt = lastUserTurnAt;
  ending1Timing("first-phase2-outbound", {
    requestId: queued.requestId,
    queuedMs: lastUserTurnAt - queued.queuedAt,
  });
  audioPlayer?.beginTurn?.();
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  armSilentReplyWatch(queued.text, {
    fromVoice: queued.source === "voice",
    turnKey: `ending1-${queued.requestId}`,
    mode: "ending-freetalk",
    replayOutbound: outbound,
    replaySent: true,
  });
  dbg("ending1 queued child turn dispatched", {
    source,
    requestId: queued.requestId,
    queuedMs: Date.now() - queued.queuedAt,
  });
  return true;
}

function queueEnding1FreeTalkChildTurn(userText, { source = "typed" } = {}) {
  const queued = ending1FreeTalkTurnQueue.enqueue(userText, { source });
  if (!queued) {
    dbg("ending1 child turn queue busy", String(userText || "").slice(0, 48));
    return false;
  }
  lastPendingUserText = queued.text;
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  dbg("ending1 child turn queued", {
    requestId: queued.requestId,
    source,
    freeTalk: isEnding1FreeTalkActive(),
    sessionReady: Boolean(client?.sessionReady),
  });
  if (!flushEnding1QueuedChildTurn("enqueue")) {
    armEnding1QueuedTurnReadyWatch();
  }
  return true;
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
  const topic = String(ending1Beat.freeTalkTopic || "").trim().slice(0, 80);
  const note =
    "[Teacher note — do not read aloud] FREE TALK — reply out loud NOW to the child's last message" +
    (quote ? ` ("${quote}")` : "") +
    (topic ? `. Keep responding specifically to the current topic "${topic}"` : "") +
    ". React specifically and ask ONE natural, friendly follow-up about their words. " +
    "ONE complete turn: English then matching ひらがな in the SAME turn — English-only is FORBIDDEN; never restart or repeat. " +
    "Follow their topic; never steer toward ending or mention the end button. " +
    "Do NOT ask a generic lesson-review question, How many, or goodbye. Aquarium questions (fish, decorations, favorites) are fine.";
  return sendClientText(withEndingFreeTalkSpeakRule(formatTeacherNote(note)), { force: true });
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
    return isEnding1Part2()
      ? " Ending intro: ONE combined message (Perfect remembered aquarium + teacher questions + You'll be ready), then WAIT."
      : " Ending intro: ONE combined message (thank you + no fish + what kind of fish?), then WAIT.";
  }
  if (ending1Beat.finaleRequested && !ending1FinaleComplete()) {
    return isEnding1Part2()
      ? " Ending finale: ONE goodbye (Minecraft English + See you next time), then disconnect."
      : " Ending finale: ONE combined goodbye (わくわく + next Minecraft), then disconnect.";
  }
  return " Ending FREE TALK: follow the child's topic with one friendly follow-up; never steer toward ending. Only an explicit 終わりにする action starts the finale.";
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
  if (!ending1Beat.finaleRequested) return false;
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
  if (ending1Beat.freeTalk) {
    const { newlyEarned } = recordEndingFreetalkEnglish(userText);
    if (newlyEarned?.length) {
      try {
        window.dispatchEvent(
          new CustomEvent("learny-badges-earned", { detail: { newlyEarned } })
        );
        window.parent?.postMessage?.(
          { type: "gc_badges_earned", newlyEarned },
          "*"
        );
      } catch {
        // ignore
      }
    }
  }
  updateLessonBanner();
  paintEndingEndButton();
  return true;
}

function part2EndingScriptForTurn(turn) {
  if (turn === 1) return PART2_ENDING_TURN_A_SPEAK;
  if (turn === 2) return PART2_ENDING_TURN_B_SPEAK;
  if (turn === 3) return PART2_ENDING_TURN_C_SPEAK;
  return "";
}

function seedPart2EndingBubble(text) {
  const script = String(text || "").trim();
  if (!script) return;
  clearHandoffOpeningDisplayLock("seed-part2-ending");
  resetHandoffOpeningSpeechGate();
  assistantTurnTranscript = script;
  assistantTranscriptOpen = true;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "assistant" && !userSpokeSinceLastAssistantBubble()) {
    last.text = script;
    last.ending1Exact = true;
  } else {
    chatMessages.push({
      type: "assistant",
      text: script,
      ending1Exact: true,
      sttEnterPending: true,
    });
    lastAssistantBubbleAt = Date.now();
  }
  scheduleRenderChat();
  updateLearnyThinkingUI();
  updateLessonBanner();
}

function forcePart2EndingTurnA(reason = "kick-intro") {
  // Part 2 ending now matches Part 1: intro → free talk → 終わりにする.
  return forceEnding1Intro(reason);
}

function forcePart2EndingTurn(_turn, _userText = "", _reason = "") {
  return false;
}

function maybeAdvancePart2Ending(userText) {
  return maybeAdvanceEnding1Beat(userText);
}

function dispatchPart2EndingBadgeEvents(newlyEarned) {
  if (!newlyEarned?.length) return;
  try {
    window.dispatchEvent(
      new CustomEvent("learny-badges-earned", { detail: { newlyEarned } })
    );
    window.parent?.postMessage?.(
      { type: "gc_badges_earned", newlyEarned },
      "*"
    );
  } catch {
    // ignore
  }
}

function completePart2EndingAndHangUp(userText = "") {
  return maybeCompleteEnding1AndHangUp(userText);
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
  if (!ending1Beat.finaleRequested || !ending1FinaleComplete()) return false;
  const state = loadLessonState();
  // Part 1 and Part 2 both client-own the ending finale → chapter gold.
  if (!usesBeginnerHomeworkArchitecture(state)) return false;
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

/**
 * Heal Part 2 runs that finished ending (free talk happened, call ended) but never
 * got chapter gold — maybeCompleteEnding1AndHangUp used to be Part-1-only.
 */
function maybeHealPart2EndingChapterBadge() {
  if (!usesPart2Architecture()) return false;
  if (actionState === "active" || actionState === "connecting") return false;
  const state = loadLessonState();
  if (state.complete || state.completedSegmentIds.includes("ending1")) return false;
  if (!state.completedSegmentIds.includes("final1")) return false;
  if (getCurrentSegment(state)?.id !== "ending1") return false;
  if (!(Number(state.endingFreetalkEnglishCount) > 0)) return false;
  const result = completeSegment("ending1", { userQuote: "" });
  if (!result.ok) return false;
  dbg("healed part2 ending1 complete for chapter gold");
  updateLessonBanner();
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
  if (getCurrentSegment()?.id !== "ending1") return false;
  if (isEnding1Part2()) {
    return ending1Beat.part2AssistantTurn < 1 && !ending1Beat.introKickInFlight;
  }
  return !ending1AutoIntroComplete() && ending1Beat.autoCoachSent === 0;
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
  // Residual Final1 PCM was interrupted above. Hosted Turn A can start now,
  // while the fresh Phase 2 Live session connects in parallel.
  runKick();
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
  final1QuestionAudioReady = false;
  final1DisplayLocked = false;
  final1SeededScript = "";
  final1SeededItemId = "";
  final1SpeakKickAt = 0;
  final1MismatchRepairAt = 0;
  final1PraiseIndex = -1;
  final1LastPraise = null;
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
    .replace(/[「」'"！!？?\s・･]/g, "")
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
  // The on-screen question is the queue cursor. Matching Live's last sentence
  // showed a new prompt while Learny was still saying the previous one.
  if (final1DisplayLocked) {
    const item = getCurrentFinal1Item();
    return item ? { item, queuePos: final1Quiz.cursor, inQueue: true } : null;
  }
  const spoken = resolveFinal1ItemFromAssistant(lastAssistantText(), {
    allowAnswered: true,
  });
  // Prefer the live spoken cue while it is still unanswered (wrong-tap retry).
  if (spoken?.item && !final1ItemAlreadyAnswered(spoken.item)) {
    return spoken;
  }
  // After a correct tap the bubble still shows the old cue, but the cursor has
  // already advanced — keep the MCQ panel open on the next item instead of hiding.
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

/** Audible form of a final cue. Screen text stays promptHira. */
function spokenFinal1Cue(item) {
  return String(item?.promptHira || item?.promptJa || "")
    .replace(/さんご/g, "さ・ん・ご")
    .replace(/こんぶ/g, "こ・ん・ぶ")
    .trim();
}

const FINAL1_PRAISE_PATTERNS = [
  { en: "Great job!", ja: "すごいね！" },
  { en: "Nice one!", ja: "いいね！" },
  { en: "Yes!", ja: "そうだね！" },
  { en: "Amazing!", ja: "やるじゃん！" },
  { en: "Well done!", ja: "よくできたね！" },
  { en: "That's right!", ja: "そのとおり！" },
  { en: "Excellent!", ja: "ばっちり！" },
  { en: "Wonderful!", ja: "すてき！" },
];

let final1PraiseIndex = -1;
let final1LastPraise = null;

function pickFinal1Praise() {
  if (FINAL1_PRAISE_PATTERNS.length < 2) return FINAL1_PRAISE_PATTERNS[0];
  let next = Math.floor(Math.random() * FINAL1_PRAISE_PATTERNS.length);
  if (next === final1PraiseIndex) {
    next = (next + 1) % FINAL1_PRAISE_PATTERNS.length;
  }
  final1PraiseIndex = next;
  return FINAL1_PRAISE_PATTERNS[next];
}

function final1QuestionScript(item, { opening = false, last = false, praise = null } = {}) {
  const cue = String(item?.promptHira || item?.promptJa || "").trim();
  if (!cue) return "";
  if (opening) return `${final1OpenSpeak()} ${cue}`;
  const line = praise || final1LastPraise || pickFinal1Praise();
  if (last) {
    return `${line.en} This is the last question! ${line.ja} さいごの もんだいだよ！ ${cue}`;
  }
  return `${line.en} ${line.ja} ${cue}`;
}

function final1AudibleScript(item, opts = {}) {
  const shown = final1QuestionScript(item, opts);
  const spokenCue = spokenFinal1Cue(item);
  const shownCue = String(item?.promptHira || item?.promptJa || "").trim();
  if (!shown || !spokenCue || spokenCue === shownCue) return shown;
  return shown.replace(shownCue, spokenCue);
}

function seedFinal1QuestionBubble(script, itemId) {
  const text = String(script || "").trim();
  if (!text) return;
  final1DisplayLocked = true;
  final1SeededScript = text;
  final1SeededItemId = String(itemId || "");
  assistantTurnTranscript = text;
  assistantTranscriptOpen = true;
  const norm = (value) => normalizeFinal1MatchText(value);
  const last = chatMessages[chatMessages.length - 1];
  const sameAsLast =
    last?.type === "assistant" && norm(last.text) === norm(text);
  const previousQuestion = [...chatMessages]
    .reverse()
    .find((message) => message.type === "assistant" && message.final1Seeded);
  const repeatAfterAnswer =
    last?.type === "user" &&
    previousQuestion &&
    norm(previousQuestion.text) === norm(text);
  if (sameAsLast || repeatAfterAnswer) {
    if (sameAsLast) {
      last.text = text;
      last.final1Seeded = true;
    }
  } else {
    chatMessages.push({
      type: "assistant",
      text,
      final1Seeded: true,
      sttEnterPending: true,
    });
    lastAssistantBubbleAt = Date.now();
  }
  scheduleRenderChat();
  updateLearnyThinkingUI();
  refreshChoiceBarIfNeeded();
}

function ensureFinal1BubbleExact() {
  if (!final1DisplayLocked || !final1SeededScript) return;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "assistant" && last.final1Seeded && last.text !== final1SeededScript) {
    last.text = final1SeededScript;
    scheduleRenderChat();
  }
}

function final1LiveMatchesCurrentCue(text) {
  const item = getCurrentFinal1Item();
  const core = normalizeFinal1MatchText(
    final1PromptCore(item?.promptHira || item?.promptJa || "")
  );
  if (!core) return true;
  return normalizeFinal1MatchText(text).includes(core);
}

/** True when Live has started a different final-challenge phrase, not just the praise lead. */
function final1SttConflictsWithCurrentCue(text) {
  const t = String(text || "");
  if (!t.trim() || final1LiveMatchesCurrentCue(t)) return false;
  return /えいごで|英語で|おさかな|さんご|こんぶ|がらす|すな|すいそう|かっこいい|うみに|えらぶ|ほしい|すき/.test(
    t
  );
}

/**
 * Final challenge open is a long fixed bilingual line + first cue. Same failure
 * mode as Quiz1/Ch4: withBeginnerSpeakRule ("One short turn") cuts mid-line and
 * Live restarts — kids hear Final challenge twice and STT glitches. Never praise
 * the previous chapter quote (My tank is ready!) on this turn.
 */
function forceFinal1OpenWithFirstQuestion(reason = "final1-open") {
  if (getCurrentSegment()?.id !== "final1") return false;
  if (!client?.connected || (actionState !== "active" && actionState !== "connecting")) {
    return false;
  }
  if (final1Quiz.answered > 0) return false;
  const item = getCurrentFinal1Item();
  const itemId = final1ItemKey(item);
  if (
    itemId &&
    final1SeededItemId === itemId &&
    final1SpeakKickAt &&
    Date.now() - final1SpeakKickAt < 10000 &&
    reason !== "ui-replay"
  ) {
    return false;
  }
  if (assistantAskedFinal1QuizQuestion(lastAssistantText()) && final1DisplayLocked) {
    return false;
  }
  if (final1OpenForceAt && Date.now() - final1OpenForceAt < 10000 && reason !== "ui-replay") {
    return false;
  }
  final1OpenForceAt = Date.now();
  final1SpeakKickAt = Date.now();
  initFinal1QuizIfNeeded();
  const current = getCurrentFinal1Item();
  const script = final1QuestionScript(current, { opening: true });
  const audible = final1AudibleScript(current, { opening: true });
  if (!script || !audible) return false;
  seedFinal1QuestionBubble(script, final1ItemKey(current));
  const outbound =
    "[FINAL1] FINAL CHALLENGE EXACT OPENING. " +
    "Speak exactly the text between <exact> tags as your complete audible turn, once. " +
    "Do not praise or acknowledge the previous chapter (My tank is ready / Great job). " +
    "Do not ask Are you ready? / じゅんびは できてる？. Do not split open + first cue into two turns. " +
    "Do not ask any other final-challenge phrase. " +
    "Stop after えいごで？ and wait for the child.\n" +
    `<exact>${audible}</exact>`;
  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore — do not interrupt mid-playback; exact open replaces the turn
  }
  dbg("force final1 open", reason);
  return sendClientText(withFinal1ExactSpeakRule(formatTeacherNote(outbound)), {
    force: true,
  });
}

/** After a correct Final1 tap — exact praise+next cue (avoids slow free generation). */
function forceFinal1NextCueSpeak(reason = "next-cue") {
  if (!client?.connected || actionState !== "active") return false;
  if (getCurrentSegment()?.id !== "final1") return false;
  const item = getCurrentFinal1Item();
  const cue = String(item?.promptHira || item?.promptJa || "").trim();
  if (!item || !cue) return false;
  if (final1ItemAlreadyAnswered(item)) return false;
  const itemId = final1ItemKey(item);
  const replay = reason === "ui-replay" || reason === "wrong-retry" || reason === "sango-fish-swap";
  if (
    itemId &&
    final1SeededItemId === itemId &&
    final1SpeakKickAt &&
    Date.now() - final1SpeakKickAt < 8000 &&
    !replay
  ) {
    return false;
  }
  const remaining = final1RemainingCount();
  const praise =
    replay && final1LastPraise && itemId === final1SeededItemId
      ? final1LastPraise
      : pickFinal1Praise();
  final1LastPraise = praise;
  const script = final1QuestionScript(item, { last: remaining === 1, praise });
  const audible = final1AudibleScript(item, { last: remaining === 1, praise });
  final1SpeakKickAt = Date.now();
  seedFinal1QuestionBubble(script, itemId);
  const outbound =
    "[FINAL1] NEXT CUE. Speak exactly the text between <exact> tags as your complete audible turn, once. " +
    "This is the ONLY question. Do not add You got it. Do not repeat the previous question. Do not add a second question. Then WAIT for the 4-button tap.\n" +
    `<exact>${audible}</exact>`;
  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  dbg("force final1 next cue", { reason, cue: cue.slice(0, 32), remaining });
  return sendClientText(withFinal1ExactSpeakRule(outbound), { force: true });
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
  if (usesTemplateArchitecture(state) && segment?.id === "final1") {
    initFinal1QuizIfNeeded();
    const retryBit = opts.reason === "stuck_retry" ? " Stuck-retry." : "";
    // Never include lastQuote — praising Ch6 "My tank is ready!" before the
    // exact open caused double speech + mangled STT on replays.
    return (
      `[Coach]${retryBit} final1 ONLY. Speak EXACTLY the <exact> script ONCE (no wait): ` +
      `<exact>${final1OpenWithFirstQuestionSpeak()}</exact> ` +
      "FORBIDDEN: Are you ready? / じゅんびは できてる？ / praising previous chapter."
    );
  }
  // Ch2 mid-progress / place answer must NOT re-open with beach-or-mountains.
  if (usesTemplateArchitecture(state) && segment?.id === "ch2") {
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

/**
 * Quiz 1 exact-speak Live turn. Do not include the previous chapter quote:
 * asking Live to react to it produced a generic quiz opener instead of the
 * required cue. Keep this on Gemini Live (not hosted TTS) so Learny's
 * realtime voice stays consistent with the rest of the lesson.
 */
function forceQuiz1ExactSpeak(reason = "opening", { item = getCurrentQuiz1Item() } = {}) {
  if (getCurrentSegment()?.id !== "quiz1") return false;
  if (!client?.connected || (actionState !== "active" && actionState !== "connecting")) {
    return false;
  }
  const script = quiz1ItemSpeak(item);
  if (!script) return false;
  const isOpening = quiz1State.cursor === 0 && /^(opening|handoff)/i.test(String(reason || ""));
  seedQuiz1SpeakBubble(item);
  const outbound =
    "[QUIZ] MINI QUIZ 1 EXACT AUDIO. " +
    "Speak exactly the text between <exact> tags as your complete audible turn, once — every mora, word by word. " +
    (isOpening
      ? "The first audible word must be くいずたいむ. Do not praise or acknowledge the previous answer. " +
        "FORBIDDEN: starting with じゃあ つぎは / any later quiz item. "
      : "Do not add a new question beyond the exact script. ") +
    "FORBIDDEN shortcuts: くいずたいむ！は英語で？ / くいずたいむ！はえいごで？ (missing the cue inside 「」), " +
    "saying 英語 instead of えいご. " +
    "Do not add Perfect, Let's do a quick quiz, くいずをしよう, English choices, a translation, or a readiness opener. " +
    "Do not split the cue and question into separate turns. Stop immediately after えいごで？ and wait.\n" +
    `<exact>${script}</exact>`;
  dbg("force quiz1 exact speak", { reason, cursor: quiz1State.cursor, script: script.slice(0, 40) });
  return sendClientText(withQuizExactSpeakRule(outbound), { force: true });
}

function forceQuiz1ExactOpening(reason = "opening") {
  if (getCurrentSegment()?.id !== "quiz1" || quiz1State.cursor !== 0) return false;
  return forceQuiz1ExactSpeak(reason);
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
  if (final1DisplayLocked) return;
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
    final1DisplayLocked = false;
    const doneQuote = String(user || lastPendingUserText || "final challenge done").trim();
    if (maybeCompleteFinal1FromClient(doneQuote)) return;
  }

  if (
    final1DisplayLocked &&
    getCurrentFinal1Item() &&
    final1LiveMatchesCurrentCue(final1SeededScript)
  ) {
    return;
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
  final1QuestionAudioReady = false;
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
  if (!usesBeginnerHomeworkArchitecture() || getCurrentSegment()?.id !== "final1") return "";
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
      "Speak EXACTLY once between <exact> tags, then ask the SAME cue ONCE more. Do NOT reveal the answer. " +
      "FORBIDDEN: always Almost! Try again! / おしい！もういちど！\n" +
      `<exact>${retry.speak}</exact> Then cue: ` +
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

  if (correct) {
    // Exact next-cue speak — full lesson prompt free-generation was multi-second lag.
    const requestId = ++childTurnRequestId;
    const sendExact = () => {
      if (requestId !== childTurnRequestId) return false;
      if (actionState !== "active" || !client?.connected) return false;
      const ok = forceFinal1NextCueSpeak("after-correct-tap");
      userTurnSentViaClientText = ok;
      if (ok) {
        lastPendingUserText = label;
        lastUserTurnAt = Date.now();
        awaitingAssistantReply = true;
        updateLearnyThinkingUI();
        armSilentReplyWatch(label, {
          fromVoice: false,
          mode: "final1",
          replaySent: true,
        });
      }
      return ok;
    };
    if (assistantIsSpeaking()) {
      sealStaleAssistantPlaybackEstimate("final1-next-cue-queue");
      whenAssistantIdle(sendExact, "final1-next-cue");
    } else {
      sendExact();
    }
    renderChoiceBar(getCurrentSegment());
    return;
  }

  const coach = buildMcqWrongRetryCoach();
  dispatchChildTurn(label, coach, {
    mode: "final1",
  });

  renderChoiceBar(getCurrentSegment());
  flashMcqIncorrectFeedback(label);
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
  if (!label && isVoiceOnlyLesson()) {
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
  if (!usesBeginnerHomeworkArchitecture()) return true;
  if (getCurrentSegment()?.id !== "final1") return true;
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
  if (!usesBeginnerHomeworkArchitecture(state) || seg?.id !== "final1") return false;
  if (!isFinal1QuizFinished()) return false;
  const quote = String(userText || lastPendingUserText || "final challenge done").trim();
  const result = completeSegment("final1", { userQuote: quote });
  if (!result.ok) {
    dbg("final1 auto-complete failed", result.reason || result);
    return false;
  }
  dbg("final1 auto-complete", quote);
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  updateLessonBanner();
  renderChoiceBar(getCurrentSegment());
  ending1TimingStartedAt = Date.now();
  ending1Timing("fresh-session-requested");
  if (
    afterSegmentAdvanced("final1", result, {
      lastQuote: "",
      fromSegmentId: "final1",
    })
  ) {
    return true;
  }
  if (result.alreadyDone && !isHandoffRunning && !isChapterHandoff) {
    // Recovery for a persisted ending state where no fresh handoff is running.
    forceEnding1OpeningAfterFinal1("auto-complete-already");
  }
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
  // Part 1 only — Part 2 Ch2 is find-fish MCQ, never sand beach/mountains.
  if (!usesTemplateArchitecture()) return false;
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

function assistantSaidDaily1FoodOpener(text = "") {
  return /what did you eat today|きょう\s*なにを\s*たべた|なにを\s*たべたの/i.test(String(text || ""));
}

/** Daily English opener (Part 1 animal / Part 2 food). */
function assistantSaidDaily1Opener(text = "") {
  if (usesPart2Architecture()) return assistantSaidDaily1FoodOpener(text);
  return assistantSaidDaily1AnimalOpener(text);
}

function syncDaily1RalliesFromChat() {
  if (getCurrentSegment()?.id !== "daily1") return;
  let openerIdx = -1;
  for (let i = 0; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m?.type === "assistant" && assistantSaidDaily1Opener(m.text)) {
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

function daily1ChildRepliesAfterOpener() {
  if (getCurrentSegment()?.id !== "daily1") return 0;
  let openerIdx = -1;
  for (let i = 0; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m?.type === "assistant" && assistantSaidDaily1Opener(m.text)) {
      openerIdx = i;
      break;
    }
  }
  if (openerIdx < 0) return 0;
  let count = 0;
  for (let i = openerIdx + 1; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m?.type === "user" || m?.type === "user-transcript") count += 1;
  }
  return count;
}

function daily1ReadyForBackToTank() {
  syncDaily1RalliesFromChat();
  // Never bridge on a silent opening — need real child replies after the opener.
  const replies = Math.max(daily1Chat.rallies, daily1ChildRepliesAfterOpener());
  return replies >= DAILY1_MIN_RALLIES;
}

function canCompleteDaily1Part1() {
  if (!daily1ReadyForBackToTank() || !daily1Chat.backToTankSpoken) return false;
  // Bridge polluted with an everyday question (e.g. "Was it a little bread? … back to aquarium")
  // — wait for the child's answer before jumping to Chapter 5.
  if (daily1BridgeAwaitingChildReply()) return false;
  return true;
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
  if (daily1BridgeAwaitingChildReply()) {
    return (
      "You mixed an everyday question WITH the aquarium/tank bridge. WAIT for the child's answer to that question. " +
      "FORBIDDEN: complete_segment(daily1) / Chapter 5 until they reply. After they answer: short reaction only, then call complete_segment(daily1). " +
      "FORBIDDEN: another everyday question."
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
  const t = String(text || "");
  // Part 2 aquarium bridge
  if (
    /get back to your aquarium|back to your aquarium|すいぞくかんの\s*(?:はなし|話)に\s*(?:もど|戻)ろう|すいぞくかん.*(?:もど|戻)ろう/i.test(
      t
    )
  ) {
    return true;
  }
  // Part 1 tank bridge
  return /get back to the tank|back to the tank|すいそう\s*つくりに\s*(?:もど|戻)ろう|すいそう.*(?:もど|戻)ろう/i.test(t);
}

/** Strip the exact bridge so we can detect leftover everyday questions. */
function daily1TextWithoutBridge(text = "") {
  return String(text || "")
    .replace(
      /nice!?\s*now let's get back to your aquarium!?\s*いいね！?\s*じゃあ\s*すいぞくかんの\s*(?:はなし|話)に\s*(?:もど|戻)ろう！?/gi,
      " "
    )
    .replace(
      /nice!?\s*now let's get back to the tank!?\s*いいね！?\s*じゃあ\s*すいそう\s*つくりに\s*(?:もど|戻)ろう！?/gi,
      " "
    )
    .replace(/now let's get back to your aquarium!?/gi, " ")
    .replace(/now let's get back to the tank!?/gi, " ")
    .replace(/すいぞくかんの\s*(?:はなし|話)に\s*(?:もど|戻)ろう！?/g, " ")
    .replace(/すいぞくかん[^。.!！？?\n]{0,24}(?:もど|戻)ろう！?/g, " ")
    .replace(/すいそう\s*つくりに\s*(?:もど|戻)ろう！?/g, " ")
    .replace(/いいね！?\s*じゃあ\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bridge turn must be reaction + exact bridge only.
 * "Was it a little bread? … Now let's get back to your aquarium!" is polluted —
 * kids still need a turn to answer before Ch5.
 */
function daily1BridgeTurnHasExtraQuestion(text = "") {
  const t = String(text || "");
  if (!assistantSaidDaily1BackToTank(t)) return false;
  const rest = daily1TextWithoutBridge(t);
  if (!rest) return false;
  if (assistantAskedQuestion(rest)) return true;
  // JP/EN question marks left after stripping the bridge.
  return /[？?]/.test(rest);
}

function findLastDaily1BridgeMessageIndex() {
  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    const m = chatMessages[i];
    if (m?.type === "assistant" && assistantSaidDaily1BackToTank(m.text)) return i;
  }
  return -1;
}

function daily1ChildRepliedAfterBridge() {
  const idx = findLastDaily1BridgeMessageIndex();
  if (idx < 0) return false;
  for (let i = idx + 1; i < chatMessages.length; i += 1) {
    const m = chatMessages[i];
    if (m?.type === "user" || m?.type === "user-transcript") {
      if (String(m.text || "").trim()) return true;
    }
  }
  return false;
}

/** True when the latest bridge still expects a child answer before Chapter 5. */
function daily1BridgeAwaitingChildReply() {
  const idx = findLastDaily1BridgeMessageIndex();
  if (idx < 0) return false;
  if (!daily1BridgeTurnHasExtraQuestion(chatMessages[idx]?.text)) return false;
  return !daily1ChildRepliedAfterBridge();
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
  return /^(うん+|ん+|はい|ええ|えー|そう|そうだね|かわいい|kawaii|cute|yeah|yes|yep|ok|okay)[.!！？?\s]*$/i.test(
    String(text || "").trim()
  );
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
  if (!usesBeginnerHomeworkArchitecture() || getCurrentSegment()?.id !== "daily1") return "";
  syncDaily1RalliesFromChat();
  const t = String(userText || "").trim();
  const past = recentAssistantMessages(10).join("\n");

  if (assistantSaidDaily1BackToTank(past) || assistantSaidDaily1BackToTank(lastAssistantText())) {
    if (!daily1ReadyForBackToTank()) {
      return (
        "[Teacher note — do not read aloud] Too early for the aquarium/tank bridge (" +
        daily1Chat.rallies +
        "/" +
        DAILY1_MIN_RALLIES +
        "). IGNORE that bridge. Continue Daily English: reaction + ONE everyday question. Then WAIT."
      );
    }
    if (daily1BridgeAwaitingChildReply()) {
      return (
        "[Teacher note — do not read aloud] You asked an everyday question WITH the bridge. " +
        "WAIT for the child's answer. FORBIDDEN: complete_segment / Chapter 5 / more questions until they reply."
      );
    }
    daily1Chat.backToTankSpoken = true;
    return (
      "[Teacher note — do not read aloud] Bridge spoken. Call complete_segment(daily1) NOW. Stay quiet — next chapter opens. " +
      "FORBIDDEN: more pet/food chat reaction."
    );
  }

  if (daily1ReadyForBackToTank()) {
    return (
      "[Teacher note — do not read aloud] " +
      daily1Chat.rallies +
      "+ rallies done. " +
      daily1BridgeTurnInstruction(t) +
      " Finish speaking fully. FORBIDDEN this turn: complete_segment / next chapter / any new everyday question."
    );
  }

  if (!assistantSaidDaily1Opener(past) && !assistantSaidDaily1WrongOpener(lastAssistantText())) {
    return (
      "[Teacher note — do not read aloud] Speak EXACTLY: " +
      (usesPart2Architecture() ? daily1OpenSpeakPart2() : daily1OpenSpeak()) +
      " Then WAIT. FORBIDDEN: Let's practice today's English. FORBIDDEN: back-to-aquarium/tank bridge before 4 child replies."
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
    " FORBIDDEN: back-to-aquarium/tank bridge before 4 child replies."
  );
}

function forceDaily1BackToTank(reason = "rallies-done", { bypassCooldown = false } = {}) {
  if (getCurrentSegment()?.id !== "daily1") return false;
  if (!client?.connected || actionState !== "active") return false;
  syncDaily1RalliesFromChat();
  if (!daily1ReadyForBackToTank()) return false;
  // Child must have answered after the opener — never bridge on a silent opening.
  if (daily1ChildRepliesAfterOpener() < 1) {
    dbg("force daily1 bridge blocked; no child reply after opener", reason);
    return false;
  }
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
    "FORBIDDEN this turn: complete_segment / any NEW everyday question (Was it…? / だった？). " +
    "Call complete_segment(daily1) only AFTER you finished speaking the reaction + exact bridge.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force daily1 back-to-tank", reason, daily1Chat.rallies);
  return sendClientText(withDaily1SpeakRule(formatTeacherNote(note)), { force: true });
}

function forceDaily1Continue(reason = "need-more-rallies") {
  if (getCurrentSegment()?.id !== "daily1") return false;
  if (!client?.connected || actionState !== "active") return false;
  syncDaily1RalliesFromChat();
  if (daily1ReadyForBackToTank()) {
    return forceDaily1BackToTank(reason + "-bridge");
  }
  // Never stack a second Daily English turn on top of a reply already in flight / on screen.
  const user = String(lastPendingUserText || recentUserMessages(1)[0] || "").trim();
  if (user && hasAssistantReplySinceUser(user) && assistantAskedQuestion(lastAssistantText())) {
    dbg("force daily1 continue skipped; reply already has a question", reason);
    return false;
  }
  if (assistantIsSpeaking() || assistantPlaybackMsLeft() > PLAYBACK_IDLE_MS) {
    dbg("force daily1 continue skipped; assistant still speaking", reason);
    return false;
  }
  if (
    lastAssistantRenderedAt >= lastUserTurnAt &&
    Date.now() - lastAssistantRenderedAt < 8000 &&
    assistantAskedQuestion(lastAssistantText())
  ) {
    dbg("force daily1 continue skipped; recent audible question", reason);
    return false;
  }
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Rally " +
    daily1Chat.rallies +
    "/" +
    DAILY1_MIN_RALLIES +
    ". " +
    buildDaily1NaturalTurnCoach(user) +
    " No tank/Ch6 yet.";
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force daily1 continue", reason, daily1Chat.rallies);
  return sendClientText(withDaily1SpeakRule(formatTeacherNote(note)), { force: true });
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
  if (assistantSaidDaily1Opener(lastAssistantText()) && !assistantSaidDaily1WrongOpener(lastAssistantText())) {
    return false;
  }
  if (daily1OpenForceAt && Date.now() - daily1OpenForceAt < 10000) return false;
  daily1OpenForceAt = Date.now();
  const openLine = usesPart2Architecture() ? daily1OpenSpeakPart2() : daily1OpenSpeak();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak EXACTLY ONE turn: " +
    openLine +
    " FORBIDDEN: Let's practice today's English / きょうの えいごを れんしゅうしよう. " +
    "FORBIDDEN: back-to-aquarium/tank bridge before 4 child replies. Then WAIT." +
    beginnerTurnHint();
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  dbg("force daily1 open", reason);
  return sendClientText(withDaily1SpeakRule(formatTeacherNote(note)), { force: true });
}

function maybeDaily1CorrectiveNudge() {
  if (getCurrentSegment()?.id !== "daily1") return;
  syncDaily1RalliesFromChat();
  const assistant = lastAssistantText();
  const past = recentAssistantMessages(10).join("\n");

  // Premature bridge FIRST — never mark complete / advance on a silent opening.
  if (assistantSaidDaily1BackToTank(assistant) && !daily1ReadyForBackToTank()) {
    daily1Chat.backToTankSpoken = false;
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (daily1ReadyForBackToTank()) return;
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      const note =
        "[Teacher note — do not read aloud] Too early for back-to-aquarium/tank (" +
        daily1Chat.rallies +
        "/" +
        DAILY1_MIN_RALLIES +
        " child replies). IGNORE that bridge. Continue Daily English — reaction + ONE everyday question. Then WAIT. " +
        "FORBIDDEN: bridge / complete_segment(daily1) / next chapter." +
        beginnerTurnHint();
      sendClientText(withDaily1SpeakRule(formatTeacherNote(note)), { force: true });
    }, "daily1-early-bridge");
    return;
  }

  if (assistantSaidDaily1BackToTank(assistant) && daily1ReadyForBackToTank()) {
    daily1Chat.backToTankSpoken = true;
    if (daily1BridgeAwaitingChildReply()) {
      dbg("daily1 bridge awaiting child reply; hold Chapter 5", {
        rallies: daily1Chat.rallies,
      });
      return;
    }
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
  // Only coach — never interrupt a finished question turn (that doubled Daily English speech).
  const user = lastPendingUserText || recentUserMessages(1)[0] || "";
  const flowIssues = daily1UnnaturalAssistantPatterns(assistant, user);
  if (flowIssues.length && daily1Chat.rallies > 0 && !daily1ReadyForBackToTank()) {
    if (assistantAskedQuestion(assistant)) {
      dbg("daily1 unnatural patterns noted; skip force (question already asked)");
      return;
    }
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (daily1ReadyForBackToTank()) return;
      if (assistantAskedQuestion(lastAssistantText())) return;
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
    (!assistantSaidDaily1Opener(past) && daily1Chat.rallies === 0 && String(assistant || "").trim())
  ) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "daily1") return;
      if (assistantSaidDaily1Opener(lastAssistantText()) && !assistantSaidDaily1WrongOpener(lastAssistantText())) {
        return;
      }
      // Don't re-open if Learny already asked the food/animal opener this turn.
      if (assistantSaidDaily1Opener(lastAssistantText())) return;
      forceDaily1Open("wrong-daily1-opener");
    }, "daily1-opener");
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
      " FORBIDDEN: say I made a tank yourself. FORBIDDEN: praise-only. " +
      "FORBIDDEN: 「すいそうを つくってる」 on Beat 3 — JP must be すいそうを つくった の えいごを 選んでね！ only." +
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
  const rememberedColor = normalizeAllowedFavoriteColor(memories.favoriteColor || "");
  const colorName = rememberedColor || "that";

  const saidLetsMake = ch4AssistantSaidLetsMake(past);
  const askedLetMeKnowMake = ch4AssistantSaidBeatB(past);

  // Beat A1 — colour MCQ buttons only. Never accept spoken/typed colour words.
  if (!rememberedColor) {
    refreshChoiceBarIfNeeded();
    return (
      "[Teacher note — do not read aloud] Chapter 4 Beat A1: colour buttons are on screen. " +
      "If you have not asked yet, speak EXACTLY once: " +
      CH4_COLOR_ASK_SPEAK +
      " Then WAIT silently for a colour button tap. " +
      "FORBIDDEN: save spoken/typed colours / Let's make / glass MCQ / walls / invent Japanese for rainbow." +
      beginnerTurnHint()
    );
  }

  // Color already saved (reconnect / praise-loop recovery) — force combined make+tell.
  if (rememberedColor && !askedLetMeKnowMake && !ch4MakeTellUnlocked) {
    whenAssistantIdle(() => forceCh4LetsMake("outbound-color-saved"), "ch4-make-saved");
    return (
      "[Teacher note — do not read aloud] favoriteColor is " +
      rememberedColor +
      ". Do NOT speak — client will deliver Beat A2+B once, then WAIT for MCQ. " +
      "FORBIDDEN: praise-only, ask favorite color again, walls, complete_segment(ch4)." +
      beginnerTurnHint()
    );
  }

  if ((saidLetsMake && askedLetMeKnowMake) || ch4MakeTellUnlocked) {
    return (
      "[Teacher note — do not read aloud] Make+tell elicit already spoken. WAIT for I made " +
      colorName +
      " glass! on the buttons. " +
      "Do NOT repeat Let's make / つくれたら. FORBIDDEN: English inside 「」. " +
      "FORBIDDEN: say the English answer yourself. FORBIDDEN: walls / complete_segment without the phrase." +
      beginnerTurnHint()
    );
  }

  return (
    "[Teacher note — do not read aloud] Chapter 4: favourite colour button → ONE combined make+tell line → I made [color] glass! MCQ. " +
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
  return (
    t.match(/\b[a-z]+\b/gi)?.find((word) =>
      MCQ_AUDIO_COLORS.includes(word.toLowerCase())
    )?.toLowerCase() || ""
  );
}

function colorToJaLabel(colorEn) {
  return colorToJaFromConfig(colorEn);
}

const CH4_COLOR_ASK_EN = "What's your favorite color?";
const CH4_COLOR_ASK_JA = "すきな いろは？";
const CH4_COLOR_ASK_SPEAK = `${CH4_COLOR_ASK_EN} ${CH4_COLOR_ASK_JA}`;

function getCh4UiState() {
  return loadLessonState().segmentUi?.ch4 || {};
}

function persistCh4UiState(patch) {
  if (destructiveResetInProgress) return;
  if (getCurrentSegment()?.id !== "ch4") return;
  const state = loadLessonState();
  state.segmentUi = {
    ...(state.segmentUi || {}),
    ch4: {
      ...(state.segmentUi?.ch4 || {}),
      ...patch,
    },
  };
  saveLessonState(state);
}

function ch4ColorChoiceActive() {
  // Part 1 only — Part 2 Chapter 4 is put-fish MCQ, never favourite-colour picker.
  if (!usesTemplateArchitecture()) return false;
  if (getCurrentSegment()?.id !== "ch4") return false;
  return !ch4HasFavoriteColor();
}

/** @deprecated alias — Beat A1 colour MCQ (not unknown-colour fallback). */
function ch4ColorPickerActive() {
  return ch4ColorChoiceActive();
}

function clearInvalidCh4FavoriteColor() {
  const state = loadLessonState();
  const raw = String(state.memories?.favoriteColor || "").trim();
  if (!raw) return "";
  const allowed = normalizeAllowedFavoriteColor(raw);
  if (allowed) {
    if (allowed !== raw) {
      state.memories = { ...state.memories, favoriteColor: allowed };
      saveLessonState(state);
    }
    return allowed;
  }
  const nextMemories = { ...(state.memories || {}) };
  delete nextMemories.favoriteColor;
  state.memories = nextMemories;
  saveLessonState(state);
  return "";
}

let ch4ColorPickerForceAt = 0;

function ch4PickerAlreadySpoken() {
  return Boolean(ch4PickerSpokenAt) && Date.now() - ch4PickerSpokenAt < 20000;
}

function ch4MakeTellAlreadySent() {
  return Boolean(ch4MakeTellUnlocked) || (ch4MakeTellSentAt && Date.now() - ch4MakeTellSentAt < 20000);
}

function markCh4MakeTellUnlocked(reason = "unlock") {
  ch4MakeTellUnlocked = true;
  ch4MakeTellSentAt = ch4MakeTellSentAt || Date.now();
  dbg("ch4 make+tell unlocked", reason);
  refreshChoiceBarIfNeeded();
}

/** Re-ask Beat A1 favourite-colour line if Learny drifts — buttons already on screen. */
function forceCh4ColorAsk(reason = "color-ask") {
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (ch4HasFavoriteColor()) return false;
  refreshChoiceBarIfNeeded();
  if (ch4PickerAlreadySpoken()) return false;
  if (assistantIsSpeaking()) {
    whenAssistantIdle(() => forceCh4ColorAsk(reason), "ch4-color-ask-wait-idle");
    return false;
  }
  if (ch4ColorPickerForceAt && Date.now() - ch4ColorPickerForceAt < 8000) {
    return false;
  }
  ch4ColorPickerForceAt = Date.now();
  ch4PickerSpokenAt = Date.now();
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak exactly the text between <exact> tags as your complete audible turn, once. " +
    "Then WAIT for a colour button tap.\n" +
    `<exact>${CH4_COLOR_ASK_SPEAK}</exact>\n` +
    "FORBIDDEN: accept spoken colours / unknown-colour fallback lines / Let's make / glass MCQ / walls.";
  dbg("force ch4 color ask", reason);
  return sendClientText(withCh4ExactSpeakRule(formatTeacherNote(note)), { force: true });
}

function handleCh4ColorPickerClick(label) {
  const color = normalizeAllowedFavoriteColor(label);
  if (!color || getCurrentSegment()?.id !== "ch4") return;
  if (!CH4_PICKER_COLORS.includes(color)) return;
  addUserAnswerBubble(label);
  recordMemory("favoriteColor", color);
  persistCh4UiState({ phase: "make", attemptedColor: "" });
  ch4ColorPickerForceAt = 0;
  ch4LetsMakeForceAt = 0;
  ch4PickerSpokenAt = 0;
  resetCh4MakeTellSpeechLocks();
  dbg("ch4 colour MCQ chose", color);
  refreshChoiceBarIfNeeded();
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ch4") return;
    if (!ch4HasFavoriteColor()) return;
    forceCh4LetsMake("ch4-color-mcq");
  }, "ch4-color-make");
}

function expandMcqColorPlaceholders(text, colorEn) {
  const color = normalizeAllowedFavoriteColor(colorEn) || "orange";
  const colorJa = colorToJaLabel(color);
  return String(text || "")
    .replace(/\[colorJa\]/gi, colorJa)
    .replace(/\[color\]/gi, color)
    .replace(/___/g, color);
}

const FISH_COUNT_WORD_MAP = {
  1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
  6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
};

function numberToEnglishWord(n) {
  const num = parseInt(n, 10);
  if (isNaN(num) || num < 1) return "one";
  return FISH_COUNT_WORD_MAP[num] || String(num);
}

/**
 * Parse a fish count the CHILD actually said (1–20).
 * Returns null for off-topic / no-number turns so Ch5 cannot invent a count.
 */
function parseUserFishCount(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (
    /わからない|おぼえてない|forgot|don'?t know|do not know|no idea|みてない|わからないよ/.test(t) &&
    !/\d|one|two|three|four|five|six|seven|eight|nine|ten|ひき|びき|匹/.test(t)
  ) {
    return null;
  }

  const digit = t.match(/(?:^|[^\d])(20|1[0-9]|[1-9])(?!\d)(?:\s*(?:ひき|びき|匹|fish(?:es)?|さかな))?/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 20) return n;
  }

  const enPairs = [
    ["twenty", 20],
    ["nineteen", 19],
    ["eighteen", 18],
    ["seventeen", 17],
    ["sixteen", 16],
    ["fifteen", 15],
    ["fourteen", 14],
    ["thirteen", 13],
    ["twelve", 12],
    ["eleven", 11],
    ["ten", 10],
    ["nine", 9],
    ["eight", 8],
    ["seven", 7],
    ["six", 6],
    ["five", 5],
    ["four", 4],
    ["three", 3],
    ["two", 2],
    ["one", 1],
  ];
  for (const [word, n] of enPairs) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return n;
  }

  const jaCounter = [
    [/じゅっ?ぴき|じゅうひき|１０ひき|10ひき/, 10],
    [/きゅうひき|９ひき|9ひき/, 9],
    [/はちひき|８ひき|8ひき/, 8],
    [/ななひき|７ひき|7ひき/, 7],
    [/ろくひき|６ひき|6ひき/, 6],
    [/ごひき|５ひき|5ひき/, 5],
    [/よんひき|４ひき|4ひき/, 4],
    [/さんびき|３びき|3びき/, 3],
    [/にひき|２ひき|2ひき/, 2],
    [/いっぴき|いちひき|１ぴき|1ぴき/, 1],
  ];
  for (const [re, n] of jaCounter) {
    if (re.test(t)) return n;
  }

  // Whole-utterance bare numbers only (avoid particles like に in longer sentences).
  const bare = t.replace(/[!！?？。．.\s　]+/g, "");
  const bareMap = {
    いち: 1,
    ひとつ: 1,
    に: 2,
    ふたつ: 2,
    さん: 3,
    みっつ: 3,
    よん: 4,
    よっつ: 4,
    ご: 5,
    いつつ: 5,
    ろく: 6,
    むっつ: 6,
    なな: 7,
    ななつ: 7,
    はち: 8,
    やっつ: 8,
    きゅう: 9,
    ここのつ: 9,
    じゅう: 10,
    とお: 10,
  };
  if (bareMap[bare]) return bareMap[bare];
  return null;
}

function part2Ch5FishCountReady(state = loadLessonState()) {
  if (!usesPart2Architecture(state)) return false;
  const n = parseInt(String(state?.memories?.fishCount || "").trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= 10;
}

/** Part 2 Ch5 Beat A1 — on-screen 1–10 number picker. */
function part2Ch5OnFishCountPicker(segment = getCurrentSegment()) {
  if (!usesPart2Architecture() || segment?.id !== "ch5") return false;
  const cur = getCurrentMcqBeat(segment, { unlocked: mcqUnlockFlags(segment) });
  return Boolean(cur?.beat?.fishCountPicker);
}

function resolveFishCountPickerLabels() {
  return MCQ_AUDIO_FISH_COUNTS.map((n) => String(n));
}

function normalizeFishCountChoice(label) {
  const n = parseInt(String(label || "").trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) return "";
  return String(n);
}

/** Clear stale fishCount when entering Part 2 Ch5 so A1 always waits for this play. */
function clearPart2Ch5FishCountGate(reason = "ch5-enter") {
  if (!usesPart2Architecture()) return;
  const state = loadLessonState();
  if (!state?.memories || state.memories.fishCount === undefined) return;
  const next = { ...state.memories };
  delete next.fishCount;
  state.memories = next;
  saveLessonState(state);
  dbg("cleared part2 ch5 fishCount gate", reason);
}

/**
 * Accept a fish count only from the child's words (legacy free-ask path).
 * Prefer the A1 number-picker buttons; this remains for typed/voice on A1.
 * @returns {number|null} accepted count
 */
function maybeAcceptPart2Ch5FishCountFromUser(userText, { forceSpeak = true } = {}) {
  if (!usesPart2Architecture() || getCurrentSegment()?.id !== "ch5") return null;
  if (part2Ch5FishCountReady()) return null;
  // Number picker owns A1 — route taps/typed digits through MCQ instead.
  if (part2Ch5OnFishCountPicker()) return null;
  const n = parseUserFishCount(userText);
  if (!n || n < 1 || n > 10) return null;
  const result = recordMemory("fishCount", String(n));
  if (!result.ok) return null;
  dbg("part2 ch5 fishCount accepted from user", { n, userText: String(userText || "").slice(0, 40) });
  updateLessonBanner();
  renderChoiceBar(getCurrentSegment());
  if (forceSpeak) {
    const cur = getCurrentMcqBeat(getCurrentSegment(), { unlocked: mcqUnlockFlags(getCurrentSegment()) });
    if (cur?.beat) {
      const praise = nextMcqTranscriptPraise();
      seedMcqBeatSpeakBubble(cur.beat, { praise });
      forcePart2McqAdvanceSpeak(String(userText || "").trim() || String(n), cur.beat, praise);
    }
  }
  return n;
}

function japaneseFishCounterPhrase(n) {
  const num = Math.max(1, parseInt(n, 10) || 1);
  // Standard kid teaching counters: 3→びき, else ひき (digit + counter).
  if (num === 3) return "3びき";
  return `${num}ひき`;
}

function expandMcqFishCountPlaceholders(text, fishCount) {
  const count = parseInt(fishCount, 10) || 1;
  const countWord = numberToEnglishWord(count);
  const countMinus1 = numberToEnglishWord(Math.max(1, count - 1));
  const countPlus1 = numberToEnglishWord(count + 1);
  let result = String(text || "");
  // Japanese elicit uses digits + ひき/びき — never English "fourひき".
  result = result.replace(/\[fishCount\]ひき/gi, japaneseFishCounterPhrase(count));
  result = result
    .replace(/\[fishCountMinus1\]/gi, countMinus1)
    .replace(/\[fishCountPlus1\]/gi, countPlus1)
    .replace(/\[fishCount\]/gi, countWord);
  result = result.replace(/There are one fish/gi, "There is one fish");
  result = result.replace(/You had one fish!/gi, "You had one fish!");
  return result;
}

/** Dynamic fish-count MCQ choices (A2) — premade option audio for 1–10. */
function resolveDynamicFishCountChoices(fishCount) {
  const count = Math.min(10, Math.max(1, parseInt(fishCount, 10) || 1));
  const word = numberToEnglishWord(count);
  const minus = numberToEnglishWord(Math.max(1, count - 1));
  const plus = numberToEnglishWord(Math.min(10, count + 1));
  if (count === 1) {
    return [
      "There is one fish.",
      "There are one fish.",
      "There are two fish.",
      "I have one fish.",
    ];
  }
  // When at 10, avoid a duplicate "ten" distractor — use 8 as the other wrong count.
  const otherWrong =
    count === 10 ? numberToEnglishWord(8) : minus === word ? numberToEnglishWord(Math.max(1, count - 2)) : minus;
  return [
    `There are ${word} fish.`,
    `There are ${otherWrong} fish.`,
    `There are ${plus === word ? numberToEnglishWord(Math.max(1, count - 1)) : plus} fish.`,
    `There is ${word} fish.`,
  ];
}

function expandMcqPlaceholders(text, memories = {}) {
  const color = memories?.favoriteColor || "orange";
  const fishCount = memories?.fishCount || 1;
  let result = expandMcqColorPlaceholders(text, color);
  result = expandMcqFishCountPlaceholders(result, fishCount);
  return result;
}

/** Part 2 beat script with [fishCount]/[color] resolved for bubble + Speak EXACTLY. */
function resolvedPart2McqBeatSpeak(beat, memories = loadLessonState().memories || {}) {
  const raw = String(part2McqBeatSpeak(beat) || "").trim();
  if (!raw) return "";
  return expandMcqPlaceholders(raw, memories).replace(/\s+/g, " ").trim();
}

function sanitizeAssistantDisplayText(text) {
  const raw = String(text || "");
  if (!/\[fishCount\]|\[fishCountMinus1\]|\[fishCountPlus1\]|\[color\]/i.test(raw)) {
    return raw;
  }
  return expandMcqPlaceholders(raw, loadLessonState().memories || {});
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
  return Boolean(clearInvalidCh4FavoriteColor());
}

function resetCh4MakeTellSpeechLocks() {
  ch4MakeTellAudioSent = false;
  ch4MakeTellKickInFlight = false;
  ch4MakeTellDisplayLocked = false;
  ch4MakeTellSeededScript = "";
  ch4MakeTellHeardBeatBAt = 0;
  ch4MakeTellStaticPending = false;
  ch4MakeTellSpeechComplete = false;
  ch4MakeTellExpectedEndAt = 0;
}

function seedCh4MakeTellBubble(script) {
  const text = String(script || "").trim();
  if (!text) return;
  ch4MakeTellDisplayLocked = true;
  ch4MakeTellSeededScript = text;
  assistantTurnTranscript = text;
  assistantTranscriptOpen = true;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "assistant" && !userSpokeSinceLastAssistantBubble()) {
    last.text = text;
    last.ch4ExactMakeTell = true;
  } else {
    chatMessages.push({ type: "assistant", text, ch4ExactMakeTell: true, sttEnterPending: true });
    lastAssistantBubbleAt = Date.now();
  }
  scheduleRenderChat();
  updateLearnyThinkingUI();
  refreshChoiceBarIfNeeded();
}

function ensureCh4MakeTellBubbleExact() {
  if (!ch4MakeTellDisplayLocked || !ch4MakeTellSeededScript) return;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "assistant" && last.ch4ExactMakeTell && last.text !== ch4MakeTellSeededScript) {
    last.text = ch4MakeTellSeededScript;
  }
}

function trackCh4MakeTellSttProgress(chunk) {
  if (!ch4MakeTellUnlocked && !ch4MakeTellAudioSent) return;
  const t = String(chunk || "");
  if (ch4AssistantSaidBeatB(t) && !ch4MakeTellHeardBeatBAt) {
    ch4MakeTellHeardBeatBAt = Date.now();
  }
}

/** True when STT shows make+tell restarting mid/after the first play-through. */
function shouldInterruptCh4MakeTellRestart(chunk) {
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (!(ch4MakeTellAudioSent || ch4MakeTellDisplayLocked || ch4MakeTellUnlocked)) return false;
  if (ch4MakeTellStaticPending) return true;
  const t = String(chunk || "");
  if (!t) return false;
  const letsMake = t.match(/let'?s make .+colou?red\s+glass/gi) || [];
  const tellMe = t.match(/tell me when you make one/gi) || [];
  const jaElicit = t.match(/つくれたら「/g) || [];
  const coloured = t.match(/colou?red\s+glass/gi) || [];
  if (letsMake.length >= 2 || tellMe.length >= 2 || jaElicit.length >= 2) return true;
  if (
    ch4MakeTellHeardBeatBAt &&
    Date.now() - ch4MakeTellHeardBeatBAt > 800 &&
    coloured.length >= 2
  ) {
    return true;
  }
  return false;
}

function shouldDropCh4MakeTellAudio() {
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (ch4MakeTellStaticPending) return true;
  if (ch4MakeTellSpeechComplete) return true;
  if (ch4MakeTellExpectedEndAt && Date.now() > ch4MakeTellExpectedEndAt) return true;
  return false;
}

function sealCh4MakeTellSpeech(reason = "seal") {
  ch4MakeTellAudioSent = true;
  ch4MakeTellUnlocked = true;
  ch4MakeTellSentAt = ch4MakeTellSentAt || Date.now();
  ch4MakeTellSpeechComplete = true;
  ch4MakeTellExpectedEndAt = Date.now();
  dbg("ch4 make+tell speech sealed", reason);
  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
}

function ch4MakeTellAudioKey(colorEn) {
  const color = String(colorEn || "orange").trim().toLowerCase();
  return `beginner-part1-ch4-make-tell-${color}`;
}

/** Recovery only — hosted WAV failed. Prefer static path. */
function forceCh4LetsMakeViaLive(reason = "static-fallback") {
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (!client?.connected || actionState !== "active") return false;
  const color = loadLessonState()?.memories?.favoriteColor || "orange";
  const script = ch4CombinedMakeAndTellSpeak(color);
  const note =
    "[Teacher note — do not read aloud] " +
    reason +
    ". Speak exactly the text between <exact> tags as your complete audible turn, once. " +
    "Beat A2+B COMBINED. Then STOP and WAIT for MCQ.\n" +
    `<exact>${script}</exact>\n` +
    "FORBIDDEN: praise-only, favorite color again, walls, say I made " +
    color +
    " glass yourself, complete_segment(ch4), repeating or restarting this line.";
  dbg("force ch4 make+tell via Live", reason);
  ch4MakeTellKickInFlight = true;
  seedCh4MakeTellBubble(script);
  ch4MakeTellExpectedEndAt = Date.now() + Math.max(9000, estimateSpeechMs(script) + 1500);
  const ok = sendClientText(withCh4ExactSpeakRule(formatTeacherNote(note)), { force: true });
  ch4MakeTellKickInFlight = false;
  if (ok) {
    ch4MakeTellAudioSent = true;
    // Hard cut any Live restart after the first expected play-through.
    const generation = idleGeneration;
    setTimeout(() => {
      if (generation !== idleGeneration) return;
      if (getCurrentSegment()?.id !== "ch4") return;
      sealCh4MakeTellSpeech("expected-end");
    }, Math.max(9000, estimateSpeechMs(script) + 1500));
  } else {
    ch4MakeTellUnlocked = false;
    ch4MakeTellSentAt = 0;
    ch4MakeTellAudioSent = false;
    ch4MakeTellDisplayLocked = false;
    ch4MakeTellSeededScript = "";
    ch4MakeTellExpectedEndAt = 0;
  }
  return ok;
}

function forceCh4LetsMake(reason = "stuck-after-color") {
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (!client?.connected || actionState !== "active") return false;
  const color = loadLessonState()?.memories?.favoriteColor || "orange";
  if (ch4MakeTellSpeechComplete || (ch4MakeTellAudioSent && !ch4MakeTellKickInFlight && !ch4MakeTellStaticPending)) {
    markCh4MakeTellUnlocked("audio-already-sent");
    return false;
  }
  if (ch4MakeTellKickInFlight || ch4MakeTellStaticPending) {
    markCh4MakeTellUnlocked("kick-in-flight");
    return false;
  }
  if (ch4LetsMakeForceAt && Date.now() - ch4LetsMakeForceAt < 10000) return false;
  ch4LetsMakeForceAt = Date.now();
  ch4BeatBForceAt = Date.now();
  ch4MakeTellSentAt = Date.now();
  markCh4MakeTellUnlocked(reason);

  const script = ch4CombinedMakeAndTellSpeak(color);
  const audioKey = ch4MakeTellAudioKey(color);
  if (!CH4_AUDIO_MANIFEST?.[audioKey]?.path) {
    return forceCh4LetsMakeViaLive(reason || "missing-static");
  }

  ch4MakeTellKickInFlight = true;
  ch4MakeTellAudioSent = true;
  ch4MakeTellStaticPending = true;
  ch4MakeTellSpeechComplete = false;
  try {
    closeOpenAudioTurn();
    audioPlayer?.interrupt?.();
  } catch {
    // ignore
  }
  pauseMicForEndingStaticAudio();
  seedCh4MakeTellBubble(script);
  // Do NOT send the script (or any speak coach) to Live — that caused a second audible turn.
  dbg("play static ch4 make+tell", reason, color);
  playCh4StaticAudio(audioKey)
    .then(async (played) => {
      if (!played || getCurrentSegment()?.id !== "ch4") return;
      ch4MakeTellStaticPending = false;
      ch4MakeTellKickInFlight = false;
      ch4MakeTellSpeechComplete = true;
      ch4MakeTellExpectedEndAt = Date.now();
      assistantTranscriptOpen = false;
      resetAssistantTurnTranscript();
      ensureCh4MakeTellBubbleExact();
      await resumeMicAfterEndingStaticAudio();
      dbg("static ch4 make+tell complete");
      refreshChoiceBarIfNeeded();
      updateLearnyThinkingUI();
    })
    .catch(async (error) => {
      if (getCurrentSegment()?.id !== "ch4" || !ch4MakeTellStaticPending) return;
      nativeConsole.warn("Static ch4 make+tell failed; using Gemini Live", error);
      stopEndingStaticAudio();
      ch4MakeTellStaticPending = false;
      ch4MakeTellKickInFlight = false;
      ch4MakeTellAudioSent = false;
      await resumeMicAfterEndingStaticAudio();
      forceCh4LetsMakeViaLive(reason || "static-fallback");
    });
  return true;
}

function forceCh4BeatB(reason = "wrong-elicit") {
  // Combined flow: if elicit incomplete, re-speak the full make+tell line.
  return forceCh4LetsMake(reason || "force-beat-b");
}

/** Unstick Ch4: colour saved → combined make+tell + MCQ (Learny often praise-loops). */
function maybeCh4BeatBCorrectiveNudge() {
  if (getCurrentSegment()?.id !== "ch4") return;
  if (assistantIsSpeaking()) return;
  const assistant = lastAssistantText();
  const past = recentAssistantMessages(12).join("\n");

  // Beat A1 — keep colour MCQ on screen; re-ask only if Learny invents an unsupported colour.
  if (ch4ColorChoiceActive()) {
    refreshChoiceBarIfNeeded();
    if (assistantInventedUnsupportedCh4Color(assistant) && !ch4PickerAlreadySpoken()) {
      whenAssistantIdle(() => {
        if (getCurrentSegment()?.id !== "ch4") return;
        if (ch4HasFavoriteColor()) return;
        forceCh4ColorAsk("ch4-color-ask-corrective");
      }, "ch4-color-ask-corrective");
    }
    return;
  }

  if (ch4AssistantSaidBeatB(assistant) || ch4AssistantSaidBeatB(past) || ch4MakeTellUnlocked) {
    patchLastAssistantCh4BeatBIfWrong();
    markCh4MakeTellUnlocked("beat-b-detected");
    return;
  }

  // Color already chosen but Learny asked favorite color again — force make+tell.
  if (ch4HasFavoriteColor() && ch4AssistantReaskedFavoriteColor(assistant)) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "ch4") return;
      if (!ch4HasFavoriteColor()) return;
      if (ch4AssistantSaidBeatB() || ch4MakeTellUnlocked) {
        markCh4MakeTellUnlocked("reask-already");
        return;
      }
      forceCh4LetsMake("ch4-reasked-color");
    }, "ch4-reask-color");
    return;
  }

  // Color chosen but still missing つくれたら elicit — force combined line.
  if (ch4HasFavoriteColor() && !ch4AssistantSaidBeatB(past) && !ch4MakeTellAlreadySent()) {
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "ch4") return;
      if (ch4AssistantSaidBeatB() || ch4MakeTellUnlocked) {
        markCh4MakeTellUnlocked("stuck-already");
        return;
      }
      if (!ch4HasFavoriteColor()) return;
      forceCh4LetsMake("ch4-stuck-after-color");
    }, "ch4-make-tell");
  }
}

function assistantInventedUnsupportedCh4Color(text = lastAssistantText()) {
  if (ch4HasFavoriteColor()) return false;
  const t = String(text || "");
  if (!/let'?s make|coloured glass|colored glass|いろの\s*(?:がらす|ガラス)/i.test(t)) {
    return false;
  }
  // Known lesson colours in the make line are fine even before memory save catches up.
  for (const color of MCQ_AUDIO_COLORS) {
    const re = new RegExp(
      `let'?s make\\s+${color}\\b|\\b${color}\\s+(?:coloured|colored)\\s+glass|${colorToJaLabel(color)}いろ`,
      "i"
    );
    if (re.test(t)) return false;
  }
  return true;
}

function ch4LetsMakeSpeak(colorEn) {
  const color = String(colorEn || "orange").trim();
  const ja = colorToJaLabel(color) + "いろの がらすを つくろう！";
  return "Let's make " + color + " coloured glass! " + ja;
}

/** Beat A2 + Beat B in one turn (easier for kids). */
function ch4CombinedMakeAndTellSpeak(colorEn) {
  return ch4MakeTellSpeak(colorEn);
}

function maybeSaveCh4FavoriteColor(_userText) {
  // Beat A1 is colour-button only — never save from typed/spoken colour words.
}

function looksLikeColorAnswer(text) {
  return Boolean(extractFavoriteColor(text));
}

function userHasMadeColorGlassPhrase(text = "") {
  const color = loadLessonState()?.memories?.favoriteColor;
  const expected = normalizeMcqChoice(`I made ${color || ""} glass`);
  const expectedColored = normalizeMcqChoice(`I made ${color || ""} colored glass`);
  const expectedColoured = normalizeMcqChoice(`I made ${color || ""} coloured glass`);
  const check = (t) => {
    const actual = normalizeMcqChoice(t);
    return (
      Boolean(color && actual) &&
      (actual === expected || actual === expectedColored || actual === expectedColoured)
    );
  };
  if (String(text || "").trim()) return check(text);
  return recentUserMessages().some(check);
}

function canFinishCh4Part1(userText = "") {
  // Never auto-finish on color alone, and never on Ch3's "I made glass!".
  if (!ch4HasFavoriteColor()) return false;
  if (!(ch4AssistantSaidBeatB() || ch4MakeTellUnlocked || ch4MakeTellSpeechComplete)) return false;
  return userHasMadeColorGlassPhrase(userText);
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

/**
 * Part 2 story chapters use fixed MCQ beat lists. Gemini often calls
 * complete_segment after the first correct tap — require the full beat run.
 */
function canCompletePart2McqSegment(segmentId = getCurrentSegment()?.id) {
  const sid = String(segmentId || "");
  if (!usesPart2Architecture() || !sid) return true;
  const seg = getSegmentById(sid) || (getCurrentSegment()?.id === sid ? getCurrentSegment() : null);
  const beats = getSegmentMcqBeats(seg);
  if (!beats.length) return true;
  // advanceMcqCursor sets cursor to beats.length when the last beat is answered.
  return Number(loadMcqCursor(sid) || 0) >= beats.length;
}

function part2McqCompleteBlockedMessage(segmentId) {
  const sid = String(segmentId || "");
  const seg = getSegmentById(sid) || getCurrentSegment();
  const beats = getSegmentMcqBeats(seg);
  const cursor = Number(loadMcqCursor(sid) || 0);
  const cur = beats[Math.min(cursor, Math.max(0, beats.length - 1))];
  const nextSpeak = cur
    ? resolvedPart2McqBeatSpeak(cur) ||
      expandMcqPlaceholders(
        `${cur.learnyEn || ""} ${cur.learnyJa || ""}`.trim(),
        loadLessonState().memories || {}
      )
    : "";
  const lastAnswer = beats[beats.length - 1]?.answer || "the final beat phrase";
  return (
    `${seg?.titleEn || sid} is NOT done (${Math.min(cursor, beats.length)}/${beats.length} beats). ` +
    `Stay on the current MCQ. Speak EXACTLY: ${nextSpeak || "current beat line"} Then WAIT. ` +
    `Call complete_segment(${sid}) ONLY after the child correctly answers "${lastAnswer}". ` +
    "FORBIDDEN: skipping ahead to the next chapter."
  );
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

function assistantSkippedEigoElicit(text = lastAssistantText()) {
  const t = String(text || "");
  if (!/選んでね/.test(t)) return false;
  if (/の\s*えいごを\s*選んでね/.test(t)) return false;
  return /」\s*の\s*選んでね|」\s*の\s*を\s*選んでね|の\s*選んでね！/.test(t);
}

let elicitEigoSkipForceAt = 0;

/** Live sometimes drops えいご because coaches say "don't speak the English answer". */
function maybeElicitEigoSkipNudge() {
  if (!usesBeginnerInstructionProfile() || isVoiceOnlyLesson()) return;
  if (assistantIsSpeaking()) return;
  if (!assistantSkippedEigoElicit()) return;
  if (elicitEigoSkipForceAt && Date.now() - elicitEigoSkipForceAt < 12000) return;
  const seg = getCurrentSegment();
  if (!seg || !["ch1", "ch2", "ch3", "ch5", "ch6"].includes(seg.id)) return;
  elicitEigoSkipForceAt = Date.now();
  whenAssistantIdle(() => {
    if (!assistantSkippedEigoElicit()) return;
    sendTeacherNote(
      `elicit-eigo-skip-${seg.id}`,
      "[Teacher note — do not read aloud] You skipped えいごを. " +
        "Re-speak ONLY the Japanese elicit ending EXACTLY once: の えいごを 選んでね！ " +
        "Pronounce え・い・ご・を. Do not say の選んでね. Then WAIT." +
        beginnerTurnHint()
    );
  }, "elicit-eigo-skip");
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
  maybeElicitEigoSkipNudge();
  maybeQuiz1ExactSpeakNudge();
  maybeSangoFishSwapNudge();
  maybePart2Ch1Beat1ExactSpeakNudge();
  maybePart2HandoffOpeningExactSpeakNudge();
  maybeWarmupHomeworkLeakNudge();
  maybeCh5Beat3ExactSpeakNudge();

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
  // Part 1 ONLY — Part 2 Ch1 is decorate/kelp MCQ, never glass/tank Step 1.
  if (!usesTemplateArchitecture()) return;
  if (getCurrentSegment()?.id !== "ch1") return;
  const assistant = lastAssistantText();
  if (!looksLikeTankInvite(assistant)) return;
  // Real Ch1 glass question already present — leave it.
  if (looksLikeCh1Step1Question(assistant)) return;
  whenAssistantIdle(() => {
    if (!usesTemplateArchitecture()) return;
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
  // Part 1 only — Part 2 Ch2 is find-fish, never beach/mountains sand search.
  if (!usesTemplateArchitecture()) return;
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
  if (!usesTemplateArchitecture(state) || seg?.id !== "ch6") return false;
  if (!looksLikeTankReadyPhrase(userText)) return false;
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return false;
  dbg("ch6 auto-complete", userText, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return true;
  }
  const generation = idleGeneration;
  setTimeout(() => {
    if (generation !== idleGeneration) return;
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
    const fromSegmentId = "ch6";
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
      if (
        afterSegmentAdvanced("ch6", result, {
          lastQuote: tankMsg,
          fromSegmentId,
        })
      ) {
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

function compactQuizSpeakText(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[！!？?。、･・]/g, "")
    .replace(/英語/g, "えいご")
    .toLowerCase();
}

function quiz1CueCompact(item) {
  return compactQuizSpeakText(item?.promptHira || item?.promptJa || "");
}

function assistantHasQuiz1Cue(text, item) {
  const cue = quiz1CueCompact(item);
  if (!cue) return true;
  return compactQuizSpeakText(text).includes(cue);
}

function assistantMatchesExactQuiz1Speak(text, item) {
  const script = quiz1ItemSpeak(item);
  if (!script || !text) return false;
  const got = compactQuizSpeakText(text);
  const want = compactQuizSpeakText(script);
  if (!want) return false;
  return got.includes(want);
}

/** Live sometimes drops the 「cue」 and says くいずたいむ！は英語で？ */
function assistantQuiz1SpeakMangled(text, item = getCurrentQuiz1Item()) {
  if (!item || !text) return false;
  const t = String(text || "");
  if (assistantMatchesExactQuiz1Speak(t, item)) return false;
  const quizShaped =
    /くいずたいむ|じゃあ\s*つぎは|は\s*(?:英語|えいご)で/.test(t);
  if (!quizShaped) return false;
  // Spoke a different quiz item's cue (e.g. Q2 while cursor is still Q1).
  const others = getQuiz1Items().filter((it) => it && it !== item && it.id !== item.id);
  if (
    others.some((other) => assistantHasQuiz1Cue(t, other)) &&
    !assistantHasQuiz1Cue(t, item)
  ) {
    return true;
  }
  if (/は\s*(?:英語|えいご)で/.test(t) && !assistantHasQuiz1Cue(t, item)) return true;
  if (/くいずたいむ/.test(t) && !assistantHasQuiz1Cue(t, item)) return true;
  if (/は\s*英語で/.test(t) && !/は\s*えいごで/.test(t)) return true;
  // Opening must start with くいずたいむ — later items start with じゃあ つぎは.
  if (quiz1State.cursor === 0 && /じゃあ\s*つぎは/.test(t) && !/くいずたいむ/.test(t)) {
    return true;
  }
  return false;
}

function ensureQuiz1BubbleExact(item = getCurrentQuiz1Item()) {
  const script = quiz1ItemSpeak(item);
  if (!script) return false;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type !== "assistant") return false;
  if (!assistantQuiz1SpeakMangled(last.text, item) && assistantMatchesExactQuiz1Speak(last.text, item)) {
    return false;
  }
  if (
    !assistantQuiz1SpeakMangled(last.text, item) &&
    !/くいずたいむ|じゃあ\s*つぎは|は\s*(?:英語|えいご)で/.test(String(last.text || ""))
  ) {
    return false;
  }
  last.text = sanitizeAssistantBubbleText(script);
  last.quiz1Seeded = true;
  assistantTurnTranscript = script;
  scheduleRenderChat();
  return true;
}

/** Show the current quiz1 speak line immediately (STT often lags or shows the wrong item). */
function seedQuiz1SpeakBubble(item = getCurrentQuiz1Item()) {
  const script = quiz1ItemSpeak(item);
  if (!script) return;
  const last = chatMessages[chatMessages.length - 1];
  if (
    last?.type === "assistant" &&
    !userSpokeSinceLastAssistantBubble() &&
    (last.quiz1Seeded ||
      last.handoffSeeded ||
      /くいずたいむ|じゃあ\s*つぎは|は\s*(?:英語|えいご)で/.test(String(last.text || "")) ||
      assistantMessagesTooSimilar(last.text, script))
  ) {
    last.text = script;
    last.quiz1Seeded = true;
    assistantTurnTranscript = script;
    assistantTranscriptOpen = true;
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return;
  }
  chatMessages.push({
    type: "assistant",
    text: script,
    quiz1Seeded: true,
    sttEnterPending: true,
  });
  lastAssistantBubbleAt = Date.now();
  assistantTurnTranscript = script;
  assistantTranscriptOpen = true;
  scheduleRenderChat();
  updateLearnyThinkingUI();
}

function buildQuiz1SpeakCoach(item = getCurrentQuiz1Item()) {
  if (!item) return "";
  const script = quiz1ItemSpeak(item);
  if (isVoiceOnlyLesson()) {
    return (
      "Speak EXACTLY every mora word-by-word (use <exact> if needed): " +
      script +
      " FORBIDDEN: くいずたいむ！は英語で？ / missing cue inside 「」 / がらすが英語で without ひつよう / 英語 instead of えいご. " +
      "Then " +
      intermediateAnswerWaitHint() +
      " Do not speak English choices aloud."
    );
  }
  return (
    "Speak EXACTLY every mora word-by-word (use <exact> if needed): " +
    script +
    " FORBIDDEN: くいずたいむ！は英語で？ / missing cue inside 「」 / がらすが英語で without ひつよう / 英語 instead of えいご. " +
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
  // Part 1 and Part 2 both require all quiz1 items — never auto-true for Part 2.
  if (!usesBeginnerHomeworkArchitecture()) return true;
  const items = getQuiz1Items();
  const total = items.length;
  if (getCurrentSegment()?.id !== "quiz1") {
    // Tool/complete checks while still on quiz1 use answered count; after leave use state.
    return isQuiz1CompletedInState() || (total > 0 && quiz1State.answered >= total);
  }
  return total > 0 && quiz1State.answered >= total;
}

function quiz1CoachHint() {
  const seg = getCurrentSegment();
  if (seg?.id !== "quiz1") return "";
  const total = getQuiz1Items().length || 3;
  const done = quiz1State.answered;
  const cur = getCurrentQuiz1Item();
  const mode = isVoiceOnlyLesson()
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
  if (!usesBeginnerHomeworkArchitecture(state) || seg?.id !== "quiz1") return "";
  maybeAdvanceQuiz1(userText);
  if (!canCompleteQuiz1Part1()) return "";
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return "";
  dbg("quiz1 auto-complete", userText, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

function buildQuiz1OutboundCoach(userText) {
  if (!usesBeginnerHomeworkArchitecture() || getCurrentSegment()?.id !== "quiz1") return "";
  const t = String(userText || "").trim();
  const total = getQuiz1Items().length || 3;
  const item = getCurrentQuiz1Item();
  const nextChapterBit = usesPart2Architecture()
    ? "Next is Chapter 4: put the fish in the tank. FORBIDDEN: more quiz items / Part 1 glass/sand."
    : "Next is Chapter 4: What's your favorite color? FORBIDDEN: more quiz items.";

  if (!item) {
    return (
      "[Teacher note — do not read aloud] Mini quiz 1 is DONE (" +
      total +
      "/" +
      total +
      "). Call complete_segment(quiz1) NOW. " +
      nextChapterBit +
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
      ". ONE short varied praise (Great! / Amazing! / Nice one! / やったね / ばっちり — NOT すごい again if you just used it), echo 「" +
      (prev.answer || t) +
      "」, then speak the NEXT speak line EXACTLY word-for-word in the SAME turn: " +
      buildQuiz1SpeakCoach(item) +
      " FORBIDDEN: praising a different phrase, skipping ahead, repeating the previous quiz item." +
      beginnerTurnHint()
    );
  }

  if (userMatchesQuiz1Item(t, item)) {
    // Advance was missed somehow — coach still pushes next/complete.
    return (
      "[Teacher note — do not read aloud] Correct: " +
      (item.answer || t) +
      ". Advance the quiz cursor, praise briefly (Great! / Amazing!), then ask the NEXT listed speak line EXACTLY (or complete_segment if last)." +
      beginnerTurnHint()
    );
  }

  return (
    "[Teacher note — do not read aloud] Stay on Mini quiz 1 item " +
    (quiz1State.cursor + 1) +
    "/" +
    total +
    ". If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / ざんねん / ちがうみたい / おっと — NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer. Then " +
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

/** Re-speak the exact quiz line when Live drops the 「cue」 (e.g. くいずたいむ！は英語で？). */
function maybeQuiz1ExactSpeakNudge() {
  if (getCurrentSegment()?.id !== "quiz1") return;
  if (!usesBeginnerInstructionProfile() && getActiveLessonId() !== "part1") return;
  const item = getCurrentQuiz1Item();
  if (!item) return;
  if (!assistantTranscriptSettled()) return;
  const text = lastAssistantText().trim();
  if (!assistantQuiz1SpeakMangled(text, item)) return;

  ensureQuiz1BubbleExact(item);
  const key = `quiz1-exact-${item.id || quiz1State.cursor}-${normalizeUserText(text).slice(0, 24)}`;
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "quiz1") return;
    const cur = getCurrentQuiz1Item();
    if (!cur || (cur.id || quiz1State.cursor) !== (item.id || quiz1State.cursor)) return;
    if (!assistantQuiz1SpeakMangled(lastAssistantText(), cur)) return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    ensureQuiz1BubbleExact(cur);
    forceQuiz1ExactSpeak("mangled-repair", { item: cur });
    dbg("quiz1 exact speak repair", key);
  }, "quiz1-exact");
}

let sangoFishSwapForceAt = 0;

/** Re-speak when Live substitutes おさかな for the coral cue さんご. */
function maybeSangoFishSwapNudge() {
  const heard = String(lastAssistantText() || "").replace(/\s/g, "");
  if (!/おさかながすき|おさかながすき！/.test(heard)) return;
  if (/さ・ん・ご|さんご/.test(heard)) return;
  if (sangoFishSwapForceAt && Date.now() - sangoFishSwapForceAt < 12000) return;
  const seg = getCurrentSegment();
  if (!seg) return;
  const expectsCoral = /さんご/.test(getActiveMcqQuestionScript(seg));
  if (!expectsCoral) return;
  sangoFishSwapForceAt = Date.now();
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== seg.id) return;
    if (!/さんご/.test(getActiveMcqQuestionScript())) return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    if (seg.id === "final1") forceFinal1NextCueSpeak("sango-fish-swap");
    else if (seg.id === "quiz1") forceQuiz1ExactSpeak("sango-fish-swap");
    else forceMcqQuestionExactReplay("sango-fish-swap");
    dbg("sango fish-swap repair", seg.id);
  }, "sango-fish-swap");
}

/** Part 2 Ch1 Beat 1 must match learnie_aquarium_quest_part2.md word-for-word. */
function assistantPart2Ch1Beat1Mangled(text = lastAssistantText()) {
  if (!usesPart2Architecture()) return false;
  if (getCurrentSegment()?.id !== "ch1") return false;
  const cursor = Number(loadMcqCursor(getCurrentSegment()) || 0);
  if (cursor > 0) return false;
  if (mcqBeatDisplayLocked) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  // Later-beat scripts are not Beat 1 mangling.
  if (
    /how about coral|さんごを\s*おいた|different decorations|これを\s*えらぶ|like this coral|この\s*さんごが\s*すき|looks cool|かっこいい/i.test(
      t
    )
  ) {
    return false;
  }
  const exact = PART2_CH1_BEAT1_SPEAK;
  const norm = (s) =>
    String(s || "")
      .replace(/\s+/g, "")
      .replace(/[「」'"]/g, "")
      .toLowerCase();
  const tn = norm(t);
  const en = norm(exact);
  if (tn === en) return false;
  // Missing elicit, paraphrase, or extra Japanese after the scripted elicit.
  if (!/ここに\s*こんぶを\s*おいた/.test(t) || !/の\s*えいごを\s*選んでね/.test(t)) return true;
  if (!/let'?s remember how you decorated your tank/i.test(t)) return true;
  if (/あなたのすいそう|かざりつけ|おぼえてるかな/.test(t)) return true;
  // Repeated English/elicit chunks count as mangled.
  if ((t.match(/decorated your tank/gi) || []).length > 1) return true;
  if ((t.match(/ここに\s*こんぶを\s*おいた/g) || []).length > 1) return true;
  // Any trailing content after the exact script.
  const idx = tn.indexOf(en);
  if (idx === 0 && tn.length > en.length + 2) return true;
  if (idx < 0 && tn.includes("decoratedyourtank") && tn.length > en.length) return true;
  return false;
}

function ensurePart2Ch1Beat1BubbleExact() {
  // Never re-lock / overwrite after the child has moved past Beat 1.
  if (Number(loadMcqCursor(getCurrentSegment()) || 0) > 0) return;
  if (userSpokeSinceLastAssistantBubble()) return;
  if (mcqBeatDisplayLocked) return;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.mcqSeeded) return;
  const lastText = String(last?.text || "");
  // Later beats must never be rewritten to the kelp opening line.
  if (
    /how about coral|さんごを\s*おいた|different decorations|これを\s*えらぶ|like this coral|この\s*さんごが\s*すき|looks cool|かっこいい/i.test(
      lastText
    )
  ) {
    return;
  }
  const exact = PART2_CH1_BEAT1_SPEAK;
  if (last?.type === "assistant") {
    last.text = exact;
    last.handoffSeeded = true;
  }
  handoffOpeningDisplayLocked = true;
  handoffOpeningSeededScript = exact;
  assistantTurnTranscript = exact;
  scheduleRenderChat();
}

function maybePart2Ch1Beat1ExactSpeakNudge() {
  if (!assistantPart2Ch1Beat1Mangled()) return;
  if (!assistantTranscriptSettled()) return;
  ensurePart2Ch1Beat1BubbleExact();
  const key = `part2-ch1-beat1-exact-${normalizeUserText(lastAssistantText()).slice(0, 24)}`;
  whenAssistantIdle(() => {
    if (!assistantPart2Ch1Beat1Mangled(lastAssistantText())) return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    ensurePart2Ch1Beat1BubbleExact();
    sendTeacherNote(
      key,
      "[Teacher note — do not read aloud] PART 2 Chapter 1 Beat 1 was paraphrased. " +
        "Speak EXACTLY word-for-word then WAIT (no extra Japanese): " +
        PART2_CH1_BEAT1_SPEAK +
        " FORBIDDEN: あなたのすいそうの / かざりつけ / おぼえてるかな / repeating any part." +
        beginnerTurnHint()
    );
    dbg("part2 ch1 beat1 exact speak repair", key);
  }, "part2-ch1-beat1-exact");
}

/** Part 2 chapter openings (ch2+) must keep the elicit — praise before the exact script is OK. */
function normalizePart2ScriptCompare(s) {
  return String(s || "")
    .replace(/\s+/g, "")
    .replace(/[「」'"]/g, "")
    .toLowerCase();
}

/** English lead-in before 「…」 in a Part 2 opening/beat script. */
function handoffOpeningEnglishLead(exact = handoffOpeningSeededScript) {
  const e = String(exact || "").trim();
  if (!e) return "";
  const cut = e.search(/[「]/);
  const lead = (cut >= 0 ? e.slice(0, cut) : e).trim();
  if (!/[a-zA-Z]{4,}/.test(lead)) return "";
  return lead;
}

/** True when Live STT includes the required English lead (kids must hear it). */
function assistantHasHandoffOpeningEnglish(text, exact = handoffOpeningSeededScript) {
  const lead = handoffOpeningEnglishLead(exact);
  if (!lead) return true;
  const nt = normalizePart2ScriptCompare(text);
  const nl = normalizePart2ScriptCompare(lead);
  const needle = nl.slice(0, Math.min(28, nl.length));
  return needle.length >= 8 && nt.includes(needle);
}

function noteHandoffOpeningLiveStt(chunk) {
  const c = String(chunk || "").trim();
  if (!c || !handoffOpeningDisplayLocked) return;
  handoffOpeningLiveStt = pickTranscriptChunk(handoffOpeningLiveStt, c, { finished: false });
}

function scheduleHandoffOpeningMissingEnglishRepair() {
  if (!usesPart2Architecture()) return;
  if (!handoffOpeningDisplayLocked || !handoffOpeningSeededScript) return;
  if (handoffOpeningMissingEnRepairSent) return;
  if (userSpokeSinceLastAssistantBubble()) return;
  if (Number(loadMcqCursor(getCurrentSegment()) || 0) > 0) return;
  const live = handoffOpeningLiveStt || "";
  // Need some Live evidence of the elicit (otherwise still waiting for first STT).
  if (!live || !assistantLiveIncludesScript(live, handoffOpeningSeededScript)) {
    // Elicit-only match via 「」 — assistantLiveIncludesScript may still be true for JP-only.
  }
  if (assistantHasHandoffOpeningEnglish(live, handoffOpeningSeededScript)) return;
  // Only repair once we have heard audio / elicit STT but English is missing.
  if (!handoffOpeningFirstAudioAt && !/の\s*えいごを\s*選んでね|は\s*えいごで？|「/.test(live)) {
    return;
  }
  handoffOpeningMissingEnRepairSent = true;
  const exact = handoffOpeningSeededScript;
  const enLead = handoffOpeningEnglishLead(exact);
  whenAssistantIdle(() => {
    if (!handoffOpeningDisplayLocked) return;
    if (userSpokeSinceLastAssistantBubble()) return;
    if (assistantHasHandoffOpeningEnglish(handoffOpeningLiveStt, exact)) return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    // Allow the repair audio through — unseal so the full line can play.
    resetHandoffOpeningSpeechGate();
    handoffOpeningDisplayLocked = true;
    handoffOpeningSeededScript = exact;
    handoffOpeningSeededAt = Date.now();
    ensureHandoffOpeningBubbleExact();
    sendTeacherNote(
      `part2-open-missing-en-${getCurrentSegment()?.id || ""}`,
      "[Teacher note — do not read aloud] WRONG: you skipped the ENGLISH lead-in. " +
        "Speak EXACTLY ONCE word-for-word starting with the ENGLISH first: " +
        exact +
        (enLead ? ` The first words must be: ${enLead}` : "") +
        " FORBIDDEN: Japanese-only; starting at 「; paraphrasing; repeating after you finish." +
        beginnerTurnHint()
    );
    dbg("part2 handoff missing English repair", enLead.slice(0, 32));
  }, "part2-open-missing-en");
}

/** True when Live STT contains the exact beat/opening script (optional praise prefix allowed). */
function assistantLiveIncludesScript(text, exact) {
  const t = String(text || "").trim();
  const e = String(exact || "").trim();
  if (!t || !e) return false;
  const nt = normalizePart2ScriptCompare(t);
  const ne = normalizePart2ScriptCompare(e);
  if (ne && nt.includes(ne)) return true;
  // Elicit core: 「…」の えいごを 選んでね / は えいごで？
  const elicit = e.match(/「[^」]+」[^「]*$/)?.[0] || "";
  if (elicit && normalizePart2ScriptCompare(t).includes(normalizePart2ScriptCompare(elicit))) {
    return true;
  }
  return false;
}

/** Elicit present but required English lead missing (JP-only speak). */
function assistantHandoffOpeningMissingEnglish(text, exact = handoffOpeningSeededScript) {
  const t = String(text || "").trim();
  const e = String(exact || "").trim();
  if (!t || !e) return false;
  if (!assistantLiveIncludesScript(t, e) && !/の\s*えいごを\s*選んでね|「[^」]+」/.test(t)) {
    return false;
  }
  return !assistantHasHandoffOpeningEnglish(t, e);
}

function assistantPart2HandoffOpeningMangled(text = lastAssistantText()) {
  if (!usesPart2Architecture()) return false;
  if (!handoffOpeningDisplayLocked || !handoffOpeningSeededScript) return false;
  if (userSpokeSinceLastAssistantBubble()) return false;
  if (Number(loadMcqCursor(getCurrentSegment()) || 0) > 0) return false;
  const exact = String(handoffOpeningSeededScript || "").trim();
  if (!exact) return false;
  // Prefer Live STT over the seeded bubble (seed always has English even if unspoken).
  const t = String(handoffOpeningLiveStt || text || "").trim();
  if (!t) return false;
  if (assistantHandoffOpeningMissingEnglish(t, exact)) return true;
  // Praise / reaction + exact script is the Part 1 natural shape — not mangled.
  if (assistantLiveIncludesScript(t, exact) && assistantHasHandoffOpeningEnglish(t, exact)) {
    const nt = normalizePart2ScriptCompare(t);
    const ne = normalizePart2ScriptCompare(exact);
    // Junk appended after the exact elicit (e.g. "the ocean!…") is mangled.
    const idx = nt.indexOf(ne);
    if (idx >= 0 && nt.length > idx + ne.length + 8) return true;
    return false;
  }
  if (looksLikePriorAnswerPraiseStt(t)) return true;
  if (!t.includes(exact.slice(0, 20)) && !assistantLiveIncludesScript(t, exact)) return true;
  return (t.match(/の\s*えいごを\s*選んでね/g) || []).length > 1;
}

function maybePart2HandoffOpeningExactSpeakNudge() {
  if (!assistantPart2HandoffOpeningMangled()) return;
  if (!assistantTranscriptSettled()) return;
  const exact = handoffOpeningSeededScript;
  const missingEn = assistantHandoffOpeningMissingEnglish(
    handoffOpeningLiveStt || lastAssistantText(),
    exact
  );
  // Missing English must be re-spoken even if JP audio already played / sealed.
  if (!missingEn && (handoffOpeningSpeechSealed || assistantHeardSinceUserTurn())) {
    ensureHandoffOpeningBubbleExact();
    return;
  }
  if (missingEn) {
    scheduleHandoffOpeningMissingEnglishRepair();
    ensureHandoffOpeningBubbleExact();
    return;
  }
  ensureHandoffOpeningBubbleExact();
  const key = `part2-handoff-exact-${getCurrentSegment()?.id || ""}-${normalizeUserText(lastAssistantText()).slice(0, 20)}`;
  whenAssistantIdle(() => {
    if (!assistantPart2HandoffOpeningMangled(lastAssistantText())) return;
    if (handoffOpeningSpeechSealed || assistantHeardSinceUserTurn()) {
      ensureHandoffOpeningBubbleExact();
      return;
    }
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    ensureHandoffOpeningBubbleExact();
    sendTeacherNote(
      key,
      "[Teacher note — do not read aloud] PART 2 chapter opening was paraphrased. " +
        "Speak EXACTLY word-for-word ONCE then WAIT (English lead first, then 「」 elicit): " +
        exact +
        " FORBIDDEN: Japanese-only / repeating the elicit / saying the answer / previous chapter / restarting the same line." +
        beginnerTurnHint()
    );
    dbg("part2 handoff exact speak repair", key);
  }, "part2-handoff-exact");
}

/** Ch5 Beat3 must pair Are you done making it? with すいそうを つくった — not Beat2's つくってる. */
function ch5OnMadeTankBeat() {
  if (getCurrentSegment()?.id !== "ch5") return false;
  if (userHasMadeTankPhrase() || userHasLooksGoodPhrase()) return false;
  if (userHasBuildingTankPhrase()) return true;
  const unlocked = mcqUnlockFlags(getCurrentSegment());
  const cur = getCurrentMcqBeat(getCurrentSegment(), { unlocked });
  return cur?.beat?.id === "made_tank";
}

function assistantCh5Beat3Mangled(text = lastAssistantText()) {
  const t = String(text || "");
  if (!t.trim()) return false;
  const hasDoneAsk = /are you done making it/i.test(t);
  const hasBuildingElicit = /すいそうを\s*つくって(?:いる|る)/.test(t);
  const hasMadeElicit = /すいそうを\s*つくった/.test(t);
  if (hasDoneAsk && hasBuildingElicit) return true;
  if (ch5OnMadeTankBeat() && hasBuildingElicit && !hasMadeElicit && /えいごを\s*選んで/.test(t)) {
    return true;
  }
  return false;
}

function fixCh5Beat3Bubble(text) {
  let t = String(text || "");
  if (!t) return t;
  const shouldFix =
    /are you done making it/i.test(t) ||
    (ch5OnMadeTankBeat() && /すいそうを\s*つくって(?:いる|る)/.test(t));
  if (!shouldFix) return t;
  t = t.replace(
    /「すいそうを\s*つくって(?:いる|る)」の\s*えいごを\s*選んでね！?/g,
    PART1_ELICIT_JA.ch5MadeTank
  );
  t = t.replace(
    /すいそうを\s*つくって(?:いる|る)」?の\s*えいごを\s*選んでね！?/g,
    PART1_ELICIT_JA.ch5MadeTank
  );
  return t;
}

function forceCh5Beat3ExactSpeak(reason = "mangled-repair") {
  if (!client?.connected || actionState !== "active") return false;
  if (getCurrentSegment()?.id !== "ch5") return false;
  const segment = getCurrentSegment();
  const beat =
    getSegmentMcqBeats(segment).find((b) => b.id === "made_tank") ||
    getCurrentMcqBeat(segment, { unlocked: mcqUnlockFlags(segment) })?.beat;
  if (!beat) return false;
  const script = [beat.learnyEn, beat.learnyJa].filter(Boolean).join(" ").trim();
  const outbound =
    "[QUIZ] Ch5 Beat 3 REPAIR. Speak exactly the text between <exact> tags as your complete audible turn, once. " +
    "Do not add praise or a new question. Then WAIT for the 4-button tap.\n" +
    `<exact>${script}</exact>\n` +
    "FORBIDDEN: 「すいそうを つくってる」 (Beat2). Beat3 JP is すいそうを つくった の えいごを 選んでね！ only.";
  dbg("force ch5 beat3 exact speak", { reason, script: script.slice(0, 48) });
  return sendClientText(withQuizExactSpeakRule(outbound), { force: true });
}

function maybeCh5Beat3ExactSpeakNudge() {
  if (getCurrentSegment()?.id !== "ch5") return;
  if (!usesBeginnerInstructionProfile() && getActiveLessonId() !== "part1") return;
  if (!assistantTranscriptSettled()) return;
  const text = lastAssistantText().trim();
  if (!assistantCh5Beat3Mangled(text)) return;

  const fixed = fixCh5Beat3Bubble(text);
  const last = messages?.length ? messages[messages.length - 1] : null;
  if (last?.type === "assistant" && fixed && fixed !== text) {
    last.text = sanitizeAssistantBubbleText(fixed);
    assistantTurnTranscript = last.text;
    scheduleRenderChat();
  }
  const key = `ch5-beat3-exact-${normalizeUserText(text).slice(0, 28) || "open"}`;
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.id !== "ch5") return;
    if (!assistantCh5Beat3Mangled(lastAssistantText())) return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    forceCh5Beat3ExactSpeak("mangled-repair");
    dbg("ch5 beat3 exact speak repair", key);
  }, "ch5-beat3-exact");
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

/** Chapter 0 must never speak homework phrase elicits (glass/sand MCQ lines). */
function assistantWarmupHomeworkLeak(text = lastAssistantText()) {
  const t = String(text || "");
  if (!t.trim()) return false;
  return (
    /がらすが\s*ひつよう|すなが\s*ひつよう|がらすを\s*つく|すなを\s*みつけ|くいずたいむ|の\s*えいごを\s*選んで|は\s*えいごで[？?]|I need glass|I need sand|I made glass|Can you say it in English/i.test(
      t
    ) || /「[^」]{2,24}」の\s*えいごを\s*選んで/.test(t)
  );
}

function maybeWarmupHomeworkLeakNudge() {
  if (getCurrentSegment()?.type !== "warmup") return;
  if (!assistantTranscriptSettled()) return;
  const text = lastAssistantText().trim();
  if (!assistantWarmupHomeworkLeak(text)) return;

  const noUserYet = countWarmupUserReplies() < 1;
  const key = `warmup-hw-leak-${normalizeUserText(text).slice(0, 32) || "open"}`;
  whenAssistantIdle(() => {
    if (getCurrentSegment()?.type !== "warmup") return;
    if (!assistantWarmupHomeworkLeak(lastAssistantText())) return;
    try {
      audioPlayer?.interrupt?.();
      closeOpenAudioTurn();
    } catch {
      // ignore
    }
    const note = noUserYet
      ? "[Teacher note — do not read aloud] STOP. Chapter 0 opening leaked homework. " +
        "Speak EXACTLY once then WAIT: Hello! How are you today? こんにちは！きょうは どうですか？ " +
        "FORBIDDEN: homework 「phrase」の えいごを 選んでね！ elicits, glass/sand teaching."
      : "[Teacher note — do not read aloud] STOP. Chapter 0 must stay everyday chat. " +
        "Do NOT say homework 「phrase」の えいごを 選んでね！ / glass/sand teaching. " +
        "React to the child's latest words with ONE everyday follow-up only, then WAIT.";
    sendTeacherNote(key, withBeginnerSpeakRule(formatTeacherNote(note + beginnerTurnHint())));
  }, "warmup-hw-leak");
}

function buildCh1CoachNote(userText, { postTurn = false } = {}) {
  if (!usesTemplateArchitecture()) return "";
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
  if (!usesTemplateArchitecture()) return;
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
  if (!usesTemplateArchitecture()) return "";
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
  if (!usesTemplateArchitecture()) return "";
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
  if (!usesBeginnerInstructionProfile()) return praise;
  if (isQuizSpeakSegment()) {
    return praise + " QUIZ: speak Japanese ひらがな only for the question; child answers in English.";
  }
  return (
    praise +
    " BEGINNER: FULL English sentence, then FULL matching ひらがな in the SAME turn — " +
    "never English-only, never Japanese-only after a short English tag, never いってみて alone. " +
    "When eliciting, ALWAYS pronounce え・い・ご・を in の えいごを 選んでね！ — never shorten to の選んでね. " +
    '"Do not speak the English answer" means skip the target English phrase only, not the Japanese word えいご.'
  );
}

/** Short rule prepended to the child's outbound so every Live reply stays EN→JP. */
function beginnerOutboundSpeakRule() {
  if (!usesBeginnerInstructionProfile()) return "";
  if (getCurrentSegment()?.id === "daily1") {
    return (
      "[DAILY1] Reply out loud NOW in ONE short turn: react to the child's latest words, then ONE follow-up. " +
      "English then matching ひらがな. Keep it brief. Then WAIT."
    );
  }
  if (isQuizSpeakSegment()) {
    const script = quiz1ItemSpeak(getCurrentQuiz1Item());
    if (script) {
      return (
        "[QUIZ] Speak EXACTLY once, every mora word-by-word, as your complete audible turn: " +
        script +
        " Never drop the cue inside 「」. Never say くいずたいむ！は英語で？ Never say 英語 — always えいご. Then WAIT."
      );
    }
    return (
      "[QUIZ] Speak Japanese ひらがな only. Speak the EXACT listed speak line including the full cue inside 「」. " +
      "FORBIDDEN: くいずたいむ！は英語で？ Then WAIT."
    );
  }
  return "[BEGINNER] Reply out loud NOW: full English, then matching ひらがな. One short turn. React to the child's line. If you say の えいごを 選んでね！, pronounce えいごを fully — never の選んでね.";
}

function withBeginnerSpeakRule(outbound) {
  const rule = beginnerOutboundSpeakRule();
  if (!rule) return outbound;
  const body = String(outbound || "").trim();
  if (!body) return rule;
  if (
    /^\[(BEGINNER|QUIZ|ENDING|DAILY1|MCQ)\]/i.test(body) ||
    /BEGINNER — mandatory|QUIZ — mandatory|MCQ — mandatory/i.test(body)
  ) {
    return body;
  }
  return `${rule}\n\n${body}`;
}

/**
 * Daily English free chat — keep the speak-rule tiny. Wrapping with the full
 * beginner elicit rule made Live replies take many seconds after short turns.
 */
function withDaily1SpeakRule(outbound) {
  const body = String(outbound || "").trim();
  if (!body) return body;
  if (/^\[DAILY1\]/i.test(body)) return body;
  return (
    "[DAILY1] Reply out loud NOW in ONE short turn: react to the child's latest words, then ONE follow-up on that topic. " +
    "English then matching ひらがな. Keep it brief. Then WAIT.\n\n" +
    body
  );
}

/** Prefer the shortest speak-rule wrapper for free-chat segments. */
function withSegmentSpeakRule(outbound, segmentId = getCurrentSegment()?.id) {
  if (segmentId === "daily1") return withDaily1SpeakRule(outbound);
  return withBeginnerSpeakRule(outbound);
}

/**
 * Quiz lines are fixed ひらがな scripts. The vague "Ask the cue + は えいごで？" rule
 * let Live drop the 「cue」 (kids heard くいずたいむ！は英語で？).
 */
function withQuizExactSpeakRule(outbound) {
  const body = lockSangoExactSpeak(String(outbound || "").trim());
  if (!body) return body;
  if (/^\[QUIZ\]/i.test(body)) return body;
  return (
    "[QUIZ] Speak the EXACT Japanese script ONCE in full — every mora word-by-word, including the cue inside 「」. " +
    "FORBIDDEN: くいずたいむ！は英語で？ / missing 「cue」 / 英語 instead of えいご / shortening / summarizing. " +
    "Do NOT apply the short-turn beginner rule. Then STOP and WAIT for the child.\n\n" +
    body
  );
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
 * Ending Phase 2 free talk is a full bilingual reaction+question. Wrapping it in
 * withBeginnerSpeakRule ("One short turn") cut mid-line and restarted — kids heard
 * the same English twice (e.g. "A shark! … ア シャーク!" ×2) while STT merged both.
 */
function withEndingFreeTalkSpeakRule(outbound) {
  const body = String(outbound || "").trim();
  if (!body) return body;
  if (/^\[ENDING FREE TALK\]/i.test(body) || /^\[ENDING\]/i.test(body)) return body;
  return (
    "[ENDING FREE TALK] Reply out loud NOW in ONE complete turn only: full English, then matching ひらがな with the SAME meaning in the SAME turn. " +
    "REQUIRED: every English sentence must be followed by ひらがな — English-only replies are FORBIDDEN. " +
    "Speak each sentence ONCE. Do NOT shorten, restart mid-line, or repeat English/Japanese. " +
    "Do NOT apply the short-turn beginner rule. Then STOP and WAIT for the child.\n\n" +
    body
  );
}

/**
 * Ch4 make+tell / colour-picker are long fixed bilingual scripts. Wrapping them in
 * withBeginnerSpeakRule ("One short turn") cut mid-line and restarted — kids heard
 * the same phrase twice while STT/display often showed once.
 */
function withCh4ExactSpeakRule(outbound) {
  const body = String(outbound || "").trim();
  if (!body) return body;
  if (/^\[CH4\]/i.test(body)) return body;
  return (
    "[CH4] Speak the EXACT text between <exact> tags ONCE in full — every English word and every ひらがな. " +
    "Do NOT shorten, summarize, skip, restart mid-line, or repeat. " +
    "Do NOT apply the short-turn beginner rule. Then STOP and WAIT for the child.\n\n" +
    body
  );
}

/**
 * Live often speaks このおさかながすき for the coral cue 「このさんごがすき」.
 * Mora-separate さんご in the audible script and forbid the fish substitution.
 */
function lockSangoExactSpeak(body) {
  const raw = String(body || "");
  if (!/さんご/.test(raw)) return raw;
  const spoken = raw.replace(/さんご/g, "さ・ん・ご");
  const guard =
    " PRONUNCIATION LOCK: さ・ん・ご is coral (sa-n-go). Speak さ・ん・ご. " +
    "FORBIDDEN: おさかな / このおさかながすき / saying fish instead of coral. ";
  if (/^\[(FINAL1|QUIZ|MCQ|CH4)\]/i.test(spoken)) {
    return spoken.replace(
      /^\[(FINAL1|QUIZ|MCQ|CH4)\]/i,
      (tag) => `${tag}${guard}`
    );
  }
  return `${guard}${spoken}`;
}

/** Final challenge open — same exact-speak guard as Ch4 / Quiz1. */
function withFinal1ExactSpeakRule(outbound) {
  const body = lockSangoExactSpeak(String(outbound || "").trim());
  if (!body) return body;
  if (/^\[FINAL1\]/i.test(body)) return body;
  return (
    "[FINAL1] Speak the EXACT text between <exact> tags ONCE in full — every English word and every ひらがな. " +
    "Do NOT shorten, summarize, skip, restart mid-line, or repeat. " +
    "Do NOT apply the short-turn beginner rule. Then STOP and WAIT for the child.\n\n" +
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
let childTurnRequestId = 0;

function dispatchChildTurn(childText, coachNote = "", { armWatch = true, mode = "mcq" } = {}) {
  const outbound = buildChildOutbound(childText, coachNote);
  if (!outbound.trim()) return false;
  const requestId = ++childTurnRequestId;
  prepareForUserOutbound();
  const watchMode = mode || "mcq";
  const send = () => {
    if (requestId !== childTurnRequestId) {
      dbg("skip stale queued child turn", String(childText || "").slice(0, 60));
      return false;
    }
    if (actionState !== "active" || !client?.connected) return false;
    const ok = Boolean(sendClientText(withBeginnerSpeakRule(outbound), { force: true }));
    userTurnSentViaClientText = ok;
    if (armWatch && ok) {
      lastPendingUserText = String(childText || "").trim();
      lastUserTurnAt = Date.now();
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      armSilentReplyWatch(lastPendingUserText, {
        fromVoice: false,
        mode: watchMode,
        replayOutbound: outbound,
        replaySent: true,
      });
    }
    return ok;
  };
  // If Learny still has audio draining, wait so Live accepts the new turn.
  if (assistantIsSpeaking()) {
    sealStaleAssistantPlaybackEstimate("child-turn-queue");
  }
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
      armSilentReplyWatch(lastPendingUserText, {
        fromVoice: false,
        mode: watchMode,
        replayOutbound: outbound,
        replaySent: false,
      });
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
  if (!usesBeginnerInstructionProfile()) return false;
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
  if (!usesBeginnerInstructionProfile()) return false;
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
  if (!usesBeginnerInstructionProfile()) return;
  // Quiz is Japanese-only by design — do not force English-then-Japanese repair.
  if (isQuizSpeakSegment()) return;
  // Ending Turn A / finale: repair nudges caused a second Perfect! Free talk still needs JP,
  // but never inject a repair while a free-talk reply is still in flight (that glued a
  // second question onto the first, e.g. fish Q + "…to know about your favorite part!").
  if (getCurrentSegment()?.id === "ending1" && !isEnding1FreeTalkActive()) return;
  if (isEnding1FreeTalkActive() && (learnyIsBusySpeaking() || !assistantTranscriptSettled())) {
    return;
  }
  if (!assistantTranscriptSettled()) return;
  const text = lastAssistantText().trim();
  if (!text || assistantHasValidPhraseElicit(text)) return;

  const missingJp = !assistantHasBeginnerJapanese(text) || assistantBeginnerJapaneseIncomplete(text);
  const missingEn = assistantBeginnerEnglishIncomplete(text);
  const doubledHow = assistantDoubledHowAreYou(text);
  if (!missingJp && !missingEn && !doubledHow) return;

  const key = `beginner-jp-${normalizeUserText(text).slice(0, 48) || "turn"}`;
  whenAssistantIdle(() => {
    if (!usesBeginnerInstructionProfile() || isQuizSpeakSegment()) return;
    if (getCurrentSegment()?.id === "ending1" && !isEnding1FreeTalkActive()) return;
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
      try {
        sealHandoffOpeningSpeech("doubled-how-are-you", { hard: true });
      } catch {
        // ignore
      }
    } else if (stillMissingEn) {
      note +=
        "You spoke long Japanese without matching FULL English. NOW speak the missing English for that same idea, then matching ひらがな if needed. " +
        "Do NOT ask a new question. Then WAIT. ";
    } else if (isEnding1FreeTalkActive()) {
      note +=
        "Your last free-talk turn was English-only or missing full ひらがな. " +
        "NOW speak ONLY the matching ひらがな for the SAME meaning you just said. " +
        "Do NOT repeat the English. Do NOT apologize. Then WAIT.";
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
  const detail = {
    ...event,
    lessonId: event.lessonId || getActiveLessonId(),
  };
  try {
    window.parent.postMessage({ type: "gc_activity_event", event: detail }, "*");
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent("learny-activity", { detail }));
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
  let freeAsk = false;
  if (usesPart2Architecture() && segment?.id === "ch5") {
    // Part 2 Ch5 Beat A2+ unlocks only after the CHILD said a real number.
    freeAsk = part2Ch5FishCountReady(state);
  } else if (segment?.id === "ch4") {
    freeAsk =
      Boolean(state.memories?.favoriteColor) &&
      (ch4AssistantSaidBeatB() || ch4MakeTellUnlocked);
  } else {
    freeAsk = Boolean(state.memories?.favoriteColor);
  }
  // Unlock found-sand MCQ only after free-talk beats 3–4 (hot / see), never from Ch1 "sand".
  const pending = looksLikeFoundSand(lastPendingUserText || "");
  const elicitSpoken = ch2AssistantSaidFoundElicit() || ch2ResumeElicitUnlocked();
  const freeTalk =
    elicitSpoken ||
    ch2Search.phase === "waiting" ||
    (ch2FreeTalkFinished() && (pending === "found" || pending === "phrase"));
  return { freeAsk, freeTalk };
}

/** Ch2 free-talk window: after left/right MCQ until found-sand elicit.
 *  Part 1 ONLY — Part 2 Ch2 is always MCQ (find fish). */
function isCh2FreeTalkUi() {
  if (!usesTemplateArchitecture()) return false;
  if (getCurrentSegment()?.id !== "ch2") return false;
  syncCh2PhaseFromChat();
  if (ch2AssistantSaidFoundElicit() || ch2ResumeElicitUnlocked()) return false;
  const p = ch2Search.phase || "place";
  // Hide buttons during hot/see only — show again for found-sand elicit.
  return p === "chat";
}

/** Ch4: hide glass MCQ until make+tell — colour Beat A1 uses its own buttons.
 *  Part 1 ONLY — Part 2 Chapter 4 is put-fish MCQ from the first beat. */
function isCh4FreeTalkUi() {
  if (!usesTemplateArchitecture()) return false;
  if (getCurrentSegment()?.id !== "ch4") return false;
  if (ch4ColorChoiceActive()) return false;
  if (ch4MakeTellUnlocked) return false;
  return !ch4AssistantSaidBeatB();
}

/** True while tap-choice MCQ / quiz buttons are on screen (mic must stay off). */
function isMcqChoiceUiActive(segment = getCurrentSegment()) {
  // Intermediate is voice-only — never lock the mic for choice buttons.
  if (isVoiceOnlyLesson()) return false;
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

  if (segment?.id === "ch4" && ch4ColorChoiceActive()) return true;

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
    ? isVoiceOnlyLesson()
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
  const memories = loadLessonState().memories || {};
  let labels;
  if (beat.fishCountPicker) {
    // Keep 1→10 in order — never shuffle the number pad.
    return resolveFishCountPickerLabels();
  }
  if (beat.dynamicFishCount) {
    labels = resolveDynamicFishCountChoices(memories.fishCount).map(formatChoiceLabel);
  } else {
    labels = (beat.choices || []).slice(0, 4).map((c) =>
      formatChoiceLabel(expandMcqPlaceholders(String(c), memories))
    );
  }
  const segmentId = getCurrentSegment()?.id || "mcq";
  const beatKey = beat.id || `beat-${loadMcqCursor(segmentId)}`;
  return getShuffledChoiceLabels(`${segmentId}:${beatKey}`, labels);
}

function resolveMcqAnswer(beat) {
  if (!beat) return "";
  const memories = loadLessonState().memories || {};
  if (beat.fishCountPicker) {
    // Any 1–10 tap is correct; recorded answer is the child's choice.
    return formatChoiceLabel(String(memories.fishCount || beat.answer || "1"));
  }
  if (beat.dynamicFishCount) {
    const count = parseInt(memories.fishCount, 10) || 1;
    return formatChoiceLabel(
      count === 1 ? "There is one fish." : `There are ${numberToEnglishWord(count)} fish.`
    );
  }
  return formatChoiceLabel(expandMcqPlaceholders(String(beat.answer || ""), memories));
}

function buildMcqSpeakCoach(beat) {
  if (!beat) return "";
  const memories = loadLessonState().memories || {};
  const en = expandMcqPlaceholders(String(beat.learnyEn || ""), memories);
  const ja = elicitJaForActiveLevel(
    expandMcqPlaceholders(String(beat.learnyJa || ""), memories)
  );
  const eigoGuard = /の\s*えいごを\s*選んでね/.test(ja)
    ? " Pronounce every mora of え・い・ご・を — never shorten to の選んでね. " +
      "Skipping the Japanese word えいご is FORBIDDEN (that is not the same as skipping the English answer phrase)."
    : "";
  const koreWoGuard = /これ\s*を\s*えらぶ/.test(ja)
    ? " Inside 「」 pronounce これ・を・えらぶ (kore wo erabu) mora by mora. " +
      "FORBIDDEN: ここに えらぶ / ここにえらぶ / ここにをえらぶ — that is a different wrong phrase."
    : "";
  const sangoGuard = /さんご/.test(ja)
    ? " Pronounce さ・ん・ご (coral, sa-n-go). FORBIDDEN: おさかな / このおさかながすき. "
    : "";
  const jaSpeak = ja.replace(/さんご/g, "さ・ん・ご");
  if (isVoiceOnlyLesson()) {
    return (
      "Speak EXACTLY once: " +
      en +
      " then <exact>" +
      jaSpeak +
      "</exact>." +
      eigoGuard +
      koreWoGuard +
      sangoGuard +
      " Then " +
      intermediateAnswerWaitHint() +
      " Do not reveal the answer. Do not list multiple-choice options aloud."
    );
  }
  const choices = resolveMcqChoices(beat).join(" / ");
  return (
    "Speak EXACTLY once: " +
    en +
    " then <exact>" +
    jaSpeak +
    "</exact>." +
    eigoGuard +
    koreWoGuard +
    sangoGuard +
    " Then WAIT for a 4-button tap (" +
    choices +
    "). Do not reveal the English answer phrase. Do not skip えいごを."
  );
}

const MCQ_RETRY_PATTERNS = [
  {
    title: "おしい！ちがうよ — もういちど！",
    speak: "Nice try! Not quite — try again! おしい！ちがうよ。もういちど！",
  },
  {
    title: "ざんねん！もういっかい！",
    speak: "Not quite! Give it another go! ざんねん！もう いっかい チャレンジしてね！",
  },
  {
    title: "ちがうみたい — もういちど！",
    speak: "Hmm, not that one. Try again! ん〜、ちがうみたい。もういちど えらんでね！",
  },
  {
    title: "おしい！もうすこし！",
    speak: "So close! One more try! おしい！もう すこし！もういちど！",
  },
  {
    title: "いいちょうせん！もういちど！",
    speak: "Good try! Let's pick again! いい ちょうせんだよ！もういちど えらぼう！",
  },
  {
    title: "おっと！べつののを！",
    speak: "Oops! Try a different one! おっと！べつの のを ためしてみて！",
  },
  {
    title: "もういっかい！",
    speak: "Not that one — one more time! それじゃないよ。もう いっかい！",
  },
  {
    title: "ちかい！もういちど！",
    speak: "You're close! Pick again! ちかいよ！もういちど えらんでね！",
  },
  {
    title: "だいじょうぶ！もういちど！",
    speak: "That's okay! Try once more! だいじょうぶ！もういちど チャレンジ！",
  },
  {
    title: "うん、ちがうね！",
    speak: "Hmm, different one! うん、ちがうね！べつを えらんでみて！",
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

/** Coach hint used in segment rules — never hardcode one Almost line. */
const WRONG_ANSWER_VARIETY_HINT =
  "If wrong: rotate a soft bilingual retry (Nice try / So close / Hmm not that one / Oops / Good try / That's okay / ざんねん / ちがうみたい / おっと / ちかいよ — " +
  "NEVER always Almost! Try again! / おしい！もういちど！). Do NOT reveal the answer; re-ask the SAME question.";

function buildMcqWrongRetryCoach(reaskCoach = "") {
  const pattern = pickMcqRetryPattern();
  return (
    "[Teacher note — do not read aloud] Wrong choice. Speak EXACTLY once the soft retry between <exact> tags (EN then JP), " +
    "then re-ask the SAME question. Do NOT reveal the correct answer. Do NOT advance. " +
    "FORBIDDEN: always saying Almost! Try again! / おしい！もういちど！ — this turn MUST use the given exact line.\n" +
    `<exact>${pattern.speak}</exact>` +
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
  // Release chapter-opening display lock so the next beat's Live transcript can show.
  clearHandoffOpeningDisplayLock("mcq-choice");
  clearMcqBeatDisplayLock("mcq-choice");
  clearMcqBeatPendingExact("mcq-choice");
  resetHandoffOpeningSpeechGate();
  const beat = cur.beat;
  const answer = resolveMcqAnswer(beat);
  const beatForMatch = { ...beat, answer, choices: resolveMcqChoices(beat) };
  const correct =
    segment.id === "ch4" && usesTemplateArchitecture()
      ? normalizeMcqChoice(label) === normalizeMcqChoice(answer)
      : isMcqCorrect(label, beatForMatch);
  const recordedAnswer =
    Array.isArray(beat.acceptAnyOf) && beat.acceptAnyOf.length ? label : answer;
  const event = recordMcqAttempt({
    segmentId: segment.id,
    beatId: beat.id,
    learnyPrompt: `${beat.learnyEn || ""} ${beat.learnyJa || ""}`,
    choice: label,
    correct,
    choices: beatForMatch.choices,
    answer: recordedAnswer,
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
    const memValue =
      beat.fishCountPicker && beat.memoryKey === "fishCount"
        ? normalizeFishCountChoice(label) || String(label || "").trim()
        : label;
    if (memValue) recordMemory(beat.memoryKey, memValue);
  }
  const beats = getSegmentMcqBeats(segment);
  const { done } = advanceMcqCursor(segment.id, beats.length);

  if (segment.id === "ch2" && beat.id === "direction") {
    ch2Search.phase = "chat";
    ch2Search.rallies = 0;
    persistCh2SearchState();
  }

  if (beat.completeSegmentOnCorrect || done) {
    if (segment.id === "ch4") {
      resetCh4MakeTellSpeechLocks();
    }
    // Part 2: never seal the chapter until the cursor is past the last beat
    // (guards against a stale completeSegmentOnCorrect / cursor desync).
    if (usesPart2Architecture() && !canCompletePart2McqSegment(segment.id)) {
      dbg("mcq complete deferred; beats remain", {
        segment: segment.id,
        beat: beat.id,
        cursor: loadMcqCursor(segment.id),
        beats: beats.length,
      });
    } else {
    const result = completeSegment(segment.id, { userQuote: label });
    if (result.ok) {
      clearSegmentUi(segment.id);
      if (!result.alreadyDone) {
        try {
          questSfx.playQuestComplete();
        } catch {
          // ignore
        }
      }
      addUserAnswerBubble(label);
      if (
        afterSegmentAdvanced(segment.id, result, {
          lastQuote: label,
          fromSegmentId: segment.id,
        })
      ) {
        renderChoiceBar(getCurrentSegment());
        return;
      }
      if (!result.alreadyDone) {
        const nudge = buildAdvanceNudge(result.state);
        dispatchChildTurn(label, nudge || "Next chapter — one short opening beat.");
        renderChoiceBar(getCurrentSegment());
        return;
      }
      // Replay alreadyDone without a hinge handoff — continue normally below.
    }
    }
  }

  const nextUnlocked = mcqUnlockFlags(getCurrentSegment());
  const next = getCurrentMcqBeat(getCurrentSegment(), { unlocked: nextUnlocked });
  let nextCoach = "Continue.";
  if (usesTemplateArchitecture() && segment.id === "ch2" && beat.id === "direction") {
    nextCoach =
      "Speak EXACTLY: " +
      CH2_HOT_SPEAK +
      " Then WAIT. FORBIDDEN: You found some sand! / Can you say it in English? / skipping beat 3–4. " +
      "Next after they answer: " +
      CH2_SEE_SPEAK;
  } else if (next?.beat) {
    nextCoach = buildMcqSpeakCoach(next.beat);
  } else if (usesTemplateArchitecture() && segment.id === "ch2") {
    nextCoach =
      "FREE TALK next (no buttons): Is it hot outside? → What can you see around you? Then We found some sand! elicit (FORBIDDEN: Keep looking).";
  }
  const advancePraise = nextMcqTranscriptPraise();
  const praise =
    "Correct — ONE brief praise. Speak EXACTLY starting with \"" +
    advancePraise +
    "\" (same words), acknowledge \"" +
    label +
    "\" briefly if needed, then " +
    nextCoach +
    " FORBIDDEN: praise-only turn; skipping the next beat script; Did you find the glass?." +
    (segment.id === "ch1"
      ? " FORBIDDEN: Have you found glass? / searching for glass."
      : "");
  addUserAnswerBubble(label);
  // Part 2: seed praise + next beat into the transcript immediately so the bubble
  // always shows the reaction kids hear (Live STT often drops the praise prefix).
  // Force exact bilingual speak — beginner "One short turn" often praise-onlys.
  if (usesPart2Architecture() && next?.beat) {
    seedMcqBeatSpeakBubble(next.beat, { praise: advancePraise });
    forcePart2McqAdvanceSpeak(label, next.beat, advancePraise);
  } else {
    dispatchChildTurn(label, praise);
  }
  renderChoiceBar(getCurrentSegment());
}

/**
 * Typed answers that match the on-screen MCQ should use the same path as button taps
 * (progress + reply-watch). Also recovers cursor desync when Learny is still asking an
 * earlier beat than the cursor — but NEVER rewind just because a prior answer was typed
 * (that re-spoke Beat 3 「これ を えらぶ」 after kids already moved on).
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
    // Desync recovery only: Learny's last ask still matches an earlier beat.
    const assistant = String(lastAssistantText() || "");
    const seeded = String(mcqBeatSeededExact || mcqBeatPendingExact || "");
    for (let i = 0; i < cur.index; i += 1) {
      const beat = beats[i];
      if (!beat) continue;
      const speak = usesPart2Architecture()
        ? resolvedPart2McqBeatSpeak(beat)
        : expandMcqPlaceholders(
            `${beat.learnyEn || ""} ${beat.learnyJa || ""}`.trim(),
            loadLessonState().memories || {}
          );
      const ja = String(beat.learnyJa || "").trim();
      const learnyStillOnEarlier =
        (speak && assistantLiveIncludesScript(assistant, speak)) ||
        (ja && assistantLiveIncludesScript(assistant, ja)) ||
        (speak && seeded && assistantLiveIncludesScript(seeded, speak));
      if (!learnyStillOnEarlier) continue;
      label = matchBeatAt(i);
      if (label) {
        dbg("mcq text route desync rewind", {
          from: cur.index,
          to: i,
          beat: beat.id,
        });
        setMcqCursor(segment.id, i);
        break;
      }
    }
  }
  if (!label && isVoiceOnlyLesson()) {
    label = String(text).trim();
  }
  if (!label) return false;
  handleMcqChoiceClick(label);
  return true;
}

/** Intermediate: route quiz1 voice/typed answers through the same logger as button taps. */
let routingQuiz1Answer = false;
function tryRouteQuiz1Answer(text) {
  if (!isVoiceOnlyLesson() || routingQuiz1Answer) return false;
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
  if (bannerSegmentId && bannerSegmentId !== segment.id) {
    clearPendingReplyWatch("segment-change");
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
          ? isVoiceOnlyLesson()
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
  maybeHealPart2EndingChapterBadge();
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
  renderChoiceBar(segment);
  notifyParentProgress();
}

let activeChoiceSpeechButton = null;
let activeChoiceAudioSource = null;
let activeChoiceAudioRequest = null;
let choiceAudioContext = null;
let choiceSpeechRequestId = 0;
const choiceAudioBufferCache = new Map();

const CHOICE_SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a7.5 7.5 0 0 1 0 10"/></svg>';

const CHOICE_QUESTION_REPLAY_LABEL = "もういちど聞く";
/** UI「もういちど聞く」— bypass opening audio seal so Live replay can be heard. */
let mcqQuestionReplayUntil = 0;

function isMcqQuestionReplayActive() {
  return Date.now() < mcqQuestionReplayUntil;
}

/** Current on-screen MCQ / quiz question Learny should read aloud. */
function getActiveMcqQuestionScript(segment = getCurrentSegment()) {
  if (!segment) return "";
  if (segment.id === "quiz1") {
    return quiz1ItemSpeak(getCurrentQuiz1Item());
  }
  if (segment.id === "final1") {
    const displayed = getDisplayedFinal1Item();
    const item = displayed?.item || getCurrentFinal1Item();
    return String(item?.promptHira || item?.promptJa || item?.promptEn || "").trim();
  }
  if (segment.id === "ch4" && ch4ColorChoiceActive()) {
    return CH4_COLOR_ASK_SPEAK;
  }
  if (segment.id === "ch5" && part2Ch5OnFishCountPicker(segment)) {
    return PART2_CH5_BEAT1_SPEAK;
  }
  const unlocked = mcqUnlockFlags(segment);
  const cur = getCurrentMcqBeat(segment, { unlocked });
  if (!cur?.beat) return "";
  if (usesPart2Architecture()) {
    const part2 = resolvedPart2McqBeatSpeak(cur.beat);
    if (part2) return part2;
  }
  const memories = loadLessonState().memories || {};
  const en = expandMcqPlaceholders(cur.beat.learnyEn || "", memories);
  const ja = expandMcqPlaceholders(cur.beat.learnyJa || "", memories);
  return [en, ja].filter(Boolean).join(" ").trim();
}

/** Part 2 / story MCQ: bilingual exact speak (never Japanese-only quiz rule). */
function withPart2McqExactSpeakRule(outbound) {
  const body = lockSangoExactSpeak(String(outbound || "").trim());
  if (!body) return body;
  const koreWoGuard = /これ\s*を\s*えらぶ/.test(body)
    ? " Inside 「」 say これ・を・えらぶ (kore wo). FORBIDDEN: ここに えらぶ / ここにえらぶ. "
    : "";
  const noRemake =
    "FORBIDDEN: translating the English lead into Japanese; a second elicit; speaking after 選んでね！. ";
  if (/^\[MCQ\]/i.test(body)) {
    return body.replace(/^\[MCQ\]/i, `[MCQ]${koreWoGuard}${noRemake}`);
  }
  return (
    "[MCQ] Speak the EXACT bilingual script ONCE — full English first, then the 「」ひらがな elicit, every word. " +
    koreWoGuard +
    noRemake +
    "FORBIDDEN: Japanese-only; skipping English; adding praise; reading answer choices; paraphrasing. " +
    "Then STOP and WAIT for the child.\n\n" +
    body
  );
}

function forceMcqQuestionExactReplay(reason = "ui-replay") {
  if (!client?.connected || actionState !== "active") return false;
  const segment = getCurrentSegment();
  if (segment?.id === "quiz1") {
    return forceQuiz1ExactSpeak(reason);
  }
  const script = getActiveMcqQuestionScript(segment);
  if (!script) return false;
  const outbound =
    "[QUIZ] QUESTION REPLAY. Speak exactly the text between <exact> tags as your complete audible turn, once — every word. " +
    "Do not add praise, a new question, or English choices. Then WAIT.\n" +
    `<exact>${script}</exact>`;
  let wrapped;
  if (segment?.id === "ch4" && usesTemplateArchitecture()) {
    wrapped = withCh4ExactSpeakRule(outbound);
  } else if (segment?.id === "final1") {
    wrapped = withFinal1ExactSpeakRule(outbound);
  } else if (usesPart2Architecture() || (Array.isArray(segment?.mcqBeats) && segment.mcqBeats.length)) {
    wrapped = withPart2McqExactSpeakRule(outbound);
  } else {
    wrapped = withQuizExactSpeakRule(outbound);
  }
  dbg("force mcq question replay", { reason, segment: segment?.id, script: script.slice(0, 48) });
  return sendClientText(wrapped, { force: true });
}

async function replayActiveMcqQuestion(button) {
  if (actionState !== "active" || !client?.connected) {
    setChoiceSpeakerState(button, "error");
    setTimeout(() => setChoiceSpeakerState(button), 900);
    return;
  }
  const script = getActiveMcqQuestionScript();
  if (!script) {
    setChoiceSpeakerState(button, "error");
    setTimeout(() => setChoiceSpeakerState(button), 900);
    return;
  }
  stopChoiceSpeech();
  setChoiceSpeakerState(button, "loading");
  try {
    audioPlayer?.interrupt?.();
    closeOpenAudioTurn();
  } catch {
    // ignore
  }
  // Opening seal must not mute this intentional replay.
  const keepOpeningLock =
    handoffOpeningDisplayLocked ||
    (Number(loadMcqCursor(getCurrentSegment()) || 0) === 0 &&
      Boolean(getHandoffSpeakLine(getCurrentSegment())));
  const sealedScript = handoffOpeningSeededScript || script;
  resetHandoffOpeningSpeechGate();
  if (keepOpeningLock) {
    handoffOpeningDisplayLocked = true;
    handoffOpeningSeededScript = sealedScript;
    handoffOpeningSeededAt = Date.now();
  }
  mcqQuestionReplayUntil = Date.now() + 28000;
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  const ok = forceMcqQuestionExactReplay("ui-replay");
  setChoiceSpeakerState(button, ok ? "speaking" : "error");
  setTimeout(() => {
    if (button?.isConnected) setChoiceSpeakerState(button);
  }, ok ? 2800 : 1200);
}

function setChoiceSpeakerState(button, state = "") {
  button?.classList.toggle("is-loading", state === "loading");
  button?.classList.toggle("is-speaking", state === "speaking");
  button?.classList.toggle("is-error", state === "error");
  button?.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  button?.setAttribute("aria-pressed", state === "speaking" ? "true" : "false");
}

function finishChoiceSpeech(button, source) {
  if (activeChoiceAudioSource !== source) return;
  setChoiceSpeakerState(button);
  button?.setAttribute("aria-pressed", "false");
  activeChoiceSpeechButton = null;
  activeChoiceAudioSource = null;
}

function stopChoiceSpeech() {
  choiceSpeechRequestId += 1;
  activeChoiceAudioRequest?.abort();
  activeChoiceAudioRequest = null;
  if (activeChoiceAudioSource) {
    activeChoiceAudioSource.onended = null;
    try {
      activeChoiceAudioSource.stop();
    } catch {
      // Already stopped.
    }
    activeChoiceAudioSource.disconnect();
  }
  setChoiceSpeakerState(activeChoiceSpeechButton);
  activeChoiceSpeechButton = null;
  activeChoiceAudioSource = null;
}

async function getChoiceAudioContext() {
  if (!choiceAudioContext || choiceAudioContext.state === "closed") {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    choiceAudioContext = new AudioContextCtor();
  }
  if (choiceAudioContext.state !== "running") {
    await choiceAudioContext.resume();
  }
  return choiceAudioContext;
}

/** Hosted option readout; never sends a learner turn or touches lesson scoring. */
async function speakChoiceLabel(label, button) {
  const text = String(label || "").trim();
  const manifestEntry = MCQ_AUDIO_MANIFEST[normalizeMcqAudioLabel(text)];
  if (!text || !manifestEntry) {
    setChoiceSpeakerState(button, "error");
    button.title = `音声が見つかりません：${text}`;
    setTimeout(() => setChoiceSpeakerState(button), 1600);
    return;
  }

  stopChoiceSpeech();
  const requestId = ++choiceSpeechRequestId;
  activeChoiceSpeechButton = button;
  setChoiceSpeakerState(button, "loading");

  try {
    const context = await getChoiceAudioContext();
    if (!context) throw new Error("Web Audio is unavailable");
    const cacheKey = manifestEntry.path;
    let buffer = choiceAudioBufferCache.get(cacheKey);
    if (!buffer) {
      const controller = new AbortController();
      activeChoiceAudioRequest = controller;
      const response = await fetch(manifestEntry.path, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
      buffer = await context.decodeAudioData(await response.arrayBuffer());
      choiceAudioBufferCache.set(cacheKey, buffer);
    }
    if (requestId !== choiceSpeechRequestId || activeChoiceSpeechButton !== button) return;
    activeChoiceAudioRequest = null;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    activeChoiceAudioSource = source;
    setChoiceSpeakerState(button, "speaking");
    source.onended = () => finishChoiceSpeech(button, source);
    source.start();
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== choiceSpeechRequestId) return;
    nativeConsole.warn("MCQ audio playback failed", error);
    activeChoiceAudioRequest = null;
    activeChoiceAudioSource = null;
    setChoiceSpeakerState(button, "error");
    button.title = `もういちど押してね：${text}`;
    setTimeout(() => {
      if (activeChoiceSpeechButton === button) {
        setChoiceSpeakerState(button);
        activeChoiceSpeechButton = null;
      }
    }, 1600);
  }
}

function canonicalMcqQuestion({ en = "", ja = "" } = {}) {
  return {
    en: String(en || "").trim(),
    ja: String(ja || "").trim(),
  };
}

function renderChoiceBar(segment) {
  if (!choiceBar) return;
  const inputArea = document.getElementById("input-area");
  choiceBar.innerHTML = "";
  const hide = () => {
    choiceBar.hidden = true;
    choiceBar.classList.remove("is-fish-count-picker");
    inputArea?.classList.remove("has-mcq");
    if (chatInput) {
      chatInput.placeholder = isVoiceOnlyLesson()
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
  if (isVoiceOnlyLesson()) {
    hide();
    syncMicForMcqMode();
    return;
  }

  // Hide MCQ while reconnecting / until Learny starts the new chapter.
  // Also hide while a hinge handoff is queued (Daily→Ch6 waits for bridge speech
  // with segmentIndex already on ch6 — without this gate Beat 1 buttons flash early).
  const handoffHidingMcq =
    actionState !== "active" ||
    chapterTransitionActive ||
    isHandoffRunning ||
    isChapterHandoff ||
    skipOutboundForHandoff ||
    pendingHandoffTimer ||
    pendingChapterHandoff ||
    shouldHideMcqForHandoffGate(segment);
  if (handoffHidingMcq) {
    // Opening already on screen but a late duplicate schedule re-armed hide flags
    // (or skipOutbound/pendingHandoffTimer stuck). Never leave Beat 1 buttonsless.
    if (shouldForceShowMcqAfterOpening(segment)) {
      clearMcqHandoffGate("opening-already-presented");
      skipOutboundForHandoff = false;
      pendingChapterHandoff = null;
      if (pendingHandoffTimer) {
        clearTimeout(pendingHandoffTimer);
        pendingHandoffTimer = null;
      }
      if (chapterTransitionActive) {
        chapterTransitionActive = false;
        if (chapterTransitionSafetyId) {
          clearTimeout(chapterTransitionSafetyId);
          chapterTransitionSafetyId = null;
        }
        hideChapterLoadingOverlay();
      }
      // Fall through and render choices.
    } else {
      hide();
      syncMicForMcqMode();
      return;
    }
  }

  // Free-talk stretches (Ch2 chat/wait, Ch4 color ask before Beat B, etc.): no buttons.
  if (isCh2FreeTalkUi() || isCh4FreeTalkUi()) {
    hide();
    syncMicForMcqMode();
    return;
  }

  const appendChoices = (labels, onClick, titleText, question, { withSpeakers = true } = {}) => {
    show();
    const locked = choicesLocked();
    const titleRow = document.createElement("div");
    titleRow.className = "lesson-choice-title-row";
    const title = document.createElement("p");
    title.className = "lesson-choice-title";
    title.textContent = titleText;
    titleRow.appendChild(title);
    const questionScript = getActiveMcqQuestionScript(segment) ||
      [question?.en, question?.ja].filter(Boolean).join(" ").trim();
    if (questionScript) {
      const replay = document.createElement("button");
      replay.type = "button";
      replay.className = "lesson-choice-question-replay";
      replay.textContent = CHOICE_QUESTION_REPLAY_LABEL;
      replay.title = CHOICE_QUESTION_REPLAY_LABEL;
      replay.setAttribute("aria-label", CHOICE_QUESTION_REPLAY_LABEL);
      // Always clickable — kids need hear-again even while answer buttons are locked.
      replay.disabled = false;
      replay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        settlePresentedActionableMcq("question-replay-click");
        replayActiveMcqQuestion(replay);
      });
      titleRow.appendChild(replay);
    }
    choiceBar.appendChild(titleRow);
    const prompt = canonicalMcqQuestion(question);
    if (prompt.en || prompt.ja) {
      const questionBox = document.createElement("div");
      questionBox.className = "lesson-choice-question";
      questionBox.setAttribute("aria-label", "もんだい");
      if (prompt.en) {
        const en = document.createElement("p");
        en.className = "lesson-choice-question-en";
        en.textContent = prompt.en;
        questionBox.appendChild(en);
      }
      if (prompt.ja) {
        const ja = document.createElement("p");
        ja.className = "lesson-choice-question-ja";
        ja.textContent = prompt.ja;
        questionBox.appendChild(ja);
      }
      choiceBar.appendChild(questionBox);
    }
    const grid = document.createElement("div");
    grid.className = choiceBar.classList.contains("is-fish-count-picker")
      ? "lesson-choice-grid lesson-choice-grid--fish-count"
      : "lesson-choice-grid";
    labels.forEach((label) => {
      const option = document.createElement("div");
      option.className = withSpeakers
        ? "lesson-choice-option"
        : "lesson-choice-option lesson-choice-option--no-speaker";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-choice-btn";
      btn.textContent = label;
      btn.disabled = locked;
      btn.addEventListener("click", () => {
        settlePresentedActionableMcq("choice-click");
        if (choicesLocked()) return;
        stopChoiceSpeech();
        onClick(label);
      });
      if (withSpeakers) {
        const speaker = document.createElement("button");
        speaker.type = "button";
        speaker.className = "lesson-choice-speaker";
        speaker.innerHTML = CHOICE_SPEAKER_ICON;
        speaker.title = `この答えを英語で聞く：${label}`;
        speaker.setAttribute("aria-label", `この答えを英語で聞く：${label}`);
        speaker.setAttribute("aria-pressed", "false");
        speaker.disabled = locked;
        speaker.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          settlePresentedActionableMcq("choice-audio-click");
          if (choicesLocked()) return;
          speakChoiceLabel(label, speaker);
        });
        option.append(btn, speaker);
      } else {
        option.append(btn);
      }
      grid.appendChild(option);
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
      `答えをタップ（${quiz1State.cursor + 1} / ${total}）`,
      { ja: quiz1ItemSpeak(item) }
    );
    syncMicForMcqMode();
    return;
  }

  if (segment?.id === "final1" && segment?.input === "speak_or_click") {
    if (!assistantAskedFinal1QuizQuestion(lastAssistantText()) && !final1QuestionAudioReady) {
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
    // Keep the panel open after a tap — show the next (or same-on-retry) cue
    // while Learny speaks. Buttons stay locked via choicesLocked() until idle.
    appendChoices(
      getShuffledChoiceLabels(
        `final1:${item.id || item.answer || "item"}`,
        final1ChoiceLabels(item)
      ),
      (label) => handleFinal1ChoiceClick(label),
      "答えをタップしてね",
      { ja: item.promptHira || item.promptJa || item.promptEn || "" }
    );
    syncMicForMcqMode();
    return;
  }

  if (segment?.id === "ch4" && ch4ColorChoiceActive()) {
    appendChoices(
      CH4_PICKER_COLORS.map(formatCh4ColorChoiceLabel),
      (label) => handleCh4ColorPickerClick(label),
      "すきな色をタップ",
      { en: CH4_COLOR_ASK_EN, ja: CH4_COLOR_ASK_JA },
      { withSpeakers: false }
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

  const memories = loadLessonState().memories || {};
  const isFishCountPicker = Boolean(cur.beat.fishCountPicker);
  if (isFishCountPicker) {
    choiceBar.classList.add("is-fish-count-picker");
  } else {
    choiceBar.classList.remove("is-fish-count-picker");
  }
  appendChoices(
    resolveMcqChoices(cur.beat),
    (label) => handleMcqChoiceClick(label),
    isFishCountPicker
      ? "なんびきいた？タップしてね"
      : `答えをタップ（${cur.index + 1} / ${cur.total}）`,
    {
      en: expandMcqPlaceholders(cur.beat.learnyEn || "", memories),
      ja: expandMcqPlaceholders(cur.beat.learnyJa || "", memories),
    },
    // A1 number pad: no option audio. A2 dynamic fish phrases: premade 1–10 clips OK.
    { withSpeakers: !isFishCountPicker && !cur.beat.skipPremadeAudio }
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
    isVoiceOnlyLesson() &&
    lastVadUserAt &&
    Date.now() - lastVadUserAt < VOICE_TYPED_DEDUP_MS
  ) {
    return true;
  }
  return false;
}

function addUserAnswerBubble(text) {
  if (shouldSuppressUserTextBubble(text)) return;
  // Child answered — stop clamping STT to a seeded opening / beat line.
  clearHandoffOpeningDisplayLock("user-answer");
  clearMcqBeatDisplayLock("user-answer");
  clearMcqBeatPendingExact("user-answer");
  // Opening audio seal must not mute the next beat's Live speech.
  resetHandoffOpeningSpeechGate();
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

  // Never cut Ending Turn A/C or free-talk audio — stacked-interrupt was clipping
  // bilingual replies mid-Japanese while STT already showed the full turn.
  if (getCurrentSegment()?.id === "ending1") return false;
  // Never cut Ch4 make+tell exact script — "Tell me when…" looked like a second question.
  if (
    getCurrentSegment()?.id === "ch4" &&
    (ch4MakeTellDisplayLocked || ch4MakeTellAudioSent || ch4MakeTellKickInFlight)
  ) {
    return false;
  }

  let display = raw;
  if (getCurrentSegment()?.id === "ch2") {
    display = trimCh2AssistantBubble(raw);
  } else if (getCurrentSegment()?.id === "ending1" && isEnding1FreeTalkActive()) {
    display = trimEnding1FreeTalkRestart(raw);
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
  const generation = idleGeneration;
  setTimeout(() => {
    if (generation !== idleGeneration) return;
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
  // Praise/reaction + seeded script: Live often prefixes the exact line ("Great! Your tank…").
  if (cn.includes(pn) && cn.length > pn.length) return c;
  if (pn.includes(cn) && pn.length > cn.length && !finished) return p;
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
  // Once intro is done / free talk is open, never interrupt Live free-talk audio.
  if (
    getCurrentSegment()?.id === "ending1" &&
    c &&
    !ending1Beat.finaleRequested &&
    !ending1Beat.freeTalk &&
    !isEnding1FreeTalkActive() &&
    !ending1Beat.introSpeechComplete &&
    !ending1Beat.introStaticPending
  ) {
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

  // Ch4 make+tell: same restart pattern as Ending Turn A (short-turn cut → re-speak).
  if (getCurrentSegment()?.id === "ch4" && c) {
    trackCh4MakeTellSttProgress(c);
    if (shouldInterruptCh4MakeTellRestart(c)) {
      dbg("interrupt ch4 make+tell restart audio", c.slice(0, 40));
      sealCh4MakeTellSpeech("stt-restart");
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

  // Ch4 make+tell display is client-owned exact script — ignore STT stutter for the bubble.
  if (
    getCurrentSegment()?.id === "ch4" &&
    (ch4MakeTellDisplayLocked || ch4MakeTellStaticPending)
  ) {
    ensureCh4MakeTellBubbleExact();
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return true;
  }

  // Final challenge display is the queued question. Live STT must not replace it
  // with a different phrase or a second copy of the previous question.
  if (getCurrentSegment()?.id === "final1" && final1DisplayLocked) {
    ensureFinal1BubbleExact();
    if (c && final1SttConflictsWithCurrentCue(c)) {
      const now = Date.now();
      if (!final1MismatchRepairAt || now - final1MismatchRepairAt > 12000) {
        final1MismatchRepairAt = now;
        dbg("final1 spoken cue mismatch", c.slice(0, 48));
        try {
          audioPlayer?.interrupt?.();
          closeOpenAudioTurn();
        } catch {
          // ignore
        }
        final1SpeakKickAt = 0;
        forceFinal1NextCueSpeak("sango-fish-swap");
      }
    }
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return true;
  }

  // Handoff-seeded opening: keep a placeholder until Live STT arrives, then show the
  // real spoken turn (praise/reaction + exact script) like Part 1 — only clamp when
  // STT is prior-answer praise or missing/wrong elicit.
  if (handoffOpeningDisplayLocked) {
    const pastOpening =
      userSpokeSinceLastAssistantBubble() ||
      Number(loadMcqCursor(getCurrentSegment()) || 0) > 0 ||
      mcqBeatDisplayLocked;
    if (pastOpening) {
      clearHandoffOpeningDisplayLock("past-opening");
    } else if (c && looksLikePriorAnswerPraiseStt(c) && !assistantLiveIncludesScript(c, handoffOpeningSeededScript)) {
      dbg("drop prior-answer praise STT during handoff open", c.slice(0, 48));
      ensureHandoffOpeningBubbleExact();
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    } else if (c && assistantLiveIncludesScript(c, handoffOpeningSeededScript)) {
      noteHandoffOpeningLiveStt(c);
      // JP-only elicit without English lead — keep seeded bubble, force English re-speak.
      if (assistantHandoffOpeningMissingEnglish(c, handoffOpeningSeededScript)) {
        ensureHandoffOpeningBubbleExact();
        scheduleHandoffOpeningMissingEnglishRepair();
        scheduleRenderChat();
        updateLearnyThinkingUI();
        return true;
      }
      // Accept Live reaction + script; keep lock until reaction prefix or finished.
      const seededOpen = handoffOpeningSeededScript;
      const display = sanitizeAssistantBubbleText(c);
      const lastOpen = chatMessages[chatMessages.length - 1];
      if (lastOpen?.type === "assistant" && display) {
        lastOpen.text = display;
      }
      assistantTurnTranscript = display;
      assistantTranscriptOpen = Boolean(display);
      if (assistantHasReactionPrefix(c, seededOpen) || finished) {
        clearHandoffOpeningDisplayLock("live-stt-accepted");
        if (lastOpen?.type === "assistant") lastOpen.handoffSeeded = false;
      }
      scheduleRenderChat();
      updateLearnyThinkingUI();
      if (settlePresentedActionableMcq("output-transcription")) {
        refreshChoiceBarIfNeeded();
      }
      return true;
    } else if (c && assistantPart2HandoffOpeningMangled(c)) {
      noteHandoffOpeningLiveStt(c);
      ensureHandoffOpeningBubbleExact();
      if (assistantHandoffOpeningMissingEnglish(c, handoffOpeningSeededScript)) {
        scheduleHandoffOpeningMissingEnglishRepair();
      }
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    } else if (!c && finished) {
      ensureHandoffOpeningBubbleExact();
      if (
        handoffOpeningFirstAudioAt &&
        assistantHandoffOpeningMissingEnglish(handoffOpeningLiveStt, handoffOpeningSeededScript)
      ) {
        scheduleHandoffOpeningMissingEnglishRepair();
      }
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    } else if (c) {
      noteHandoffOpeningLiveStt(c);
      // Partial STT — show early praise on the seeded opening when we can.
      const praiseMerged = mergeMcqPraiseWithSeededScript(c, handoffOpeningSeededScript);
      if (praiseMerged) {
        const display = sanitizeAssistantBubbleText(praiseMerged);
        const lastOpen = chatMessages[chatMessages.length - 1];
        if (lastOpen?.type === "assistant" && display) lastOpen.text = display;
        assistantTurnTranscript = display;
      }
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
  }

  // Mid-chapter MCQ seed: transcript always keeps praise + next beat.
  if (mcqBeatDisplayLocked && mcqBeatSeededScript) {
    const seededFull = mcqBeatSeededScript;
    const seededExact = mcqBeatSeededExact || seededFull;
    if (c) noteMcqBeatLiveStt(c);
    if (c && assistantLiveIncludesScript(c, seededExact)) {
      const display = sanitizeAssistantBubbleText(
        preferMcqTranscriptWithPraise(c, seededFull, seededExact)
      );
      const lastSeeded = chatMessages[chatMessages.length - 1];
      if (lastSeeded?.type === "assistant" && display) {
        lastSeeded.text = display;
      }
      assistantTurnTranscript = display;
      assistantTranscriptOpen = Boolean(display);
      // Keep lock until finished so late script-only STT cannot wipe praise.
      if (finished || assistantHasReactionPrefix(c, seededExact)) {
        clearMcqBeatDisplayLock("live-stt-accepted");
        if (lastSeeded?.type === "assistant") lastSeeded.mcqSeeded = false;
      }
      if (assistantLiveIncludesScript(mcqBeatLiveStt || c, seededExact)) {
        confirmMcqBeatSpoken("live-stt-accepted");
      }
      scheduleRenderChat();
      updateLearnyThinkingUI();
      if (settlePresentedActionableMcq("output-transcription")) {
        refreshChoiceBarIfNeeded();
      }
      return true;
    }
    const praiseMerged = mergeMcqPraiseWithSeededScript(c, seededExact);
    if (praiseMerged) {
      const display = sanitizeAssistantBubbleText(
        preferMcqTranscriptWithPraise(praiseMerged, seededFull, seededExact)
      );
      const lastSeeded = chatMessages[chatMessages.length - 1];
      if (lastSeeded?.type === "assistant" && display) {
        lastSeeded.text = display;
        // Upgrade seed so clamps keep the Live/reaction version.
        mcqBeatSeededScript = display;
      }
      assistantTurnTranscript = display;
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
    if (c && looksLikePriorAnswerPraiseStt(c) && !assistantLiveIncludesScript(c, seededExact)) {
      ensureMcqBeatSpeakBubbleExact();
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
    if (c) {
      const looksWrongBeat =
        /の\s*えいごを\s*選んでね|は\s*えいごで？/.test(c) &&
        !assistantLiveIncludesScript(c, seededExact);
      if (looksWrongBeat) {
        ensureMcqBeatSpeakBubbleExact();
      }
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
    if (finished) {
      // Do NOT unlock / clear pending here — empty or praise-only finishes used to
      // make seeded bubbles look "delivered" and cancel auto-つつく.
      ensureMcqBeatSpeakBubbleExact();
      if (assistantLiveIncludesScript(mcqBeatLiveStt, seededExact)) {
        confirmMcqBeatSpoken("mcq-stt-finished-with-script");
        clearMcqBeatDisplayLock("mcq-stt-finished-with-script");
        const lastSeeded = chatMessages[chatMessages.length - 1];
        if (lastSeeded?.type === "assistant") lastSeeded.mcqSeeded = false;
      } else {
        schedulePart2McqMissingScriptRepair({ forceSoon: true });
      }
    } else {
      ensureMcqBeatSpeakBubbleExact();
    }
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return true;
  }

  // Quiz1 seeded line — keep praise + exact item; never replace with script-only STT.
  if (getCurrentSegment()?.id === "quiz1") {
    const qItem = getCurrentQuiz1Item();
    const lastQ = chatMessages[chatMessages.length - 1];
    const qScript = quiz1ItemSpeak(qItem);
    if (qItem && lastQ?.type === "assistant" && lastQ.quiz1Seeded && !userSpokeSinceLastAssistantBubble()) {
      if (c && assistantLiveIncludesScript(c, qScript)) {
        const display = sanitizeAssistantBubbleText(
          preferMcqTranscriptWithPraise(c, String(lastQ.text || qScript), qScript)
        );
        if (display) lastQ.text = display;
        if (finished || assistantHasReactionPrefix(c, qScript)) {
          lastQ.quiz1Seeded = false;
        }
        assistantTurnTranscript = display;
        assistantTranscriptOpen = Boolean(display);
        scheduleRenderChat();
        updateLearnyThinkingUI();
        if (settlePresentedActionableMcq("output-transcription")) {
          refreshChoiceBarIfNeeded();
        }
        return true;
      }
      const praiseMerged = mergeMcqPraiseWithSeededScript(c, qScript);
      if (praiseMerged) {
        const display = sanitizeAssistantBubbleText(
          preferMcqTranscriptWithPraise(praiseMerged, String(lastQ.text || qScript), qScript)
        );
        if (display) lastQ.text = display;
        assistantTurnTranscript = display;
        scheduleRenderChat();
        updateLearnyThinkingUI();
        return true;
      }
      if (c && assistantQuiz1SpeakMangled(c, qItem)) {
        ensureQuiz1BubbleExact(qItem);
        scheduleRenderChat();
        updateLearnyThinkingUI();
        return true;
      }
      if (c) {
        scheduleRenderChat();
        updateLearnyThinkingUI();
        return true;
      }
    }
  }

  // Late reaction STT (よくできた / Great!) after the beat seed lock cleared — fold into
  // the current Learny bubble instead of a grey orphan / script-only freeze.
  if (c && usesPart2Architecture() && !userSpokeSinceLastAssistantBubble()) {
    const lastA = chatMessages[chatMessages.length - 1];
    const expected =
      mcqBeatSeededExact ||
      mcqBeatSeededScript ||
      getExpectedAssistantSpeakLine() ||
      handoffOpeningSeededScript ||
      "";
    if (lastA?.type === "assistant" && expected) {
      const lastText = String(lastA.text || "");
      const lastIsThisBeat =
        assistantLiveIncludesScript(lastText, expected) ||
        assistantMessagesTooSimilar(lastText, expected);
      if (lastIsThisBeat && !assistantHasReactionPrefix(lastText, expected)) {
        if (assistantLiveIncludesScript(c, expected) && assistantHasReactionPrefix(c, expected)) {
          const display = sanitizeAssistantBubbleText(c);
          lastA.text = display;
          lastA.mcqSeeded = false;
          lastA.handoffSeeded = false;
          assistantTurnTranscript = display;
          assistantTranscriptOpen = Boolean(display);
          scheduleRenderChat();
          updateLearnyThinkingUI();
          return true;
        }
        const base = assistantLiveIncludesScript(lastText, expected) ? expected : lastText;
        const merged = mergeMcqPraiseWithSeededScript(c, base);
        if (merged) {
          const display = sanitizeAssistantBubbleText(merged);
          lastA.text = display;
          assistantTurnTranscript = display;
          assistantTranscriptOpen = Boolean(display);
          scheduleRenderChat();
          updateLearnyThinkingUI();
          return true;
        }
      }
    }
  }

  const last = chatMessages[chatMessages.length - 1];
  let needNewBubble =
    !assistantTranscriptOpen || last?.type !== "assistant" || userSpokeSinceLastAssistantBubble();

  // Never open a new bubble for a bare reaction bridge — attach to the seeded beat.
  if (
    needNewBubble &&
    c &&
    looksLikeMcqReactionBridge(c) &&
    last?.type === "assistant" &&
    !userSpokeSinceLastAssistantBubble()
  ) {
    const expected = mcqBeatSeededExact || mcqBeatSeededScript || getExpectedAssistantSpeakLine() || "";
    const merged = mergeMcqPraiseWithSeededScript(
      c,
      assistantLiveIncludesScript(String(last.text || ""), expected)
        ? expected
        : String(last.text || expected)
    );
    if (merged) {
      const display = sanitizeAssistantBubbleText(
        preferMcqTranscriptWithPraise(merged, String(last.text || ""), expected)
      );
      last.text = display;
      assistantTurnTranscript = display;
      assistantTranscriptOpen = Boolean(display);
      scheduleRenderChat();
      updateLearnyThinkingUI();
      return true;
    }
  }
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
  // Warmup How-are-you: seal after first good STT so a ghost second greeting cannot play.
  if (
    getCurrentSegment()?.type === "warmup" &&
    handoffOpeningDisplayLocked &&
    !handoffOpeningSpeechSealed &&
    countWarmupUserReplies() < 1 &&
    display &&
    (/how are you/i.test(display) || assistantLiveIncludesScript(display, WARMUP_OPENING_SPEAK))
  ) {
    if (assistantDoubledHowAreYou(display) || finished) {
      sealHandoffOpeningSpeech(
        assistantDoubledHowAreYou(display) ? "stt-doubled-how-are-you" : "warmup-opening-stt",
        { hard: assistantDoubledHowAreYou(display) }
      );
    } else {
      armHandoffOpeningQuietSeal();
    }
  }
  // OUTPUT_TRANSCRIPTION can be the only usable delivery signal. Once the
  // exact current MCQ is visible, the child is the actor: unlock the buttons
  // and cancel reply recovery even if no worklet "rendered" event arrived.
  if (settlePresentedActionableMcq("output-transcription")) {
    refreshChoiceBarIfNeeded();
  }
  // Show Ch4 MCQ as soon as Beat B elicit appears (don't wait for turn end).
  if (
    getCurrentSegment()?.id === "ch4" &&
    display &&
    (ch4AssistantSaidBeatB(display) || ch4MakeTellUnlocked)
  ) {
    if (ch4AssistantSaidBeatB(display)) markCh4MakeTellUnlocked("stt-beat-b");
    refreshChoiceBarIfNeeded();
  }
  if (finished) {
    scheduleRepairIncompleteAssistantBubble();
    if (getCurrentSegment()?.id === "ch4" && (ch4AssistantSaidBeatB() || ch4MakeTellUnlocked)) {
      markCh4MakeTellUnlocked("stt-finished");
      refreshChoiceBarIfNeeded();
    }
    if (getCurrentSegment()?.id === "ch4" && ch4HasFavoriteColor() && !ch4AssistantSaidBeatB() && !ch4MakeTellUnlocked) {
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
  if (usesBeginnerInstructionProfile() && !isQuizSpeakSegment()) {
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
  if (seg?.id === "quiz1" && assistantQuiz1SpeakMangled(t, getCurrentQuiz1Item())) {
    return false;
  }
  if (
    (seg?.id === "daily1" || seg?.type === "daily_english") &&
    usesBeginnerInstructionProfile() &&
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

const HANDOFF_SPEAK_LINES_PART1 = {
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

const HANDOFF_SPEAK_LINES_PART2 = {
  ch1: PART2_CH1_BEAT1_SPEAK,
  ch2: PART2_CH2_BEAT1_SPEAK,
  ch3: PART2_CH3_BEAT1_SPEAK,
  ch4: PART2_CH4_BEAT1_SPEAK,
  quiz1: "くいずたいむ！「ここに さんごを おいた」は えいごで？",
  ch5: PART2_CH5_BEAT1_SPEAK,
  ch6: PART2_CH6_BEAT1_SPEAK,
  final1: "", // opening forced via forceFinal1OpenWithFirstQuestion
};

function getHandoffSpeakLine(segment = getCurrentSegment()) {
  if (!segment) return "";
  if (segment.id === "daily1") {
    return usesPart2Architecture() ? daily1OpenSpeakPart2() : daily1OpenSpeak();
  }
  if (usesPart2Architecture()) {
    return HANDOFF_SPEAK_LINES_PART2[segment.id] || "";
  }
  if (usesTemplateArchitecture()) {
    return HANDOFF_SPEAK_LINES_PART1[segment.id] || "";
  }
  return "";
}

function clearHandoffOpeningQuietSeal() {
  if (handoffOpeningQuietSealId) {
    clearTimeout(handoffOpeningQuietSealId);
    handoffOpeningQuietSealId = null;
  }
}

function resetHandoffOpeningSpeechGate() {
  clearHandoffOpeningQuietSeal();
  handoffOpeningSpeechSealed = false;
  handoffOpeningSeededAt = 0;
  handoffOpeningFirstAudioAt = 0;
  handoffOpeningLastAudioPacketAt = 0;
  handoffOpeningPacketCount = 0;
  handoffOpeningLiveStt = "";
  handoffOpeningMissingEnRepairSent = false;
}

/** Seal chapter-opening audio so Gemini cannot restart the same script (one bubble).
 * Soft seal = block future packets only. Hard interrupt only after the first pass
 * should have finished — early interrupt was clipping 「…選んでね！」 mid-mora.
 */
function sealHandoffOpeningSpeech(reason = "seal", { hard = false } = {}) {
  const expectMs = Math.max(
    4500,
    estimateSpeechMs(handoffOpeningSeededScript || "") + 1800
  );
  const age = handoffOpeningFirstAudioAt
    ? Date.now() - handoffOpeningFirstAudioAt
    : 0;
  const firstPassLikelyDone = !handoffOpeningFirstAudioAt || age >= expectMs * 0.92;

  if (handoffOpeningSpeechSealed) {
    // Already sealed — only kill late restart audio after the first pass finished.
    if (hard || firstPassLikelyDone) {
      try {
        audioPlayer?.interrupt?.();
      } catch {
        // ignore
      }
    }
    return;
  }
  handoffOpeningSpeechSealed = true;
  clearHandoffOpeningQuietSeal();
  dbg("handoff opening speech sealed", { reason, hard, age, expectMs });

  // Never interrupt / close the turn while the first opening is still playing —
  // that clipped endings like 「…の えいごを 選んで」 (missing ね！).
  if (!hard && !firstPassLikelyDone) return;
  if (assistantIsSpeaking() && !hard) return;

  try {
    audioPlayer?.interrupt?.();
    // Do not closeOpenAudioTurn here — that aborted Live mid-tail on openings.
  } catch {
    // ignore
  }
}

function armHandoffOpeningQuietSeal() {
  if (!handoffOpeningDisplayLocked || handoffOpeningSpeechSealed) return;
  if (!handoffOpeningFirstAudioAt) return;
  const expectMs = Math.max(
    4500,
    estimateSpeechMs(handoffOpeningSeededScript || "") + 1800
  );
  const age = Date.now() - handoffOpeningFirstAudioAt;
  // Wait until the estimated script has mostly played before arming quiet-seal.
  if (age < expectMs * 0.85) {
    clearHandoffOpeningQuietSeal();
    handoffOpeningQuietSealId = setTimeout(() => {
      handoffOpeningQuietSealId = null;
      armHandoffOpeningQuietSeal();
    }, Math.max(400, expectMs * 0.85 - age));
    return;
  }
  clearHandoffOpeningQuietSeal();
  handoffOpeningQuietSealId = setTimeout(() => {
    handoffOpeningQuietSealId = null;
    if (!handoffOpeningDisplayLocked || handoffOpeningSpeechSealed) return;
    if (assistantIsSpeaking() || assistantPlaybackMsLeft() > 600) {
      armHandoffOpeningQuietSeal();
      return;
    }
    // Do not seal a JP-only opening — kids must hear the English lead.
    if (
      assistantHandoffOpeningMissingEnglish(
        handoffOpeningLiveStt || lastAssistantText(),
        handoffOpeningSeededScript
      )
    ) {
      scheduleHandoffOpeningMissingEnglishRepair();
      return;
    }
    sealHandoffOpeningSpeech("quiet-after-opening", { hard: false });
  }, 1600);
}

/**
 * Drop ghost second openings (same as Ending Turn A): Live often restarts the
 * exact script with little/no new STT while the client bubble stays locked.
 */
function gateHandoffOpeningAudioPacket() {
  if (!handoffOpeningSeededScript && !handoffOpeningSpeechSealed && !handoffOpeningDisplayLocked) {
    return false;
  }
  // Explicit 「もういちど聞く」 replay must always be audible.
  if (isMcqQuestionReplayActive()) return false;
  // Past the chapter opening (child answered / mid-chapter seed) — never mute MCQ audio.
  if (mcqBeatDisplayLocked || Number(loadMcqCursor(getCurrentSegment()) || 0) > 0) {
    return false;
  }
  if (userSpokeSinceLastAssistantBubble() && !handoffOpeningDisplayLocked) {
    return false;
  }
  if (handoffOpeningSpeechSealed) return true;
  if (!handoffOpeningDisplayLocked && !handoffOpeningSeededScript) return false;

  const now = Date.now();
  if (!handoffOpeningFirstAudioAt) {
    handoffOpeningFirstAudioAt = now;
  }
  handoffOpeningPacketCount = (handoffOpeningPacketCount || 0) + 1;
  const gap = handoffOpeningLastAudioPacketAt
    ? now - handoffOpeningLastAudioPacketAt
    : 0;
  const scriptMs = Math.max(4500, estimateSpeechMs(handoffOpeningSeededScript) + 1800);
  const age = now - handoffOpeningFirstAudioAt;

  // Hard cap only well after a full pass (+ generous buffer for slow TTS).
  if (age > scriptMs + 8000) {
    sealHandoffOpeningSpeech("max-audio-duration", { hard: true });
    return true;
  }

  // Packet-stream gap after a COMPLETE first pass = new model generation.
  // Mid-phrase Live jitter (EN→JP pause) must NOT seal — that clipped ね！.
  if (
    handoffOpeningPacketCount > 24 &&
    gap > 1600 &&
    age > scriptMs + 400
  ) {
    sealHandoffOpeningSpeech("audio-gap-restart", { hard: true });
    return true;
  }

  handoffOpeningLastAudioPacketAt = now;
  if (age > scriptMs * 0.8 || handoffOpeningPacketCount > 20) {
    armHandoffOpeningQuietSeal();
  }
  return false;
}

function shouldDropHandoffOpeningAudio() {
  // Speech seal survives display unlock (so praise+script can show without
  // allowing a ghost second opening).
  if (!handoffOpeningSpeechSealed) return false;
  if (isMcqQuestionReplayActive()) return false;
  // Never drop mid-chapter / post-answer audio.
  if (mcqBeatDisplayLocked || Number(loadMcqCursor(getCurrentSegment()) || 0) > 0) {
    return false;
  }
  if (userSpokeSinceLastAssistantBubble()) return false;
  return true;
}

/** Show the next-chapter opening immediately — don't wait on flaky Live STT. */
function seedHandoffOpeningBubble(script) {
  const text = String(script || "").trim();
  if (!text) return;
  resetHandoffOpeningSpeechGate();
  handoffOpeningDisplayLocked = true;
  handoffOpeningSeededScript = text;
  handoffOpeningSeededAt = Date.now();
  // Opening is owned by the new chapter — never keep outbound-skip hiding MCQ.
  skipOutboundForHandoff = false;
  // Opening is on screen — drop transition overlay / MCQ gate so Beat 1 buttons can appear
  // (still locked while Learny is speaking via choicesLocked).
  markChapterTransitionSpeaking();
  const last = chatMessages[chatMessages.length - 1];
  if (
    last?.type === "assistant" &&
    !userSpokeSinceLastAssistantBubble() &&
    (last.handoffSeeded ||
      assistantMessagesTooSimilar(last.text, text) ||
      String(last.text || "").includes(text.slice(0, 24)))
  ) {
    last.text = text;
    last.handoffSeeded = true;
    assistantTurnTranscript = text;
    assistantTranscriptOpen = true;
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return;
  }
  chatMessages.push({
    type: "assistant",
    text,
    handoffSeeded: true,
    sttEnterPending: true,
  });
  lastAssistantBubbleAt = Date.now();
  assistantTurnTranscript = text;
  assistantTranscriptOpen = true;
  scheduleRenderChat();
  updateLearnyThinkingUI();
}

function ensureHandoffOpeningBubbleExact() {
  if (!handoffOpeningDisplayLocked || !handoffOpeningSeededScript) return;
  const last = chatMessages[chatMessages.length - 1];
  // Always clamp the opening bubble — do not require handoffSeeded (that flag is
  // cleared too early and late STT was appending paraphrases like "the ocean!…").
  if (last?.type === "assistant" && last.text !== handoffOpeningSeededScript) {
    last.text = handoffOpeningSeededScript;
    last.handoffSeeded = true;
  }
  assistantTurnTranscript = handoffOpeningSeededScript;
}

function clearHandoffOpeningDisplayLock(reason = "clear") {
  if (!handoffOpeningDisplayLocked && !handoffOpeningSeededScript) return;
  handoffOpeningDisplayLocked = false;
  handoffOpeningSeededScript = "";
  // Keep speech seal when unlocking for accepted Live STT — resetting it allowed
  // ghost second openings. Full reset only on teardown / new seed.
  if (reason !== "live-stt-accepted") {
    resetHandoffOpeningSpeechGate();
  }
  const last = chatMessages[chatMessages.length - 1];
  if (last?.handoffSeeded) last.handoffSeeded = false;
  dbg("handoff opening display unlocked", reason);
}

function clearMcqBeatDisplayLock(reason = "clear") {
  if (
    !mcqBeatDisplayLocked &&
    !mcqBeatSeededScript &&
    !mcqBeatSeededExact &&
    !mcqBeatLiveStt &&
    !mcqBeatPendingExact
  ) {
    return;
  }
  mcqBeatDisplayLocked = false;
  mcqBeatSeededScript = "";
  mcqBeatSeededExact = "";
  // Keep mcqBeatPendingExact until confirmMcqBeatSpoken / child answers.
  mcqBeatLiveStt = "";
  mcqBeatMissingScriptRepairSent = false;
  mcqScriptRepairGeneration += 1;
  lastMcqExactSpeakAt = 0;
  lastMcqExactSpeakScript = "";
  dbg("mcq beat display unlocked", reason);
}

/** Mark the pending mid-chapter MCQ as actually spoken (Live STT covered the elicit). */
function confirmMcqBeatSpoken(reason = "spoken") {
  if (!mcqBeatPendingExact) return;
  mcqBeatPendingExact = "";
  dbg("mcq beat spoken confirmed", reason);
}

function clearMcqBeatPendingExact(reason = "clear") {
  if (!mcqBeatPendingExact) return;
  mcqBeatPendingExact = "";
  dbg("mcq beat pending cleared", reason);
}

function ensureMcqBeatSpeakBubbleExact() {
  if (!mcqBeatDisplayLocked || !mcqBeatSeededScript) return;
  const last = chatMessages[chatMessages.length - 1];
  if (last?.type === "assistant") {
    const cur = String(last.text || "").trim();
    // Never leave unresolved placeholders in the transcript.
    if (/\[fishCount\]|\[color\]/i.test(cur) || /\[fishCount\]|\[color\]/i.test(mcqBeatSeededScript)) {
      const fixed = expandMcqPlaceholders(mcqBeatSeededScript, loadLessonState().memories || {});
      mcqBeatSeededScript = fixed;
      mcqBeatSeededExact = expandMcqPlaceholders(
        mcqBeatSeededExact || fixed,
        loadLessonState().memories || {}
      );
      last.text = fixed;
      assistantTurnTranscript = fixed;
      return;
    }
    const exact = mcqBeatSeededExact || mcqBeatSeededScript;
    // Keep a stronger Live reaction+script if already on the bubble.
    if (
      assistantLiveIncludesScript(cur, exact) &&
      assistantHasReactionPrefix(cur, exact) &&
      normalizePart2ScriptCompare(cur).length >=
        normalizePart2ScriptCompare(mcqBeatSeededScript).length
    ) {
      assistantTurnTranscript = cur;
      return;
    }
    if (last.text !== mcqBeatSeededScript) {
      last.text = mcqBeatSeededScript;
    }
  }
  assistantTurnTranscript = mcqBeatSeededScript;
}

const MCQ_TRANSCRIPT_PRAISES = [
  "Great!",
  "Amazing!",
  "Nice one!",
  "やったね！",
  "ばっちり！",
  "Yes!",
];

/** Rotate short praise prefixes baked into the Part 2 transcript bubble. */
function nextMcqTranscriptPraise() {
  const p = MCQ_TRANSCRIPT_PRAISES[mcqTranscriptPraiseIdx % MCQ_TRANSCRIPT_PRAISES.length];
  mcqTranscriptPraiseIdx += 1;
  return p;
}

/**
 * Never let script-only Live STT erase the praise kids heard / we seeded.
 * Live reaction+script wins; otherwise keep seeded praise + exact elicit.
 * Never keep freestyle AFTER the elicit (e.g. JP remake of the EN lead + mid-cut 「これ).
 */
function preferMcqTranscriptWithPraise(liveText, seededFull, seededExact) {
  const live = String(liveText || "").trim();
  const seeded = String(seededFull || "").trim();
  const exact = String(seededExact || seeded).trim();
  if (!exact) return live || seeded;
  if (!live) return seeded || exact;
  const clamped = clampMcqLiveTranscript(live, exact, seeded);
  if (assistantLiveIncludesScript(clamped, exact) && assistantHasReactionPrefix(clamped, exact)) {
    return clamped;
  }
  if (assistantLiveIncludesScript(live, exact) || assistantLiveIncludesScript(clamped, exact)) {
    // Script present — never show freestyle tail; keep seeded praise+exact if clamp is weak.
    if (assistantHasReactionPrefix(clamped, exact)) return clamped;
    if (assistantHasReactionPrefix(seeded, exact)) return seeded;
    return `Great! ${exact}`.replace(/\s+/g, " ").trim();
  }
  const merged = mergeMcqPraiseWithSeededScript(live, exact);
  if (merged) return clampMcqLiveTranscript(merged, exact, seeded) || merged;
  return seeded || exact;
}

/**
 * Cut Live freestyle that continues after the MCQ elicit closer.
 * Fixes bubbles like: [praise+exact] + おかえりなさい！…「これ
 */
function clampMcqLiveTranscript(liveText, seededExact, seededFull) {
  const liveRaw = String(liveText || "").trim();
  const exactRaw = String(seededExact || "").trim();
  const seeded = String(seededFull || exactRaw).trim();
  if (!liveRaw) return seeded;
  if (!exactRaw) return liveRaw;
  if (!assistantLiveIncludesScript(liveRaw, exactRaw)) {
    // Mid-cut restart of 「… without completing elicit — keep seed.
    if (/「[^」]*$/.test(liveRaw) && liveRaw.length > 12) return seeded || liveRaw;
    return liveRaw;
  }

  const closerRe = /の\s*えいごを\s*選んでね！|を\s*えいごで\s*いってみて！|は\s*どれ？/g;
  let cutAt = -1;
  let m;
  while ((m = closerRe.exec(liveRaw)) !== null) {
    const candidate = liveRaw.slice(0, m.index + m[0].length).trim();
    if (assistantLiveIncludesScript(candidate, exactRaw)) {
      cutAt = m.index + m[0].length;
      break;
    }
  }
  if (cutAt < 0) {
    // Exact heard but elicit closer incomplete, or truncated remake — prefer seed.
    if (/「[^」]*$/.test(liveRaw) || liveRaw.length > seeded.length + 20) {
      return seeded;
    }
    return liveRaw;
  }
  const clamped = liveRaw.slice(0, cutAt).trim();
  const tail = liveRaw.slice(cutAt).trim();
  if (tail.length > 2 && /[A-Za-zぁ-んァ-ン一-龯]/.test(tail)) {
    return clamped;
  }
  return liveRaw;
}

/** Show praise + next MCQ beat script in chat immediately (Part 2 mid-chapter). */
function seedMcqBeatSpeakBubble(beat, { praise = "" } = {}) {
  const exact = resolvedPart2McqBeatSpeak(beat);
  if (!exact) return;
  const prefix = String(praise || nextMcqTranscriptPraise()).trim();
  const text = `${prefix} ${exact}`.replace(/\s+/g, " ").trim();
  clearHandoffOpeningDisplayLock("seed-mcq-beat");
  // Mid-chapter speech must play — clear any leftover chapter-opening audio seal.
  resetHandoffOpeningSpeechGate();
  mcqBeatDisplayLocked = true;
  mcqBeatSeededExact = exact;
  mcqBeatSeededScript = text;
  mcqBeatPendingExact = exact;
  mcqBeatLiveStt = "";
  mcqBeatMissingScriptRepairSent = false;
  mcqScriptRepairGeneration += 1;
  const last = chatMessages[chatMessages.length - 1];
  if (
    last?.type === "assistant" &&
    !userSpokeSinceLastAssistantBubble() &&
    (last.mcqSeeded ||
      assistantMessagesTooSimilar(last.text, exact) ||
      assistantLiveIncludesScript(String(last.text || ""), exact) ||
      String(last.text || "").includes(exact.slice(0, 20)) ||
      /\[fishCount\]|\[color\]/i.test(String(last.text || "")))
  ) {
    last.text = text;
    last.mcqSeeded = true;
    assistantTurnTranscript = text;
    assistantTranscriptOpen = true;
    scheduleRenderChat();
    updateLearnyThinkingUI();
    return;
  }
  chatMessages.push({
    type: "assistant",
    text,
    mcqSeeded: true,
    sttEnterPending: true,
  });
  lastAssistantBubbleAt = Date.now();
  assistantTurnTranscript = text;
  assistantTranscriptOpen = true;
  scheduleRenderChat();
  updateLearnyThinkingUI();
}

/**
 * Part 2 mid-chapter: force praise + next beat as one exact bilingual turn.
 * Soft coach + beginner "One short turn" often left kids with a seeded bubble and silence.
 */
function forcePart2McqAdvanceSpeak(childLabel, beat, praise) {
  const exact = resolvedPart2McqBeatSpeak(beat);
  if (!exact || !client?.connected || actionState !== "active") return false;
  const prefix = String(praise || nextMcqTranscriptPraise()).trim();
  const full = `${prefix} ${exact}`.replace(/\s+/g, " ").trim();
  const koreWoHint = /これ\s*を\s*えらぶ/.test(exact)
    ? " Inside 「」 say これ・を・えらぶ (kore wo). FORBIDDEN: ここに えらぶ / ここにえらぶ. "
    : "";
  const outbound =
    "[MCQ] Child said: \"" +
    String(childLabel || "").trim() +
    "\". Speak EXACTLY once the text between <exact> tags as your complete audible turn — brief praise then the full bilingual question (English lead first, then 「」ひらがな elicit). " +
    koreWoHint +
    "FORBIDDEN: praise-only; skipping English; skipping Japanese; reading answer choices; paraphrasing; " +
    "translating the English lead into Japanese (no おかえりなさい／きみは… remake); repeating the elicit; speaking anything after 選んでね！. " +
    "Then WAIT for a 4-button tap.\n" +
    `<exact>${full}</exact>`;
  const wrapped = withPart2McqExactSpeakRule(outbound);
  const requestId = ++childTurnRequestId;
  prepareForUserOutbound();
  const send = () => {
    if (requestId !== childTurnRequestId) return false;
    if (actionState !== "active" || !client?.connected) return false;
    const ok = Boolean(sendClientText(wrapped, { force: true }));
    userTurnSentViaClientText = ok;
    if (ok) {
      noteMcqExactSpeakSent(full || exact);
      lastPendingUserText = String(childLabel || "").trim();
      lastUserTurnAt = Date.now();
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      // Arm watch only AFTER the forced turn is sent — never while waiting to speak
      // (that used to auto-つつく a second Speak EXACTLY mid-flight).
      armSilentReplyWatch(lastPendingUserText, {
        fromVoice: false,
        mode: "mcq",
        replayOutbound: outbound,
        replaySent: true,
        // Cap wait so silent bubbles get auto-つつく even when speech estimate is long.
        initialDelay: Math.max(
          4500,
          Math.min(estimateSpeechMs(full || exact) + 1800, 8000)
        ),
      });
      schedulePart2McqMissingScriptRepair();
    }
    return ok;
  };
  if (assistantIsSpeaking()) {
    sealStaleAssistantPlaybackEstimate("part2-mcq-advance");
  }
  if (assistantIsSpeaking()) {
    whenAssistantIdle(() => {
      send();
    }, "part2-mcq-advance");
    lastPendingUserText = String(childLabel || "").trim();
    lastUserTurnAt = Date.now();
    awaitingAssistantReply = true;
    updateLearnyThinkingUI();
    userTurnSentViaClientText = false;
    // Do NOT arm silent-watch here — poke must wait until send() lands.
    return true;
  }
  return send();
}

function noteMcqExactSpeakSent(script) {
  const s = String(script || "").trim();
  if (!s) return;
  lastMcqExactSpeakAt = Date.now();
  lastMcqExactSpeakScript = s;
  mcqBeatMissingScriptRepairSent = true;
}

function recentlyForcedSameMcqScript(script = "") {
  const s = String(script || lastMcqExactSpeakScript || mcqBeatPendingExact || "").trim();
  if (!s || !lastMcqExactSpeakAt) return false;
  if (Date.now() - lastMcqExactSpeakAt > AUTO_POKE_SCRIPT_DEDUP_MS) return false;
  const a = normalizePresentedMcqText(s);
  const b = normalizePresentedMcqText(lastMcqExactSpeakScript);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Live skipped the next-beat script after praise — force exact re-speak once. */
function schedulePart2McqMissingScriptRepair({ forceSoon = false } = {}) {
  if (!usesPart2Architecture()) return;
  const exactAtArm = String(mcqBeatPendingExact || mcqBeatSeededExact || "").trim();
  if (!exactAtArm) return;
  // Silent-watch owns recovery when a client force already went out — a parallel
  // REPAIR Speak EXACTLY was stacking repeats with auto-つつく.
  if (pendingReplyMode === "mcq" && pendingReplyReplaySent) return;
  if (recentlyForcedSameMcqScript(exactAtArm)) return;
  const scriptAtArm = String(mcqBeatSeededScript || exactAtArm).trim();
  const waitMs = forceSoon
    ? 2200
    : Math.max(5200, Math.min(estimateSpeechMs(scriptAtArm || exactAtArm) + 2800, 11000));
  const gen = ++mcqScriptRepairGeneration;
  setTimeout(() => {
    whenAssistantIdle(() => {
      if (gen !== mcqScriptRepairGeneration) return;
      if (!usesPart2Architecture()) return;
      const stillPending = String(mcqBeatPendingExact || "").trim();
      if (!stillPending || stillPending !== exactAtArm) return;
      if (mcqBeatMissingScriptRepairSent) return;
      if (recentlyForcedSameMcqScript(exactAtArm)) return;
      if (userSpokeSinceLastAssistantBubble()) return;
      if (assistantHeardSinceUserTurn() && assistantLiveIncludesScript(mcqBeatLiveStt, exactAtArm)) {
        confirmMcqBeatSpoken("repair-already-spoken");
        return;
      }
      // If Learny already produced audio this turn, prefer settling over re-speak.
      if (assistantHeardSinceUserTurn()) {
        dbg("part2 mcq repair skipped; audio already heard");
        return;
      }
      mcqBeatMissingScriptRepairSent = true;
      noteMcqExactSpeakSent(scriptAtArm || exactAtArm);
      try {
        audioPlayer?.interrupt?.();
        closeOpenAudioTurn();
      } catch {
        // ignore
      }
      // Cancel auto-つつく so REPAIR and poke cannot both Speak EXACTLY.
      clearPendingReplyWatch("mcq-script-repair");
      const outbound =
        "[MCQ] REPAIR. The previous turn missed the question. Speak EXACTLY once between <exact> tags now — every word. Then WAIT.\n" +
        `<exact>${scriptAtArm || exactAtArm}</exact>`;
      sendClientText(withPart2McqExactSpeakRule(outbound), { force: true });
      dbg("part2 mcq missing-script repair", exactAtArm.slice(0, 48));
      armSilentReplyWatch(lastPendingUserText || `mcq-repair:${exactAtArm.slice(0, 24)}`, {
        fromVoice: false,
        mode: "mcq",
        replayOutbound: outbound,
        replaySent: true,
        autoPoked: true,
        initialPhase: 1,
        initialDelay: REPLY_WATCH_RETRY_MS,
      });
    }, "part2-mcq-script-repair");
  }, waitMs);
}

function noteMcqBeatLiveStt(chunk) {
  const c = String(chunk || "").trim();
  if (!c) return;
  mcqBeatLiveStt = pickTranscriptChunk(mcqBeatLiveStt, c, { finished: false });
}

function looksLikePriorAnswerPraiseStt(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  // Specific prior-chapter leaks (e.g. Ch4 colour praise bleeding into Ch5 open).
  if (
    /yellow glass sounds|sounds lovely|that'?s awesome|awesome!/i.test(t) &&
    !/tank wall|すいそうの\s*かべ|where do you want to put the glass/i.test(t)
  ) {
    return true;
  }
  // While the next beat/opening is seeded, generic praise is the CURRENT reaction —
  // never treat it as a prior-answer leak (that wiped よくできた from the bubble).
  if (mcqBeatDisplayLocked || handoffOpeningDisplayLocked) return false;
  return (
    /great job|nice one|you got it|すごいね|いい\s*ね|ばっちり|よくできた/i.test(t) &&
    !/tank wall|すいそうの\s*かべ|where do you want to put the glass|の\s*えいごを\s*選んでね|は\s*えいごで？/i.test(
      t
    )
  );
}

/** Short praise / JP bridge (よくできた！つぎいこう) — not a full next-beat line. */
function looksLikeWarmPraiseOnly(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 72) return false;
  if (/の\s*えいごを\s*選んでね|は\s*えいごで？|「[^」]+」/.test(t)) return false;
  return /^(?:that'?s\s+)?(?:great|amazing|awesome|nice|yes|perfect|good(?:\s+job)?|you got it)[.!！\s]*$/i.test(
    t
  ) || /^(?:やったね|ばっちり|いいね|すごい|そのとおり|よくできた)[！!。.\s]*$/i.test(t);
}

/** Reaction kids hear before the next elicit (EN or よくできた！つぎいこう…). */
function looksLikeMcqReactionBridge(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 96) return false;
  if (/の\s*えいごを\s*選んでね|は\s*えいごで？|「[^」]{2,}」/.test(t)) return false;
  if (looksLikeWarmPraiseOnly(t)) return true;
  if (
    /(?:よくでき|やったね|ばっちり|すごい|いいね|そのとおり|great|amazing|nice|awesome|yes|perfect|good\s+job)/i.test(
      t
    ) &&
    /(?:つぎ|next|いこう|いきましょう|let'?s go)/i.test(t)
  ) {
    return true;
  }
  return false;
}

function assistantHasReactionPrefix(liveText, seededScript) {
  const live = String(liveText || "").trim();
  const seed = String(seededScript || "").trim();
  if (!live) return false;
  if (looksLikeMcqReactionBridge(live)) return true;
  if (!seed) return false;
  const nl = normalizePart2ScriptCompare(live);
  const ns = normalizePart2ScriptCompare(seed);
  if (!ns || !nl.includes(ns)) return false;
  return nl.length > ns.length + 4;
}

/**
 * Merge early Live praise onto the seeded next-beat script so the transcript
 * matches what kids hear (reaction + exact elicit), not script-only.
 */
function mergeMcqPraiseWithSeededScript(stt, seededScript) {
  const live = String(stt || "").trim();
  const seed = String(seededScript || "").trim();
  if (!live || !seed) return "";
  if (assistantLiveIncludesScript(live, seed)) {
    return clampMcqLiveTranscript(live, seed, seed) || seed;
  }
  if (looksLikeMcqReactionBridge(live) || looksLikeWarmPraiseOnly(live)) {
    const nl = normalizePart2ScriptCompare(live);
    const ns = normalizePart2ScriptCompare(seed);
    if (ns.startsWith(nl)) return seed;
    const praise = live.replace(/[.…]+$/u, "").replace(/[.!！]+$/u, "!").trim();
    return `${praise} ${seed}`.replace(/\s+/g, " ").trim();
  }
  // "Great! Your tank looked…" before Japanese elicit lands in STT.
  const lead = seed.replace(/\s+/g, " ").trim().slice(0, 18);
  if (lead.length < 8) return "";
  const idx = live.toLowerCase().indexOf(lead.slice(0, 12).toLowerCase());
  if (idx > 0 && idx < 72) {
    const prefix = live.slice(0, idx).trim();
    if (prefix && !/の\s*えいごを\s*選んでね|は\s*えいごで？/.test(prefix)) {
      return `${prefix} ${seed}`.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function getExpectedAssistantSpeakLine(segment = getCurrentSegment()) {
  if (!segment) return "";
  if (segment.id === "quiz1") {
    const item = getCurrentQuiz1Item();
    return item ? quiz1ItemSpeak(item) : "";
  }
  // Part 2 mid-chapter: expected line is the CURRENT MCQ beat elicit (no praise prefix).
  if (usesPart2Architecture() && Array.isArray(segment.mcqBeats) && segment.mcqBeats.length) {
    if (mcqBeatSeededExact) return mcqBeatSeededExact;
    if (mcqBeatSeededScript) return mcqBeatSeededExact || mcqBeatSeededScript;
    const cur = getCurrentMcqBeat(segment, { unlocked: mcqUnlockFlags(segment) });
    if (cur?.beat) return resolvedPart2McqBeatSpeak(cur.beat);
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
  if (!cur) return false;

  const expected = getExpectedAssistantSpeakLine();
  if (expected && getCurrentSegment()?.id === "quiz1") {
    const item = getCurrentQuiz1Item();
    if (item && assistantQuiz1SpeakMangled(cur, item)) {
      last.text = sanitizeAssistantBubbleText(expected);
      assistantTurnTranscript = expected;
      scheduleRenderChat();
      dbg("repaired mangled quiz1 assistant bubble", cur.slice(0, 32));
      return true;
    }
  }

  if (isAssistantBubbleComplete(cur)) return false;

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
  // Repair Live/STT skip of えいご in の えいごを 選んでね.
  t = t.replace(/」\s*の\s*(?!えいごを)選んでね/g, "」の えいごを 選んでね");
  t = t.replace(/」\s*の\s*を\s*選んでね/g, "」の えいごを 選んでね");
  t = t.replace(/の\s*選んでね！/g, "の えいごを 選んでね！");
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
    /(?<!「)(?:すいそうの?\s*じゅんびが\s*できた|水槽の?\s*準備が\s*できた|さかなを\s*いれられる\s*じゅんびが\s*できた|魚を\s*入れられる\s*準備が\s*できた)(?!」)(\s*って\s*(?:英語|えいご)で)/gi,
    "「すいそうのじゅんびができた」$1"
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
  t = fixCh5Beat3Bubble(t);
  if (getCurrentSegment()?.id === "ch4") {
    t = trimCh4MakeTellRestart(t);
  }
  if (getCurrentSegment()?.id === "quiz1") {
    t = trimDuplicateAssistantQuizPrompt(t);
  }
  if (getCurrentSegment()?.id === "ch2") {
    t = trimCh2AssistantBubble(t);
  }
  if (getCurrentSegment()?.id === "ending1") {
    t = isEnding1FreeTalkActive()
      ? trimEnding1FreeTalkRestart(t)
      : trimEnding1IntroRestart(t);
  }
  // Display-only: spacing + clear duplicate greetings/questions + strip system leaks.
  return fixEnglishSpacing(
    trimDuplicateJapanesePhrases(
      stripSystemBackendSpeech(trimDuplicateHowAreYou(trimDuplicateStackedQuestions(t)))
    )
  );
}

/** Display-only: collapse make+tell STT restart after Beat B already completed once. */
function trimCh4MakeTellRestart(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  const seeded = String(ch4MakeTellSeededScript || "").trim();
  if (ch4MakeTellDisplayLocked && seeded) return seeded;
  const tellHits = [...t.matchAll(/tell me when you make one/gi)];
  const jaHits = [...t.matchAll(/つくれたら「/g)];
  if (tellHits.length >= 2) {
    t = t.slice(0, tellHits[1].index).trim();
  } else if (jaHits.length >= 2) {
    t = t.slice(0, jaHits[1].index).trim();
  } else {
    // Mid-phrase restart: "...おしえてね！ coloured glass! Tell me..."
    const mid = t.search(
      /[！!]\s*(?:colou?red\s+glass!?\s*)?(?:Tell me when you make one|つくれたら「)/i
    );
    if (mid > 40 && /つくれたら「|tell me when you make one/i.test(t.slice(0, mid))) {
      t = t.slice(0, mid + 1).trim();
    }
  }
  return t;
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
  if (
    ending1Beat.introSpeechComplete ||
    ending1Beat.freeTalk ||
    isEnding1FreeTalkActive() ||
    ending1Beat.introStaticPending ||
    ending1Beat.finaleRequested
  ) {
    return;
  }
  const t = String(chunk || "");
  if (/perfect!?\s*we made|ぱーふぇくと|remembered a lot about your aquarium/i.test(t)) {
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
  // Only the closing line counts. "おもいだせたね" is in the first sentence —
  // marking that as done sealed the intro and cut the rest of the script.
  if (
    isEnding1Part2() &&
    ending1Beat.introFirstAudioAt &&
    /chat freely|自由に会話|じゆうに\s*かいわ/i.test(t)
  ) {
    if (!ending1Beat.introHeardFishQAt) ending1Beat.introHeardFishQAt = Date.now();
    ending1Beat.introHeardFishQ = true;
    ending1Beat.autoSpoken = Math.max(ending1Beat.autoSpoken, 1);
    // Closing line heard — seal as soon as this turn's audio drains (blocks a 2nd Perfect).
    whenAssistantIdle(() => {
      if (getCurrentSegment()?.id !== "ending1") return;
      sealEnding1IntroSpeech("part2-tail-idle");
      enterEnding1FreeTalkIfReady();
      paintEndingEndButton();
      updateLessonBanner();
    }, "part2-ending-tail-seal");
  }
  if (ending1Beat.introHeardFishQ || ending1Beat.introHeardHoldOn) {
    armEnding1IntroQuietSeal();
  }
}

/** True when STT shows Turn A restarting (second Perfect), not the first play-through. */
function shouldInterruptEnding1IntroRestart(chunk) {
  const t = String(chunk || "");
  if (!t) return false;
  const trimmed = t.trim();

  if (isEnding1Part2()) {
    const perfectHits = t.match(/perfect!?|ぱーふぇくと/gi) || [];
    // Two Perfect leads in one transcript = restart of the whole intro.
    if (perfectHits.length >= 2) return true;
    // New speak starts with Perfect after we already finished (or got far into) the first play.
    const playedMs = Date.now() - (ending1Beat.introFirstAudioAt || ending1Beat.introSeededAt || 0);
    if (
      (part2EndingIntroTailHeard() || (ending1Beat.introHeardPerfect && playedMs > 12000)) &&
      /^(perfect!?|ぱーふぇくと)/i.test(trimmed) &&
      !/you'll be ready|ばっちり/i.test(trimmed)
    ) {
      return true;
    }
    return false;
  }

  const perfectEn = t.match(/perfect!?\s*we made a fish tank/gi) || [];
  const perfectJp = t.match(/ぱーふぇくと/g) || [];
  // Two Perfect leads in one transcript = restart.
  if (perfectEn.length >= 2 || perfectJp.length >= 2) return true;
  // First play-through cumulative STT still contains Perfect + fish once — never cut it.
  if (assistantSaidEnding1FishQuestion(t) && perfectEn.length < 2) return false;
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
 * Hosted playback and display are both client-owned for this beat.
 */
function seedEnding1IntroBubble() {
  const text = ending1ActiveIntroSpeak().trim();
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

function seedEnding1FinaleBubble() {
  chatMessages.push({
    type: "assistant",
    text: ending1ActiveFinaleSpeak().trim(),
    ending1StaticFinale: true,
  });
  lastAssistantBubbleAt = Date.now();
  scheduleRenderChat();
  updateLearnyThinkingUI();
  updateLessonBanner();
}

function removeEnding1FinaleBubble() {
  let index = -1;
  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    if (chatMessages[i]?.ending1StaticFinale) {
      index = i;
      break;
    }
  }
  if (index >= 0) {
    chatMessages.splice(index, 1);
    scheduleRenderChat();
  }
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
  const generation = idleGeneration;
  const minLockMs = isEnding1Part2() ? 45000 : 14000;
  const tick = () => {
    if (generation !== idleGeneration) return;
    if (getCurrentSegment()?.id !== "ending1") return;
    if (!ending1Beat.introDisplayLocked) return;
    const elapsed = Date.now() - seedAt;
    const part2AudioStarted = !isEnding1Part2() || ending1Beat.introFirstAudioAt > 0;
    if (
      ending1Beat.introStaticPending ||
      assistantIsSpeaking() ||
      elapsed < minLockMs ||
      !part2AudioStarted
    ) {
      // No PCM yet — keep waiting (cap so a dead kick can still recover via つつく).
      if (isEnding1Part2() && !part2AudioStarted && elapsed > 28000) {
        ending1Beat.introDisplayLocked = false;
        return;
      }
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

/**
 * Display-only: collapse Live short-turn restarts during ending free talk
 * (e.g. EN + ア シャーク! spoken twice before the real ひらがな).
 */
function trimEnding1FreeTalkRestart(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  t = t.replace(/([A-Za-z][^。！？!?]{8,140}[.!?])\s*\1+/gi, "$1");
  t = t.replace(/((?:[\u30A0-\u30FFー]+\s*){1,8}[!！]?)\s*\1+/g, "$1");
  const restart = /([A-Za-z][^？?]{12,160}\?)((?:[\u30A0-\u30FFー\s!！]*)?)\1/i.exec(t);
  if (!restart) return t;
  const cut = restart.index + restart[1].length + String(restart[2] || "").length;
  const head = t.slice(0, cut).trim();
  const rest = t.slice(restart.index + restart[0].length).trim();
  const jp = rest.replace(/^(?:[\u30A0-\u30FFー\s!！]+)+/, "").trim();
  return jp ? `${head} ${jp}`.trim() : head;
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
  if (storedType === "assistant" && final1DisplayLocked && getCurrentSegment()?.id === "final1") {
    ensureFinal1BubbleExact();
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
    if (msg.type === "assistant") {
      const cleaned = sanitizeAssistantDisplayText(msg.text);
      if (cleaned !== msg.text) msg.text = cleaned;
    }
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
  // Exact current MCQ already spoken — child can answer; don't keep 考え中.
  if (
    (pendingReplyMode === "mcq" || pendingReplyMode === "opening") &&
    actionableMcqPresentedSinceUserTurn()
  ) {
    return false;
  }
  // Seeded text alone is not a reply yet — keep waiting / auto-つつく armed.
  return !hasAnyAssistantActivitySinceUserTurn() || !assistantHeardSinceUserTurn();
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
  paintPokeButton();
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
  // Do NOT match Phase 2 free-talk coaches that only *mention* the fish question in context —
  // that blocked every Child said:… turn (e.g. クラゲ) after Turn A finished.
  if (
    (ending1Beat.introSpeechComplete ||
      ending1Beat.introHeardPerfect ||
      (ending1Beat.introAudioSent && !ending1Beat.introKickInFlight)) &&
    (/perfect!?\s*we made a fish tank/i.test(t) ||
      /remembered a lot about your aquarium|you'll be ready/i.test(t)) &&
    !/ENDING PHASE 2|Child said:/i.test(t)
  ) {
    dbg("sendClientText blocked; ending1 intro audio already sent", t.slice(0, 48));
    return false;
  }
  if (
    (ending1Beat.introSpeechComplete ||
      ending1Beat.introHeardPerfect ||
      (ending1Beat.introAudioSent && !ending1Beat.introKickInFlight)) &&
    /what kind of fish should we catch/i.test(t) &&
    !/ENDING PHASE 2|Child said:|already asked/i.test(t)
  ) {
    dbg("sendClientText blocked; ending1 fish-Q intro already sent", t.slice(0, 48));
    return false;
  }
  // Hard block: never send a second Ch4 make+tell exact script (ghost second audio).
  if (
    ch4MakeTellAudioSent &&
    !ch4MakeTellKickInFlight &&
    (/<exact>\s*Let'?s make .+colou?red\s+glass/i.test(t) ||
      /Beat A2\+B COMBINED/i.test(t))
  ) {
    dbg("sendClientText blocked; ch4 make+tell audio already sent", t.slice(0, 48));
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
  if (usesTemplateArchitecture(state) && seg?.id === "ch1" && (userHasNeedGlassPhrase() || userHasNeedSandPhrase())) {
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

function clearOpeningKickFallback() {
  if (!openingKickFallbackId) return;
  clearTimeout(openingKickFallbackId);
  openingKickFallbackId = null;
}

function armOpeningKickFallback(opts = {}) {
  clearOpeningKickFallback();
  const expectedSegmentId = getCurrentSegment()?.id || "";
  openingKickFallbackId = setTimeout(() => {
    openingKickFallbackId = null;
    if (openingSent || actionState !== "active" || !client?.connected) return;
    if (getCurrentSegment()?.id !== expectedSegmentId) return;
    // A setupComplete frame can be delayed or lost even though the socket is
    // usable. Force exactly one guarded opening attempt after the normal path.
    client.sessionReady = true;
    dbg("opening fallback kick", { segment: expectedSegmentId });
    kickOpeningTurn(opts);
  }, 1400);
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
      clearOpeningKickFallback();
      pendingOpeningKickOpts = null;
      return false;
    }
    const ok = forceEnding1Intro(kickOpts.reason || kickOpts.handoff ? "opening-handoff" : "opening");
    // Only lock openingSent after a successful kick so SETUP_COMPLETE→active retry works.
    if (ok) {
      openingSent = true;
      clearOpeningKickFallback();
      pendingOpeningKickOpts = null;
      blockCoachUntilUserSpeaks = false;
    } else if (ending1Beat.introAudioSent || ending1Beat.introNoteSent || ending1Beat.introSpeechComplete) {
      openingSent = true;
      clearOpeningKickFallback();
      pendingOpeningKickOpts = null;
    } else {
      dbg("ending1 opening kick failed; will retry", kickOpts.reason || "opening");
    }
    return ok;
  }
  if (getCurrentSegment(state)?.id === "quiz1" && quiz1State.cursor === 0) {
    const ok = forceQuiz1ExactOpening(kickOpts.reason || (kickOpts.handoff ? "handoff" : "opening"));
    // Claim the opening only after the exact client turn landed. SETUP_COMPLETE
    // and the fallback timer may both call here, but openingSent makes Q1 one-shot.
    if (ok) {
      openingSent = true;
      clearOpeningKickFallback();
      pendingOpeningKickOpts = null;
      blockCoachUntilUserSpeaks = false;
      armOpeningDeliveryWatch(kickOpts.reason || "quiz1-opening");
    }
    return ok;
  }
  if (getCurrentSegment(state)?.id === "final1" && final1Quiz.answered === 0) {
    const ok = forceFinal1OpenWithFirstQuestion(
      kickOpts.reason || (kickOpts.handoff ? "handoff" : "opening")
    );
    if (ok) {
      openingSent = true;
      clearOpeningKickFallback();
      pendingOpeningKickOpts = null;
      blockCoachUntilUserSpeaks = false;
      armOpeningDeliveryWatch(kickOpts.reason || "final1-opening");
    }
    return ok;
  }
  openingSent = true;
  clearOpeningKickFallback();
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
  const handoffScript = getHandoffSpeakLine(getCurrentSegment(state));
  if (handoffScript && (kickOpts.handoff || kickOpts.reason)) {
    seedHandoffOpeningBubble(handoffScript);
  } else if (getCurrentSegment(state)?.type === "warmup") {
    // Same one-bubble / one-speak gate as chapter openings — Live often restarts
    // "How are you" with no second STT line.
    seedHandoffOpeningBubble(WARMUP_OPENING_SPEAK);
  }
  const ok = sendClientText(withBeginnerSpeakRule(formatTeacherNote(nudge)), { force: true });
  if (ok) {
    armOpeningDeliveryWatch(kickOpts.reason || kickOpts.handoff || "opening");
    // Ch4 / Ch6 (and other MCQ hinges): refresh after seed cleared the gate so
    // buttons appear even if handoff finally already ran while flags were set.
    const openedId = getCurrentSegment(state)?.id || "";
    if (openedId === "ch4" || openedId === "ch6" || openedId === "ch5" || openedId === "ch3") {
      refreshChoiceBarIfNeeded();
    }
  } else {
    // Allow SETUP_COMPLETE / fallback timer to retry a failed first kick.
    openingSent = false;
  }
  return ok;
}

/**
 * Chapter openings used to send with no reply-watch. If Live dropped the turn,
 * kids saw 考え中 / a static MCQ and auto-つつく never fired.
 */
function armOpeningDeliveryWatch(reason = "opening") {
  if (actionState !== "active" && actionState !== "connecting") return;
  if (!client?.connected) return;
  const segmentId = getCurrentSegment()?.id || "";
  if (!segmentId || segmentId === "ending1") return;
  lastUserTurnAt = Date.now();
  lastPendingUserText = "";
  audioPlayer?.beginTurn?.();
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  armSilentReplyWatch(`opening:${segmentId}`, {
    fromVoice: false,
    turnKey: `opening-${segmentId}-${lastUserTurnAt}`,
    mode: "opening",
    replaySent: true,
  });
  dbg("opening delivery watch armed", { reason, segment: segmentId });
}

function sendTeacherNote(key, text, { allowRetry: _allowRetry = true } = {}) {
  // Segment advances, ending beats, and beginner JP repair may inject client_content.
  // Other coaches go through outbound prefixes on the child's turn.
  const allowed =
    key.startsWith("advance-") ||
    key.startsWith("ending1-next-") ||
    key.startsWith("ending1-auto-") ||
    key.startsWith("ending1-finale-") ||
    key.startsWith("ending1-freetalk") ||
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
  if (assistantIsSpeaking() || learnyIsBusySpeaking()) {
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
    key.startsWith("ending1-freetalk") ||
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

function runPostTurnCoachNudgesWhenSettled(attempt = 0, generation = idleGeneration) {
  if (generation !== idleGeneration) return;
  if (actionState !== "active" || !client?.connected) return;
  if (!assistantTranscriptSettled()) {
    if (attempt < 12) {
      setTimeout(
        () => runPostTurnCoachNudgesWhenSettled(attempt + 1, generation),
        350
      );
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
      voiceActivitySequence += 1;
      return;
    }
    // Child stopped speaking (local gate closed) — hand the turn to Learny now.
    if (!userActivityOpen) return;
    client.signalActivityEnd?.();
    userActivityOpen = false;
    // INPUT_TRANSCRIPTION is best-effort. Start a real turn watchdog from the
    // local gate close so speech that produced neither STT nor a model reply
    // still gets one bounded recovery attempt without adding a fake bubble.
    lastUserTurnAt = Date.now();
    lastPendingUserText = "";
    audioPlayer?.beginTurn?.();
    awaitingAssistantReply = true;
    turnEndProcessed = false;
    updateLearnyThinkingUI();
    armSilentReplyWatch("", {
      fromVoice: true,
      turnKey: `voice-activity-${voiceActivitySequence}`,
      mode: "voice-activity",
      replaySent: true,
    });
  };
}

/** Gemini audio arrives in a burst; wall-clock playback often continues after TURN_COMPLETE. */
function assistantPlaybackMsLeft() {
  try {
    return Math.max(
      0,
      audioPlayer?.getPlaybackMsRemaining?.() || 0,
      endingStaticPlaybackMsLeft()
    );
  } catch {
    return 0;
  }
}

function assistantIsSpeaking() {
  return assistantPlaybackMsLeft() > PLAYBACK_IDLE_MS;
}

/** Part 1 rule: never つつく / barge while Learny still has audible audio in flight. */
function learnyIsBusySpeaking() {
  if (assistantIsSpeaking()) return true;
  // Live packets can pause briefly mid-phrase (EN → JP) while the worklet is still playing.
  if (lastAssistantAudioAt > 0 && Date.now() - lastAssistantAudioAt < 2800) return true;
  if (lastAssistantRenderedAt > 0 && Date.now() - lastAssistantRenderedAt < 800) {
    if (assistantPlaybackMsLeft() > 0) return true;
  }
  return false;
}

function pokeButtonShouldDisable() {
  return (
    actionState !== "active" ||
    isHandoffRunning ||
    isChapterHandoff ||
    chapterTransitionActive ||
    isAutoReconnecting ||
    learnyIsBusySpeaking()
  );
}

function paintPokeButton() {
  if (!btnRetry) return;
  btnRetry.hidden = actionState === "idle";
  btnRetry.disabled = pokeButtonShouldDisable();
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

function clearPendingReplyWatch(reason = "cleared") {
  const hadWatch = Boolean(pendingReplyWatchId || replyWatchSegmentId || pendingReplyKey);
  if (pendingReplyWatchId) {
    clearTimeout(pendingReplyWatchId);
    pendingReplyWatchId = null;
  }
  pendingReplyText = "";
  pendingReplyKey = "";
  pendingReplyMode = "";
  pendingReplyReplayOutbound = "";
  pendingReplyReplaySent = false;
  replyWatchEpoch += 1;
  replyWatchAutoPoked = false;
  replyWatchSegmentId = "";
  replyWatchFromVoice = false;
  if (hadWatch) dbg("silent-watch cancelled", { reason });
}

function silentReplyDelivered(userText = pendingReplyText) {
  if (!lastUserTurnAt) return false;
  // Final1 next-cue turns need NEW audible speech — the previous cue's MCQ text
  // still matches actionableMcqPresented and used to cancel auto-つつく early.
  if (pendingReplyMode === "final1") {
    return lastAssistantRenderedAt >= lastUserTurnAt;
  }
  if (pendingReplyMode === "mcq" || pendingReplyMode === "opening") {
    // Opening/MCQ turns are delivered when the exact prompt is spoken OR audible.
    if (actionableMcqPresentedSinceUserTurn()) return true;
    if (
      pendingReplyMode === "opening" &&
      (lastAssistantRenderedAt >= lastUserTurnAt ||
        (handoffOpeningDisplayLocked && assistantHeardSinceUserTurn()) ||
        handoffOpeningSpeechSealed)
    ) {
      return true;
    }
    return false;
  }
  // Daily English free talk: a bubble+question after the child means delivery —
  // don't auto-poke / forceContinue (that doubled Learny's question).
  if (getCurrentSegment()?.id === "daily1") {
    if (lastAssistantRenderedAt >= lastUserTurnAt) return true;
    if (
      hasAssistantReplySinceUser(userText) &&
      (assistantAskedQuestion(lastAssistantText()) ||
        lastTranscriptChunkAt >= lastUserTurnAt)
    ) {
      return true;
    }
    return false;
  }
  return lastAssistantRenderedAt >= lastUserTurnAt;
}

function sealStaleAssistantPlaybackEstimate(reason = "seal") {
  const left = assistantPlaybackMsLeft();
  const sinceAudio =
    lastAssistantAudioAt > 0 ? Date.now() - lastAssistantAudioAt : 0;
  // Live often pauses 1–3s between English and Japanese while the worklet still
  // plays queued PCM. Collapsing that buffer made coaches / activity_end think
  // Learny was idle and cut her mid-sentence.
  if (sinceAudio < 4500) return false;
  if (left < 10000) return false;
  try {
    audioPlayer?.sealPlaybackEstimate?.();
  } catch {
    // ignore
  }
  if (endingAudioPlaybackEndAt > Date.now() + 10000) {
    endingAudioPlaybackEndAt = Date.now();
  }
  dbg("silent-watch sealed stale playback", { reason, left, sinceAudio });
  return true;
}

function silentReplySuppressionReason(epoch, segmentId) {
  const segment = getCurrentSegment();
  if (epoch !== replyWatchEpoch) return "stale-epoch";
  if (segment?.id !== segmentId) return "segment-change";
  if (actionState !== "active" || !client?.connected) return "not-connected";
  if (isHandoffRunning || isChapterHandoff || chapterTransitionActive) return "chapter-transition";
  if (isAutoReconnecting) return "reconnecting";
  if (
    segment?.id === "ending1" &&
    ending1Beat.finaleRequested
  ) {
    return "ending-finale";
  }
  sealStaleAssistantPlaybackEstimate("silent-watch");
  // Same hard rule as Part 1 MCQ/choice lock: never auto-つつく mid-speech.
  if (learnyIsBusySpeaking() || assistantPlaybackMsLeft() > PLAYBACK_IDLE_MS) {
    return "queued-playback";
  }
  const pendingExact = String(mcqBeatPendingExact || "").trim();
  const mcqLike = pendingReplyMode === "mcq" || pendingReplyMode === "opening";
  const latestProgress = Math.max(
    lastAssistantProgressAt,
    lastAssistantAudioAt,
    lastTranscriptChunkAt
  );
  // Seeded MCQ with no confirmed elicit: only poke when truly quiet (Part 1 style
  // active-generation wait). Do NOT poke while STT/audio progress is still fresh.
  if (mcqLike && pendingExact && !actionableMcqPresentedSinceUserTurn()) {
    if (latestProgress >= lastUserTurnAt && Date.now() - latestProgress < REPLY_PROGRESS_GRACE_MS) {
      return "active-generation";
    }
    return "";
  }
  if (latestProgress >= lastUserTurnAt && Date.now() - latestProgress < REPLY_PROGRESS_GRACE_MS) {
    return "active-generation";
  }
  return "";
}

function exposeSilentRetry(reason) {
  awaitingAssistantReply = false;
  updateLearnyThinkingUI();
  if (btnRetry) {
    btnRetry.hidden = false;
    btnRetry.title = "ラーニー先生から返事がないとき、もう一度つついてね";
  }
  // Keep Part 1 rule: never force-enable つつく while Learny is still speaking.
  paintPokeButton();
  dbg("silent-watch retry-exposed", { reason, segment: getCurrentSegment()?.id || "" });
}

function capturePendingRecovery() {
  if (!pendingReplyKey || !replyWatchSegmentId) return null;
  return {
    key: pendingReplyKey,
    text: pendingReplyText,
    segmentId: replyWatchSegmentId,
    fromVoice: replyWatchFromVoice,
    mode: pendingReplyMode,
    replayOutbound: pendingReplyReplayOutbound,
    replaySent: pendingReplyReplaySent || userTurnSentViaClientText,
    autoPoked: replyWatchAutoPoked,
    userTurnAt: lastUserTurnAt,
  };
}

function restorePendingRecovery(snapshot, { afterReconnect = false } = {}) {
  if (!snapshot || getCurrentSegment()?.id !== snapshot.segmentId) return false;
  lastUserTurnAt = snapshot.userTurnAt || Date.now();
  awaitingAssistantReply = true;
  updateLearnyThinkingUI();
  const canReplay =
    afterReconnect &&
    !snapshot.replaySent &&
    Boolean(snapshot.replayOutbound) &&
    client?.connected;
  let replaySent = snapshot.replaySent;
  if (canReplay) {
    const replayBody = String(snapshot.replayOutbound || "");
    const wrapped = /^\[MCQ\]/i.test(replayBody.trim())
      ? withPart2McqExactSpeakRule(replayBody)
      : withBeginnerSpeakRule(replayBody);
    replaySent = Boolean(sendClientText(wrapped, { force: true }));
    dbg("replayed pending child turn after reconnect", {
      key: snapshot.key,
      sent: replaySent,
    });
  }
  armSilentReplyWatch(snapshot.text, {
    fromVoice: snapshot.fromVoice,
    turnKey: snapshot.key,
    mode: snapshot.mode,
    replayOutbound: snapshot.replayOutbound,
    replaySent,
    autoPoked: snapshot.autoPoked,
    initialPhase: snapshot.autoPoked ? 1 : 0,
    initialDelay: afterReconnect ? REPLY_WATCH_RETRY_MS : REPLY_WATCH_MS,
  });
  return true;
}

function armSilentReplyWatch(
  userText,
  {
    fromVoice = false,
    turnKey = "",
    mode = fromVoice ? "voice" : "text",
    replayOutbound = "",
    replaySent = false,
    autoPoked = false,
    initialPhase = 0,
    initialDelay = REPLY_WATCH_MS,
  } = {}
) {
  clearPendingReplyWatch("new-child-turn");
  const text = String(userText || "").trim();
  const watchKey = String(turnKey || text || "").trim();
  const segmentId = getCurrentSegment()?.id || "";
  if (!watchKey || !segmentId) return;

  const epoch = ++replyWatchEpoch;
  pendingReplyText = text;
  pendingReplyKey = watchKey;
  pendingReplyMode = mode;
  pendingReplyReplayOutbound = String(replayOutbound || "");
  pendingReplyReplaySent = Boolean(replaySent);
  replyWatchSegmentId = segmentId;
  replyWatchFromVoice = Boolean(fromVoice);
  replyWatchAutoPoked = Boolean(autoPoked);

  // Seeded MCQ with no speech yet — poke sooner so kids aren't stuck on a silent bubble.
  const pendingMcqExact = String(mcqBeatPendingExact || "").trim();
  const effectiveInitialDelay =
    initialDelay === REPLY_WATCH_MS &&
    (mode === "mcq" || mode === "opening") &&
    pendingMcqExact
      ? Math.min(initialDelay, 4500)
      : initialDelay;

  const schedule = (phase, delay, stallCount = 0) => {
    pendingReplyWatchId = setTimeout(() => {
      pendingReplyWatchId = null;
      if (silentReplyDelivered(text)) {
        dbg("silent-watch recovered", { source: "delivered", phase, segment: segmentId });
        clearPendingReplyWatch("confirmed-delivery");
        clearAwaitingAssistantReply();
        return;
      }

      const suppressed = silentReplySuppressionReason(epoch, segmentId);
      if (suppressed) {
        dbg("silent-watch suppressed", {
          reason: suppressed,
          phase,
          segment: segmentId,
          stallCount,
        });
        if (["queued-playback", "active-generation"].includes(suppressed)) {
          // Never stall-break into another Speak EXACTLY while Learny is still
          // generating / playing — that caused random multi-つつく script loops.
          if (stallCount >= 6) {
            const mcqLike =
              pendingReplyMode === "mcq" || pendingReplyMode === "opening";
            if (mcqLike) {
              dbg("silent-watch stall settle", {
                reason: suppressed,
                segment: segmentId,
                heard: assistantHeardSinceUserTurn(),
                presented: actionableMcqPresentedSinceUserTurn(),
                autoPoked: replyWatchAutoPoked,
              });
              // Only treat as delivered when the elicit is confirmed — praise-only
              // audio must not cancel recovery.
              if (actionableMcqPresentedSinceUserTurn()) {
                confirmMcqBeatSpoken("stall-settle-heard");
                clearPendingReplyWatch("stall-settle-heard");
                clearAwaitingAssistantReply();
                scheduleMcqChoiceUnlock("stall-settle-heard");
                return;
              }
              // Still missing the elicit — one auto-つつく before falling back to manual.
              if (!replyWatchAutoPoked && phase === 0 && !learnyIsBusySpeaking()) {
                replyWatchAutoPoked = true;
                dbg("silent-watch stall auto-poke", { segment: segmentId });
                const fired = pokeLearny({ automatic: true, armWatch: false });
                if (fired) {
                  schedule(1, REPLY_WATCH_RETRY_MS);
                  return;
                }
              }
              if (learnyIsBusySpeaking()) {
                schedule(
                  phase,
                  Math.max(REPLY_PROGRESS_GRACE_MS, Math.min(assistantPlaybackMsLeft() + 450, 2800)),
                  stallCount
                );
                return;
              }
              clearPendingReplyWatch("stall-settle-manual");
              exposeSilentRetry("stall-settle");
              return;
            }
            dbg("silent-watch stall break", { reason: suppressed, segment: segmentId });
          } else {
            schedule(
              phase,
              Math.max(REPLY_PROGRESS_GRACE_MS, Math.min(assistantPlaybackMsLeft() + 450, 2800)),
              stallCount + 1
            );
            return;
          }
        } else {
          clearPendingReplyWatch(suppressed);
          return;
        }
      }

      if (phase === 0 && !replyWatchAutoPoked) {
        // Client already forced this MCQ script — wait only while audio is still playing.
        if (
          (pendingReplyMode === "mcq" || pendingReplyMode === "opening") &&
          (pendingReplyReplaySent || recentlyForcedSameMcqScript()) &&
          !actionableMcqPresentedSinceUserTurn() &&
          learnyIsBusySpeaking()
        ) {
          dbg("silent-watch deferred; exact speak in flight", { segment: segmentId });
          schedule(0, Math.min(REPLY_WATCH_RETRY_MS, 2800), stallCount);
          return;
        }
        if (learnyIsBusySpeaking()) {
          dbg("silent-watch deferred; learny still speaking", { segment: segmentId });
          schedule(0, Math.min(REPLY_WATCH_RETRY_MS, 2800), stallCount);
          return;
        }
        replyWatchAutoPoked = true;
        dbg("silent-watch fired", { segment: segmentId, fromVoice: replyWatchFromVoice });
        const fired =
          segmentId === "ending1" && isEnding1FreeTalkActive()
            ? nudgeEnding1FreeTalkReply(text)
            : pokeLearny({ automatic: true, armWatch: false });
        if (!fired) {
          if (learnyIsBusySpeaking()) {
            // Don't give up to manual つつく mid-speech — retry after idle.
            replyWatchAutoPoked = false;
            schedule(0, Math.min(REPLY_WATCH_RETRY_MS, 2800), stallCount);
            return;
          }
          exposeSilentRetry("auto-poke-not-sent");
          clearPendingReplyWatch("auto-poke-not-sent");
          return;
        }
        // After one auto-poke: watch for delivery only — never reconnect-replay
        // the same Speak EXACTLY (that stacked repeats).
        schedule(1, REPLY_WATCH_RETRY_MS);
        return;
      }

      dbg("silent-watch escalation", {
        segment: segmentId,
        mode: pendingReplyMode,
        resumable: Boolean(sessionResumeHandle),
      });
      // MCQ/opening already got one auto-poke — show manual つつく instead of
      // hard-reconnect + outbound replay (another full script).
      if (pendingReplyMode === "mcq" || pendingReplyMode === "opening") {
        clearPendingReplyWatch("auto-poke-give-up");
        exposeSilentRetry("auto-poke-give-up");
        return;
      }
      if (sessionResumeHandle && !isAutoReconnecting) {
        void resumeSessionAfterDrop();
      } else {
        clearPendingReplyWatch("auto-poke-failed");
        exposeSilentRetry("auto-poke-failed");
      }
    }, delay);
  };

  dbg("silent-watch armed", {
    segment: segmentId,
    fromVoice: replyWatchFromVoice,
    mode: pendingReplyMode,
    delay: effectiveInitialDelay,
    pendingMcq: Boolean(pendingMcqExact),
  });
  schedule(initialPhase, effectiveInitialDelay);
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
  // Part 1 scripted coaches only — Part 2 shares segment ids (ch1…) with different content.
  if (usesPart2Architecture()) {
    if (seg?.id === "ch1") {
      const cur = getCurrentMcqBeat(seg, { unlocked: mcqUnlockFlags(seg) });
      const exact = resolvedPart2McqBeatSpeak(cur?.beat) || PART2_CH1_BEAT1_SPEAK;
      return (
        " Part 2 Ch1: Speak EXACTLY the current beat word-for-word: " +
        exact +
        " — WAIT for 4-choice tap. FORBIDDEN: paraphrasing / translating the English lead / What do I need to make a tank / glass / sand."
      );
    }
    if (seg?.id === "ch5") {
      const hasCount = part2Ch5FishCountReady();
      if (!hasCount || part2Ch5OnFishCountPicker(seg)) {
        return (
          " Part 2 Ch5 Beat A1: Speak EXACTLY: " +
          PART2_CH5_BEAT1_SPEAK +
          " Then WAIT for a number button tap (1–10). FORBIDDEN: inventing a count / skipping to There are N fish."
        );
      }
      const cur = getCurrentMcqBeat(seg, { unlocked: mcqUnlockFlags(seg) });
      const exact = resolvedPart2McqBeatSpeak(cur?.beat) || "";
      return (
        " Part 2 Ch5: short reaction + EXACT current MCQ script: " +
        (exact || "current fish-count beat") +
        " — WAIT for 4-choice tap."
      );
    }
    return "";
  }
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
      return (
        " Ch5: elicit Beat 3 Are you done making it? " +
        PART1_ELICIT_JA.ch5MadeTank +
        " → I made a tank! FORBIDDEN: 「すいそうを つくってる」 (Beat2 only). FORBIDDEN: say it yourself / praise-only / skip えいごを."
      );
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
      return " Ch6: elicit Beat 4 Is the tank ready for the fishes to swim? " + PART1_ELICIT_JA.ch6TankReady + " → My tank is ready! FORBIDDEN: Almost after I'm done!";
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
    !pendingReplyKey ||
    (pendingReplyMode === "mcq" || pendingReplyMode === "opening"
      ? silentReplyDelivered()
      : hasAnyAssistantActivitySinceUserTurn());
  // Ending auto/finale chains must run even while audio is draining — do this
  // before we mark "waiting for child", which blocks other coaches.
  if (getCurrentSegment()?.id === "ending1") {
    maybeChainEnding1AutoBeat();
    maybeChainEnding1FinaleBeat();
    maybeEnding1OffScriptNudge();
  }
  // Chapter openings: TURN_COMPLETE after first audio → seal so a ghost restart cannot play.
  if (
    handoffOpeningDisplayLocked &&
    !handoffOpeningSpeechSealed &&
    (handoffOpeningFirstAudioAt || assistantHeardSinceUserTurn())
  ) {
    armHandoffOpeningQuietSeal();
  }
  if (gotReply) {
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    scheduleMcqChoiceUnlock("unlock-mcq-after-reply");
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

/** True only after this child turn's audio reached the output callback. */
function hasAnyAssistantActivitySinceUserTurn() {
  if (!lastUserTurnAt) return false;
  return lastAssistantRenderedAt >= lastUserTurnAt;
}

function normalizePresentedMcqText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "");
}

function currentActionableMcqPrompts(segment = getCurrentSegment()) {
  if (!segment) return [];
  if (segment.id === "quiz1") {
    const item = getCurrentQuiz1Item();
    return item ? [quiz1ItemSpeak(item)] : [];
  }
  if (segment.id === "final1" && segment.input === "speak_or_click") {
    const displayed = getDisplayedFinal1Item();
    const item = displayed?.item || getCurrentFinal1Item();
    return item
      ? [item.promptEn, item.promptHira, item.promptJa].filter(Boolean)
      : [];
  }
  if (isCh2FreeTalkUi() || isCh4FreeTalkUi()) return [];
  const cur = getCurrentMcqBeat(segment, { unlocked: mcqUnlockFlags(segment) });
  if (!cur?.beat) return [];
  const memories = loadLessonState().memories || {};
  return [
    expandMcqPlaceholders(cur.beat.learnyEn || "", memories),
    expandMcqPlaceholders(cur.beat.learnyJa || "", memories),
  ].filter(Boolean);
}

function isLastAssistantMcqSeeded() {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].type === "assistant") {
      return Boolean(chatMessages[i].mcqSeeded);
    }
  }
  return false;
}

/** True when Learny has actually been heard for the current turn (not just a seeded bubble). */
function assistantHeardSinceUserTurn() {
  if (!lastUserTurnAt) return false;
  return (
    lastAssistantAudioAt >= lastUserTurnAt ||
    lastAssistantRenderedAt >= lastUserTurnAt
  );
}

/** True when a post-child OUTPUT_TRANSCRIPTION contains the exact active MCQ. */
function actionableMcqPresentedSinceUserTurn() {
  if (!lastUserTurnAt) return false;
  const pendingExact = String(mcqBeatPendingExact || "").trim();
  // Mid-chapter Part 2 (and any seeded beat): bubble text ≠ spoken delivery.
  if (pendingExact) {
    const audioHeard =
      lastAssistantAudioAt >= lastUserTurnAt || lastAssistantRenderedAt >= lastUserTurnAt;
    if (!audioHeard) return false;
    return assistantLiveIncludesScript(mcqBeatLiveStt, pendingExact);
  }
  const assistant = normalizePresentedMcqText(lastAssistantText());
  if (!assistant) return false;
  const promptVisible = currentActionableMcqPrompts().some((prompt) => {
    const normalized = normalizePresentedMcqText(prompt);
    return normalized.length >= 8 && assistant.includes(normalized);
  });
  if (!promptVisible) return false;

  // Client-seeded beat text is visible early for UX — it is NOT Live delivery.
  if (mcqBeatDisplayLocked || isLastAssistantMcqSeeded()) {
    if (!assistantHeardSinceUserTurn()) return false;
    const exact = String(mcqBeatSeededExact || "").trim();
    if (exact) {
      return assistantLiveIncludesScript(mcqBeatLiveStt, exact);
    }
    return false;
  }
  // Chapter-opening seed (handoff) — same rule: bubble ≠ spoken delivery.
  if (handoffOpeningDisplayLocked) {
    return assistantHeardSinceUserTurn();
  }

  if (lastTranscriptChunkAt < lastUserTurnAt) return false;
  return true;
}

function settlePresentedActionableMcq(source = "presented") {
  if (!awaitingAssistantReply) return false;
  if (pendingReplyMode !== "mcq" && pendingReplyMode !== "opening") return false;
  if (!actionableMcqPresentedSinceUserTurn()) return false;
  confirmMcqBeatSpoken(source);
  dbg("actionable mcq presented", {
    source,
    mode: pendingReplyMode,
    segment: getCurrentSegment()?.id || "",
  });
  awaitingAssistantReply = false;
  clearPendingReplyWatch("actionable-mcq-presented");
  // Do NOT clear handoffOpeningDisplayLocked here — late STT after first audio
  // was appending paraphrases (e.g. "the ocean!…") onto the exact opening script.
  // Lock clears when the child answers (addUserAnswerBubble / mcq-choice).
  updateLearnyThinkingUI();
  scheduleMcqChoiceUnlock("actionable-mcq-presented");
  return true;
}

/**
 * Re-render MCQ buttons after Learny finishes speaking. Buttons are created with
 * disabled=choicesLocked(); if we clear awaiting without re-rendering, they stay
 * stuck disabled even after audio ends.
 */
let mcqUnlockIdleTimerId = null;

function scheduleMcqChoiceUnlock(reason = "unlock") {
  if (mcqUnlockIdleTimerId) {
    clearTimeout(mcqUnlockIdleTimerId);
    mcqUnlockIdleTimerId = null;
  }
  const generation = idleGeneration;
  const attempt = (n = 0) => {
    if (generation !== idleGeneration) return;
    if (actionState !== "active") return;
    const left = assistantPlaybackMsLeft();
    const audioStale =
      lastAssistantAudioAt > 0 && Date.now() - lastAssistantAudioAt > 1400;
    if (left > PLAYBACK_IDLE_MS && !audioStale && n < 50) {
      mcqUnlockIdleTimerId = setTimeout(
        () => attempt(n + 1),
        Math.min(Math.max(80, left), 450)
      );
      return;
    }
    if (left > PLAYBACK_IDLE_MS && audioStale) {
      try {
        audioPlayer?.sealPlaybackEstimate?.();
      } catch {
        // ignore
      }
      if (endingAudioPlaybackEndAt > Date.now()) {
        endingAudioPlaybackEndAt = Date.now();
      }
      dbg("mcq unlock sealed stale playback", { reason, left });
    }
    mcqUnlockIdleTimerId = null;
    renderChoiceBar(getCurrentSegment());
    updateLearnyThinkingUI();
    paintMuteButton();
    paintPokeButton();
  };
  attempt(0);
}

function choicesLocked() {
  if (assistantIsSpeaking()) return true;
  if (!awaitingAssistantReply) return false;
  if (actionableMcqPresentedSinceUserTurn()) return false;
  // Seeded mid-chapter beat is already on screen — let kids tap while auto-つつく
  // recovers missing speech (do not keep buttons disabled forever).
  if (
    (mcqBeatDisplayLocked || isLastAssistantMcqSeeded()) &&
    (pendingReplyMode === "mcq" || pendingReplyMode === "opening")
  ) {
    return false;
  }
  // Chapter openings often arrive with paraphrased STT; once any assistant
  // transcript lands after the opening kick, allow taps.
  if (
    pendingReplyMode === "opening" &&
    lastTranscriptChunkAt >= lastUserTurnAt &&
    String(lastAssistantText() || "").trim()
  ) {
    return false;
  }
  return true;
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
  const t = String(text || "").toLowerCase();
  // Part 1 warmup bridge — build the tank together.
  if (
    /will you help|help me make|help me|いっしょに.*つく|つくれる[？?]|手伝|すいそう.*つく/i.test(
      t
    )
  ) {
    return true;
  }
  // Part 2 warmup bridge — recall the aquarium they already made.
  return /remember (the )?aquarium|aquarium you made|let'?s remember it together|すいぞくかん.*おぼえて|おもいだしてみよう|いっしょに\s*おもいだ/i.test(
    t
  );
}

/** Exact warmup → homework invite line (Part 1 tank vs Part 2 aquarium recall). */
function warmupHomeworkInviteSpeak() {
  if (usesPart2Architecture()) {
    return (
      "Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together! " +
      "そうだ！このまえ まいんくらふとで つくった すいぞくかん、おぼえてる？いっしょに おもいだしてみよう！"
    );
  }
  return (
    "Okay! Oh! Today I want to make a fish tank. Will you help me make it? " +
    "そっか！そうだ！きょうは らーにーせんせいの すいそうづくりを てつだってほしいんだ。いっしょに つくれる？"
  );
}

function warmupInviteCoachLead(snippet) {
  const quote = String(snippet || "").trim().slice(0, 40) || "their last line";
  return (
    `Short reaction that NAMES their words ("${quote}"), THEN speak the invite EXACTLY: ` +
    warmupHomeworkInviteSpeak() +
    ` Then WAIT — ANY child reply (yes/no/ok/anything) advances to Chapter 1. ` +
    `FORBIDDEN: bare Okay!/Oh!/そっか with no reaction to what they said.`
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

const WARMUP_OPENING_SPEAK =
  "Hello! How are you today? こんにちは！きょうは どうですか？";

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
  // Same "what did you do today" family (EN/JA variants)
  if (
    looksLikeWarmupAfterMoodFollowUp(assistantText) &&
    looksLikeWarmupAfterMoodFollowUp(priorAssistantText)
  ) {
    return true;
  }
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
    /\b(went|go|going|ate|eat|played|play|saw|see|watch|watched|cafe|school|park|friend|home|movie|game|swim|shop|bought|made|did|visited|study|studied|studying|homework|read|reading|drew|draw|drawing|slept|sleep|walked|walk|ran|run|cooked|cook|helped|help|worked|work|practiced|practice|english|math|lesson|class|soccer|football|baseball|piano|music|cake|grape|chocolate|vanilla|strawberry|pizza|bread|rice|fish|dog|cat|park)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /(カフェ|がっこう|こうえん|ともだち|うち|えいが|ゲーム|たべ|いった|あそ|みた|べんきょう|しゅくだい|よんだ|あるい|はしった|ケーキ|ぶどう)/i.test(
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
  // One concrete word ("grape", "minecraft") still needs a reaction before the invite.
  if (words.length === 1 && /^[a-zぁ-ん]{3,}$/i.test(words[0]) && !isWarmupMoodOrAckOnly(t)) {
    return true;
  }
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

/** Invite line index for lead-reaction / stacked-turn checks (Part 1 tank vs Part 2 aquarium). */
function warmupInviteStartIndex(text) {
  const t = String(text || "");
  if (usesPart2Architecture()) {
    return t.search(
      /oh[!,.]?\s*do you remember (the )?aquarium|let'?s remember it together|そうだ[！!].*すいぞくかん|おもいだしてみよう|すいぞくかん[、,]?\s*おぼえて/i
    );
  }
  return t.search(
    /oh[!,.]?\s*today i want|will you help me make (?:a )?fish tank|そうだ[！!].*きょうは|いっしょに\s*つくれる/i
  );
}

/** Tank/aquarium invite that starts with bare Oh! … — missing a short reaction first. */
function assistantTankInviteMissingLeadReaction(text) {
  if (!looksLikeTankInvite(text)) return false;
  const t = String(text || "").trim();
  const inviteAt = warmupInviteStartIndex(t);
  if (inviteAt < 0) return false;
  if (inviteAt === 0) return true;
  const before = t.slice(0, inviteAt).trim();
  if (before.length < 2) return true;
  // Hollow filler only — Okay!/そっか！ is NOT a real reaction to the child's words.
  if (
    /^(oh|okay|ok|nice|wow|cool|neat|そっか|そうだ|うん)[!！.。,、\s]*$/i.test(before)
  ) {
    return true;
  }
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
  // After ~3 chat replies the ending invite is allowed — but the turn must still
  // open with a real reaction when the child just shared content.
  return countWarmupUserReplies() >= 3;
}

/** Everyday chat + tank invite (or multiple questions) in one bubble — child never got to answer. */
function assistantWarmupStackedTurn(text) {
  const t = String(text || "");
  if (assistantDoubledHowAreYou(t)) return true;
  if (assistantJumpedTopicWithoutReacting(t)) return true;
  if (looksLikeTankInvite(t)) {
    if (assistantSkippedWarmupWait(t)) return true;
    if (looksLikeWarmupChatQuestion(t)) {
      const inviteAt = warmupInviteStartIndex(t);
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

/** Tank/aquarium invite + Chapter 1 in one bubble — child never got to answer. */
function assistantSkippedWarmupWait(text) {
  const t = String(text || "");
  if (!looksLikeTankInvite(t)) return false;
  if (
    looksLikeCh1Step1Question(t) ||
    /\bthank you\b.*tank|ありがとう.*(すいそう|水槽)/i.test(t) ||
    /what do i need to make a tank/i.test(t)
  ) {
    return true;
  }
  // Part 2: invite must not share a turn with Chapter 1 decoration/kelp homework.
  if (usesPart2Architecture()) {
    return (
      /decorated your tank|put kelp|put coral|ここに\s*こんぶ|の\s*えいごを\s*選んで/i.test(t)
    );
  }
  return false;
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
    const prior = assistantBeforeLastUserMessage();
    const lastQ = lastWarmupQuestionBeforeUser();
    const answeredFunOrActivityQ =
      looksLikeWarmupAfterMoodFollowUp(prior) ||
      /fun|たのしい|play anything|did you do|what did you do|きょうは なに|なにを した/i.test(
        `${lastQ} ${prior}`
      );
    // After "What did you do today?" / fun Q → nothing: never re-ask; invite from reply 2+.
    if (answeredFunOrActivityQ) {
      if (replies >= 2 || warmupTankInviteAllowedYet()) {
        return (
          `Child said "${snippet}" (no/nothing) to your activity/fun question. ` +
          `Speak EXACTLY after a short Okay! / そっか！: ${warmupHomeworkInviteSpeak()} ` +
          `Then WAIT. FORBIDDEN: What did you do today?; Did you play anything fun?; any repeat of that question.` +
          antiRepeat
        );
      }
      return (
        `Child said "${snippet}" (no/nothing) to your previous activity/fun question. Warm Okay! / そっか！だいじょうぶ！ ` +
        `Then ONE DIFFERENT short question (EN then matching ひらがな), e.g. Do you like Minecraft? まいんくらふと すき？ ` +
        `FORBIDDEN: Did you play anything fun?; What did you do today?; any question you already asked.` +
        antiRepeat
      );
    }
    if (replies >= 3 || warmupTankInviteAllowedYet()) {
      return (
        `Child said "${snippet}" (no/nothing). ` +
        warmupInviteCoachLead(snippet) +
        antiRepeat
      );
    }
    return (
      `Child said "${snippet}" (no/nothing). Warm Okay! / そっか！だいじょうぶ！ ` +
      `Then ONE DIFFERENT short question (EN then matching ひらがな), e.g. Do you like games? ゲーム すき？ ` +
      `FORBIDDEN: repeating your previous question; Did you play anything fun? if you already asked it; What did you do today? again.` +
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

  // Child shared real news — react to THAT; invite only when chat is ready (~3 replies).
  if (hasSubstantiveWarmupContent(userText)) {
    if (replies >= 3 || warmupTankInviteAllowedYet()) {
      return (
        `Child shared "${snippet}". Invite turn NOW: short warm reaction that NAMES their words, ` +
        `THEN speak EXACTLY: ${warmupHomeworkInviteSpeak()} ` +
        `Then WAIT. FORBIDDEN: bare Okay!/Oh!/そっか with no reaction; skipping the invite; another chat-only follow-up.` +
        antiRepeat
      );
    }
    return (
      `Child shared "${snippet}". Warm human reaction + ONE curious follow-up about that. ` +
      followHint +
      " FORBIDDEN: tank/aquarium invite this turn; robotic You X! What did you X?" +
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
    `Invite turn: short reaction to "${snippet}" (or warm Okay! if they said nothing), THEN speak EXACTLY: ${warmupHomeworkInviteSpeak()} ` +
    `Then WAIT — any child reply advances to Chapter 1. FORBIDDEN: bare Oh! with no reaction; skipping the invite.` +
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

  const assistant = lastAssistantText();
  const lastUser = lastUserMessageText();
  if (!lastUser.trim()) return;
  const priorAssistant = assistantBeforeLastUserMessage();
  const jumped = assistantJumpedTopicWithoutReacting(assistant, lastUser);
  const inviteNeedsLead =
    looksLikeTankInvite(assistant) && assistantTankInviteMissingLeadReaction(assistant);
  const repeatedQ =
    Boolean(priorAssistant) &&
    assistantRepeatedWarmupQuestion(assistant, priorAssistant);

  // Repair repeats BEFORE the "waiting on child" bail — a re-asked question still
  // looks like a valid wait, which previously skipped this fix entirely.
  if (repeatedQ && !looksLikeTankInvite(assistant)) {
    // Duplicate after-mood is fine only while the child has not answered it yet
    // (last user is still the mood reply). After "nothing"/any other reply, repair.
    if (
      looksLikeWarmupAfterMoodFollowUp(assistant) &&
      looksLikeWarmupAfterMoodFollowUp(priorAssistant) &&
      shouldCoachWarmupAfterMoodFollowUp(lastUser)
    ) {
      return;
    }
    const answeredActivityWithNothing =
      looksLikeWarmupNegativeReply(lastUser) ||
      (looksLikeWarmupAfterMoodFollowUp(priorAssistant) &&
        !shouldCoachWarmupAfterMoodFollowUp(lastUser));
    const note =
      "[Teacher note — do not read aloud] WRONG: you repeated the same question after the child already answered (\"" +
      lastUser.slice(0, 40) +
      "\"). Do NOT ask that again. " +
      (answeredActivityWithNothing || countWarmupUserReplies() >= 3
        ? `Warm Okay! / そっか！ then ${warmupInviteCoachLead(lastUser)} WAIT. FORBIDDEN: What did you do today?; Did you play anything fun?; repeating that question.`
        : shouldCoachWarmupAfterMoodFollowUp(lastUser)
          ? `Say EXACTLY: ${WARMUP_AFTER_MOOD_SPEAK} — never a second question; never Did you eat lunch yet? after mood.`
          : "Warm reaction to their words + ONE DIFFERENT follow-up (school? food? games? Minecraft?). FORBIDDEN: What did you do today? again; repeat the same question.");
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

  if (waitingOnChildAfterQuestion() && !assistantWarmupStackedTurn(assistant)) return;

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
      "[Teacher note — do not read aloud] WRONG: you opened the homework invite with bare Okay!/Oh! and no reaction to what the child said. " +
      "Redo in ONE turn: short reaction that NAMES \"" +
      lastUser.slice(0, 40) +
      "\", THEN the invite EXACTLY: " +
      warmupHomeworkInviteSpeak() +
      " Example: Grape cake! Yum! グレープケーキ！おいしそう！ then Oh! Do you remember… / Today I want… Then WAIT.";
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
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return "";
  dbg("warmup auto-complete", seg.id, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

/** After child says I made glass, finish ch3 → Mini quiz 1 handoff. */
function maybeCompleteCh3FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (!usesTemplateArchitecture(state) || seg?.id !== "ch3") return "";
  if (!canFinishCh3Part1(userText)) return "";
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, {
    userQuote:
      /\b(i made glass|made glass)\b/i.test(userText)
        ? userText
        : recentUserMessages()
            .slice()
            .reverse()
            .find((t) => /\b(i made glass|made glass)\b/i.test(t)) || userText,
  });
  if (!result.ok) return "";
  dbg("ch3 auto-complete", userText, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

/** After back-to-aquarium/tank bridge, finish daily1 → next chapter handoff. */
function maybeCompleteDaily1FromClient(userText = "") {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (!usesBeginnerHomeworkArchitecture(state) || seg?.id !== "daily1") return "";
  syncDaily1RalliesFromChat();
  if (assistantSaidDaily1BackToTank(lastAssistantText()) || assistantSaidDaily1BackToTank(recentAssistantMessages(6).join("\n"))) {
    if (!daily1ReadyForBackToTank()) {
      daily1Chat.backToTankSpoken = false;
      return "";
    }
    daily1Chat.backToTankSpoken = true;
  }
  if (daily1BridgeAwaitingChildReply()) {
    dbg("daily1 complete held; bridge still awaits child reply");
    return "";
  }
  if (!canCompleteDaily1Part1()) return "";
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, {
    userQuote: String(userText || lastPendingUserText || "daily english done").slice(0, 80),
  });
  if (!result.ok) return "";
  dbg("daily1 auto-complete", daily1Chat.rallies, {
    alreadyDone: Boolean(result.alreadyDone),
  });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

/** After child says I made [color] glass!, finish ch4 → Chapter 5 walls handoff. */
function maybeCompleteCh4FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (!usesTemplateArchitecture(state) || seg?.id !== "ch4") return "";
  if (!canFinishCh4Part1(userText)) return "";
  resetCh4MakeTellSpeechLocks();
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, {
    userQuote:
      userHasMadeColorGlassPhrase(userText)
        ? userText
        : recentUserMessages()
            .slice()
            .reverse()
            .find((t) => userHasMadeColorGlassPhrase(t)) || userText,
  });
  if (!result.ok) return "";
  dbg("ch4 auto-complete", userText, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

/** After child says It looks good!, finish ch5 → Daily English handoff. */
function maybeCompleteCh5FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (!usesTemplateArchitecture(state) || seg?.id !== "ch5") return "";
  if (!canFinishCh5Part1(userText)) return "";
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, {
    userQuote:
      /\b(it looks good|looks good)\b/i.test(userText)
        ? userText
        : recentUserMessages()
            .slice()
            .reverse()
            .find((t) => /\b(it looks good|looks good)\b/i.test(t)) || userText,
  });
  if (!result.ok) return "";
  dbg("ch5 auto-complete", userText, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

/** Finish Ch1 when both I need glass + I need sand are said — hand off to Chapter 2. */
function maybeCompleteCh1FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (!usesTemplateArchitecture(state) || seg?.id !== "ch1") return "";
  if (!canCompleteCh1Part1()) return "";
  // Prefer the sand phrase quote when both are done on this turn.
  const quote =
    /\b(i need sand|need sand)\b/i.test(String(userText || ""))
      ? userText
      : recentUserMessages()
          .slice()
          .reverse()
          .find((t) => /\b(i need sand|need sand)\b/i.test(t)) || userText;
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, { userQuote: quote });
  if (!result.ok) return "";
  dbg("ch1 auto-complete", quote, { alreadyDone: Boolean(result.alreadyDone) });
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  resetCh2Search();
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: quote,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

/** Finish Ch2 after English I found some sand! — hard handoff to Chapter 3 make glass. */
function maybeCompleteCh2FromClient(userText) {
  const state = loadLessonState();
  const seg = getCurrentSegment(state);
  if (!usesTemplateArchitecture(state) || seg?.id !== "ch2") return "";
  if (!canCompleteCh2Part1()) return "";
  const fromSegmentId = seg.id;
  const result = completeSegment(seg.id, { userQuote: userText });
  if (!result.ok) return "";
  dbg("ch2 auto-complete", userText, { alreadyDone: Boolean(result.alreadyDone) });
  ch2Search.phase = "done";
  try {
    if (!result.alreadyDone) questSfx.playQuestComplete();
  } catch {
    // ignore
  }
  if (
    afterSegmentAdvanced(seg.id, result, {
      lastQuote: userText,
      fromSegmentId,
    })
  ) {
    return HANDOFF_MARKER;
  }
  if (result.alreadyDone) return "";
  return buildAdvanceNudge(result.state);
}

function clearAwaitingAssistantReply() {
  awaitingAssistantReply = false;
  clearPendingReplyWatch("awaiting-cleared");
  updateLearnyThinkingUI();
}

function armPendingReplyWatch(userText, attempt = 0, { fromVoice = false } = {}) {
  return armSilentReplyWatch(userText, { fromVoice });
  /* c8 ignore next */
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
              withEndingFreeTalkSpeakRule(buildEnding1FreeTalkTurn(userText)),
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
            if (hasAssistantReplySinceUser(userText) && assistantAskedQuestion(lastAssistantText())) {
              clearAwaitingAssistantReply();
              return;
            }
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
            withEndingFreeTalkSpeakRule(buildEnding1FreeTalkTurn(userText)),
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
        // First miss: only close the audio turn. Forcing continue too early stacks on
        // Gemini's in-flight reply and doubles Learny's Daily English question.
        if (attempt === 0) {
          closeOpenAudioTurn();
          armPendingReplyWatch(userText, attempt + 1, { fromVoice: false });
          return;
        }
        if (hasAssistantReplySinceUser(userText) && assistantAskedQuestion(lastAssistantText())) {
          clearAwaitingAssistantReply();
          return;
        }
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
  let recoveryReplayOutbound = "";
  let recoveryReplaySent = false;
  const sideKey = normalizeUserText(t);
  const now = Date.now();
  if (sideKey === lastSideEffectKey && now - lastSideEffectAt < 1500) {
    dbg("side effects deduped", t.slice(0, 32));
    return;
  }
  lastSideEffectKey = sideKey;
  lastSideEffectAt = now;
  lastUserTurnAt = now;
  audioPlayer?.beginTurn?.();
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
  // Part 2 Ch5 A1: number picker owns the count — ignore free text/voice (same as Ch4 colour).
  if (part2Ch5OnFishCountPicker()) {
    addMessage("なんびきいたかはボタンで選んでね。", "system");
    refreshChoiceBarIfNeeded();
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    dbg("side effects: part2 ch5 fish-count picker only — ignore free text/voice");
    return;
  }
  // Legacy free-ask fallback (if picker beat already passed without memory).
  if (maybeAcceptPart2Ch5FishCountFromUser(t)) {
    // A2 speak was client-forced — do not freestyle / arm silent-poke on this turn.
    userTurnSentViaClientText = true;
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    dbg("side effects: part2 ch5 fishCount accepted — skip freestyle");
    return;
  }
  // Ch4 Beat A1 is colour-button only — ignore spoken/typed colour attempts.
  if (ch4ColorChoiceActive()) {
    addMessage("すきな色はボタンで選んでね。", "system");
    refreshChoiceBarIfNeeded();
    awaitingAssistantReply = false;
    updateLearnyThinkingUI();
    clearPendingReplyWatch();
    dbg("side effects: ch4 colour MCQ only — ignore free text/voice");
    return;
  }
  maybeSaveCh4FavoriteColor(t);
  if (!skipWarmup) {
    maybeCompleteWarmupFromClient(t);
  }
  // Chapter handoff owns the next spoken beat — do not arm reply-watch on the yes/agree turn.
  if (skipOutboundForHandoff || isHandoffRunning || isChapterHandoff) {
    if (
      fromVoice &&
      getCurrentSegment()?.id === "ending1" &&
      !ending1Beat.finaleRequested
    ) {
      if (isEnding1FreeTalkActive()) maybeAdvanceEnding1Beat(t);
      queueEnding1FreeTalkChildTurn(t, { source: "voice" });
      dbg("side effects: ending child turn queued during handoff");
      return;
    }
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
          if (endingFreeTalkCoach) {
            queueEnding1FreeTalkChildTurn(t, { source: "voice" });
            const dispatched = ending1FreeTalkTurnQueue.lastDispatched;
            recoveryReplayOutbound = dispatched?.text === t ? buildEnding1FreeTalkTurn(t) : "";
            recoveryReplaySent = dispatched?.text === t;
            userTurnSentViaClientText = recoveryReplaySent;
          } else {
            const voiceMaxCoach = getCurrentSegment()?.id === "daily1" ? 160 : 420;
            const voiceOutbound = buildChildOutbound(t, coach, { maxCoach: voiceMaxCoach });
            userTurnSentViaClientText = Boolean(
              sendClientText(withSegmentSpeakRule(voiceOutbound), { force: true })
            );
            recoveryReplayOutbound = voiceOutbound;
            recoveryReplaySent = userTurnSentViaClientText;
          }
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
  armSilentReplyWatch(t, {
    fromVoice,
    mode: fromVoice ? "voice-transcript" : "text",
    replayOutbound: recoveryReplayOutbound,
    replaySent: recoveryReplaySent || userTurnSentViaClientText,
  });
}

function sendUserText(text) {
  const t = String(text || "").trim();
  if (!t) return;
  const endingQueueable =
    getCurrentSegment()?.id === "ending1" &&
    !ending1Beat.finaleRequested &&
    (actionState === "active" || actionState === "connecting") &&
    (ending1Beat.introDisplayLocked ||
      ending1Beat.introAudioSent ||
      ending1Beat.freeTalk ||
      isHandoffRunning ||
      isChapterHandoff ||
      isAutoReconnecting);
  if (endingQueueable) {
    addUserAnswerBubble(t);
    assistantTranscriptOpen = false;
    turnEndProcessed = false;
    cancelAssistantTurnEnd();
    if (ending1FreeTalkSessionReady()) {
      processUserProgressSideEffects(t, {
        skipWarmup: true,
        skipCh2: true,
        skipDaily1: true,
      });
    } else if (isEnding1FreeTalkActive()) {
      maybeAdvanceEnding1Beat(t);
    }
    queueEnding1FreeTalkChildTurn(t, { source: "typed" });
    return;
  }
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
  if (ch4ColorChoiceActive()) {
    addMessage("すきな色はボタンで選んでね。", "system");
    refreshChoiceBarIfNeeded();
    return;
  }
  if (part2Ch5OnFishCountPicker()) {
    addMessage("なんびきいたかはボタンで選んでね。", "system");
    refreshChoiceBarIfNeeded();
    return;
  }

  addUserAnswerBubble(t);
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  cancelAssistantTurnEnd();
  // Text path (often with mic muted): close any open voice activity and stop
  // playback so Gemini answers the typed turn immediately.
  prepareForUserOutbound();
  lastPendingUserText = t;
  if (getCurrentSegment()?.id === "daily1") handleDaily1ChatProgress(t);
  // Legacy free-ask fallback if A1 picker is not the active beat.
  if (maybeAcceptPart2Ch5FishCountFromUser(t)) {
    return;
  }

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
    coachNote = buildEnding1OutboundCoach() || "";
  }

  // Only client-own the goodbye after 終わりにする — free talk must reach Gemini normally.
  const endingFinaleOwnedTurn =
    getCurrentSegment()?.id === "ending1" &&
    ending1Beat.finaleRequested &&
    !ending1FinaleComplete();
  const endingClientOwnedTurn = endingFinaleOwnedTurn;

  // Daily English / Ch2: keep coach payload short — long notes stall Live replies.
  const segId = getCurrentSegment()?.id;
  const maxCoach = segId === "daily1" ? 160 : segId === "ch2" ? 220 : 420;
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
      sendClientText(withSegmentSpeakRule(outbound), { force: true });
      userTurnSentViaClientText = true;
    }
  } else {
    typedSendSkippedForVoice = false;
    const sendGeneration = idleGeneration;
    const sendTurnKey = pendingReplyKey;
    const sendNow = () => {
      if (sendGeneration !== idleGeneration || sendTurnKey !== pendingReplyKey) return;
      if (actionState !== "active" || !client?.connected) return;
      userTurnSentViaClientText = Boolean(
        sendClientText(withSegmentSpeakRule(outbound), { force: true })
      );
      pendingReplyMode = "text";
      pendingReplyReplayOutbound = outbound;
      pendingReplyReplaySent = userTurnSentViaClientText;
    };
  // prepareForUserOutbound() already interrupted playback — send immediately.
  // Cap wait so a stuck playback clock cannot leave the child on 考え中.
  if (assistantIsSpeaking()) {
    whenAssistantIdle(sendNow, "typed-send");
    setTimeout(() => {
      if (sendGeneration !== idleGeneration || sendTurnKey !== pendingReplyKey) return;
      if (userTurnSentViaClientText) return;
      if (actionState !== "active" || !client?.connected) return;
      if (!outbound.trim()) return;
      dbg("typed-send safety flush");
      sendNow();
    }, segId === "daily1" ? 600 : 1200);
  } else {
    sendNow();
  }
  }
}

function configureGeminiClient(geminiClient) {
  const state = loadLessonState();
  const segmentId = getCurrentSegment(state)?.id;
  const endingPhase2 = segmentId === "ending1";
  const daily1Phase = segmentId === "daily1";
  const final1Phase = segmentId === "final1";
  geminiClient.functions = [];
  geminiClient.functionsMap = {};
  geminiClient.systemInstructions = endingPhase2
    ? buildEndingFreeTalkInstructions(state, LEVEL_INFO.id)
    : daily1Phase
      ? buildDaily1Instructions(state, LEVEL_INFO.id)
      : final1Phase
        ? buildFinal1Instructions(state, LEVEL_INFO.id)
        : buildLessonInstructions(state, LEVEL_INFO.id);
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
  if (!endingPhase2) geminiClient.addFunction(new CompleteSegmentTool());
  geminiClient.setEnableFunctionCalls(true);
  // The Final1 hard handoff clears sessionResumeHandle before this setup, so
  // Phase 2 starts fresh. Handles produced by that new short session may then
  // resume it after a network drop without losing an in-flight child turn.
  geminiClient.sessionResumptionEnabled = true;
  geminiClient.resumeHandle = sessionResumeHandle || null;
  if (endingPhase2 || daily1Phase || final1Phase) {
    ending1Timing(daily1Phase ? "daily1-prompt-configured" : final1Phase ? "final1-prompt-configured" : "prompt-configured", {
      promptChars: geminiClient.systemInstructions.length,
      segment: segmentId,
      hasFinal1Prompt: /FINAL CHALLENGE ONLY|final1 ONLY/.test(
        geminiClient.systemInstructions
      ),
      hasChapterScaffold: /CHAPTER 1 ONLY|hint → word choices/.test(
        geminiClient.systemInstructions
      ),
    });
  }
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
      const key = String(args?.key || "").trim();
      const value = String(args?.value || "").trim();
      if (key === "favoriteColor" && getCurrentSegment()?.id === "ch4" && !ch4HasFavoriteColor()) {
        queueReply(
          id,
          name,
          {
            result: "ignored",
            message:
              "Beat A1 is colour-button only. Do NOT record_memory from speech. " +
              "Colour buttons are on screen — WAIT for a tap.",
          },
          toolReplyScheduling()
        );
        refreshChoiceBarIfNeeded();
        return;
      }
      if (key === "favoriteColor" && !normalizeAllowedFavoriteColor(value)) {
        queueReply(
          id,
          name,
          {
            result: "ignored",
            message:
              "That colour is outside the lesson set. Do NOT invent Japanese for it. " +
              "Do NOT speak. Colour buttons are on screen — WAIT for a tap.",
          },
          toolReplyScheduling()
        );
        refreshChoiceBarIfNeeded();
        return;
      }
      if (key === "fishCount" && usesPart2Architecture() && getCurrentSegment()?.id === "ch5") {
        if (part2Ch5OnFishCountPicker()) {
          queueReply(
            id,
            name,
            {
              result: "ignored",
              message:
                "Number buttons (1–10) are on screen — WAIT for a tap. FORBIDDEN: inventing fishCount.",
            },
            toolReplyScheduling()
          );
          refreshChoiceBarIfNeeded();
          return;
        }
        const userSaid = lastPendingUserText || recentUserMessages(1)[0] || "";
        const parsed = parseUserFishCount(userSaid);
        if (!parsed || parsed < 1 || parsed > 10) {
          queueReply(
            id,
            name,
            {
              result: "ignored",
              message:
                "Child has NOT said a fish number (1–10) yet. Keep asking how many fish were in the tank. " +
                "FORBIDDEN: inventing fishCount / skipping the number picker.",
            },
            toolReplyScheduling()
          );
          return;
        }
        const result = recordMemory("fishCount", String(parsed));
        queueReply(
          id,
          name,
          {
            result: result.ok ? "ok" : "ignored",
            message: result.ok
              ? `Memory saved fishCount=${parsed}. Now unlock Beat A2 MCQ with that number.`
              : "Ask the child again for a number (1–10).",
          },
          toolReplyScheduling()
        );
        updateLessonBanner();
        if (result.ok) {
          renderChoiceBar(getCurrentSegment());
          const cur = getCurrentMcqBeat(getCurrentSegment(), {
            unlocked: mcqUnlockFlags(getCurrentSegment()),
          });
          if (cur?.beat && !mcqBeatPendingExact) {
            const praise = nextMcqTranscriptPraise();
            seedMcqBeatSpeakBubble(cur.beat, { praise });
            forcePart2McqAdvanceSpeak(String(userSaid).trim() || String(parsed), cur.beat, praise);
          }
        }
        return;
      }
      const result = recordMemory(args?.key, args?.value);
      queueReply(id, name, {
        result: result.ok ? "ok" : "ignored",
        message: result.ok
          ? "Memory saved. Use only this fact later."
          : result.reason === "invalid_color"
            ? "Colour not allowed. Ask the child to pick from the colour buttons."
            : "Do not invent. Ask the child again.",
      }, toolReplyScheduling());
      updateLessonBanner();
      if (result.ok && getCurrentSegment()?.id === "ch4") {
        if (key === "favoriteColor") {
          persistCh4UiState({ phase: "make", attemptedColor: "" });
        }
        renderChoiceBar(getCurrentSegment());
      }
      return;
    }
    if (name === "complete_segment") {
      let sid = args?.segment_id || args?.segmentId || getCurrentSegment().id;
      let quote = args?.user_quote || args?.userQuote || "";
      const together = Boolean(args?.said_together || args?.saidTogether);
      if (sid === "ch4" && usesTemplateArchitecture() && !userHasMadeColorGlassPhrase(quote)) {
        const color = loadLessonState()?.memories?.favoriteColor || "chosen color";
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              `Chapter 4 is NOT done. The child must say exactly I made ${color} glass! ` +
              "I put glass here, I made a tank, and answers using another color are wrong here. Stay on the color-glass question.",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch6" && usesTemplateArchitecture() && !quote && userHasTankReadyPhrase()) {
        quote =
          recentUserMessages()
            .slice()
            .reverse()
            .find(looksLikeTankReadyPhrase) || quote;
      }
      if (sid === "ch1" && usesTemplateArchitecture() && !canCompleteCh1Part1()) {
        const msg = !userHasNeedGlassPhrase()
          ? "Chapter 1 Step 1 is not done. Ask What do I need to make a tank? Something transparent and hard — wait for glass, then I need glass. Do NOT skip to sand yet."
          : "Chapter 1 Step 2 is not done. Child has not said I need sand yet. Ask To make glass in Minecraft, what do we need?";
        queueReply(id, name, { result: "not_yet", message: msg }, toolReplyScheduling());
        return;
      }
      // Part 2 MCQ chapters: never accept complete_segment until all beats are done.
      // ch5 must be included — without it Gemini finished after "three fish" and jumped
      // to Ch6 while Beat A4 (five fish) was still speaking (double bubble + wrong buttons).
      if (
        usesPart2Architecture() &&
        ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6"].includes(sid) &&
        !canCompletePart2McqSegment(sid)
      ) {
        queueReply(
          id,
          name,
          { result: "not_yet", message: part2McqCompleteBlockedMessage(sid) },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch3" && usesTemplateArchitecture() && !userHasNeedToMakeGlassPhrase()) {
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
        usesBeginnerHomeworkArchitecture() &&
        !canCompleteWarmupPart1(quote)
      ) {
        const inviteBlock = usesPart2Architecture()
          ? "Warmup NOT done. Invite turn: short reaction that NAMES their last words, THEN speak EXACTLY: " +
            "Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together! " +
            "そうだ！このまえ まいんくらふとで つくった すいぞくかん、おぼえてる？いっしょに おもいだしてみよう！ " +
            "— then STOP and WAIT. FORBIDDEN: bare Okay!/Oh! with no reaction. Any child reply after that invite completes warmup. " +
            "Do NOT combine everyday chat + aquarium invite without reacting first. " +
            "Do NOT jump to Chapter 1 / kelp / decorations until the child has replied on a later turn."
          : "Warmup NOT done. Ask: Will you help me make a fish tank? (いっしょに つくれる？) on its OWN turn — then STOP and WAIT. " +
            "Any child reply after that invite completes warmup — do NOT require yes/ok specifically. " +
            "Do NOT combine everyday chat + tank invite in one message. " +
            "Do NOT say Thank you or ask about glass/sand until the child has replied on a later turn.";
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message: inviteBlock,
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch2" && usesTemplateArchitecture() && !canCompleteCh2Part1()) {
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
      if (sid === "daily1" && usesBeginnerHomeworkArchitecture() && !canCompleteDaily1Part1()) {
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
      if (sid === "quiz1" && usesBeginnerHomeworkArchitecture() && !canCompleteQuiz1Part1()) {
        const done = countQuiz1ItemsAnswered();
        const total = getQuiz1Items().length || 3;
        const cur = getCurrentQuiz1Item();
        const orderBit = usesPart2Architecture()
          ? "Order: ここに さんごを おいた → この おさかなが ほしい → おさかなを つかまえた. FORBIDDEN: Part 1 glass/sand, oral どっち, walls, color."
          : "Order: がらすが ひつよう → すなを みつけた → がらすを つくった. FORBIDDEN: すなが ひつよう quiz, oral どっち, walls, color.";
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              `Mini quiz 1 is NOT done (${done}/${total}). Ask EXACTLY: ` +
              (cur ? quiz1ItemSpeak(cur) : "next listed item") +
              " Then WAIT for a 4-button tap. " +
              orderBit +
              " After all 3, complete_segment(quiz1) → Chapter 4.",
          },
          toolReplyScheduling()
        );
        return;
      }
      if (sid === "ch6" && usesTemplateArchitecture() && !canCompleteCh6Part1()) {
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
      if (sid === "final1" && usesBeginnerHomeworkArchitecture() && !canCompleteFinal1Part1()) {
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
              "FORBIDDEN: inventing questions, bare は えいごで？, kanji, skipping to Ending. " +
              (currentFinal1Prompt() ? `Next cue: ${currentFinal1Prompt()}` : "Open with Final challenge time! Let's go! then the first cue.") +
              " After the last item is answered, call complete_segment(final1).",
          },
          toolReplyScheduling()
        );
        // Gemini often jumps past Final after Ch6 — force the opening if still unanswered.
        if (done < 1 && getCurrentSegment()?.id === "final1") {
          setTimeout(() => {
            if (getCurrentSegment()?.id !== "final1") return;
            if (!client?.connected || actionState !== "active") return;
            if (final1Quiz.answered > 0) return;
            forceFinal1OpenWithFirstQuestion("blocked-complete-early");
          }, 350);
        }
        return;
      }
      // Part 2 ending is client-owned (Turn A→B→C). Never let Gemini skip Final → END.
      if (sid === "ending1" && usesPart2Architecture()) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message:
              "Part 2 Ending is client-owned (Turn A → wait → Turn B → wait → Turn C → wait). " +
              "Stay on the current ending script. FORBIDDEN: complete_segment(ending1) / skipping Final Challenge.",
          },
          toolReplyScheduling()
        );
        return;
      }
      // Part 1 ending requires finale to be requested and completed before segment completion.
      if (
        sid === "ending1" &&
        usesTemplateArchitecture() &&
        (!ending1Beat.finaleRequested ||
          (!ending1FinaleComplete() && !looksLikeEnding1FinalLineComplete(lastAssistantText())))
      ) {
        queueReply(
          id,
          name,
          {
            result: "not_yet",
            message: !ending1Beat.finaleRequested
              ? "Still genuine OPEN-ENDED FREE TALK. Do NOT complete_segment, suggest ending, or mention the end control. React to the child's words and ask one friendly follow-up; only an explicit 終わりにする action can advance."
              : "Ending goodbye is NOT done yet — speak the Turn C finale (わくわく + Next Minecraft… See you next time!), then complete_segment(ending1). " +
                ending1CoachHint(),
          },
          toolReplyScheduling()
        );
        return;
      }
      if (PART1_POST_QUIZ1_IDS.has(sid) && usesTemplateArchitecture() && !isQuiz1CompletedInState()) {
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
      const beforeId = getCurrentSegment()?.id || "";
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
        // Part 2 ending: auto-disconnect immediately after completion (no free-talk).
        // Part 1 ending: watch for finale completion before hang-up.
        if (usesPart2Architecture()) {
          scheduleEndCallAfterEnding();
        } else {
          ensureEnding1HangUpWatch();
        }
        return;
      }
      configureGeminiClient(client);
      const nextSeg = getCurrentSegment(result.state);
      // Replay keeps できた ids → alreadyDone; still handoff when we just left this chapter.
      const justFinishedChapter = beforeId === sid && nextSeg?.id && nextSeg.id !== sid;
      const willHandoff = justFinishedChapter && shouldHandoffAfter(sid);
      // Ending Turn A is client-forced — never also send ending1StartNudge (second Perfect!).
      const advanceMsg = willHandoff
        ? "Segment complete. Next chapter starts NOW on this session — stay silent; the client will open the next chapter."
        : result.alreadyDone
          ? "Already on the next chapter. Continue that chapter; end with one question."
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
      if (willHandoff) {
        scheduleChapterHandoff({
          reason: result.alreadyDone ? `replay-after-${sid}` : `after-${sid}`,
          lastQuote: quote,
        });
      } else if (!result.alreadyDone) {
        if (nextSeg?.id === "ending1") {
          // Client owns the intro kick (forceEnding1OpeningAfterFinal1 / kickEnding1AutoIntro).
          if (!ending1Beat.introNoteSent && ending1Beat.autoCoachSent === 0) {
            forceEnding1OpeningAfterFinal1("tool-advance");
          }
        } else {
          const advanceKey = `advance-${sid}-${result.state.segmentIndex}`;
          const generation = idleGeneration;
          setTimeout(() => {
            if (generation !== idleGeneration) return;
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
      if (
        ending1Beat.introStaticPending ||
        ending1Beat.finaleStaticPending ||
        (getCurrentSegment()?.id === "ch4" && ch4MakeTellStaticPending)
      ) {
        break;
      }
      lastAssistantProgressAt = Date.now();
      markAssistantTranscriptChunk();
      if (isMetaAssistantLeak(message.data)) break;
      if (!client?.outputAudioTranscription) {
        addMessage(message.data, "assistant");
        markChapterTransitionSpeaking();
      }
      break;
    case MultimodalLiveResponseType.AUDIO:
      if (!audioPlayer || audioPlayer.destroyed) break;
      if (ending1Beat.finaleStaticPending) {
        dbg("drop Live audio during static ending1 finale");
        try {
          audioPlayer.interrupt?.();
        } catch {
          // ignore
        }
        break;
      }
      if (shouldDropCh4MakeTellAudio()) {
        dbg("drop Live audio during ch4 make+tell");
        // Drop only — interrupting cut the hosted/Live make+tell mid-line.
        break;
      }
      // Ghost second Perfect often has ZERO STT — gate on audio packets alone.
      if (gateEnding1IntroAudioPacket() || shouldDropEnding1IntroAudio()) {
        dbg("drop ending1 duplicate Perfect audio packet");
        // Drop only — do not interrupt: interrupting wiped the still-playing buffer
        // of the first speak (same bug as handoff 選んでね！ cutoffs).
        break;
      }
      // Part 2 chapter openings: same ghost-restart pattern (one locked bubble, two speaks).
      if (gateHandoffOpeningAudioPacket() || shouldDropHandoffOpeningAudio()) {
        dbg("drop handoff opening duplicate audio packet");
        // Drop the packet only — do not interrupt: late packets after seal used to
        // cut the buffered ending of 選んでね！
        break;
      }
      lastAssistantAudioAt = Date.now();
      lastAssistantProgressAt = lastAssistantAudioAt;
      updateLearnyThinkingUI();
      paintPokeButton();
      markChapterTransitionSpeaking();
      // Browser option readout must never own the audio session while Learny speaks.
      stopChoiceSpeech();
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
          isVoiceOnlyLesson() &&
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
      // Make+tell display lock is Ch4-only. Leaving it true after handoff used to
      // swallow Chapter 5+ opening STT — kids heard Learny but saw no bubble.
      if (
        ending1Beat.introStaticPending ||
        ending1Beat.finaleStaticPending ||
        (getCurrentSegment()?.id === "ch4" &&
          (ch4MakeTellStaticPending || ch4MakeTellDisplayLocked))
      ) {
        ensureCh4MakeTellBubbleExact();
        break;
      }
      const chunk = String(message.data.text || "");
      const finished = Boolean(message.data.finished);
      if (!chunk.trim() && !finished) break;
      cancelAssistantTurnEnd();
      applyAssistantTranscriptChunk(chunk, { finished });
      lastAssistantProgressAt = Date.now();
      if (chunk.trim() || finished) markAssistantTranscriptChunk();
      if (settlePresentedActionableMcq("output-transcription-frame")) {
        refreshChoiceBarIfNeeded();
      }
      if (chunk.trim()) audioPlayer?.confirmTurnResponse?.();
      if (chunk.trim()) markChapterTransitionSpeaking();
      if (
        pendingReplyKey &&
        pendingReplyText &&
        hasAssistantReplySinceUser(pendingReplyText) &&
        lastAssistantRenderedAt < lastUserTurnAt
      ) {
        // Output transcription can precede audio or arrive with no audio at all.
        // Keep the one-shot recovery armed until the worklet renders samples.
        dbg("silent-watch transcript pending audio", {
          segment: getCurrentSegment()?.id || "",
        });
      }
      break;
    }
    case MultimodalLiveResponseType.TURN_COMPLETE:
      lastAssistantProgressAt = Date.now();
      audioPlayer?.finishTurnIngress?.();
      finishAssistantTurn();
      break;
    case MultimodalLiveResponseType.SETUP_COMPLETE:
      dbg("setup complete");
      if (getCurrentSegment()?.id === "ending1") {
        ending1Timing("session-ready");
        void resumeMicAfterEndingStaticAudio();
      }
      if (handoffKickWatchId) {
        clearTimeout(handoffKickWatchId);
        handoffKickWatchId = null;
      }
      kickOpeningTurn();
      flushEnding1QueuedChildTurn("setup-complete");
      break;
    case MultimodalLiveResponseType.TOOL_CALL: {
      const functionCalls =
        message.data.functionCalls || message.data.function_calls || [];
      handleTools(functionCalls);
      break;
    }
    case MultimodalLiveResponseType.INTERRUPTED: {
      const interruptedRecovery = capturePendingRecovery();
      const wasAudiblyDelivered = silentReplyDelivered();
      if (audioPlayer) audioPlayer.interrupt();
      assistantTranscriptOpen = false;
      cancelAssistantTurnEnd();
      scheduleRepairIncompleteAssistantBubble();
      if (interruptedRecovery && !wasAudiblyDelivered) {
        restorePendingRecovery(interruptedRecovery);
      } else if (wasAudiblyDelivered) {
        clearPendingReplyWatch("assistant-interrupted-after-audio");
        clearAwaitingAssistantReply();
      }
      break;
    }
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
  audioPlayer.onFirstSamplesRendered = ({ epoch, chunkId, samples } = {}) => {
    lastAssistantRenderedAt = Date.now();
    lastAssistantProgressAt = lastAssistantRenderedAt;
    paintPokeButton();
    if (
      getCurrentSegment()?.id === "ending1" &&
      ending1FirstOutboundAt &&
      !ending1FirstRenderedAt
    ) {
      ending1FirstRenderedAt = lastAssistantRenderedAt;
      ending1Timing("first-phase2-audible", {
        responseMs: ending1FirstRenderedAt - ending1FirstOutboundAt,
      });
    }
    dbg("audio rendered", { epoch, chunkId, samples });
    if (getCurrentSegment()?.id === "final1") {
      final1QuestionAudioReady = true;
      renderChoiceBar(getCurrentSegment());
    }
    if (
      pendingReplyKey &&
      lastAssistantRenderedAt >= lastUserTurnAt &&
      (pendingReplyMode !== "mcq" || actionableMcqPresentedSinceUserTurn())
    ) {
      dbg("silent-watch recovered", {
        source: "rendered-audio",
        segment: getCurrentSegment()?.id || "",
      });
      awaitingAssistantReply = false;
      updateLearnyThinkingUI();
      clearPendingReplyWatch("rendered-audio");
      scheduleMcqChoiceUnlock("rendered-audio");
    }
  };
  audioPlayer.onQueueDrained = ({ epoch } = {}) => {
    dbg("audio queue drained", { epoch });
    paintPokeButton();
    // Brief gaps between Live packets also fire drained — only schedule unlock;
    // scheduleMcqChoiceUnlock waits until the wall-clock estimate is idle/stale.
    if (isMcqChoiceUiActive() || pendingReplyMode === "opening" || pendingReplyMode === "mcq") {
      scheduleMcqChoiceUnlock("queue-drained");
    }
  };
  audioPlayer.setVolume(volumeLevel / 100);
}

function resetSessionScopedReliabilityState() {
  clearOpeningKickFallback();
  clearPendingReplyWatch("session-reset");
  clearLeadWatch();
  clearEnding1HangUpWatch();
  cancelAssistantTurnEnd();
  cancelScheduledRepairIncompleteAssistantBubble();
  clearPendingHandoffTimer();
  clearHandoffKickWatch();
  pendingChapterHandoff = null;
  pendingHandoffQuote = "";
  skipOutboundForHandoff = false;
  chapterHandoffArmedFor = "";
  if (ending1FinaleSpeechWatchId) {
    clearTimeout(ending1FinaleSpeechWatchId);
    ending1FinaleSpeechWatchId = null;
  }
  if (learnyThinkingHideTimer) {
    clearTimeout(learnyThinkingHideTimer);
    learnyThinkingHideTimer = null;
  }
  childTurnRequestId += 1;
  choiceSpeechRequestId += 1;
  endingAudioRequestId += 1;
  voiceActivitySequence = 0;
  lastUserTurnAt = 0;
  lastAssistantAudioAt = 0;
  lastAssistantRenderedAt = 0;
  lastAssistantProgressAt = 0;
  lastTranscriptChunkAt = 0;
  lastAssistantBubbleAt = 0;
  lastVadUserText = "";
  lastVadUserAt = 0;
  lastOutboundText = "";
  lastOutboundAt = 0;
  lastSideEffectKey = "";
  lastSideEffectAt = 0;
  postTurnNudgesForUserKey = "";
  leadWatchArmedFor = "";
  stackedSpeechInterruptedFor = "";
  coachNudgesSinceLastUserTurn = 0;
  pokeCooldownAt = 0;
  userTurnSentViaClientText = false;
  typedSendSkippedForVoice = false;
  awaitingAssistantReply = false;
  assistantTranscriptOpen = false;
  turnEndProcessed = false;
  blockCoachUntilUserSpeaks = false;
  mcqBeatPendingExact = "";
  mcqBeatMissingScriptRepairSent = false;
  mcqScriptRepairGeneration += 1;
  lastMcqExactSpeakAt = 0;
  lastMcqExactSpeakScript = "";
  sentTeacherNotes.clear();
  bumpIdleGeneration();
}

function resetVoiceSessionUI({ lessonId } = {}) {
  if (lessonId && lessonId !== getActiveLessonId()) return;
  stopChoiceSpeech();
  // Clear Ch2 runtime before disconnect can persist it. The parent has already
  // deleted lesson storage, so any write here would resurrect stale segmentUi.
  destructiveResetInProgress = true;
  resetCh2Search();
  try {
    if (actionState === "active" || actionState === "connecting") {
      disconnectAPI();
      actionState = "idle";
    }
  } finally {
    destructiveResetInProgress = false;
  }

  openingSent = false;
  sessionResumeHandle = null;
  intentionalDisconnect = false;
  postTurnNudgesForUserKey = "";
  lastPendingUserText = "";
  bannerSegmentId = "";
  ch4BeatBForceAt = 0;
  ch4LetsMakeForceAt = 0;
  ch4PickerSpokenAt = 0;
  ch4MakeTellSentAt = 0;
  ch4MakeTellUnlocked = false;
  resetCh4MakeTellSpeechLocks();
  resetDaily1Chat();
  resetFinal1Quiz();
  resetQuiz1State();
  resetEnding1Beat();
  resetSessionScopedReliabilityState();
  chatMessages = [];
  resetLearnyThinking();
  resetAssistantTurnTranscript();

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
  ch4PickerSpokenAt = 0;
  ch4MakeTellSentAt = 0;
  ch4MakeTellUnlocked = false;
  resetCh4MakeTellSpeechLocks();
  resetDaily1Chat();
  resetFinal1Quiz();
  resetQuiz1State();
  resetEnding1Beat();
  resetSessionScopedReliabilityState();
  chatMessages = [];
  resetLearnyThinking();
  resetAssistantTurnTranscript();
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
      kickOpeningTurn({ reason: "chapter-jump-fallback" });
    }, 1200);
    if (client.sessionReady) kickOpeningTurn({ reason: "chapter-jump" });
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
    flushEnding1QueuedChildTurn("handoff-complete");
    updateActionUI();
  }
}

function shouldHandoffAfter(completedSegmentId) {
  return (
    usesBeginnerHomeworkArchitecture() &&
    PART1_HANDOFF_AFTER.has(completedSegmentId)
  );
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
  const overlayActive = Boolean(questLoadingOverlay?.classList.contains("active"));
  // Always clear the MCQ gate — armMcqHandoffGate can run before beginChapterTransition
  // (Daily→Ch6 wait), and an early return here used to leave Beat 1 buttons hidden forever.
  clearMcqHandoffGate("chapter-opening-started");
  if (!chapterTransitionActive && !overlayActive) {
    renderChoiceBar(getCurrentSegment());
    updateActionUI();
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
  // Opening audio/STT arrived — never keep MCQ gated even if transition flag already cleared.
  if (!chapterTransitionActive) {
    clearMcqHandoffGate("chapter-speaking");
    renderChoiceBar(getCurrentSegment());
    return;
  }
  endChapterTransition();
}

/** True when the destination chapter's opening bubble/script is already on screen. */
function chapterOpeningLooksPresented(segmentId = getCurrentSegment()?.id) {
  const id = String(segmentId || "");
  if (!id) return false;
  if (handoffOpeningDisplayLocked || handoffOpeningSeededScript) return true;
  const t = String(lastAssistantText() || "");
  if (!t.trim()) return false;
  if (id === "ch6") {
    return /basement inside the tank|すなを\s*そこに\s*おいた|すいそうの\s*そこに\s*すなを\s*おこう/i.test(
      t
    );
  }
  if (id === "ch5") {
    return /tank wall|すいそうの\s*かべ|where do you want to put the glass/i.test(t);
  }
  if (id === "ch4") {
    return /favorite color|すきな\s*いろ/i.test(t);
  }
  if (id === "ch3") {
    return /make some glass|がらすが\s*ひつよう/i.test(t);
  }
  return false;
}

/**
 * Opening is visible and Live is connected — stale handoff hide flags must not
 * blank the MCQ panel (intermittent Daily→Ch6 / tool+client double schedule).
 */
function shouldForceShowMcqAfterOpening(segment = getCurrentSegment()) {
  if (actionState !== "active") return false;
  if (isHandoffRunning || isChapterHandoff) return false;
  return chapterOpeningLooksPresented(segment?.id);
}

function clearPendingHandoffTimer() {
  if (pendingHandoffTimer) {
    clearTimeout(pendingHandoffTimer);
    pendingHandoffTimer = null;
  }
}

function clearHandoffKickWatch() {
  if (handoffKickWatchId) {
    clearTimeout(handoffKickWatchId);
    handoffKickWatchId = null;
  }
}

function armMcqHandoffGate(segmentId) {
  blockMcqUntilChapterOpening = String(segmentId || "");
  if (blockMcqUntilChapterOpening) {
    dbg("mcq handoff gate armed", blockMcqUntilChapterOpening);
  }
}

function clearMcqHandoffGate(reason = "clear") {
  if (!blockMcqUntilChapterOpening) return;
  dbg("mcq handoff gate clear", reason, blockMcqUntilChapterOpening);
  blockMcqUntilChapterOpening = "";
}

function shouldHideMcqForHandoffGate(segment = getCurrentSegment()) {
  if (!blockMcqUntilChapterOpening) return false;
  return String(segment?.id || "") === blockMcqUntilChapterOpening;
}

function clearChapterHandoffState({ endTransition = false } = {}) {
  clearPendingHandoffTimer();
  clearHandoffKickWatch();
  pendingChapterHandoff = null;
  pendingHandoffQuote = "";
  skipOutboundForHandoff = false;
  chapterHandoffArmedFor = "";
  if (endTransition) {
    clearMcqHandoffGate("clear-handoff-state");
    endChapterTransition();
  }
}

function queueChapterHandoff(request) {
  const destinationId = String(request?.destinationId || "");
  if (!destinationId) return false;
  if (
    pendingChapterHandoff &&
    pendingChapterHandoff.destinationId !== destinationId
  ) {
    dbg("reject conflicting pending chapter handoff", {
      pending: pendingChapterHandoff.destinationId,
      requested: destinationId,
    });
    return false;
  }
  pendingChapterHandoff = {
    reason: request.reason || "handoff",
    lastQuote: String(request.lastQuote || ""),
    destinationId,
  };
  pendingHandoffQuote = pendingChapterHandoff.lastQuote;
  skipOutboundForHandoff = true;
  if (!chapterTransitionActive) beginChapterTransition(getCurrentSegment());
  dbg("queue chapter handoff", {
    reason: pendingChapterHandoff.reason,
    destination: destinationId,
    reconnecting: isAutoReconnecting,
  });
  return true;
}

async function runChapterHandoff(request) {
  if (!request?.destinationId || actionState === "idle") {
    clearChapterHandoffState({ endTransition: true });
    return false;
  }
  if (getCurrentSegment()?.id !== request.destinationId) {
    dbg("reject stale chapter handoff destination", {
      expected: request.destinationId,
      current: getCurrentSegment()?.id || "",
    });
    clearChapterHandoffState({ endTransition: true });
    return false;
  }
  if (isAutoReconnecting) return queueChapterHandoff(request);
  if (isHandoffRunning) return false;

  pendingChapterHandoff = null;
  const ok = await handoffToCurrentSegment(request);
  if (!ok) clearChapterHandoffState({ endTransition: true });
  return ok;
}

async function flushPendingChapterHandoff() {
  const request = pendingChapterHandoff;
  if (!request) return false;
  pendingChapterHandoff = null;
  return runChapterHandoff(request);
}

/**
 * After a hinge segment completes: open the next chapter on a FRESH Live session
 * (fast reconnect — reuses mic/speaker). Soft same-socket handoff was keeping the
 * full conversation history and made Learny's next opening take many seconds.
 */
function scheduleChapterHandoff({ reason, lastQuote = "" } = {}) {
  if (isHandoffRunning) return false;
  if (actionState === "idle") {
    clearChapterHandoffState({ endTransition: true });
    return false;
  }
  const destId = getCurrentSegment()?.id || "";
  // Client auto-complete + Live complete_segment often both fire at Daily→Ch6.
  // A second schedule used to re-arm the MCQ gate, cancel the wait/kick timers,
  // and leave Beat 1 hidden after the opening was already on screen.
  if (chapterHandoffArmedFor && chapterHandoffArmedFor === destId) {
    dbg("skip duplicate chapter handoff schedule", { reason, destId });
    return true;
  }
  if (
    destId &&
    actionState === "active" &&
    openingSent &&
    chapterOpeningLooksPresented(destId)
  ) {
    dbg("skip chapter handoff; opening already presented", { reason, destId });
    clearMcqHandoffGate("opening-already-presented");
    skipOutboundForHandoff = false;
    chapterHandoffArmedFor = destId;
    renderChoiceBar(getCurrentSegment());
    return false;
  }
  skipOutboundForHandoff = true;
  // Fixed hinge openings must not re-ack the prior answer (Ch4 "I made yellow glass!"
  // praise was merging into the Chapter 5 wall-opening bubble).
  const reasonStr = String(reason || "");
  const quoteForNext =
    reasonStr === "after-daily1" ||
    /^replay-after-daily1/.test(reasonStr) ||
    /^(?:after-|replay-after-)/.test(reasonStr) ||
    destId === "final1" ||
    destId === "quiz1" ||
    destId === "ending1" ||
    destId === "ch5" ||
    destId === "ch4" ||
    destId === "ch3" ||
    destId === "ch1" ||
    destId === "ch6" ||
    destId === "daily1"
      ? ""
      : String(lastQuote || "").trim();
  pendingHandoffQuote = quoteForNext;
  clearPendingHandoffTimer();
  const request = {
    reason: reason || "handoff",
    lastQuote: quoteForNext,
    destinationId: destId,
  };
  if (!request.destinationId) {
    clearChapterHandoffState({ endTransition: true });
    return false;
  }
  chapterHandoffArmedFor = request.destinationId;
  armMcqHandoffGate(request.destinationId);
  // Fresh chapter entry — never inherit a stale MCQ cursor from an earlier attempt.
  try {
    resetMcqCursor(request.destinationId);
  } catch {
    // ignore
  }
  if (request.destinationId === "ch5" && usesPart2Architecture()) {
    clearPart2Ch5FishCountGate(String(reason || "handoff-ch5"));
  }
  renderChoiceBar(getCurrentSegment());
  if (isAutoReconnecting) return queueChapterHandoff(request);

  const reasonStrForWait = String(reason || "");
  const isFinal1ToEnding =
    request.destinationId === "ending1" &&
    (reason === "after-final1" || /^replay-after-final1/.test(reasonStrForWait));
  const waitForBridgeSpeech =
    reason === "after-daily1" ||
    reason === "after-ch5" ||
    /^replay-after-daily1/.test(reasonStrForWait) ||
    /^replay-after-ch5/.test(reasonStrForWait);
  // Part 1 and Part 2 both use hosted Turn A. Start it on the current call while
  // the hard reconnect opens Phase 2 Live in parallel (do not wait for setup).
  const prewarmDuringEndingTurnA = isFinal1ToEnding;

  if (prewarmDuringEndingTurnA) {
    ending1TimingStartedAt = Date.now();
    ending1Timing("final1-complete");
    // Hosted Turn A starts on the current call immediately. The hard reconnect
    // below only replaces Live, so its network/setup work overlaps playback.
    forceEnding1OpeningAfterFinal1("prewarm-after-final1");
  } else if (isFinal1ToEnding && usesPart2Architecture()) {
    ending1TimingStartedAt = Date.now();
    ending1Timing("final1-complete");
    // Always re-kick Turn A on the fresh ending session (any final1 freestyle is cut).
    ending1Beat.part2AssistantTurn = 0;
    ending1Beat.introAudioSent = false;
    ending1Beat.introNoteSent = false;
    ending1Beat.introKickInFlight = false;
    ending1Beat.introSpeechComplete = false;
    ending1Beat.autoCoachSent = 0;
    ending1Beat.autoSpoken = 0;
    ending1Beat.lastForceAt = 0;
    ending1Beat.lastForceKind = "";
  }

  const startReconnect = () => {
    if (pendingHandoffTimer) {
      clearTimeout(pendingHandoffTimer);
      pendingHandoffTimer = null;
    }
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
    if (!prewarmDuringEndingTurnA) beginChapterTransition(getCurrentSegment());
    dbg("schedule chapter handoff", {
      reason,
      mode: prewarmDuringEndingTurnA ? "turn-a-prewarm-hard" : "fast-hard",
      quote: pendingHandoffQuote.slice(0, 40),
      waitedForSpeech: waitForBridgeSpeech,
    });
    void runChapterHandoff(request);
  };

  if (waitForBridgeSpeech) {
    // STT often shows the bridge/praise before audio finishes — don't interrupt mid-sentence.
    // Keep next-chapter MCQ hidden the whole time (segmentIndex already advanced).
    clearPendingReplyWatch();
    clearLeadWatch();
    awaitingAssistantReply = false;
    renderChoiceBar(getCurrentSegment());
    const safetyMs = Math.min(
      12000,
      Math.max(2800, estimateSpeechMs(lastAssistantText()) + 900)
    );
    dbg("handoff waiting for closing speech", { reason, safetyMs });
    let started = false;
    const startOnce = () => {
      if (started || isHandoffRunning || actionState === "idle") return;
      started = true;
      startReconnect();
    };
    whenAssistantIdle(startOnce, `handoff-${reasonStrForWait || "speech"}`);
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
    renderChoiceBar(getCurrentSegment());
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
  // Leaving Ch4 mid-lock would mute the next chapter's transcript bubbles.
  resetCh4MakeTellSpeechLocks();
  clearHandoffOpeningDisplayLock("teardown-handoff");
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
  if (isAutoReconnecting) {
    return queueChapterHandoff({
      reason,
      lastQuote,
      destinationId: getCurrentSegment()?.id || "",
    });
  }

  clearPendingReplyWatch("chapter-handoff");
  isHandoffRunning = true;
  isChapterHandoff = true;
  skipOutboundForHandoff = false;
  const quote = lastQuote || pendingHandoffQuote || "";
  pendingHandoffQuote = "";
  const endingTurnAPrewarm =
    (reason === "after-final1" || /^replay-after-final1/.test(String(reason || ""))) &&
    getCurrentSegment()?.id === "ending1";
  if (!chapterTransitionActive && !endingTurnAPrewarm) {
    beginChapterTransition(getCurrentSegment());
  }
  actionState = "connecting";
  updateActionUI();
  renderChoiceBar(getCurrentSegment());
  if (getCurrentSegment()?.id === "daily1") resetDaily1Chat();
  if (reason === "stuck_retry") {
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
      if (!isMuted && !ending1Beat.introStaticPending) {
        await audioStreamer.ensureStreaming();
        audioStreamer.resumeStreaming();
        audioStreaming = true;
      } else {
        audioStreamer.pauseStreaming();
        audioStreaming = false;
      }
    }
    actionState = "active";
    if (endingTurnAPrewarm) {
      ending1Timing("socket-open", { sessionReady: Boolean(client.sessionReady) });
    }
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
      if (endingTurnAPrewarm) ending1Timing("session-ready");
    }
    updateActionUI();
    dbg("chapter handoff done", { reason, segment: getCurrentSegment()?.id });
    // Safety: if Final→Ending prewarm/kick missed, force Turn A once the session is live.
    if (
      endingTurnAPrewarm ||
      (getCurrentSegment()?.id === "ending1" &&
        (reason === "after-final1" || /^replay-after-final1/.test(String(reason || ""))))
    ) {
      setTimeout(() => {
        if (actionState !== "active" || !client?.connected) return;
        if (getCurrentSegment()?.id !== "ending1") return;
        if (
          ending1Beat.introStaticPending ||
          ending1Beat.introSpeechComplete ||
          ending1Beat.introDisplayLocked ||
          ending1Beat.introKickInFlight
        ) {
          return;
        }
        dbg("ending1 intro safety kick after final1 handoff");
        forceEnding1OpeningAfterFinal1("handoff-safety");
      }, 1600);
    }
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
    if (endingTurnAPrewarm) endChapterTransition();
    flushEnding1QueuedChildTurn("handoff-complete");
    updateActionUI();
    // kickOpeningTurn may seed the opening + clear the MCQ gate while
    // isHandoffRunning/isChapterHandoff are still true, which hides Beat 1.
    // Refresh after those flags clear so Daily→Ch6 (and similar) show buttons.
    renderChoiceBar(getCurrentSegment());
  }
}

/**
 * Shared post-complete_segment advance: handoff at hinges, else advance teacher note.
 * Chapter replay keeps completedSegmentIds (できた history), so completeSegment
 * returns alreadyDone — still handoff when we just left that chapter for the next.
 */
function afterSegmentAdvanced(
  completedId,
  result,
  { lastQuote = "", fromSegmentId = null } = {}
) {
  if (!result?.ok) return false;
  updateLessonBanner();
  const nextId = getCurrentSegment(result.state)?.id || "";
  const justFinishedChapter =
    !result.alreadyDone || fromSegmentId === completedId;
  if (
    justFinishedChapter &&
    shouldHandoffAfter(completedId) &&
    nextId &&
    nextId !== completedId
  ) {
    return scheduleChapterHandoff({
      reason: result.alreadyDone
        ? `replay-after-${completedId}`
        : `after-${completedId}`,
      lastQuote,
    });
  }
  if (result.alreadyDone) return false;
  if (client) configureGeminiClient(client);
  return false;
}

function disconnectAPI() {
  stopChoiceSpeech();
  clearOpeningKickFallback();
  clearPendingHandoffTimer();
  clearHandoffKickWatch();
  pendingChapterHandoff = null;
  pendingHandoffQuote = "";
  skipOutboundForHandoff = false;
  chapterHandoffArmedFor = "";
  clearMcqHandoffGate("disconnect");
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
  const pendingRecovery = capturePendingRecovery();
  clearPendingReplyWatch("reconnect");
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
    if (pendingChapterHandoff) {
      clearPendingReplyWatch("reconnect-yield-to-handoff");
    } else if (pendingRecovery) {
      restorePendingRecovery(pendingRecovery, { afterReconnect: true });
    } else if (!chatMessages.some((m) => m.type === "assistant")) {
      openingSent = false;
      armOpeningKickFallback({ reason: "drop-resume-opening" });
      kickOpeningTurn();
    }
  } catch {
    bumpIdleGeneration();
    addMessage("接続が切れちゃった。もう一度スタートしてね。", "system");
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
  } finally {
    isAutoReconnecting = false;
  }
  if (pendingChapterHandoff) {
    await flushPendingChapterHandoff();
  } else {
    flushEnding1QueuedChildTurn("reconnect-complete");
  }
}

async function handleActionButton() {
  if (actionState === "connecting" || actionState === "active") {
    disconnectAPI();
    actionState = "idle";
    updateActionUI();
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
    await getEndingAudioContext().catch(() => null);
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
    armOpeningKickFallback();
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
      usesTemplateArchitecture(state)
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
/** Auto-つつく must not re-send the same Speak EXACTLY script in a tight loop. */
const AUTO_POKE_SCRIPT_DEDUP_MS = 14000;

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
function pokeLearny({ automatic = false, armWatch = false } = {}) {
  if (actionState !== "active" || !client?.connected) return false;
  if (isHandoffRunning || isChapterHandoff || isAutoReconnecting) return false;
  // Part 1 rule: never barge / re-Speak while Learny is still talking.
  if (learnyIsBusySpeaking()) {
    dbg(automatic ? "auto-poke deferred; learny speaking" : "poke blocked; learny speaking");
    paintPokeButton();
    return false;
  }
  if (!automatic && ending1FreeTalkTurnQueue.peek()) {
    if (!client.sessionReady) client.sessionReady = true;
    return flushEnding1QueuedChildTurn("manual-retry");
  }
  if (
    automatic &&
    getCurrentSegment()?.id === "ending1" &&
    (isEnding1FreeTalkActive() || ending1Beat.finaleRequested)
  ) {
    dbg("silent-watch suppressed", {
      reason: ending1Beat.finaleRequested ? "ending-finale" : "ending-free-talk",
      segment: "ending1",
    });
    return false;
  }
  if (pokeCooldownAt && Date.now() - pokeCooldownAt < POKE_COOLDOWN_MS) return false;
  pokeCooldownAt = Date.now();
  flashPokeButton();

  const seg = getCurrentSegment();
  if (!automatic) {
    const manualRecoveryText = String(
      lastPendingUserText || recentUserMessages(1)[0] || "manual-poke"
    ).trim();
    lastUserTurnAt = Date.now();
    audioPlayer?.beginTurn?.();
    awaitingAssistantReply = true;
    updateLearnyThinkingUI();
    armSilentReplyWatch(manualRecoveryText === "manual-poke" ? "" : manualRecoveryText, {
      fromVoice: false,
      turnKey: `manual-poke-${lastUserTurnAt}`,
      mode: "manual-poke",
    });
  }
  dbg(automatic ? "auto-poke learny" : "poke learny", { segment: seg?.id });
  if (!automatic) {
    notifyMcqActivity({
      type: "poke",
      level: LEVEL_INFO?.id || "beginner",
      segmentId: seg?.id || null,
      questTitle: seg?.title || seg?.id || "poke",
      source: "client",
    });
  }

  // Scripted stuck paths: prefer exact beat forces over a generic continue.
  if (automatic && (pendingReplyMode === "mcq" || pendingReplyMode === "opening")) {
    // Opening already heard once — do not Speak EXACTLY again (double audio, one bubble).
    if (
      pendingReplyMode === "opening" &&
      (handoffOpeningDisplayLocked || getCurrentSegment()?.type === "warmup") &&
      (handoffOpeningSpeechSealed || actionableMcqPresentedSinceUserTurn()) &&
      !assistantHandoffOpeningMissingEnglish(
        handoffOpeningLiveStt || lastAssistantText(),
        handoffOpeningSeededScript
      )
    ) {
      clearAwaitingAssistantReply();
      clearPendingReplyWatch("opening-already-heard");
      scheduleMcqChoiceUnlock("opening-already-heard");
      dbg("auto-poke skipped; opening already heard");
      return true;
    }
    // Only skip when the elicit itself was confirmed — praise-only packets used to
    // cancel auto-つつく and leave kids on a silent seeded bubble.
    if (actionableMcqPresentedSinceUserTurn()) {
      dbg("auto-poke skipped; mcq elicit already presented");
      confirmMcqBeatSpoken("auto-poke-already-heard");
      clearAwaitingAssistantReply();
      clearPendingReplyWatch("mcq-audio-already-heard");
      scheduleMcqChoiceUnlock("mcq-audio-already-heard");
      return true;
    }
    const cur = getCurrentMcqBeat(seg, { unlocked: mcqUnlockFlags(seg) });
    if (cur?.beat) {
      const exact = usesPart2Architecture()
        ? resolvedPart2McqBeatSpeak(cur.beat)
        : "";
      const praise = usesPart2Architecture()
        ? String(nextMcqTranscriptPraise()).trim()
        : "";
      const full = usesPart2Architecture()
        ? `${praise} ${exact}`.replace(/\s+/g, " ").trim()
        : "";
      // Still in-flight Speak EXACTLY — don't stack. Once playback is idle and a
      // few seconds have passed with no confirmed elicit, allow recovery force.
      const forceAgeMs = Date.now() - (lastMcqExactSpeakAt || 0);
      const speakStillPlaying = assistantPlaybackMsLeft() > PLAYBACK_IDLE_MS;
      if (
        recentlyForcedSameMcqScript(full || exact || mcqBeatPendingExact) &&
        (speakStillPlaying || forceAgeMs < 4500)
      ) {
        dbg("auto-poke skipped; same exact script recently forced");
        return false;
      }
      closeOpenAudioTurn();
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      if (usesPart2Architecture()) {
        if (exact) {
          mcqBeatPendingExact = exact;
          if (!mcqBeatDisplayLocked) {
            seedMcqBeatSpeakBubble(cur.beat, { praise });
          } else {
            mcqBeatSeededExact = exact;
            mcqBeatSeededScript = full;
          }
        }
        const outbound =
          "[MCQ] The current MCQ was not delivered. Speak EXACTLY once between <exact> tags — every word. Then WAIT.\n" +
          `<exact>${full || exact}</exact>`;
        noteMcqExactSpeakSent(full || exact);
        // Cancel parallel missing-script repair timers.
        mcqScriptRepairGeneration += 1;
        return sendClientText(withPart2McqExactSpeakRule(outbound), { force: true });
      }
      return sendClientText(
        withBeginnerSpeakRule(
          formatTeacherNote(
            "[Teacher note — do not read aloud] The current MCQ was not delivered. " +
              buildMcqSpeakCoach(cur.beat) +
              " Do not acknowledge or repeat an earlier accepted choice."
          )
        ),
        { force: true }
      );
    }
  }
  if (seg?.id === "final1") {
    initFinal1QuizIfNeeded();
    const quote = String(lastPendingUserText || recentUserMessages(1)[0] || "final challenge done").trim();
    if (!automatic && isFinal1QuizFinished()) {
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
        sealStaleAssistantPlaybackEstimate("final1-poke");
      } catch {
        // ignore
      }
      awaitingAssistantReply = true;
      updateLearnyThinkingUI();
      const pokeNote =
        "[Teacher note — do not read aloud] poke. Final1 — speak EXACTLY ONE turn: " +
        (automatic
          ? "brief varied praise if the child just answered, then ask ONCE: "
          : "brief ack if needed, then ask ONCE: ") +
        next +
        (final1RemainingCount() === 1 ? " (LAST question.)" : "") +
        " FORBIDDEN: inventing cues / bare は えいごで？ / staying silent." +
        beginnerTurnHint();
      return sendClientText(withBeginnerSpeakRule(formatTeacherNote(pokeNote)), {
        force: true,
      });
    }
    if (maybeCompleteFinal1FromClient(quote)) return true;
  }
  if (seg?.id === "ending1") {
    syncEnding1AutoProgress();
    syncEnding1FinaleProgress();
    if (!ending1AutoIntroComplete()) {
      if (isEnding1Part2() && ownPart2EndingIntroFromChat("poke-before-a")) {
        dbg("poke: part2 ending intro already in chat; free talk ready");
        return true;
      }
      // Never clear the one-shot gate while Turn A is playing / seeded — that re-spoke Perfect.
      if (
        ending1Beat.introDisplayLocked ||
        ending1Beat.introHeardPerfect ||
        (!isEnding1Part2() && ending1HasPerfectLeadInChat()) ||
        (isEnding1Part2() && part2EndingIntroHeardInChat()) ||
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
    const dailyUser = String(lastPendingUserText || recentUserMessages(1)[0] || "").trim();
    // Opening asked, child silent — never auto-bridge / invent the aquarium return.
    if (
      automatic &&
      daily1ChildRepliesAfterOpener() < 1 &&
      assistantSaidDaily1Opener(lastAssistantText() || recentAssistantMessages(4).join("\n"))
    ) {
      dbg("auto-poke skipped; waiting for first daily1 child reply");
      clearAwaitingAssistantReply();
      return true;
    }
    if (
      dailyUser &&
      hasAssistantReplySinceUser(dailyUser) &&
      assistantAskedQuestion(lastAssistantText())
    ) {
      dbg("poke skipped; daily1 already replied with a question");
      clearAwaitingAssistantReply();
      return true;
    }
    if (daily1ReadyForBackToTank() && !assistantSaidDaily1BackToTank(lastAssistantText())) {
      forceDaily1BackToTank("poke-bridge", { bypassCooldown: true });
      return true;
    }
    if (!automatic) {
      // Manual つつく: soft continue only if truly silent.
      return forceDaily1Continue("manual-poke") || sendClientText(
        withBeginnerSpeakRule(formatTeacherNote(buildPokeContinueNote())),
        { force: true }
      );
    }
    // Auto-poke: soft continue (guards inside forceDaily1Continue prevent doubles).
    return forceDaily1Continue("auto-poke") || true;
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
  if (user && armWatch) {
    lastPendingUserText = user;
    armSilentReplyWatch(user, { fromVoice: false });
  }
  return sendClientText(withBeginnerSpeakRule(formatTeacherNote(note)), { force: true });
}

btnRetry?.addEventListener("click", () => {
  if (actionState !== "active" || isHandoffRunning || isChapterHandoff) return;
  // Part 1 rule: ignore taps while Learny is still speaking.
  if (learnyIsBusySpeaking()) {
    paintPokeButton();
    return;
  }
  clearPendingReplyWatch("manual-poke");
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
