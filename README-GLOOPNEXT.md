# GloopNext — All-in-One Workspace

## Install
1. Back up your GitHub repository.
2. Upload/replace `index.html`, `app.js`, and `styles.css` in the repository root.
3. Upload `config.js` to the repository root (it points to the deployed Render backend).
4. Upload the complete `assets` folder, preserving its structure.
5. Keep your existing `CNAME` file unchanged.
6. Commit the changes and wait for GitHub Pages to deploy. Then open `https://gloopnext.com` and press Ctrl+F5.

## Backend connection
`config.js` sets `API_BASE_URL` to `https://gloopnext-backend.onrender.com`. The frontend sends normal chat to `/api/chat`, code to `/api/code`, and browser action-plan requests to `/api/browser`.

The OpenAI secret key must remain in Render Environment Variables as `OPENAI_API_KEY`; never put it in this repository or `config.js`.

## Provider limitations
The current starter backend supports text chat, code generation, and browser action-plan generation. Image, video, and music endpoints are still placeholders until separate generation providers are connected. Browser requests return suggested steps and do not control the browser. File attachments are not yet uploaded or analysed by the backend.

## If chat still fails
- Open `https://gloopnext-backend.onrender.com/health`; it should return `{"ok":true,...}`.
- In Render, confirm `OPENAI_API_KEY` exists and is valid, and that the service is live.
- In Render, set `FRONTEND_ORIGIN` to `https://gloopnext.com` (if the backend uses this environment variable), then redeploy.
- If the browser console reports a CORS error, the backend's CORS allow-list must include `https://gloopnext.com` and `https://www.gloopnext.com`.
- Check Render Logs for API errors. API usage requires separate API billing/credits; a ChatGPT subscription does not include API usage.

## Important
Plan counters are still browser-local previews, not secure server-side quotas or payment entitlements. Have a parent/guardian manage API billing and provider accounts.
