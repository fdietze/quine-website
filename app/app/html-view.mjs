// THE APP'S HTML, as real DOM (docs/specs/2026-09-26-browser-html-dialect-design.md).
//
// The world describes its UI as Hiccup in an `:html` view method; the core
// parses it against the allowlist and posts the typed tree as JSON
// (src/html/wire.rs is the other half of this contract). This module only
// BUILDS: it never parses a string as HTML (no innerHTML anywhere), every tag
// and attribute it sets came through that allowlist, and text is always
// `textContent`.
//
// THE BOX: the app lives in a shadow root inside `#app-box`, whose `contain:
// paint` and `overflow: hidden` (style.css) keep anything the app draws or
// styles inside its rectangle - the host's chrome is outside it by geometry,
// and the app's stylesheet cannot reach the page.
//
// A DIFF, NOT A REBUILD: each frame is applied against the DOM the last one
// made by the page's one DOM diff (dom-diff.mjs), matching children by `:key`
// (else by position and tag), so focus, selection and in-progress typing
// survive a re-render. This view adds what only the app's HTML has, through
// the diff's hooks: live control values, events, pictures, canvas leaves. A control the user
// just typed into keeps its value until a frame ANSWERS that input (the
// frame's `acked` reaches the event's sequence number): a frame built before
// the keystroke must not undo it.
//
// EVENTS BY ID: a listener posts only the node's id, the event name and its
// payload; the handler stays in the image.
//
// A CANVAS LEAF hosts a scene: its surface is handed to the world's Worker
// once, when the element is made, with a generation minted here and never
// reused; its box, pointer, hover and wheel reach the core as that leaf's, and it is
// detached when it leaves the page. The same `:id` is the same canvas, so the
// diff never reuses a canvas element for another id.

import { domDiff } from "./dom-diff.mjs";
import { answerLook, previewHtml } from "./html-look.mjs";

/** @typedef {import("../../types/html-frame.js").VNode} VNode */
/** @typedef {import("../../types/worker-messages.js").ToWorker} ToWorker */
/**
 * What this view keeps ON an element it built (dom-diff.mjs): the vnode it
 * last applied, the sequence number of its last input or change, and its
 * event listeners.
 * @typedef {import("./dom-diff.mjs").ViewElement} ViewElement */
/**
 * A picture the view names (`b3:<hash>`), by handle.
 * @typedef {object} PictureEntry
 * @property {string | null} url  the blob URL once the world answered
 * @property {[Element, string][]} waiting  element and attribute to set then
 * @property {number} [token]  the latest question's token
 * @property {number} [askedAt]  `repairs` when it was asked
 * @property {boolean} [missing]  the world does not store it
 */
/**
 * A canvas leaf handed to the Worker.
 * @typedef {object} Leaf
 * @property {string} id
 * @property {number} generation
 * @property {{width: number, height: number, scale: number} | null} reported  the box last reported
 * @property {number} resizes  how many boxes were reported
 * @property {{resizes: number, width: number, height: number} | null} shown  the Worker's newest frame for it
 * @property {() => void} stop
 */

/** What a picture or media URL may be when it is set. The core already
 * dropped every network URL the session may not load (no Web interface), so
 * `https:` here is one it allows; a world picture (`b3:`) is fetched from the
 * world as bytes and shown from a blob. */
const MEDIA_SCHEMES = ["data:", "blob:", "https:"];

const PICTURE = /^b3:[0-9a-f]{64}$/;

/** How long a `look` waits for the canvas leaves to show their current
 * frames before it draws what they show: a new leaf's first frame waits for
 * its GPU surface, which takes over a second on a loaded machine, and the
 * look itself times out at 5 s (quine::vision). */
const LEAF_FRAME_WAIT_MS = 3000;

/**
 * A canvas leaf's box as the world is told it: logical px plus device px per unit.
 * @param {HTMLElement} el
 */
const leafBox = (el) => ({ width: el.clientWidth, height: el.clientHeight, scale: devicePixelRatio });

/** Does canvas leaf `el` show any frame yet? Its corner pixel is opaque. A
 * fresh canvas always has a 2D context. */
const probe = /** @type {CanvasRenderingContext2D} */ (
  document.createElement("canvas").getContext("2d", { willReadFrequently: true })
);
/** @param {HTMLCanvasElement} el */
const showsAFrame = (el) => {
  probe.clearRect(0, 0, 1, 1);
  probe.drawImage(el, 0, 0, 1, 1, 0, 0, 1, 1);
  return probe.getImageData(0, 0, 1, 1).data[3] > 0;
};

