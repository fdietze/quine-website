// ONE CAMERA for the composer and an app: a live preview in a
// dialog, "Take photo" or "Cancel". The photo taken is the video frame at that
// moment, made into the composer's photo attachment by the one photo path
// (site/app/photo.mjs: JPEG, long side at most 1568).
//
// ONE PATH ON EVERY DEVICE (getUserMedia), never the file input's `capture`
// attribute: the same code on a desktop webcam and a phone, and testable with
// a fake camera. The back camera is preferred, as a phone user photographs a
// sketch; the largest size is asked for, since the long side is scaled down
// afterwards anyway.
import { photoAttachment } from "./photo.mjs";

/** @typedef {Awaited<ReturnType<typeof photoAttachment>>} Photo */

// The composer and app may both ask; one visible preview owns the device.
let occupied = false;

/**
 * Open the camera. Resolves with the photo taken, or null when the user
 * cancelled or `signal` aborted (the world view left); rejects with the
 * platform's DOMException when the camera cannot be opened (permission
 * refused, no camera, camera busy). Every way out stops the camera.
 * @param {AbortSignal} signal
 * @returns {Promise<Photo | null>}
 */
export async function takePhoto(signal) {
  if (signal.aborted) return null;
  if (occupied) throw new DOMException("camera is already open", "NotReadableError");
  occupied = true;
  try {
    return await capturePhoto(signal);
  } finally {
    occupied = false;
  }
}

/** @param {AbortSignal} signal @returns {Promise<Photo | null>} */
async function capturePhoto(signal) {
  if (!navigator.mediaDevices) throw new DOMException("no media devices (not a secure context)", "NotSupportedError");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 4096 } },
  });
  const stop = () => stream.getTracks().forEach((t) => t.stop());
  // Left while the permission prompt or the camera was opening.
  if (signal.aborted) {
    stop();
    return null;
  }
  const dialog = document.createElement("dialog");
  dialog.id = "camera-dialog";
  const video = document.createElement("video");
  video.id = "camera-preview";
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const actions = document.createElement("div");
  actions.className = "actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.id = "camera-cancel";
  cancel.textContent = "Cancel";
  const shoot = document.createElement("button");
  shoot.type = "button";
  shoot.id = "camera-shoot";
  shoot.className = "primary";
  shoot.textContent = "Take photo";
  shoot.disabled = true;
  actions.append(cancel, shoot);
  dialog.append(video, actions);
  document.body.append(dialog);
  // EVERY WAY OUT IS WIRED BEFORE THE FIRST AWAIT: a Cancel, an Escape or a
  // leaving view while the preview is still starting ends it too.
  let onAbort = () => {};
  /** @type {Promise<Photo | null>} */
  const taken = new Promise((resolve, reject) => {
    cancel.addEventListener("click", () => resolve(null));
    // Escape closes a modal dialog: that is a cancel too.
    dialog.addEventListener("cancel", () => resolve(null));
    onAbort = () => resolve(null);
    signal.addEventListener("abort", onAbort, { once: true });
    shoot.addEventListener("click", () => {
      shoot.disabled = true;
      void photoAttachment(video).then(resolve, reject);
    });
  });
  try {
    dialog.showModal();
    video.play().then(
      () => (shoot.disabled = false),
      () => {},
    );
    return await taken;
  } finally {
    signal.removeEventListener("abort", onAbort);
    stop();
    dialog.close();
    dialog.remove();
  }
}
