// THE WORLD VIEW: one world, full screen. The page is the host chrome; the
// canvas shows world content only, and its box is the rectangle the world is
// laid out in (the shell lays out its chrome; the core draws into the box it
// is told - .mex/context/architecture.md, chrome rule).
//
// THE CHROME IS THE PAGE'S: the turn line, the conversation, the status line
// and the chat input are laid out here, below the picture, and the core draws none of them
// (`ShellKind::Browser` reserves no strips). The core publishes their CONTENT
// - the conversation's lines, the status line as finished text - and the page
// owns their layout and view state.
//
// LAUNCH OR EDIT (`app_catalog::Mode`), as on every shell: in Launch the app's
// picture fills the page and no chrome is shown; Edit adds the turn line, the
// conversation, the status line and the chat input below it. The page shows
// the mode its URL names (`mode=launch|edit`: a tile opens the mode its app was
// last in, its Launch and Edit links the one they name), F2 flips it, and every mode
// shown is sent to the Worker for the catalog to remember. `body[data-mode]`
// is what the stylesheet reads.
//
// ONE WORLD PER WORKER, and the Worker's life is this view's: `leave` closes
// the world (its last boundary written down, its preview drawn, its files
// handed back), stops its sound, terminates the Worker and takes the view's
// DOM and listeners away, so the page is as it was before the mount. WHEN to
// leave is the caller's: the launcher leaves on its rescue's Close and on the
// browser's Back to the tiles (launcher.mjs), and any page leaves when it is
// hidden for good. Every time the tab is hidden, the world's preview is
// stored while the world goes on.
//
// A MODULE WITH ONE ENTRY, `mountWorldView`, which builds its own DOM: the
// launcher calls it plainly, and a test fixture calls it with a Worker that
// scripts the provider - so what the suites drive IS the shipped view.
import {
  loadDeveloperSwitches,
  loadPermissions,
  loadSettings,
  onDeveloperSwitchesChange,
  onResidentChange,
} from "./settings-store.mjs";
import { waitUntilFree } from "./world-lock.mjs";
import { openWorldSession } from "./world-session.mjs";
import { connectWorldSound } from "./world-sound.mjs";
import { mountConversation } from "./conversation.mjs";
import { mountChatInput } from "./chat-input.mjs";
import { mountHtmlView } from "./html-view.mjs";
import { gpuFallbackNotice } from "./gpu-fallback-notice.mjs";

/** How often the status line is re-derived: its phase age counts seconds. */
const STATUS_REFRESH_MS = 1000;

/**
 * What the catalog offers an app that did not open (the launcher's own Export
 * and Delete, and the way back to the tiles).
 * @typedef {{ exportApp: (id: string) => Promise<void>, deleteApp: (id: string) => Promise<void>, close: () => void }} Rescue
 */

/**
 * The world the URL names (`?world=<id>&mode=launch|edit`), mounted into the page.
 * @param {object} [o]
 * @param {string|URL} [o.workerUrl]  tests only: a wrapper Worker.
 * @param {Rescue} [o.rescue]  the catalog's rescue for an app that did not open.
 * @returns {{ session: ReturnType<typeof openWorldSession>, leave: (how?: {store?: boolean}) => Promise<void>,
 *   htmlView: ReturnType<typeof mountHtmlView> }}
 */
