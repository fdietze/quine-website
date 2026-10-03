// EVERY WORKER STARTS FROM A blob: BOOTSTRAP, so it runs under the page's own
// Content-Security-Policy. A same-origin Worker takes its policy only from
// its own response headers, which a static host (GitHub Pages) cannot send;
// a local-scheme (blob:) Worker inherits the policy of the document that
// created it (CSP3). The bootstrap is one line: it imports the real module by
// absolute URL, so the module keeps its own URL (and `import.meta.url`).

/**
 * A module Worker for `url`, under this page's policy.
 * @param {string | URL} url
 */
export function moduleWorker(url) {
  const absolute = new URL(url, location.href).href;
  const source = `import ${JSON.stringify(absolute)};`;
  return new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })), {
    type: "module",
  });
}
