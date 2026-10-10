// THE LAUNCHER: every world in this origin as a tile, newest-opened first,
// plus create, open (a tile click opens the app in the mode it was last in,
// the tile's Launch and Edit links in the mode they name - world-view.mjs),
// export and delete. It holds no state of its own: the catalog (the OPFS
// directory, crates/quine-browser/src/catalog.rs) is the list, and every
// action re-reads it.
//
// ONE PAGE, TWO STATES: the tiles, or one open app (`?world=<id>&mode=...`,
// the world view mounted over them). The URL is the state (`route`).
// EVERY APP OPENS IN A NEW TAB (`openInTab`) and the tiles stay where they
// are: a tab per app, as a person keeps tabs. The world tab stores its
// preview whenever it is hidden (world-view.mjs) and says so
// (catalog-changed.mjs), so these tiles show it while that tab lives on. The
// browser's own Back and Forward keep their native meaning; a world tab whose
// app did not open closes itself through its rescue (`closeWorldTab`). Where
// no tab can be opened (a blocked popup), the app opens in this page instead,
// and the browser's Back pops back to the tiles: the world closes in order
// (last boundary, preview, files) and nothing is killed by a navigation. One
// writer per world stays: a second tab on an open world is refused by its Web
// Lock (crates/quine-browser/src/opfs.rs) and says so.
import { elementById } from "./element-by-id.mjs";
import { errorMessage } from "./error-message.mjs";
import { onCatalogChanged } from "./catalog-changed.mjs";
import { HostClient } from "./host-client.mjs";
import { requestPersistentStorage } from "./persistent-storage.mjs";
import { mountWorldView } from "./world-view.mjs";

const catalog = new HostClient();
const list = elementById("worlds", HTMLUListElement);
const empty = elementById("empty", HTMLElement);
const error = elementById("apps-error", HTMLElement);

/** @param {unknown} e */
function showError(e) {
  error.hidden = false;
  error.textContent = errorMessage(e);
}

/**
 * This page showing app `id`, in `mode`.
 * @param {string} id
 * @param {"launch" | "edit"} mode
 */
function worldUrl(id, mode) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("world", id);
  url.searchParams.set("mode", mode);
  return url.href;
}

/**
 * The open app's view, or null while the tiles show.
 * @type {ReturnType<typeof mountWorldView> | null}
 */
let view = null;

/**
 * Show what the URL names: an app (mounted once) or the tiles (the app left
 * first). SERIALIZED: a step waits for the one before, so a mount never
 * overlaps a leave that is still closing its world, and each step re-reads
 * the URL - a burst of Back and Forward converges on the last one. A step
 * that fails says why and never stops the steps after it.
 */
let routing = Promise.resolve();
function route() {
  routing = routing.then(routeNow).catch(showError);
  return routing;
}

async function routeNow() {
  const opens = new URLSearchParams(location.search).has("world");
  if (opens && !view) {
    view = mountWorldView({ rescue });
  } else if (!opens && view) {
    const leaving = view;
    view = null;
    await leaving.leave({ store: true });
    await refresh();
  }
}

/**
 * Open `href` (an app's URL, or the tiles) in this page.
 * @param {string} href
 */
function openHere(href) {
  history.pushState(null, "", href);
  return route();
}

/**
 * Open `href` (an app's URL) in a new tab, as a user's click asked: called in
 * the click itself, because a browser lets a page open a tab only during the
 * person's gesture. A tab the browser refuses opens the app here instead.
 * @param {string} href
 */
function openInTab(href) {
  if (!window.open(href, "_blank")) void openHere(href);
}

/**
 * Leave a world tab: the world closes in order and the tiles show, then the
 * tab closes. A browser closes only a tab a script opened (`openInTab`); one
 * a person opened (a bookmark, a typed URL) keeps showing the tiles.
 */
async function closeWorldTab() {
  await openHere(tilesUrl());
  window.close();
}

/**
 * THE RESCUE OF AN APP THAT DID NOT OPEN (world-view.mjs): this page's own
 * Export and Delete, which read the app's file without opening it, and the
 * way back to the tiles.
 * @type {import("./world-view.mjs").Rescue}
 */
const rescue = {
  exportApp: async (id) => exportWorld(id, await nameOf(id)),
  deleteApp: async (id) => {
    await deleteWorld(id, await nameOf(id));
    await closeWorldTab();
  },
  close: () => void closeWorldTab(),
};

