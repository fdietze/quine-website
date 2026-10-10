// Raw capture for admitted Rust requests. Admission policy stays in
// quine-speech; the page owns only the device and its lifecycle (SoC).
import { startPcmRecording } from "./voice-recorder.mjs";

/** @typedef {import("../../types/worker-messages.js").ToWorker} ToWorker */
/** @typedef {import("../../types/worker-messages.js").MicrophoneCommand} MicrophoneCommand */

/** @param {(message: ToWorker) => void} send */
export function connectWorldMicrophone(send) {
  /** @type {{token: number, capture: Awaited<ReturnType<typeof startPcmRecording>> | null, ending: Promise<void> | null, cancelled: boolean, abort: AbortController} | null} */
  let active = null;
  let closed = false;
  /** @type {PermissionStatus | null} */
  let permission = null;
  const granted = () => {
    if (!closed && permission?.state === "granted") send({ type: "microphone-permission-granted" });
  };
  // A prior refusal is latched by the core, not by query(). Observe later
  // grants so changing origin permission makes the next genuine act work.
  void navigator.permissions
    ?.query({ name: /** @type {PermissionName} */ ("microphone") })
    .then((status) => {
      if (closed) return;
      permission = status;
      status.addEventListener("change", granted);
      granted();
    })
    .catch(() => {});

  /** Stop immediately when live; a pending permission is fenced, never
   * resurrected when the browser eventually answers its prompt. */
  function stop() {
    const request = active;
    if (!request) return Promise.resolve();
    if (request.ending) return request.ending;
    if (!request.capture) {
      request.cancelled = true;
      request.abort.abort();
      active = null;
      send({ type: "microphone-failed", token: request.token, reason: "cancelled" });
      return Promise.resolve();
    }
    request.ending = (async () => {
      try {
        const raw = await request.capture?.finish();
        if (raw) send({ type: "microphone-recorded", token: request.token, ...raw });
        else send({ type: "microphone-failed", token: request.token, reason: "cancelled" });
      } catch {
        send({ type: "microphone-failed", token: request.token, reason: "unavailable" });
      } finally {
        if (active === request) active = null;
      }
    })();
    return request.ending;
  }

  /** @param {MicrophoneCommand} command */
  async function command(command) {
    if (command.operation === "stop") {
      if (active?.token === command.token) await stop();
      return;
    }
    if (command.operation === "cancel") {
      const request = active;
      if (!request) return;
      request.cancelled = true;
      request.abort.abort();
      request.capture?.cancel();
      active = null;
      return;
    }
    if (active || closed || document.hidden) {
      send({ type: "microphone-failed", token: command.token, reason: active ? "busy" : "cancelled" });
      return;
    }
    const request = {
      token: command.token,
      capture: /** @type {Awaited<ReturnType<typeof startPcmRecording>> | null} */ (null),
      ending: /** @type {Promise<void> | null} */ (null),
      cancelled: false,
      abort: new AbortController(),
    };
    active = request;
    try {
      const capture = await startPcmRecording(
        () => {
          void stop();
        },
        command.maxMs,
        request.abort.signal,
      );
      if (request.cancelled) {
        capture.cancel();
        return;
      }
      request.capture = capture;
      send({ type: "microphone-admitted", token: command.token });
    } catch (error) {
      if (request.cancelled) return;
      active = null;
      const name = error instanceof DOMException ? error.name : "";
      const reason =
        name === "NotAllowedError" || name === "SecurityError"
          ? "permission-denied"
          : name === "InvalidStateError" || name === "NotReadableError"
            ? "busy"
            : "unavailable";
      send({ type: "microphone-failed", token: command.token, reason });
    }
  }
  const hidden = () => {
    if (document.hidden) void stop();
  };
  document.addEventListener("visibilitychange", hidden);
  return {
    command,
    async close() {
      closed = true;
      document.removeEventListener("visibilitychange", hidden);
      permission?.removeEventListener("change", granted);
      await stop();
    },
  };
}
