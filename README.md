# Save Image As

A Chrome extension that adds real image format conversion to the right-click menu — save any web image as PNG, JPG, WebP, AVIF or PDF, or set a default format and folder for a genuine one-click save. Everything runs locally in your browser; no uploads, no accounts, no tracking.

- [Privacy policy](docs/privacy-policy.md)

## Features

- Right-click any image → **Save Image As** → PNG / JPG / WebP / AVIF / PDF / Compressed / original
- Real re-encoding, not just a renamed file — the image is decoded and re-encoded on your device
- Set a default format and folder once; the right-click menu then shows a single one-click **"Save as [format]"** shortcut
- Finds the actual highest-resolution source (checks `srcset`, `<picture>`, and linked full-size originals), not just whatever thumbnail loaded first
- **Save images from this page:** a gallery of every image on the page (best version of each, duplicates removed), with size and type filters; save the ones you pick in any format, or as one `.zip`
- **Compressed** save targets a size budget (under 1MB or under 200KB) instead of a fixed quality, for email/chat/web use
- Descriptive filenames from the image's alt text when available (e.g. `golden-retriever-puppy.jpg` instead of `IMG_4821.jpg`), on by default
- A visible on-device usage counter in the popup — the privacy claim made concrete, not just asserted
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
npm test           # unit tests + the no-telemetry guard + a check that dist/ has no test hook
npm run e2e        # real saves in Playwright's Chromium (npx playwright install chromium once); see extension/e2e/README.md
npm run typecheck  # tsc --noEmit
```

### Debugging

The background service worker's `console.log`/`console.error` output is the fastest way to see what happened during a save — it's not shown in a page's own DevTools. On the extension's card in `chrome://extensions`, click **"service worker"** to open its console.

## Third-party code

- **[@jsquash/avif](https://github.com/jamsinclair/jSquash)** (Apache-2.0): libavif compiled to WebAssembly, used for AVIF saves because Chrome's canvas can't encode AVIF. Its licence ships as `codecs/LICENSE-jsquash-avif.txt`.

## Repo layout

```
extension/          the Chrome extension (Manifest V3, TypeScript, esbuild)
  manifest.json
  src/
    background/       service worker: context menu, pipeline orchestration, chrome.downloads
    popup/             the extension's UI — settings, save mode, rating prompt
    welcome/           first-run onboarding page
    gallery/           "Save images from this page" tab: pick, convert and save many images
    lib/
      image-core/        conversion logic (source detection, decode, encode, size-budget search, PDF export, filenames)
      storage.ts           typed chrome.storage.sync wrapper (preferences)
      stats.ts               typed chrome.storage.local wrapper (Trust ledger usage counter)
      permissions.ts        runtime host-permission strategy
      downloads.ts           chrome.downloads wrapper
      save-pipeline.ts       fetch + convert + name, shared by right-click saves and the gallery
      scan-in-page.ts, page-images.ts   page scan and ranking for the gallery
      zip.ts                 store-only ZIP writer
  public/icons/       extension icons
  scripts/            build-time checks (e.g. check-no-telemetry.mjs — see docs/architecture.md "Trust ledger")
docs/                public-facing docs (privacy policy; terms of use to follow)
tests/               unit tests for extension/src/lib/image-core
store-assets/        Chrome Web Store listing assets (icon, screenshots)
```

## Status

Core save/convert flow and real image-source detection are implemented and working. See open issues for what's next.
