// THE LAUNCHER: every world in this origin as a tile, newest-opened first,
// plus create, open, export and delete. It holds no state of its own: the
// catalog (the OPFS directory, crates/quine-browser/src/catalog.rs) is the
// list, and every action re-reads it.
import { HostClient } from "./host-client.mjs";

const catalog = new HostClient();
const list = document.getElementById("worlds");
const empty = document.getElementById("empty");
const error = document.getElementById("error");

function showError(e) {
  error.hidden = false;
  error.textContent = String(e?.message ?? e);
}

function worldUrl(id) {
  const url = new URL("world.html", location.href);
  url.searchParams.set("world", id);
  return url.href;
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
  list.replaceChildren(...worlds.map(tile));
  document.body.dataset.ready = "1";
}

function tile({ id, name }) {
  const li = document.createElement("li");
  li.className = "tile";
  li.dataset.world = id;
  const open = document.createElement("a");
  open.className = "open";
  open.href = worldUrl(id);
  // textContent: a name is the person's text, never markup.
  open.textContent = name;
  const actions = document.createElement("div");
  actions.className = "actions";
  const exp = document.createElement("button");
  exp.textContent = "Export";
  exp.dataset.action = "export";
  exp.addEventListener("click", () => exportWorld(id, name));
  const del = document.createElement("button");
  del.textContent = "Delete";
  del.className = "danger";
  del.dataset.action = "delete";
  del.addEventListener("click", () => deleteWorld(id, name));
  actions.append(exp, del);
  li.append(open, actions);
  return li;
}

async function exportWorld(id, name) {
  error.hidden = true;
  try {
    const bytes = await catalog.export(id);
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

document.getElementById("new-world").addEventListener("submit", async (e) => {
  e.preventDefault();
  error.hidden = true;
  const input = document.getElementById("new-name");
  try {
    const id = await catalog.create(input.value);
    location.href = worldUrl(id);
  } catch (err) {
    showError(err);
  }
});

// A tab that comes back (after a world closed in another tab, or a delete)
// shows the catalog as it is NOW.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});
refresh();