/** @param {string} id */
async function nameOf(id) {
  try {
    return (await catalog.list()).find((w) => w.id === id)?.name ?? id;
  } catch {
    return id;
  }
}

/** This page showing the tiles. */
function tilesUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  return url.href;
}

/**
 * A plain click on a link to an app opens it in a new tab (`openInTab`); a
 * click with a modifier or the middle button is the browser's own.
 * @param {HTMLAnchorElement} link
 */
function openOnClick(link) {
  link.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openInTab(link.href);
  });
}

async function refresh() {
  let worlds;
  try {
    worlds = await catalog.list();
  } catch (e) {
    // AN UNREADABLE CATALOG IS NOT AN EMPTY ONE: show the reason, never the
    // fresh-start screen on top of somebody's work.
    list.replaceChildren();
    empty.hidden = true;
    showError(e);
    document.body.dataset.ready = "1";
    return;
  }
  empty.hidden = worlds.length > 0;
  // The previous listing's pictures are gone with its tiles.
  for (const url of previewUrls.splice(0)) URL.revokeObjectURL(url);
  list.replaceChildren(...worlds.map(tile));
  document.body.dataset.ready = "1";
}

/**
 * The tile's picture, its object URL revoked on the next listing.
 * @param {File} png
 */
function previewImage(png) {
  const url = URL.createObjectURL(png);
  previewUrls.push(url);
  const img = document.createElement("img");
  img.className = "preview";
  img.src = url;
  // The name beside it already says what the picture is of.
  img.alt = "";
  return img;
}

/**
 * Object URLs of the tiles' preview pictures, revoked on the next listing.
 * @type {string[]}
 */
const previewUrls = [];

/** @param {import("../../types/worker-messages.js").CatalogApp} app */
function tile({ id, name, mode, preview }) {
  const li = document.createElement("li");
  li.className = "tile";
  li.dataset.world = id;
  const open = document.createElement("a");
  open.className = "open";
  open.href = worldUrl(id, mode);
  openOnClick(open);
  // THE PREVIEW is the picture the world carries in its file of the frame
  // last seen (src/preview.rs), shown from the catalog's display cache and
  // fitted to the tile (style.css); a world with none is its name alone
  // until it is next left.
  if (preview) open.append(previewImage(preview));
  const label = document.createElement("span");
  label.className = "name";
  // textContent: a name is the user's text, never markup.
  label.textContent = name;
  open.append(label);
  const actions = document.createElement("div");
  actions.className = "actions";
  // BOTH MODES, always: the tile opens the remembered one, these name theirs.
  const modeLinks = /** @type {const} */ ([
    ["launch", "Launch"],
    ["edit", "Edit"],
  ]).map(([linkMode, text]) => {
    const link = document.createElement("a");
    link.textContent = text;
    link.className = "button";
    link.dataset.action = linkMode;
    link.href = worldUrl(id, linkMode);
    openOnClick(link);
    return link;
  });
  const exp = document.createElement("button");
  exp.textContent = "Export";
  exp.dataset.action = "export";
  exp.addEventListener("click", () => exportWorld(id, name));
  const del = document.createElement("button");
  del.textContent = "Delete";
  del.className = "danger";
  del.dataset.action = "delete";
  del.addEventListener("click", () => deleteWorld(id, name));
  actions.append(...modeLinks, exp, del);
  li.append(open, actions);
  return li;
}

/**
 * @param {string} id
 * @param {string} name
 */
async function exportWorld(id, name) {
  error.hidden = true;
  try {
    const { bytes, incomplete } = await catalog.export(id);
    if (incomplete) showError(`Exported ${name}, but ${incomplete}.`);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.sqlite3" }));
    const a = document.createElement("a");
    a.href = url;
    // The same file a native catalog holds: `.quine` opens on every shell.
    a.download = `${name.replace(/[\\/:*?"<>|]+/g, "_")}.quine`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    showError(e);
  }
}

/**
 * @param {string} id
 * @param {string} name
 */
async function deleteWorld(id, name) {
  error.hidden = true;
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await catalog.delete(id);
  } catch (e) {
    showError(e);
  }
  await refresh();
}

