// THE OFFLINE APP SHELL: this site's files, served from the Cache API so the
// installed app starts without a network (the person's apps live in OPFS,
// which needs none).
//
// ONE PRECACHE LIST IS ONE VERSION. The site's URLs are not fingerprinted (the
// modules import each other by plain relative names), so a version is only
// consistent as a whole: every listed file, index.html included, is served
// cache-first from the cache of THIS worker's list. The build writes the list
// into the `PRECACHE` line below (browser/build/inject-precache-list.mjs, run
// by nix/browser.nix `browserSite`); a new list is a new worker, which the
// browser's own update check finds, installs in the background and activates
// at the next start, when no page of the old version is open (no skipWaiting:
// a page never mixes two versions). Then the old caches are deleted.
// Unbuilt (the development tree) the list is empty and the worker serves
// nothing, so an edited file is never answered from a stale cache.
//
// Each file is fetched with its SRI hash, so a stale copy from an HTTP or CDN
// cache can never enter a version (the install fails and is retried at the
// next update check), and a file whose hash an older version already holds is
// taken from there instead of the network. The cache key carries the hash,
// which is what makes that lookup a plain `caches.match`.
//
// Anything not in the list (the OpenRouter API, a web page an app fetches)
// goes to the network exactly as without this worker.
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

