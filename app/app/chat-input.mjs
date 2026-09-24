// THE CHAT INPUT: where a person talks to the world's resident. Its one job is
// to hand a human turn over; whether a resident answers is not its business -
// a human turn is recorded with or without one (AGENTS.md, conversation).
//
// Enter sends, Shift+Enter starts a new line: the chat convention people
// already know. Keys typed here never reach the world, which hears keys only
// while its canvas has focus (world-session.mjs).

/**
 * @param {(text: string) => void} say  the human turn, never blank.
 * @returns {HTMLFormElement}
 */
export function mountChatInput(say) {
  const form = document.createElement("form");
  form.id = "chat";
  const input = document.createElement("textarea");
  input.id = "chat-input";
  input.rows = 1;
  input.placeholder = "Message the resident…";
  input.setAttribute("aria-label", "message");
  const send = document.createElement("button");
  send.id = "send";
  send.type = "submit";
  send.textContent = "Send";
  form.append(input, send);

  const submit = () => {
    const text = input.value;
    if (!text.trim()) return;
    say(text);
    input.value = "";
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  input.addEventListener("keydown", (e) => {
    // `isComposing`: Enter that confirms an IME composition is not a send.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  return form;
}
