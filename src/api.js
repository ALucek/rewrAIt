const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? "";
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? "";
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

export async function* streamAnthropicCompletion(messages, signal, model, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      system,
      messages,
      stream: true,
      max_tokens: 4096,
    }),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${errorText}`);
  }

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
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        if (json.type === "content_block_delta") {
          const token = json.delta?.text;
          if (token) yield token;
        } else if (json.type === "error") {
          console.error(`Anthropic API error: ${json.error.message}`);
          yield `[ERROR: ${json.error.message}]`;
          return;
        }
      } catch (_) {
        /* skip malformed line */
      }
    }
  }
} 