// GloopNext Local AI backend.
// Runs on this computer and connects to Ollama at http://127.0.0.1:11434.
// No OpenAI API key is used by this server.
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL || "qwen3.5:4b";

const allowedOrigins = new Set([
  "https://gloopnext.com",
  "https://www.gloopnext.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by local GloopNext backend."));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));

function getInput(body) {
  const input = body && (body.input || body.message || body.prompt);
  if (typeof input === "string" && input.trim()) return input.trim();
  if (Array.isArray(input) && input.length) return input;
  const error = new Error("Please provide a message, prompt, or input.");
  error.status = 400;
  throw error;
}
function sendEvent(res, data) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function ollamaMessages(input, instructions) {
  const messages = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item.content === "string" && ["user", "assistant", "system"].includes(item.role)) {
        messages.push({ role: item.role, content: item.content });
      }
    }
  } else {
    messages.push({ role: "user", content: input });
  }
  return messages;
}
async function ollamaChat(input, instructions = "", stream = false, signal) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: ollamaMessages(input, instructions),
      stream
    }),
    signal
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Ollama returned HTTP ${response.status}. Is Ollama running and is the model downloaded?`);
  }
  return response;
}

app.get("/health", async (_req, res) => {
  try {
    const check = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!check.ok) throw new Error("Ollama is not responding.");
    const data = await check.json();
    const models = (data.models || []).map(item => item.name);
    res.json({
      ok: true,
      service: "GloopNext Local AI",
      provider: "Ollama",
      model: MODEL,
      modelInstalled: models.some(name => name === MODEL || name.startsWith(MODEL.split(":")[0] + ":")),
      models
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "GloopNext Local AI",
      error: "Ollama is not running. Open Ollama, then download the selected model."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  let input;
  try { input = getInput(req.body); }
  catch (error) { return res.status(error.status || 400).json({ ok: false, error: error.message }); }

  const controller = new AbortController();
  let disconnected = false;
  req.on("aborted", () => { disconnected = true; controller.abort(); });
  res.on("close", () => {
    if (!res.writableEnded) { disconnected = true; controller.abort(); }
  });

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  sendEvent(res, { type: "status", message: "Thinking" });

  try {
    const upstream = await ollamaChat(input, "", true, controller.signal);
    if (!upstream.body) throw new Error("Ollama did not provide a response stream.");
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const part = JSON.parse(line);
        const text = part.message?.content || "";
        if (text) sendEvent(res, { type: "delta", text });
        if (part.error) throw new Error(part.error);
      }
    }
    if (!disconnected && !res.writableEnded) {
      sendEvent(res, { type: "done" });
      res.end();
    }
  } catch (error) {
    if (!disconnected && !controller.signal.aborted && !res.writableEnded) {
      console.error("Local chat error:", error.message);
      sendEvent(res, { type: "error", error: "Local AI failed. Check that Ollama is running and the model is installed." });
      res.end();
    }
  }
});

app.post("/api/code", async (req, res) => {
  try {
    const response = await ollamaChat(getInput(req.body),
      "You are GloopNext's coding assistant. Write accurate, readable code. Explain setup briefly. Never claim code was tested unless it was.", false);
    const data = await response.json();
    const code = data.message?.content || "";
    res.json({ ok: true, code, output: code, text: code });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Local code assistant failed. Make sure Ollama and the model are running." });
  }
});

app.post("/api/browser", async (req, res) => {
  try {
    const response = await ollamaChat(getInput(req.body),
      "You are GloopNext's browser-planning assistant. Give a safe step-by-step plan. You cannot control a browser, click, sign in, or submit forms. Never claim you performed actions.", false);
    const data = await response.json();
    const message = data.message?.content || "";
    res.json({ ok: true, message, steps: message ? [message] : [], mode: "plan_only" });
  } catch {
    res.status(500).json({ ok: false, error: "Local browser planner failed. Check Ollama." });
  }
});

for (const feature of ["image", "video", "music"]) {
  app.post(`/api/${feature}`, (_req, res) => {
    res.status(501).json({ ok: false, error: `${feature} generation is not included in this local text model.` });
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`GloopNext Local AI running at http://127.0.0.1:${PORT}`);
  console.log(`Ollama model: ${MODEL}`);
  console.log("This server only listens on this computer (127.0.0.1).");
});
