// ONE OPEN WORLD, AS A PAGE SEES IT: a Worker that owns the image, a canvas
// that shows it, and the input that reaches it.
//
// A SHELL IS A SURFACE, A LIFECYCLE AND INPUT - nothing here interprets the
// world. Hit-testing, capture, click synthesis and scrolling are the core's,
// identically on every shell; this module forwards what the platform reports
// and paints what the Worker hands back. The product's world view and the test
// fixtures both run THIS code, so what the suites prove is what ships.

/** A line of wheel, in logical px - the core's own unit (src/input_machine.rs). */
const WHEEL_LINE_PX = 40;

/**
 * Open `worldId` in a fresh Worker, drawing into `canvas`.
 *
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas  the picture box; its CSS box is the
 *   rectangle the world is laid out in, reported as it changes.
 * @param {string} o.worldId
 * @param {string|URL} [o.workerUrl]  the Worker script; tests substitute a
 *   wrapper that scripts the provider, the product never does.
 * @param {(msg: any) => void} [o.onMessage]  every message the Worker posts
 *   that is not a frame or a cursor (open, status, dock, diagnostic, eval, …).
 */
export function openWorldSession({ canvas, worldId, workerUrl, onMessage = () => {} }) {
  const worker = new Worker(workerUrl ?? new URL("../core/worker.mjs", import.meta.url), {
    type: "module",
  });
  const ctx = canvas.getContext("2d");
  let opened = false;
  /** Settles the pending `close()`, once the world handed its files back. */
  let settleClose = null;

  worker.addEventListener("message", ({ data }) => {
    switch (data.type) {
      case "frame": {
        // Straight RGBA in the exact layout ImageData takes, so presenting is
        // a copy and nothing else.
        const image = new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height);
        if (canvas.width !== data.width) canvas.width = data.width;
        if (canvas.height !== data.height) canvas.height = data.height;
        ctx.putImageData(image, 0, 0);
        break;
      }
      case "cursor":
        canvas.style.cursor = data.hand ? "pointer" : "default";
        break;
      case "open":
        opened = true;
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
  });

  // THE PICTURE BOX, in logical units plus device pixels per unit: the same two
  // facts every other shell reports, and re-reported whenever layout changes it
  // (a rotation, a collapsed conversation, a resized window).
  const box = () => ({
    width: canvas.clientWidth || 1,
    height: canvas.clientHeight || 1,
    scale: devicePixelRatio,
  });
  worker.postMessage({ type: "open", worldId, ...box() });
  let reported = box();
  const resize = new ResizeObserver(() => {
    const now = box();
    if (now.width === reported.width && now.height === reported.height && now.scale === reported.scale) {
      return;
    }
    reported = now;
    worker.postMessage({ type: "resize", ...now });
  });
  resize.observe(canvas);

  // A BROWSER POINTER IS A CONTACT from down through exactly one terminal
  // event. Pointer capture keeps release outside the canvas observable;
  // lifecycle loss cancels instead of leaving an owner stranded; every
  // coalesced position reaches the core so hidden travel can veto a click.
  const contacts = new Map();
  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const sendPointer = (e, phase) => {
    const pos = local(e);
    worker.postMessage({ type: "pointer", pointerId: e.pointerId, phase, ...pos });
    if (phase !== "up" && phase !== "cancel") contacts.set(e.pointerId, pos);
  };
  const samples = (e) => {
    const batch = e.getCoalescedEvents?.() ?? [];
    return batch.length && batch.at(-1).timeStamp === e.timeStamp ? batch : [...batch, e];
  };
  const listeners = [];
  const on = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  };
  on(canvas, "pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    // The canvas takes keyboard focus with the press, so keys reach the world
    // only while the person is in it - never while typing into the chat.
    canvas.focus({ preventScroll: true });
    sendPointer(e, "down");
  });
  on(canvas, "pointermove", (e) => {
    if (contacts.has(e.pointerId)) {
      for (const sample of samples(e)) sendPointer(sample, "move");
    } else {
      worker.postMessage({ type: "hover", ...local(e) });
    }
  });
  for (const [type, phase] of [["pointerup", "up"], ["pointercancel", "cancel"]]) {
    on(canvas, type, (e) => {
      if (!contacts.has(e.pointerId)) return;
      // Intermediate coalesced travel precedes the one terminal sample.
      const batch = samples(e);
      for (const sample of batch.slice(0, -1)) sendPointer(sample, "move");
      sendPointer(batch.at(-1), phase);
      contacts.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    });
  }
  on(canvas, "lostpointercapture", (e) => {
    const pos = contacts.get(e.pointerId);
    if (!pos) return;
    worker.postMessage({ type: "pointer", pointerId: e.pointerId, phase: "cancel", ...pos });
    contacts.delete(e.pointerId);
  });
  // THE WHEEL, in the core's convention: logical px, POSITIVE = toward the top
  // of the content. The DOM's deltaY has the opposite sign and one of three
  // units; a page is the canvas's height. Not passive: the page must not ALSO
  // scroll.
  on(
    canvas,
    "wheel",
    (e) => {
      // CTRL+WHEEL IS ZOOM, not scroll: it is what a trackpad pinch and a
      // ctrl-held wheel both arrive as, and the page zoom stays the browser's.
      if (e.ctrlKey) return;
      e.preventDefault();
      const unit =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight
        : 1;
      const dy = -e.deltaY * unit;
      if (dy === 0) return;
      worker.postMessage({ type: "wheel", ...local(e), dy });
    },
    { passive: false },
  );
  on(canvas, "pointerleave", () => {
    // A free cursor outside the scene can only CLEAR hover.
    worker.postMessage({ type: "hover", x: -1, y: -1 });
  });
  const cancelContacts = () => {
    for (const [pointerId, pos] of contacts) {
      worker.postMessage({ type: "pointer", pointerId, phase: "cancel", ...pos });
    }
    contacts.clear();
  };
  const blur = () => {
    cancelContacts();
    worker.postMessage({ type: "blur" });
  };
  on(window, "blur", blur);
  on(canvas, "blur", () => worker.postMessage({ type: "blur" }));
  on(document, "visibilitychange", () => {
    if (document.hidden) cancelContacts();
  });
  // KeyboardEvent.key IS the browser's logical key. `code` is a physical
  // position ("KeyA") and would violate the image contract, whose :key is "a".
  // AltGr reports ctrl on some platforms but TYPES a character (a German "@"),
  // so it is never a ctrl chord.
  const ctrlChord = (e) => (e.ctrlKey || e.metaKey) && !e.getModifierState?.("AltGraph");
  const keyMessage = (e, down) => ({
    type: "key",
    down,
    repeat: e.repeat,
    name: e.key === "Esc" ? "Escape" : e.key,
    logo: e.metaKey,
  });
  canvas.tabIndex = 0;
  // WHICH KEYS ARE THE BROWSER'S: a ctrl/meta chord on a CHARACTER key (and
  // Tab/PageUp/PageDown) is a browser shortcut - reload, find, zoom, tabs - as
  // is a function key, and Tab alone is how a keyboard leaves the canvas.
  // Those keys neither reach the world nor are prevented. A chord on a named
  // key (ctrl+ArrowRight) stays the world's. ONE CHARACTER is one code point,
  // not one UTF-16 unit, so an astral key ("😀") counts as a character.
  const browsers = (e) =>
    (ctrlChord(e) && ([...e.key].length === 1 || ["Tab", "PageUp", "PageDown"].includes(e.key))) ||
    /^F\d+$/.test(e.key) ||
    e.key === "Tab";
  on(canvas, "keydown", (e) => {
    if (browsers(e)) return;
    // Every other key is the world's, so the browser does not act on it too.
    e.preventDefault();
    worker.postMessage(keyMessage(e, true));
  });
  // Every release crosses: a key pressed alone and released under ctrl must
  // still leave `keys-held`, and a release nobody pressed changes nothing.
  on(canvas, "keyup", (e) => worker.postMessage(keyMessage(e, false)));

  return {
    worker,
    /** Post any Worker message (eval, say, resident, …). */
    post: (msg) => worker.postMessage(msg),
    /**
     * CLOSE: the world writes its last boundary and hands its files back, then
     * the Worker is TERMINATED - one world per Worker, so nothing it held can
     * leak into the next world. Resolves once the files are free.
     */
    close() {
      for (const off of listeners) off();
      resize.disconnect();
      if (!opened) {
        // Nothing was opened, so nothing needs writing down.
        worker.terminate();
        return Promise.resolve();
      }
      const done = new Promise((resolve) => {
        settleClose = resolve;
      });
      worker.postMessage({ type: "close" });
      return done.finally(() => worker.terminate());
    },
  };
}
