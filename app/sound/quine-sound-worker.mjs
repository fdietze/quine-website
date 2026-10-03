// THE MIXER'S BROWSER OWNER: one quine-sound wasm instance, commands in and
// finished PCM blocks out. This is a dedicated Worker, not another image or
// resident: it owns only the mutable audio state native cpal's callback owns.
//
// WHY NOT INSIDE AudioWorkletProcessor. The first concrete adapter did that,
// and activating quine-sound's wasm crashed Playwright WebKit's page. Keeping
// wasm here leaves the worklet as the browser-native output transport and the
// existing Rust mixer as the only DSP. No SharedArrayBuffer, COOP or COEP.
//
// THE DATA PLANE IS DIRECT. The page gives this Worker and the AudioWorklet
// opposite ends of a fresh MessageChannel; demand and transferred PCM never
// bounce through the page thread. The page remains the lifecycle owner and
// speaks to this Worker's ordinary port only for commands and acknowledgements.

import { errorStack } from "../app/error-message.mjs";

const BLOCK_FRAMES = 512;
export const LOW_BLOCKS = 4;
export const HIGH_BLOCKS = 8;
const MAX_DEMAND_BLOCKS = HIGH_BLOCKS;
const OUTPUT_WAIT_MS = 2000;

/**
 * The mixer as wasm-bindgen's glue exports it (crates/quine-sound-wasm).
 * @typedef {object} Mixer
 * @property {() => number} out_ptr
 * @property {(text: string) => void} command
 * @property {(id: string, mono: boolean, data: Uint8Array) => void} ingest_audio
 * @property {(frames: number) => void} render
 * @property {() => number} frames_rendered
 */
/**
 * What the page sends (browser-sound.mjs).
 * @typedef {{type: "init", generation: number, glueUrl: string}
 *   | {type: "attach-output", port: MessagePort}
 *   | {type: "audio-assets", id: number, generation: number, assets: {id: string, mono: boolean, data: Uint8Array}[]}
 *   | {type: "command", id: number, generation: number, text: string}
 *   | {type: "stats", id: number, generation: number}
 *   | {type: "stop", id: number, generation: number}} HostMessage
 */
/**
 * What the worklet sends back over the output port (quine-sound-processor.js):
 * readiness, demand, or the answer to an `askOutput` by its `id`.
 * @typedef {{type: "output-ready", generation: number}
 *   | {type: "demand", generation: number, blocks: number, frames: number}
 *   | {type: string, id: number, generation?: number}} OutputMessage
 */

/** @type {WebAssembly.Memory | null} */
let memory = null;
/** @type {Mixer | null} */
let mixer = null;
let outputPtr = 0;
let sampleRate = 0;
let commandCapacity = 0;
let audioCapacity = 0;
let generation = 0;
/** @type {MessagePort | null} */
let outputPort = null;
let outputReady = false;
let mixerReady = false;
let nextOutputId = 1;
let commandsApplied = 0;
/** @type {Map<number, {resolve: (msg: OutputMessage) => void}>} */
const outputWaiters = new Map();

/** @param {MessageEvent<HostMessage>} event */
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      generation = data.generation;
      await init(data.glueUrl);
      mixerReady = true;
      postMessage({
        type: "mixer-ready",
        generation,
        sampleRate,
        blockFrames: BLOCK_FRAMES,
        lowBlocks: LOW_BLOCKS,
        highBlocks: HIGH_BLOCKS,
      });
      return;
    }
    if (data.type === "attach-output") {
      const port = data.port;
      outputPort = port;
      port.onmessage = ({ data: msg }) => onOutputMessage(msg);
      port.start();
      return;
    }
    if (!mixerReady) throw new Error("mixer is not ready");
    if (data.type === "audio-assets") {
      if (data.generation !== generation) return stale(data.id);
      const keys = [];
      try {
        for (const asset of data.assets) {
          // Before wasm-bindgen's byte copy; Rust repeats the exact bound.
          if (!(asset.data instanceof Uint8Array) || asset.data.byteLength > audioCapacity)
            throw new Error("audio asset exceeds encoded input limit");
          loaded().mixer.ingest_audio(asset.id, asset.mono, asset.data);
          keys.push(`${asset.id}:${asset.mono ? "mono" : "stereo"}`);
        }
        postMessage({ type: "audio-assets-result", id: data.id, generation, ok: true, keys });
      } catch (e) {
        // No acknowledgement on partial failure: retransmission is safe,
        // since verified samples share the existing content-addressed memo.
        postMessage({ type: "audio-assets-result", id: data.id, generation, ok: false, reason: String(e) });
      }
      return;
    }
    if (data.type === "command") {
      if (data.generation !== generation) return stale(data.id);
      postMessage({ type: "command-result", id: data.id, generation, ...command(data.text) });
      return;
    }
    if (data.type === "stats") {
      if (!outputPort) throw new Error("output is not attached");
      const output = await askOutput("stats", data.generation);
      postMessage({
        ...output,
        // The output port has its OWN request id; restore the host request's
        // identity after the spread or BrowserSound would wait forever on the
        // id it actually minted.
        type: "stats-result",
        id: data.id,
        generation,
        mixerFrames: loaded().mixer.frames_rendered(),
        commandsApplied,
      });
      return;
    }
    if (data.type === "stop") {
      await stop(data.id, data.generation);
      return;
    }
    throw new Error(`unknown message ${/** @type {{type: string}} */ (data).type}`);
  } catch (e) {
    postMessage({ type: "mixer-failed", error: errorStack(e) });
  }
};

