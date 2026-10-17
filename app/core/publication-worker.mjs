// THE WORKER THAT RUNS ONE PUBLICATION: it builds the core's publication job
// from a closed world's bytes and drives it to its end - an artifact or a
// refusal. Like worker.mjs it SCHEDULES: the job says how long it may be left
// alone (`pump`), a kick wakes it when something arrived for it.
//
// The page is the job's screen (app/publication-run.mjs): it mounts the app's
// HTML, answers pictures and canvas leaves, and takes the complete app
// picture when the job asks. CANCEL IS TERMINATING THIS WORKER: the job and
// everything it held are dropped with it, so there is no cancel message.
// First: refuses to run a plain-URL Worker without the page's policy.
import "../app/policy-guard.mjs";
import { open_publication } from "../generated/core/quine_browser.js";
import { errorMessage, errorStack } from "../app/error-message.mjs";
import { loadEngine } from "./engine-ready.mjs";

/** @typedef {import("../../types/worker-messages.js").ToPublication} ToPublication */
/** @typedef {import("../../types/worker-messages.js").FromPublication} FromPublication */

/** @type {import("../generated/core/quine_browser.js").QuinePublication | null} */
let publication = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null;
/** Messages that arrived while the job was being built, in order.
 * @type {ToPublication[] | null} */
let starting = null;

/**
 * @param {FromPublication} message
 * @param {Transferable[]} [transfer]
 */
function post(message, transfer = []) {
  self.postMessage(message, transfer);
}

/** One turn of the job, then the next one at the job's own pace (-1 = none due). */
function pump() {
  timer = null;
  if (!publication) return;
  const wait = publication.pump();
  if (wait < 0) return;
  timer = setTimeout(pump, Math.max(0, Math.ceil(wait)));
}

/** Wake the job because something arrived for it; never queue two pumps. */
function kick() {
  if (starting !== null || !publication) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(pump, 0);
}

self.onmessage = (event) => {
  /** @type {ToPublication} */
  const msg = event.data;
  if (msg.type !== "start" && starting !== null) starting.push(msg);
  else void handle(msg);
};

/** @param {ToPublication} msg */
async function handle(msg) {
  try {
    switch (msg.type) {
      case "start": {
        if (publication || starting !== null) throw new Error("a publication is already running");
        starting = [];
        await loadEngine((text) => console.warn(text));
        // `wake` is the core telling THIS scheduler that the job has work.
        publication = open_publication(
          msg.bytes,
          msg.chat === "full",
          msg.width,
          msg.height,
          msg.scale,
          (/** @type {FromPublication | {type: "wake"}} */ m) => {
            if (m.type === "wake") return kick();
            // The artifact's bytes move to the page instead of being copied.
            post(m, m.type === "done" ? [m.artifact.buffer] : m.type === "picture" && m.png ? [m.png.buffer] : []);
          },
        );
        const early = starting;
        starting = null;
        for (const m of early) await handle(m);
        kick();
        break;
      }
      case "native-answer":
        publication?.native_answer(msg.seq, msg.mounted, msg.png, msg.omitted ?? [], msg.error);
        kick();
        break;
      case "picture":
        publication?.picture(msg.id, msg.token);
        kick();
        break;
      case "html-fit":
        publication?.html_fit(msg.frame, msg.width, msg.height, msg.paneWidth, msg.paneHeight);
        kick();
        break;
      case "canvas-attach":
        if (!publication) break;
        post({
          type: "canvas-presenter",
          id: msg.id,
          generation: msg.generation,
          presenter: publication.canvas_attach(msg.id, msg.generation, msg.surface),
        });
        kick();
        break;
      case "canvas-resize":
        publication?.canvas_resize(msg.id, msg.generation, msg.width, msg.height, msg.scale);
        kick();
        break;
      case "canvas-detach":
        publication?.canvas_detach(msg.id, msg.generation);
        kick();
        break;
      default:
        // Pointer, wheel and hover reach a screen nobody can touch (the page
        // stage is inert); a stale page is still answered.
        break;
    }
  } catch (error) {
    console.error(errorStack(error));
    post({ type: "error", error: errorMessage(error) });
  }
}
