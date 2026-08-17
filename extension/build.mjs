// Minimal esbuild-based build for the extension.
// dev:   node build.mjs --watch   (unpacked dist/, for chrome://extensions "Load unpacked")
// build: node build.mjs           (production bundle)
// zip:   node build.mjs --zip     (build, then zip dist/ for Chrome Web Store upload)
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");
const outdir = "dist";

const entryPoints = {
  "background/index": "src/background/index.ts",
  "popup/index": "src/popup/index.ts",
  "welcome/index": "src/welcome/index.ts",
};

function copyStatic() {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  cpSync("manifest.json", `${outdir}/manifest.json`);
  cpSync("public", outdir, { recursive: true });
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
    rmSync(zipPath, { force: true });
    execSync(`cd ${outdir} && zip -r "${zipPath}" .`, { stdio: "inherit" });
    console.log(`Packaged ${zipPath} for Chrome Web Store upload.`);
  }
}
