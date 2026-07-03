/**
 * Media Utilities - Audio and Video streaming helpers for Gemini Live API
 */

const CAPTURE_WORKLET_URL = new URL(
  "../audio-processors/capture.worklet.js",
  import.meta.url
).href;
const PLAYBACK_WORKLET_URL = new URL(
  "../audio-processors/playback.worklet.js",
  import.meta.url
).href;

/**
 * Audio Streamer - Captures and streams microphone audio
 */
export class AudioStreamer {
  constructor(geminiClient) {
    this.client = geminiClient;
    this.audioContext = null;
    this.audioWorklet = null;
    this.mediaStream = null;
    this.isStreaming = false;
    this.sampleRate = 16000; // Gemini requires 16kHz
    this.muted = false;

    // Voice gate: only stream to the API while someone is actually speaking.
    // The Live API bills all received audio (25 tokens/sec, re-billed every
    // turn), so streaming silence/game noise during long quiet stretches is
    // the biggest cost driver. Chunks are 4096 samples = 256ms each.
    this.voiceGateEnabled = true;
    // Must exceed the server VAD silence_duration_ms (2000) so the server
    // still receives the trailing silence it needs to close the user's turn.
    this.voiceGateHangoverMs = 2600;
    this.voiceGatePreRollChunks = 2; // ~512ms replayed on speech onset
    this.voiceGateMinThreshold = 0.01;
    this.voiceGateFloorFactor = 3;
    this._gateNoiseFloor = 0.004;
    this._gateLastVoiceAt = 0;
    this._gateOpen = false;
    this._gatePreRoll = [];
    this.onVoiceGateChange = (open) => {};
  }

  /**
   * Start streaming audio from microphone
   * @param {string} deviceId - Optional device ID for specific microphone
   */
  async start(deviceId = null) {
    try {
      if (!this.mediaStream?.active) {
        const audioConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

        if (deviceId) {
          audioConstraints.deviceId = { exact: deviceId };
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      }

      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)({
          sampleRate: this.sampleRate,
        });
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      if (!this.audioWorklet) {
        await this.audioContext.audioWorklet.addModule(CAPTURE_WORKLET_URL);

        this.audioWorklet = new AudioWorkletNode(
          this.audioContext,
          "audio-capture-processor"
        );

        this.audioWorklet.port.onmessage = (event) => {
          if (!this.isStreaming) return;
          if (this.muted) return;
          if (event.data.type !== "audio") return;

          const inputData = event.data.data;
          if (this._passesVoiceGate(inputData)) {
            this._sendChunk(inputData);
          }
        };

        const source = this.audioContext.createMediaStreamSource(
          this.mediaStream
        );
        source.connect(this.audioWorklet);
      }

      this.isStreaming = true;
      return true;
    } catch (error) {
      throw error;
    }
  }

  _sendChunk(inputData) {
    if (!this.client || !this.client.connected) return;
    const pcmData = this.convertToPCM16(inputData);
    const base64Audio = this.arrayBufferToBase64(pcmData);
    this.client.sendAudioMessage(base64Audio);
  }

  /**
   * Decide whether this chunk should be streamed. While quiet, chunks feed a
   * short pre-roll buffer that is flushed when speech starts so word onsets
   * aren't clipped. After speech stops, keep streaming for a hangover period
   * long enough for the server VAD to detect end-of-turn.
   */
  _passesVoiceGate(inputData) {
    if (!this.voiceGateEnabled) return true;

    let sumSquares = 0;
    for (let i = 0; i < inputData.length; i++) {
      sumSquares += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sumSquares / inputData.length);
    const threshold = Math.max(
      this.voiceGateMinThreshold,
      this._gateNoiseFloor * this.voiceGateFloorFactor
    );

    const now = Date.now();
    if (rms >= threshold) {
      this._gateLastVoiceAt = now;
    } else {
      // Track ambient loudness (mic hiss, game audio) so the threshold adapts.
      this._gateNoiseFloor = this._gateNoiseFloor * 0.95 + rms * 0.05;
    }

    const open =
      this._gateLastVoiceAt > 0 &&
      now - this._gateLastVoiceAt <= this.voiceGateHangoverMs;

    if (open && !this._gateOpen) {
      for (const buffered of this._gatePreRoll) {
        this._sendChunk(buffered);
      }
      this._gatePreRoll = [];
    } else if (!open) {
      this._gatePreRoll.push(inputData);
      if (this._gatePreRoll.length > this.voiceGatePreRollChunks) {
        this._gatePreRoll.shift();
      }
    }

    if (open !== this._gateOpen) {
      this._gateOpen = open;
      try {
        this.onVoiceGateChange(open);
      } catch {
        // listener errors must not break capture
      }
    }

    return open;
  }

  setVoiceGateEnabled(enabled) {
    this.voiceGateEnabled = Boolean(enabled);
    if (!this.voiceGateEnabled) {
      this._gatePreRoll = [];
    }
  }

  /**
   * Update the Gemini client reference (useful for reconnection)
   */
  updateClient(newClient) {
    this.client = newClient;
  }

