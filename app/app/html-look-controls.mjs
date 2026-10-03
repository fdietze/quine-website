// FORM CONTROLS, DRAWN SCHEMATICALLY for the picture of an :html view
// (html-look.mjs). An SVG image does not paint native widgets the same in
// every engine (Firefox paints none), so NO engine's widget painting is
// used: each control is a hole of its exact live box in the SVG copy, and is
// painted here from its computed style and live state - box, border, text,
// check mark, selected option, fill. ONE path in every engine; the look's
// caption says controls are schematic.

/** The elements drawn here instead of by the SVG. */
export const CONTROLS = new Set(["input", "button", "select", "textarea", "progress", "meter"]);

const BUTTON_INPUTS = new Set(["button", "submit", "reset"]);
const ACCENT = "#1a73e8";

/** @param {string} v  a computed length */
const px = (v) => parseFloat(v) || 0;

/**
 * What a control shows, as data (`controlState`).
 * @typedef {{kind: "none"}
 *   | {kind: "checkbox" | "radio", checked: boolean}
 *   | {kind: "button", text: string}
 *   | {kind: "range" | "bar", fraction: number | null}
 *   | {kind: "color", color: string}
 *   | {kind: "text" | "textarea", text: string, placeholder?: true}
 *   | {kind: "list", options: {text: string, selected: boolean}[]}
 *   | {kind: "select", text: string}} ControlState
 */

/**
 * What the control shows, as data: `{ kind, text, checked }` - the paint
 * list entry a test reads, and what `paint` draws.
 * @param {Element} el  one of CONTROLS
 * @returns {ControlState}
 */
export function controlState(el) {
  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if (type === "checkbox" || type === "radio") return { kind: type, checked: el.checked };
    if (BUTTON_INPUTS.has(type)) return { kind: "button", text: el.value || (type === "reset" ? "Reset" : "Submit") };
    if (type === "range")
      return { kind: "range", fraction: fraction(+el.value, +el.min || 0, el.max === "" ? 100 : +el.max) };
    if (type === "color") return { kind: "color", color: el.value };
    if (type === "file") return { kind: "button", text: el.files?.[0]?.name ?? "Choose file" };
    if (type === "hidden") return { kind: "none" };
    const shown = type === "password" ? "\u2022".repeat(el.value.length) : el.value;
    return shown ? { kind: "text", text: shown } : { kind: "text", text: el.placeholder, placeholder: true };
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value
      ? { kind: "textarea", text: el.value }
      : { kind: "textarea", text: el.placeholder, placeholder: true };
  }
  if (el instanceof HTMLButtonElement) return { kind: "button", text: el.innerText.trim() };
  if (el instanceof HTMLSelectElement) {
    if (el.multiple || el.size > 1) {
      return { kind: "list", options: Array.from(el.options, (o) => ({ text: o.text, selected: o.selected })) };
    }
    return { kind: "select", text: el.selectedOptions[0]?.text ?? "" };
  }
  if (el instanceof HTMLProgressElement) return { kind: "bar", fraction: el.position < 0 ? null : el.position };
  if (el instanceof HTMLMeterElement) return { kind: "bar", fraction: fraction(el.value, el.min, el.max) };
  return { kind: "none" };
}

/**
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
function fraction(v, min, max) {
  return max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
}

/**
 * Word-wrapped lines of `text` in `width` css px with the context's font.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} width
 */
