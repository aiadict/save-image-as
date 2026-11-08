#!/usr/bin/env node
// Renders the website's raster images from their sources, so they can be
// regenerated after a design change instead of hand-exported:
//   store-assets/src/og.html  -> docs/assets/og.png (1200×630 link preview)
//   docs/assets/favicon.svg   -> docs/assets/favicon-32.png, apple-touch-icon.png (180×180)
//
// Uses the locally installed Google Chrome (channel "chrome"), so no
// Playwright browser download is needed. Run: npm run render:site

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ASSETS = join(ROOT, "docs", "assets");

const browser = await chromium.launch({ channel: "chrome" });
try {
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.goto(pathToFileURL(join(ROOT, "store-assets", "src", "og.html")).href);
  await og.screenshot({ path: join(ASSETS, "og.png") });

  const svg = readFileSync(join(ASSETS, "favicon.svg"), "utf8");
  for (const [size, name] of [
    [32, "favicon-32.png"],
    [180, "apple-touch-icon.png"],
  ]) {
    // Chrome won't screenshot a viewport this small, so render in a normal
    // page and clip to the icon.
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    await page.screenshot({
      path: join(ASSETS, name),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  }
  console.log("Rendered og.png, favicon-32.png, apple-touch-icon.png into docs/assets/");
} finally {
  await browser.close();
}
