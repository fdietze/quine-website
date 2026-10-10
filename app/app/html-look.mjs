// LOOK AT THE APP'S OWN HTML: the picture of an `:html` view, drawn by the
// page itself. The shadow root's DOM (html-view.mjs) is cloned with its live
// state, wrapped in an SVG <foreignObject> and drawn into a canvas - the
// browser's own layout engine renders the copy, so the picture is the page's
// picture without a screenshot API (a web page has none).
//
// An SVG drawn as an image is ISOLATED: it loads nothing, runs nothing and
// sees no document styles. So everything it needs is carried in: the app
// stylesheet as a <style>, the host's inherited text style on the wrapper,
// every picture as a data: URL made from its decoded image. Canvas leaves and
// form controls are not drawn by the engine's SVG at all: each is a HOLE of
// its exact live box, so layout is unchanged, whose background is our own
// picture of it - a leaf's own pixels, a control painted schematically
// (html-look-controls.mjs) - in every engine alike. Inside the copy, the
// holes are stacked and clipped like the live elements.
//
// SCROLLED AS SHOWN: an image never scrolls, so every element of the copy
// sits at its initial scroll position. Each live element scrolled away from
// it has its CHILDREN shifted back by the offset (`shiftScrolled`), by
// relative positioning - the one offset that works on inline boxes too and
// moves a box without changing anyone's layout, so flex and grid containers
// keep their items and no wrapper box is added; a bare text run is wrapped in
// an inline span to be moved. The offset is measured from the scroll origin,
// so a column-reverse log (origin at its end, offsets <= 0) is shifted
// alike, and holes inside a scroller move with their siblings.
// KNOWN GAPS: a scroller's scrollbar is
// drawn at its initial position; sticky and fixed children are left where
// the copy lays them out; an absolute child is moved only when its scroller
// is positioned (its containing block), and an absolute element deeper down
// anchored above a moved child is re-anchored to it; the content of a
// display:contents child, the scroller's ::before/::after and
// a `background-attachment: local` stay unscrolled; CSS that reads scroll
// state (scroll-state() container queries, scroll-driven animations through
// scroll-timeline/view-timeline) sees the copy's unscrolled state.

import { errorMessage } from "./error-message.mjs";
import { CONTROLS, controlState, paintControl } from "./html-look-controls.mjs";

/**
 * One look's reads of the live page (`lookHtml`).
 * @typedef {object} Snap
 * @property {Map<Element, number>} baselines  inline controls' baseline depths
 * @property {number} scale  device px per css px
 * @property {({id: string, rect: number[]} & import("./html-look-controls.mjs").ControlState)[]} controls
 *   the paint list
 * @property {Map<string, string | null>} pictures  one encoding per picture and size
 * @property {[number, number]} origin  the crop's top-left in viewport px
 */

/** Inherited properties the shadow host passes to the app's DOM. */
const INHERITED = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "direction",
  "writing-mode",
  "color-scheme",
];

/** The line-height the host passes down, as it INHERITS: a unitless factor
 * inherits as the factor (each child multiplies its own font size), a length
 * as the computed length, so the host's computed value alone cannot say which.
 * A 100px probe inside the host answers it.
 * @param {HTMLElement} host
 * @param {ShadowRoot} shadow
 */
function inheritedLineHeight(host, shadow) {
  const own = getComputedStyle(host).lineHeight;
  if (own === "normal") return own;
  const probe = document.createElement("span");
  probe.style.fontSize = "100px";
  shadow.appendChild(probe);
  const seen = getComputedStyle(probe).lineHeight;
  probe.remove();
  return seen === own ? own : String(parseFloat(seen) / 100);
}

