// THE ONE DOM DIFF of the page: a tree of vnodes (browser/types/html-frame.d.ts)
// applied to the DOM the last one made, matching children by `key` (else by
// position and tag), so what the user holds survives a re-render - focus,
// the caret, in-progress typing, a text selection, the scroll anchor. An
// element or text node whose vnode did not change is not touched at all.
//
// Two views build on it: the app's HTML (html-view.mjs), which adds live
// control values, events, pictures and canvas leaves through the hooks, and
// the conversation (conversation.mjs), which uses it as it is. It never
// parses a string as HTML: tags, attributes and text are set one by one.

/** @typedef {import("../../types/html-frame.js").VNode} VNode */
/**
 * What the diff keeps ON an element it built: the vnode it last applied
 * (html-view.mjs keeps its own fields beside it).
 * @typedef {HTMLElement & {
 *   __v?: VNode,
 *   __pending?: number,
 *   __listeners?: Map<string, (e: Event) => void>,
 * }} ViewElement
 */
/** A child the diff manages: a built element or a text node.
 * @typedef {ViewElement | Text} ViewNode */
/**
 * What a view adds to the plain diff. Every hook is optional.
 * @typedef {object} DiffHooks
 * @property {(el: ViewElement, name: string, value: string | true) => void} [setAttr]
 *   set one attribute (default: the plain attribute, touched only if it differs)
 * @property {(el: ViewElement, name: string) => void} [removeAttr]
 *   remove one (default: the plain attribute)
 * @property {(name: string) => boolean} [late]
 *   attributes set only AFTER the children (a select's value names an option)
 * @property {(el: ViewElement, v: VNode) => void} [patched]
 *   after `v` is recorded on `el`, before its children (events)
 * @property {(el: ViewElement, v: VNode) => void} [created]
 *   once, after a new element got its first vnode (a canvas leaf's surface)
 * @property {(el: ViewElement, v: VNode) => boolean} [same]
 *   a further identity rule beyond tag and key (a canvas IS its id)
 */

