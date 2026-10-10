// PERSISTENT STORAGE, the installable app's page-side half beside the offline
// service worker (../service-worker.js, registered by ./sw-gate.mjs). The
// person's apps live only in this origin's OPFS, which a browser may evict
// under storage pressure unless the origin is persistent.
// Asked once per page start while not yet granted; Chromium decides silently
// (it grants an installed or engaged site), Firefox asks the person.

/** Ask that this origin's storage (the apps' OPFS) is never evicted. */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  if (!(await navigator.storage.persisted())) await navigator.storage.persist();
}