export function mountWorldView({ workerUrl, rescue } = {}) {
  const params = new URLSearchParams(location.search);
  const worldId = params.get("world") ?? "";
  // Every listener this view adds goes with it (`leave`).
  const listening = new AbortController();
  const { signal } = listening;
  const title = document.title;
  // UNTITLED UNTIL OPEN: the title is the catalog's name for this app, which
  // arrives with the Worker's `open` - never a name carried in the URL, which
  // anyone can edit and which goes stale when the app is renamed.
  document.body.classList.add("world");
  // The page's own ready belongs to what it showed before; this view's is
  // its world's `open`.
  delete document.body.dataset.ready;
  // Set before the chrome is laid out, so a Launch page never flashes it.
  /** @type {"launch" | "edit"} */
  let mode = params.get("mode") === "edit" ? "edit" : "launch";
  document.body.dataset.mode = mode;
  // THE VIEW'S DOM is one element, so leaving removes all of it.
  const root = el("div", { id: "world-view" });

  const errorBox = el("p", { class: "error", id: "error", hidden: "" });
  // AN APP THAT DID NOT OPEN OFFERS ITS RESCUE beside the reason (decision
  // 2026-10-01-a-world-always-opens): the catalog's Export and Delete work on
  // its file without opening it; Try again opens it again; Close goes back.
  const rescueBar = el("div", { class: "actions", id: "open-rescue", hidden: "" });
  const notice = el("p", { class: "notice", id: "resident-state", hidden: "" });
  const picture = el("div", { id: "picture" });
  const corner = el("span", { id: "status-corner", hidden: "", "aria-label": "Frame timing" });
  const canvas = el("canvas", { id: "canvas", "aria-label": "app" });
  // THE APP'S OWN HTML (an `:html` view method) goes in this box, over the
  // canvas, which keeps measuring the picture while the box is shown.
  const appBox = el("div", { id: "app-box", hidden: "" });
  // THE PORT OFFER: this app has no UI for this device yet. The words are the
  // core's (`view_dialect::PORT_PROMPT`/`port_request`), and the button sends
  // an ordinary user message, exactly as the chat input does.
  const port = el("div", { id: "port-offer", role: "alertdialog", hidden: "" });
  const portText = el("p", {});
  const portAsk = el("button", { type: "button", class: "primary", id: "port-ask" }, "Ask AI");
  const portCancel = el("button", { type: "button", id: "port-cancel" }, "Cancel");
  port.append(portText, el("div", { class: "actions" }, portCancel, portAsk));
  let portRequest = "";
  // One offer per opening: dismissal belongs to the shell, never to the world.
  let repairDismissed = false;
  const repair = el("div", { id: "repair-offer", role: "alertdialog", hidden: "" });
  const repairText = el("p", {});
  const repairFix = el("button", { type: "button", id: "repair-fix", class: "primary" });
  const repairCancel = el("button", { type: "button", id: "repair-cancel" });
  repair.append(repairText, el("div", { class: "actions" }, repairCancel, repairFix));
  // THE APP'S SURFACE: the canvas and the app's HTML, where the world's
  // keyboard is (world-session.mjs) - the port offer beside it is the page's.
  const surface = el("div", { id: "surface" });
  surface.append(canvas, appBox);
  picture.append(surface, corner, port, repair);
  /** @type {ReturnType<typeof mountHtmlView> | null} */
  let htmlView = null;
  /** The HTML view, which exists before the Worker's first message. */
  const html = () => {
    if (!htmlView) throw new Error("the HTML view is not mounted yet");
    return htmlView;
  };
  // THE TURN'S OWN LINE, as on GTK and Android: what the running wake last
  // said it is doing, left behind a spinner, and at its right end what this
  // app has cost across its lifetime (shown idle too) and Stop. Always there;
  // the spinner and Stop show on the SAME condition (`running`) and keep their
  // room while hidden, so a turn never resizes the picture box.
  const turn = el("div", {
    id: "turn",
    role: "button",
    tabindex: "0",
    // A STABLE NAME for the one fold control: its contents (the turn's words,
    // the cost) change, and `aria-expanded` carries the state.
    "aria-label": "Conversation",
    "aria-controls": "conversation",
  });
  const spinner = el("span", { id: "turn-spinner", role: "progressbar", "aria-label": "AI is working" });
  spinner.style.visibility = "hidden";
  const turnText = el("span", { id: "turn-text" });
  const appCost = el("span", { id: "app-cost" });
  const stop = el("button", { id: "stop", type: "button", class: "danger", title: "Stop this turn" }, "Stop");
  stop.style.visibility = "hidden";
  // THE TURN LINE IS THE CONVERSATION'S TOGGLE, as on Android and GTK: the
  // line heads the conversation it folds, and clicking it (or Enter/Space
  // while it has focus) folds or unfolds it. Stop is its own control inside
  // the line and never folds. Collapsed or not is this view's own state
  // (never the Worker's, never stored), and the picture box that grows is
  // reported like any resize. `#world-view[data-conversation]` is what the
  // stylesheet reads; the caret only mirrors it.
  const caret = el("span", { id: "conversation-caret", "aria-hidden": "true" });
  turn.append(caret, spinner, turnText, appCost, stop);
  const developer = loadDeveloperSwitches();
  let showTechnicalErrors = developer.showToolCalls;
  /** Retained so the switch reveals an existing failure without a new event.
   * @type {{text: string, technical: boolean} | null} */
  let latestError = null;
  const renderError = () => {
    errorBox.hidden = latestError === null;
    errorBox.textContent = latestError
      ? latestError.technical && !showTechnicalErrors
        ? "Something went wrong in this app."
        : latestError.text
      : "";
  };
  let hasResident = false;
  /** @type {import("../../types/worker-messages.js").GpuFallback | null} */
  let gpuFallback = null;
  // One native notice path: graphics advice must survive an AI key change,
  // and the existing No-AI link must survive a graphics startup refusal.
  const renderNotice = () => {
    const graphics = gpuFallbackNotice(gpuFallback, showTechnicalErrors);
    notice.replaceChildren(graphics);
    if (!hasResident) {
      if (graphics) notice.append(el("br"));
      notice.append("No AI: add an OpenRouter key in ", el("a", { href: "settings.html" }, "Settings"), ".");
    }
    notice.hidden = hasResident && !graphics;
  };
  const conversation = mountConversation(developer.showToolCalls);
  /** @param {boolean} shown */
  const showConversation = (shown) => {
    root.dataset.conversation = shown ? "shown" : "collapsed";
    turn.setAttribute("aria-expanded", String(shown));
    turn.title = shown ? "Hide conversation" : "Show conversation";
    caret.textContent = shown ? "▾" : "▸";
    if (shown) conversation.toEnd();
  };
  showConversation(true);
  const toggleConversation = () => showConversation(root.dataset.conversation !== "shown");
  turn.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("#stop")) return;
    toggleConversation();
  });
  turn.addEventListener("keydown", (event) => {
    if (event.target !== turn || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleConversation();
  });
  // THE STATUS LINE shows only when its developer switch is on;
  // `#world-view[data-status-line]` is what the stylesheet reads, and the
  // picture box that grows is reported like any resize.
  /** @param {boolean} shown */
  const showStatusLine = (shown) => {
    root.dataset.statusLine = shown ? "shown" : "hidden";
  };
  showStatusLine(developer.showStatusLine);
  onDeveloperSwitchesChange(
    (switches) => {
      conversation.setShowToolCalls(switches.showToolCalls);
      showTechnicalErrors = switches.showToolCalls;
      renderError();
      renderNotice();
      showStatusLine(switches.showStatusLine);
    },
    { signal },
  );
  const status = el("p", { id: "status" });
  const statusLine = el("span", { id: "status-line" }, "opening…");
  status.append(statusLine);
  root.append(errorBox, rescueBar, notice, picture, turn, conversation.element, status);
  document.body.append(root);

  /** @param {string} text @param {boolean} technical */
  const showError = (text, technical) => {
    latestError = { text, technical };
    renderError();
  };

  /** @param {Rescue} actions */
  const offerRescue = (actions) => {
    /** @type {[string, () => void][]} */
    const buttons = [
      ["Export", () => void actions.exportApp(worldId)],
      ["Delete", () => void actions.deleteApp(worldId)],
      ["Try again", () => location.reload()],
      ["Close", () => actions.close()],
    ];
    rescueBar.replaceChildren(
      ...buttons.map(([label, act]) => {
        const button = el("button", { type: "button", "data-action": label.toLowerCase().replace(" ", "-") }, label);
        button.addEventListener("click", act);
        return button;
      }),
    );
    rescueBar.hidden = false;
  };

  // The composer before the session: the session's first status already
  // says whether it offers 🎙. It posts through `session` only when the user
  // sends, by which time the session exists.
  const composer = mountChatInput(
    (text, attachments) => session.post({ type: "say", text, attachments: JSON.stringify(attachments) }),
    signal,
  );

  const sound = connectWorldSound((text) => showError(text, true));
  let opened = false;
  const session = openWorldSession({
    canvas,
    keyboard: surface,
    worldId,
    workerUrl,
    // The user's app permissions as this world opens; it keeps them.
    permissions: loadPermissions(),
    onMessage(data) {
      switch (data.type) {
        case "open":
          opened = true;
          document.title = `${data.name} · Quine`;
          gpuFallback = data.gpuFallback;
          renderNotice();
          document.body.dataset.ready = "1";
          break;
        case "sound":
          sound.command(
            data.text,
            data.assets,
            (keys) => session.post({ type: "sound-assets-accepted", epoch: data.epoch, keys }),
            (ok, reason) =>
              session.post({ type: "sound-command-result", epoch: data.epoch, commandId: data.commandId, ok, reason }),
          );
          break;
        case "status":
          statusLine.textContent = data.line;
          // The core changes telemetry only at its cosmetic cadence or timer edges.
          if (corner.textContent !== data.corner) {
            corner.textContent = data.corner;
            corner.hidden = !data.corner;
          }
          turnText.textContent = data.turn;
          appCost.textContent = data.appCost;
          spinner.style.visibility = stop.style.visibility = data.running ? "visible" : "hidden";
          composer.setVoiceOffered(data.voice);
          break;
        case "dock":
          conversation.show(data.lines);
          break;
        case "html":
          picture.dataset.html = html().show(data.frame) ? "1" : "";
          break;
        case "fault":
          if (mode === "launch" && !repairDismissed) {
            repairText.textContent = data.line;
            repairFix.textContent = data.fix;
            repairCancel.textContent = data.notNow;
            repair.hidden = false;
          }
          break;
        case "port":
          port.hidden = !data.offered;
          portText.textContent = data.prompt;
          portRequest = data.request;
          break;
        case "picture":
          html().picture(data.id, data.token, data.png);
          break;
        case "look":
          // answerLook (html-look.mjs) turns every failure into a look-failed answer.
          void html().look(data);
          break;
        case "canvas-frame":
          html().leafFrame(data.id, data.generation, data.resizes, data.width, data.height);
          break;
        case "canvas-presenter":
          html().leafPresenter(data.id, data.generation, data.presenter);
          break;
        case "error":
          // A world that cannot open (another tab owns it, no persistent
          // storage, a bad id, a world that is not in the catalog - opening
          // never creates one) says why, in words a user can act on.
          // Runtime exceptions are technical details, unlike an actionable
          // opening refusal. Keep an honest failure line without leaking them.
          showError(data.error, opened);
          // HELD BY ANOTHER TAB: open it here the moment that tab lets go.
          if (!opened && data.locked) void waitUntilFree(worldId).then(() => location.reload());
          if (!opened && data.refused && rescue) offerRescue(rescue);
          break;
      }
    },
  });

  // Looked up at each call, never captured: a test fixture wraps
  // `session.post` to watch what the view sends (tests/product/html-view.spec.mjs).
  htmlView = mountHtmlView(
    appBox,
    (
      /** @type {import("../../types/worker-messages.js").ToWorker} */ msg,
      /** @type {Transferable[] | undefined} */ transfer,
    ) => session.post(msg, transfer),
    session.input,
  );

  root.append(composer.form);
  stop.addEventListener("click", () => session.post({ type: "stop" }));
  // ACCEPTING SWITCHES THE APP TO EDIT before the request goes out, so the
  // user sees the AI work on it; it stays in Edit until they switch back.
  portAsk.addEventListener("click", () => {
    port.hidden = true;
    showMode("edit");
    session.post({ type: "say", text: portRequest, attachments: "[]" });
  });
  repairFix.addEventListener("click", () => {
    repairDismissed = true;
    repair.hidden = true;
    showMode("edit");
    session.post({ type: "fix-with-ai" });
  });
  repairCancel.addEventListener("click", () => {
    repairDismissed = true;
    repair.hidden = true;
  });
  portCancel.addEventListener("click", () => (port.hidden = true));
  /**
   * Show `next` and have the catalog remember it.
   * @param {"launch" | "edit"} next
   */
  const showMode = (next) => {
    mode = next;
    if (mode === "edit") repair.hidden = true;
    document.body.dataset.mode = mode;
    session.post({ type: "mode", mode });
    if (mode === "edit") conversation.toEnd();
  };
  // The mode this open chose is the one the app was last in from now on.
  showMode(mode);
  // F2 flips the mode from anywhere on the page. Function keys are the
  // browser's, never the world's (world-session.mjs), so the app does not
  // hear it too.
  addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "F2") return;
      e.preventDefault();
      showMode(mode === "launch" ? "edit" : "launch");
    },
    { signal },
  );
  // A timer, not a Worker loop: a hidden tab's timers are throttled by the
  // browser, so a world nobody is looking at is not asked for a status line.
  const statusTimer = setInterval(() => session.post({ type: "status" }), STATUS_REFRESH_MS);

  // THE RESIDENT, from Settings: the key goes to this world's Worker and
  // nowhere else - at open, and again whenever Settings in another tab changes
  // it while this world stays open, so the resident and the apps' AI jobs
  // follow the saved key together (.mex/context/invariants.md). No key is not
  // an error - the world runs without a resident and the view says where to
  // add one.
  // Declared before the resident is applied: a key saved while the world is
  // closing must not start a resident in a Worker that is going away.
  /** @type {Promise<void> | null} */
  let leaving = null;
  /** @param {ReturnType<typeof loadSettings>} settings */
  const applyResident = (settings) => {
    if (leaving) return;
    session.post({
      type: "resident",
      apiKey: settings.key,
      model: settings.model,
      suffix: settings.suffix,
      effort: settings.effort,
      imageModel: settings.imageModel,
    });
    hasResident = Boolean(settings.key);
    renderNotice();
  };
  applyResident(loadSettings());
  onResidentChange(applyResident, { signal });

  /**
   * Close the world and take the view away. Idempotent: a Back and a pagehide
   * close it once. LEAVING IS A LEAVE EDGE (src/preview.rs): a Back (`store`)
   * stores the picture of what was on screen first, as a hidden tab does, and
   * the close waits for it; a pagehide does not wait (an unloading page is
   * not promised the time, and its hidden edge already stored one).
   * @param {{store?: boolean}} [how]
   */
  const leave = ({ store = false } = {}) => {
    leaving ??= (async () => {
      clearInterval(statusTimer);
      if (store && opened) {
        const png = await html().preview();
        session.post(png ? { type: "preview", png } : { type: "preview" });
      }
      listening.abort();
      await Promise.all([session.close({ preview: store && opened }), sound.stop()]);
      root.remove();
      document.body.classList.remove("world");
      delete document.body.dataset.mode;
      delete document.body.dataset.ready;
      document.title = title;
    })();
    return leaving;
  };
  // THE TAB IS HIDDEN (another tab shown, the window minimized, the tab
  // closing): the world's preview is stored now, as the world goes on, so
  // the launcher's tab shows this app as it was last seen without waiting
  // for this tab to close - a write while the page unloads is not promised to
  // finish (core/worker.mjs `preview`). An :html view is drawn by this page,
  // the way `look` draws it (html-look.mjs); a canvas frame by the Worker.
  // The page's drawing is asynchronous, so a tab CLOSED while it shows an
  // :html view loses this picture to its pagehide close (the Worker drops a
  // picture of a closed world); its last tab switch or Back stored one.
  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden || !opened) return;
      void html()
        .preview()
        .then((png) => session.post(png ? { type: "preview", png } : { type: "preview" }));
    },
    { signal },
  );
  // THE PAGE IS HIDDEN FOR GOOD (a link, closing the tab, a navigation away,
  // the back/forward cache): the world is closed as far as the page still runs;
  // what it could not finish is what a crash would lose, since every
  // non-tick boundary is already written.
  addEventListener("pagehide", () => leave(), { signal });
  return { session, leave, htmlView: html() };
}

/**
 * A small DOM builder: attributes as given, children as nodes or TEXT.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string>} [attrs]
 * @param {(Node | string)[]} children
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
