// THE POLICY GUARD, imported FIRST by every site Worker entry (core/worker.mjs,
// sound/quine-sound-worker.mjs): a Worker started from its plain URL
// (./module-worker.mjs) is confined only if its script's response came through
// the service worker with the page's policy stamped on it - which is checked
// here, not trusted. The policy allows no eval, so an eval that runs means no
// policy, and the Worker dies before its module runs anything (fail closed).
// A blob:-bootstrapped Worker inherits the policy of the page that made it,
// whatever that page carries (a test fixture may carry none), so it is not
// checked. Chromium and Firefox report the refused eval as a `script-src eval`
// violation at every plain-URL start; that is this check, not an attack.
if (location.protocol !== "blob:") {
  let confined = false;
  try {
    // oxlint-disable-next-line no-eval -- the check: the page's policy refuses exactly this
    (0, eval)("0");
  } catch {
    confined = true;
  }
  if (!confined) throw new Error("this Worker started without the page's Content-Security-Policy");
}
