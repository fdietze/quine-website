// WHAT THE PERSON SEES OF A PUBLICATION, whichever tab starts it: the chat
// choice, the busy state with Cancel, the refusal text, the file name and the
// download. The run itself is publication-run.mjs; which world, and what
// happens with the artifact, is the caller's.
import { elementById } from "./element-by-id.mjs";
import { errorMessage } from "./error-message.mjs";

const publishDialog = elementById("publish-dialog", HTMLDialogElement);
const busyDialog = elementById("busy-dialog", HTMLDialogElement);
const noticeDialog = elementById("notice-dialog", HTMLDialogElement);

/**
 * Ask whether the published copy carries the conversation. Cancel, Escape and
 * anything else answer null: there is no default answer.
 * @param {string} appName
 * @returns {Promise<"omit" | "full" | null>}
 */
export async function chooseChat(appName) {
  elementById("publish-title", HTMLElement).textContent = `Publish “${appName}”?`;
  publishDialog.returnValue = "cancel";
  publishDialog.showModal();
  // Focus the dialog itself so no button reads as the default.
  publishDialog.focus();
  await new Promise((resolve) => publishDialog.addEventListener("close", resolve, { once: true }));
  const answer = publishDialog.returnValue;
  return answer === "omit" || answer === "full" ? answer : null;
}

/**
 * Show `title` with a Cancel that aborts the returned signal, until `done()`.
 * @param {string} title
 * @returns {{ signal: AbortSignal, done: () => void }}
 */
export function busy(title) {
  const controller = new AbortController();
  elementById("busy-title", HTMLElement).textContent = title;
  const cancel = () => controller.abort();
  const button = elementById("busy-cancel", HTMLButtonElement);
  button.addEventListener("click", cancel);
  const escape = (/** @type {Event} */ e) => {
    e.preventDefault();
    cancel();
  };
  busyDialog.addEventListener("cancel", escape);
  busyDialog.showModal();
  return {
    signal: controller.signal,
    done() {
      button.removeEventListener("click", cancel);
      busyDialog.removeEventListener("cancel", escape);
      if (busyDialog.open) busyDialog.close();
    },
  };
}

/**
 * A message the person acknowledges.
 * @param {string} title
 * @param {unknown} text
 */
export async function notice(title, text) {
  elementById("notice-title", HTMLElement).textContent = title;
  elementById("notice-text", HTMLElement).textContent = errorMessage(text);
  noticeDialog.showModal();
  await new Promise((resolve) => noticeDialog.addEventListener("close", resolve, { once: true }));
}

/**
 * The file a published app is saved as: the app's export name (src/app_share.rs
 * `share_file_name`: ascii alphanumerics, `-` between, `world` when nothing is
 * left) with `-published`, as GTK names it (crates/quine-gtk/src/publication_choice.rs).
 * @param {string} appName
 */
export function publishedFileName(appName) {
  const stem = appName
    .replace(/[^A-Za-z0-9]/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${stem || "world"}-published.quine`;
}

/**
 * Save `bytes` as `fileName` through the browser's download.
 * @param {Uint8Array<ArrayBuffer>} bytes
 * @param {string} fileName
 */
export function download(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.quine" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
