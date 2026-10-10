// THE OFFLINE APP SHELL: this site's files, served from the Cache API so the
// installed app starts without a network (the person's apps live in OPFS,
// which needs none).
//
// ONE PRECACHE LIST IS ONE VERSION. The site's URLs are not fingerprinted (the
// modules import each other by plain relative names), so a version is only
// consistent as a whole: every listed file, index.html included, is served
// from the cache of THIS worker's list, and a listed file missing there is
// fetched with its SRI hash, so the answer is this version or an error. The
// build writes the list into the `PRECACHE` line below
// (browser/build/inject-precache-list.mjs, run by nix/browser.nix
// `browserSite`); a new list is a new worker, which the browser's own update
// check finds, installs in the background and activates at the next start,
// when no page of the old version is open (no skipWaiting). Then the old
// caches are deleted.
//
// THE GUARANTEE: every request THIS worker answers is of one version, so a
// page it controls, and every Worker that page starts (from a plain URL,
// below), loads its modules and wasm from one version. A load it does not see
// goes to the network and the HTTP cache (the host caches for minutes) and
// may mix: an uncontrolled page, which app/sw-gate.mjs therefore reloads once
// before any module starts, and a page that falls back to the blob: bootstrap
// (app/module-worker.mjs), whose Workers Firefox does not route through this
// worker. Unproven: whether every engine routes an AudioWorklet's module
// (sound/quine-sound-processor.js, app/voice-capture-processor.js) here.
//
// Unbuilt (the development tree) the list is empty and the worker serves
// nothing, so an edited file is never answered from a stale cache.
//
// Each file is fetched with its SRI hash, so a stale copy from an HTTP or CDN
// cache can never enter a version (the install fails and is retried at the
// next update check), and a file whose hash an older version already holds is
// taken from there instead of the network. The cache key carries the hash,
// which is what makes that lookup a plain `caches.match`.
//
// EVERY RESPONSE IT SERVES CARRIES THE PAGES' POLICY as a header (the list's
// `policy`, copied from index.html's <meta> by the build). A same-origin
// Worker takes its Content-Security-Policy from its own script's response
// headers, which the static host cannot send; stamped here, a Worker started
// from its plain URL (app/module-worker.mjs, only when the page finds its own
// version stamped) is under the same policy as the page - and, unlike a blob:
// bootstrap, is served by this worker in every engine, Firefox included.
// Stamped as served, so a file taken from an older version's cache carries
// this version's policy. The pages get the same stamp beside their <meta>,
// so a directive that works only as a header (frame-ancestors, sandbox,
// report-to) would hold on controlled pages alone: such a directive belongs
// in a real header, which this host cannot send.
//
// Anything not in the list (the OpenRouter API, a web page an app fetches)
// goes to the network exactly as without this worker.
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

