// End-to-end saves through the real pipeline: in-page source resolution,
// fetch, decode/encode, chrome.downloads. Each test fakes the context-menu
// click (Playwright can't open Chrome's native menu) and checks the saved
// bytes via the background's E2E hook plus the downloads API.

import { test, expect, saveViaMenu, setPrefs, getSyncPrefs, savedCount, type SaveResult } from "./fixtures";

const SUBMENU = "save-image-as-submenu";
const QUICK = "save-image-as-quick-save";
const COMPRESSED = "save-image-as-compressed";

// First bytes of each output format, as lowercase hex.
const MAGIC = {
  png: "89504e47",
  jpg: "ffd8ff",
  webpRiff: "52494646",
  webpTag: "57454250", // "WEBP" at bytes 8-11
  avifFtyp: "66747970", // "ftyp" at bytes 4-7
  pdf: "25504446", // "%PDF"
};

function expectCompleted(result: SaveResult) {
  expect(result.lastSave, "a save was attempted").not.toBeNull();
  expect(result.download?.state).toBe("complete");
}

test.beforeEach(async ({ page, sw, sites }) => {
  await setPrefs(sw, {
    defaultFormat: "png",
    defaultFolder: "SaveImageAs",
    useDescriptiveFilenames: true,
    sizeBudget: "chat",
    lastSaveBlockedByPermission: false,
    lastBlockedOrigin: "",
  });
  await page.goto(`${sites.origin}/cases.html`);
  // The blob: image is assigned by a script after load.
  await page.waitForFunction(() => (document.getElementById("blob") as HTMLImageElement).complete && (document.getElementById("blob") as HTMLImageElement).src.startsWith("blob:"));
});

test.describe("formats", () => {
  test("WebP → PNG, named from alt text", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "webp", `${SUBMENU}-png`);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.png)).toBe(true);
    expect(r.lastSave!.filename).toBe("Golden retriever puppy.png");
    expect(r.lastSave!.width).toBe(800);
  });

  test("transparent PNG → JPG", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "png", `${SUBMENU}-jpg`);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.jpg)).toBe(true);
    expect(r.lastSave!.filename).toBe("logo-transparent.jpg");
  });

  test("JPG → WebP", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "jpg", `${SUBMENU}-webp`);
    expectCompleted(r);
    expect(r.lastSave!.head.slice(0, 8)).toBe(MAGIC.webpRiff);
    expect(r.lastSave!.head.slice(16, 24)).toBe(MAGIC.webpTag);
  });

  // Chrome's canvas can't encode AVIF (it silently returns PNG), so these go
  // through the bundled libavif encoder — see image-core/avif.ts.
  test("JPG → AVIF", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "jpg", `${SUBMENU}-avif`);
    expectCompleted(r);
    expect(r.lastSave!.head.slice(8, 16)).toBe(MAGIC.avifFtyp);
    expect(r.lastSave!.head.slice(16, 24)).toBe("61766966"); // "avif" brand
    expect(r.lastSave!.mime).toBe("image/avif");
    expect(r.lastSave!.filename).toBe("photo-320.avif");
  });

  test("large photo → AVIF in reasonable time", async ({ page, sw }) => {
    const started = Date.now();
    const r = await saveViaMenu(page, sw, "srcset-w", `${SUBMENU}-avif`);
    expectCompleted(r);
    expect(r.lastSave!.width).toBe(1600);
    expect(r.lastSave!.head.slice(16, 24)).toBe("61766966");
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("transparent PNG → AVIF", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "png", `${SUBMENU}-avif`);
    expectCompleted(r);
    expect(r.lastSave!.head.slice(16, 24)).toBe("61766966");
  });

  test("JPG → PDF", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "jpg", `${SUBMENU}-pdf`);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.pdf)).toBe(true);
    expect(r.lastSave!.filename).toBe("photo-320.pdf");
  });

  test("Save original keeps the bytes and the extension", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "jpg", `${SUBMENU}-original`);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.jpg)).toBe(true);
    expect(r.lastSave!.filename).toBe("photo-320.jpg");
  });

  test("Compressed fits the 200 KB budget as WebP", async ({ page, sw }) => {
    await setPrefs(sw, { sizeBudget: "web" });
    const r = await saveViaMenu(page, sw, "srcset-w", COMPRESSED);
    expectCompleted(r);
    expect(r.lastSave!.head.slice(16, 24)).toBe(MAGIC.webpTag);
    expect(r.lastSave!.size).toBeLessThanOrEqual(200 * 1024);
  });
});

test.describe("finds the largest source", () => {
  for (const id of ["srcset-w", "srcset-x", "picture", "linked"]) {
    test(`${id} → the 1600px original`, async ({ page, sw }) => {
      const r = await saveViaMenu(page, sw, id, `${SUBMENU}-png`);
      expectCompleted(r);
      expect(r.lastSave!.width).toBe(1600);
      expect(r.lastSave!.filename).toBe("photo-1600.png");
    });
  }
});

test.describe("unusual sources", () => {
  test("data: URL", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "data", `${SUBMENU}-jpg`);
    expectCompleted(r);
    expect(r.lastSave!.filename).toBe("image.jpg");
    expect(r.lastSave!.width).toBe(4);
  });

  test("blob: URL is read in the page", async ({ page, sw }) => {
    const r = await saveViaMenu(page, sw, "blob", `${SUBMENU}-png`);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.png)).toBe(true);
    expect(r.lastSave!.width).toBe(800);
  });

  test("another site without access: no save, popup banner flag set", async ({ page, sw, sites }) => {
    const before = await savedCount(sw);
    const r = await saveViaMenu(page, sw, "cross-origin", `${SUBMENU}-png`);
    expect(r.lastSave).toBeNull();
    const prefs = await getSyncPrefs(sw);
    expect(prefs.lastSaveBlockedByPermission).toBe(true);
    expect(prefs.lastBlockedOrigin).toBe(sites.otherOrigin);
    expect(await savedCount(sw)).toBe(before);
  });
});

test.describe("preferences", () => {
  test("quick save uses the default format and folder", async ({ page, sw }) => {
    await setPrefs(sw, { defaultFormat: "jpg", defaultFolder: "E2E Folder" });
    const r = await saveViaMenu(page, sw, "webp", QUICK);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.jpg)).toBe(true);
    expect(r.lastSave!.filename).toBe("E2E Folder/Golden retriever puppy.jpg");
  });

  test("quick save with Original keeps the file as-is in the folder", async ({ page, sw }) => {
    await setPrefs(sw, { defaultFormat: "original", defaultFolder: "Originals" });
    const r = await saveViaMenu(page, sw, "jpg", QUICK);
    expectCompleted(r);
    expect(r.lastSave!.head.startsWith(MAGIC.jpg)).toBe(true);
    expect(r.lastSave!.filename).toBe("Originals/photo-320.jpg");
  });

  test("descriptive filenames off → URL basename", async ({ page, sw }) => {
    await setPrefs(sw, { useDescriptiveFilenames: false });
    const r = await saveViaMenu(page, sw, "webp", `${SUBMENU}-png`);
    expectCompleted(r);
    expect(r.lastSave!.filename).toBe("photo-800.png");
  });

  test("a successful save adds exactly one to the on-device count", async ({ page, sw }) => {
    const before = await savedCount(sw);
    expectCompleted(await saveViaMenu(page, sw, "jpg", `${SUBMENU}-png`));
    await expect.poll(() => savedCount(sw)).toBe(before + 1);
  });
});
