// THE WORKER THAT OWNS ONE WORLD.
//
// The image is single-threaded by construction, so this file is the only place
// that ever touches it. Its whole job is three things the wasm cannot do for
// itself: instantiate the module, forward the page's messages, and SCHEDULE -
// the world says how long it may be left alone and this decides when to call
// it again.
//
// Everything it posts to the page is plain data. The page renders the
// conversation and owns the chat input; this owns the world and the canvas
// the page handed over, which the world paints into itself.
// RELATIVE TO THIS MODULE, never to a server root: the site is a static
// directory that may be hosted under any path.
// First: refuses to run a plain-URL Worker without the page's policy.
import "../app/policy-guard.mjs";
import init, {
  catalog_create,
  catalog_delete,
  catalog_export,
  catalog_import,
  catalog_inspect,
  catalog_list,
  catalog_replace,
  catalog_set_mode,
  install_font,
  open_world,
  openrouter_choice,
  openrouter_model_ids,
  resident_defaults,
  sign_in_finish,
  sign_in_start,
  store_world_preview_cache,
} from "../generated/core/quine_browser.js";
import { announceCatalogChanged } from "../app/catalog-changed.mjs";
import { errorMessage, errorStack } from "../app/error-message.mjs";

/** @typedef {import("../../types/worker-messages.js").ToWorker} ToWorker */
/** @typedef {import("../../types/worker-messages.js").FromWorker} FromWorker */

/** @type {import("../generated/core/quine_browser.js").QuineWorld | null} */
let world = null;
/**
 * The open world's id, for what the catalog remembers about it.
 * @type {string | null}
 */
let worldId = null;
/**
 * Messages for the world that arrived WHILE IT WAS OPENING OR REPLAYING (a resize from the
 * page's first layout, an early key), drained in FIFO order, including arrivals during an awaited replay, and
 * dropped if it never opens. Input for a world that is not open is not an
 * error: the page's events race the open, and a refused open is reported by
 * its own message.
 * @type {ToWorker[] | null}
 */
let opening = null;
/**
 * A pending scheduled pump, so the queue never holds two.
 * @type {ReturnType<typeof setTimeout> | null}
 */
let timer = null;
/**
 * The open world's preview STORE in flight (`preview`), which a close waits
 * for: the write needs the world's lock, which the close gives back.
 * @type {Promise<void>}
 */
let previewing = Promise.resolve();
/**
 * The open world's latest preview from its read-back to its store (`preview`),
 * which a close waits for only when the page asked it to (a Back).
 * @type {Promise<void>}
 */
let reading = Promise.resolve();

/**
 * Run one turn and schedule the next one from the world's OWN answer:
 * 0 = work is due now, -1 = nothing is due at all (no timer: an idle world in a
 * background tab costs nothing), otherwise milliseconds.
 */
function pump() {
  timer = null;
  if (!world || opening !== null) return;
  const wait = world.pump();
  if (world.stopped()) {
    post({ type: "stopped" });
    return;
  }
  if (wait < 0) return;
  // A due-now answer still goes through the task queue rather than recursing,
  // so a busy world cannot starve the messages the page is sending it.
  // ROUNDED UP: setTimeout truncates its delay to whole ms, so a 28.7 ms wait
  // fired before the tick was due, the next wait (0.7 ms) became a nested
  // zero-delay timer the browser clamps to 4 ms, and every frame came late.
  timer = setTimeout(pump, Math.max(0, Math.ceil(wait)));
}

/** Wake the world because something arrived for it; never queue two pumps. */
function kick() {
  // Opening FIFO: replay may await storage; no boundary can overtake it.
  if (opening !== null) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(pump, 0);
}

/**
 * @param {FromWorker} message
 * @param {Transferable[]} [transfer]
 */
function post(message, transfer = []) {
  self.postMessage(message, transfer);
}