/** @param {ViewElement} el @param {string} name @param {string | true} value */
const plainSet = (el, name, value) => {
  if (value === true) {
    if (!el.hasAttribute(name)) el.setAttribute(name, "");
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
};

/** @param {ViewElement} el @param {string} name */
const plainRemove = (el, name) => el.removeAttribute(name);

/**
 * @param {DiffHooks} [hooks]
 * @returns {{
 *   patch: (el: ViewElement, v: VNode) => void,
 *   patchChildren: (parent: ViewElement | ShadowRoot, vs: (VNode | string)[]) => void,
 * }}
 */
export function domDiff(hooks = {}) {
  const setAttr = hooks.setAttr ?? plainSet;
  const removeAttr = hooks.removeAttr ?? plainRemove;
  const late = hooks.late ?? (() => false);

  /**
   * Apply vnode `v` to element `el`, which has `v`'s tag.
   * @param {ViewElement} el
   * @param {VNode} v
   */
  const patch = (el, v) => {
    /** @type {Pick<VNode, "attrs" | "style" | "class" | "events" | "children"> & {id?: string}} */
    const old = el.__v ?? { attrs: [], style: [], class: [], events: [], children: [] };
    if (old.id !== v.id) {
      if (v.id == null) el.removeAttribute("id");
      else el.id = v.id;
    }
    const cls = v.class.join(" ");
    if (old.class.join(" ") !== cls) el.className = cls;
    const newStyle = new Map(v.style);
    for (const [p] of old.style) if (!newStyle.has(p)) el.style.removeProperty(p);
    for (const [p, val] of newStyle) {
      if (el.style.getPropertyValue(p) !== val) el.style.setProperty(p, val);
    }
    const newAttrs = new Map(v.attrs);
    for (const [n] of old.attrs) if (!newAttrs.has(n)) removeAttr(el, n);
    for (const [n, val] of newAttrs) if (!late(n)) setAttr(el, n, val);
    el.__v = v;
    hooks.patched?.(el, v);
    patchChildren(el, v.children);
    for (const [n, val] of newAttrs) if (late(n)) setAttr(el, n, val);
  };

  /** @param {VNode} v */
  const create = (v) => {
    /** @type {ViewElement} */
    const el = document.createElement(v.tag);
    patch(el, v);
    hooks.created?.(el, v);
    return el;
  };

  /**
   * @param {ViewNode} node
   * @param {VNode | string} v
   */
  const sameKind = (node, v) =>
    typeof v === "string"
      ? node instanceof Text
      : node instanceof HTMLElement &&
        node.__v?.tag === v.tag &&
        (node.__v?.key ?? null) === (v.key ?? null) &&
        (hooks.same?.(node, v) ?? true);

  /**
   * Make `parent`'s children be `vs`, reusing what matches.
   * @param {ViewElement | ShadowRoot} parent
   * @param {(VNode | string)[]} vs
   */
  const patchChildren = (parent, vs) => {
    // Every child here was built by this diff: an element or text.
    const old = /** @type {ViewNode[]} */ ([...parent.childNodes]);
    /** @type {Set<ViewNode>} */
    const used = new Set();
    /** @type {Map<string, ViewNode>} */
    const keyed = new Map();
    for (const n of old) {
      const nv = "__v" in n ? n.__v : undefined;
      if (nv?.key != null) keyed.set(`${nv.tag}\0${nv.key}`, n);
    }
    const next = vs.map((v) => {
      let node =
        typeof v !== "string" && v.key != null
          ? keyed.get(`${v.tag}\0${v.key}`)
          : old.find((n) => !used.has(n) && sameKind(n, v));
      // One rule for both arms: a keyed match must be of the same kind too.
      if (node && (used.has(node) || !sameKind(node, v))) node = undefined;
      if (typeof v === "string") {
        if (node) {
          if (node.nodeValue !== v) node.nodeValue = v;
        } else {
          node = document.createTextNode(v);
        }
      } else if (node instanceof HTMLElement) {
        patch(node, v);
      } else {
        node = create(v);
      }
      used.add(node);
      return node;
    });
    for (const n of old) if (!used.has(n)) n.remove();
    // Move only what is out of place, so an untouched node is never touched.
    next.forEach((n, i) => {
      if (parent.childNodes[i] !== n) move(parent, n, parent.childNodes[i] ?? null);
    });
  };

  return { patch, patchChildren };
}

/** Move `node` before `ref` WITHOUT losing focus or the caret: a plain
 * `insertBefore` detaches the node, which blurs a focused control inside it.
 * `moveBefore` keeps its state where the browser has it; elsewhere the focus
 * and selection are put back.
 * @param {ViewElement | ShadowRoot} parent
 * @param {ViewNode} node
 * @param {ChildNode | null} ref
 */
function move(parent, node, ref) {
  // Element.moveBefore is newer than this TypeScript's DOM lib.
  const movable = /** @type {{moveBefore?: (node: Node, ref: Node | null) => void}} */ (parent);
  if (typeof movable.moveBefore === "function" && node.isConnected) {
    try {
      movable.moveBefore(node, ref);
      return;
    } catch {
      // A node moveBefore refuses (some browsers: text) falls through.
    }
  }
  // The document or the shadow root the parent lives in holds the focus.
  const root = /** @type {Document | ShadowRoot} */ (parent.getRootNode());
  const focused = root.activeElement;
  const inside = focused instanceof HTMLElement && (focused === node || node.contains(focused));
  // Only a text control has a caret (input, textarea).
  const text = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement ? focused : null;
  const caret =
    inside && text && typeof text.selectionStart === "number"
      ? /** @type {const} */ ([
          text.selectionStart,
          text.selectionEnd ?? text.selectionStart,
          text.selectionDirection ?? undefined,
        ])
      : null;
  parent.insertBefore(node, ref);
  if (inside && root.activeElement !== focused) {
    focused.focus({ preventScroll: true });
    if (caret && text) text.setSelectionRange(...caret);
  }
}
