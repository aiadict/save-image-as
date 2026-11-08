#!/usr/bin/env node
// Checks WCAG contrast for the text/background token pairs the UI actually
// uses, in both themes of src/ui/tokens.css. Text needs 4.5:1. Run via
// `npm run check:contrast` (also part of `npm test`).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../src/ui/tokens.css", import.meta.url)), "utf8");

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const light = tokens(css.slice(0, darkStart));
const dark = { ...light, ...tokens(css.slice(darkStart)) };

// [text, background] pairs as used in popup/welcome CSS.
const PAIRS = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface-2"],
  ["ink-2", "bg"],
  ["ink-2", "surface-2"],
  ["ink-3", "bg"],
  ["ink-3", "surface"],
  ["ink-3", "surface-2"],
  ["ink-3", "accent-tint"],
  ["on-accent", "accent"],
  ["accent-ink", "bg"],
  ["accent-ink", "accent-tint"],
  ["accent-ink", "surface"],
  ["danger", "bg"],
];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const failures = [];
for (const [theme, t] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of PAIRS) {
    if (!t[fg] || !t[bg]) {
      failures.push(`${theme}: missing token --${!t[fg] ? fg : bg}`);
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    if (r < 4.5) failures.push(`${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1 (needs 4.5:1)`);
  }
}

if (failures.length) {
  console.error("check-contrast: failing pairs:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`check-contrast: OK — ${PAIRS.length} text pairs pass 4.5:1 in light and dark.`);
