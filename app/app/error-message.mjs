// WHAT A CAUGHT VALUE SAYS, for a person: an Error's message, else the value
// itself as text (wasm-bindgen refusals cross as plain strings). Every realm
// of the site uses this one reading (site/core/worker.mjs imports it too).

/**
 * @param {unknown} error  anything `catch` or a rejection hands over
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The same for a developer: an Error's stack where the engine keeps one.
 * @param {unknown} error
 * @returns {string}
 */
export function errorStack(error) {
  return (error instanceof Error && error.stack) || errorMessage(error);
}
