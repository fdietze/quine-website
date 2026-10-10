// A VOICE MESSAGE'S RECORDING: the microphone, as raw mono samples, for as
// long as the user holds 🎙 (site/app/chat-input.mjs). The result is the
// composer's voice attachment as the core parses it (src/attachment.rs):
// `{"kind":"voice","pcm":<base64 PCM16 LE mono>,"rate":<Hz>}`. The core makes
// the stored speech MP3 from it (src/speech_mp3.rs), so the page encodes
// nothing - the same split as Android (Capture.kt hands PCM to Rust).
//
// Raw PCM keeps codec policy in quine-audio, shared by every producer.
import { base64 } from "./photo.mjs";

/** The longest voice message, as on Android (Mic.kt VOICE_MAX_MS). */
export const VOICE_MAX_MS = 5 * 60_000;

/** @typedef {{kind: "voice", pcm: string, rate: number}} Voice */

// One device owner, including while its permission prompt is pending. The
// composer and image recording share this capture path (KISS).
let occupied = false;

/** @param {() => void} onCap */
export async function startVoiceRecording(onCap) {
  const capture = await startPcmRecording(onCap, VOICE_MAX_MS, undefined, "chat-voice");
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
 * @param {"sample" | "chat-voice"} [purpose] The host selects policy, never image options.
 */
export async function startPcmRecording(onCap, maxMs, signal, purpose = "sample") {
  const speechRate = purpose === "chat-voice" ? 16_000 : undefined;
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
  /** @type {((tail: {pcm: Int16Array, channels: number}) => void) | null} */
  let onTail = null;
  const maxFrames = Math.floor((ctx.sampleRate * maxMs) / 1000);
  let frames = 0;
  let channels = 0;
  /** @type {DOMException | null} */
  let failure = null;
  let collecting = true;
  let capped = false;
  const reachCap = () => {
    if (capped) return;
    capped = true;
    stream?.getTracks().forEach((t) => t.stop());
    onCap();
  };
  /** Bound complete interleaved frames BEFORE retaining a batch.
   * @param {{pcm: Int16Array, channels: number}} batch */
  const collect = (batch) => {
    if (!collecting) return;
    if (
      ![1, 2].includes(batch.channels) ||
      batch.pcm.length % batch.channels !== 0 ||
      (channels !== 0 && channels !== batch.channels)
    ) {
      failure = new DOMException("microphone channel layout changed or is unsupported", "NotSupportedError");
      collecting = false;
      reachCap();
      return;
    }
    channels = batch.channels;
    const take = Math.min(batch.pcm.length / channels, maxFrames - frames) * channels;
    if (take > 0) {
      // A small retained tail must not keep an oversized transferred buffer.
      chunks.push(take === batch.pcm.length ? batch.pcm : batch.pcm.slice(0, take));
      frames += take / channels;
    }
    if (frames === maxFrames) reachCap();
  };
  try {
    check();
    if (!navigator.mediaDevices) throw new DOMException("no media devices (not a secure context)", "NotSupportedError");
    stream = await navigator.mediaDevices.getUserMedia({
      audio:
        purpose === "chat-voice"
          ? { channelCount: 1, echoCancellation: true, noiseSuppression: true }
          : { channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    check();
    await ctx.audioWorklet.addModule(new URL("./voice-capture-processor.js", import.meta.url));
    check();
    node = new AudioWorkletNode(ctx, "voice-capture", {
      channelCount: purpose === "chat-voice" ? 1 : 2,
      channelCountMode: purpose === "chat-voice" ? "explicit" : "max",
    });
    node.port.onmessage = ({ data }) => {
      if (data.pcm instanceof Int16Array) collect(data);
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
     * @returns {Promise<{pcm: Uint8Array<ArrayBuffer>, rate: number, channels: number} | null>}
     */
    async finish() {
      if (!end()) return null;
      const tail = await Promise.race([
        new Promise((ok) => {
          onTail = ok;
          port.postMessage("tail");
        }),
        // A worklet that no longer answers loses only its last ~85 ms.
        new Promise((ok) => setTimeout(() => ok({ pcm: new Int16Array(0), channels: channels || 1 }), 500)),
      ]);
      release();
      collect(/** @type {{pcm: Int16Array, channels: number}} */ (tail));
      collecting = false;
      port.onmessage = null;
      if (failure) throw failure;
      if (frames === 0) return null;
      const samples = frames * channels;
      const pcm = new Int16Array(samples);
      let at = 0;
      for (const chunk of chunks) {
        const take = chunk.subarray(0, samples - at);
        pcm.set(take, at);
        at += take.length;
      }
      chunks.length = 0;
      // Int16Array is in the platform's byte order, little-endian on every
      // browser platform, which is what the core reads.
      return { pcm: new Uint8Array(pcm.buffer), rate: ctx.sampleRate, channels };
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
