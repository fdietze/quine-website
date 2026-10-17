// A chat picture's two sizes: a thumbnail in its row and a native dialog on
// demand. Only host-owned raster data enters either src; viewing chat never
// fetches a URL supplied by message text (least authority).

/** @param {{label: string, data_url: string}} image @param {number} index
 * @returns {import("../../types/html-frame.js").VNode[]} */
export function conversationImage(image, index) {
  if (!/^data:image\/(png|jpeg);base64,/.test(image.data_url)) return [];
  return [
    {
      tag: "button",
      key: `image-${index}`,
      class: ["conversation-image"],
      style: [],
      attrs: [
        ["type", "button"],
        ["aria-label", `Enlarge ${image.label}`],
        ["data-image-index", String(index)],
      ],
      events: [],
      children: [
        {
          tag: "img",
          key: "picture",
          class: [],
          style: [],
          attrs: [
            ["src", image.data_url],
            ["alt", image.label],
            ["loading", "lazy"],
          ],
          events: [],
          children: [],
        },
      ],
    },
  ];
}

/** One viewer belongs to one conversation, including its teardown.
 * @param {HTMLElement} owner */
export function imageViewer(owner) {
  /** @type {HTMLDialogElement | null} */
  let current = null;
  const dispose = () => {
    current?.close();
    current?.remove();
    current = null;
  };
  return {
    dispose,
    /** @param {{label: string, data_url: string}} image */
    open(image) {
      dispose();
      const dialog = document.createElement("dialog");
      current = dialog;
      dialog.className = "conversation-image-dialog";
      const picture = document.createElement("img");
      picture.src = image.data_url;
      picture.alt = image.label;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => dialog.remove(), { once: true });
      dialog.append(picture, close);
      owner.append(dialog);
      dialog.showModal();
    },
  };
}
