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

let currentAbortController = null;

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
    for await (const token of streamCompletion(messages, abortCtrl.signal)) {
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