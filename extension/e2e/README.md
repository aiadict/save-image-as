# End-to-end tests

Real saves through the real extension, in Playwright's Chromium.

```bash
npx playwright install chromium   # once
npm run e2e                       # builds dist-e2e/, then runs the suite (~15 s)
```

## How it works

- **Build:** `node build.mjs --e2e` writes `dist-e2e/`. That build differs from `dist/` in two ways:
  - `__E2E__` is true, which exposes `globalThis.__siaTest` in the service worker:
    - `dispatchMenuClick(info, tab)`: the same function the real context-menu listener calls.
    - `lastSave`: filename, MIME, size, first 16 bytes and dimensions, recorded just before the download starts.
    - `lastMenuSpec`: the menu as last built.
  - The manifest gets `host_permissions: ["http://localhost/*"]`. Tests can't click the toolbar or the native menu, so `activeTab` never fires. Without this, in-page source resolution would silently fall back to the plain `srcUrl` and hide srcset bugs.
  - `npm test` (`check:bundle`) proves neither difference reaches `dist/`.
- **Clicks:** Playwright can't open Chrome's native context menu, so `saveViaMenu()` in `fixtures.ts` builds the `OnClickData` Chrome would send and calls `dispatchMenuClick` in the service worker. Everything after the click is the production code path.
- **Fixtures:** a small static server serves `tests/fixtures/` under two host names:
  - `localhost`: the extension has access.
  - `127.0.0.1`: "another site", with no access and no CORS headers. Used to test the blocked-save path.

  `cases.html` holds one `<img>` per case. The images in `tests/fixtures/images/` are drawn by `node e2e/make-fixtures.mjs`.
- **Downloads** go to Playwright's temporary folder, not `~/Downloads`. Saves run in quick mode, set by the `sw` fixture.

## Known failures

Marked with `test.fail()`, so the suite stays green and the test flags itself once the bug is fixed:

- **JPG → AVIF:** Chrome's canvas can't encode AVIF. `convertToBlob({ type: "image/avif" })` returns a PNG, so AVIF saves are PNG bytes with a `.avif` name. Found by this suite on 2026-11-08.
