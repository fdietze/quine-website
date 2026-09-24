// THE SETTINGS SCREEN: the OpenRouter key, the resident's model and effort.
// What it OFFERS comes from the engine (the default model, the effort ladder:
// src/llm.rs), so a new rung or a new default reaches this screen without a
// copy here; what it STORES is ./settings-store.mjs's business.
import { HostClient } from "./host-client.mjs";
import { loadSettings, removeKey, saveKey, saveResident } from "./settings-store.mjs";

const keyInput = document.getElementById("openrouter-key");
const keyState = document.getElementById("key-state");
const removeButton = document.getElementById("remove-key");
const model = document.getElementById("model");
const effort = document.getElementById("effort");

function showKeyState() {
  // THE KEY IS NEVER PUT BACK INTO THE PAGE: the field stays empty, and the
  // screen says only whether one is saved. Typing a new one replaces it.
  const saved = loadSettings().key !== "";
  keyState.textContent = saved
    ? "A key is saved. Type a new one to replace it."
    : "No key saved: apps open without a resident.";
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
  const option = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  effort.replaceChildren(
    option("", `default (${defaults.effort})`),
    ...defaults.efforts.map((e) => option(e, e)),
  );
  // An unknown stored effort (an older build's word) shows as the default,
  // which is what the engine resolves it to anyway.
  effort.value = defaults.efforts.includes(stored.effort) ? stored.effort : "";
  showKeyState();
  document.body.dataset.ready = "1";
}

document.getElementById("settings").addEventListener("submit", (e) => {
  e.preventDefault();
  saveKey(keyInput.value);
  keyInput.value = "";
  saveResident({ model: model.value, effort: effort.value });
  showKeyState();
  document.body.dataset.saved = "1";
});
removeButton.addEventListener("click", () => {
  removeKey();
  showKeyState();
});

init().catch((err) => {
  const box = document.getElementById("error");
  box.hidden = false;
  box.textContent = String(err?.message ?? err);
});
