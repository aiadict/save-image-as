# Fixture test plan for image source detection

Per `docs/architecture.md` "Phase 2 source detection" — this is the actual technical moat, not boilerplate. Two tiers of testing apply here, not one:

1. **Pure parsing/ranking logic** — no DOM needed, already unit-tested with plain Vitest: `extension/src/lib/image-core/srcset.test.ts` (16 passing) covers `srcset` width/density-descriptor parsing, relative-URL resolution, and width-based ranking. `filename.test.ts` and `pdf.test.ts` cover their respective pure logic.
2. **Real-DOM/browser cases below** — these need an actual page + `chrome.scripting.executeScript` (or at minimum jsdom) to exercise `background/resolve-in-page.ts` end-to-end. **Not yet set up** — candidate approach is Playwright driving the built `dist/` extension against local HTML fixtures, which is a bigger lift than the Vitest suite and hasn't been started.

## Cases (from the deep-research report + competitive analysis)

- [x] Plain `<img src>` — JPG/PNG/WebP/AVIF — covered by the Phase 1 pipeline (`info.srcUrl` used directly when no better candidate is found); exercised manually, not yet an automated fixture
- [x] `srcset` with multiple resolution candidates — implemented and unit-tested at the parsing/ranking level (`srcset.test.ts`); the full in-page resolver (`resolve-in-page.ts`) duplicates this logic and is not yet independently tested — needs the browser-fixture harness above
- [x] `<picture><source>` with multiple `<source>` candidates — implemented in `resolve-in-page.ts`, same testing gap as above
- [x] Thumbnail `<img>` wrapped in `<a href>` pointing at the full-size original — implemented via `info.linkUrl` + an image-extension heuristic, same testing gap. **Bug found and fixed 2026-08-17**: on Google Images, the thumbnail's wrapping link is `/imgres?...&imgurl=https://real-site.com/photo.jpg?token=...&...` — a *viewer* page, not the image. The original heuristic tested the whole URL string for an image extension near a `?`/`#`/end boundary, so the *embedded* `imgurl` param's `...jpg?token=...` substring false-positived, and the extension tried to fetch/save Google's HTML viewer page instead of the real photo. Fixed by anchoring the check to `new URL(url).pathname` only (`isLikelyImageUrl` in `srcset.ts`, regression-tested in `srcset.test.ts`) — any redirect/viewer URL that embeds a real image URL as a query parameter is now correctly rejected, not just Google's.
- [x] `data:` URI image — works via plain `fetch()`, no special-casing needed
- [x] `blob:` URL image — implemented: read in-page (same document, so the blob URL is still valid) and passed to the background as base64 bytes; not yet fixture-tested
- [x] Duplicate responsive variants that should collapse to one candidate — inherent by construction (the resolver always returns exactly one best candidate)
- [ ] Plain `<img src>` — SVG (should already work via the generic pipeline — createImageBitmap can rasterize SVG — but unverified)
- [ ] Transparent PNG → JPG (alpha flattening implemented in `encode.ts`, not yet fixture-tested)
- [ ] Lazy-loaded image (`data-src`, `loading="lazy"`, placeholder swapped in after load) — not implemented; the resolver only matches elements whose `currentSrc`/`src` already equals `info.srcUrl`, so a not-yet-loaded lazy image would fall through to the plain-`srcUrl` fallback
- [ ] CSS `background-image` — deliberately deferred, see architecture doc ("Deliberately not handled")
- [ ] Video poster — deliberately deferred (no `contexts: ["video"]` menu item yet)
- [ ] Cross-origin image where a direct fetch is blocked (must trigger the permission-fallback path, not silently fail) — implemented in `background/index.ts`, not yet fixture-tested
- [ ] Very large image (near/above the encode size cap — must degrade with a specific message, not crash) — implemented (`MAX_DIMENSION` in `encode.ts`), not yet fixture-tested
- [x] Bad/mismatched MIME type (server says one thing, bytes say another) — pure logic unit-tested (`decode.test.ts`, `looksLikeNonImageResponse`). **Bug found and fixed 2026-08-16**: a real `.webp` server sent `Content-Type: application/octet-stream` and the original strict "must start with `image/`" check rejected an otherwise-valid save. Real-world servers routinely send generic/missing content types for legitimate images, so the check was rewritten as a blocklist (reject only `text/html`/`application/json`/`text/plain`/xml — signs we fetched an error/login page instead) rather than an `image/*` allowlist; `createImageBitmap` remains the real, authoritative validator.
- [ ] Misleading filename extension (e.g. `.jpg` URL that's actually a PNG) — filename generation doesn't inspect content, so this should just work, but unverified

## Gate

A release does not ship until every fixture above passes. New source-pattern bugs found in production get a new fixture added before the fix is considered done (regression-proofing, matches the research doc's "treat site compatibility as an engineering discipline" recommendation).
