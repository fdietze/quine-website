// WHAT MAKES THE SITE AN INSTALLABLE APP, on the page's side: the offline
// service worker (../service-worker.js) and persistent storage.
//
// PERSISTENT STORAGE: the person's apps live only in this origin's OPFS, which
// a browser may evict under storage pressure unless the origin is persistent.
// Asked once per page start while not yet granted; Chromium decides silently
// (it grants an installed or engaged site), Firefox asks the person.

/** Register the offline service worker; its scope is the site's directory. */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register(new URL("../service-worker.js", import.meta.url))
    .catch((e) => console.warn("service worker not registered:", e));
}

/** Ask that this origin's storage (the apps' OPFS) is never evicted. */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  if (!(await navigator.storage.persisted())) await navigator.storage.persist();
}
