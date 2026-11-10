# GloopNext Website

This folder contains the complete GloopNext landing-page frontend:

- `index.html` — page structure
- `styles.css` — responsive purple/blue styling
- `app.js` — small page interaction (copyright year)
- `assets/gloopnext-logo.png` — transparent-background logo PNG

## Upload to GitHub Pages

1. Extract this package.
2. Upload the contents of the `GloopNext-All-in-One` folder into the root of your GitHub repository.
3. Keep the `assets` folder intact; the logo is loaded from `assets/gloopnext-logo.png`.
4. In repository Settings → Pages, publish from branch `main`, folder `/(root)`.

If you already have a `CNAME` file for a domain you own and want to keep, preserve it in the repository root. Preserve your existing `config.js` too if your app uses it; this starter page does not connect to a backend yet.

## Important

This is the branded website frontend only. AI chat, accounts, secure subscriptions, image/video/music generation, file uploads and real browser automation need backend services and integrations. Do not put API keys in these frontend files or in a public GitHub repository.