/** @type {{ version: string, policy: string, files: Record<string, string> }} files: path relative to the scope -> SRI hash */
const PRECACHE = {"version":"bc0445f2d19b8054","policy":"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; base-uri 'none'; form-action 'none'; object-src 'none'; manifest-src 'self'","files":{"app/app-camera.mjs":"sha256-du9oyWcop+aKWyVGWfTVdriS+jCpsnWQUSyNi7M1zD4=","app/camera.mjs":"sha256-rIsDR7GG1nqa9oClbpb0gUSThoxcyEbwmp+b5FzKa4Y=","app/catalog-changed.mjs":"sha256-fuk3WIlKyMNM/PRWQKs4P17fPc4UKm8VNskhHLDY7ko=","app/chat-input.mjs":"sha256-dDrSIvjdBl5e9gXJO0kHnSPdWgyeEs7pz9QF9akT4dA=","app/conversation.mjs":"sha256-a/mQb8HgOKthcd84Ll8mL0ax9BJ11Bg0oiPCMcWsV00=","app/developer-door.mjs":"sha256-IDFAKWUFA0qK/0XXCmMB6DGuyGtg71n9BpTitHkD8R8=","app/dom-diff.mjs":"sha256-VYRhYpaOl/pw2NYqMEzVMcZ+2j+AXjE/Oi1TQ3pyngQ=","app/element-by-id.mjs":"sha256-XlqKSv35lHN19NJ0bSpErOC8zN25gIhp7u1PYFc+gxE=","app/error-message.mjs":"sha256-4htXVHxjc4veDrmoke/QT/YINwjDT0ap2yaeV69nskk=","app/gpu-fallback-notice.mjs":"sha256-6y+G1ChW/ngKGaQ/YnRi+7OSTUi3+7+RDUR28x1nqfQ=","app/host-client.mjs":"sha256-/gYfISh7HZhSTT6Hib4vBYc0gCa1kI2SuV3+7AME7DA=","app/html-look-controls.mjs":"sha256-/R1CGrnR0EkgPWGffxzAK+S1xDhp6FJWotc57gd8eVk=","app/html-look.mjs":"sha256-/rK5Xv1B+T6Lu0hWt5qUzXfptPBucGNdplI5IcF6+U8=","app/html-view.mjs":"sha256-BG48+jyc6OF//rA0rDw/UJmv7yHtGEPw/C1WWnidpy4=","app/launcher.mjs":"sha256-xVCpGduKeWi6q9YfWzvptqtMPdAUc0V/3XRKs2+CPk0=","app/module-worker.mjs":"sha256-hY8ebHjya9pV2WJ8d6zVwI55nih+a7Hrspce/lZ0yh8=","app/persistent-storage.mjs":"sha256-56adnPOIhNuxK4J/WTls9FZRq4WCvy2pmLN2cNFKpqU=","app/photo.mjs":"sha256-yNCeX23brepfyOClgh5EruvUC7yUD7UdL0wXt3FoBA0=","app/policy-guard.mjs":"sha256-y2ICd8ZlF+laRED1yshDpAuIfSu+Jqe5cVEHa2Rh0bk=","app/settings-store.mjs":"sha256-Y0mMn/wZficKsR77joslhpcxCh5xlks+NboqjGV1cmI=","app/settings.mjs":"sha256-YdvLD0b/cJsYnCYNx2uhfqhO7tSb9BTDAmtGX2fCleU=","app/style.css":"sha256-yO5sZuykNJq2wRWv1JjehKStjN5yTRcdjE4X/5s404I=","app/surface-input.mjs":"sha256-iDlOgNUCDFwWokpo3EyeDy+2oRZjRIjf4F7o6eXvlMs=","app/sw-gate.mjs":"sha256-GntJtlPxPBkrJFTuXgXnrbTze7NPWFAbkzE2VRdrYIU=","app/voice-capture-processor.js":"sha256-ZbCZWJXT9y+P814tDZVJ8cVCKTl2BXoF0KEgTYBlp+k=","app/voice-recorder.mjs":"sha256-1EOuFiR/dkLgbgqRb05Y6HqqxYopWbqDuDrcPNUfI0Q=","app/world-lock.mjs":"sha256-LMPTHf/IAZuGlG40+UUC4V2sf5aiGCs9V4qKboOkzFw=","app/world-microphone.mjs":"sha256-+a+lpHlXttncxLctTibHIJYxZ2XsM97e3FZVb997VrY=","app/world-session.mjs":"sha256-2+TyYc49s+GxdM7iPKQnDzS9delSAXv2B1JLkiyLk34=","app/world-sound.mjs":"sha256-2yfFuyQ1tQZ5szPz8wgp1A22CdECA5Gz5v+1BFtMbPE=","app/world-view.mjs":"sha256-gSvYPdeHw4j5HUH4oFpworm8QWzoKCwdlNlevHSa5zQ=","core/worker.mjs":"sha256-zgT73bLQbrxAvGNbELVoIOa9iEZz6LeHyBNy+ARg9U4=","generated/core/emoji.ttf":"sha256-uOJepo24L55NCu6SH0QgvivjmIe9XIk6KtmHEFMfnQw=","generated/core/font.ttf":"sha256-WFaMiKAbgN/AVtrKPur9Q0oDgN8aSN2lPw3g1xYQm70=","generated/core/quine_browser.js":"sha256-ab7daM8Ju480TKvyOTtbF2tCuvE5hN0RATwxmPsjOtg=","generated/core/quine_browser_bg.wasm":"sha256-ytdxcE+1QKCJ+Qp2j8aI5yOIDyOBQhrQfCv6X1Kffws=","generated/icons/apple-touch-icon.png":"sha256-jkLdoKp6gi+C6LYNvKaqpuT1Aw3vUScT2dg1lIR7H6Y=","generated/icons/favicon.ico":"sha256-YAmwGmK5O5KBrpcD6/TIlnUGK4u5R87q6q7jX3t5Huo=","generated/icons/favicon.svg":"sha256-NBWRHFpZGEnkqvOed8TWADx0AC4yCma2yKEAkeRE/6k=","generated/icons/icon-192.png":"sha256-iZq8BUSfzKt4OTs74kdOtpXHNgoWIcZGOaJfeeMubSY=","generated/icons/icon-512.png":"sha256-QnceUSuzRSjQslktwxD74QAFhc31SlcO+PjK9qTa/uM=","generated/icons/icon-maskable-512.png":"sha256-QnceUSuzRSjQslktwxD74QAFhc31SlcO+PjK9qTa/uM=","generated/sound/quine_sound_wasm.js":"sha256-o0w7jP3DhFaUqxOCQsWtcU2ndTx+5LxFFl4OxKMT4Rc=","generated/sound/quine_sound_wasm_bg.wasm":"sha256-tF5EUQ8kFdTQNtTTE7eIJoHQB6b0STJLWLFUtkrBKLQ=","index.html":"sha256-+M1QcocdWKFTFn9k8gBMOtnitsDshFvazTNjKfLBjvU=","manifest.webmanifest":"sha256-ESgNmS3jKrI01XWaWlySN0f90QVKpLWPaKDPmRceoo4=","release-version.txt":"sha256-nFlV/JmmC49t7mz1gsRCDZHhs+KiAfUyyR4svfzn+lE=","settings.html":"sha256-Pmsr9uBUV4EADp5+rtio5q1LmW7ap+8sLETBMUjnsYM=","sound/browser-sound.mjs":"sha256-EmM+PDigCT87SZDLr11w5BLgUg+u7b9W59w3BdC6+fk=","sound/quine-sound-processor.js":"sha256-eKYlGCu5TDi61xBcpQeeTOK5MpZLOnYLE90tgsAj6kU=","sound/quine-sound-worker.mjs":"sha256-JDvF5YOGXfwp3XzSmbcpiCN6MaRZoIm1njkll0Kc/zM="}};

