#!/usr/bin/env node
// Renders store-assets/src/demo.html frame by frame (every animation paused
// and stepped to the frame's time, so motion is perfectly smooth) and encodes:
//   store-assets/video/save-image-as-demo.mp4  1920×1080, 30 fps, H.264 (store listing / YouTube)
//   store-assets/video/save-image-as-demo.gif  800 px wide, 15 fps (README, launch posts)
// Needs ffmpeg on PATH. Run: npm run render:video

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const OUT = join(ROOT, "store-assets", "video");
const FPS = 30;
const SCALE = 1.5; // 1280×720 CSS px → 1920×1080

mkdirSync(OUT, { recursive: true });
const frames = mkdtempSync(join(tmpdir(), "sia-demo-"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE, colorScheme: "light" });
await page.goto(pathToFileURL(join(ROOT, "store-assets", "src", "demo.html")).href + "#render");
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => {
  for (const a of document.getAnimations()) a.pause();
  return TOTAL; // eslint-disable-line no-undef
});

const count = Math.round((total / 1000) * FPS);
for (let i = 0; i < count; i++) {
  const t = (i * 1000) / FPS;
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) a.currentTime = t;
  }, t);
  await page.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.png`) });
  if (i % 150 === 0) console.log(`frame ${i}/${count}`);
}
await browser.close();

const input = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%04d.png")];
execFileSync("ffmpeg", [...input, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, "save-image-as-demo.mp4")], { stdio: "inherit" });
execFileSync(
  "ffmpeg",
  [
    ...input,
    "-vf",
    "fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    join(OUT, "save-image-as-demo.gif"),
  ],
  { stdio: "inherit" }
);
rmSync(frames, { recursive: true, force: true });
console.log(`wrote ${OUT}/save-image-as-demo.mp4 and .gif`);
