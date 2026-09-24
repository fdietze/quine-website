// THE HOST'S HALF of browser sound: who owns the AudioContext, what state it
// is in, and what a refusal means. The audio itself is quine's existing Rust
// mixer in one dedicated Worker; the AudioWorklet is a bounded PCM transport.
//
// THREE RULES:
//
// 1. NO FAKE SUCCESS. A browser may refuse to run audio (no user activation,
//    wrong sample rate, failed worklet). Every case is an actionable error,
//    never silence that looks like playback.
// 2. THE GESTURE IS THE HOST'S. `resume()` must be called directly from a real
//    gesture. This module supplies no button and invents no background policy.
// 3. ONE OWNER, ONE GENERATION. Every lifecycle message carries a generation;
//    late PCM/acks from a stopped output are inert.

export const ENGINE_SAMPLE_RATE = 44100;
/// The `name` of the error `command()` throws while the context is suspended.
export const SUSPENDED = "AudioSuspended";
const POLICY_WAIT_MS = 2000;

// RELATIVE TO THIS MODULE, never to a server root: the site is a static
// directory that may be hosted under any path (site/generated/ holds the
// builds beside the pages that load them).
const DEFAULTS = {
  glueUrl: new URL("../generated/sound/quine_sound_wasm.js", import.meta.url).href,
  processorUrl: new URL("./quine-sound-processor.js", import.meta.url).href,
  workerUrl: new URL("./quine-sound-worker.mjs", import.meta.url).href,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // A lifecycle deferred may be rejected by a LATE failure, after the start it
  // gated already succeeded and nobody awaits it any more. Mark it handled at
  // birth so that rejection cannot surface as an unhandled one.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function bounded(promise, reason) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(reason)), POLICY_WAIT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export class BrowserSound {
  #ctx = null;
  #node = null;
  #worker = null;
  #generation = 0;
  #pending = new Map();
  #nextId = 1;
  #state = "idle";
  #failure = null;
  #mixerReady = deferred();
  #outputReady = deferred();
  #outputIsReady = false;

  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /// idle | starting | running | suspended | failed | closed.
  get state() {
    if (this.#state === "running" || this.#state === "suspended") {
      return this.#ctx?.state === "running" ? "running" : "suspended";
    }
    return this.#state;
  }

  get failure() {
    return this.#failure;
  }

  get context() {
    return this.#ctx;
  }

  /// Construct the mixer Worker and Web Audio transport. This never tries to
  /// defeat autoplay: a browser with no activation returns `suspended`.
  /// `destination` may be a node or a function from the fresh context to one.
  async start({ destination } = {}) {
    if (["starting", "running", "suspended"].includes(this.#state)) {
      throw new Error(`already started (${this.state})`);
    }
    this.#state = "starting";
    this.#failure = null;
    const generation = ++this.#generation;
    this.#mixerReady = deferred();
    this.#outputReady = deferred();
    this.#outputIsReady = false;

    try {
      const ctx = new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE });
      this.#ctx = ctx;
      if (ctx.sampleRate !== ENGINE_SAMPLE_RATE) {
        const got = ctx.sampleRate;
        await ctx.close();
        throw new Error(`browser gave ${got} Hz, the engine renders at ${ENGINE_SAMPLE_RATE} Hz`);
      }

      // Build the mixer BEFORE the output. The worklet constructor receives a
      // fixed silent high-water buffer so Chromium's headless output cannot
      // outrun the Worker's first demand/reply while the graph starts.
      const worker = new Worker(this.options.workerUrl, { type: "module" });
      this.#worker = worker;
      worker.onmessage = ({ data }) => this.#onWorkerMessage(data);
      worker.onerror = (event) => this.#fail(`mixer Worker: ${event.message || "failed"}`);
      worker.postMessage({ type: "init", generation, glueUrl: this.options.glueUrl });
      const ready = await bounded(this.#mixerReady.promise, "the sound mixer did not start");
      this.#stillStarting(generation);
      if (ready.sampleRate !== ENGINE_SAMPLE_RATE) {
        throw new Error(`engine renders at ${ready.sampleRate} Hz, host expected ${ENGINE_SAMPLE_RATE}`);
      }

      await ctx.audioWorklet.addModule(this.options.processorUrl);
      this.#stillStarting(generation);
      const node = new AudioWorkletNode(ctx, "quine-sound", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          generation,
          framesPerBlock: ready.blockFrames,
          lowBlocks: ready.lowBlocks,
          highBlocks: ready.highBlocks,
          initialSilenceFrames: ready.blockFrames * ready.highBlocks,
        },
      });
      this.#node = node;
      node.onprocessorerror = () => this.#fail("the audio transport failed (onprocessorerror)");
      const sink = typeof destination === "function" ? destination(ctx) : destination;
      node.connect(sink ?? ctx.destination);

      // Give both audio agents one end of a fresh channel. PCM is direct
      // Worker <-> worklet; the page never relays a block, and the
      // AudioWorkletNode keeps ownership of its normal `port` endpoint.
      const dataPlane = new MessageChannel();
      node.port.postMessage({ type: "attach-data", port: dataPlane.port1 }, [dataPlane.port1]);
      worker.postMessage({ type: "attach-output", port: dataPlane.port2 }, [dataPlane.port2]);
      this.#state = ctx.state === "running" ? "running" : "suspended";
      return this.state;
    } catch (e) {
      // A stop() that arrived while this start was awaiting owns the outcome:
      // it already tore everything down and said `closed`, and a late failure
      // here must not overwrite that with `failed`.
      if (generation === this.#generation) this.#fail(String(e?.message ?? e));
      throw e;
    }
  }

  /// A stop() bumps the generation. If one happened while start() was
  /// awaiting, building on must not resurrect what stop() tore down.
  #stillStarting(generation) {
    if (generation !== this.#generation) throw new Error("audio stopped while starting");
  }

  /// MUST be called directly from a real user gesture. Some headless browsers
  /// leave `AudioContext.resume()` pending forever rather than reject; the
  /// statechange is therefore condition-driven but bounded into an actionable
  /// refusal instead of hanging the host.
  async resume() {
    this.#require("resume", ["running", "suspended"]);
    const resume = this.#ctx.resume();
    resume.catch((e) => this.#fail(`resume: ${e.message}`));
    if (this.#ctx.state !== "running") {
      await bounded(this.#waitForContextState("running"), "the browser kept audio suspended (needs a user gesture)");
    }
    await bounded(this.#outputReady.promise, "the audio transport did not start");
    this.#state = "running";
    return this.state;
  }

  /// Explicit host pause. No visibility policy is hidden here. Already
  /// rendered pre-pause PCM remains queued and continues after resume; commands
  /// while suspended are refused, so no NEW sound can erupt later.
  async pause() {
    this.#require("pause", ["running", "suspended"]);
    if (this.#ctx.state !== "suspended") {
      const suspending = this.#ctx.suspend();
      await bounded(Promise.all([suspending, this.#waitForContextState("suspended")]), "audio did not suspend");
    }
    this.#state = "suspended";
    return this.state;
  }

  async command(text) {
    this.#require("command", ["running", "suspended"]);
    if (this.state !== "running") {
      // NAMED, so a host can tell this CONDITION (the context is suspended)
      // from a per-command refusal without matching the message.
      const suspended = new Error("audio is suspended; resume it from a user gesture first");
      suspended.name = SUSPENDED;
      throw suspended;
    }
    await bounded(this.#outputReady.promise, "the audio transport is not ready");
    const result = await this.#ask("command", { text });
    if (!result.ok) throw new Error(result.reason || "the mixer refused the command");
    return result;
  }

  async stats() {
    this.#require("stats", ["running", "suspended"]);
    if (!this.#outputIsReady) {
      return {
        frames: 0,
        mixerFrames: 0,
        queuedFrames: 0,
        underruns: 0,
        dropped: 0,
        peak: 0,
        active: false,
      };
    }
    return await this.#ask("stats");
  }

  /// Generation changes FIRST; Worker refuses old demand, applies Mixer Stop,
  /// waits for the worklet to clear queued PCM, then acknowledges. Only then
  /// does the context close. If the worklet never existed (a browser that kept
  /// the context suspended from frame zero), no command was accepted and the
  /// mixer/context can be destroyed directly.
  async stop() {
    if (["idle", "closed"].includes(this.#state)) return this.state;
    const generation = ++this.#generation;
    // Requests from the generation just retired can never be answered now;
    // settle them here rather than leaving a caller waiting on a dead epoch.
    // That includes a start() still waiting for its mixer or transport.
    for (const [, pending] of this.#pending) pending.reject(new Error("audio stopped"));
    this.#pending.clear();
    this.#mixerReady.reject(new Error("audio stopped"));
    this.#outputReady.reject(new Error("audio stopped"));
    try {
      if (this.#worker && this.#outputIsReady) {
        await this.#ask("stop", {}, generation);
      }
    } finally {
      // TEARDOWN IS UNCONDITIONAL: stop is the one operation that must always
      // reach `closed`, or a failed acknowledgement would strand a live Worker
      // and AudioContext that no later start() could replace.
      this.#worker?.terminate();
      this.#node?.disconnect();
      if (this.#ctx && this.#ctx.state !== "closed") await this.#ctx.close();
      this.#worker = null;
      this.#node = null;
      this.#ctx = null;
      this.#state = "closed";
    }
    return this.state;
  }

  /// Every request is BOUNDED. A Worker that never answers (a wedged worklet,
  /// a reply whose generation no longer matches and is therefore dropped) must
  /// surface as an actionable refusal, never as a promise nobody settles.
  #ask(type, payload = {}, generation = this.#generation) {
    const id = this.#nextId++;
    const answer = new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, generation });
      this.#worker.postMessage({ type, id, generation, ...payload });
    });
    return bounded(answer, `${type}: the mixer did not answer`).finally(() => {
      this.#pending.delete(id);
    });
  }

  #onWorkerMessage(msg) {
    // The SAME Worker spans generation changes (Stop advances it), so the
    // message's generation is the authority. Old replies are inert; the
    // worker instance itself must not be frozen to its start generation.
    if (msg.generation && msg.generation !== this.#generation) return;
    if (msg.type === "mixer-ready") {
      this.#mixerReady.resolve(msg);
      return;
    }
    if (msg.type === "output-ready") {
      this.#outputIsReady = true;
      this.#outputReady.resolve(msg);
      return;
    }
    if (msg.type === "mixer-failed") {
      this.#fail(msg.error);
      return;
    }
    const pending = this.#pending.get(msg.id);
    // An id names both a request and the lifecycle generation that made it.
    // A reply crossing Stop cannot settle an earlier generation's request.
    if (!pending || pending.generation !== msg.generation) return;
    this.#pending.delete(msg.id);
    pending.resolve(msg);
  }

  #waitForContextState(want) {
    // THE CONTEXT WAITED ON, not the field: a wait the caller gave up on
    // (bounded) keeps its listener, and stop() later nulls the field and
    // closes this context - whose `closed` statechange must find the context
    // it was registered on, not a null.
    const ctx = this.#ctx;
    if (ctx.state === want) return Promise.resolve();
    return new Promise((resolve) => {
      const changed = () => {
        if (ctx.state === want) {
          ctx.removeEventListener("statechange", changed);
          resolve();
        }
      };
      ctx.addEventListener("statechange", changed);
    });
  }

  #fail(reason) {
    this.#failure = reason;
    this.#state = "failed";
    this.#mixerReady.reject(new Error(reason));
    this.#outputReady.reject(new Error(reason));
    for (const [, pending] of this.#pending) pending.reject(new Error(reason));
    this.#pending.clear();
  }

  #require(what, states) {
    if (!states.includes(this.#state)) {
      throw new Error(`${what}: audio is ${this.#state}${this.#failure ? ` (${this.#failure})` : ""}`);
    }
  }
}
