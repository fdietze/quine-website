// A shell's retained conversation, not another projection of Chat. The Worker
// supplies ordered keyed changes; untouched immutable line objects stay shared.

/** @returns {{apply(update: import("../../types/worker-messages.js").DockUpdate): import("../../types/worker-messages.js").DockLine[]}} */
export function createDockState() {
  /** @type {Map<number, import("../../types/worker-messages.js").DockLine>} */
  const lines = new Map();
  return {
    apply(update) {
      if (update.reset) lines.clear();
      for (const id of update.removed) lines.delete(id);
      for (const line of update.lines) lines.set(line.id, line);
      // Reports can replace an older footer, so insertion order is not the
      // durable order. IDs, not transport arrival, determine the transcript.
      return [...lines.values()].sort((a, b) => a.id - b.id);
    },
  };
}
