// THE CHAT INPUT: where a user talks to the world's resident. Its one job is
// to hand a human turn over; whether a resident answers is not its business -
// a human turn is recorded with or without one (.mex/context/conversation.md).
//
// Enter sends, Shift+Enter starts a new line: the chat convention people
// already know. Keys typed here never reach the world, which hears keys only
// while focus is in the app's surface (world-session.mjs).
//
// THE SAME COMPOSER AS ANDROID'S (android/kotlin/dev/quine/shell/Composer.kt),
// as far as a page can (decision:
// .mex/context/decisions/2026-10-01-browser-mic-and-camera.md):
// - 📎 Attach picks a photo, 📷 Camera takes one (site/app/camera.mjs). ONE
//   PHOTO rides along, shown as a chip until sent or removed; a photo with no
//   text is still a message.
// - 🎙 HOLD TO RECORD A VOICE MESSAGE, offered only when the model hears audio
//   (`setVoiceOffered`, the Worker's status `voice`); with no text typed it
//   takes Send's place, as on Android. Holding records (the field becomes a
//   recording bar: blinking mic, timer, "‹ Slide to cancel"), releasing sends
//   it at once with the attached photo, sliding left cancels, sliding up locks
//   (then 🗑 discards and ➤ sends). A model that cannot hear gets no 🎙 and
//   no dictation either: the browser's speech recognition would send the
//   audio to a third party.
// What went wrong (a permission refused, a busy device) is said in the
// composer's own notice line and changes nothing else.
import { takePhoto } from "./camera.mjs";
import { errorMessage } from "./error-message.mjs";
import { photoAttachment } from "./photo.mjs";
import { startVoiceRecording } from "./voice-recorder.mjs";

/** @typedef {Awaited<ReturnType<typeof photoAttachment>>} Photo */
/** @typedef {Awaited<ReturnType<typeof startVoiceRecording>>} Recording */

/** How far left (px) a held 🎙 slides to cancel, and how far up to lock. */
const CANCEL_PX = 100;
const LOCK_PX = 70;

/**
 * Words for a camera or microphone that could not be opened, by the
 * platform's DOMException name. Android's wording where Android has one
 * (WorldActivity.kt voiceFailure, userPhoto).
 * @param {unknown} e
 * @param {"microphone" | "camera"} device
 */
function deviceFailure(e, device) {
  const name = e instanceof DOMException ? e.name : "";
  const mic = device === "microphone";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return mic ? "Voice messages need the microphone permission." : "Photos need the camera permission.";
    case "NotReadableError":
    case "AbortError":
      return mic ? "The microphone is in use." : "The camera is busy";
    case "NotFoundError":
    case "OverconstrainedError":
      return mic ? "No microphone found." : "No camera found.";
    default:
      return mic ? "Recording failed." : "Could not open the camera";
  }
}

/**
 * @param {(text: string, attachments: object[]) => void} say  the human turn,
 *   never blank: text, a photo, a voice message, or several.
 * @param {AbortSignal} signal  the world view's life: when it aborts, the
 *   microphone and the camera are let go.
 * @returns {{ form: HTMLFormElement, setVoiceOffered: (offered: boolean) => void }}
 */
