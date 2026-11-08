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

// Each entry: a reviewed call site that's allowed to make a network call,
// because it only fetches the image being saved (or the page's own
// already-loaded blob: bytes) — never a third-party or extension-owned
// endpoint. The call site itself carries the marker comment
//   // telemetry-guard: allow <reason>
// on the line above (or the same line). Markers rather than line numbers, so
// unrelated edits elsewhere in the file don't break the build. Add an entry
// only after actually reviewing a new call site for the same property.
const ALLOWLIST = [
  { file: "lib/image-core/decode.ts", reason: "image-being-saved" }, // fetchImageBlob: downloads the image the user right-clicked
  { file: "background/resolve-in-page.ts", reason: "page-blob-bytes" }, // reads a page-scoped blob: URL's own already-loaded bytes
];

const MARKER_PATTERN = /telemetry-guard: allow ([\w-]+)/;

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
const usedEntries = new Set();

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
    const marker = MARKER_PATTERN.exec(lineText) ?? MARKER_PATTERN.exec(lines[idx - 1] ?? "");
    const entry = marker && ALLOWLIST.find((a) => a.file === relPath && a.reason === marker[1]);
    if (entry) {
      usedEntries.add(entry);
    } else {
      violations.push(`${relPath}:${lineNumber}: ${lineText.trim()}`);
    }
  });
}

for (const entry of ALLOWLIST) {
  if (!usedEntries.has(entry)) {
    violations.push(`${entry.file}: allowlist entry "${entry.reason}" has no matching marked call site — remove it or restore the marker`);
  }
}

if (violations.length > 0) {
  console.error("check-no-telemetry: found network-call sites not in the reviewed allowlist:\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nIf this is a legitimate new call that only fetches the image being saved, add it to ALLOWLIST in " +
      "scripts/check-no-telemetry.mjs after reviewing it, and mark the call site with a telemetry-guard comment. If it's telemetry/analytics, it can't ship — the popup's " +
      "Trust Ledger claims none exists."
  );
  process.exit(1);
}

console.log("check-no-telemetry: OK — no network-call sites outside the reviewed allowlist.");