/** Pixels of a decoded picture as a PNG data: URL, AT THE SIZE IT IS SHOWN
 * (its box times the look's scale, never above its own pixels); null if the
 * browser refuses to read them back (a cross-origin picture). Measured: a
 * 2400x1792 photo drawn at full size cost 2.4 s per look, and four of them
 * 13.9 s, far past the capture budget - the copy only ever needs what the
 * look can show. One encoding per picture and size per look (`snap.pictures`).
 * @param {HTMLImageElement} img
 * @param {Snap} snap
 * @returns {string | null}
 */
function pictureUrl(img, snap) {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const box = img.getBoundingClientRect();
  const w = Math.max(1, Math.min(img.naturalWidth, Math.ceil(box.width * snap.scale)));
  const h = Math.max(1, Math.min(img.naturalHeight, Math.ceil(box.height * snap.scale)));
  const key = `${img.currentSrc || img.src} ${w}x${h}`;
  const known = snap.pictures.get(key);
  if (known !== undefined) return known;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  let url = null;
  try {
    context2d(canvas).drawImage(img, 0, 0, w, h);
    url = canvas.toDataURL("image/png");
  } catch {
    // A cross-origin picture: shown as a hole, like any unreadable one.
  }
  snap.pictures.set(key, url);
  return url;
}

/**
 * A fresh canvas's 2D context. Only a canvas already holding another kind of
 * context has none, and these canvases are made here for 2D alone.
 * @param {HTMLCanvasElement} canvas
 */
function context2d(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2D context for a fresh canvas");
  return ctx;
}

/** Layout properties a hole copies from its live element, so it takes the
 * same place in the flow; its size is the live border box itself. */
const HOLE_LAYOUT = [
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "vertical-align",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "float",
  "align-self",
  "justify-self",
  "order",
  "grid-area",
];

/** An element the SVG copy does not draw itself (a canvas leaf, a form
 * control): a box of exactly its live size in the same place of the flow,
 * whose background is OUR picture of it - the leaf's own pixels, or the
 * control painted schematically. Being in the copy, it is stacked and
 * clipped by the SVG's layout exactly as the live element is.
 * @param {Element} node
 * @param {Snap} snap
 */
function hole(node, snap) {
  const seen = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  const box = document.createElement("span");
  box.style.display = seen.display === "inline" ? "inline-block" : seen.display;
  box.style.boxSizing = "border-box";
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.style.flex = "none";
  for (const p of HOLE_LAYOUT) box.style.setProperty(p, seen.getPropertyValue(p));
  const url = node instanceof HTMLCanvasElement ? leafUrl(node) : controlUrl(node, rect, snap);
  if (url) box.style.background = `url("${url}") 0 0 / 100% 100% no-repeat`;
  const baseline = snap.baselines.get(node);
  if (baseline !== undefined) {
    // An INLINE control sits on its line by its baseline, which is not its
    // bottom edge (a text field's is its text's). The hole's own baseline is
    // put at the measured depth: its one line holds an empty inline-block
    // exactly that tall, and no strut of its own.
    box.style.fontSize = "0";
    box.style.lineHeight = "0";
    const depth = document.createElement("span");
    depth.style.cssText = `display:inline-block;width:0;height:${Math.max(0, baseline)}px;`;
    box.appendChild(depth);
  }
  return box;
}

/**
 * A canvas leaf's pixels as they are NOW, at its own resolution.
 * @param {HTMLCanvasElement} leaf
 */
