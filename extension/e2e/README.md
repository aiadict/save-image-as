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
  - The gallery tab exposes `globalThis.__siaTest.saves`: the paths it asked Chrome to save to (Playwright stores downloads under random names). The popup accepts `?tabId=` to scan a given tab, since a test opens the popup as a tab of its own.
  - The manifest gets `host_permissions: ["http://localhost/*"]`. Tests can't click the toolbar or the native menu, so `activeTab` never fires. Without this, in-page source resolution would silently fall back to the plain `srcUrl` and hide srcset bugs.
  - `npm test` (`check:bundle`) proves neither difference reaches `dist/`.
- **Clicks:** Playwright can't open Chrome's native context menu, so `saveViaMenu()` in `fixtures.ts` builds the `OnClickData` Chrome would send and calls `dispatchMenuClick` in the service worker. Everything after the click is the production code path.
- **Fixtures:** a small static server serves `tests/fixtures/` under two host names:
  - `localhost`: the extension has access.
  - `127.0.0.1`: "another site", with no access and no CORS headers. Used to test the blocked-save path.

  `cases.html` holds one `<img>` per case; `gallery.html` is the page the "Save images from this page" tests scan (`gallery.spec.ts`). The images in `tests/fixtures/images/` are drawn by `node e2e/make-fixtures.mjs`.
- **Downloads** go to Playwright's temporary folder, not `~/Downloads`. Saves run in quick mode, set by the `sw` fixture.

## Known failures

None at the moment. Mark a known bug with `test.fail()` and a comment, so the suite stays green and the test flags itself once the bug is fixed.

The first one, AVIF saves silently producing PNG bytes, was found by this suite on 2026-11-08 and fixed in v1.2.0 (see `src/lib/image-core/avif.ts`).
