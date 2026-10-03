// WHERE THE HOST'S SETTINGS LIVE: this origin's localStorage, and nowhere else.
//
// Host-side only, by construction: a world's files are OPFS directories under
// the catalog, and nothing here writes there; the key reaches a world's Worker
// at open time and again when it changes (`onResidentChange`), to become the
// provider transport's Authorization header (crates/quine-browser,
// `set_resident`), never the image, the world file,
// the chat, a diagnostic or a log.
//
// HONESTLY STATED, NOT ENCRYPTED: a static site has no secret store. The value
// is readable by anyone with access to this browser profile and by any script
// on this origin; encrypting it with a key held in the same place would only
// look safer. The Settings screen says so.
//
// BLANK MEANS DEFAULT for model, effort and image model: nothing is stored for "default", so
// the engine's own default (src/llm.rs) is the one answer, and a changed
// default reaches a returning user instead of being shadowed by a copy.

const KEY = "quine.openrouter.key";
const MODEL = "quine.resident.model";
const EFFORT = "quine.resident.effort";
// THE DEVELOPER SWITCHES ("Show tool calls", "Show status line"): stored only
// when on, so absent is the default (hidden).
const SHOW_TOOL_CALLS = "quine.conversation.show-tool-calls";
const SHOW_STATUS_LINE = "quine.chrome.show-status-line";
const DEVELOPER_UNLOCKED = "quine.settings.developer-unlocked";
const IMAGE_MODEL = "quine.resident.image-model";
const WEB = "quine.permission.web";
const SOUND = "quine.permission.sound";
const CAMERA = "quine.permission.camera";
const MICROPHONE = "quine.permission.microphone";

/**
 * @returns {{key: string, model: string, effort: string, imageModel: string}}
 *   blank = unset
 */
export function loadSettings() {
  return {
    key: localStorage.getItem(KEY) ?? "",
    model: localStorage.getItem(MODEL) ?? "",
    effort: localStorage.getItem(EFFORT) ?? "",
    imageModel: localStorage.getItem(IMAGE_MODEL) ?? "",
  };
}

/** @returns {{showToolCalls: boolean, showStatusLine: boolean}} */
export function loadDeveloperSwitches() {
  return {
    showToolCalls: localStorage.getItem(SHOW_TOOL_CALLS) === "on",
    showStatusLine: localStorage.getItem(SHOW_STATUS_LINE) === "on",
  };
}

/** @param {{showToolCalls: boolean, showStatusLine: boolean}} switches */
export function saveDeveloperSwitches({ showToolCalls, showStatusLine }) {
  set(SHOW_TOOL_CALLS, showToolCalls ? "on" : "");
  set(SHOW_STATUS_LINE, showStatusLine ? "on" : "");
}

/**
 * Whether the Build row's gesture has opened the Developer section
 * (app/developer-door.mjs). Remembered at once, apart from Save, as on Android.
 * @returns {boolean}
 */
export function loadDeveloperUnlocked() {
  return localStorage.getItem(DEVELOPER_UNLOCKED) === "on";
}

/** @param {boolean} unlocked */
export function saveDeveloperUnlocked(unlocked) {
  set(DEVELOPER_UNLOCKED, unlocked ? "on" : "");
}

/**
 * Call `f(switches)` whenever ANOTHER tab changes a developer switch (as `onResidentChange`).
 * @param {(switches: {showToolCalls: boolean, showStatusLine: boolean}) => void} f
 * @param {{signal?: AbortSignal}} [options]
 */
export function onDeveloperSwitchesChange(f, { signal } = {}) {
  addEventListener(
    "storage",
    (e) => {
      if (e.key === null || [SHOW_TOOL_CALLS, SHOW_STATUS_LINE].includes(e.key)) f(loadDeveloperSwitches());
    },
    { signal },
  );
}

/**
 * Store model, effort and image model; blank removes, i.e. back to the default.
 * @param {{model: string, effort: string, imageModel: string}} resident
 */
export function saveResident({ model, effort, imageModel }) {
  set(MODEL, model.trim());
  set(EFFORT, effort.trim());
  set(IMAGE_MODEL, imageModel.trim());
}

/**
 * THE USER'S APP PERMISSIONS: may apps use the web, may they play sound.
 * A missing entry is the default (on): a user who never opened Settings.
 * An entry that is anything but "on" is OFF (fail closed): it may be the
 * user's "off", and nothing garbled may turn a reach they switched off back
 * on. A world keeps what it opened with.
 * @returns {{web: boolean, sound: boolean, microphone: boolean, camera: boolean}}
 */
export function loadPermissions() {
  /** @param {string} name */
  const read = (name) => {
    const value = localStorage.getItem(name);
    return value === null || value === "on";
  };
  return { web: read(WEB), sound: read(SOUND), microphone: read(MICROPHONE), camera: read(CAMERA) };
}

/** @param {{web: boolean, sound: boolean, microphone: boolean, camera: boolean}} permissions */
export function savePermissions({ web, sound, microphone, camera }) {
  localStorage.setItem(WEB, web ? "on" : "off");
  localStorage.setItem(SOUND, sound ? "on" : "off");
  localStorage.setItem(MICROPHONE, microphone ? "on" : "off");
  localStorage.setItem(CAMERA, camera ? "on" : "off");
}

/**
 * Store a new key. A blank value is NOT a new key: it changes nothing.
 * @param {string} key
 */
export function saveKey(key) {
  const k = key.trim();
  if (k) localStorage.setItem(KEY, k);
}

export function removeKey() {
  localStorage.removeItem(KEY);
}

/**
 * Call `f(settings)` whenever ANOTHER tab changes the key, model or effort -
 * the `storage` event fires only in the other documents of this origin, which
 * is exactly where an open world lives while Settings is used.
 * @param {(settings: {key: string, model: string, effort: string, imageModel: string}) => void} f
 * @param {{signal?: AbortSignal}} [options]
 */
export function onResidentChange(f, { signal } = {}) {
  addEventListener(
    "storage",
    (e) => {
      if (e.key === null || [KEY, MODEL, EFFORT, IMAGE_MODEL].includes(e.key)) f(loadSettings());
    },
    { signal },
  );
}

/** @param {string} name @param {string} value blank removes */
function set(name, value) {
  if (value) localStorage.setItem(name, value);
  else localStorage.removeItem(name);
}
