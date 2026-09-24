// WHERE THE HOST'S SETTINGS LIVE: this origin's localStorage, and nowhere else.
//
// Host-side only, by construction: a world's files are OPFS directories under
// the catalog, and nothing here writes there; the key reaches a world's Worker
// once, at open time, to become the provider transport's Authorization header
// (crates/quine-browser, `start_resident`), never the image, the world file,
// the chat, a diagnostic or a log.
//
// HONESTLY STATED, NOT ENCRYPTED: a static site has no secret store. The value
// is readable by anyone with access to this browser profile and by any script
// on this origin; encrypting it with a key held in the same place would only
// look safer. The Settings screen says so.
//
// BLANK MEANS DEFAULT for model and effort: nothing is stored for "default", so
// the engine's own default (src/llm.rs) is the one answer, and a changed
// default reaches a returning person instead of being shadowed by a copy.

const KEY = "quine.openrouter.key";
const MODEL = "quine.resident.model";
const EFFORT = "quine.resident.effort";

/** @returns {{key: string, model: string, effort: string}} blank = unset */
export function loadSettings() {
  return {
    key: localStorage.getItem(KEY) ?? "",
    model: localStorage.getItem(MODEL) ?? "",
    effort: localStorage.getItem(EFFORT) ?? "",
  };
}

/** Store model and effort; blank removes, i.e. back to the default. */
export function saveResident({ model, effort }) {
  set(MODEL, model.trim());
  set(EFFORT, effort.trim());
}

/** Store a new key. A blank value is NOT a new key: it changes nothing. */
export function saveKey(key) {
  const k = key.trim();
  if (k) localStorage.setItem(KEY, k);
}

export function removeKey() {
  localStorage.removeItem(KEY);
}

function set(name, value) {
  if (value) localStorage.setItem(name, value);
  else localStorage.removeItem(name);
}
