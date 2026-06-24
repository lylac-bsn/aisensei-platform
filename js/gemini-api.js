/**
 * Gemini Live API Utilities
 */

/** Vertex region for Gemini Live (model + Bidi WebSocket). Must match an enabled region for the project. */
const GEMINI_REGION = "us-central1";

// Response type constants
export const MultimodalLiveResponseType = {
  TEXT: "TEXT",
  AUDIO: "AUDIO",
  SETUP_COMPLETE: "SETUP COMPLETE",
  INTERRUPTED: "INTERRUPTED",
  TURN_COMPLETE: "TURN COMPLETE",
  TOOL_CALL: "TOOL_CALL",
  ERROR: "ERROR",
  INPUT_TRANSCRIPTION: "INPUT_TRANSCRIPTION",
  OUTPUT_TRANSCRIPTION: "OUTPUT_TRANSCRIPTION",
};

/**
 * Parses response messages from the Gemini Live API
 */
export class MultimodalLiveResponseMessage {
  constructor(data) {
    this.data = "";
    this.type = "";
    this.endOfTurn = false;
    this.usageMetadata = null;

    this.endOfTurn = data?.serverContent?.turnComplete;

    // Extract usage metadata from various possible locations
    this.usageMetadata = 
      data?.usageMetadata || 
      data?.serverContent?.usageMetadata ||
      data?.serverContent?.modelTurn?.usageMetadata ||
      null;

    const parts = data?.serverContent?.modelTurn?.parts;

    try {
      if (data?.setupComplete) {
        // console.log("🏁 SETUP COMPLETE response", data);
        this.type = MultimodalLiveResponseType.SETUP_COMPLETE;
      } else if (data?.serverContent?.turnComplete) {
        // console.log("🏁 TURN COMPLETE response");
        this.type = MultimodalLiveResponseType.TURN_COMPLETE;
      } else if (data?.serverContent?.interrupted) {
        // console.log("🗣️ INTERRUPTED response");
        this.type = MultimodalLiveResponseType.INTERRUPTED;
      } else if (data?.serverContent?.inputTranscription) {
        // console.log(
        //   "📝 INPUT TRANSCRIPTION:",
        //   data.serverContent.inputTranscription
        // );
        this.type = MultimodalLiveResponseType.INPUT_TRANSCRIPTION;
        this.data = {
          text: data.serverContent.inputTranscription.text || "",
          finished: data.serverContent.inputTranscription.finished || false,
        };
      } else if (data?.serverContent?.outputTranscription) {
        // console.log(
        //   "📝 OUTPUT TRANSCRIPTION:",
        //   data.serverContent.outputTranscription
        // );
        this.type = MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION;
        this.data = {
          text: data.serverContent.outputTranscription.text || "",
          finished: data.serverContent.outputTranscription.finished || false,
        };
      } else if (data?.toolCall) {
        // console.log("🎯 🛠️ TOOL CALL response", data?.toolCall);
        this.type = MultimodalLiveResponseType.TOOL_CALL;
        this.data = data?.toolCall;
      } else if (parts?.length && parts[0].text) {
        // console.log("💬 TEXT response", parts[0].text);
        this.data = parts[0].text;
        this.type = MultimodalLiveResponseType.TEXT;
      } else if (parts?.length && parts[0].inlineData) {
        // console.log("🔊 AUDIO response");
        this.data = parts[0].inlineData.data;
        this.type = MultimodalLiveResponseType.AUDIO;
      }
    } catch (e) {
      // parsing error handled silently
    }
  }
}

/**
 * Function call definition for tool use
 */
export class FunctionCallDefinition {
  constructor(name, description, parameters, requiredParameters) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.requiredParameters = requiredParameters;
  }

  functionToCall(parameters) {
    // default function call — override in subclass
  }

  getDefinition() {
    const definition = {
      name: this.name,
      description: this.description,
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
    return definition;
  }

  runFunction(parameters) {
    this.functionToCall(parameters);
  }
}

/**
 * Main Gemini Live API client
 */
