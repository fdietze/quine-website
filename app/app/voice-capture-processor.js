// THE VOICE MESSAGE'S CAPTURE (site/app/voice-recorder.mjs): the microphone's
// samples, handed to the page as PCM16. Nothing else happens here: the node is
// mono by its channel settings (the graph downmixes), and the core turns the
// PCM16 into the stored speech MP3 (src/speech_mp3.rs).
//
// PCM16 HERE, IN BATCHES: Composer verifies 16 kHz, so five minutes is
// 9.6 MB. Raw app capture keeps its device rate. The page bounds retained
// frames before collecting each batch (voice-recorder.mjs); each batch's
// buffer is transferred, not copied.

/** Frames per message: 32 render quanta, ~85 ms at 48 kHz. */
const BATCH = 4096;

class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Int16Array(BATCH);
    this.filled = 0;
    // The page asks for the tail when the recording ends.
    this.port.onmessage = () => {
      this.port.postMessage({ tail: this.batch.slice(0, this.filled) });
      this.filled = 0;
    };
  }

  /** @param {Float32Array[][]} inputs */
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const s of samples) {
      this.batch[this.filled++] = Math.max(-1, Math.min(1, s)) * 0x7fff;
      if (this.filled === BATCH) {
        this.port.postMessage(this.batch, [this.batch.buffer]);
        this.batch = new Int16Array(BATCH);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("voice-capture", VoiceCapture);
