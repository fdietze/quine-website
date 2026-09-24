// THE WORKER THAT OWNS ONE WORLD.
//
// The image is single-threaded by construction, so this file is the only place
// that ever touches it. Its whole job is three things the wasm cannot do for
// itself: instantiate the module, forward the page's messages, and SCHEDULE -
// the world says how long it may be left alone and this decides when to call
// it again.
//
// Everything it posts to the page is plain data. The page paints, the page
// renders the conversation, the page owns the chat input; this owns the world.
// RELATIVE TO THIS MODULE, never to a server root: the site is a static
// directory that may be hosted under any path.
import init, {
  catalog_create,
  catalog_delete,
  catalog_export,
  catalog_list,
  install_font,
  open_world,
  resident_defaults,
} from "../generated/core/quine_browser.js";

/** @type {any} */
let world = null;
/**
 * Messages for the world that arrived WHILE IT WAS OPENING (a resize from the
 * page's first layout, an early key), replayed in order once it is open and
 * dropped if it never opens. Input for a world that is not open is not an
 * error: the page's events race the open, and a refused open is reported by
 * its own message.
 */
let opening = null;
/** A pending scheduled pump, so the queue never holds two. */
let timer = null;

/**
 * Run one turn and schedule the next one from the world's OWN answer:
 * 0 = work is due now, -1 = nothing is due at all (no timer: an idle world in a
 * background tab costs nothing), otherwise milliseconds.
 */
function pump() {
  timer = null;
  if (!world) return;
  const wait = world.pump();
  if (world.stopped()) {
    post({ type: "stopped" });
    return;
  }
  if (wait < 0) return;
  // A due-now answer still goes through the task queue rather than recursing,
  // so a busy world cannot starve the messages the page is sending it.
  timer = setTimeout(pump, Math.max(0, wait));
}

/** Wake the world because something arrived for it; never queue two pumps. */
function kick() {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(pump, 0);
}

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
 * THE CATALOG, asked by the launcher: request/reply by id. It lives in this
 * Worker because the catalog's writes need synchronous access handles; it never
 * opens a world, so it does not spend this Worker's one world.
 */
const CATALOG = {
  list: () => catalog_list(),
  create: (name) => catalog_create(name),
  delete: (id) => catalog_delete(id),
  export: (id) => catalog_export(id),
  // Not the catalog, but the same kind of question a page asks the engine
  // outside a world: what the Settings screen offers (src/llm.rs).
  defaults: () => resident_defaults(),
};

self.onmessage = async (event) => handle(event.data);

async function handle(msg) {
  const forWorld = !["open", "catalog", "close"].includes(msg.type);
  if (forWorld && !world) {
    opening?.push(msg);
    return;
  }
  try {
    switch (msg.type) {
      case "catalog": {
        try {
          await ready();
          const value = await CATALOG[msg.op](msg.arg);
          // An export's bytes are TRANSFERRED, not copied: a world file can be
          // large and the page downloads it once.
          post({ type: "catalog-reply", id: msg.id, ok: true, value }, value?.buffer ? [value.buffer] : []);
        } catch (error) {
          post({ type: "catalog-reply", id: msg.id, ok: false, error: String(error?.message ?? error) });
        }
        break;
      }
      case "open": {
        opening = [];
        await ready();
        // `wake` is the core telling THIS scheduler that a resident future
        // finished; it is never page data.
        world = await open_world(msg.worldId, msg.width, msg.height, msg.scale, (m) =>
          m.type === "wake" ? kick() : post(m),
        );
        // The world's catalog name: the page titles itself from this, never
        // from its own URL.
        post({ type: "open", name: world.name });
        const early = opening;
        opening = null;
        for (const m of early) await handle(m);
        kick();
        break;
      }
      case "eval":
        world.eval(msg.id, msg.src);
        kick();
        break;
      case "usage":
        post({ type: "usage", id: msg.id, webSearchRequests: world.web_search_requests() });
        break;
      case "resident":
        // THE KEY STAYS IN THIS WORKER: handed to the provider transport and
        // nowhere else - not the image, the world file, the chat or a log.
        world.start_resident(msg.apiKey, msg.model ?? "", msg.effort ?? "");
        kick();
        break;
      case "status":
        // The page's clock asking for a fresh status line (its phase age
        // moves with time alone); posts only if the line changed.
        world.refresh_status();
        break;
      case "say":
        world.say(msg.text);
        kick();
        break;
      case "resize":
        world.resize(msg.width, msg.height, msg.scale);
        kick();
        break;
      case "pointer":
        world.pointer(msg.pointerId, msg.phase, msg.x, msg.y);
        kick();
        break;
      case "hover":
        world.hover(msg.x, msg.y);
        kick();
        break;
      case "wheel":
        world.wheel(msg.x, msg.y, msg.dy);
        kick();
        break;
      case "key":
        world.key(msg.down, !!msg.repeat, msg.name, !!msg.logo);
        kick();
        break;
      case "blur":
        world.blur();
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
        const closing = world;
        world = null;
        closing.close();
        post({ type: "closed" });
        break;
      }
      default:
        post({ type: "error", error: `no such worker message: ${msg.type}` });
    }
  } catch (error) {
    if (msg.type === "open") opening = null;
    post({ type: "error", error: String(error?.message ?? error), locked: error?.locked === true });
  }
}
