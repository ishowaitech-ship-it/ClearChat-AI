const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const allowedOrigins = new Set([
  "https://gloopnext.com",
  "https://www.gloopnext.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Backend is missing OPENAI_API_KEY.");
    error.status = 503;
    throw error;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getInput(body) {
  const input = body && (body.input || body.message || body.prompt);
  if ((typeof input === "string" && input.trim()) || (Array.isArray(input) && input.length)) {
    return typeof input === "string" ? input.trim() : input;
  }
  const error = new Error("Please provide a message, prompt, or input.");
  error.status = 400;
  throw error;
}

function sendEvent(res, data) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "GloopNext backend", streaming: true });
});

// Chat streams text as soon as the model produces it. The status messages in
// the frontend describe progress; they are not a transcript of private reasoning.
app.post("/api/chat", async (req, res) => {
  let input;
  let client;
  try {
    input = getInput(req.body);
    client = getClient();
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: error.message });
  }

  const controller = new AbortController();
  let clientDisconnected = false;
  req.on("aborted", () => { clientDisconnected = true; controller.abort(); });
  res.on("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
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
    const stream = await client.responses.create({
      model: MODEL,
      input,
      stream: true
    }, { signal: controller.signal });

    for await (const event of stream) {
      if (controller.signal.aborted || clientDisconnected) break;
      if (event.type === "response.output_text.delta" && event.delta) {
        sendEvent(res, { type: "delta", text: event.delta });
      } else if (event.type === "response.completed") {
        // The final done event is sent after the stream loop.
      } else if (event.type === "response.failed") {
        throw new Error(event.response?.error?.message || "The AI response failed.");
      } else if (event.type === "error") {
        throw new Error(event.message || "The AI stream returned an error.");
      }
    }
    if (!clientDisconnected && !res.writableEnded) {
      sendEvent(res, { type: "done" });
      res.end();
    }
  } catch (error) {
    if (!controller.signal.aborted && !clientDisconnected) {
      console.error("Chat streaming error:", error.message);
      sendEvent(res, { type: "error", error: "AI request failed. Check backend logs and API configuration." });
      res.end();
    }
  }
});

app.post("/api/code", async (req, res) => {
  try {
    const response = await getClient().responses.create({
      model: MODEL,
      instructions: "You are GloopNext's coding assistant. Provide accurate, readable code, explain assumptions and setup, and never claim code was tested unless it actually was.",
      input: getInput(req.body)
    });
    res.json({ ok: true, text: response.output_text || "", response_id: response.id });
  } catch (error) {
    console.error("Code error:", error.message);
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Code request failed. Check backend logs and API configuration."
    });
  }
});

app.post("/api/browser", async (req, res) => {
  try {
    const response = await getClient().responses.create({
      model: MODEL,
      instructions: "You are GloopNext's browser-planning assistant. Provide a safe step-by-step plan. You cannot actually control a browser, click, sign in, or submit forms. Never claim to have performed actions.",
      input: getInput(req.body)
    });
    res.json({ ok: true, text: response.output_text || "", response_id: response.id, mode: "plan_only" });
  } catch (error) {
    console.error("Browser planning error:", error.message);
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Browser-planning request failed."
    });
  }
});

// Media generation is not connected in this starter package.
for (const feature of ["image", "video", "music"]) {
  app.post(`/api/${feature}`, (_req, res) => {
    res.status(501).json({ ok: false, error: `${feature} generation provider is not connected yet.` });
  });
}

app.listen(PORT, () => {
  console.log(`GloopNext backend listening on port ${PORT}`);
  console.log(`Chat model: ${MODEL} (streaming enabled)`);
});
