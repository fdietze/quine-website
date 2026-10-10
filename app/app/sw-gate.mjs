// THE SERVICE-WORKER GATE: a page's entry module (`data-entry` on this
// script's tag: launcher.mjs, settings.mjs) starts only once the page is
// controlled by the offline service worker (../service-worker.js).
//
// WHY: the site's URLs are not fingerprinted and the host caches every file
// for minutes (GitHub Pages: max-age=600), so a load that bypasses the worker
// can take some modules of one deploy and some of the next out of the HTTP
// cache or the CDN - e.g. the wasm glue of one build over the .wasm of the
// previous, which fails at the first call. A controlled page gets every file
// from the worker's one version. So an uncontrolled page (a first visit, a
// hard reload, an engine that left it uncontrolled) registers the worker,
// waits until it is active and reloads ONCE; the reload is controlled and
// lands on the worker's current version.
//
// It never loops: at most one automatic reload per tab until a controlled
// boot (sessionStorage), so a page the worker never controls (DevTools
// "Bypass for network") still starts, uncontrolled, as without the gate. No
// service worker support, a failed registration or a failed install (its
// worker turns redundant) boot uncontrolled too. No timeout: a first install
// downloads the whole precache list, and a timeout would bring the mix back.
//
// This module imports nothing: it loads before the version is known, so it
// may not depend on another site file matching it.
const RELOADED = "sw-gate-reloaded";

/** Resolve once it is safe to start the entry, or reload the page and never resolve. */
async function controlled() {
  const container = navigator.serviceWorker;
  if (!container) return;
  const registering = container.register(new URL("../service-worker.js", import.meta.url));
  if (container.controller) {
    sessionStorage.removeItem(RELOADED);
    registering.catch((e) => console.warn("service worker not registered:", e));
    return;
  }
  if (sessionStorage.getItem(RELOADED)) {
    console.warn("sw-gate: still not controlled after one reload; starting uncontrolled");
    return;
  }
  const registration = await registering;
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  // An active worker serves a reload at once, whatever update may be pending
  // (one waiting behind another tab's pages would never activate here).
  if (worker) {
    await new Promise((settled) => {
      const check = () => {
        if (worker.state === "activated" || worker.state === "redundant") settled(undefined);
      };
      worker.addEventListener("statechange", check);
      check();
    });
  }
  if (registration.active?.state !== "activated") return;
  sessionStorage.setItem(RELOADED, "1");
  location.reload();
  await new Promise(() => {});
}

const tag = /** @type {HTMLScriptElement} */ (document.querySelector("script[data-entry]"));
try {
  await controlled();
} catch (e) {
  console.warn("sw-gate: starting uncontrolled:", e);
}
document.getElementById("preparing")?.remove();
await import(new URL(/** @type {string} */ (tag.dataset.entry), import.meta.url).href);
