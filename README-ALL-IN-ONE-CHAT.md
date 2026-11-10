# ClearChat — All-in-One Chat Update

This update moves the visible tools into one chat interface. The sidebar no longer shows separate Image, Video, Code, Music, or Browser Studio navigation items. The plan usage card remains, and a compact usage strip is also shown above the composer.

## Install
1. Back up your current GitHub repository.
2. Replace `index.html`, `app.js`, and `styles.css` with the files in this ZIP.
3. Upload the included `assets` folder, keeping its folder structure.
4. Do not delete or replace your existing `config.js` or `CNAME`.
5. Commit the changes, wait for GitHub Pages to deploy, then open `clearchat.site` and press Ctrl+F5.

## How chat routing works
ClearChat checks the user's message for clear intent and routes it to:
- normal questions → `/api/chat`
- image requests → `/api/image`
- video requests → `/api/video`
- code requests → `/api/code`
- music requests → `/api/music`
- web research / browsing requests → `/api/browser`

Users can also tap the small Image, Video, Code, Music, and Browse prompt chips to start a request in the same chat.

## Plan limits retained
- Free: 30 images, 10 videos, 10 browser prompts, 50 code generations, 20 songs
- Go: 50 images, 20 videos, 50 browser prompts, 100 code generations, 30 songs
- Plus: 70 images, 50 videos, 70 browser prompts, 150 code generations, 40 songs
- Pro: 100 images, 100 videos, 150 browser prompts, 200 code generations, 100 songs
- Ultra: unlimited for all five tools
- Owner mode: usage checks are bypassed on that browser session

A credit is deducted only after a tool endpoint successfully returns a result. Failed or disconnected providers do not consume a credit. Normal chat messages do not consume tool credits.

## Important provider limitations
The frontend can route all six request types, but the existing starter backend only implements text chat, code generation, and browser action-plan generation. Its image, video, and music endpoints are placeholders until those providers are connected. This update does not magically activate those providers. The browser assistant creates a plan for the user to follow; it does not control the browser. File attachments remain local previews and are not analysed by the starter backend.

## Account and billing note
Current plan selection and usage counters are still browser-local (`localStorage`), not secure server-side entitlements. Do not use this as real paid billing enforcement yet. Before accepting payments or making plans available publicly, add authenticated server-side accounts, quota checks, and payment-provider webhooks. Have a parent/guardian manage API billing and provider accounts.
