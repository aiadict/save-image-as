#!/usr/bin/env node
// Draws the E2E fixture images on a canvas and writes them to
// tests/fixtures/images/. Committed outputs; re-run only to change them:
//   node e2e/make-fixtures.mjs

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "tests", "fixtures", "images");
mkdirSync(OUT, { recursive: true });

// name, width, height, mime, transparent background?
const IMAGES = [
  ["photo-320.jpg", 320, 213, "image/jpeg", false],
  ["photo-1600.jpg", 1600, 1067, "image/jpeg", false],
  ["photo-800.webp", 800, 533, "image/webp", false],
  ["logo-transparent.png", 240, 240, "image/png", true],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, width, height, mime, transparent] of IMAGES) {
  const dataUrl = await page.evaluate(
    ({ width, height, mime, transparent }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (transparent) {
        ctx.fillStyle = "#0a7f8f";
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, width * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, "#ffd8a8");
        sky.addColorStop(1, "#ff9f80");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#2f7f86";
        ctx.beginPath();
        ctx.moveTo(0, height * 0.75);
        ctx.lineTo(width * 0.25, height * 0.45);
        ctx.lineTo(width * 0.45, height * 0.7);
        ctx.lineTo(width * 0.65, height * 0.42);
        ctx.lineTo(width, height * 0.8);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fill();
        ctx.fillStyle = "#15191c";
        ctx.font = `bold ${Math.round(height / 8)}px sans-serif`;
        ctx.fillText(`${width}×${height}`, width * 0.05, height * 0.2);
      }
      return canvas.toDataURL(mime, 0.85);
    },
    { width, height, mime, transparent }
  );
  writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote", name);
}
await browser.close();
