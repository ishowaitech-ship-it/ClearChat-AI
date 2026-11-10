GLOOPNEXT - STREAMING CHAT UPDATE

Files
- app.js: updated frontend. Keeps the existing workspace features and adds live streaming, a blinking cursor, and Stop support for normal AI chat.
- server.js: updated Express backend. Streams OpenAI Responses API text to the browser using Server-Sent Events.

INSTALL / DEPLOY
1. Replace the current frontend app.js with this updated app.js.
2. Replace the backend server.js with this updated server.js.
3. Keep your existing config.js API_BASE_URL pointing at your backend URL.
4. In the backend hosting environment, keep OPENAI_API_KEY as a private environment variable. Do not put it in config.js or app.js.
5. Keep OPENAI_MODEL set to a model available to your API account, or use the default gpt-4.1-mini.
6. Redeploy the backend and frontend.
7. Test https://YOUR-BACKEND-DOMAIN/health. It should return JSON with streaming: true.

DEPENDENCIES
This server expects the existing Node project dependencies: express, cors, helmet, express-rate-limit, and openai. Do not remove your existing package.json or lockfile.

IMPORTANT BILLING NOTE
Writing or editing this source code does not itself create OpenAI API usage charges. Running the deployed AI chat does: the backend sends each prompt to the OpenAI API, which is billed separately from a ChatGPT subscription. Keep the API key private and have a parent/guardian manage any billing settings.

FREE-OF-API-BILLING OPTION
A local open model can run on your own computer using software such as Ollama. That can avoid per-request OpenAI API charges, but it uses your computer's RAM/CPU/GPU and electricity. The hosted Render backend cannot access Ollama running on your personal PC; the app would need to connect to a local backend on that same PC, or you would need another appropriately hosted model service. This update does not silently switch providers.

BEHAVIOUR
- Shows Thinking… while the model is starting.
- Streams generated text as chunks arrive.
- Shows a blinking cursor during generation.
- Stop cancels the browser request and asks the backend to stop the stream.
- The UI does not expose private chain-of-thought. Progress labels are simple status indicators, not a display of internal reasoning.
