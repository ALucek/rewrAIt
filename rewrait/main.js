const editor = document.getElementById("editor");
const OPENAI_API_KEY = window.OPENAI_API_KEY ?? "";
const MODEL_NAME = window.OPENAI_MODEL ?? "gpt-4o-mini";

let currentAbort; // tracks the in-flight stream so we can cancel

/* Intercept Enter: if the current prompt line starts with @User: → call the model */
editor.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const line = getCurrentLineText();
  if (!line.trim().startsWith("@User:")) return;

  e.preventDefault(); // stop default newline for cleaner UX
  await runQuery();
});

/* -------------------------------- helper fns -----------------------------*/

function getCurrentLineText() {
  /*  Return the text on the line where the caret sits  */
  const sel = window.getSelection();
  if (!sel.rangeCount) return "";
  const range = sel.getRangeAt(0).cloneRange();
  range.setStart(sel.anchorNode, 0);
  return range.toString().split("\n").pop();
}

function insertMarker() {
  const span = document.createElement("span");
  span.className = "marker";
  const sel = window.getSelection();
  sel.getRangeAt(0).insertNode(span);
  // Collapse the selection so no text remains highlighted while streaming
  sel.removeAllRanges();
  return span;
}

function parseConversation() {
  /* Parse conversation into [{role,content}] with multi-line messages between markers */
  const text = editor.innerText;
  const regex = /@User:|@AI:/g;
  const messages = [];
  let match;
  let currentRole = null;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // Save content collected since the previous marker
    if (currentRole) {
      const content = text.slice(lastIndex, match.index).trim();
      if (content) messages.push({ role: currentRole, content });
    }
    // Update role and index for the next iteration
    currentRole = match[0] === "@User:" ? "user" : "assistant";
    lastIndex = regex.lastIndex;
  }

  // Capture content after the final marker
  if (currentRole) {
    const content = text.slice(lastIndex).trim();
    if (content) messages.push({ role: currentRole, content });
  }

  return messages;
}

function placeCaretAtEnd(el) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

async function runQuery() {
  // 1-- build messages array from the whole doc (user prompt is already in the editor)
  const messages = parseConversation();

  // 2-- cancel any previous in-flight stream
  if (currentAbort) currentAbort.abort();
  const abortCtrl = new AbortController();
  currentAbort = abortCtrl;

  // 3-- place a zero-width marker at caret and prepend the AI label on a new line
  const marker = insertMarker();
  marker.insertAdjacentText("beforebegin", "\n\n@AI: ");

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
    currentAbort = null;
    // After AI response, create a fresh prompt line for the user
    editor.append("\n\n@User: ");
    placeCaretAtEnd(editor);
  }
}

/* ---- Fetch wrapper that yields tokens as they arrive (SSE) ----*/
async function* streamCompletion(messages, signal) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL_NAME, stream: true, messages }),
    signal,
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // keep incomplete line for next read

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.replace("data:", "").trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const token = json.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch (_) {
        /* skip malformed line */
      }
    }
  }
} 