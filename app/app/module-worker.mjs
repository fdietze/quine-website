// EVERY WORKER RUNS UNDER THE PAGE'S OWN Content-Security-Policy (the egress
// wall, .mex/context/security.md), started one of two ways:
//
// - FROM A PLAIN URL, when the service worker (../service-worker.js) stamps
//   this page's policy on what it serves. A same-origin Worker takes its
//   policy only from its own script's response headers, which the static host
//   (GitHub Pages) cannot send, but the service worker does. Such a Worker,
//   its imports and its wasm are served by the service worker in every
//   engine, so they are of the page's own version. Its entry checks that the
//   policy holds before it loads anything (./policy-guard.mjs).
// - ELSE FROM A blob: BOOTSTRAP: a local-scheme Worker inherits the policy of
//   the document that created it (CSP3). The bootstrap is one line: it imports
//   the real module by absolute URL, so the module keeps its own URL (and
//   `import.meta.url`). Firefox does not route such a Worker's fetches through
//   the service worker, so they come from the HTTP cache and may mix two
//   deploys - the reason for the first way.
//
// Which way is decided once, by the real condition: this very module, fetched
// again, carries the page's own policy - i.e. the page is controlled and its
// version is stamped (a built site; the development tree's empty list stamps
// nothing). Anything else, a failed fetch included, is the bootstrap.
const stamped = await (async () => {
  const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content");
  if (!policy || !navigator.serviceWorker?.controller) return false;
  try {
    return (await fetch(import.meta.url)).headers.get("content-security-policy") === policy;
  } catch {
    return false;
  }
})();

/**
 * A module Worker for `url`, under this page's policy.
 * @param {string | URL} url
 */
export function moduleWorker(url) {
  const absolute = new URL(url, location.href).href;
  if (stamped) {
    // A query of its own per start: WebKit starts a Worker whose script it
    // still holds in memory WITHOUT the service worker, and then its imports
    // and wasm miss it too (measured: offline they 404). The service worker
    // answers by path, so the query changes nothing else.
    const fresh = new URL(absolute);
    fresh.searchParams.set("start", crypto.randomUUID());
    return new Worker(fresh, { type: "module" });
  }
  const source = `import ${JSON.stringify(absolute)};`;
  return new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })), {
    type: "module",
  });
}
