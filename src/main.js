import { streamCompletion } from "./api.js";
import {
  isCursorInUserPrompt,
  insertMarker,
  parseConversation,
  placeCaretAtEnd,
  resetEditor as resetEditorContent,
} from "./editor.js";
import { saveSession, loadSession } from "./file-handler.js";

const editor = document.getElementById("editor");
const saveBtn = document.getElementById("save-btn");
const loadBtn = document.getElementById("load-btn");
const configBtn = document.getElementById("config-btn");
const configPopup = document.getElementById("config-popup");
const popupCancelBtn = document.getElementById("popup-cancel-btn");
const popupSaveBtn = document.getElementById("popup-save-btn");
const modelInput = document.getElementById("model-input");

const MODEL_STORAGE_KEY = "rewrait-llm-model";
const DEFAULT_MODEL = "gpt-4o-mini";

let currentAbortController = null;

function getModel() {
  return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL;
}

function resetEditor() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  resetEditorContent(editor);
}

editor.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  // Only trigger if the cursor is inside a user prompt block
  if (!isCursorInUserPrompt(editor)) return;

  // In a user prompt block, Shift+Enter should add a newline.
  if (e.shiftKey) {
    return; // Allow default newline behavior
  }

  e.preventDefault(); // stop default newline for cleaner UX
  await runQuery();
});

saveBtn.addEventListener("click", () => {
  saveSession(editor.innerText);
});

loadBtn.addEventListener("click", () => {
  loadSession(editor);
});

configBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // prevent this click from closing the popup immediately
  const isVisible = configPopup.style.display === "block";
  if (isVisible) {
    hidePopup();
  } else {
    modelInput.value = getModel();
    configPopup.style.display = "block";
    document.addEventListener("click", closePopupOnOutsideClick);
  }
});

function hidePopup() {
  configPopup.style.display = "none";
  document.removeEventListener("click", closePopupOnOutsideClick);
}

function closePopupOnOutsideClick(e) {
  if (!configPopup.contains(e.target)) {
    hidePopup();
  }
}

popupCancelBtn.addEventListener("click", hidePopup);

popupSaveBtn.addEventListener("click", () => {
  const newModel = modelInput.value.trim();
  if (newModel) {
    localStorage.setItem(MODEL_STORAGE_KEY, newModel);
  }
  hidePopup();
});

async function runQuery() {
  // 1-- build messages array from the whole doc (user prompt is already in the editor)
  const messages = parseConversation(editor);

  const lastMessage = messages.at(-1);
  if (lastMessage?.role === "user" && lastMessage?.content.trim().toLowerCase() === "clear") {
    resetEditor();
    return;
  }

  // 2-- cancel any previous in-flight stream
  if (currentAbortController) {
    currentAbortController.abort();
  }
  const abortCtrl = new AbortController();
  currentAbortController = abortCtrl;

  // 3-- place a zero-width marker at caret and prepend the AI label on a new line
  const marker = insertMarker();
  marker.insertAdjacentText("beforebegin", "\n\n@ai: ");

  // 4-- stream tokens and insert them before marker
  try {
    const model = getModel();
    for await (const token of streamCompletion(messages, abortCtrl.signal, model)) {
      marker.insertAdjacentText("beforebegin", token);
      marker.scrollIntoView({ block: "nearest" }); // minimal autoscroll
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  } finally {
    marker.remove();
    currentAbortController = null;
    // After AI response, create a fresh prompt line for the user
    editor.append("\n\n@user: ");
    placeCaretAtEnd(editor);
  }
}

// Initialize editor with a default system prompt
resetEditorContent(editor); 