function leafUrl(leaf) {
  if (!leaf.width || !leaf.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = leaf.width;
  canvas.height = leaf.height;
  context2d(canvas).drawImage(leaf, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Control `el` painted schematically in its border box, at the capture's
 * scale; what it shows is recorded in `snap.controls` (the paint list).
 * @param {Element} el
 * @param {DOMRect} rect  its border box
 * @param {Snap} snap
 */
function controlUrl(el, rect, snap) {
  const state = controlState(el);
  snap.controls.push({
    id: el.id,
    rect: [rect.left - snap.origin[0], rect.top - snap.origin[1], rect.width, rect.height],
    ...state,
  });
  if (!rect.width || !rect.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(rect.width * snap.scale);
  canvas.height = Math.ceil(rect.height * snap.scale);
  const ctx = context2d(canvas);
  ctx.scale(canvas.width / rect.width, canvas.height / rect.height);
  paintControl(ctx, el, state, 0, 0, rect.width, rect.height);
  return canvas.toDataURL("image/png");
}

/** Where each inline control's baseline is, as depth below its top edge:
 * an empty inline-block placed right after it sits ON that baseline. The
 * probes are added and removed in one go (one layout). Controls laid out by
 * a flex or grid parent are skipped - a probe would become an item.
 * @param {ShadowRoot} shadow
 */
function measureBaselines(shadow) {
  /** @type {[Element, HTMLElement][]} */
  const probes = [];
  for (const el of shadow.querySelectorAll("*")) {
    if (!CONTROLS.has(el.localName)) continue;
    if (!getComputedStyle(el).display.startsWith("inline")) continue;
    const parent = getComputedStyle(el.parentElement ?? el).display;
    if (/flex|grid/.test(parent)) continue;
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline;";
    el.after(probe);
    probes.push([el, probe]);
  }
  /** @type {Map<Element, number>} */
  const depths = new Map();
  for (const [el, probe] of probes) {
    depths.set(el, probe.getBoundingClientRect().top - el.getBoundingClientRect().top);
  }
  for (const [, probe] of probes) probe.remove();
  return depths;
}

/** A deep copy of `node` for the SVG: pictures as data: images, links as
 * they show, canvas leaves and form controls as holes.
 * @param {Node} node
 * @param {Snap} snap
 * @returns {Node}
 */
function cloneWithState(node, snap) {
  if (!(node instanceof Element)) return node.cloneNode(false);
  const tag = node.localName;
  if (tag === "canvas" || CONTROLS.has(tag)) return hole(node, snap);
  // An element's shallow copy is an element of the same kind; HTML and SVG
  // elements alike carry an inline style.
  const copy = /** @type {Element & ElementCSSInlineStyle} */ (node.cloneNode(false));
  if (node instanceof HTMLImageElement && !node.src.startsWith("data:")) {
    const url = pictureUrl(node, snap);
    if (url) copy.setAttribute("src", url);
    else copy.removeAttribute("src");
  } else if (tag === "a") {
    // An image document shows no link as a link (no :link/:visited colour,
    // no underline), so the copy carries what the link shows now.
    const seen = getComputedStyle(node);
    for (const p of ["color", "text-decoration-line", "text-decoration-color", "text-decoration-style"]) {
      copy.style.setProperty(p, seen.getPropertyValue(p));
    }
  }
  for (const child of node.childNodes) copy.appendChild(cloneWithState(child, snap));
  if (node.scrollLeft || node.scrollTop) shiftScrolled(node, copy);
  return copy;
}

/** Shift the children of `copy` (the copy of the scrolled live element
 * `live`, children copied one-to-one) by `live`'s scroll offset, so the copy
 * shows what the scroller shows now. See SCROLLED AS SHOWN in the head.
 * @param {Element} live
 * @param {Element} copy
 */
function shiftScrolled(live, copy) {
  const dx = live.scrollLeft;
  const dy = live.scrollTop;
  const positioned = getComputedStyle(live).position !== "static";
  const copies = Array.from(copy.childNodes);
  live.childNodes.forEach((child, i) => {
    const moved = copies[i];
    if (child instanceof Element) {
      const seen = getComputedStyle(child);
      if (seen.display === "none" || seen.display === "contents") return;
      const pos = seen.position;
      if (pos === "sticky" || pos === "fixed" || (pos === "absolute" && !positioned)) return;
      // A positioned box's insets read back as their used px values, so
      // shifting all four keeps its size whichever of them it is laid out by.
      const inset = (/** @type {string} */ side) => (pos === "static" ? "0px" : seen.getPropertyValue(side));
      offset(/** @type {HTMLElement} */ (moved), pos === "static", dx, dy, inset);
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      // A text run cannot be offset itself; an inline span takes it in the
      // flow (as a flex or grid item it stands in for the anonymous one).
      const span = document.createElement("span");
      moved.replaceWith(span);
      span.appendChild(moved);
      offset(span, true, dx, dy, () => "0px");
    }
  });
}

/** Move `box` by (-dx, -dy) from the insets `inset` gives, by relative
 * positioning if it is unpositioned (`static`).
 * @param {ElementCSSInlineStyle} box
 * @param {boolean} unpositioned
 * @param {number} dx
 * @param {number} dy
 * @param {(side: string) => string} inset
 */
function offset(box, unpositioned, dx, dy, inset) {
  const s = box.style;
  if (unpositioned) s.position = "relative";
  s.top = `calc(${inset("top")} - ${dy}px)`;
  s.bottom = `calc(${inset("bottom")} + ${dy}px)`;
  s.left = `calc(${inset("left")} - ${dx}px)`;
  s.right = `calc(${inset("right")} + ${dx}px)`;
}

/** The first non-transparent background behind `el`: the page's colour
 * under the app's transparent parts.
 * @param {Element} el
 */
function backdrop(el) {
  for (let /** @type {Element | null} */ e = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg && bg !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return "#ffffff";
}

/**
 * The picture of `host`'s shadow content as shown now, cropped to `rect`
 * ({x, y, width, height} in css px from the host's top-left corner; the whole
 * host by default), at `scale` device pixels per css pixel. Returns the
 * canvas and `controls`, the form controls painted schematically.
 *
 * ONE SNAPSHOT: everything read from the live page - DOM, styles, form
 * state, leaf pixels, geometry - is read synchronously before the one await
 * (the SVG decode), so a frame or an input arriving meanwhile cannot mix two
 * states in one picture.
 * @param {HTMLElement} host  the :html view's shadow host (html-view.mjs)
 * @param {{x: number, y: number, width: number, height: number} | null} [rect]
 * @param {number} [scale]
 */
export async function lookHtml(host, rect = null, scale = devicePixelRatio) {
  const shadow = host.shadowRoot;
  if (!shadow) throw new Error("the app's HTML has no shadow root to look at");
  const width = host.clientWidth;
  const height = host.clientHeight;
  const hostStyle = getComputedStyle(host);

  const frame = document.createElement("div");
  frame.style.cssText = `position:relative;overflow:hidden;width:${width}px;height:${height}px;`;
  const content = document.createElement("div");
  content.style.cssText = `position:absolute;left:${-host.scrollLeft}px;top:${-host.scrollTop}px;width:${width}px;`;
  for (const p of INHERITED) content.style.setProperty(p, hostStyle.getPropertyValue(p));
  content.style.setProperty("line-height", inheritedLineHeight(host, shadow));
  // Custom properties inherit too, and the app's stylesheet may read them.
  for (const p of hostStyle) if (p.startsWith("--")) content.style.setProperty(p, hostStyle.getPropertyValue(p));
  const style = document.createElement("style");
  style.textContent = shadow.adoptedStyleSheets.flatMap((s) => Array.from(s.cssRules, (r) => r.cssText)).join("\n");
  content.appendChild(style);
  const { x, y, width: w, height: h } = rect ?? { x: 0, y: 0, width, height };
  const hostBox = host.getBoundingClientRect();
  /** @type {Snap} */
  const snap = {
    baselines: measureBaselines(shadow),
    scale,
    controls: [],
    pictures: new Map(),
    // The crop's top-left in viewport px, for the paint list's rects.
    origin: [hostBox.left + host.clientLeft + x, hostBox.top + host.clientTop + y],
  };
  for (const child of shadow.childNodes) content.appendChild(cloneWithState(child, snap));
  frame.appendChild(content);
  const under = backdrop(host);

  const markup = new XMLSerializer().serializeToString(frame);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = context2d(canvas);
  ctx.scale(scale, scale);
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, -x, -y, width, height);
  return { canvas, controls: snap.controls };
}

/** WEBKIT IS UNMEASURED: the drawing is verified against screenshots in
 * Chromium and Firefox only (browser/tests/product/html-look.spec.mjs), so
 * WebKit - Safari, and every iOS browser - answers that look is not
 * available, until that test runs there. The one engine check. */
const MEASURED = !(/AppleWebKit/.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent));

/**
 * Answer one parked `look` (crates/quine-browser/src/html_look.rs): draw the
 * whole app box, the `target` element's box, or the `crop` [x y w h] in css
 * px from the box's top-left, clipped to what the box shows - the same rules
 * as Android's native capture. Returns the Worker message.
 * @param {HTMLElement} host
 * @param {{token: number, target?: string, crop?: number[]}} request
 * @returns {Promise<import("../../types/worker-messages.js").LookAnswer>}
 */
export async function answerLook(host, { token, target, crop }) {
  /**
   * @param {string} kind
   * @param {string} hint
   * @returns {import("../../types/worker-messages.js").LookAnswer}
   */
  const fail = (kind, hint) => ({ type: "look-failed", token, kind, hint });
  if (!MEASURED) {
    return fail(
      "interface-detached",
      "look cannot draw an :html view in this browser yet (verified only in Chromium and Firefox) - read the tree it renders from the `html` global instead",
    );
  }
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return fail("no-surface", "the app's HTML is not shown right now");
  let box = { x: 0, y: 0, width, height };
  if (target) {
    const el = host.shadowRoot?.getElementById(target);
    if (!el) {
      return fail("no-such-node", `no element with :id #${target} in the live HTML - (refresh) first, or check the id`);
    }
    const hostBox = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return fail("empty-crop", "that element has no measurable extent to look at");
    box = {
      x: r.left - hostBox.left - host.clientLeft,
      y: r.top - hostBox.top - host.clientTop,
      width: r.width,
      height: r.height,
    };
  } else if (crop) {
    const [x, y, w, h] = crop;
    if (![x, y, w, h].every(Number.isFinite)) return fail("offscreen", "crop coordinates must be finite numbers");
    if (w <= 0 || h <= 0) return fail("empty-crop", "crop width and height must be positive, finite numbers");
    box = { x, y, width: w, height: h };
  }
  // Clipped to what the box shows, in whole css px.
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.width));
  const y1 = Math.min(height, Math.ceil(box.y + box.height));
  if (x1 <= x0 || y1 <= y0) return fail("offscreen", "crop region is completely outside the app's visible box");
  try {
    const { canvas } = await lookHtml(host, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    const b64 = canvas.toDataURL("image/png").split(",")[1];
    return {
      type: "look-drawn",
      token,
      b64,
      width: canvas.width,
      height: canvas.height,
      x: x0,
      y: y0,
      scale: devicePixelRatio,
    };
  } catch (error) {
    return fail("capture-failed", `the page could not draw its HTML: ${errorMessage(error)}`);
  }
}

/**
 * THE PREVIEW OF AN `:html` VIEW, as the tab is hidden: the whole app box
 * drawn the way `look` draws it, as PNG bytes for the world to store
 * (src/preview.rs fits and re-encodes them). Null where `look` could not
 * draw it either (an unmeasured engine, a box that is not shown, a drawing
 * that failed): the stored picture then stays as it is.
 * @param {HTMLElement} host
 * @returns {Promise<Uint8Array<ArrayBuffer> | null>}
 */
export async function previewHtml(host) {
  if (!MEASURED || !host.clientWidth || !host.clientHeight) return null;
  try {
    const { canvas } = await lookHtml(host);
    /** @type {Blob | null} */
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch (error) {
    console.warn("the HTML view's preview was not drawn:", errorMessage(error));
    return null;
  }
}
