#!/usr/bin/env node
// Fails if the production build contains the E2E test hook. The hook only
// exists in `node build.mjs --e2e` builds (__E2E__ is defined as false
// otherwise and esbuild drops the code); this proves that held.
// Run via `npm run check:bundle` (also part of `npm test`).

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");

execSync("node build.mjs", { cwd: ROOT, stdio: "ignore" });

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const offenders = walk(DIST).filter((f) => /\.(js|json)$/.test(f) && readFileSync(f, "utf8").includes("__siaTest"));
const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));

if (offenders.length > 0 || manifest.host_permissions) {
  console.error("check-prod-bundle: the production build contains E2E-only code or permissions:");
  for (const f of offenders) console.error(`  ${f}`);
  if (manifest.host_permissions) console.error("  manifest.json has host_permissions");
  process.exit(1);
}

console.log("check-prod-bundle: OK — no E2E hook or test permissions in dist/.");
