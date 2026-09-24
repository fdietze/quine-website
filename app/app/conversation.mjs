// THE CONVERSATION, as this shell lays it out: the core publishes the lines
// (`Chat::dock_lines`, whole, each with its kind) and this page owns how they
// are shown - collapsed or open, where the reader has scrolled to. That view
// state is the shell's alone and never crosses to the Worker (AGENTS.md,
// chrome rule): collapsing only changes the page's layout, and the picture box
// that grows as a result is reported like any other resize.
//
// CONTENT IS VERBATIM: every line is set as TEXT, never markup - tool output is
// somebody else's bytes, not page script.

/** A reader within this many px of the end is "at the end" and is kept there. */
const STICK_PX = 4;

/** @returns {{ element: HTMLElement, show(lines: {kind: string, text: string}[]): void }} */
export function mountConversation() {
  const element = document.createElement("section");
  element.id = "conversation";
  const toggle = document.createElement("button");
  toggle.id = "conversation-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-controls", "conversation-lines");
  const list = document.createElement("div");
  list.id = "conversation-lines";
  list.setAttribute("role", "log");
  element.append(toggle, list);

  let count = 0;
  const label = () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.textContent = `${open ? "▾" : "▸"} Conversation · ${count}`;
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
    label();
    if (open) list.scrollTop = list.scrollHeight;
  });
  label();

  return {
    element,
    show(lines) {
      // FOLLOW THE END only if the reader was there: someone who scrolled back
      // to read keeps their place while new lines arrive.
      const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_PX;
      list.replaceChildren(
        ...lines.map(({ kind, text }) => {
          const row = document.createElement("div");
          row.className = "line";
          row.dataset.kind = kind;
          row.textContent = text;
          return row;
        }),
      );
      count = lines.length;
      label();
      if (atEnd) list.scrollTop = list.scrollHeight;
    },
  };
}
