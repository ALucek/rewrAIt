const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? "";
const DEFAULT_MODEL = "gpt-4o-mini";

/* ---- Fetch wrapper that yields tokens as they arrive (SSE) ----*/
export async function* streamCompletion(messages, signal, model) {
  const modelName = model || DEFAULT_MODEL;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: modelName, stream: true, messages }),
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