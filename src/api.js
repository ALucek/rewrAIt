const DEFAULT_MODEL = "gpt-4o-mini";
// All API calls are now proxied through the backend at /api to keep keys server-side
const API_BASE = "/api";

/* ---- Fetch wrapper that yields tokens as they arrive (SSE) ----*/
export async function* streamCompletion(messages, signal, model) {
  const modelName = model || DEFAULT_MODEL;
  const res = await fetch(`${API_BASE}/openai/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: modelName, stream: true, messages }),
    signal,
  });

  // Surface HTTP errors immediately so the caller can handle them
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errorText}`);
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
  const res = await fetch(`${API_BASE}/anthropic/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
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

/* ---- Fetch wrapper that yields tokens as they arrive (Google Gemini SSE) ----*/
export async function* streamGeminiCompletion(messages, signal, model) {
  // Gemini expects separate system instruction and contents array
  const systemMessage = messages.find((m) => m.role === "system");
  const system_instruction = systemMessage
    ? {
        system_instruction: {
          parts: [{ text: systemMessage.content }],
        },
      }
    : {};

  // Convert conversation into Gemini "contents" format
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" || m.role === "ai" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body = JSON.stringify({ ...system_instruction, contents });
  const endpoint = `${API_BASE}/gemini/${model}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errorText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.replace("data:", "").trim();
      if (payload === "[DONE]") return;
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        const token = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (token) yield token;
      } catch (_) {
        /* ignore malformed */
      }
    }
  }
} 