/**
 * @param {{width: number, height: number, scale: number}} a
 * @param {{width: number, height: number, scale: number} | null} b
 */
const sameBox = (a, b) => b != null && a.width === b.width && a.height === b.height && a.scale === b.scale;

/** THE PANE'S DEFAULTS, one sheet BEFORE the app's (so any app rule wins):
 * the shell's text stack (style.css `--font-sans`, which inherits into the
 * shadow root), and form controls that take it too - a control's UA style
 * names its own face, which headless Chromium resolves to a serif. */
const PANE_DEFAULTS = new CSSStyleSheet();
PANE_DEFAULTS.replaceSync(
  ":host { font-family: var(--font-sans); } button, input, select, textarea { font-family: inherit; }",
);

/** Attributes that are live PROPERTIES of a control, synced under the acked rule. */
const LIVE = new Set(["value", "checked"]);

/**
 * @param {HTMLElement} box  the app's rectangle (#app-box); hidden while the
 *   canvas is shown.
 * @param {(msg: ToWorker, transfer?: Transferable[]) => void} post  sends one
 *   message to the world's Worker, transferring `transfer`.
 * @param {(el: HTMLElement, leaf: {canvas: string, generation: number}) => {stop(): void}} input
 *   forwards a canvas leaf's pointer, hover and wheel (world-session.mjs).
 */
