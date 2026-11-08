// Popup smoke test: each control writes the right preference and the
// right-click menu is rebuilt from it. Opens the popup page as a normal tab.

import { test, expect, extensionId, setPrefs, getSyncPrefs } from "./fixtures";
import type { Worker } from "@playwright/test";

async function menuSpec(sw: Worker): Promise<{ id: string; title: string }[]> {
  return sw.evaluate(() => (globalThis as any).__siaTest.lastMenuSpec);
}

test.beforeEach(async ({ sw }) => {
  await setPrefs(sw, {
    saveMode: "ask",
    defaultFormat: "png",
    defaultFolder: "SaveImageAs",
    jpgQuality: 0.92,
    useDescriptiveFilenames: true,
    sizeBudget: "chat",
    lastSaveBlockedByPermission: false,
    lastBlockedOrigin: "",
  });
});

test.afterAll(async ({ sw }) => {
  // The save tests run in quick mode.
  await setPrefs(sw, { saveMode: "quick" });
});

test("controls write preferences and rebuild the menu", async ({ page, sw }) => {
  await page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);

  await page.click('#saveModeSeg button[data-mode="quick"]');
  await expect.poll(async () => (await getSyncPrefs(sw)).saveMode).toBe("quick");

  await page.selectOption("#defaultFormat", "jpg");
  await page.fill("#defaultFolder", "Pictures");
  await page.locator("#defaultFolder").blur();
  await expect.poll(async () => (await menuSpec(sw))[0]?.title).toBe("Save as JPG → Pictures/");

  await page.click("#advToggle");
  await expect(page.locator("#advPanel")).toBeVisible();

  await page.locator("#jpgQuality").fill("0.75");
  await expect.poll(async () => (await getSyncPrefs(sw)).jpgQuality).toBe(0.75);

  await page.uncheck("#useDescriptiveFilenames");
  await expect.poll(async () => (await getSyncPrefs(sw)).useDescriptiveFilenames).toBe(false);

  await page.click('#sizeBudgetSeg button[data-budget="web"]');
  await expect
    .poll(async () => (await menuSpec(sw)).find((e) => e.id === "save-image-as-compressed")?.title)
    .toBe("Compressed (WebP, under 200KB)");
});

test("an empty folder falls back to SaveImageAs", async ({ page, sw }) => {
  await page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);
  await page.fill("#defaultFolder", "   ");
  await page.locator("#defaultFolder").blur();
  await expect.poll(async () => (await getSyncPrefs(sw)).defaultFolder).toBe("SaveImageAs");
});

test("Original as default removes the one-click item", async ({ page, sw }) => {
  await page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);
  await page.selectOption("#defaultFormat", "original");
  await expect.poll(async () => (await menuSpec(sw)).some((e) => e.id === "save-image-as-quick-save")).toBe(false);
});

test("permission banner shows after a blocked save and dismisses", async ({ page, sw }) => {
  await setPrefs(sw, { lastSaveBlockedByPermission: true, lastBlockedOrigin: "https://img.example.com" });
  await page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);
  await expect(page.locator("#permissionBanner")).toBeVisible();
  await expect(page.locator("#permissionBannerBody")).toContainText("https://img.example.com");

  await page.click("#bannerDismissBtn");
  await expect(page.locator("#permissionBanner")).toBeHidden();
  await expect.poll(async () => (await getSyncPrefs(sw)).lastSaveBlockedByPermission).toBe(false);
});

test("trust line shows the on-device count", async ({ page, sw }) => {
  await sw.evaluate(() => chrome.storage.local.set({ imagesSavedCount: 1234 }));
  await page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);
  await expect(page.locator("#trustLine")).toHaveText("🔒 1,234 images saved on this device — none ever uploaded.");
});
