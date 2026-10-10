// A PAGE'S WAY TO THE ENGINE OUTSIDE A WORLD: a Worker running the same
// module a world runs (core/worker.mjs), asked by request id - the launcher's
// catalog (whose writes need synchronous access handles) and the Settings
// screen's defaults. It never opens a world.

import { moduleWorker } from "./module-worker.mjs";

/** @typedef {import("../../types/worker-messages.js").CatalogOps} CatalogOps */
/** @typedef {import("../../types/worker-messages.js").FromWorker} FromWorker */

export class HostClient {
  constructor() {
    this.worker = moduleWorker(new URL("../core/worker.mjs", import.meta.url));
    /** @type {Map<number, {resolve: (value: any) => void, reject: (error: Error) => void}>} */
    this.pending = new Map();
    this.next = 1;
    this.worker.addEventListener("message", (/** @type {MessageEvent<FromWorker>} */ { data }) => {
      if (data.type !== "catalog-reply") return;
      const waiter = this.pending.get(data.id);
      if (!waiter) return;
      this.pending.delete(data.id);
      if (data.ok) waiter.resolve(data.value);
      else waiter.reject(new Error(data.error));
    });
  }

  /**
   * Ask the engine `op` with `arg`; resolves with its answer.
   * @template {keyof CatalogOps} Op
   * @param {Op} op
   * @param {CatalogOps[Op]["arg"]} [arg]
   * @param {Transferable[]} [transfer]
   * @returns {Promise<CatalogOps[Op]["value"]>}
   */
  call(op, arg, transfer = []) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "catalog", id, op, arg }, transfer);
    });
  }

  /** Most recently opened first. */
  list() {
    return this.call("list");
  }
  /**
   * @param {string} name
   * @returns the new world's id
   */
  create(name) {
    return this.call("create", name);
  }
  /** @param {string} id */
  delete(id) {
    return this.call("delete", id);
  }
  /**
   * The closed world's file.
   * @param {string} id
   */
  export(id) {
    return this.call("export", id);
  }
  /**
   * What a picked file is, before it is trusted. The bytes are copied here
   * (the page keeps its own for the import that may follow).
   * @param {Uint8Array} bytes
   */
  inspect(bytes) {
    return this.call("inspect", bytes.slice());
  }
  /**
   * Import the file as a new app. The bytes are TRANSFERRED: the page is done
   * with them.
   * @param {Uint8Array} bytes
   */
  import(bytes) {
    return this.call("import", bytes, [bytes.buffer]);
  }
  /**
   * Replace app `id` with the file (an app of the same lineage). The bytes
   * are TRANSFERRED: the page is done with them.
   * @param {string} id
   * @param {Uint8Array} bytes
   */
  replace(id, bytes) {
    return this.call("replace", { id, bytes }, [bytes.buffer]);
  }
  defaults() {
    return this.call("defaults");
  }
  /** Done asking: the engine's Worker goes, and its memory with it. */
  close() {
    this.worker.terminate();
  }
}
