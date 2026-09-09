/**
 * Audio Playback Worklet Processor for playing PCM audio
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.audioQueue = [];
    this.queueHadAudio = false;
    this.queueEpoch = 0;
    this.acceptedEpoch = 0;
    this.renderedEpochs = new Set();

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message === "interrupt" || message?.type === "interrupt") {
        // Clear the queue on interrupt
        this.audioQueue = [];
        this.queueHadAudio = false;
        this.renderedEpochs.clear();
        if (Number.isFinite(message?.epoch)) {
          this.acceptedEpoch = message.epoch;
          this.queueEpoch = message.epoch;
        }
      } else if (message instanceof Float32Array) {
        // Add audio data to the queue
        this.audioQueue.push({ samples: message, offset: 0, epoch: 0 });
        this.queueHadAudio = true;
      } else if (message?.type === "audio" && message.samples instanceof Float32Array) {
        if (this.acceptedEpoch === 0) this.acceptedEpoch = message.epoch;
        if (message.epoch !== this.acceptedEpoch) return;
        this.audioQueue.push({
          samples: message.samples,
          offset: 0,
          epoch: message.epoch,
          chunkId: message.chunkId,
        });
        this.queueHadAudio = true;
        this.queueEpoch = message.epoch;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (output.length === 0) return true;

    const channel = output[0];
    let outputIndex = 0;

    // Fill the output buffer from the queue
    while (outputIndex < channel.length && this.audioQueue.length > 0) {
      const current = this.audioQueue[0];
      const currentBuffer = current?.samples;

      if (!currentBuffer || current.offset >= currentBuffer.length) {
        this.audioQueue.shift();
        continue;
      }

      const remainingOutput = channel.length - outputIndex;
      const remainingBuffer = currentBuffer.length - current.offset;
      const copyLength = Math.min(remainingOutput, remainingBuffer);

      // Copy audio data to output
      for (let i = 0; i < copyLength; i++) {
        channel[outputIndex++] = currentBuffer[current.offset + i];
      }
      if (copyLength > 0 && !this.renderedEpochs.has(current.epoch)) {
        this.renderedEpochs.add(current.epoch);
        this.port.postMessage({
          type: "rendered",
          epoch: current.epoch,
          chunkId: current.chunkId,
          samples: copyLength,
        });
      }

      // Update or remove the current buffer
      if (copyLength < remainingBuffer) {
        current.offset += copyLength;
      } else {
        this.audioQueue.shift();
      }
    }

    if (this.queueHadAudio && this.audioQueue.length === 0) {
      this.queueHadAudio = false;
      this.port.postMessage({ type: "drained", epoch: this.queueEpoch });
    }

    // Fill remaining output with silence
    while (outputIndex < channel.length) {
      channel[outputIndex++] = 0;
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
