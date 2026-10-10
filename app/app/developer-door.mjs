// THE BUILD ROW, AND WHAT SEVEN TAPS ON IT UNLOCKS: the Developer section.
// The gesture and its words are Android's (QuineActivity.developerSection,
// itself the platform's Build-number gesture), so every product shell has the
// same door: seven taps open it, a countdown speaks for the last three, and a
// long press (or a right click) on the same row closes it again. Whether it is
// open is the caller's remembered flag; this module only counts and speaks.

export const TAPS_TO_DEVELOPER = 7;
/** How long a press must be held to count as a long press, in ms. */
const LONG_PRESS_MS = 600;

/**
 * One tap on the Build row. Pure: the next state and what to say, if anything.
 * @param {{unlocked: boolean, taps: number}} state
 * @returns {{unlocked: boolean, taps: number, say: string}}
 */
export function buildRowTap({ unlocked, taps }) {
  if (unlocked) return { unlocked, taps, say: "You are already a developer." };
  const remaining = TAPS_TO_DEVELOPER - (taps + 1);
  if (remaining <= 0) return { unlocked: true, taps: 0, say: "You are now a developer!" };
  const say =
    remaining <= 3 ? `You are now ${remaining} ${remaining === 1 ? "step" : "steps"} away from being a developer.` : "";
  return { unlocked, taps: taps + 1, say };
}

/**
 * Wire the gesture to `row`: a click is a tap; a long press or a right click
 * locks. `onChange(unlocked)` hears every change of the flag, `say(text)`
 * every word for the person.
 * @param {HTMLElement} row
 * @param {{unlocked: boolean, onChange: (unlocked: boolean) => void, say: (text: string) => void}} options
 */
export function connectDeveloperDoor(row, { unlocked, onChange, say }) {
  let state = { unlocked, taps: 0 };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  // A long press ends in a click as well; that click is the press's, not a tap.
  let pressed = false;
  const lock = () => {
    if (!state.unlocked) return;
    state = { unlocked: false, taps: 0 };
    onChange(false);
    say("Developer options hidden.");
  };
  const cancel = () => clearTimeout(timer);
  row.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pressed = false;
    cancel();
    timer = setTimeout(() => {
      pressed = true;
      lock();
    }, LONG_PRESS_MS);
  });
  for (const end of ["pointerup", "pointerleave", "pointercancel"]) row.addEventListener(end, cancel);
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    cancel();
    lock();
  });
  row.addEventListener("click", () => {
    if (pressed) {
      pressed = false;
      return;
    }
    const next = buildRowTap(state);
    if (next.unlocked !== state.unlocked) onChange(next.unlocked);
    state = next;
    if (next.say) say(next.say);
  });
}