/**
 * The module and the font, once per Worker: THE FONT COMES FIRST, because a
 * world paints its boot view the moment it opens and a browser has no font
 * store to fall back on.
 */
let loaded = null;
function ready() {
  loaded ??= (async () => {
    await init({ module_or_path: new URL("../generated/core/quine_browser_bg.wasm", import.meta.url) });
    const font = await fetch(new URL("../generated/core/font.ttf", import.meta.url));
    install_font(new Uint8Array(await font.arrayBuffer()));
  })();
  return loaded;
}

/**
 * THE EMOJI FACE, once per Worker and only AFTER the first paint: it is
 * megabytes, and no world should wait for it to open. Fetched like the font,
 * so the browser's HTTP cache keeps it; a world whose text needs it repaints
 * the moment it arrives (`add_font`). A failed fetch leaves tofu, never a
 * broken world, and says so once.
 */
let emoji = null;
function addEmojiFont() {
  emoji ??= (async () => {
    try {
      const face = await fetch(new URL("../generated/core/emoji.ttf", import.meta.url));
      if (!face.ok) throw new Error(`HTTP ${face.status}`);
      const bytes = new Uint8Array(await face.arrayBuffer());
      // The world may have closed meanwhile.
      if (!world) return;
      world.add_font(bytes);
      kick();
    } catch (error) {
      post({ type: "diagnostic", text: `the emoji font did not load: ${errorMessage(error)}` });
    }
  })();
}

/**
 * THE CATALOG, asked by the launcher: request/reply by id. It lives in this
 * Worker because the catalog's writes need synchronous access handles; it never
 * opens a world, so it does not spend this Worker's one world.
 */
/** @type {{[Op in import("../../types/worker-messages.js").CatalogOp]: (arg: any) => unknown}} */
const CATALOG = {
  list: () => catalog_list(),
  /** @param {string} name */
  create: (name) => catalog_create(name),
  /** @param {string} id */
  delete: (id) => catalog_delete(id),
  /** @param {string} id */
  export: (id) => catalog_export(id),
  // A picked file's bytes arrive TRANSFERRED (host-client.mjs).
  /** @param {Uint8Array} bytes */
  inspect: (bytes) => catalog_inspect(bytes),
  /** @param {Uint8Array} bytes */
  import: (bytes) => catalog_import(bytes),
  /** @param {{id: string, bytes: Uint8Array}} arg */
  replace: ({ id, bytes }) => catalog_replace(id, bytes),
  // Not the catalog, but the same kind of question a page asks the engine
  // outside a world: what the Settings screen offers (src/llm.rs).
  defaults: () => resident_defaults(),
  // Sign in with OpenRouter, for the Settings page (src/sign_in.rs).
  /** @param {string} callbackUrl */
  signInStart: (callbackUrl) => sign_in_start(callbackUrl),
  /** @param {import("../../types/worker-messages.js").CatalogOps["signInFinish"]["arg"]} arg */
  signInFinish: ({ query, verifier, state }) => sign_in_finish(query, verifier, state),
  // OpenRouter's model as Settings shows it (src/openrouter_model.rs), and
  // the model list its field offers (src/openrouter_models.rs).
  /** @param {import("../../types/worker-messages.js").CatalogOps["openrouterChoice"]["arg"]} arg */
  openrouterChoice: ({ model, suffix }) => openrouter_choice(model, suffix ?? undefined),
  openrouterModels: () => openrouter_model_ids(),
};

self.onmessage = (event) => deliver(event.data);

/** External messages enter the opening FIFO; only replay calls handle directly.
 * @param {ToWorker} msg
 */
function deliver(msg) {
  if (msg.type === "open" && (world || opening !== null)) {
    post({ type: "error", error: "a world is already open or opening" });
    return;
  }
  if (opening !== null && msg.type !== "catalog") {
    opening.push(msg);
    return;
  }
  return handle(msg);
}

