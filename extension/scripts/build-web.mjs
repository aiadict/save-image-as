#!/usr/bin/env node
// Bundles the website converter (src/web/convert.ts) into docs/convert/app.js
// and copies the AVIF encoder next to it. The output is committed, because
// GitHub Pages serves docs/ as static files. Run: npm run build:web

import { build } from "esbuild";
import { cpSync } from "node:fs";

await build({
  entryPoints: ["src/web/convert.ts"],
  outfile: "../docs/convert/app.js",
  bundle: true,
  format: "esm",
  target: "chrome116",
  minify: true,
  define: { __E2E__: "false" },
  logLevel: "info",
});
cpSync("node_modules/@jsquash/avif/codec/enc/avif_enc.wasm", "../docs/convert/avif_enc.wasm");
cpSync("node_modules/@jsquash/avif/LICENSE", "../docs/convert/LICENSE-jsquash-avif.txt");
