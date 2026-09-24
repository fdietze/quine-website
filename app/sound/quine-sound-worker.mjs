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

const BLOCK_FRAMES = 512;
export const LOW_BLOCKS = 4;
export const HIGH_BLOCKS = 8;
const MAX_DEMAND_BLOCKS = HIGH_BLOCKS;
const OUTPUT_WAIT_MS = 2000;

let memory;
let mixer = null;
let outputPtr = 0;
let sampleRate = 0;
let commandCapacity = 0;
let generation = 0;
let outputPort = null;
let outputReady = false;
let mixerReady = false;
let nextOutputId = 1;
let commandsApplied = 0;
const outputWaiters = new Map();

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
      outputPort = data.port;
      outputPort.onmessage = ({ data: msg }) => onOutputMessage(msg);
      outputPort.start();
      return;
    }
    if (!mixerReady) throw new Error("mixer is not ready");
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
        mixerFrames: mixer.frames_rendered(),
        commandsApplied,
      });
      return;
    }
    if (data.type === "stop") {
      await stop(data.id, data.generation);
      return;
    }
    throw new Error(`unknown message ${data.type}`);
  } catch (e) {
    postMessage({ type: "mixer-failed", error: String(e?.stack ?? e) });
  }
};

/// Instantiate through wasm-bindgen's generated glue (crates/quine-sound-wasm).
/// A refusal crosses as a thrown string; PCM is read through a view over the
/// output block, so no copy happens in Rust.
async function init(glueUrl) {
  const glue = await import(glueUrl);
  const raw = await glue.default();
  memory = raw.memory;
  mixer = new glue.Instance();
  outputPtr = mixer.out_ptr();
  sampleRate = glue.sample_rate();
  commandCapacity = glue.command_capacity();
  if (BLOCK_FRAMES > glue.max_frames()) {
    throw new Error(`transport block ${BLOCK_FRAMES} exceeds mixer maximum`);
  }
}

function onOutputMessage(msg) {
  try {
    if (msg.type === "output-ready") {
      if (msg.generation !== generation) return;
      outputReady = true;
      postMessage({ type: "output-ready", generation });
      return;
    }
    if (msg.type === "demand") {
      if (!outputReady || msg.generation !== generation) return;
      render(msg.blocks, msg.frames, msg.generation);
      return;
    }
    if (msg.id && outputWaiters.has(msg.id)) {
      const waiter = outputWaiters.get(msg.id);
      outputWaiters.delete(msg.id);
      waiter.resolve(msg);
    }
  } catch (e) {
    postMessage({ type: "mixer-failed", error: String(e?.stack ?? e) });
  }
}

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
    mixer.command(text);
  } catch (e) {
    return { ok: false, reason: String(e) || "the mixer refused the command" };
  }
  commandsApplied++;
  return { ok: true };
}

function render(blocks, frames, messageGeneration) {
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
      throw new Error(`render refused: ${e}`);
    }
    // Commands may grow wasm memory and detach old views. The pointer belongs
    // to a fixed Vec and stays stable; the view is remade from the live buffer.
    pcm.set(
      new Float32Array(memory.buffer, outputPtr, samplesPerBlock),
      block * samplesPerBlock,
    );
  }
  outputPort.postMessage(
    { type: "pcm", generation: messageGeneration, frames, blocks, pcm },
    [pcm.buffer],
  );
}

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
function askOutput(type, messageGeneration) {
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
    outputPort.postMessage({ type, id, generation: messageGeneration });
  });
}

function stale(id) {
  postMessage({ type: "command-result", id, generation, ok: false, reason: "stale audio generation" });
}
