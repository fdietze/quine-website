// A WORLD'S SOUND, as a page wires it: the world's Worker forwards each
// committed sound command as one line of text; quine's mixer plays it in its
// own Worker beside a PCM AudioWorklet (../sound/browser-sound.mjs).
//
// The page adds NO autoplay policy of its own: it follows the browser's. Where
// the browser keeps audio suspended until a gesture (every engine measured
// here), a real gesture resumes it; where a browser or profile grants audio
// without one, a world may sound at once, as any page may. A command that
// cannot play (still suspended, or refused by the mixer) is REPORTED - never
// silence that looks like success, and never kept to erupt later.
//
// ONE CONDITION, ONE NOTIFICATION (AGENTS.md, Guiding principles). A gesture
// only TRIES to resume and reports nothing: a world that never asks for sound
// must never hear about audio. A suspended context is reported when a COMMAND
// is refused because of it, once; it re-arms only when a command plays while
// the context runs, since that proves the condition cleared. A mixer refusal
// is a defect of that one command and is reported each time.
//
// NO VISIBILITY POLICY: a hidden tab is the browser's to throttle or not.
// Measured, not assumed: in headless Chromium a page sent to the background by
// another tab still reports "visible" and its mixer keeps being pulled, so no
// harness here can observe a hidden tab, and nothing here claims how one
// behaves.
import { BrowserSound, SUSPENDED } from "../sound/browser-sound.mjs";

/**
 * @param {(text: string) => void} report  where an audio failure is told to
 *   the user (the world view's diagnostics).
 */
export function connectWorldSound(report) {
  const sound = new BrowserSound();
  const started = sound.start().catch((e) => report(`sound: ${e.message}`));
  const resume = async () => {
    // INSIDE THE EVENT, before any await: browsers honour a resume only while
    // the gesture's activation is current, and awaiting the start first could
    // let it lapse. The context exists from start()'s first synchronous step,
    // so this reaches it even while the mixer loads.
    sound.context?.resume().catch(() => {});
    await started;
    if (sound.state !== "suspended") return;
    // Silent on failure: a refused resume is news only to a command, which
    // reports it (below) when it is refused.
    await sound.resume().catch(() => {});
  };
  let suspendedReported = false;
  let closed = false;
  let commands = Promise.resolve();
  // THE GESTURE EDGE: every real press or key in this page asks the context to
  // resume, from inside the event. Listeners stay, so a context the browser
  // suspended again can be resumed by the next gesture.
  addEventListener("pointerdown", resume, true);
  addEventListener("keydown", resume, true);
  return {
    sound,
    /**
     * One forwarded command from the world's Worker. Never rejects: every
     * failure is reported.
     * @param {string} text
     * @param {{id: string, mono: boolean, data: Uint8Array}[]} [assets]
     * @param {(keys: string[]) => void} [acknowledge]
     * @param {(ok: boolean, reason: string) => void} [settle]
     */
    command(text, assets = [], acknowledge = () => {}, settle = () => {}) {
      // Commit order survives asynchronous ingestion: a following Stop must
      // never overtake the Play whose asset it is waiting for.
      commands = commands
        .then(async () => {
          await started;
          if (closed) return;
          const keys = await sound.ingest(assets);
          if (closed) return;
          if (keys.length) acknowledge(keys);
          await sound.command(text);
          if (!closed) settle(true, "");
        })
        .then(
          () => {
            // A command accepted before a suspension may be acknowledged
            // after it; only a context running NOW has cleared the condition.
            if (sound.state === "running") suspendedReported = false;
          },
          (e) => {
            if (closed) return;
            settle(false, String(e.message ?? e).slice(0, 1024));
            if (e.name === SUSPENDED) {
              if (suspendedReported) return;
              suspendedReported = true;
            }
            report(`sound: ${e.message}`);
          },
        );
    },
    /** LEAVING THE WORLD stops its sound: nothing may keep playing a world
     *  the user is no longer in. */
    stop() {
      closed = true;
      removeEventListener("pointerdown", resume, true);
      removeEventListener("keydown", resume, true);
      return sound.stop().catch((e) => report(`sound: ${e.message}`));
    },
  };
}
