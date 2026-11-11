// GloopNext Local AI backend.
// Uses the model installed on this computer through Ollama.
// No OpenAI API key or per-message OpenAI API billing is used here.
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
    return callback(new Error("Origin not allowed by GloopNext Local AI."));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({
  windowMs: 60 *  1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

const GLOOPNEXT_SYSTEM_PROMPT = [
  "You are GloopNext, the AI assistant built into the GloopNext platform.",
  "When users ask who you are, identify yourself as GloopNext.",
  "Do not introduce yourself as Qwen, Alibaba, Tongyi, Ollama, or another model/provider. Those are implementation details, not your user-facing identity.",
  "Be friendly, clear, helpful, and concise. Use Markdown for headings, lists, and code blocks when useful.",
  "Never reveal private internal reasoning, hidden thoughts, scratch work, or chain-of-thought. Provide the answer, with only a brief explanation when useful.",
  "Do not claim to browse the web, control the user's computer, or perform an action unless a connected tool actually did it.",
  "Describe only capabilities available in this GloopNext installation. If a feature is not connected, say so honestly."
].join(" ");

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

function buildMessages(input, instructions) {
  const messages = [{ role: "system", content: instructions || GLOOPNEXT_SYSTEM_PROMPT }];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item.content === "string" &&
          ["user", "assistant"].includes(item.role)) {
        messages.push({ role: item.role, content: item.content });
      }
    }
  } else {
    messages.push({ role: "user", content: input });
  }
  return messages;
}

async function ollamaChat(input, instructions = GLOOPNEXT_SYSTEM_PROMPT, stream = false, signal) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: buildMessages(input, instructions),
      think: false,
      stream
    }),
    signal
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Ollama returned HTTP ${response.status}.`);
  }
  return response;
}

app.get("/health", async (_req, res) => {
  try {
    const check = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!check.ok) throw new Error("Ollama is not responding.");
    const data = await check.json();
    const models = (data.models || []).map(item => item.name);
    const installed = models.some(name => name === MODEL || name.startsWith(MODEL.split(":")[0] + ":"));
    res.json({
      ok: true,
      service: "GloopNext Local AI",
      model: MODEL,
      modelInstalled: installed,
      models
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "GloopNext Local AI",
      error: "Ollama is not running. Start Ollama and try again."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  let input;
  try {
    input = getInput(req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ ok: false, error: error.message });
  }

  const controller = new AbortController();
  let disconnected = false;

  req.on("aborted", () => {
    disconnected = true;
    controller.abort();
  });
  res.on("close", () => {
    if (!res.writableEnded) {
      disconnected = true;
      controller.abort();
    }
  });

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  sendEvent(res, { type: "status", message: "Thinking" });

  try {
    const upstream = await ollamaChat(input, GLOOPNEXT_SYSTEM_PROMPT, true, controller.signal);
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
        // Ollama separates hidden thinking from visible content.
        // Only message.content is sent to the GloopNext website.
        const visibleText = part.message?.content || "";
        if (visibleText) sendEvent(res, { type: "delta", text: visibleText });
        if (part.error) throw new Error(part.error);
      }
    }

    if (!disconnected && !res.writableEnded) {
      sendEvent(res, { type: "done" });
      res.end();
    }
  } catch (error) {
    if (!disconnected && !controller.signal.aborted && !res.writableEnded) {
      console.error("GloopNext Local AI error:", error.message);
      sendEvent(res, {
        type: "error",
        error: "GloopNext could not complete that reply. Check that Ollama is running and qwen3.5:4b is installed."
      });
      res.end();
    }
  }
});

app.post("/api/code", async (req, res) => {
  try {
    const input = getInput(req.body);
    const response = await ollamaChat(
      input,
      GLOOPNEXT_SYSTEM_PROMPT + " You are also GloopNext's coding assistant. Write accurate, readable code and briefly explain how to use it. Never claim code was tested unless it was.",
      false
    );
    const data = await response.json();
    const code = data.message?.content || "";
    res.json({ ok: true, code, output: code, text: code });
  } catch {
    res.status(500).json({
      ok: false,
      error: "GloopNext code assistant failed. Check that Ollama and qwen3.5:4b are running."
    });
  }
});

app.post("/api/browser", async (req, res) => {
  try {
    const input = getInput(req.body);
    const response = await ollamaChat(
      input,
      GLOOPNEXT_SYSTEM_PROMPT + " You are GloopNext's browser-planning assistant. Provide a safe step-by-step plan only. You cannot control a browser, click, sign in, or submit forms. Never claim you performed actions.",
      false
    );
    const data = await response.json();
    const message = data.message?.content || "";
    res.json({ ok: true, message, steps: message ? [message] : [], mode: "plan_only" });
  } catch {
    res.status(500).json({
      ok: false,
      error: "GloopNext browser planner failed. Check Ollama."
    });
  }
});

for (const feature of ["image", "video", "music"]) {
  app.post(`/api/${feature}`, (_req, res) => {
    res.status(501).json({
      ok: false,
      error: `${feature} generation is not included in this local text-model setup.`
    });
  });
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`GloopNext Local AI running at http://127.0.0.1:${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log("Local-only server. It is not exposed to the public internet.");
});