// NEW APP: + opens the name dialog (a modal <dialog>: Escape closes it).
const newDialog = elementById("new-dialog", HTMLDialogElement);
const newError = elementById("new-error", HTMLElement);
elementById("new-app", HTMLButtonElement).addEventListener("click", () => {
  elementById("new-name", HTMLInputElement).value = "";
  newError.hidden = true;
  newDialog.showModal();
});
elementById("new-cancel", HTMLButtonElement).addEventListener("click", () => newDialog.close());
elementById("new-world", HTMLFormElement).addEventListener("submit", async (e) => {
  e.preventDefault();
  error.hidden = true;
  const input = elementById("new-name", HTMLInputElement);
  // THE TAB OPENS NOW, while the person's Enter or click still counts as a
  // gesture: after the await below a browser would block it as a popup. It
  // is sent to the app once the catalog made it, and closed if it refused.
  const tab = window.open("", "_blank");
  try {
    const id = await catalog.create(input.value);
    newDialog.close();
    // A new app is empty: it opens to be built.
    const url = worldUrl(id, "edit");
    if (tab) tab.location.href = url;
    else void openHere(url);
    void refresh();
  } catch (err) {
    tab?.close();
    // The catalog's refusal (a blank name, say), in the dialog that asked.
    newError.hidden = false;
    newError.textContent = errorMessage(err);
  }
});

// IMPORT, every shell's flow: pick a file, inspect it (nothing is written),
// ask with the same trust text, and only then write. A file of an app this
// catalog already has (the same lineage) asks "update or copy", in Android's
// words (docs/specs/2026-09-20-world-identity-and-import-collision-design.md):
// Import as Copy arrives BESIDE it, and one Replace per candidate - never a
// silent pick - swaps that app's content for the file's.
const importFile = elementById("import-file", HTMLInputElement);
const importDialog = elementById("import-dialog", HTMLDialogElement);
const importConfirm = elementById("import-confirm", HTMLButtonElement);
const importReplace = elementById("import-replace", HTMLElement);
elementById("import", HTMLButtonElement).addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  error.hidden = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = await catalog.inspect(bytes);
    const trust = "An app carries its own program. Import it only if you trust where it came from.";
    const candidates = inspected.collisions;
    const title = elementById("import-title", HTMLElement);
    const detail = elementById("import-detail", HTMLElement);
    if (candidates.length === 0) {
      title.textContent = `Import “${inspected.name}”?`;
      detail.textContent = trust;
      importConfirm.textContent = "Import";
    } else {
      const have =
        candidates.length === 1
          ? `You already have this app (“${candidates[0].name}”).`
          : `You already have this app as: ${candidates.map((c) => `“${c.name}”`).join(", ")}.`;
      title.textContent = `Update or copy “${inspected.name}”?`;
      detail.textContent = `${trust} ${have} Replacing one will overwrite its current state and conversation history with this snapshot. Importing as copy preserves both as separate apps.`;
      importConfirm.textContent = "Import as Copy";
    }
    importReplace.replaceChildren(
      ...candidates.map(({ id, name }) => {
        const button = document.createElement("button");
        button.value = `replace:${id}`;
        button.dataset.replace = id;
        // textContent: a name is the user's text, never markup.
        button.textContent = candidates.length === 1 ? "Replace Existing" : `Replace “${name}”`;
        return button;
      }),
    );
    importDialog.returnValue = "cancel";
    importDialog.showModal();
    await new Promise((resolve) => importDialog.addEventListener("close", resolve, { once: true }));
    const answer = importDialog.returnValue;
    if (answer === "import") await catalog.import(bytes);
    else if (answer.startsWith("replace:")) await catalog.replace(answer.slice("replace:".length), bytes);
  } catch (e) {
    showError(e);
  }
  await refresh();
});

// A tab that comes back (after a world closed in another tab, or a delete)
// shows the catalog as it is NOW, and so does one that is shown while a
// world tab stores its preview.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !view) void refresh();
});
onCatalogChanged(() => {
  if (!document.hidden && !view) void refresh();
});
// Back and Forward between the tiles and an app.
addEventListener("popstate", () => void route());
// A page the browser kept in its back/forward cache comes back with its app
// closed (the view left as the page hid): start over from the URL.
addEventListener("pageshow", (e) => {
  if (e.persisted) location.reload();
});
if (new URLSearchParams(location.search).has("world")) void route();
else void refresh();
requestPersistentStorage().catch((e) => console.warn("persistent storage not requested:", e));