/// Instantiate through wasm-bindgen's generated glue (crates/quine-sound-wasm).
/// A refusal crosses as a thrown string; PCM is read through a view over the
/// output block, so no copy happens in Rust.
/** @param {string} glueUrl */
async function init(glueUrl) {
  const glue = await import(glueUrl);
  const raw = await glue.default();
  memory = raw.memory;
  /** @type {Mixer} */
  const instance = new glue.Instance();
  mixer = instance;
  outputPtr = instance.out_ptr();
  sampleRate = glue.sample_rate();
  commandCapacity = glue.command_capacity();
  audioCapacity = glue.audio_capacity();
  if (BLOCK_FRAMES > glue.max_frames()) {
    throw new Error(`transport block ${BLOCK_FRAMES} exceeds mixer maximum`);
  }
}

/** The mixer and its memory, once `init` made them. */
function loaded() {
  if (!mixer || !memory) throw new Error("mixer is not ready");
  return { mixer, memory };
}

/** The worklet's end of the data plane, once the page attached it. */
function output() {
  if (!outputPort) throw new Error("output is not attached");
  return outputPort;
}

/** @param {OutputMessage} msg */
function onOutputMessage(msg) {
  try {
    if (msg.type === "output-ready") {
      if (msg.generation !== generation) return;
      outputReady = true;
      postMessage({ type: "output-ready", generation });
      return;
    }
    if (msg.type === "demand" && "blocks" in msg) {
      if (!outputReady || msg.generation !== generation) return;
      render(msg.blocks, msg.frames, msg.generation);
      return;
    }
    const waiter = "id" in msg ? outputWaiters.get(msg.id) : undefined;
    if (waiter && "id" in msg) {
      outputWaiters.delete(msg.id);
      waiter.resolve(msg);
    }
  } catch (e) {
    postMessage({ type: "mixer-failed", error: errorStack(e) });
  }
}

/**
 * @param {string} text
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function command(text) {
  // REFUSE BEFORE THE COPY: wasm-bindgen writes the whole string into linear
  // memory before Rust sees it, so Rust's own byte limit cannot stop an
  // oversized command from growing the mixer's memory. A string's UTF-8
  // length is never less than its UTF-16 length, so anything refused here
  // Rust would refuse too; Rust keeps the exact byte limit for the rest.
  if (text.length > commandCapacity) {
    return {
      ok: false,
      reason: `command of ${text.length} characters exceeds ${commandCapacity} bytes (refused before it entered the mixer)`,
    };
  }
  try {
    loaded().mixer.command(text);
  } catch (e) {
    return { ok: false, reason: String(e) || "the mixer refused the command" };
  }
  commandsApplied++;
  return { ok: true };
}

/**
 * @param {number} blocks
 * @param {number} frames
 * @param {number} messageGeneration
 */
function render(blocks, frames, messageGeneration) {
  const { mixer, memory } = loaded();
  if (!Number.isSafeInteger(blocks) || blocks < 1 || blocks > MAX_DEMAND_BLOCKS) {
    throw new Error(`invalid block demand ${blocks}`);
  }
  if (frames !== BLOCK_FRAMES) throw new Error(`invalid block size ${frames}`);
  const samplesPerBlock = frames * 2;
  const pcm = new Float32Array(blocks * samplesPerBlock);
  for (let block = 0; block < blocks; block++) {
    try {
      mixer.render(frames);
    } catch (e) {
      throw new Error(`render refused: ${String(e)}`);
    }
    // Commands may grow wasm memory and detach old views. The pointer belongs
    // to a fixed Vec and stays stable; the view is remade from the live buffer.
    pcm.set(new Float32Array(memory.buffer, outputPtr, samplesPerBlock), block * samplesPerBlock);
  }
  output().postMessage({ type: "pcm", generation: messageGeneration, frames, blocks, pcm }, [pcm.buffer]);
}

/**
 * @param {number} id
 * @param {number} nextGeneration
 */
async function stop(id, nextGeneration) {
  // GENERATION FIRST: no old demand or PCM can act after this line.
  generation = nextGeneration;
  outputReady = false;
  await askOutput("deactivate", generation);

  const stopped = command("(:stop)");
  if (!stopped.ok) throw new Error(stopped.reason);

  // Clear PCM that was rendered before Stop only after the mixer itself has
  // accepted Stop, then acknowledge the host so it may close the context.
  await askOutput("flush", generation);
  postMessage({ type: "stop-result", id, generation, ok: true });
}

/// Ask the worklet something and BOUND the wait. A processor that died or was
/// already deactivated answers nothing, and an unbounded wait here would wedge
/// stop() and leak the waiter instead of reporting the fault.
/**
 * @param {string} type
 * @param {number} messageGeneration
 * @returns {Promise<OutputMessage>}
 */
function askOutput(type, messageGeneration) {
  const port = output();
  const id = nextOutputId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!outputWaiters.delete(id)) return;
      reject(new Error(`${type}: the audio transport did not answer`));
    }, OUTPUT_WAIT_MS);
    outputWaiters.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
    });
    port.postMessage({ type, id, generation: messageGeneration });
  });
}

/** @param {number} id */
function stale(id) {
  postMessage({ type: "command-result", id, generation, ok: false, reason: "stale audio generation" });
}
