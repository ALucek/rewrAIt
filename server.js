const express = require("express");
const { PassThrough } = require("stream");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "2mb" }));
// HTTP request logging
app.use(morgan("combined"));

// Heartbeat endpoint
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// --- Static file serving for production build ---
const path = require("path");
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));

// SPA fallback: serve index.html for any unknown GET route
app.get("/*", (req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distDir, "index.html"));
});

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

app.post("/api/openai/chat/completions", async (req, res) => {
  try {
    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).end(text);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("OpenAI proxy error", err);
    res.status(500).json({ error: "Proxy error" });
  }
});

app.post("/api/anthropic/messages", async (req, res) => {
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).end(text);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("Anthropic proxy error", err);
    res.status(500).json({ error: "Proxy error" });
  }
});

app.post("/api/gemini/:model", async (req, res) => {
  const { model } = req.params;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).end(text);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("Gemini proxy error", err);
    res.status(500).json({ error: "Proxy error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy server listening on port ${PORT}`)); 