export class GeminiLiveAPI {
  constructor(proxyUrl, projectId, model) {
    this.proxyUrl = proxyUrl;
    this.projectId = projectId;
    this.model = model;
    this.modelUri = `projects/${this.projectId}/locations/${GEMINI_REGION}/publishers/google/models/${this.model}`;
    this.responseModalities = ["AUDIO"];
    this.systemInstructions = "";
    this.googleGrounding = false;
    this.enableAffectiveDialog = false; // Default affective dialog
    this.voiceName = "Puck"; // Default voice
    this.temperature = 1.0; // Default temperature
    this.proactivity = { proactiveAudio: false }; // Proactivity config
    this.inputAudioTranscription = false;
    this.outputAudioTranscription = false;
    this.enableFunctionCalls = false;
    this.functions = [];
    this.functionsMap = {};
    this.previousImage = null;
    this.totalBytesSent = 0;

    // Automatic activity detection settings with defaults
    this.automaticActivityDetection = {
      disabled: false,
      silence_duration_ms: 2000,
      prefix_padding_ms: 500,
      end_of_speech_sensitivity: "END_SENSITIVITY_UNSPECIFIED",
      start_of_speech_sensitivity: "START_SENSITIVITY_UNSPECIFIED",
    };

    this.apiHost = `${GEMINI_REGION}-aiplatform.googleapis.com`;
    this.serviceUrl = `wss://${this.apiHost}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
    this.connected = false;
    this.sessionReady = false;
    this._setupSent = false;
    this._setupTimeout = null;
    this.webSocket = null;
    this.lastSetupMessage = null; // Store the last setup message

    // Default callbacks
    this.onReceiveResponse = (message) => {};

    this.onConnectionStarted = () => {};

    this.onErrorMessage = (message) => {
      this.connected = false;
    };

    this.onClose = () => {};
    this._connectResolve = null;
    this._connectReject = null;
  }

  _clearConnectPromise() {
    this._connectResolve = null;
    this._connectReject = null;
  }

  _resolveConnect() {
    if (this._connectResolve) {
      this._connectResolve();
      this._clearConnectPromise();
    }
  }

  _rejectConnect(error) {
    if (this._connectReject) {
      this._connectReject(error);
      this._clearConnectPromise();
    }
  }

  setProjectId(projectId) {
    this.projectId = projectId;
    this.modelUri = `projects/${this.projectId}/locations/${GEMINI_REGION}/publishers/google/models/${this.model}`;
  }

  setSystemInstructions(newSystemInstructions) {
    this.systemInstructions = newSystemInstructions;
  }

  setGoogleGrounding(newGoogleGrounding) {
    this.googleGrounding = newGoogleGrounding;
  }

  setResponseModalities(modalities) {
    this.responseModalities = modalities;
  }

  setVoice(voiceName) {
    this.voiceName = voiceName;
  }

  setProactivity(proactivity) {
    this.proactivity = proactivity;
  }

  setInputAudioTranscription(enabled) {
    this.inputAudioTranscription = enabled;
  }

  setOutputAudioTranscription(enabled) {
    this.outputAudioTranscription = enabled;
  }

  setEnableFunctionCalls(enabled) {
    this.enableFunctionCalls = enabled;
  }

  addFunction(newFunction) {
    this.functions.push(newFunction);
    this.functionsMap[newFunction.name] = newFunction;
  }

  callFunction(functionName, parameters) {
    const functionToCall = this.functionsMap[functionName];
    if (functionToCall) {
      functionToCall.runFunction(parameters);
    }
  }

  connect() {
    this.disconnect();
    return new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;
      this.setupWebSocketToService();
    });
  }

  disconnect() {
    this.connected = false;
    this.sessionReady = false;
    this._setupSent = false;
    if (this._setupTimeout) {
      clearTimeout(this._setupTimeout);
      this._setupTimeout = null;
    }
    this._rejectConnect(new Error("Connection closed"));

    if (!this.webSocket) return;

    const ws = this.webSocket;
    this.webSocket = null;

    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (
        ws.readyState === WebSocket.CONNECTING ||
        ws.readyState === WebSocket.OPEN
      ) {
        ws.close(1000, "Client disconnect");
      }
    } catch {
      // ignore close errors
    }
  }

  sendMessage(message) {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return false;
    this.webSocket.send(JSON.stringify(message));
    return true;
  }

  onReceiveMessage(messageEvent) {
    const messageData = JSON.parse(messageEvent.data);
    if (messageData?.setupComplete && !this.sessionReady) {
      this.sessionReady = true;
      if (this._setupTimeout) {
        clearTimeout(this._setupTimeout);
        this._setupTimeout = null;
      }
    }
    const message = new MultimodalLiveResponseMessage(messageData);
    this.onReceiveResponse(message);
  }

  setupWebSocketToService() {
    this.webSocket = new WebSocket(this.proxyUrl);

    this.webSocket.onclose = (event) => {
      this.connected = false;
      const stillConnecting = Boolean(this._connectReject);
      if (stillConnecting) {
        const reason =
          (event.reason && String(event.reason).trim()) ||
          `code ${event.code}`;
        this._rejectConnect(new Error(`WebSocket closed before open (${reason})`));
      }
      this.onClose(event);
    };

    this.webSocket.onerror = () => {
      this.connected = false;
      this._rejectConnect(new Error("WebSocket connection error"));
      this.onErrorMessage("Connection error");
    };

    this.webSocket.onopen = () => {
      this.connected = true;
      this.sessionReady = false;
      this._setupSent = false;
      this.totalBytesSent = 0;
      this.sendInitialSetupMessages();
      this.onConnectionStarted();
      this._resolveConnect();
      if (this._setupTimeout) clearTimeout(this._setupTimeout);
      this._setupTimeout = setTimeout(() => {
        this._setupTimeout = null;
        if (!this.sessionReady) this.sessionReady = true;
      }, 12000);
    };

    this.webSocket.onmessage = this.onReceiveMessage.bind(this);
  }

  getFunctionDefinitions() {
    const tools = [];

    for (let index = 0; index < this.functions.length; index++) {
      const func = this.functions[index];
      tools.push(func.getDefinition());
    }
    return tools;
  }

  sendInitialSetupMessages() {
    const serviceSetupMessage = {
      service_url: this.serviceUrl,
    };
    this.sendMessage(serviceSetupMessage);

    const tools = this.getFunctionDefinitions();

    const sessionSetupMessage = {
      setup: {
        model: this.modelUri,
        generation_config: {
          response_modalities: this.responseModalities,
          temperature: this.temperature,
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.voiceName,
              },
            },
          },
        },
        system_instruction: { parts: [{ text: this.systemInstructions }] },
        tools: { function_declarations: tools },
        proactivity: this.proactivity,

        realtime_input_config: {
          automatic_activity_detection: this.automaticActivityDetection,
        },
      },
    };

    // Add transcription config if enabled
    if (this.inputAudioTranscription) {
      sessionSetupMessage.setup.input_audio_transcription = {};
    }
    if (this.outputAudioTranscription) {
      sessionSetupMessage.setup.output_audio_transcription = {};
    }

    if (this.googleGrounding) {
      sessionSetupMessage.setup.tools.google_search = {};
      // Currently can't have both Google Search with custom tools.
      delete sessionSetupMessage.setup.tools.function_declarations;
    }

    // Add affective dialog if enabled
    if (this.enableAffectiveDialog) {
      sessionSetupMessage.setup.generation_config.enable_affective_dialog = true;
    }

    // Store the setup message for later access
    this.lastSetupMessage = sessionSetupMessage;

    this.sendMessage(sessionSetupMessage);
  }

  sendTextMessage(text) {
    const textMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text: text }],
          },
        ],
        turn_complete: true,
      },
    };
    return this.sendMessage(textMessage);
  }

  sendTextMessageWithHistory(conversationHistory, currentPrompt) {
    // Build conversation turns from history
    const historyTurns = conversationHistory.map((msg) => {
      // Map message types to API roles
      const role = msg.type === "user" || msg.type === "user-transcript" ? "user" : "model";
      return {
        role: role,
        parts: [{ text: msg.text }],
      };
    });

    // Add the current prompt as the final user turn
    const allTurns = [
      ...historyTurns,
      {
        role: "user",
        parts: [{ text: currentPrompt }],
      },
    ];

    const textMessage = {
      client_content: {
        turns: allTurns,
        turn_complete: true,
      },
    };
    
    this.sendMessage(textMessage);
  }

  sendToolResponse(name, id, responseBody = {}, scheduling = "WHEN_IDLE") {
    const response = {
      ...responseBody,
      scheduling: responseBody.scheduling || scheduling,
    };
    const message = {
      tool_response: {
        function_responses: [
          {
            id,
            name,
            response,
          },
        ],
      },
    };
    this.sendMessage(message);
  }

  sendRealtimeInputMessage(data, mime_type) {
    const message = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: mime_type,
            data: data,
          },
        ],
      },
    };
    this.sendMessage(message);
    this.addToBytesSent(data);
  }

  addToBytesSent(data) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    this.totalBytesSent += encodedData.length;
  }

  getBytesSent() {
    return this.totalBytesSent;
  }

  sendAudioMessage(base64PCM) {
    this.sendRealtimeInputMessage(base64PCM, "audio/pcm");
  }

  /**
   * After barge-in, server VAD often misses end-of-speech. Explicitly hand the
   * turn back so the model can respond to the child's interrupt utterance.
   */
  signalUserTurnComplete() {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return false;
    this.sendMessage({
      realtime_input: {
        activity_end: {},
      },
    });
    return this.sendMessage({
      client_content: {
        turn_complete: true,
      },
    });
  }

  async sendImageMessage(base64Image, mime_type = "image/jpeg") {
    this.sendRealtimeInputMessage(base64Image, mime_type);
  }
}