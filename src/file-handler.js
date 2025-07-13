import { placeCaretAtEnd } from "./editor.js";

export function saveSession(text) {
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.download = "rewrait_session.txt";
  a.href = window.URL.createObjectURL(blob);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(a.href);
}

export function loadSession(editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.style.display = "none";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      editor.innerText = e.target.result;
      placeCaretAtEnd(editor);
    };
    reader.readAsText(file);
    document.body.removeChild(input);
  };
  document.body.appendChild(input);
  input.click();
} 