  /** Mute is absolute: stop sending to the API AND disable the hardware tracks. */
  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.muted;
      });
    }
  }

  /** Pause sending to API without tearing down mic hardware (quest handoff). */
  pauseStreaming() {
    this.isStreaming = false;
  }

  /** Resume sending after reconnecting the API client. */
  resumeStreaming() {
    if (this.mediaStream && this.audioContext && this.audioWorklet) {
      this.isStreaming = true;
    }
  }

  get isActive() {
    return Boolean(this.isStreaming && this.mediaStream && this.audioContext);
  }

  /** Resume capture if the browser suspended the audio context. */
  async ensureStreaming() {
    if (!this.audioContext) return false;
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        return false;
      }
    }
    if (this.mediaStream?.active && this.audioWorklet && !this.isStreaming) {
      this.isStreaming = true;
    }
    return Boolean(
      this.isStreaming &&
        this.mediaStream?.active &&
        this.audioContext.state === "running"
    );
  }

  /**
   * Stop audio streaming
   */
  stop() {
    this.isStreaming = false;
    this._gateOpen = false;
    this._gateLastVoiceAt = 0;
    this._gatePreRoll = [];

    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet.port.close();
      this.audioWorklet = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

  }

  /**
   * Convert Float32Array to PCM16 Int16Array
   */
  convertToPCM16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample * 0x7fff;
    }
    return int16Array.buffer;
  }

  /**
   * Convert ArrayBuffer to base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

/**
 * Base Video Capture - Shared functionality for video/screen capture
 */
class BaseVideoCapture {
  constructor(geminiClient) {
    this.client = geminiClient;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.mediaStream = null;
    this.isStreaming = false;
    this.captureInterval = null;
    this.fps = 1; // Default 1 frame per second
    this.quality = 0.8; // Default JPEG quality
  }

  /**
   * Update the Gemini client reference (useful for reconnection)
   */
  updateClient(newClient) {
    this.client = newClient;
  }

  /**
   * Initialize canvas and video elements
   */
  initializeElements(width, height) {
    // Create video element
    this.video = document.createElement("video");
    this.video.srcObject = this.mediaStream;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    // Create canvas for frame capture
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
  }

  /**
   * Wait for video to be ready and start playing
   */
  async waitForVideoReady() {
    await new Promise((resolve) => {
      this.video.onloadedmetadata = resolve;
    });
    this.video.play();
  }

  /**
   * Start capturing and sending frames
   */
  startCapturing() {
    const captureFrame = () => {
      if (!this.isStreaming) return;

      // Draw current frame to canvas
      this.ctx.drawImage(
        this.video,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      // Convert to JPEG and send
      this.canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(",")[1];
            if (this.client && this.client.connected) {
              this.client.sendImageMessage(base64, "image/jpeg");
            }
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        this.quality
      );
    };

    // Start interval
    this.captureInterval = setInterval(captureFrame, 1000 / this.fps);
  }

  /**
   * Stop capturing
   */
  stop() {
    this.isStreaming = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Take a single snapshot
   */
  takeSnapshot() {
    if (!this.video || !this.canvas) {
      throw new Error("Video not initialized");
    }

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.toDataURL("image/jpeg", this.quality);
  }

  /**
   * Get the video element for preview
   */
  getVideoElement() {
    return this.video;
  }
}

/**
 * Video Streamer - Captures and streams camera video
 */
export class VideoStreamer extends BaseVideoCapture {
  /**
   * Start video streaming from camera
   * @param {Object} options - { fps: number, width: number, height: number, facingMode: string, quality: number, deviceId: string }
   */
  async start(options = {}) {
    try {
      const {
        fps = 1,
        width = 640,
        height = 480,
        facingMode = "user", // 'user' for front camera, 'environment' for back
        quality = 0.8,
        deviceId = null,
      } = options;

      this.fps = fps;
      this.quality = quality;

      // Build video constraints
      const videoConstraints = {
        width: { ideal: width },
        height: { ideal: height },
      };

      // Add device ID if specified, otherwise use facingMode
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = facingMode;
      }

      // Get camera access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
      });

      // Initialize video and canvas elements
      this.initializeElements(width, height);

      // Wait for video to be ready
      await this.waitForVideoReady();

      // Start capturing frames
      this.isStreaming = true;
      this.startCapturing();

      return this.video; // Return video element for preview
    } catch (error) {
      throw error;
    }
  }

  stop() {
    super.stop();
  }
}

/**
 * Audio Player - Plays audio responses from Gemini
 */
export class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;
    this.isInitialized = false;
    this.volume = 1.0;
    this.sampleRate = 24000; // Gemini outputs at 24kHz
    /** Wall-clock time (ms) when queued playback is expected to finish. */
    this.playbackEndAt = 0;
  }

  /**
   * Initialize the audio player
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Create audio context at 24kHz to match Gemini
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      // Load the audio worklet from external file
      await this.audioContext.audioWorklet.addModule(PLAYBACK_WORKLET_URL);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor"
      );

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;

      // Connect nodes
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Play audio chunk from base64 PCM
   */
  async play(base64Audio) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      // Resume audio context if suspended
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Convert base64 to Float32Array
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 LE to Float32
      const inputArray = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(inputArray.length);
      for (let i = 0; i < inputArray.length; i++) {
        float32Data[i] = inputArray[i] / 32768;
      }

      // Send to worklet for playback
      this.workletNode.port.postMessage(float32Data);

      // Audio arrives in a burst (faster than realtime), so track when playback
      // will actually finish instead of counting queued samples.
      const chunkMs = (float32Data.length / this.sampleRate) * 1000;
      const now = Date.now();
      this.playbackEndAt = Math.max(this.playbackEndAt, now) + chunkMs;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Interrupt current playback
   */
  interrupt() {
    if (this.workletNode) {
      this.workletNode.port.postMessage("interrupt");
    }
    this.playbackEndAt = 0;
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  /** Estimated ms of audio still playing (0 when playback has finished). */
  getPlaybackMsRemaining() {
    return Math.max(0, Math.ceil(this.playbackEndAt - Date.now()));
  }

  /** @deprecated prefer getPlaybackMsRemaining */
  getEstimatedPlaybackMsRemaining() {
    return this.getPlaybackMsRemaining();
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.playbackEndAt = 0;
    this.isInitialized = false;
  }
}
