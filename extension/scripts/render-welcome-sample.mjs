#!/usr/bin/env node
// Draws the welcome tab's "try it" photo (an original illustration, no stock
// image) and writes it as WebP, so the first save shows a real conversion:
//   public/welcome/golden-hour.webp (1600×1067)
// Run: npm run render:sample

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public", "welcome", "golden-hour.webp");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const dataUrl = await page.evaluate(() => {
  const w = 1600;
  const h = 1067;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#ffd8a8");
  sky.addColorStop(0.65, "#ff9f80");
  sky.addColorStop(1, "#f47c6a");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(1140, 460, 20, 1140, 460, 260);
  sun.addColorStop(0, "#fff7e0");
  sun.addColorStop(0.55, "rgba(255, 243, 214, 0.9)");
  sun.addColorStop(1, "rgba(255, 243, 214, 0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
  const ridge = (color, pts) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(w, h);
    g.fill();
  };
  ridge("#3a8f93", [[0, 760], [260, 560], [520, 720], [860, 470], [1180, 690], [1600, 560]]);
  ridge("#2f7f86", [[0, 820], [380, 640], [700, 800], [1020, 600], [1360, 780], [1600, 700]]);
  ridge("#1d5c63", [[0, 930], [300, 820], [640, 900], [980, 800], [1300, 900], [1600, 840]]);
  // Lake with a soft reflection of the sun.
  g.fillStyle = "#24646b";
  g.fillRect(0, 950, w, h - 950);
  g.fillStyle = "rgba(255, 236, 200, 0.35)";
  for (let i = 0; i < 6; i++) g.fillRect(1040 - i * 18, 975 + i * 14, 200 + i * 36, 4);
  return c.toDataURL("image/webp", 0.82);
});
writeFileSync(OUT, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log("wrote", OUT);
