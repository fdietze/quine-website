// THE SETTINGS SCREEN, in the sections every shell shares: AI (Sign in with
// OpenRouter or an API key, model, image model - in OpenRouter's box - and
// reasoning effort), App permissions (Web, Audio),
// About (which build this is) and, once the Build row's gesture opened it
// (./developer-door.mjs), Developer (show tool calls, show the status line).
// What it OFFERS comes from the engine (the default model, the effort ladder:
// src/llm.rs), so a new rung or a new default reaches this screen without a
// copy here; what it STORES is ./settings-store.mjs's business.
import { connectDeveloperDoor } from "./developer-door.mjs";
import { elementById } from "./element-by-id.mjs";
import { errorMessage } from "./error-message.mjs";
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
const account = elementById("account", HTMLButtonElement);
const accountState = elementById("account-state", HTMLElement);
const aiStatus = elementById("ai-status", HTMLElement);
const model = elementById("model", HTMLInputElement);
const modelSuffix = elementById("model-suffix", HTMLSelectElement);
const modelList = elementById("openrouter-models", HTMLDataListElement);
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
  // ONE SLOT, TWO WAYS TO FILL IT: a pasted key signs in as much as a
  // signed-in one, and Sign out removes either.
  account.textContent = saved ? "Sign out" : "Sign in with OpenRouter";
  aiStatus.textContent = saved
    ? "AI: OpenRouter · signed in"
    : "AI: OpenRouter · not signed in — apps open without the AI";
  account.classList.toggle("primary", !saved);
}

// SIGN IN WITH OPENROUTER (crates/quine-browser/src/sign_in.rs). The callback
// is this page: OpenRouter sends the browser back here with `?code=…&state=…`.
// The verifier and state cross that navigation in sessionStorage, which is
// this tab's alone and gone with it; they are used once and removed.
const PENDING = "quine.sign-in";

/** This page's address without a query: where OpenRouter sends the browser back. */
function callbackUrl() {
  return location.origin + location.pathname;
}

async function signIn() {
  const host = new HostClient();
  try {
    const { url, verifier, state } = await host.call("signInStart", callbackUrl());
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }));
    location.assign(url);
  } catch (err) {
    accountState.textContent = errorMessage(err);
  } finally {
    host.close();
  }
}

/**
 * Finish a sign-in this page is the callback of, if it is one: the key it
 * yields is saved like a pasted one.
 * @param {HostClient} host
 */
async function finishSignIn(host) {
  const query = location.search;
  const params = new URLSearchParams(query);
  if (!params.has("code") && !params.has("error")) return;
  // The one-time code leaves the address bar and the history at once.
  history.replaceState(null, "", callbackUrl());
  const pending = sessionStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  if (pending === null) {
    accountState.textContent = "Sign-in didn't finish. Try again.";
    return;
  }
  const { verifier, state } = JSON.parse(pending);
  try {
    saveKey(await host.call("signInFinish", { query, verifier, state }));
    accountState.textContent = "Signed in. Open apps use the AI from their next turn.";
  } catch (err) {
    // The engine's sentence for the person (quine_oauth::SignInError).
    accountState.textContent = errorMessage(err);
  }
}

/**
 * The release version every shell shows, "0.<commit count> (<hash>)": the
 * shipped site carries it beside its pages (release-version.txt, written by
 * nix/browser.nix `browserSite` so the WASM never names a commit). Null where
 * it is absent: a development build.
 * @returns {Promise<string | null>}
 */
async function releaseVersion() {
  try {
    const response = await fetch(new URL("../release-version.txt", import.meta.url));
    return response.ok ? (await response.text()).trim() || null : null;
  } catch {
    return null;
  }
}

async function init() {
  const release = releaseVersion();
  const host = new HostClient();
  let defaults;
  let choice;
  try {
    defaults = await host.defaults();
    await finishSignIn(host);
    // OpenRouter's model and routing suffix as stored, read through the
    // engine's one rule (a model saved with its suffix splits there).
    const saved = loadSettings();
    choice = await host.call("openrouterChoice", { model: saved.model, suffix: saved.suffix });
  } finally {
    host.close();
  }
  const stored = loadSettings();
  model.placeholder = defaults.model;
  model.value = choice.model;
  imageModel.placeholder = defaults.imageModel;
  imageModel.value = stored.imageModel;
  const permissions = loadPermissions();
  web.checked = permissions.web;
  sound.checked = permissions.sound;
  microphone.checked = permissions.microphone;
  camera.checked = permissions.camera;
  // Outside a release, the engine's crate version and commit in the same shape.
  elementById("about", HTMLElement).textContent =
    `Quine ${(await release) ?? `${defaults.version} (${defaults.commit})`}`;
  /** @param {string} value @param {string} label */
  const option = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  effort.replaceChildren(option("", `default (${defaults.effort})`), ...defaults.efforts.map((e) => option(e, e)));
  modelSuffix.replaceChildren(...defaults.suffixes.map(([word, label]) => option(word, label)));
  modelSuffix.value = choice.suffix;
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
    saveResident({ model: model.value, suffix: modelSuffix.value, effort: effort.value, imageModel: imageModel.value });
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
// THE MODEL LIST IS ASKED FOR WHEN THE PERSON REACHES FOR THE FIELD (a
// pointer or a key on it), not on every visit: only then does this page ask
// OpenRouter for anything. It arrives when it arrives; until then, and for
// good offline, the field is a plain text field.
let modelsAsked = false;
function askForModels() {
  if (modelsAsked) return;
  modelsAsked = true;
  const host = new HostClient();
  host
    .call("openrouterModels")
    .then(
      (ids) =>
        modelList.replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id }))),
      () => {},
    )
    .finally(() => host.close());
}
model.addEventListener("pointerdown", askForModels);
model.addEventListener("keydown", askForModels);

account.addEventListener("click", () => {
  if (loadSettings().key === "") {
    accountState.textContent = "";
    void signIn();
    return;
  }
  // SIGN OUT forgets the key in this browser only; it lives on at OpenRouter
  // (labelled "Quine" on the person's keys page) until they revoke it there.
  removeKey();
  showKeyState();
  accountState.textContent = "Signed out. Apps open without the AI.";
});

init().catch(showError);
