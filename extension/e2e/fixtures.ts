// Shared Playwright fixtures: the e2e build of the extension loaded into
// Chromium, its service worker, and a static server for tests/fixtures/.
// See e2e/README.md.

import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_DIR = fileURLToPath(new URL("../dist-e2e", import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL("../../tests/fixtures", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface Sites {
  /** The fixture site; the e2e build has host permission for it. */
  origin: string;
  /** Same server under another host name: no permission, no CORS headers. */
  otherOrigin: string;
}

/** What the background's E2E hook records just before a download starts. */
export interface LastSave {
  filename: string;
  mime: string;
  size: number;
  head: string;
  width?: number;
  height?: number;
}

export interface SaveResult {
  lastSave: LastSave | null;
  download: { state: string; filename: string; mime: string } | null;
}

interface WorkerFixtures {
  sites: Sites;
  extContext: BrowserContext;
  sw: Worker;
}

function startServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    let port = 0;
    const server = createServer(async (req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
      try {
        let body: Buffer | string = await readFile(join(FIXTURES_DIR, path));
        const type = MIME[extname(path)] ?? "application/octet-stream";
        if (type.startsWith("text/html")) {
          body = body.toString("utf8").replaceAll("{{OTHER_ORIGIN}}", `http://127.0.0.1:${port}`);
        }
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    // No host: listens on both IPv4 and IPv6, so localhost and 127.0.0.1 both reach it.
    server.listen(0, () => {
      const address = server.address();
      port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

export const test = base.extend<{ page: Page }, WorkerFixtures>({
  sites: [
    async ({}, use) => {
      const { server, port } = await startServer();
      await use({ origin: `http://localhost:${port}`, otherOrigin: `http://127.0.0.1:${port}` });
      server.close();
    },
    { scope: "worker" },
  ],

  extContext: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        headless: true,
        args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
      });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],

  sw: [
    async ({ extContext }, use) => {
      let [worker] = extContext.serviceWorkers();
      if (!worker) worker = await extContext.waitForEvent("serviceworker");
      // Quick-save mode: "Ask where" would open a native save dialog per test.
      await worker.evaluate(() => chrome.storage.sync.set({ saveMode: "quick" }));
      await use(worker);
    },
    { scope: "worker" },
  ],

  page: async ({ extContext }, use) => {
    const page = await extContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };

export function extensionId(sw: Worker): string {
  return new URL(sw.url()).host;
}

/**
 * Simulates choosing a context-menu item on the image with the given id:
 * builds the same OnClickData Chrome would send and calls the background's
 * real click handler, then waits for the resulting download to finish.
 */
export async function saveViaMenu(page: Page, sw: Worker, imageId: string, menuItemId: string): Promise<SaveResult> {
  const { srcUrl, linkUrl } = await page.evaluate((id) => {
    const img = document.getElementById(id) as HTMLImageElement;
    return { srcUrl: img.currentSrc || img.src, linkUrl: img.closest("a")?.href ?? null };
  }, imageId);

  return sw.evaluate(
    async ({ srcUrl, linkUrl, pageUrl, menuItemId }) => {
      const hook = (globalThis as any).__siaTest;
      hook.lastSave = null;
      const [tab] = await chrome.tabs.query({ url: pageUrl });
      if (!tab?.id) throw new Error(`no tab for ${pageUrl}`);
      const before = await chrome.downloads.search({});
      const info = {
        menuItemId,
        srcUrl,
        pageUrl,
        frameId: 0,
        editable: false,
        mediaType: "image",
        ...(linkUrl ? { linkUrl } : {}),
      };
      await hook.dispatchMenuClick(info, tab);

      if (!hook.lastSave) return { lastSave: null, download: null };
      const seen = new Set(before.map((d: chrome.downloads.DownloadItem) => d.id));
      for (let i = 0; i < 100; i++) {
        const items = await chrome.downloads.search({});
        const item = items.find((d: chrome.downloads.DownloadItem) => !seen.has(d.id));
        if (item && item.state !== "in_progress") {
          return { lastSave: hook.lastSave, download: { state: item.state, filename: item.filename, mime: item.mime } };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return { lastSave: hook.lastSave, download: null };
    },
    { srcUrl, linkUrl, pageUrl: page.url(), menuItemId }
  );
}

export async function setPrefs(sw: Worker, patch: Record<string, unknown>): Promise<void> {
  await sw.evaluate((p) => chrome.storage.sync.set(p), patch);
}

export async function getSyncPrefs(sw: Worker): Promise<Record<string, unknown>> {
  return sw.evaluate(() => chrome.storage.sync.get(null));
}

export async function savedCount(sw: Worker): Promise<number> {
  return sw.evaluate(async () => (await chrome.storage.local.get({ imagesSavedCount: 0 })).imagesSavedCount as number);
}
