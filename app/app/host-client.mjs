// A PAGE'S WAY TO THE ENGINE OUTSIDE A WORLD: a Worker running the same
// module a world runs (core/worker.mjs), asked by request id - the launcher's
// catalog (whose writes need synchronous access handles) and the Settings
// screen's defaults. It never opens a world.

export class HostClient {
  constructor() {
    this.worker = new Worker(new URL("../core/worker.mjs", import.meta.url), { type: "module" });
    this.pending = new Map();
    this.next = 1;
    this.worker.addEventListener("message", ({ data }) => {
      if (data.type !== "catalog-reply") return;
      const waiter = this.pending.get(data.id);
      if (!waiter) return;
      this.pending.delete(data.id);
      if (data.ok) waiter.resolve(data.value);
      else waiter.reject(new Error(data.error));
    });
  }

  /** @returns {Promise<any>} */
  call(op, arg) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "catalog", id, op, arg });
    });
  }

  /** @returns {Promise<{id: string, name: string}[]>} most recently opened first */
  list() {
    return this.call("list");
  }
  /** @returns {Promise<string>} the new world's id */
  create(name) {
    return this.call("create", name);
  }
  delete(id) {
    return this.call("delete", id);
  }
  /** @returns {Promise<Uint8Array>} the closed world's file */
  export(id) {
    return this.call("export", id);
  }
  /** @returns {Promise<{model: string, effort: string, efforts: string[]}>} */
  defaults() {
    return this.call("defaults");
  }
  /** Done asking: the engine's Worker goes, and its memory with it. */
  close() {
    this.worker.terminate();
  }
}
