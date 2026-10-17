// THE POINTER ON ONE SURFACE: the world's own canvas and every canvas leaf of
// an :html view take input through THIS adapter, so a leaf cannot be the
// weaker copy of the root (one code path, correct for both by construction).
//
// A SHELL FORWARDS, IT DOES NOT INTERPRET: hit-testing, capture, click
// synthesis and scrolling are the core's. This module reports what the
// platform says - in the surface's own logical coordinates - and the caller's
// `send` names the surface, so every pointer message carries its picture.

/** A line of wheel, in logical px - the core's own unit (src/input_machine.rs). */
const WHEEL_LINE_PX = 40;

/**
 * Forward `el`'s pointer, hover and wheel.
 *
 * @param {HTMLElement} el  the surface.
 * @param {(msg: import("../../types/worker-messages.js").SurfaceMessage) => void} send  posts one pointer/hover/wheel message
 *   for THIS surface.
 * @param {object} [o]
 * @param {() => void} [o.onDown]  a press began here (the root takes focus).
 * @param {() => void} [o.onHover]  the free cursor is over this surface now.
 * @returns {{ stop(): void }}  removes every listener this adapter added.
 */
export function surfaceInput(el, send, { onDown = () => {}, onHover = () => {} } = {}) {
  // A BROWSER POINTER IS A CONTACT from down through exactly one terminal
  // event. Pointer capture keeps release outside the surface observable;
  // lifecycle loss cancels instead of leaving an owner stranded; every
  // coalesced position reaches the core so hidden travel can veto a click.
  /** @type {Map<number, {x: number, y: number}>} */
  const contacts = new Map();
  /** @param {MouseEvent} e */
  const local = (e) => {
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  /**
   * @param {PointerEvent} e
   * @param {import("../../types/worker-messages.js").PointerPhase} phase
   */
  const sendPointer = (e, phase) => {
    const pos = local(e);
    send({ type: "pointer", pointerId: e.pointerId, phase, ...pos });
    if (phase !== "up" && phase !== "cancel") contacts.set(e.pointerId, pos);
  };
  /**
   * Every position of `e`, ending with `e`'s own.
   * @param {PointerEvent} e
   * @returns {[...PointerEvent[], PointerEvent]}
   */
  const samples = (e) => {
    const batch = e.getCoalescedEvents?.() ?? [];
    return batch.length && batch[batch.length - 1].timeStamp === e.timeStamp
      ? /** @type {[...PointerEvent[], PointerEvent]} */ (batch)
      : [...batch, e];
  };
  // Every listener this adapter adds goes with `stop()`.
  const listening = new AbortController();
  const { signal } = listening;
  el.addEventListener(
    "pointerdown",
    (e) => {
      el.setPointerCapture(e.pointerId);
      onDown();
      sendPointer(e, "down");
    },
    { signal },
  );
  el.addEventListener(
    "pointermove",
    (e) => {
      if (contacts.has(e.pointerId)) {
        for (const sample of samples(e)) sendPointer(sample, "move");
      } else {
        onHover();
        send({ type: "hover", ...local(e) });
      }
    },
    { signal },
  );
  for (const [type, phase] of /** @type {const} */ ([
    ["pointerup", "up"],
    ["pointercancel", "cancel"],
  ])) {
    el.addEventListener(
      type,
      (e) => {
        if (!contacts.has(e.pointerId)) return;
        // Intermediate coalesced travel precedes the one terminal sample.
        const batch = samples(e);
        for (const sample of batch.slice(0, -1)) sendPointer(sample, "move");
        sendPointer(batch[batch.length - 1], phase);
        contacts.delete(e.pointerId);
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      },
      { signal },
    );
  }
  el.addEventListener(
    "lostpointercapture",
    (e) => {
      const pos = contacts.get(e.pointerId);
      if (!pos) return;
      send({ type: "pointer", pointerId: e.pointerId, phase: "cancel", ...pos });
      contacts.delete(e.pointerId);
    },
    { signal },
  );
  // THE WHEEL, in the core's convention: logical px, POSITIVE = toward the top
  // of the content. The DOM's deltaY has the opposite sign and one of three
  // units; a page is the surface's height. Not passive: a surface takes the
  // wheel as it takes touch (touch-action: none), so the page must not ALSO
  // scroll - or zoom.
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const unit =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_PX
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? el.clientHeight
            : 1;
      const dy = -e.deltaY * unit;
      if (dy === 0) return;
      // CTRL+WHEEL IS ZOOM, not scroll: it is how Chromium, Firefox and Safari
      // report a trackpad pinch (Safari since WebKit r277772), and a ctrl-held
      // wheel cannot be told apart from it. The core makes each one a whole
      // one-step pan-zoom gesture (`Step::wheel_zoom`) - a wheel has no end
      // event, and no timer here guesses one.
      send({ type: e.ctrlKey ? "wheel-zoom" : "wheel", ...local(e), dy });
    },
    { passive: false, signal },
  );
  el.addEventListener(
    "pointerleave",
    () => {
      // A free cursor outside the surface can only CLEAR hover, and it has no
      // position here: no x/y (the core hands the image :pos nil).
      send({ type: "hover" });
    },
    { signal },
  );
  const cancelContacts = () => {
    for (const [pointerId, pos] of contacts) {
      send({ type: "pointer", pointerId, phase: "cancel", ...pos });
    }
    contacts.clear();
  };
  window.addEventListener("blur", cancelContacts, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) cancelContacts();
    },
    { signal },
  );
  el.style.touchAction = "none";
  return {
    stop() {
      listening.abort();
    },
  };
}
