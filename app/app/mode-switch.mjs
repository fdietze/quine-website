const positive = (/** @type {number} */ value) => Number.isFinite(value) && value > 0;

// Main handoff is a barrier, not a local tab choice. Replies never bind a
// surface: both the latest reply and the actual selected edge must agree.
/**
 * @param {"launch"|"edit"} initial
 * @param {{requestMain: (request:string, owner:string, box:import("../../types/worker-messages.js").Box)=>void,
 * commit:(mode:"launch"|"edit")=>void, policy:(mainOnly:boolean)=>void, error:(text:string)=>void}} io
 */
export function modeSwitch(initial, io) {
  let desired = initial;
  let generation = 0;
  /** @type {string|null} */ let request = null;
  /** @type {string|null} */ let owner = null;
  /** @type {string|null} */ let ready = null;
  /** @type {import("../../types/worker-messages.js").Box|null} */ let box = null;
  let isMain = true;
  let closed = false;
  const fail = (/** @type {string} */ text) => {
    desired = "edit";
    request = ready = null;
    io.policy(false);
    io.commit("edit");
    io.error(text);
  };
  const settle = () => {
    if (desired === "launch" && box && owner && isMain && ready === owner) io.commit("launch");
  };
  const issue = () => {
    ready = null;
    request = null;
    if (!owner || !box || closed) return;
    if (generation === Number.MAX_SAFE_INTEGER) return fail("Mode request counter exhausted; reopen this app.");
    generation += 1;
    request = `launch-${generation}`;
    io.requestMain(request, owner, box);
  };
  return {
    get desired() {
      return desired;
    },
    /** @param {"launch"|"edit"} next */
    desire(next) {
      if (closed) return;
      desired = next;
      request = ready = null;
      io.policy(next === "launch");
      if (next === "edit") io.commit(next);
      else if (!request) issue(); // A synchronous policy measurement may already have posted it.
    },
    /** @param {string} next @param {boolean} main */
    selected(next, main) {
      if (closed) return;
      owner = next;
      isMain = main;
      if (desired === "launch") {
        if (!main || !request) issue();
        settle();
      }
    },
    /** @param {import("../../types/worker-messages.js").Box} next */
    measure(next) {
      if (closed) return;
      if (!positive(next.width) || !positive(next.height) || !positive(next.scale)) {
        // Allocation is revocable authority, not a historical size cache.
        box = request = ready = null;
        return;
      }
      box = next;
      if (desired === "launch" && !request) issue();
    },
    /** @param {{request:string,text:string,owner?:string}} reply */
    reply(reply) {
      if (closed || desired !== "launch" || reply.request !== request) return false;
      if (!reply.owner) fail(reply.text || "Main selection was cancelled.");
      else {
        ready = reply.owner;
        settle();
      }
      return true;
    },
    close() {
      closed = true;
      request = ready = null;
    },
  };
}