export function mountChatInput(say, signal) {
  /**
   * @param {string} tag
   * @param {Record<string, string>} attrs
   * @param {string} [text]
   */
  const el = (tag, attrs, text = "") => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.textContent = text;
    return node;
  };
  const form = /** @type {HTMLFormElement} */ (el("form", { id: "chat" }));
  const notice = el("p", { id: "composer-notice", class: "notice" });
  notice.hidden = true;
  const input = /** @type {HTMLTextAreaElement} */ (
    el("textarea", { id: "chat-input", rows: "1", placeholder: "Message the AI…", "aria-label": "message" })
  );
  const picker = /** @type {HTMLInputElement} */ (el("input", { id: "photo-picker", type: "file", accept: "image/*" }));
  picker.hidden = true;
  const attach = el("button", { id: "attach-photo", type: "button", "aria-label": "Attach" }, "📎");
  const camera = el("button", { id: "camera", type: "button", "aria-label": "Camera" }, "📷");
  // No camera API outside a secure context: no 📷 either.
  camera.hidden = !navigator.mediaDevices;
  const chip = el("button", { id: "photo-chip", type: "button", "aria-label": "remove the photo" }, "photo ✕");
  chip.hidden = true;
  // THE RECORDING BAR, in the field's place while 🎙 is in use.
  const bar = el("div", { id: "recording-bar" });
  bar.hidden = true;
  const dot = el("span", { id: "recording-dot", "aria-label": "Recording" }, "🎙");
  const time = el("span", { id: "recording-time" }, "0:00");
  const hint = el("span", { id: "recording-hint" }, "‹ Slide to cancel");
  const discard = el("button", { id: "discard-voice", type: "button", "aria-label": "Discard voice message" }, "🗑");
  discard.hidden = true;
  bar.append(dot, time, hint, discard);
  const send = el("button", { id: "send", type: "submit" }, "Send");
  const mic = el("button", { id: "mic", type: "button", "aria-label": "Hold to record a voice message" }, "🎙");
  const lock = el("span", { id: "voice-lock", "aria-hidden": "true" }, "🔒");
  lock.hidden = true;
  const micSlot = el("span", { id: "mic-slot" });
  micSlot.append(lock, mic);
  form.append(notice, attach, camera, picker, chip, input, bar, send, micSlot);

  /** @param {string} text */
  const tell = (text) => {
    notice.hidden = !text;
    notice.textContent = text;
  };

  /** @type {Photo | null} */
  let photo = null;
  let photoRead = 0;
  let voiceOffered = false;
  /**
   * The 🎙 in use: "starting" while the microphone opens, then "recording",
   * "locked" once slid up. null: not in use.
   * @type {null | "starting" | "recording" | "locked"}
   */
  let use = null;
  /** @type {Recording | null} */
  let recording = null;
  /** Whether the finger (or key) is still down on 🎙. */
  let held = false;
  let since = 0;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let ticker;
  let startX = 0;
  let startY = 0;

  // WHICH BUTTONS, Android's rule (ComposerButtons.kt): ➤ when there is text
  // or a photo; 🎙 when the model hears and no text is typed; in use, the
  // bar replaces the field and a locked 🎙 becomes ➤ "Send voice message".
  const render = () => {
    const blank = !input.value.trim();
    const inUse = use !== null;
    input.hidden = inUse;
    attach.hidden = inUse;
    camera.hidden = inUse || !navigator.mediaDevices;
    bar.hidden = !inUse;
    discard.hidden = use !== "locked";
    hint.hidden = use === "locked";
    lock.hidden = use !== "starting" && use !== "recording";
    chip.hidden = !photo;
    mic.hidden = !(voiceOffered && blank) && !inUse;
    send.hidden = inUse || (voiceOffered && blank && !photo);
    mic.textContent = use === "locked" ? "➤" : "🎙";
    mic.setAttribute("aria-label", use === "locked" ? "Send voice message" : "Hold to record a voice message");
    mic.classList.toggle("recording", use === "recording");
  };

  /** @param {Photo | null} p */
  const setPhoto = (p) => {
    ++photoRead;
    photo = p;
    render();
  };
  // Picker and drop share ONE intake: the same encoding, bounds and error
  // words. A newer choice/removal wins over an unfinished image decode.
  /** @param {File} file */
  const readPhoto = async (file) => {
    const mine = ++photoRead;
    try {
      const picked = await photoAttachment(file);
      if (signal.aborted || mine !== photoRead) return;
      setPhoto(picked);
      tell("");
    } catch (e) {
      if (!signal.aborted && mine === photoRead) tell(`That photo could not be read: ${errorMessage(e)}`);
    }
  };
  attach.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    picker.value = "";
    if (file) void readPhoto(file);
  });
  form.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "none";
  });
  form.addEventListener("drop", (e) => {
    // Only bytes actually handed over by the human: never follow a URL or
    // a filesystem path from another app (least authority).
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file?.type.startsWith("image/")) return tell("Drop an image file to attach a photo.");
    if (use !== null) return tell("Finish or cancel the recording before attaching a photo.");
    void readPhoto(file);
  });
  camera.addEventListener("click", async () => {
    tell("");
    try {
      const taken = await takePhoto(signal);
      if (taken) setPhoto(taken);
    } catch (e) {
      tell(deviceFailure(e, "camera"));
    }
  });
  chip.addEventListener("click", () => setPhoto(null));
  // Grow with the draft, up to the stylesheet's eight-line viewport (the
  // same cap as Android Composer.kt). KISS: scrollHeight measures wrapping;
  // the browser still owns editing and scrolling beyond that viewport.
  const fitInput = () => {
    if (input.hidden || !input.isConnected) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
  };
  input.addEventListener("input", () => {
    fitInput();
    render();
  });
  // A narrower field wraps an unchanged draft too. Ignore height-only
  // notifications, so fitting never feeds back into its own observer.
  let inputWidth = 0;
  const size = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === inputWidth) return;
    inputWidth = entry.contentRect.width;
    fitInput();
  });
  size.observe(input);
  signal.addEventListener("abort", () => size.disconnect());

  const submit = () => {
    const text = input.value;
    if (!text.trim() && !photo) return;
    say(text, photo ? [photo] : []);
    input.value = "";
    fitInput();
    setPhoto(null);
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  input.addEventListener("keydown", (e) => {
    // `isComposing`: Enter that confirms an IME composition is not a send.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  // THE 🎙'S LIFE: begin on press, then exactly one of finish or cancel.
  // Each use is an ATTEMPT with its own number: a use that ended (cancelled,
  // finished, the view left) while its microphone was still opening must not
  // take over the next one, so every late callback checks it is still the
  // current attempt.
  let attempt = 0;
  const stopUse = () => {
    attempt += 1;
    use = null;
    recording = null;
    clearInterval(ticker);
    render();
  };
  const begin = async () => {
    tell("");
    const mine = ++attempt;
    use = "starting";
    since = Date.now();
    time.textContent = "0:00";
    ticker = setInterval(() => {
      const s = Math.floor((Date.now() - since) / 1000);
      time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }, 250);
    render();
    try {
      const started = await startVoiceRecording(() => {
        if (mine === attempt) void finish();
      });
      // This use ended while the microphone opened.
      if (mine !== attempt) return started.cancel();
      // Released before the microphone was live (a tap, or the permission
      // prompt took the gesture): nothing was recorded, say how it works.
      if (!held) {
        started.cancel();
        stopUse();
        tell("Hold the button to record a voice message.");
        return;
      }
      recording = started;
      use = "recording";
      render();
    } catch (e) {
      if (mine !== attempt) return;
      stopUse();
      tell(deviceFailure(e, "microphone"));
    }
  };
  // THE VOICE GOES WITH THE PHOTO: one message, as on Android. The typed
  // text stays (there is none: 🎙 is offered only on a blank field).
  const finish = async () => {
    const ending = recording;
    // The photo goes with THIS voice: taken now, before the composer is back
    // and could send it alone or attach another meanwhile.
    const along = ending && photo ? [photo] : [];
    if (along.length) photo = null;
    stopUse();
    const voice = await ending?.finish();
    // Nothing is sent from a view that left meanwhile.
    if (signal.aborted) return;
    if (!voice) {
      // Nothing was recorded: the photo stays for the next message, unless
      // another took its place meanwhile.
      if (along.length && !photo) setPhoto(along[0]);
      return;
    }
    say("", [...along, voice]);
  };
  const cancel = () => {
    recording?.cancel();
    stopUse();
  };
  // THE VIEW LEFT: no recording outlives it, and no microphone or camera
  // still opening is used afterwards (takePhoto watches the same signal).
  signal.addEventListener("abort", () => {
    held = false;
    cancel();
  });

  // The locked ➤ sends on a click of its OWN press: the release that ended
  // the locking slide clicks the same button, and that is not a send.
  let pressedLocked = false;
  mic.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pressedLocked = use === "locked";
    if (use !== null) return;
    held = true;
    startX = e.clientX;
    startY = e.clientY;
    mic.setPointerCapture(e.pointerId);
    void begin();
  });
  mic.addEventListener("pointermove", (e) => {
    if (!held || (use !== "starting" && use !== "recording")) return;
    if (startX - e.clientX > CANCEL_PX) {
      held = false;
      cancel();
    } else if (startY - e.clientY > LOCK_PX && use === "recording") {
      use = "locked";
      render();
    }
  });
  mic.addEventListener("pointerup", () => {
    if (!held) return;
    held = false;
    if (use === "recording") void finish();
  });
  mic.addEventListener("pointercancel", () => {
    if (!held) return;
    held = false;
    if (use !== "locked") cancel();
  });
  mic.addEventListener("click", (e) => {
    // detail 0: a click from the keyboard, which has no press of its own here.
    if (use === "locked" && (pressedLocked || e.detail === 0)) void finish();
  });
  // The keyboard's hold: Space or Enter down records, up sends.
  mic.addEventListener("keydown", (e) => {
    if ((e.key !== " " && e.key !== "Enter") || e.repeat || use !== null) return;
    e.preventDefault();
    held = true;
    void begin();
  });
  mic.addEventListener("keyup", (e) => {
    if ((e.key !== " " && e.key !== "Enter") || !held) return;
    held = false;
    if (use === "recording") void finish();
  });
  discard.addEventListener("click", cancel);

  render();
  return {
    form,
    /** @param {boolean} offered */
    setVoiceOffered(offered) {
      if (offered === voiceOffered) return;
      voiceOffered = offered;
      render();
    },
  };
}
