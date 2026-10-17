// THE CATALOG CHANGED, said across this origin's tabs: a world tab that stored
// its preview tells every launcher tab to read the catalog again. The catalog
// itself (OPFS) stays the one truth; this carries no data, only the edge, so a
// lost message costs a stale tile until the next refresh, never a wrong one.
// A BroadcastChannel because it reaches every same-origin tab and Worker
// without an opener reference (a world tab may outlive its launcher).
export const CHANNEL = "quine-catalog-changed";

/** Tell every other tab and Worker of this origin that the catalog changed. */
export function announceCatalogChanged() {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(null);
  channel.close();
}

/**
 * Call `listener` whenever another tab or Worker announces a change.
 * @param {() => void} listener
 */
export function onCatalogChanged(listener) {
  new BroadcastChannel(CHANNEL).addEventListener("message", () => listener());
}
