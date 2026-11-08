#!/usr/bin/env node
// Renders the extension icons from store-assets/icon/icon.svg into
// public/icons/ (16/32/48/128) and the store icon. Run: npm run render:icons

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const svg = readFileSync(join(ROOT, "store-assets", "icon", "icon.svg"), "utf8");
const TARGETS = [
  [16, "extension/public/icons/icon16.png"],
  [32, "extension/public/icons/icon32.png"],
  [48, "extension/public/icons/icon48.png"],
  [128, "extension/public/icons/icon128.png"],
  [128, "store-assets/icon/store-icon-128.png"],
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
for (const [size, path] of TARGETS) {
  await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(ROOT, path), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log("Rendered", TARGETS.length, "icons");