/**
 * The open world, for a message that needs one. `handle` never gets here
 * without one (it queues or drops such a message first); this states that
 * to the checker, and would fail by name if that ever changed.
 */
function live() {
  if (!world) throw new Error("no world is open");
  return world;
}

/** @param {ToWorker} msg */
async function handle(msg) {
  const forWorld = !["open", "catalog", "close"].includes(msg.type);
  if (forWorld && !world) return;
  try {
    switch (msg.type) {
      case "catalog": {
        try {
          await ready();
          const value = await CATALOG[msg.op](msg.arg);
          // An export's bytes are TRANSFERRED, not copied: a world file can be
          // large and the page downloads it once.
          post(
            { type: "catalog-reply", id: msg.id, ok: true, value },
            value instanceof Uint8Array ? [value.buffer] : [],
          );
        } catch (error) {
          post({ type: "catalog-reply", id: msg.id, ok: false, error: errorMessage(error) });
        }
        break;
      }
      case "open": {
        /** @type {ToWorker[]} */
        const early = [];
        opening = early;
        await ready();
        // `wake` is the core telling THIS scheduler that a resident future
        // finished; it is never page data.
        // Only an explicit true opens a permission: anything else is off.
        const web = msg.web === true;
        const sound = msg.sound === true;
        worldId = msg.worldId;
        world = await open_world(
          msg.worldId,
          msg.surface,
          msg.width,
          msg.height,
          msg.scale,
          web,
          sound,
          msg.microphone === true,
          msg.camera === true,
          (/** @type {FromWorker | import("../../types/worker-messages.js").WakeMessage} */ m) => {
            if (m.type === "wake") return kick();
            if (m.type === "frame") addEmojiFont();
            post(m);
          },
        );
        // Array iteration visits arrivals appended while mode persistence
        // awaits. External delivery cannot bypass this FIFO or pump it early.
        for (const m of early) await handle(m);
        opening = null;
        // An opening close consumed the world; it must not announce an open.
        if (!world) break;
        // The world's catalog name: the page titles itself from this, never
        // from its own URL. `presenter` says how the canvas is drawn.
        const reason = world.gpu_fallback;
        post({
          type: "open",
          name: world.name,
          presenter: world.presenter,
          // Judge the same Worker that attempted WebGPU, not the page or UA.
          gpuFallback: reason
            ? { reason, apiExposed: Boolean(Reflect.get(navigator, "gpu")), secureContext: self.isSecureContext }
            : null,
        });
        kick();
        break;
      }
      case "sound-command-result":
        // wasm-bindgen coerces numbers to u32. Refuse malformed correlation
        // before that coercion can alias an owned command or incarnation.
        if (
          Number.isInteger(msg.epoch) &&
          msg.epoch > 0 &&
          msg.epoch <= 0xffffffff &&
          Number.isInteger(msg.commandId) &&
          msg.commandId > 0 &&
          msg.commandId <= 0xffffffff &&
          typeof msg.ok === "boolean" &&
          typeof msg.reason === "string" &&
          msg.reason.length <= 1024
        ) {
          world?.sound_command_result(msg.epoch, msg.commandId, msg.ok, msg.reason);
          kick();
        }
        break;
      case "sound-assets-accepted":
        world?.sound_assets_accepted(msg.epoch, msg.keys);
        break;
      case "eval":
        live().eval(msg.id, msg.src);
        kick();
        break;
      case "resident":
        // THE KEY STAYS IN THIS WORKER: handed to the provider transport and
        // nowhere else - not the image, the world file, the chat or a log.
        // Sent at open and again whenever Settings changes the key while
        // this world stays open; a blank key removes the resident.
        live().set_resident(
          msg.apiKey ?? "",
          msg.model ?? "",
          msg.suffix ?? undefined,
          msg.effort ?? "",
          msg.imageModel ?? "",
        );
        kick();
        break;
      case "status":
        // The page's clock asking for a fresh status line (its phase age
        // moves with time alone); posts only if the line changed.
        live().refresh_status();
        break;
      case "say":
        live().say(msg.text, msg.attachments ?? "[]");
        kick();
        break;
      case "fix-with-ai":
        live().fix_with_ai();
        kick();
        break;
      case "mode":
        live().set_mode(msg.mode);
        kick();
        // The mode the page now shows, for the catalog to remember
        // (`app_catalog::Mode`). Best effort: a mode not remembered changes
        // only how the tile opens next time.
        if (worldId !== null) await catalog_set_mode(worldId, msg.mode).catch((e) => console.warn(String(e)));
        break;
      case "preview": {
        // THE TAB WAS HIDDEN: the picture of what was on screen - the page's
        // drawing of its :html view, else the canvas frame the world
        // presented - goes into the world's file while the world goes on,
        // and its display cache after, so a launcher in another tab shows it
        // without waiting for this tab to close (a write during unload is
        // not promised to finish). A canvas frame is prepared synchronously
        // and read back after; nothing on screen leaves the stored picture.
        // Announced whatever the answer: the launcher re-reads, and a test
        // knows the hidden tab is settled.
        // A CLOSE NEVER WAITS FOR THE READ-BACK, only for a store already
        // writing (`previewing`): a tab closed in front is hidden and then
        // closed at once, and a Worker torn down with a GPU read-back in
        // flight holds the world's Web Lock until the engine gets round to it.
        // A picture read back after its world closed is dropped - its lock,
        // which the store needs, is gone.
        const id = worldId;
        if (id === null) break;
        const shown = msg.png ? Promise.resolve(msg.png) : live().preview();
        reading = shown
          .then((png) => {
            if (worldId !== id || !world) return undefined;
            const open = world;
            previewing = previewing
              .then(() => (png ? store_world_preview_cache(id, open.store_preview(png)) : undefined))
              .catch((e) => console.warn("the preview was not stored:", String(e)))
              .then(announceCatalogChanged);
            return previewing;
          })
          .catch((e) => console.warn("the preview was not drawn:", String(e)));
        break;
      }
      case "stop":
        // The turn line's Stop: the session's one STOP signal
        // (`BrowserSession::stop_wake`), immediate after opening. Startup
        // messages retain the opening FIFO; no wake runs during replay.
        live().stop_wake();
        kick();
        break;
      case "resize":
        live().resize(msg.width, msg.height, msg.scale);
        kick();
        break;
      case "pointer":
        // `canvas`/`generation` name a leaf; absent, the world's own canvas.
        live().pointer(msg.canvas, msg.generation ?? 0, msg.pointerId, msg.phase, msg.x, msg.y);
        kick();
        break;
      case "hover":
        live().hover(msg.canvas, msg.generation ?? 0, msg.x, msg.y);
        kick();
        break;
      case "wheel":
        live().wheel(msg.canvas, msg.generation ?? 0, msg.x, msg.y, msg.dy);
        kick();
        break;
      case "wheel-zoom":
        live().wheel_zoom(msg.canvas, msg.generation ?? 0, msg.x, msg.y, msg.dy);
        kick();
        break;
      case "key":
        live().key(msg.down, !!msg.repeat, msg.name);
        kick();
        break;
      case "camera-captured":
        live().camera_captured(msg.token, msg.jpeg);
        kick();
        break;
      case "camera-failed":
        live().camera_failed(msg.token, msg.kind);
        kick();
        break;
      case "microphone-permission-granted":
        live().microphone_permission_granted();
        break;
      case "microphone-admitted":
        live().microphone_admitted(msg.token);
        kick();
        break;
      case "microphone-recorded":
        live().microphone_recorded(msg.token, msg.pcm, msg.rate, msg.channels);
        kick();
        break;
      case "microphone-failed":
        live().microphone_failed(msg.token, msg.reason);
        kick();
        break;
      case "blur":
        live().blur();
        kick();
        break;
      case "canvas-attach":
        post({
          type: "canvas-presenter",
          id: msg.id,
          generation: msg.generation,
          presenter: live().canvas_attach(msg.id, msg.generation, msg.surface),
        });
        kick();
        break;
      case "html-fit":
        live().html_fit(msg.frame, msg.width, msg.height, msg.paneWidth, msg.paneHeight);
        break;
      case "canvas-resize":
        live().canvas_resize(msg.id, msg.generation, msg.width, msg.height, msg.scale);
        kick();
        break;
      case "canvas-detach":
        live().canvas_detach(msg.id, msg.generation);
        kick();
        break;
      case "picture":
        live().picture(msg.id, msg.token);
        kick();
        break;
      case "look-drawn":
        // The page's drawing of the :html view a parked `look` asked for.
        live().look_drawn(msg.token, msg.b64, msg.width, msg.height, msg.x, msg.y, msg.scale);
        kick();
        break;
      case "look-failed":
        live().look_failed(msg.token, msg.kind, msg.hint);
        kick();
        break;
      case "html-event":
        // A DOM event on the world's HTML view (app/html-view.mjs): identity
        // and payload only; the handler stays in the image.
        live().html_event(msg.id, msg.event, msg.seq, JSON.stringify(msg.payload ?? {}));
        kick();
        break;
      case "close": {
        if (!world) {
          // Nothing opened (a refused open), so nothing to write down.
          post({ type: "closed" });
          break;
        }
        // CLOSING IS EXPLICIT: the last boundary is written down and the
        // world's files are handed back, which is what lets the next tab open
        // it. A page must not RELY on reaching this - browsers promise no
        // unload callback - which is why every non-tick boundary already wrote
        // itself down.
        // A BACK WAITS FOR ITS PICTURE (world-view.mjs `leave`): the preview
        // it asked for just before is read back and stored while the world
        // is still open. An unloading page's close never waits for a
        // read-back (see `preview`).
        if (msg.preview) await reading;
        if (!world) {
          post({ type: "closed" });
          break;
        }
        // Capture callbacks are posted before close. Consume their delivery
        // boundary before releasing storage, even if the scheduled pump has
        // not yet run (app-switch must retain the completed recording).
        world.pump();
        const closing = world;
        world = null;
        worldId = null;
        // The hidden tab's preview is the tile's picture (the close draws
        // none, crates/quine-browser/src/session.rs `close`); a store already
        // writing finishes under the lock first.
        await previewing;
        closing.close();
        announceCatalogChanged();
        post({ type: "closed" });
        break;
      }
      default:
        // Unreachable for a checked page (ToWorker is exhaustive); a stale
        // page is still answered.
        post({ type: "error", error: `no such worker message: ${/** @type {{type: string}} */ (msg).type}` });
    }
  } catch (error) {
    // THE WHOLE STACK to the console, for the developer: the page shows only
    // the message, and a failure inside the world (a wasm-bindgen
    // "recursive use of an object" was seen once, never reproduced) is
    // diagnosable only from where it was thrown.
    console.error(`quine worker: ${msg.type} failed`, errorStack(error));
    const pendingClose = msg.type === "open" ? (opening?.filter((m) => m.type === "close").length ?? 0) : 0;
    if (msg.type === "open") {
      opening = null;
      worldId = null;
    }
    // `locked` and `refused`: the refusal's kind, set by `open_world`
    // (crates/quine-browser/src/worker.rs).
    const locked = error instanceof Error && /** @type {{locked?: unknown}} */ (error).locked === true;
    const kind = error instanceof Error ? /** @type {{refused?: unknown}} */ (error).refused : undefined;
    const refused = typeof kind === "string" ? kind : undefined;
    post({ type: "error", error: errorMessage(error), locked, refused });
    // A refused open still settles every close already waiting for it.
    for (let i = 0; i < pendingClose; i += 1) post({ type: "closed" });
  }
}
