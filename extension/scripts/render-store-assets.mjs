#!/usr/bin/env node
// Renders every .shot in store-assets/src/store.html to
// store-assets/v1.2/<id>.png at its exact CSS size (CWS wants 1280×800
// screenshots, a 440×280 small tile and a 1400×560 marquee).
// Run: npm run render:store

import { chromium } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const OUT = join(ROOT, "store-assets", "v1.2");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.goto(pathToFileURL(join(ROOT, "store-assets", "src", "store.html")).href);
await page.evaluate(() => document.fonts.ready);
for (const shot of await page.locator(".shot").all()) {
  const id = await shot.getAttribute("id");
  await shot.screenshot({ path: join(OUT, `${id}.png`) });
  console.log("rendered", id);
}
await browser.close();
