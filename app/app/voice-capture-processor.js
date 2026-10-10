// THE VOICE MESSAGE'S CAPTURE (site/app/voice-recorder.mjs): the microphone's
// samples, handed to the page as interleaved PCM16 with actual channels.
// The core alone encodes the finalized Sample or ChatVoice asset.
//
// PCM16 HERE, IN BATCHES: Composer verifies 16 kHz, so five minutes is
// 9.6 MB. Sample capture keeps its full rate and actual mono/stereo channels. The page bounds retained
// frames before collecting each batch (voice-recorder.mjs); each batch's
// buffer is transferred, not copied.

/** Frames per message: 32 render quanta, ~85 ms at 48 kHz. */
const BATCH = 4096;

class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = 0;
    this.batch = new Int16Array(0);
    this.filled = 0;
    // The page asks for the tail when the recording ends.
    this.port.onmessage = () => {
      this.port.postMessage({ tail: { pcm: this.batch.slice(0, this.filled), channels: this.channels || 1 } });
      this.filled = 0;
    };
  }

  /** @param {Float32Array[][]} inputs */
  process(inputs) {
    const input = inputs[0];
    if (!input?.length || !input[0]?.length) return true;
    const channels = input.length;
    if (channels !== this.channels) {
      if (this.filled > 0) {
        this.port.postMessage({ pcm: this.batch.slice(0, this.filled), channels: this.channels });
      }
      this.channels = channels;
      this.batch = new Int16Array(BATCH * channels);
      this.filled = 0;
    }
    for (let frame = 0; frame < input[0].length; frame++) {
      for (const channel of input) {
        this.batch[this.filled++] = Math.max(-1, Math.min(1, channel[frame])) * 0x7fff;
      }
      if (this.filled === this.batch.length) {
        this.port.postMessage({ pcm: this.batch, channels }, [this.batch.buffer]);
        this.batch = new Int16Array(BATCH * channels);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("voice-capture", VoiceCapture);
