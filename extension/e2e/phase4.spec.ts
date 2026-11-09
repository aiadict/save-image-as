// First run (welcome tab), the toolbar badge, and the popup's one-time cards
// and rating prompt.

import { test, expect, extensionId, saveViaMenu, setPrefs } from "./fixtures";
import type { Worker } from "@playwright/test";

async function setStats(sw: Worker, patch: Record<string, unknown>) {
  await sw.evaluate((p) => chrome.storage.local.set(p), patch);
}

const freshStats = { imagesSavedCount: 0, ratingState: "none", ratingStateAtCount: 0, ratingDismissals: 0, lastMilestoneShown: 0, whatsNew: "" };

test.beforeEach(async ({ sw }) => {
  await setStats(sw, freshStats);
  await setPrefs(sw, { defaultFormat: "png", defaultFolder: "SaveImageAs", saveMode: "quick", menuStyle: "full" });
});

test("welcome: picking a format and saving the sample completes every step", async ({ page, sw }) => {
  await page.goto(`chrome-extension://${extensionId(sw)}/welcome/index.html`);
  await expect(page.locator("#menuLabel")).toHaveText("Save as PNG → SaveImageAs/");

  await page.click('#formatPills [data-format="jpg"]');
  await expect(page.locator("#stepFormat")).toHaveAttribute("data-state", "done");
  await expect.poll(async () => sw.evaluate(async () => (await chrome.storage.sync.get("defaultFormat")).defaultFormat)).toBe("jpg");

  // The real pipeline on the extension's own page: in-page resolution can't
  // run there, so it falls back to the image URL, which the worker can fetch.
  const r = await saveViaMenu(page, sw, "sample", "save-image-as-quick-save");
  expect(r.download?.state).toBe("complete");
  expect(r.lastSave!.filename).toBe("SaveImageAs/golden-hour.jpg");
  expect(r.lastSave!.width).toBe(1600);

  await expect(page.locator("#celebrate")).toBeVisible();
  await expect(page.locator("#stepSave")).toHaveAttribute("data-state", "done");
  await expect(page.locator("#stepPin")).toHaveAttribute("data-state", "done");
});

test("badge: ✓ after a save, ! after a failure", async ({ page, sw, sites }) => {
  await page.goto(`${sites.origin}/cases.html`);
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, page.url());
  const badge = () => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

  await saveViaMenu(page, sw, "jpg", "save-image-as-submenu-png");
  expect(await badge()).toBe("✓");
  await expect.poll(badge, { timeout: 5000 }).toBe("");

  await saveViaMenu(page, sw, "cross-origin", "save-image-as-submenu-png");
  expect(await badge()).toBe("!");
});

test.describe("popup cards and rating", () => {
  const open = async (page: import("@playwright/test").Page, sw: Worker) =>
    page.goto(`chrome-extension://${extensionId(sw)}/popup/index.html`);

  test("new users see 'how it works', not a rating ask", async ({ page, sw }) => {
    await open(page, sw);
    await expect(page.locator("#newcomerFooter")).toBeVisible();
    await expect(page.locator("#ratingFooter")).toBeHidden();
  });

  test("rating appears after 3 saves; 'Not now' hides it and is remembered", async ({ page, sw }) => {
    await setStats(sw, { imagesSavedCount: 3 });
    await open(page, sw);
    await expect(page.locator("#ratingFooter")).toBeVisible();
    await page.click("#ratingDismiss");
    await expect(page.locator("#ratingFooter")).toBeHidden();
    await page.reload();
    await expect(page.locator("#ratingFooter")).toBeHidden();
  });

  test("milestone card at 10 saves, once", async ({ page, sw }) => {
    await setStats(sw, { imagesSavedCount: 12 });
    await open(page, sw);
    await expect(page.locator("#milestoneTitle")).toHaveText("10 images saved!");
    await page.click("#milestoneDismiss");
    await page.reload();
    await expect(page.locator("#milestoneCard")).toBeHidden();
  });

  test("what's new card shows once after an update", async ({ page, sw }) => {
    await setStats(sw, { whatsNew: "1.3.0" });
    await open(page, sw);
    await expect(page.locator("#whatsNewCard")).toBeVisible();
    await page.click("#whatsNewDismiss");
    await page.reload();
    await expect(page.locator("#whatsNewCard")).toBeHidden();
  });
});
