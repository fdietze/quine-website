// THE BROWSER'S AUDIO TRANSPORT: bounded PCM queue -> Web Audio's planar
// outputs. There is deliberately NO wasm, synthesis, gain, scheduling,
// resampling or policy here. quine-sound's one real mixer lives in the
// dedicated Worker; this worklet only answers the browser's pull.
//
// A FIXED JITTER BUFFER is not native's transparent pull callback. At most
// HIGH_BLOCKS * BLOCK_FRAMES are rendered ahead, so a live command takes
// effect after those already-queued frames. That semantic distance is bounded
// and visible; this adapter makes no latency or glitch-freedom claim.
//
// `process()` never blocks. On underrun it writes silence and counts it. At
// most ONE small demand message is outstanding, posted only when the queue
// crosses its low-water mark - never one allocation/message per quantum.

class QuineSoundProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions;
    this.generation = config.generation;
    this.active = true;
    this.framesPerBlock = config.framesPerBlock;
    this.lowBlocks = config.lowBlocks;
    this.highBlocks = config.highBlocks;
    // A fixed initial silent buffer keeps the output pull alive while the
    // Worker answers its first demand. It is part of the same bounded
    // high-water mark, not an extra queue.
    const initial = new Float32Array(config.initialSilenceFrames * 2);
    this.queue = [initial];
    this.at = 0;
    this.queuedFrames = config.initialSilenceFrames;
    this.outstanding = false;
    this.framesOutput = 0;
    this.underruns = 0;
    this.dropped = 0;
    // The peak SINCE THE LAST READ, so "is sounding now" and "sounded once"
    // are different answers. An all-time maximum cannot tell them apart.
    this.peak = 0;
    this.dataPort = null;
    // Keep AudioWorkletNode.port in the page (its normal ownership). The page
    // transfers one end of a fresh MessageChannel through it; the other end
    // goes to the Mixer Worker, so PCM is still direct Worker <-> worklet.
    this.port.onmessage = ({ data }) => {
      if (data.type !== "attach-data") return;
      this.dataPort = data.port;
      this.dataPort.onmessage = ({ data: msg }) => this.onMessage(msg);
      this.dataPort.start();
      this.dataPort.postMessage({ type: "output-ready", generation: this.generation });
    };
  }

  onMessage(msg) {
    if (msg.type === "pcm") {
      if (msg.generation !== this.generation || !this.active) return;
      this.outstanding = false;
      const pcm = msg.pcm;
      const frames = pcm.length / 2;
      const capacity = this.highBlocks * this.framesPerBlock;
      if (this.queuedFrames + frames <= capacity) {
        this.queue.push(pcm);
        this.queuedFrames += frames;
      } else {
        // UNREACHABLE BY CONSTRUCTION: a demand asks for exactly high-water
        // minus queued. Counting it makes the invariant's violation visible,
        // because a dropped block is otherwise an inaudible discontinuity.
        this.dropped++;
      }
      return;
    }
    if (msg.type === "deactivate") {
      if (msg.generation < this.generation) return;
      this.generation = msg.generation;
      this.active = false;
      this.outstanding = false;
      this.dataPort.postMessage({ type: "deactivated", id: msg.id, generation: this.generation });
      return;
    }
    if (msg.type === "flush") {
      if (msg.generation < this.generation) return;
      this.generation = msg.generation;
      this.active = false;
      this.clearQueue();
      this.dataPort.postMessage({ type: "flushed", id: msg.id, generation: this.generation });
      return;
    }
    if (msg.type === "stats") {
      this.dataPort.postMessage({
        type: "output-stats",
        id: msg.id,
        generation: this.generation,
        frames: this.framesOutput,
        queuedFrames: this.queuedFrames,
        underruns: this.underruns,
        dropped: this.dropped,
        peak: this.peak,
        active: this.active,
      });
      this.peak = 0;
    }
  }

  clearQueue() {
    this.queue = [];
    this.at = 0;
    this.queuedFrames = 0;
    this.outstanding = false;
  }

  requestIfLow() {
    if (!this.dataPort || !this.active || this.outstanding || !this.framesPerBlock) return;
    const low = this.lowBlocks * this.framesPerBlock;
    if (this.queuedFrames > low) return;
    const wantFrames = this.highBlocks * this.framesPerBlock - this.queuedFrames;
    const blocks = Math.ceil(wantFrames / this.framesPerBlock);
    this.outstanding = true;
    this.dataPort.postMessage({
      type: "demand",
      generation: this.generation,
      blocks,
      frames: this.framesPerBlock,
    });
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0 || !output[0]) return true;
    const left = output[0];
    const right = output.length > 1 ? output[1] : null;
    let written = 0;
    while (written < left.length && this.queue.length > 0) {
      const pcm = this.queue[0];
      const available = pcm.length / 2 - this.at;
      const take = Math.min(left.length - written, available);
      for (let i = 0; i < take; i++) {
        const l = pcm[(this.at + i) * 2];
        const r = pcm[(this.at + i) * 2 + 1];
        left[written + i] = l;
        if (right) right[written + i] = r;
        this.peak = Math.max(this.peak, Math.abs(l), Math.abs(r));
      }
      written += take;
      this.at += take;
      this.queuedFrames -= take;
      if (this.at === pcm.length / 2) {
        this.queue.shift();
        this.at = 0;
      }
    }
    if (written < left.length && this.active) this.underruns++;
    this.framesOutput += left.length;
    this.requestIfLow();
    return true;
  }
}

registerProcessor("quine-sound", QuineSoundProcessor);
