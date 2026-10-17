// THE ENGINE OF A WORKER, loaded once: the wasm module, its build identity and
// the font - shared by every Worker entry (worker.mjs, publication-worker.mjs).
// THE FONT COMES BEFORE ANY WORLD: a world paints its boot view the moment it
// opens and a browser has no font store to fall back on.
import init, { install_build_identity, install_font } from "../generated/core/quine_browser.js";
import { errorMessage } from "../app/error-message.mjs";

/**
 * @param {(text: string) => void} diagnostic  where a non-fatal problem is said.
 */
export async function loadEngine(diagnostic) {
  await init({ module_or_path: new URL("../generated/core/quine_browser_bg.wasm", import.meta.url) });
  // An active service-worker release serves its own metadata with its code.
  // Blob bootstraps may bypass that worker in Firefox: keep their provenance
  // unknown rather than attribute today's deployment to older running code.
  if (location.protocol !== "blob:") {
    try {
      const identity = await fetch(new URL("../build-identity.json", import.meta.url));
      if (identity.ok) install_build_identity(await identity.text());
    } catch (error) {
      // Missing attribution is not a broken world. Match native startup's
      // truthful unknown fallback, while making malformed metadata visible.
      diagnostic(`build identity unavailable: ${errorMessage(error)}`);
    }
  }
  const font = await fetch(new URL("../generated/core/font.ttf", import.meta.url));
  install_font(new Uint8Array(await font.arrayBuffer()));
}
