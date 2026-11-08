# Changelog

All notable changes to the Save Image As Chrome extension. Dates are when each version was built/released, not when Chrome Web Store review completed.

## Unreleased (v1.2.0)

**Changed:**
- **New look.** A clean, lighter popup in the same family as Notes AI:
  - Format tiles instead of a dropdown.
  - A live preview of what your right-click menu will say.
  - The on-device save count shown as a card.
  - Settings grouped under "More options".
  - A neutral graphite dark mode that follows your system, replacing the old teal-black.
  - The Geist font is bundled (SIL OFL); the icon is the same glyph in the new teal.
- **A welcome tab that completes itself.** It ticks off pinning (detected automatically), choosing a format, and a first save of the bundled sample photo, then shows a "First image saved" card.
- **Feedback on the toolbar icon:** ✓ for a moment after each save; "!" after a failed save, until you open the popup.
- **Fewer, better-timed asks:**
  - The rating row appears only after 3 successful saves. It has a "Not now" button and asks again at most once.
  - One-time milestone cards (10, 100, 500… saves) with a share link.
  - A one-time "What's new" card after updating.
- **Share button** in the popup copies the website link.
- **Optional uninstall feedback page.** Low ratings now also see a link to review publicly on the Chrome Web Store.
- **Readable everywhere:** every text colour now meets WCAG AA (4.5:1) in both themes, checked by `npm test`. The old dark-mode buttons were 1.9:1.
- **Keyboard:** the format tiles and every segmented control are real radio groups with arrow-key support.
- **Right-click menu: every format is one menu closer.** Chrome was folding our two top-level items under an extra "Save Image As" level, so formats were three menus deep. Now there's a single "Save Image As" item with the one-click save at the top, then the formats, Compressed and Original file.
- **New "One-click only" menu style** (popup → Advanced → Right-click menu): the save item sits directly in Chrome's right-click menu. Right-click, click, done.
- **"Original" can now be the one-click default** ("Save original → folder/"). Before, choosing it removed the one-click item.

**Fixed:**
- **"Save as AVIF" now produces real AVIF files.** Chrome's canvas has no AVIF encoder: asked for AVIF, it silently returned PNG, so every AVIF save since v1.0.0 was a PNG with a `.avif` name. Found by the new end-to-end tests.
  - AVIF now uses libavif compiled to WebAssembly (`@jsquash/avif`, the codec behind Squoosh). It ships inside the extension and loads on the first AVIF save only.
  - Transparency is kept. A 1600×1067 photo takes about a second.
  - Needs `'wasm-unsafe-eval'` in the extension's content security policy. No new permissions.
  - Any format the browser can't really encode now fails with a clear message instead of saving the wrong format.

## v1.1.0 — 2026-09-17

**New features**, chosen from a customer-research pass on what would make users choose this extension over a defunct, trust-damaged competitor:

- **Trust ledger** — the popup now shows a concrete, on-device usage line (e.g. "128 images saved on this device — none ever uploaded") instead of just an abstract privacy claim. Backed by a CI check (`scripts/check-no-telemetry.mjs`) that fails the build if any network call other than fetching the image being saved is ever added.
- **Descriptive filenames** — on by default. Converted files are now named from the source image's alt text when available (e.g. `golden-retriever-puppy.jpg` instead of `IMG_4821.jpg`), falling back to the original filename exactly as before when there's no alt text.
- **Compressed save** — a new "Compressed" item in the right-click menu targets a size budget (under 1MB for chat/email, or under 200KB for the web) instead of a fixed quality, always outputting WebP. If the target can't be hit even at the lowest acceptable quality, the save still completes and a notification reports the true result honestly.

No new manifest permissions required for any of the above. 57 unit tests (12 new), verified live in a loaded Chrome instance.

## v1.0.2 — 2026-08-19

Listing-only localization for all 52 Chrome Web Store–supported locales — **not a functional or UI change**, so not really a "what's new" for existing users, but noted here for completeness. `appName`/short description auto-apply via the manifest's `__MSG_` substitution; the detailed description is a per-locale manual paste into the Developer Dashboard (source of truth: `store-assets/cws-listing-translations.txt`).

## v1.0.1 — 2026-08-19

Extension went live on the Chrome Web Store. Fixed the popup's 4–5 star rating flow to link to the real, now-published CWS reviews page instead of a placeholder URL.

## v1.0.0 — 2026-08-18

Initial public release.

- Right-click any image → save as PNG / JPG / WebP / AVIF / PDF, or the original file as-is
- Real re-encoding (decode + re-encode on-device), not a renamed file
- One-click default format + folder, configurable in the popup
- Real image-source detection — checks `srcset`, `<picture>`, and linked full-size originals, and saves the highest-resolution version actually available instead of whatever thumbnail loaded first
- Single-popup settings UI with proper dark-mode support
- Reactive permission banner — the "Allow on all sites" ask only surfaces to someone who just hit a permission-blocked save, not to everyone by default
- 100% local processing, minimal permissions, no accounts, no ads, no tracking
