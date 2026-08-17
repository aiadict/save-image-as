# Save Image As

A Chrome extension that adds real image format conversion to the right-click menu — save any web image as PNG, JPG, WebP, AVIF or PDF, or set a default format and folder for a genuine one-click save. Everything runs locally in your browser; no uploads, no accounts, no tracking.

- [Privacy policy](docs/privacy-policy.md)

## Features

- Right-click any image → **Save Image As** → PNG / JPG / WebP / AVIF / PDF / original
- Real re-encoding, not just a renamed file — the image is decoded and re-encoded on your device
- Set a default format and folder once; the right-click menu then shows a single one-click **"Save as [format]"** shortcut
- Finds the actual highest-resolution source (checks `srcset`, `<picture>`, and linked full-size originals), not just whatever thumbnail loaded first
- 100% local processing — images are never uploaded or sent to a server
- Minimal permissions, each explained in plain language in the extension's own popup

## Getting started

```bash
cd extension
npm install
npm run build     # or: npm run dev (esbuild watch mode)
```

Then load `extension/dist/` as an unpacked extension via `chrome://extensions` (enable Developer mode → Load unpacked).

**After any code change**, re-run `npm run build` (or keep `npm run dev` running) and click the reload icon on the extension's card in `chrome://extensions` — "Load unpacked" only reads `dist/` once and doesn't watch the folder.

```bash
npm run build     # production bundle
npm run zip        # zip dist/ for Chrome Web Store upload
npm test           # image-core unit tests
npm run typecheck  # tsc --noEmit
```

### Debugging

The background service worker's `console.log`/`console.error` output is the fastest way to see what happened during a save — it's not shown in a page's own DevTools. On the extension's card in `chrome://extensions`, click **"service worker"** to open its console.

## Repo layout

```
extension/          the Chrome extension (Manifest V3, TypeScript, esbuild)
  manifest.json
  src/
    background/       service worker: context menu, pipeline orchestration, chrome.downloads
    popup/             the extension's UI — settings, save mode, rating prompt
    welcome/           first-run onboarding page
    lib/
      image-core/        conversion logic (source detection, decode, encode, PDF export, filenames)
      storage.ts           typed chrome.storage.sync wrapper
      permissions.ts        runtime host-permission strategy
      downloads.ts           chrome.downloads wrapper
  public/icons/       extension icons
docs/                public-facing docs (privacy policy; terms of use to follow)
tests/               unit tests for extension/src/lib/image-core
store-assets/        Chrome Web Store listing assets (icon, screenshots)
```

## Status

Core save/convert flow and real image-source detection are implemented and working. See open issues for what's next.
