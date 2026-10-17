// THE PAGE'S OWN ELEMENTS, PARSED ONCE: a module that reads an element of its
// document (index.html, settings.html) names the element's class too, and a
// missing or different element fails loudly at load - never as a null deref
// on the first click (Parse, don't validate).

/**
 * The element `#id` of this document, which must be a `type`.
 * @template {abstract new (...args: any) => HTMLElement} T
 * @param {string} id
 * @param {T} type
 * @returns {InstanceType<T>}
 */
export function elementById(id, type) {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is not a ${type.name} in ${location.pathname}`);
  return /** @type {InstanceType<T>} */ (el);
}
