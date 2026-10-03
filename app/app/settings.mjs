// THE SETTINGS SCREEN, in the sections every shell shares: AI (the OpenRouter
// key, model, reasoning effort, image model), App permissions (Web, Audio),
// About (which build this is) and, once the Build row's gesture opened it
// (./developer-door.mjs), Developer (show tool calls, show the status line).
// What it OFFERS comes from the engine (the default model, the effort ladder:
// src/llm.rs), so a new rung or a new default reaches this screen without a
// copy here; what it STORES is ./settings-store.mjs's business.
import { connectDeveloperDoor } from "./developer-door.mjs";
import { elementById } from "./element-by-id.mjs";
import { HostClient } from "./host-client.mjs";
import {
  loadDeveloperSwitches,
  loadDeveloperUnlocked,
  loadPermissions,
  loadSettings,
  removeKey,
  saveDeveloperSwitches,
  saveDeveloperUnlocked,
  saveKey,
  savePermissions,
  saveResident,
} from "./settings-store.mjs";

const keyInput = elementById("openrouter-key", HTMLInputElement);
const keyState = elementById("key-state", HTMLElement);
const removeButton = elementById("remove-key", HTMLButtonElement);
const model = elementById("model", HTMLInputElement);
const effort = elementById("effort", HTMLSelectElement);
const showToolCalls = elementById("show-tool-calls", HTMLInputElement);
const showStatusLine = elementById("show-status-line", HTMLInputElement);
const imageModel = elementById("image-model", HTMLInputElement);
const web = elementById("permission-web", HTMLInputElement);
const sound = elementById("permission-sound", HTMLInputElement);
const camera = elementById("permission-camera", HTMLInputElement);
const microphone = elementById("permission-microphone", HTMLInputElement);
const form = elementById("settings", HTMLFormElement);
const saveState = elementById("save-state", HTMLElement);
const errorBox = elementById("error", HTMLElement);

/** @param {unknown} err */
function showError(err) {
  errorBox.hidden = false;
  errorBox.textContent = err instanceof Error ? err.message : String(err);
}

function showKeyState() {
  // THE KEY IS NEVER PUT BACK INTO THE PAGE: the field stays empty, and the
  // screen says only whether one is saved. Typing a new one replaces it.
  const saved = loadSettings().key !== "";
  keyState.textContent = saved
    ? "A key is saved. Type a new one to replace it."
    : "No key saved: apps open without the AI.";
  removeButton.hidden = !saved;
}

async function init() {
  const host = new HostClient();
  let defaults;
  try {
    defaults = await host.defaults();
  } finally {
    host.close();
  }
  const stored = loadSettings();
  model.placeholder = defaults.model;
  model.value = stored.model;
  imageModel.placeholder = defaults.imageModel;
  imageModel.value = stored.imageModel;
  const permissions = loadPermissions();
  web.checked = permissions.web;
  sound.checked = permissions.sound;
  microphone.checked = permissions.microphone;
  camera.checked = permissions.camera;
  elementById("about", HTMLElement).textContent = `Quine ${defaults.version} (${defaults.commit})`;
  /** @param {string} value @param {string} label */
  const option = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  effort.replaceChildren(option("", `default (${defaults.effort})`), ...defaults.efforts.map((e) => option(e, e)));
  // An unknown stored effort (an older build's word) shows as the default,
  // which is what the engine resolves it to anyway.
  effort.value = defaults.efforts.includes(stored.effort) ? stored.effort : "";
  const developer = loadDeveloperSwitches();
  showToolCalls.checked = developer.showToolCalls;
  showStatusLine.checked = developer.showStatusLine;
  // Hiding the section changes no switch: what was on stays on, as on Android.
  const developerSection = elementById("developer", HTMLElement);
  const developerState = elementById("developer-state", HTMLElement);
  const unlocked = loadDeveloperUnlocked();
  developerSection.hidden = !unlocked;
  connectDeveloperDoor(elementById("build-row", HTMLButtonElement), {
    unlocked,
    onChange(open) {
      saveDeveloperUnlocked(open);
      developerSection.hidden = !open;
    },
    say(text) {
      developerState.textContent = text;
    },
  });
  showKeyState();
  document.body.dataset.ready = "1";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  // "Saved" is shown only once every store call returned: localStorage can
  // throw (quota, storage disabled), and then the user sees why instead.
  try {
    saveKey(keyInput.value);
    keyInput.value = "";
    saveDeveloperSwitches({ showToolCalls: showToolCalls.checked, showStatusLine: showStatusLine.checked });
    saveResident({ model: model.value, effort: effort.value, imageModel: imageModel.value });
    savePermissions({ web: web.checked, sound: sound.checked, microphone: microphone.checked, camera: camera.checked });
  } catch (err) {
    saveState.textContent = "";
    showError(err);
    return;
  }
  errorBox.hidden = true;
  showKeyState();
  saveState.textContent = "Saved";
});
// THE CONFIRMATION STAYS TRUE: an edit after saving makes the form unsaved
// again, so the "Saved" it showed goes away until the next Save.
form.addEventListener("input", () => {
  saveState.textContent = "";
});
removeButton.addEventListener("click", () => {
  removeKey();
  showKeyState();
});

init().catch(showError);