function wrap(ctx, text, width) {
  /** @type {string[]} */
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line.trim() && ctx.measureText(next).width > width) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Paint control `el` (computed style `s`, state `state`) with its border
 * box at (x, y, w, h) in the context's css px.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Element} el
 * @param {ControlState} state
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
export function paintControl(ctx, el, state, x, y, w, h) {
  if (state.kind === "none") return;
  const s = getComputedStyle(el);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  if (state.kind === "checkbox" || state.kind === "radio") {
    const size = Math.min(w, h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const accent = s.accentColor === "auto" ? ACCENT : s.accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (state.kind === "radio") ctx.arc(cx, cy, size / 2 - 0.5, 0, 2 * Math.PI);
    else ctx.roundRect(cx - size / 2 + 0.5, cy - size / 2 + 0.5, size - 1, size - 1, 2);
    ctx.fillStyle = state.checked ? accent : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = state.checked ? accent : "#767676";
    ctx.stroke();
    if (state.checked) {
      ctx.fillStyle = ctx.strokeStyle = "#ffffff";
      if (state.kind === "radio") {
        ctx.beginPath();
        ctx.arc(cx, cy, size / 5, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(1.5, size / 8);
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.28, cy);
        ctx.lineTo(cx - size * 0.08, cy + size * 0.2);
        ctx.lineTo(cx + size * 0.3, cy - size * 0.22);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  // The box: background and border as computed (one radius, per-side width
  // and colour as the top side - schematic).
  const radius = px(s.borderTopLeftRadius);
  const border = px(s.borderTopWidth);
  ctx.beginPath();
  ctx.roundRect(x + border / 2, y + border / 2, w - border, h - border, radius);
  ctx.fillStyle = s.backgroundColor;
  ctx.fill();
  if (border > 0 && s.borderTopStyle !== "none") {
    ctx.lineWidth = border;
    ctx.strokeStyle = s.borderTopColor;
    ctx.stroke();
  }

  const left = x + px(s.borderLeftWidth) + px(s.paddingLeft);
  const right = x + w - px(s.borderRightWidth) - px(s.paddingRight);
  const top = y + px(s.borderTopWidth) + px(s.paddingTop);
  const bottom = y + h - px(s.borderBottomWidth) - px(s.paddingBottom);
  const inner = Math.max(0, right - left);

  if (state.kind === "bar" || state.kind === "range") {
    const track = state.kind === "range" ? 4 : Math.max(4, bottom - top);
    const ty = (top + bottom) / 2 - track / 2;
    ctx.fillStyle = "#e0e0e0";
    ctx.fillRect(left, ty, inner, track);
    if (state.fraction !== null) {
      ctx.fillStyle = s.accentColor === "auto" ? ACCENT : s.accentColor;
      ctx.fillRect(left, ty, inner * state.fraction, track);
      if (state.kind === "range") {
        ctx.beginPath();
        ctx.arc(left + inner * state.fraction, ty + track / 2, Math.min(8, (bottom - top) / 2), 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }
  if (state.kind === "color") {
    ctx.fillStyle = state.color;
    ctx.fillRect(left, top, inner, bottom - top);
    ctx.restore();
    return;
  }

  ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  ctx.textBaseline = "middle";
  const lineHeight = s.lineHeight === "normal" ? px(s.fontSize) * 1.2 : px(s.lineHeight);
  ctx.fillStyle = "placeholder" in state ? placeholderColor(el, s) : s.color;
  if (state.kind === "text") {
    ctx.fillText(state.text ?? "", left, (top + bottom) / 2);
  } else if (state.kind === "select") {
    const chevron = Math.min(12, (bottom - top) * 0.6);
    ctx.fillText(state.text, left, (top + bottom) / 2);
    ctx.beginPath();
    const cx = right - chevron / 2;
    const cy = (top + bottom) / 2;
    ctx.moveTo(cx - chevron / 2, cy - chevron / 4);
    ctx.lineTo(cx, cy + chevron / 4);
    ctx.lineTo(cx + chevron / 2, cy - chevron / 4);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (state.kind === "button") {
    const lines = wrap(ctx, state.text, inner);
    ctx.textAlign = "center";
    const first = (top + bottom) / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, (left + right) / 2, first + i * lineHeight));
  } else if (state.kind === "textarea") {
    wrap(ctx, state.text ?? "", inner).forEach((line, i) => ctx.fillText(line, left, top + lineHeight * (i + 0.5)));
  } else if (state.kind === "list") {
    state.options.forEach((o, i) => {
      const ly = top + lineHeight * i;
      if (o.selected) {
        ctx.fillStyle = ACCENT;
        ctx.fillRect(left, ly, inner, lineHeight);
      }
      ctx.fillStyle = o.selected ? "#ffffff" : s.color;
      ctx.fillText(o.text, left, ly + lineHeight / 2);
    });
  }
  ctx.restore();
}

/**
 * @param {Element} el
 * @param {CSSStyleDeclaration} s  its computed style
 */
function placeholderColor(el, s) {
  try {
    return getComputedStyle(el, "::placeholder").color || s.color;
  } catch {
    return s.color;
  }
}
