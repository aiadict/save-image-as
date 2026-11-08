// Minimal esbuild-based build for the extension.
// dev:   node build.mjs --watch   (unpacked dist/, for chrome://extensions "Load unpacked")
// build: node build.mjs           (production bundle)
// zip:   node build.mjs --zip     (build, then zip dist/ for Chrome Web Store upload)
// e2e:   node build.mjs --e2e     (dist-e2e/ with the test hook and localhost
//                                  host access; see e2e/README.md — never ship this)
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");
const e2e = process.argv.includes("--e2e");
const outdir = e2e ? "dist-e2e" : "dist";

const entryPoints = {
  "background/index": "src/background/index.ts",
  "popup/index": "src/popup/index.ts",
  "welcome/index": "src/welcome/index.ts",
};

function copyStatic() {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  if (e2e) {
    // Tests can't click the toolbar or the context menu, so activeTab never
    // fires; without this, in-page source resolution would silently fall back
    // and hide srcset bugs. 127.0.0.1 is deliberately NOT granted: it's the
    // suite's "other site" for the permission-denied path.
    manifest.host_permissions = ["http://localhost/*"];
  }
  writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
  cpSync("public", outdir, { recursive: true });
  // Shared design tokens + the Geist font (SIL OFL 1.1) used by every page.
  cpSync("src/ui", `${outdir}/ui`, { recursive: true });
  mkdirSync(`${outdir}/fonts`, { recursive: true });
  cpSync("node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2", `${outdir}/fonts/Geist-Variable.woff2`);
  cpSync("node_modules/geist/LICENSE.txt", `${outdir}/fonts/LICENSE-Geist-OFL.txt`);
  // libavif encoder for AVIF saves (see src/lib/image-core/avif.ts), loaded on first use.
  mkdirSync(`${outdir}/codecs`, { recursive: true });
  cpSync("node_modules/@jsquash/avif/codec/enc/avif_enc.wasm", `${outdir}/codecs/avif_enc.wasm`);
  cpSync("node_modules/@jsquash/avif/LICENSE", `${outdir}/codecs/LICENSE-jsquash-avif.txt`);
  for (const dir of ["popup", "welcome"]) {
    if (existsSync(`src/${dir}/index.html`)) {
      mkdirSync(`${outdir}/${dir}`, { recursive: true });
      cpSync(`src/${dir}/index.html`, `${outdir}/${dir}/index.html`);
    }
    if (existsSync(`src/${dir}/style.css`)) {
      cpSync(`src/${dir}/style.css`, `${outdir}/${dir}/style.css`);
    }
  }
}

const buildOptions = {
  entryPoints,
  entryNames: "[dir]/[name]",
  bundle: true,
  outdir,
  format: "esm",
  target: "chrome116",
  sourcemap: watch ? "inline" : false,
  define: { __E2E__: String(e2e) },
  minify: !watch,
  logLevel: "info",
};

copyStatic();

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes... (load `dist/` as an unpacked extension)");
} else {
  await build(buildOptions);
  if (zip) {
    const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
    // Absolute path — the zip command below `cd`s into dist/ first, so a
    // relative path here would resolve against the wrong directory.
    const releasesDir = resolve(process.cwd(), "..", "releases");
    mkdirSync(releasesDir, { recursive: true });
    const zipPath = resolve(releasesDir, `save-image-as-v${version}.zip`);
    // A release zip is what was uploaded for review; never replace one by
    // accident. Bump the version in manifest.json + package.json first.
    if (existsSync(zipPath)) {
      console.error(`${zipPath} already exists. Bump the version before zipping a new release.`);
      process.exit(1);
    }
    execSync(`cd ${outdir} && zip -r "${zipPath}" .`, { stdio: "inherit" });
    console.log(`Packaged ${zipPath} for Chrome Web Store upload.`);
  }
}
