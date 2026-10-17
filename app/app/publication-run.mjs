// ONE PUBLICATION RUN, AS A PAGE SEES IT: a fresh Worker builds the publication
// job from a closed world's bytes and drives it (core/publication-worker.mjs);
// this page is the job's SCREEN - it mounts the app's HTML in a box of the
// publication's launch size, takes the COMPLETE app picture when the job asks
// for it and answers. The job decides everything else (hook, deadlines,
// refusals); this module forwards.
//
// A PUBLICATION IS GRAPHICAL OR REFUSED: where this page cannot draw the app's
// picture (an unmeasured engine, a picture that never loaded) the answer is an
// error the core turns into a refusal - never a screenless artifact.
// CANCEL IS DROPPING THE JOB: aborting terminates the Worker, which discards
// the job and everything it held.
import { errorMessage } from "./error-message.mjs";
import { mountHtmlView } from "./html-view.mjs";
import { moduleWorker } from "./module-worker.mjs";

/** The launch viewport a publication lays the app out in, in css px: the same
 * on every shell (GTK's INITIAL_LAUNCH_VIEWPORT). */
export const LAUNCH_VIEWPORT = { width: 1000, height: 720 };

/** The core's refusal of a publication, in its own words (detail, then the
 * hint on the next line): `message` is shown to the person verbatim. */
export class PublicationRefused extends Error {}

/** The run ended because the person cancelled it. */
export class PublicationCancelled extends Error {}

/**
 * Produce the published artifact of the closed world `bytes`.
 * @param {object} o
 * @param {Uint8Array<ArrayBuffer>} o.bytes  a closed world's file (catalog export); transferred.
 * @param {"omit" | "full"} o.chat  whether the artifact carries the conversation.
 * @param {AbortSignal} [o.signal]  aborting cancels: nothing is produced.
 * @param {string | URL} [o.workerUrl]  tests only.
 * @returns {Promise<Uint8Array<ArrayBuffer>>} the artifact's bytes
 */
export function produce({ bytes, chat, signal, workerUrl }) {
  return new Promise((resolve, reject) => {
    const worker = moduleWorker(workerUrl ?? new URL("../core/publication-worker.mjs", import.meta.url));
    const scale = devicePixelRatio;
    // THE SCREEN: off to the side but laid out (not display:none), `inert` so
    // nothing a person does reaches it.
    const stage = document.createElement("div");
    stage.className = "publication-stage";
    stage.inert = true;
    stage.setAttribute("aria-hidden", "true");
    stage.style.cssText =
      `position:fixed;left:-${LAUNCH_VIEWPORT.width + 100}px;top:0;` +
      `width:${LAUNCH_VIEWPORT.width}px;height:${LAUNCH_VIEWPORT.height}px;`;
    const box = document.createElement("div");
    box.className = "publication-box";
    stage.append(box);
    document.body.append(stage);
    const view = mountHtmlView(
      box,
      (msg, transfer) => worker.postMessage(msg, transfer ?? []),
      () => ({ stop() {} }),
    );

    let settled = false;
    /** @param {() => void} done */
    const finish = (done) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      view.stop();
      stage.remove();
      worker.terminate();
      done();
    };
    const cancel = () => finish(() => reject(new PublicationCancelled("cancelled")));
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });

    /** The exact text of the frame mounted now: what the core digests. */
    let mounted = "";
    let capturing = 0;
    /** @param {number} seq */
    const answer = async (seq) => {
      const mine = ++capturing;
      const frame = mounted;
      const superseded = () => settled || mine !== capturing || frame !== mounted;
      try {
        const picture = await view.capture(scale, superseded);
        if (picture === null || superseded()) return;
        worker.postMessage({ type: "native-answer", seq, mounted: frame, ...picture }, [picture.png.buffer]);
      } catch (error) {
        if (!superseded())
          worker.postMessage({ type: "native-answer", seq, mounted: frame, error: errorMessage(error) });
      }
    };

    worker.addEventListener(
      "message",
      (/** @type {MessageEvent<import("../../types/worker-messages.js").FromPublication>} */ { data }) => {
        switch (data.type) {
          case "html":
            mounted = data.frame;
            view.show(data.frame);
            break;
          case "picture":
            view.picture(data.id, data.token, data.png);
            break;
          case "canvas-frame":
            view.leafFrame(data.id, data.generation, data.resizes, data.width, data.height);
            break;
          case "canvas-presenter":
            view.leafPresenter(data.id, data.generation, data.presenter);
            break;
          case "native":
            void answer(data.seq);
            break;
          case "done":
            finish(() => resolve(data.artifact));
            break;
          case "refused":
            finish(() => reject(new PublicationRefused(data.text)));
            break;
          case "error":
            finish(() => reject(new Error(data.error)));
            break;
        }
      },
    );
    worker.addEventListener("error", (event) =>
      finish(() => reject(new Error(event.message || "the publication could not start"))),
    );
    worker.postMessage(
      { type: "start", bytes, chat, width: LAUNCH_VIEWPORT.width, height: LAUNCH_VIEWPORT.height, scale },
      [bytes.buffer],
    );
  });
}
