// Native Edit chrome consumes shared metadata only. Buttons retain stable ids,
// never renderer functions or app source. The host resolves each id on execution.
/**
 * @param {{post:(msg:import("../../types/worker-messages.js").ToWorker)=>void,
 * owner:()=>string|null, box:()=>import("../../types/worker-messages.js").Box}} io
 */
export function debugTools(io) {
  const element = document.createElement("section");
  element.id = "debug-tools";
  element.setAttribute("aria-label", "App debug tools");
  const tabs = document.createElement("div");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Views");
  const actions = document.createElement("div");
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Actions");
  const result = document.createElement("pre");
  result.id = "debug-result";
  result.tabIndex = 0;
  element.append(tabs, actions, result);
  /** @type {import("../../types/worker-messages.js").DebugTools|null} */ let metadata = null;
  /** @type {Map<string,HTMLButtonElement>} */ const tabButtons = new Map();
  /** @type {Map<string,HTMLButtonElement>} */ const actionButtons = new Map();
  /** @type {Map<string,string>} */ const pending = new Map();
  /** @type {string|null} */ let consent = null;
  let edit = false;
  let serial = 0;
  const current = () => edit && metadata?.editable && metadata.owner === io.owner();
  const request = () => {
    if (serial === Number.MAX_SAFE_INTEGER) throw new Error("Debug request counter exhausted; reopen this app.");
    serial += 1;
    return `tools-${serial}`;
  };
  /** @param {string} id @param {"select-view"|"debug-action"} type */
  const invoke = (id, type) => {
    if (!current()) return;
    const owner = io.owner();
    if (!owner) return;
    try {
      const token = request();
      pending.set(token, owner);
      if (type === "select-view") io.post({ type, owner, request: token, id: id === "" ? null : id, ...io.box() });
      else io.post({ type, owner, request: token, id });
    } catch (error) {
      result.textContent = String(error);
    }
  };
  /** Stable nodes keep native keyboard focus across metadata updates.
   * @param {HTMLElement} host @param {Map<string,HTMLButtonElement>} buttons
   * @param {{id:string,label:string}[]} entries @param {"select-view"|"debug-action"} type */
  const reconcile = (host, buttons, entries, type) => {
    const wanted = new Set(entries.map((item) => item.id));
    for (const [id, button] of buttons)
      if (!wanted.has(id)) {
        button.remove();
        buttons.delete(id);
      }
    for (const [index, item] of entries.entries()) {
      let button = buttons.get(item.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.debugId = item.id;
        button.addEventListener("click", () => invoke(item.id, type));
        buttons.set(item.id, button);
      }
      button.textContent = item.label;
      button.disabled = !current();
      if (type === "select-view") button.setAttribute("aria-pressed", String((metadata?.selectedId ?? "") === item.id));
      if (host.children[index] !== button) host.insertBefore(button, host.children[index] ?? null);
    }
  };
  const render = () => {
    element.hidden = !edit;
    reconcile(tabs, tabButtons, [{ id: "", label: "App" }, ...(metadata?.views.items ?? [])], "select-view");
    reconcile(actions, actionButtons, metadata?.actions.items ?? [], "debug-action");
    const errors = [metadata?.actions.error, metadata?.views.error].filter(Boolean).join("\n");
    element.dataset.registryError = errors;
    // Registry errors are independent and remain inspectable beside results.
    diagnostics.textContent = errors;
    if (consent && consent === io.owner() && current() && metadata?.port) {
      const owner = consent;
      consent = null;
      try {
        const token = request();
        pending.set(token, owner);
        io.post({ type: "accept-port", owner, request: token });
      } catch (error) {
        result.textContent = String(error);
      }
    }
  };
  const diagnostics = document.createElement("pre");
  diagnostics.id = "debug-registry-error";
  element.append(diagnostics);
  return {
    element,
    /** @param {boolean} next */ setEdit(next) {
      edit = next;
      render();
    },
    /** @param {import("../../types/worker-messages.js").DebugTools} next */
    metadata(next) {
      metadata = next;
      render();
    },
    selected() {
      metadata = null;
      consent = null;
      pending.clear();
      render();
    },
    /** Consent is frozen to this offer; an Edit metadata edge can finish the
     * same click, never redirect it to a new selected surface. */
    acceptPort() {
      consent = io.owner();
      render();
    },
    /** @param {{request:string,text:string}} reply */
    reply(reply) {
      const owner = pending.get(reply.request);
      pending.delete(reply.request);
      if (owner && owner === io.owner() && edit) result.textContent = reply.text === "(:ok nil)" ? "" : reply.text;
    },
    /** @param {string} text */ error(text) {
      result.textContent = text;
    },
    close() {
      edit = false;
      consent = null;
      pending.clear();
    },
  };
}