export function mountHtmlView(box, post, input) {
  // The shadow HOST is a child of the box, not the box: the box's own rules
  // (containment, clipping) then stay the page's, whatever `:host` rules the
  // app's stylesheet writes. The host fills the box and scrolls (style.css).
  const host = document.createElement("div");
  host.id = "app";
  box.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const appSheet = new CSSStyleSheet();
  shadow.adoptedStyleSheets = [PANE_DEFAULTS, appSheet];
  /** @type {string | null} */
  let appStyle = null;
  let seq = 0;
  let acked = 0;
  /** World pictures by handle: the blob URL once the world answered, else
   * the attributes waiting for it. Only pictures the CURRENT frame names are
   * kept: each frame's diff visits every attribute, so the handles it did not
   * visit are released (their blob URLs revoked) and fetched again should
   * they return.
   * @type {Map<string, PictureEntry>}
   */
  const pictures = new Map();
  /** @type {Set<string>} */
  let usedPictures = new Set();
  // Every question about a picture has its own token, and only the answer to
  // an entry's LATEST question counts. `repairs` is the core's count of
  // pictures stored after the view named them missing (the frame's
  // `pictures`): a "missing" answer to a question asked before the count
  // moved is asked again, and a picture settled as missing is asked about
  // again only when it moves - once per repair, however often the view
  // re-renders.
  let tokens = 0;
  let repairs = 0;
  /**
   * @param {string} id
   * @param {PictureEntry} entry
   */
  const ask = (id, entry) => {
    tokens += 1;
    entry.token = tokens;
    entry.askedAt = repairs;
    post({ type: "picture", id, token: tokens });
  };

  /** @param {Set<string>} keep */
  const releasePictures = (keep) => {
    for (const [id, entry] of pictures) {
      if (keep.has(id)) continue;
      if (entry.url) URL.revokeObjectURL(entry.url);
      pictures.delete(id);
    }
  };

  /** Show world picture `id` in `el`'s attribute `name`, asking the world
   * once per picture.
   * @param {Element} el
   * @param {string} name
   * @param {string} id
   */
  const showPicture = (el, name, id) => {
    usedPictures.add(id);
    let entry = pictures.get(id);
    if (!entry) {
      entry = { url: null, waiting: [] };
      pictures.set(id, entry);
      ask(id, entry);
    }
    if (entry.missing) return;
    if (entry.url) {
      if (el.getAttribute(name) !== entry.url) el.setAttribute(name, entry.url);
    } else {
      entry.waiting.push([el, name]);
    }
  };

  // HOW THE HTML FITS ITS PANE: the content's scroll size against the
  // host's visible size, told to the world whenever either can change (a
  // frame, a load, the chat shown or hidden), so the host can note
  // content the person must scroll to see - which `look`, drawing the pane,
  // does not show (src/notes.rs html-fit). 0x0 while no HTML is shown.
  /** @type {{width: number, height: number, paneWidth: number, paneHeight: number, frame: number} | null} */
  let fit = null;
  /** How many frames `show` took: the Worker counts the frames it posted,
   * and drops a fit that names a frame it has already replaced. */
  let frames = 0;
  const reportFit = () => {
    const size = box.hidden
      ? { width: 0, height: 0, paneWidth: 0, paneHeight: 0 }
      : {
          width: host.scrollWidth,
          height: host.scrollHeight,
          paneWidth: host.clientWidth,
          paneHeight: host.clientHeight,
        };
    const now = { ...size, frame: frames };
    const last = fit;
    if (last && /** @type {(keyof typeof now)[]} */ (Object.keys(now)).every((k) => now[k] === last[k])) {
      return;
    }
    fit = now;
    post({ type: "html-fit", ...now });
  };
  // Between frames the content changes size only when the pane or the root
  // element resizes (observed; the root anew when a frame replaces it), or
  // when a picture or a video's metadata finishes loading, which can grow the
  // scroll extent past a fixed-size root without resizing it.
  const fitObserver = new ResizeObserver(reportFit);
  fitObserver.observe(host);
  /** @type {Element | null} */
  let observedRoot = null;
  for (const type of ["load", "loadedmetadata"]) shadow.addEventListener(type, reportFit, true);

  /** The canvas leaves the page has handed over, BY ELEMENT (two elements of
   * one id can coexist for a moment while a diff replaces one): el -> { id,
   * generation, stop }.
   * @type {Map<HTMLCanvasElement, Leaf>}
   */
  const leaves = new Map();
  let generations = 0;

  // NOTHING IN THE BOX NAVIGATES THE PAGE: a form submits to its handler and
  // a link does not replace the shell (links open through the shell later).
  shadow.addEventListener("submit", (e) => e.preventDefault(), true);
  // A LINK OPENS A NEW TAB, and only on a USER's click: a trusted event,
  // never a synthetic one, and never in place of the shell. The core already
  // allowed only https:, http: and mailto: in `href`.
  shadow.addEventListener(
    "click",
    (e) => {
      const link = e.target instanceof Element && e.target.closest("a[href]");
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute("href");
      if (e.isTrusted && href) window.open(href, "_blank", "noopener,noreferrer");
    },
    true,
  );

  /**
   * Post one DOM event of `el`.
   * @param {ViewElement} el  built, so it has a vnode; a handler implies an id
   * @param {string} event
   * @param {unknown} payload
   */
  const send = (el, event, payload) => {
    seq += 1;
    if (event === "input" || event === "change") el.__pending = seq;
    post({ type: "html-event", id: el.__v?.id ?? "", event, seq, payload });
  };

  /**
   * What event `e` of `el` tells the handler.
   * @param {ViewElement} el
   * @param {string} event
   * @param {Event} e
   */
  const payloadOf = (el, event, e) => {
    switch (event) {
      case "input":
      case "change":
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          return { checked: el.checked };
        }
        // What the element holds as its value, as it is (none: no field).
        return { value: /** @type {{value?: unknown}} */ (el).value };
      case "submit":
        return el instanceof HTMLFormElement
          ? { values: [...new FormData(el)].filter(([, v]) => typeof v === "string") }
          : {};
      case "keydown":
        return e instanceof KeyboardEvent ? { key: e.key } : {};
      case "toggle":
        return el instanceof HTMLDetailsElement || el instanceof HTMLDialogElement ? { open: el.open } : {};
      default:
        return {};
    }
  };

  /**
   * Listen to exactly the events the node has handlers for.
   * @param {ViewElement} el
   * @param {string[]} events
   */
  const syncEvents = (el, events) => {
    const listeners = (el.__listeners ??= new Map());
    for (const [name, fn] of listeners) {
      if (!events.includes(name)) {
        el.removeEventListener(name, fn);
        listeners.delete(name);
      }
    }
    for (const name of events) {
      if (listeners.has(name)) continue;
      /** @param {Event} e */
      const fn = (e) => {
        if (name === "submit") e.preventDefault();
        send(el, name, payloadOf(el, name, e));
      };
      el.addEventListener(name, fn);
      listeners.set(name, fn);
    }
  };

  /**
   * @param {ViewElement} el
   * @param {string} name
   * @param {string | true} value
   */
  const setAttr = (el, name, value) => {
    if (LIVE.has(name) && "value" in el) {
      // A control (input, select, textarea, ...): it has a value property.
      const control = /** @type {ViewElement & {value: string, checked?: boolean}} */ (el);
      // A control the user changed keeps its state until a frame has seen
      // that change; then the image's value is the truth.
      if ((control.__pending ?? 0) > acked) return;
      if (name === "checked") {
        if (control.checked !== (value === true)) control.checked = value === true;
      } else if (control.value !== String(value)) {
        control.value = String(value);
      }
      return;
    }
    if (name === "src" || name === "poster") {
      if (typeof value === "string" && PICTURE.test(value)) return showPicture(el, name, value);
      if (!MEDIA_SCHEMES.some((s) => String(value).startsWith(s))) return;
    }
    if (value === true) {
      if (!el.hasAttribute(name)) el.setAttribute(name, "");
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  };

  /**
   * @param {ViewElement} el
   * @param {string} name
   */
  const removeAttr = (el, name) => {
    if (LIVE.has(name) && "value" in el) {
      const control = /** @type {ViewElement & {value: string, checked?: boolean}} */ (el);
      if ((control.__pending ?? 0) > acked) return;
      if (name === "checked") control.checked = false;
      else control.value = "";
      return;
    }
    el.removeAttribute(name);
  };

  // THE DIFF, with this view's own rules (dom-diff.mjs): live values are set
  // after the children, a node's events follow its vnode, a new canvas hands
  // its surface over, and a canvas IS its id.
  const { patchChildren } = domDiff({
    setAttr,
    removeAttr,
    late: (name) => LIVE.has(name),
    patched: (el, v) => syncEvents(el, v.events),
    // The core gives every canvas leaf an id (src/html/): a leaf IS its id.
    created: (el, v) => {
      if (el instanceof HTMLCanvasElement) attachLeaf(el, v.id ?? "");
    },
    same: (el, v) => v.tag !== "canvas" || el.__v?.id === v.id,
  });

  /** Hand a new canvas leaf to the world: its surface, its box as layout
   * changes it, and its pointer.
   * @param {HTMLCanvasElement} el
   * @param {string} id
   */
  const attachLeaf = (el, id) => {
    generations += 1;
    const generation = generations;
    const surface = el.transferControlToOffscreen();
    post({ type: "canvas-attach", id, generation, surface }, [surface]);
    /** @type {Omit<Leaf, "stop">} */
    const leaf = {
      id,
      generation,
      /** The box last reported, and how many boxes were reported. */
      reported: null,
      resizes: 0,
      /** The Worker's newest frame for it (its `canvas-frame` edge): how
       * many reported boxes it was laid out for, and its device-px size. */
      shown: null,
    };
    const box = () => {
      const now = leafBox(el);
      if (sameBox(now, leaf.reported)) return;
      leaf.reported = now;
      leaf.resizes += 1;
      post({ type: "canvas-resize", id, generation, ...now });
    };
    const resize = new ResizeObserver(box);
    resize.observe(el);
    // Pointer, hover and wheel exactly as the root canvas takes them - the
    // same adapter (surface-input.mjs) - in the leaf's own coordinates.
    const pointer = input(el, { canvas: id, generation });
    leaves.set(
      el,
      Object.assign(leaf, {
        stop() {
          resize.disconnect();
          pointer.stop();
          post({ type: "canvas-detach", id, generation });
        },
      }),
    );
  };

  /** Does every leaf on the page show a frame of the box it has now? The
   * box it has now must be the one last reported (a relayout the
   * ResizeObserver has not reported yet is not), the Worker's newest frame
   * must be laid out for that report, and the element must show that frame
   * already: a frame reaches the page's element some time after the Worker
   * presented it. The element takes the frame's size with it, and a leaf
   * that has shown no frame yet is transparent where every frame is opaque
   * (the presenter clears it) - the size alone cannot tell a first frame of
   * the element's default 300x150 from none. An empty box shows nothing to
   * wait for. */
  const leavesCurrent = () =>
    [...leaves].every(([el, { reported, resizes, shown }]) => {
      const now = leafBox(el);
      if (!now.width || !now.height) return true;
      return (
        sameBox(now, reported) &&
        shown?.resizes === resizes &&
        el.width === shown.width &&
        el.height === shown.height &&
        showsAFrame(el)
      );
    });

  /** Detach every leaf whose element left the page. */
  const sweepLeaves = () => {
    for (const [el, leaf] of leaves) {
      if (!el.isConnected || el.getRootNode() !== shadow) {
        leaf.stop();
        leaves.delete(el);
      }
    }
  };

  return {
    /**
     * Draw what a parked `look` asks for and send the answer (html-look.mjs).
     * @param {{token: number, target?: string, crop?: number[]}} request
     */
    async look(request) {
      // A LOOK SEES THE LEAVES' CURRENT FRAMES: a leaf the last HTML frame
      // made or resized has not been drawn at its new box yet, and would be
      // captured empty or stale. Wait for its frame, boundedly: a leaf the
      // world never draws must not park the look forever.
      const deadline = performance.now() + LEAF_FRAME_WAIT_MS;
      while (!leavesCurrent() && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      post(await answerLook(host, request));
    },
    /** The view as it is shown now, for the world's preview (html-look.mjs
     * `previewHtml`), or null when no HTML view is shown. */
    preview() {
      return box.hidden ? Promise.resolve(null) : previewHtml(host);
    },
    /** The Worker presented a leaf's frame of `width` x `height` device
     * px, laid out for its `resizes`-th reported box.
     * @param {string} id
     * @param {number} generation
     * @param {number} resizes
     * @param {number} width
     * @param {number} height
     */
    leafFrame(id, generation, resizes, width, height) {
      for (const [, leaf] of leaves) {
        if (leaf.id === id && leaf.generation === generation) leaf.shown = { resizes, width, height };
      }
    },
    /** A world picture arrived (its PNG bytes), or not (`png` absent: the
     * world does not store it, and the view fault says so).
     * @param {string} id
     * @param {number} token
     * @param {Uint8Array<ArrayBuffer>} [png]
     */
    picture(id, token, png) {
      const entry = pictures.get(id);
      if (!entry || entry.token !== token || entry.url || entry.missing) return;
      if (!png && repairs > (entry.askedAt ?? 0)) {
        // A picture was stored while this was asked: ask again, not settle.
        ask(id, entry);
        return;
      }
      if (!png) {
        // Asked once: the view fault already told the resident.
        entry.missing = true;
        entry.waiting = [];
        return;
      }
      entry.url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
      for (const [el, name] of entry.waiting) {
        // Still the picture this element wants: the view may have moved on.
        const wanted = new Map(/** @type {ViewElement} */ (el).__v?.attrs ?? []).get(name);
        if (wanted === id) el.setAttribute(name, entry.url);
      }
      entry.waiting = [];
    },
    /**
     * Say how a leaf is drawn ("gpu" or "cpu"), as the root canvas says it.
     * @param {string} id
     * @param {number} generation
     * @param {string} presenter
     */
    leafPresenter(id, generation, presenter) {
      for (const [el, leaf] of leaves) {
        if (leaf.id === id && leaf.generation === generation) el.dataset.presenter = presenter;
      }
    },
    /**
     * Show one HTML frame (the JSON the core posted), or "" to hide the box.
     * @param {string} frameJson
     */
    show(frameJson) {
      frames += 1;
      if (!frameJson) {
        box.hidden = true;
        shadow.replaceChildren();
        sweepLeaves();
        releasePictures(new Set());
        reportFit();
        return false;
      }
      /** @type {import("../../types/html-frame.js").HtmlFrame} */
      const frame = JSON.parse(frameJson);
      acked = frame.acked;
      if (frame.style !== appStyle) {
        appSheet.replaceSync(frame.style);
        appStyle = frame.style;
      }
      // A picture the world did not have is asked about again once a repair
      // happened (the core then resends the frame with a new count).
      if (frame.pictures !== repairs) {
        repairs = frame.pictures;
        for (const [id, entry] of pictures) if (entry.missing) pictures.delete(id);
      }
      usedPictures = new Set();
      patchChildren(shadow, [frame.tree]);
      releasePictures(usedPictures);
      sweepLeaves();
      box.hidden = false;
      const root = shadow.firstElementChild;
      if (root !== observedRoot) {
        if (observedRoot) fitObserver.unobserve(observedRoot);
        if (root) fitObserver.observe(root);
        observedRoot = root;
      }
      reportFit();
      return true;
    },
  };
}
