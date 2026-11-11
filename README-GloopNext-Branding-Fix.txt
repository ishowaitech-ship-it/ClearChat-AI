GLOOPNEXT BRANDING + HIDDEN THINKING FIX

Why the terminal test showed "Qwen3.5":
- `ollama run qwen3.5:4b` is a direct model test, not the GloopNext app.
- The terminal is showing the model's own raw identity and optional thinking output.
- Website users should talk to GloopNext through this backend instead.

Install:
1. Stop the old local backend if it is running (Ctrl+C in its terminal).
2. Replace the old local-server.js in your local backend project with this file.
3. Make sure that backend project has these dependencies:
   npm install express cors helmet express-rate-limit
4. Start it using START-GloopNext-Local-AI.bat (or `node local-server.js`).
5. Check http://127.0.0.1:3001/health
6. In the GloopNext frontend config.js set API_BASE_URL to http://127.0.0.1:3001.
   Keep your existing Supabase settings if you use them.

This backend:
- Defaults to your installed qwen3.5:4b model.
- Sends a GloopNext system identity to the model.
- Requests `think: false` from Ollama.
- Sends only `message.content` to the website, never the separate `message.thinking` field.
- Keeps the backend bound to 127.0.0.1 only.

Note: the model can still identify itself as Qwen if you directly use `ollama run` in PowerShell.
That direct terminal session is only for testing. The GloopNext website uses the GloopNext identity prompt.
