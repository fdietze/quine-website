// THE CONVERSATION, as this shell lays it out: the core publishes the lines
// (`Chat::dock_lines`, whole, each with its kind) and this page owns how they
// are shown - where the reader has scrolled to, and (world-view.mjs's mode
// and its collapse toggle) whether at all. That view state is the shell's alone and never crosses to
// the Worker (.mex/context/architecture.md, chrome rule): hiding the pane only
// changes the page's layout, and the picture box that grows as a result is
// reported like any other resize.
//
// "SHOW TOOL CALLS" PICKS THE TEXT: on, every line's exact text (what the LLM
// sees); off, each line's `plain` text, and a line without one - tool calls, raw faults,
// a host note only the model acts on - gets no row at all. Both texts are the
// core's one rule (`DockLine::shown`), shared with GTK and Android; which to
// show is this page's view state.
//
// CONTENT IS VERBATIM: every line is set as TEXT, never markup - tool output is
// somebody else's bytes, not page script.
//
// A DIFF, NOT A REBUILD (dom-diff.mjs, the page's one DOM diff): each row is
// keyed by its line's stable id (`dock::DockLine::id`), so a row whose text
// did not change is never touched - text the reader selected in it, and the
// place they scrolled to, survive new lines and the tool cap trimming old
// ones from the front.

import { domDiff } from "./dom-diff.mjs";

/** A reader within this many px of the end is "at the end" and is kept there. */
const STICK_PX = 4;

/**
 * @param {boolean} showToolCalls  the Settings switch, at mount.
 * @returns {{
 *   element: HTMLElement,
 *   show(lines: import("../../types/worker-messages.js").DockLine[]): void,
 *   setShowToolCalls(on: boolean): void,
 *   toEnd(): void,
 * }}
 */
export function mountConversation(showToolCalls) {
  const element = document.createElement("section");
  element.id = "conversation";
  const list = document.createElement("div");
  list.id = "conversation-lines";
  list.setAttribute("role", "log");
  element.append(list);
  const { patchChildren } = domDiff();

  /**
   * The core's latest lines, all of them: a changed switch re-renders these.
   * @type {import("../../types/worker-messages.js").DockLine[]}
   */
  let latest = [];
  const render = () => {
    // FOLLOW THE END only if the reader was there: someone who scrolled back
    // to read keeps their place while new lines arrive.
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_PX;
    patchChildren(
      list,
      latest
        .flatMap(({ id, kind, text, plain }) => {
          const shown = showToolCalls ? text : plain;
          return shown === null ? [] : [{ id, kind, text: shown }];
        })
        .map(({ id, kind, text }) => ({
          tag: "div",
          key: String(id),
          class: ["line"],
          style: [],
          attrs: [["data-kind", kind]],
          events: [],
          children: [text],
        })),
    );
    if (atEnd) list.scrollTop = list.scrollHeight;
  };

  return {
    element,
    show(lines) {
      latest = lines;
      render();
    },
    setShowToolCalls(on) {
      if (on === showToolCalls) return;
      showToolCalls = on;
      render();
    },
    /** Show the newest line: the pane was just shown again, scrolled nowhere. */
    toEnd() {
      list.scrollTop = list.scrollHeight;
    },
  };
}
