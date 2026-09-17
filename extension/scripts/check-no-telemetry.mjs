#!/usr/bin/env node
// Guards the Trust Ledger's claim (see popup's "🔒 ... none ever uploaded"
// line and docs/architecture.md "Trust ledger"): that claim is only true as
// long as the ONLY network calls this codebase makes are fetches of the
// image the user asked to save, from its own host. This script fails the
// build if any new network-call site shows up outside the two known,
// allowlisted ones — so "don't add telemetry" is enforced mechanically
// instead of relying on someone remembering the rule during a future change.
//
// Run via `npm run check:telemetry` (also wired into `npm test`).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SRC_DIR = join(SCRIPT_DIR, "..", "src");
const NETWORK_CALL_PATTERN = /\b(fetch|XMLHttpRequest|sendBeacon)\s*\(/;

// Each entry: the only lines allowed to contain a network-call token, because
// they've been reviewed and confirmed to fetch only the image being saved
// (or the page's own already-loaded blob: bytes) — never a third-party or
// extension-owned endpoint. Update this list only after actually reviewing a
// new call site for the same property.
const ALLOWLIST = [
  { file: "lib/image-core/decode.ts", line: 23 }, // fetchImageBlob: downloads the image the user right-clicked
  { file: "background/resolve-in-page.ts", line: 127 }, // reads a page-scoped blob: URL's own already-loaded bytes
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const filePath of walk(SRC_DIR)) {
  const relPath = relative(SRC_DIR, filePath).split("\\").join("/");
  const lines = readFileSync(filePath, "utf8").split("\n");
  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    // Skip comments (// lines and /** ... */ block continuation lines) — this
    // script cares about actual call sites, not prose that happens to mention
    // "fetch()" while explaining one (as several doc-comments in this codebase do).
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (!NETWORK_CALL_PATTERN.test(lineText)) return;
    const lineNumber = idx + 1;
    const allowed = ALLOWLIST.some((a) => a.file === relPath && a.line === lineNumber);
    if (!allowed) {
      violations.push(`${relPath}:${lineNumber}: ${lineText.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("check-no-telemetry: found network-call sites not in the reviewed allowlist:\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nIf this is a legitimate new call that only fetches the image being saved, add it to ALLOWLIST in " +
      "scripts/check-no-telemetry.mjs after reviewing it. If it's telemetry/analytics, it can't ship — the popup's " +
      "Trust Ledger claims none exists."
  );
  process.exit(1);
}

console.log("check-no-telemetry: OK — no network-call sites outside the reviewed allowlist.");