/** @type {{ version: string, files: Record<string, string> }} path relative to the scope -> SRI hash */
const PRECACHE = {"version":"decc1f6133921ce9","files":{"app/app-camera.mjs":"sha256-du9oyWcop+aKWyVGWfTVdriS+jCpsnWQUSyNi7M1zD4=","app/camera.mjs":"sha256-rIsDR7GG1nqa9oClbpb0gUSThoxcyEbwmp+b5FzKa4Y=","app/chat-input.mjs":"sha256-dDrSIvjdBl5e9gXJO0kHnSPdWgyeEs7pz9QF9akT4dA=","app/conversation.mjs":"sha256-a/mQb8HgOKthcd84Ll8mL0ax9BJ11Bg0oiPCMcWsV00=","app/developer-door.mjs":"sha256-IDFAKWUFA0qK/0XXCmMB6DGuyGtg71n9BpTitHkD8R8=","app/dom-diff.mjs":"sha256-VYRhYpaOl/pw2NYqMEzVMcZ+2j+AXjE/Oi1TQ3pyngQ=","app/element-by-id.mjs":"sha256-XlqKSv35lHN19NJ0bSpErOC8zN25gIhp7u1PYFc+gxE=","app/error-message.mjs":"sha256-4htXVHxjc4veDrmoke/QT/YINwjDT0ap2yaeV69nskk=","app/gpu-fallback-notice.mjs":"sha256-6y+G1ChW/ngKGaQ/YnRi+7OSTUi3+7+RDUR28x1nqfQ=","app/host-client.mjs":"sha256-r2R9bZVbRp52hwvJR9ViVVBVahnFg1YCZUS+p3MM4ps=","app/html-look-controls.mjs":"sha256-/R1CGrnR0EkgPWGffxzAK+S1xDhp6FJWotc57gd8eVk=","app/html-look.mjs":"sha256-IUnH07feGLeH/tvG/pP6EEQ/CRJrMMH/GwbTZePJXp4=","app/html-view.mjs":"sha256-XtD/CdbFZGr+/HRc+b66Ua48p99w+fYP21wKsnRk6EE=","app/installed-app.mjs":"sha256-7YfE0z8RXeNlPVMsbe9BMmpeQrNd5wS8jVz+6Hx40Dk=","app/launcher.mjs":"sha256-fUgFk4VT8ARFpmQ1wrNjbVDFRYn7ttrV9Cz8aeCZR8k=","app/module-worker.mjs":"sha256-Re+52nhCfTNRKFixAY3pjsMwUQ0bdsKhCREx4DAFlrA=","app/photo.mjs":"sha256-yNCeX23brepfyOClgh5EruvUC7yUD7UdL0wXt3FoBA0=","app/settings-store.mjs":"sha256-47HWoLZYhghXe8QqwBEsIwWQmaKwlwh7kNJF7dLLHyw=","app/settings.mjs":"sha256-buZiRWwSiKCu4k+Z7nScQ7e0TyLLQMikvySphQfJHa4=","app/style.css":"sha256-Gjfqii67mj0epyvsELN4Q91pvkCiNP3LumYm6uexXP0=","app/surface-input.mjs":"sha256-02F4PGVrlAD4/WHGed1qimltsp8xkhXiYnvJ02b/H/o=","app/use-viewport.mjs":"sha256-gw8vrHqXdYO2HiATzdfFSVKYM+I57k3xquqxP/ArChQ=","app/voice-capture-processor.js":"sha256-ABIBxpdWLraFY11aK83g5ZBo9CNbN8gDaROZoSQlNoI=","app/voice-recorder.mjs":"sha256-BflfyB0AH2nJ8nbDzZ79/J8S/hAgs9Xu1wM4RwVJwFk=","app/world-lock.mjs":"sha256-LMPTHf/IAZuGlG40+UUC4V2sf5aiGCs9V4qKboOkzFw=","app/world-microphone.mjs":"sha256-fCzXZRfxmZ0AaET4K57fh+YrlCcU1fdS5hs0dg4B5VU=","app/world-session.mjs":"sha256-xFuJSvN5jomnAageYOrfgHs0y3otP2nf0OUEBZxBNko=","app/world-sound.mjs":"sha256-2yfFuyQ1tQZ5szPz8wgp1A22CdECA5Gz5v+1BFtMbPE=","app/world-view.mjs":"sha256-5jIw7Ev36DusR2icsJ80BF94ZNeJUoNsClRPfKa2TeM=","core/worker.mjs":"sha256-zQ++Tc5n/3wuTH/HAGagLfPL3MzCoRc/PM14dnOglIE=","generated/core/emoji.ttf":"sha256-uOJepo24L55NCu6SH0QgvivjmIe9XIk6KtmHEFMfnQw=","generated/core/font.ttf":"sha256-WFaMiKAbgN/AVtrKPur9Q0oDgN8aSN2lPw3g1xYQm70=","generated/core/quine_browser.js":"sha256-ORJlqcvJOh02ZGIuW5SDxYx1FZG5cfH9lPyJp40K0ZQ=","generated/core/quine_browser_bg.wasm":"sha256-a/muQz5jo/r2H2FdjY81mcL7J9sHUFYIKkOUUJq5VB0=","generated/icons/apple-touch-icon.png":"sha256-jkLdoKp6gi+C6LYNvKaqpuT1Aw3vUScT2dg1lIR7H6Y=","generated/icons/favicon.ico":"sha256-YAmwGmK5O5KBrpcD6/TIlnUGK4u5R87q6q7jX3t5Huo=","generated/icons/favicon.svg":"sha256-NBWRHFpZGEnkqvOed8TWADx0AC4yCma2yKEAkeRE/6k=","generated/icons/icon-192.png":"sha256-iZq8BUSfzKt4OTs74kdOtpXHNgoWIcZGOaJfeeMubSY=","generated/icons/icon-512.png":"sha256-QnceUSuzRSjQslktwxD74QAFhc31SlcO+PjK9qTa/uM=","generated/icons/icon-maskable-512.png":"sha256-QnceUSuzRSjQslktwxD74QAFhc31SlcO+PjK9qTa/uM=","generated/sound/quine_sound_wasm.js":"sha256-o0w7jP3DhFaUqxOCQsWtcU2ndTx+5LxFFl4OxKMT4Rc=","generated/sound/quine_sound_wasm_bg.wasm":"sha256-62SsTR6lf9ovXzaY5+ltKYudC5O7I29kvpzTTphKNnw=","index.html":"sha256-1SpgapVmI/xuS9rMQhTPGGHSZuZ5YOsvP+T4bmkcUt0=","manifest.webmanifest":"sha256-ESgNmS3jKrI01XWaWlySN0f90QVKpLWPaKDPmRceoo4=","settings.html":"sha256-J75NHH8zHm4ksyklx9MHZMoBldPrnuI/ApaplOBcO7I=","sound/browser-sound.mjs":"sha256-EmM+PDigCT87SZDLr11w5BLgUg+u7b9W59w3BdC6+fk=","sound/quine-sound-processor.js":"sha256-eKYlGCu5TDi61xBcpQeeTOK5MpZLOnYLE90tgsAj6kU=","sound/quine-sound-worker.mjs":"sha256-ax//vymDkx1Gs+FFqlfQiLyW4WtpJehr/Egup3oymmA="}};

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
  event.respondWith((async () => (await (await caches.open(CACHE)).match(keyOf(path, integrity))) ?? fetch(request))());
});
