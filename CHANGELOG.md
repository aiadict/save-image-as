# Changelog

All notable changes to the Save Image As Chrome extension. Dates are when each version was built/released, not when Chrome Web Store review completed.

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
