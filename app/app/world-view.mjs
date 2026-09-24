// THE WORLD VIEW: one world, full screen. The page is the host chrome; the
// canvas shows world content only, and its box is the rectangle the world is
// laid out in (the shell lays out its chrome; the core draws into the box it
// is told - AGENTS.md, chrome rule).
//
// THE CHROME IS THE PAGE'S: the conversation, the status line and the chat
// input are laid out here, below the picture, and the core draws none of them
// (`ShellKind::Browser` reserves no strips). The core publishes their CONTENT
// - the conversation's lines, the status line as finished text - and the page
// owns their layout and view state.
//
// ONE WORLD PER WORKER, and the Worker's life is this view's: leaving the view
// closes the world (its last boundary written down, its files handed back),
// stops its sound and terminates the Worker, so the next world starts clean.
//
// A MODULE WITH ONE ENTRY, `mountWorldView`, which builds its own DOM: the
// product page calls it plainly, and a test fixture calls it with a Worker
// that scripts the provider - so what the suites drive IS the shipped view.
import { loadSettings } from "./settings-store.mjs";
import { waitUntilFree } from "./world-lock.mjs";
import { openWorldSession } from "./world-session.mjs";
import { connectWorldSound } from "./world-sound.mjs";
import { mountConversation } from "./conversation.mjs";
import { mountChatInput } from "./chat-input.mjs";

/** How often the status line is re-derived: its phase age counts seconds. */
const STATUS_REFRESH_MS = 1000;

/**
 * @param {object} [o]
 * @param {string|URL} [o.workerUrl]  tests only: a wrapper Worker.
 * @param {string} [o.backHref]  where Back goes (the launcher).
 */
export function mountWorldView({ workerUrl, backHref = "index.html" } = {}) {
  const params = new URLSearchParams(location.search);
  const worldId = params.get("world") ?? "";
  // UNTITLED UNTIL OPEN: the title is the catalog's name for this app, which
  // arrives with the Worker's `open` - never a name carried in the URL, which
  // anyone can edit and which goes stale when the app is renamed.
  document.body.classList.add("world");

  const header = el("header", { class: "bar" });
  const back = el("button", { id: "back", type: "button", "aria-label": "Back to apps" }, "← Apps");
  const title = el("h1", { id: "world-name" });
  header.append(back, title);
  const errorBox = el("p", { class: "error", id: "error", hidden: "" });
  const notice = el("p", { class: "notice", id: "resident-state", hidden: "" });
  const picture = el("div", { id: "picture" });
  const canvas = el("canvas", { id: "canvas", "aria-label": "app" });
  picture.append(canvas);
  const conversation = mountConversation();
  const status = el("p", { id: "status" });
  const statusLine = el("span", { id: "status-line" }, "opening…");
  const corner = el("span", { id: "status-corner" });
  status.append(statusLine, corner);
  document.body.append(header, errorBox, notice, picture, conversation.element, status);

  const showError = (text) => {
    errorBox.hidden = false;
    errorBox.textContent = text;
  };

  const sound = connectWorldSound(showError);
  let opened = false;
  const session = openWorldSession({
    canvas,
    worldId,
    workerUrl,
    onMessage(data) {
      switch (data.type) {
        case "open":
          opened = true;
          title.textContent = data.name;
          document.title = `${data.name} · Quine`;
          document.body.dataset.ready = "1";
          break;
        case "sound":
          sound.command(data.text);
          break;
        case "status":
          statusLine.textContent = data.line;
          corner.textContent = data.corner;
          break;
        case "dock":
          conversation.show(data.lines);
          break;
        case "error":
          // A world that cannot open (another tab owns it, no persistent
          // storage, a bad id, a world that is not in the catalog - opening
          // never creates one) says why, in words a person can act on.
          showError(data.error);
          // HELD BY ANOTHER TAB: open it here the moment that tab lets go.
          if (!opened && data.locked) waitUntilFree(worldId).then(() => location.reload());
          break;
      }
    },
  });

  document.body.append(mountChatInput((text) => session.post({ type: "say", text })));
  // A timer, not a Worker loop: a hidden tab's timers are throttled by the
  // browser, so a world nobody is looking at is not asked for a status line.
  const statusTimer = setInterval(() => session.post({ type: "status" }), STATUS_REFRESH_MS);

  // THE RESIDENT, from Settings: the key goes to this world's Worker once and
  // nowhere else. No key is not an error - the world opens without a resident
  // and the view says where to add one.
  const settings = loadSettings();
  if (settings.key) {
    session.post({ type: "resident", apiKey: settings.key, model: settings.model, effort: settings.effort });
  } else {
    notice.hidden = false;
    notice.replaceChildren(
      "No resident: add an OpenRouter key in ",
      el("a", { href: "settings.html" }, "Settings"),
      ".",
    );
  }

  let leaving = null;
  /** Close the world, then go to `href` (null: stay). Idempotent: Back twice closes once. */
  const leave = (href) => {
    clearInterval(statusTimer);
    leaving ??= Promise.all([session.close(), sound.stop()]).finally(() => {
      if (href) location.href = href;
    });
    return leaving;
  };
  back.addEventListener("click", () => leave(new URL(backHref, location.href).href));
  // LEAVING BY ANY OTHER DOOR (the browser's Back, a link, closing the tab)
  // leaves the world too: its sound stops and its files are handed back. A
  // page the browser kept in its back/forward cache comes back with a closed
  // world, so it reloads into a fresh one.
  addEventListener("pagehide", () => leave(null));
  addEventListener("pageshow", (e) => e.persisted && location.reload());
  return { session, leave };
}

/** A small DOM builder: attributes as given, children as nodes or TEXT. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
