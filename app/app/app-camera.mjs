// The app's one-photo Camera interface uses the composer's dialog. The app
// gets only a stored bitmap, never the preview stream or arbitrary DOM access.
import { takePhoto } from "./camera.mjs";

/** @typedef {import("../../types/worker-messages.js").ToWorker} ToWorker */
/** @param {(message: ToWorker) => void} post */
export function appCamera(post) {
  /** @type {Map<number, AbortController>} */
  const pending = new Map();
  let closed = false;
  return {
    /** @param {number} token */
    async capture(token) {
      if (closed || document.hidden) {
        post({ type: "camera-failed", token, kind: "cancelled" });
        return;
      }
      if (pending.size) {
        post({ type: "camera-failed", token, kind: "busy" });
        return;
      }
      const abort = new AbortController();
      pending.set(token, abort);
      try {
        const photo = await takePhoto(abort.signal);
        if (photo) post({ type: "camera-captured", token, jpeg: photo.b64 });
        else post({ type: "camera-failed", token, kind: "cancelled" });
      } catch (e) {
        const kind =
          e instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(e.name)
            ? "permission-denied"
            : e instanceof DOMException && e.name === "NotReadableError"
              ? "busy"
              : "unavailable";
        post({ type: "camera-failed", token, kind });
      } finally {
        pending.delete(token);
      }
    },
    /** @param {number} token */
    cancel(token) {
      pending.get(token)?.abort();
    },
    background() {
      for (const abort of pending.values()) abort.abort();
    },
    close() {
      closed = true;
      for (const abort of pending.values()) abort.abort();
    },
  };
}
