// ONE OPEN WORLD, AS A PAGE SEES IT: a Worker that owns the image, a canvas
// that shows it, and the input that reaches it.
//
// A SHELL IS A SURFACE, A LIFECYCLE AND INPUT - nothing here interprets the
// world. Hit-testing, capture, click synthesis and scrolling are the core's,
// identically on every shell; this module forwards what the platform reports
// and hands the canvas to the Worker, which paints it. The product's world view and the test
// fixtures both run THIS code, so what the suites prove is what ships.

import { moduleWorker } from "./module-worker.mjs";
import { appCamera } from "./app-camera.mjs";
import { connectWorldMicrophone } from "./world-microphone.mjs";
import { surfaceInput } from "./surface-input.mjs";

/** @typedef {import("../../types/worker-messages.js").ToWorker} ToWorker */
/** @typedef {import("../../types/worker-messages.js").FromWorker} FromWorker */

/**
 * Does the app's HTML control `el` take every key for itself? A text field,
 * a select, a checkbox or an editable element does: typing never leaks into
 * the world.
 * @param {EventTarget | null} el
 * @returns {el is HTMLElement}
 */
function takesKeys(el) {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * Does `el` keep `key` pressed on it? A control that takes keys keeps all of
 * them; a button, a link or a summary keeps only its activation keys, Enter
 * and Space - every other key pressed on it (an arrow after clicking
 * "Start") is the world's.
 * @param {EventTarget | null} el
 * @param {string} key
 */
function keepsKey(el, key) {
  if (takesKeys(el)) return true;
  const activates =
    el instanceof HTMLElement &&
    (["BUTTON", "SUMMARY"].includes(el.tagName) || (el.tagName === "A" && el.hasAttribute("href")));
  return activates && (key === "Enter" || key === " ");
}

/**
 * Open `worldId` in a fresh Worker, drawing into `canvas`.
 *
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas  the picture box; its CSS box is the
 *   rectangle the world is laid out in, reported as it changes.
 * @param {HTMLElement} [o.keyboard]  where the world's keyboard is: keys
 *   pressed while focus is in this element (the canvas by default; the view
 *   passes the element holding the canvas and the app's HTML) are the
 *   world's, except those an HTML control of the app consumes.
 * @param {string} [o.worldId]  the catalog app to open.
 * @param {Uint8Array<ArrayBuffer>} [o.artifact]  OR a published artifact's bytes (Preview
 *   publication): a disposable session with no catalog identity. Transferred.
 * @param {string|URL} [o.workerUrl]  the Worker script; tests substitute a
 *   wrapper that scripts the provider, the product never does.
 * @param {{web: boolean, sound: boolean, microphone?: boolean, camera?: boolean}} o.permissions  the user's app
 *   permissions as this world opens (settings-store.mjs); it keeps them.
 * @param {(box: import("../../types/worker-messages.js").Box) => void} [o.onBox]
 * @param {(msg: FromWorker) => void} [o.onMessage]  every message the Worker posts
 *   (open, cursor, status, dock, diagnostic, eval, …).
 */
export function openWorldSession({
  canvas,
  keyboard = canvas,
  worldId,
  artifact,
  workerUrl,
  permissions,
  onMessage = () => {},
  onBox = () => {},
}) {
  const worker = moduleWorker(workerUrl ?? new URL("../core/worker.mjs", import.meta.url));
  // THE WORKER OWNS THE PICTURE: the canvas is handed over before anything
  // draws on it, and the Worker presents there itself - through WebGPU where
  // the browser has it, else on the CPU (crates/quine-browser/src/presenter.rs).
  // No pixels cross this boundary, and this page never paints.
  const surface = canvas.transferControlToOffscreen();
  const camera = appCamera((message) => worker.postMessage(message));
  const microphone = connectWorldMicrophone((message) => worker.postMessage(message));
  let opened = false;
  /** @type {string | null} Opaque Rust-published selected lease. */
  let owner = null;
  let isMain = true;
  let mainOnly = false;
  const allowed = () => !mainOnly || isMain;
  /**
   * Settles the pending `close()`, once the world handed its files back.
   * @type {(() => void) | null}
   */
  let settleClose = null;

  worker.addEventListener("message", (/** @type {MessageEvent<FromWorker>} */ { data }) => {
    if (data.type === "surface-selected") selectSurface(data.owner, data.isMain);
    else if (data.type !== "debug-result" && "owner" in data && data.owner !== owner) return;
    // Correlated replies must settle even when their returned lease retired.
    // They are data, never authority to rebind or unhide a surface.
    // Consume hidden projections as data; input and visibility remain gated.
    switch (data.type) {
      case "camera":
        if (data.operation === "capture") void camera.capture(data.token);
        else camera.cancel(data.token);
        break;
      case "microphone":
        void microphone.command(data);
        break;
      case "cursor":
        hand = data.hand;
        if (allowed()) showHand();
        break;
      // THE CANVAS STATES WHAT IT SHOWS, since no one can read its pixels
      // back: which presenter draws it, and that it has painted at all.
      case "open":
        opened = true;
        canvas.dataset.presenter = data.presenter;
        console.info(`quine: the canvas is drawn by the ${data.presenter.toUpperCase()}`);
        break;
      // THE SHELL'S STDERR is the devtools console: a native shell prints
      // these diagnostics (the CPU fallback's reason among them) to stderr.
      case "diagnostic":
        console.warn(`quine: ${data.text}`);
        break;
      case "frame":
        canvas.dataset.painted = "1";
        if (allowed()) canvas.style.visibility = "";
        break;
      case "closed":
        settleClose?.();
        break;
      case "error":
        // A close that fails still ends the session: the Worker is terminated,
        // and a terminated Worker's claim dies with it (the Web Lock and the
        // access handles are the browsing agent's, released on its death).
        if (settleClose) settleClose();
        break;
    }
    onMessage(data);
    // Backpressure ends after the consumer applies the update, not merely
    // when postMessage copied it into this page's task queue.
    if (data.type === "dock") worker.postMessage({ type: "dock-accepted", receipt: data.receipt });
  });

  // THE PICTURE BOX, in logical units plus device pixels per unit: the same two
  // facts every other shell reports, and re-reported whenever layout changes it
  // (a rotation, a collapsed conversation, a resized window).
  const box = () => ({
    width: canvas.clientWidth || 1,
    height: canvas.clientHeight || 1,
    scale: devicePixelRatio,
  });
  const which = artifact ? { artifact } : { worldId: worldId ?? "" };
  worker.postMessage(
    {
      type: "open",
      ...which,
      surface,
      web: permissions.web,
      sound: permissions.sound,
      microphone: permissions.microphone ?? true,
      camera: permissions.camera ?? true,
      ...box(),
    },
    artifact ? [surface, artifact.buffer] : [surface],
  );
  /** @type {ResizeObserver | null} */
  let resize = null;

  // Every page listener of this session goes with `close()`.
  const listening = new AbortController();
  const { signal } = listening;
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) camera.background();
    },
    { signal },
  );
  /** @param {ToWorker} msg */
  const send = (msg) => worker.postMessage(msg);
  /** Synchronous keyboard/lifecycle observations belong to the current lease.
   * @param {import("../../types/worker-messages.js").ToSurface} msg */
  const sendSurface = (msg) => {
    if (owner && allowed()) send({ ...msg, owner });
  };

  // THE HAND CURSOR goes to the surface the free cursor is over: the core
  // answers hover with one hand-or-default fact and does not know which DOM
  // element that is, so the page keeps the fact and the element together. A
  // surface the cursor moved to takes the current fact at once; the one it
  // left drops it.
  let hand = false;
  /** @type {HTMLElement} */
  let under = canvas;
  const showHand = () => {
    under.style.cursor = hand ? "pointer" : "default";
  };
  /** @param {HTMLElement} el */
  const overSurface = (el) => {
    if (el === under) return;
    under.style.cursor = "default";
    under = el;
    showHand();
  };

  /** Forward `el`'s pointer as `canvas`'s (a leaf's {canvas, generation}, or
   * nothing for the world's own canvas). */
  /**
   * @param {HTMLElement} el
   * @param {import("../../types/worker-messages.js").LeafFields} [canvasFields]
   * @param {{onDown?: () => void}} [options]
   * @param {string | null} [lease] Captured once; asynchronous callbacks never retag.
   */
  const input = (el, canvasFields = {}, options = {}, lease = owner) =>
    surfaceInput(
      el,
      (msg) => {
        if (lease && lease === owner && allowed()) send({ ...msg, ...canvasFields, owner: lease });
      },
      {
        ...options,
        onHover: () => overSurface(el),
      },
    );
  // A PRESS ON A SURFACE PUTS THE KEYBOARD IN THE APP: the root canvas and
  // every canvas leaf focus the keyboard element, so keys reach the world
  // only while the user is in the app - never while typing into the chat.
  // A press on the app's own HTML focuses what the browser focuses: an HTML
  // control, else the nearest focusable ancestor, which is the keyboard
  // element (it is focusable for that).
  const focusKeyboard = () => keyboard.focus({ preventScroll: true });
  /** @type {ReturnType<typeof surfaceInput> | null} */
  let rootInput = null;
  signal.addEventListener("abort", () => rootInput?.stop());
  /** Rebind the one root canvas, never a second renderer/world.
   * @param {string} next @param {boolean} main @param {boolean} [force] */
  function selectSurface(next, main, force = false) {
    if (owner === next && !force) return;
    release();
    rootInput?.stop();
    resize?.disconnect();
    owner = next;
    isMain = main;
    hand = false;
    under.style.cursor = "default";
    canvas.style.visibility = "hidden";
    if (!force) delete canvas.dataset.painted;
    else if (allowed() && canvas.dataset.painted) canvas.style.visibility = "";
    rootInput = null;
    const observed = () => ({ width: canvas.clientWidth, height: canvas.clientHeight, scale: devicePixelRatio });
    onBox(observed());
    if (allowed()) rootInput = input(canvas, {}, { onDown: focusKeyboard }, next);
    let reported = box();
    if (allowed()) send({ type: "resize", ...reported, owner: next });
    resize = new ResizeObserver(() => {
      onBox(observed());
      if (owner !== next || !allowed()) return;
      const now = box();
      if (now.width === reported.width && now.height === reported.height && now.scale === reported.scale) return;
      reported = now;
      send({ type: "resize", ...now, owner: next });
    });
    resize.observe(canvas);
  }
  // Each surface cancels its own contacts on blur (surface-input.mjs); the
  // keyboard releases every held key when focus leaves the app, or enters a
  // control that keeps its keys (its key-ups no longer reach the world).
  // THE KEYS THE WORLD HOLDS, by physical key (`code`: a release under
  // shift names another `key`, "A" for "a"): only their releases cross, so
  // an HTML control's key and a key pressed outside the app never reach
  // `on-key-up` alone.
  /** @type {Set<string>} */
  const held = new Set();
  const release = () => {
    held.clear();
    sendSurface({ type: "blur" });
  };
  window.addEventListener("blur", release, { signal });
  keyboard.addEventListener(
    "focusout",
    (e) => {
      if (!(e.relatedTarget instanceof Node && keyboard.contains(e.relatedTarget))) release();
    },
    { signal },
  );
  keyboard.addEventListener(
    "focusin",
    (e) => {
      if (takesKeys(e.composedPath()[0])) {
        release();
        return;
      }
      // NO CARET STAYS BEHIND: focusing a canvas leaves the document's
      // selection where it was - in the chat input, after a message was sent.
      // Text that arrives without a key event (an IME, a dead key, a phone
      // keyboard, a paste) goes to the selection's editable and focuses it, so
      // it would land in the chat. The app's own keys never leave it.
      getSelection()?.removeAllRanges();
    },
    { signal },
  );
  // KeyboardEvent.key IS the browser's logical key. `code` is a physical
  // position ("KeyA") and would violate the image contract, whose :key is "a".
  // AltGr reports ctrl on some platforms but TYPES a character (a German "@"),
  // so it is never a ctrl chord.
  /** @param {KeyboardEvent} e */
  const ctrlChord = (e) => (e.ctrlKey || e.metaKey) && !e.getModifierState?.("AltGraph");
  /**
   * @param {KeyboardEvent} e
   * @param {boolean} down
   * @returns {import("../../types/worker-messages.js").ToSurface}
   */
  const keyMessage = (e, down) => ({
    type: "key",
    down,
    repeat: e.repeat,
    name: e.key === "Esc" ? "Escape" : e.key,
  });
  keyboard.tabIndex = 0;
  // WHICH KEYS ARE THE BROWSER'S: a ctrl/meta chord on a CHARACTER key (and
  // Tab/PageUp/PageDown) is a browser shortcut - reload, find, zoom, tabs - as
  // is a function key, and Tab alone is how a keyboard leaves the canvas.
  // Those keys neither reach the world nor are prevented. A chord on a named
  // key (ctrl+ArrowRight) stays the world's. ONE CHARACTER is one code point,
  // not one UTF-16 unit, so an astral key ("😀") counts as a character.
  /** @param {KeyboardEvent} e */
  const browsers = (e) =>
    // oxlint-disable-next-line typescript/no-misused-spread -- code points are the point (above)
    (ctrlChord(e) && ([...e.key].length === 1 || ["Tab", "PageUp", "PageDown"].includes(e.key))) ||
    /^F\d+$/.test(e.key) ||
    e.key === "Tab";
  // Keys arrive at the keyboard element from wherever focus is inside it -
  // the element itself, or a control in the app's shadow root (a key event
  // is composed, so it crosses the shadow boundary; `composedPath()[0]` is
  // the real target).
  keyboard.addEventListener(
    "keydown",
    (e) => {
      if (browsers(e) || keepsKey(e.composedPath()[0], e.key)) return;
      // Every other key is the world's, so the browser does not act on it too.
      e.preventDefault();
      held.add(e.code);
      sendSurface(keyMessage(e, true));
    },
    { signal },
  );
  // The release of every key the world holds crosses, wherever focus is in
  // the app: a key pressed alone and released under ctrl must still leave
  // `keys-held`.
  keyboard.addEventListener(
    "keyup",
    (e) => {
      if (held.delete(e.code)) sendSurface(keyMessage(e, false));
    },
    { signal },
  );

  return {
    worker,
    /** Launch suppresses an unwanted current Debug surface immediately, not
     * only on the next selected edge. Restoring Edit rebinds current producers. */
    setMainOnly(/** @type {boolean} */ value) {
      if (mainOnly === value) return;
      const wasAllowed = allowed();
      // Release the OLD lease before closing its producer door.
      if (wasAllowed && value && !isMain) {
        release();
        rootInput?.stop();
      }
      mainOnly = value;
      if (owner && wasAllowed !== allowed()) selectSurface(owner, isMain, true);
    },
    get isMain() {
      return isMain;
    },
    get owner() {
      return owner;
    },
    /** Post any Worker message (eval, say, resident, …), transferring
     * `transfer` (a canvas leaf's surface). */
    post: (/** @type {ToWorker} */ msg, /** @type {Transferable[]} */ transfer = []) =>
      worker.postMessage(msg, transfer),
    /** Forward a canvas leaf's pointer, hover and wheel as that leaf's
     * (`{canvas: id, generation}`); returns `{stop()}`. */
    input: (
      /** @type {HTMLElement} */ el,
      /** @type {{canvas: string, generation: number}} */ leaf,
      /** @type {string} */ lease,
    ) => input(el, leaf, { onDown: focusKeyboard }, lease),
    /**
     * CLOSE: the world writes its last boundary and hands its files back, then
     * the Worker is TERMINATED - one world per Worker, so nothing it held can
     * leak into the next world. Resolves once the files are free.
     */
    /** @param {{preview?: boolean}} [how] `preview`: the Worker waits for the
     * world's preview store already asked for (a Back, world-view.mjs). */
    async close({ preview = false } = {}) {
      camera.close();
      // Stop the device before teardown. The closing Rust session discards
      // unclaimed start recordings; only returned audio is a world asset.
      await microphone.close();
      listening.abort();
      resize?.disconnect();
      owner = null;
      if (!opened) {
        // Nothing was opened, so nothing needs writing down.
        worker.terminate();
        return Promise.resolve();
      }
      /** @type {Promise<void>} */
      const done = new Promise((resolve) => {
        settleClose = () => resolve();
      });
      send({ type: "close", preview });
      return done.finally(() => worker.terminate());
    },
  };
}
