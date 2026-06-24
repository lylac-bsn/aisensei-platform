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
    /** When muted, still stream mic while true so the API can detect barge-in. */
    this.bargeInStream = false;
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
          if (this.muted && !this.bargeInStream) return;

          if (event.data.type === "audio") {
            const inputData = event.data.data;
            const pcmData = this.convertToPCM16(inputData);
            const base64Audio = this.arrayBufferToBase64(pcmData);

            if (this.client && this.client.connected) {
              this.client.sendAudioMessage(base64Audio);
            }
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

  /**
   * Update the Gemini client reference (useful for reconnection)
   */
  updateClient(newClient) {
    this.client = newClient;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
  }

  /** While muted, optionally keep sending mic audio for server-side barge-in detection. */
  setBargeInStream(enabled) {
    this.bargeInStream = Boolean(enabled);
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
      this.pendingSamples = (this.pendingSamples || 0) + float32Data.length;
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
    this.pendingSamples = 0;
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

  /** Estimated ms of PCM still queued (24 kHz). */
  getPlaybackMsRemaining() {
    const samples = this.pendingSamples || 0;
    return samples <= 0 ? 0 : Math.ceil((samples / this.sampleRate) * 1000);
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
    this.isInitialized = false;
  }
}
