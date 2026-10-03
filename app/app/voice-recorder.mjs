// A VOICE MESSAGE'S RECORDING: the microphone, as raw mono samples, for as
// long as the user holds 🎙 (site/app/chat-input.mjs). The result is the
// composer's voice attachment as the core parses it (src/attachment.rs):
// `{"kind":"voice","pcm":<base64 PCM16 LE mono>,"rate":<Hz>}`. The core makes
// the stored speech MP3 from it (src/speech_mp3.rs), so the page encodes
// nothing - the same split as Android (Capture.kt hands PCM to Rust).
//
// RAW SAMPLES, NOT MediaRecorder: MediaRecorder gives WebM/Opus, which the
// core cannot decode, and the samples are what the one MP3 path takes.
import { base64 } from "./photo.mjs";

/** The longest voice message, as on Android (Mic.kt VOICE_MAX_MS). */
export const VOICE_MAX_MS = 5 * 60_000;

/** @typedef {{kind: "voice", pcm: string, rate: number}} Voice */

// One device owner, including while its permission prompt is pending. The
// composer and image recording share this capture path (KISS).
let occupied = false;

/** @param {() => void} onCap */
export async function startVoiceRecording(onCap) {
  const capture = await startPcmRecording(onCap, VOICE_MAX_MS, undefined, 16_000);
  return {
    async finish() {
      const raw = await capture.finish();
      return raw ? { kind: /** @type {const} */ ("voice"), pcm: base64(raw.pcm), rate: raw.rate } : null;
    },
    cancel: () => capture.cancel(),
  };
}

/**
 * Start recording. Resolves once the microphone is live; rejects with the
 * platform's DOMException (permission refused, no device, device busy).
 *
 * The AudioContext is made BEFORE the first await, inside the user's gesture,
 * so the autoplay policy lets it run.
 * @param {() => void} onCap  the cap was reached; the caller ends the recording.
 * @param {number} maxMs
 * @param {AbortSignal} [signal]
 * @param {number} [speechRate] Composer-only speech rate; app recordings keep the device rate.
 */
export async function startPcmRecording(onCap, maxMs, signal, speechRate) {
  if (occupied) throw new DOMException("the microphone is in use", "InvalidStateError");
  occupied = true;
  let ctx;
  try {
    ctx = new AudioContext(speechRate === undefined ? undefined : { sampleRate: speechRate });
    if (speechRate !== undefined && ctx.sampleRate !== speechRate) {
      void ctx.close();
      throw new DOMException("the requested speech sample rate is unavailable", "NotSupportedError");
    }
  } catch (error) {
    occupied = false;
    throw error;
  }
  /** @type {MediaStream | null} */
  let stream = null;
  const aborted = () => {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
  const check = () => {
    if (signal?.aborted) throw new DOMException("capture cancelled", "AbortError");
  };
  signal?.addEventListener("abort", aborted, { once: true });
  const release = () => {
    signal?.removeEventListener("abort", aborted);
    stream?.getTracks().forEach((t) => t.stop());
    void ctx.close();
    occupied = false;
  };
  /** @type {Int16Array[]} PCM16 batches, in order (voice-capture-processor.js) */
  const chunks = [];
  /** @type {AudioWorkletNode | null} */
  let node = null;
  /** @type {((tail: Int16Array) => void) | null} */
  let onTail = null;
  const maxFrames = Math.floor((ctx.sampleRate * maxMs) / 1000);
  let frames = 0;
  let collecting = true;
  let capped = false;
  const reachCap = () => {
    if (capped) return;
    capped = true;
    stream?.getTracks().forEach((t) => t.stop());
    onCap();
  };
  /** Bound collection BEFORE retaining a batch, even when timers are delayed.
   * @param {Int16Array} batch */
  const collect = (batch) => {
    if (!collecting) return;
    const take = Math.min(batch.length, maxFrames - frames);
    if (take > 0) {
      // Copy a partial batch, so a tiny retained tail cannot keep excess PCM.
      chunks.push(take === batch.length ? batch : batch.slice(0, take));
      frames += take;
    }
    if (frames === maxFrames) reachCap();
  };
  try {
    check();
    if (!navigator.mediaDevices) throw new DOMException("no media devices (not a secure context)", "NotSupportedError");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    check();
    await ctx.audioWorklet.addModule(new URL("./voice-capture-processor.js", import.meta.url));
    check();
    node = new AudioWorkletNode(ctx, "voice-capture", { channelCount: 1, channelCountMode: "explicit" });
    node.port.onmessage = ({ data }) => {
      if (data instanceof Int16Array) collect(data);
      else onTail?.(data.tail);
    };
    ctx.createMediaStreamSource(stream).connect(node);
    // Connected to the output so the graph pulls it; it writes silence there.
    node.connect(ctx.destination);
    await ctx.resume();
    check();
  } catch (e) {
    release();
    throw e;
  }
  const port = node.port;
  const cap = setTimeout(reachCap, maxMs);
  let done = false;
  const end = () => {
    if (done) return false;
    done = true;
    clearTimeout(cap);
    return true;
  };
  return {
    /**
     * Stop and hand over what was recorded; null when nothing was. The
     * worklet's last, partial batch is asked for before the microphone goes.
     * @returns {Promise<{pcm: Uint8Array<ArrayBuffer>, rate: number} | null>}
     */
    async finish() {
      if (!end()) return null;
      const tail = await Promise.race([
        new Promise((ok) => {
          onTail = ok;
          port.postMessage("tail");
        }),
        // A worklet that no longer answers loses only its last ~85 ms.
        new Promise((ok) => setTimeout(() => ok(new Int16Array(0)), 500)),
      ]);
      release();
      collect(/** @type {Int16Array} */ (tail));
      collecting = false;
      port.onmessage = null;
      if (frames === 0) return null;
      const pcm = new Int16Array(frames);
      let at = 0;
      for (const chunk of chunks) {
        const take = chunk.subarray(0, frames - at);
        pcm.set(take, at);
        at += take.length;
      }
      chunks.length = 0;
      // Int16Array is in the platform's byte order, little-endian on every
      // browser platform, which is what the core reads.
      return { pcm: new Uint8Array(pcm.buffer), rate: ctx.sampleRate };
    },
    /** Stop and keep nothing. */
    cancel() {
      if (end()) {
        collecting = false;
        chunks.length = 0;
        port.onmessage = null;
        release();
      }
    },
  };
}
