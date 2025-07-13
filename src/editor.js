export function isCursorInUserPrompt(editor) {
  /* Check if the caret is currently inside a block of user-written text */
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;

  const range = sel.getRangeAt(0).cloneRange();
  // Create a new range from the start of the editor up to the caret
  range.setStart(editor, 0);

  const textBeforeCursor = range.toString();
  const lastUserIndex = textBeforeCursor.lastIndexOf("@user:");
  const lastAiIndex = textBeforeCursor.lastIndexOf("@ai:");

  // If @user: is present and it's the last role marker we found, we're in a user prompt.
  return lastUserIndex !== -1 && lastUserIndex > lastAiIndex;
}

export function insertMarker() {
  const span = document.createElement("span");
  span.className = "marker";
  const sel = window.getSelection();
  sel.getRangeAt(0).insertNode(span);
  // Collapse the selection so no text remains highlighted while streaming
  sel.removeAllRanges();
  return span;
}

export function parseConversation(editor) {
  /* Parse conversation into [{role,content}] with multi-line messages between markers */
  const text = editor.innerText;
  const regex = /@system:|@user:|@ai:/g;
  const messages = [];
  let match;
  let currentRole = null;
  let lastIndex = 0;

  const roleMap = {
    "@system:": "system",
    "@user:": "user",
    "@ai:": "assistant",
  };

  while ((match = regex.exec(text)) !== null) {
    // Save content collected since the previous marker
    if (currentRole) {
      const content = text.slice(lastIndex, match.index).trim();
      if (content) messages.push({ role: currentRole, content });
    }
    // Update role and index for the next iteration
    currentRole = roleMap[match[0]];
    lastIndex = regex.lastIndex;
  }

  // Capture content after the final marker
  if (currentRole) {
    const content = text.slice(lastIndex).trim();
    if (content) messages.push({ role: currentRole, content });
  }

  return messages;
}

export function placeCaretAtEnd(el) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function resetEditor(editor) {
  const messages = parseConversation(editor);
  const systemMessage = messages.find((m) => m.role === "system");
  const systemContent = systemMessage?.content || "You are a helpful assistant.";

  editor.innerHTML = `@system: ${systemContent}\n\n@user: `;
  placeCaretAtEnd(editor);
} 