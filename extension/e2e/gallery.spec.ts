// "Save images from this page": popup scan → gallery tab → bulk save, on
// tests/fixtures/gallery.html (see the comment at its top for the expected list).

import { execFileSync } from "node:child_process";
import { test, expect, extensionId, savedCount, setPrefs, type Sites } from "./fixtures";
import type { BrowserContext, Page, Worker } from "@playwright/test";

/** Opens the fixture page, runs the popup's scan on it, and returns the gallery tab. */
async function openGallery(extContext: BrowserContext, page: Page, sw: Worker, sites: Sites): Promise<Page> {
  await page.goto(`${sites.origin}/gallery.html`);
  await page.waitForLoadState("load");
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, page.url());

  const popup = await extContext.newPage();
  await popup.goto(`chrome-extension://${extensionId(sw)}/popup/index.html?tabId=${tabId}`);
  const galleryOpened = extContext.waitForEvent("page");
  await popup.click("#scanPageBtn");
  const gallery = await galleryOpened;
  await gallery.waitForLoadState();
  await expect(gallery.locator(".tile")).toHaveCount(10);
  return gallery;
}

const tile = (gallery: Page, i: number) => gallery.locator(".tile").nth(i);

/** Paths the gallery asked Chrome to save to (recorded by its E2E hook). */
const requested = (gallery: Page) => gallery.evaluate(() => (globalThis as any).__siaTest.saves as string[]);

/** Downloads that finished after `since` (ms), as absolute paths on disk. */
async function downloadsSince(sw: Worker, since: number, expected: number): Promise<string[]> {
  let paths: string[] = [];
  await expect
    .poll(
      async () => {
        paths = await sw.evaluate(async (since) => {
          const items = await chrome.downloads.search({ state: "complete" });
          return items.filter((d) => new Date(d.startTime).getTime() >= since).map((d) => d.filename);
        }, since);
        return paths.length;
      },
      { timeout: 10_000 }
    )
    .toBe(expected);
  return paths;
}

test.beforeEach(async ({ sw }) => {
  await setPrefs(sw, { defaultFormat: "png", defaultFolder: "SaveImageAs", saveMode: "quick", useDescriptiveFilenames: true });
});

test("scan lists the best source of each image, drops pixels and duplicates", async ({ extContext, page, sw, sites }) => {
  const gallery = await openGallery(extContext, page, sw, sites);
  const host = new URL(sites.origin).host;
  await expect(gallery.locator("h1")).toHaveText(`10 images on ${host}`);
  await expect(tile(gallery, 0)).toHaveAccessibleName("Golden retriever puppy");
  await expect(tile(gallery, 3).locator(".meta")).toContainText("1600 × 1065"); // height estimated from the 320 × 213 shown
  await expect(tile(gallery, 4).locator(".meta")).toContainText("1600 × 1067");
  await expect(tile(gallery, 9).locator(".meta")).toContainText("800 × 533"); // CSS background, sized once loaded

  await gallery.click('#sizeFilter [data-size="1000"]');
  await expect(gallery.locator(".cell:not([hidden])")).toHaveCount(3);
  await gallery.selectOption("#typeFilter", "webp");
  await expect(gallery.locator(".cell:not([hidden])")).toHaveCount(0);
  await expect(gallery.locator("#empty")).toBeVisible();
  await gallery.click('#sizeFilter [data-size="0"]');
  await expect(gallery.locator(".cell:not([hidden])")).toHaveCount(2);
  await gallery.close();
});

test("saves the picked images as PNG into a folder for the site, and counts them", async ({ extContext, page, sw, sites }) => {
  const gallery = await openGallery(extContext, page, sw, sites);
  const before = await savedCount(sw);
  const since = Date.now();

  // Click, shift-click a range, then untick one and add two more: 5 picked.
  await tile(gallery, 0).click();
  await tile(gallery, 3).click({ modifiers: ["Shift"] });
  await tile(gallery, 2).click();
  await tile(gallery, 6).click();
  await tile(gallery, 9).click();
  await expect(gallery.locator("#saveBtn")).toHaveText("Save 5 images");
  const port = new URL(sites.origin).port;
  await expect(gallery.locator("#dest")).toHaveText(`Saves to Downloads/SaveImageAs/localhost-${port}/`);

  await gallery.click("#saveBtn");
  await expect(gallery.locator("#summaryText")).toHaveText("5 images saved.");
  await downloadsSince(sw, since, 5);
  expect((await requested(gallery)).sort()).toEqual(
    ["Golden retriever puppy.png", "logo-transparent.png", "photo-1600.png", "photo-320.png", "photo-800.png"].map(
      (name) => `SaveImageAs/localhost-${port}/${name}`
    )
  );
  expect(await savedCount(sw)).toBe(before + 5);
  await gallery.close();
});

test("a blocked image is explained and offers site access", async ({ extContext, page, sw, sites }) => {
  const gallery = await openGallery(extContext, page, sw, sites);
  await tile(gallery, 2).click();
  await tile(gallery, 7).click(); // the other site
  await gallery.click("#saveBtn");
  await expect(gallery.locator("#summaryText")).toContainText("1 image saved. 1 blocked by the site");
  await expect(tile(gallery, 7)).toHaveAttribute("data-state", "blocked");
  await expect(gallery.locator("#grantBtn")).toBeVisible();
  await gallery.close();
});

test("one .zip holds every picked image", async ({ extContext, page, sw, sites }) => {
  const gallery = await openGallery(extContext, page, sw, sites);
  const before = await savedCount(sw);
  const since = Date.now();
  await gallery.selectOption("#formatSelect", "jpg");
  await gallery.check("#zipToggle");
  for (const i of [0, 2, 4]) await tile(gallery, i).click();
  const port = new URL(sites.origin).port;
  await expect(gallery.locator("#dest")).toHaveText(`Saves one file: Downloads/SaveImageAs/localhost-${port}.zip`);
  await gallery.click("#saveBtn");
  await expect(gallery.locator("#summaryText")).toHaveText("3 images saved in one .zip.");

  const [zip] = await downloadsSince(sw, since, 1);
  expect((await requested(gallery)).at(-1)).toBe(`SaveImageAs/localhost-${port}.zip`);
  execFileSync("unzip", ["-t", zip!]);
  const listing = execFileSync("unzip", ["-Z1", zip!]).toString().trim().split("\n").sort();
  expect(listing).toEqual(["Golden retriever puppy.jpg", "photo-1600.jpg", "photo-320.jpg"]);
  expect(await savedCount(sw)).toBe(before + 3);
  await gallery.close();
});

test("the popup button is off on pages that aren't web pages", async ({ page, sw }) => {
  // Without ?tabId the popup looks at the active tab: itself, an extension page.
  await page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);
  await expect(page.locator("#scanPageBtn")).toBeDisabled();
  await expect(page.locator("#scanPageSub")).toHaveText("Open a web page to use this");
});

test("an expired gallery link says what to do", async ({ page, sw }) => {
  await page.goto(`chrome-extension://${extensionId(sw)}/gallery/index.html#gone`);
  await expect(page.locator("#expired")).toBeVisible();
  await expect(page.locator("#actionBar")).toBeHidden();
});
