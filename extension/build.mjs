// Minimal esbuild-based build for the extension.
// dev:   node build.mjs --watch   (unpacked dist/, for chrome://extensions "Load unpacked")
// build: node build.mjs           (production bundle)
// zip:   node build.mjs --zip     (build, then zip dist/ for Chrome Web Store upload)
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

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
    const zipName = "save-image-as.zip";
    rmSync(zipName, { force: true });
    execSync(`cd ${outdir} && zip -r ../${zipName} .`, { stdio: "inherit" });
    console.log(`Packaged ${zipName} for Chrome Web Store upload.`);
  }
}