const CACHE_PREFIX = "quine-shell-";
const CACHE = CACHE_PREFIX + PRECACHE.version;

/**
 * The cache key of `path` at `integrity`: the file's URL with the hash in its
 * query, so equal content has one key across versions.
 * @param {string} path
 * @param {string} integrity
 */
function keyOf(path, integrity) {
  const url = new URL(path, sw.registration.scope);
  url.search = `sha=${encodeURIComponent(integrity)}`;
  return url.href;
}

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await Promise.all(
          Object.entries(PRECACHE.files).map(async ([path, integrity]) => {
            const key = keyOf(path, integrity);
            const held = await caches.match(key);
            const response =
              held ?? (await fetch(new URL(path, sw.registration.scope), { integrity, cache: "no-cache" }));
            if (!response.ok) throw new Error(`precache ${path}: HTTP ${response.status}`);
            await cache.put(key, response);
          }),
        );
      } catch (e) {
        // A failed install never activates, so `activate` would never clean
        // its partial cache up: it goes now, and the old version stays.
        await caches.delete(CACHE);
        throw e;
      }
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
      }
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(sw.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // The query never names a different file (`index.html?world=<id>` is the
  // launcher's route), and the scope's directory is its index.html.
  const path = url.pathname.slice(scope.pathname.length) || "index.html";
  const integrity = PRECACHE.files[path];
  if (integrity === undefined) return;
  // A miss (an evicted entry) is refetched under this version's hash, never
  // answered by whatever the network or the HTTP cache holds now.
  event.respondWith(
    (async () =>
      stamped(
        (await (await caches.open(CACHE)).match(keyOf(path, integrity))) ??
          (await fetch(new URL(path, sw.registration.scope), { integrity, cache: "no-cache" })),
      ))(),
  );
});

/**
 * `response` with this version's policy as its Content-Security-Policy.
 * @param {Response} response
 */
function stamped(response) {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", PRECACHE.policy);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
