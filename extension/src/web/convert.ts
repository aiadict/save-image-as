// The website's free converter (docs/convert/). Reuses the extension's
// image-core — the same encoders the right-click menu uses — bundled by
// `npm run build:web` into docs/convert/app.js. Everything runs in the
// visitor's browser; the page's Content-Security-Policy blocks sending data
// anywhere (see docs/convert/index.html).

import { encodeImage, encodeToTargetSize } from "../lib/image-core/encode";
import { configureAvifWasm } from "../lib/image-core/avif";
import { formatBytes } from "../lib/format-bytes";
import { ConversionError, type OutputFormat } from "../lib/image-core/types";

type Target = OutputFormat | "compressed";

const EXTENSION: Record<Target, string> = { png: "png", jpg: "jpg", webp: "webp", avif: "avif", pdf: "pdf", compressed: "webp" };
const JPG_QUALITY = 0.92;
const COMPRESSED_MAX_BYTES = 1024 * 1024;

configureAvifWasm(new URL("avif_enc.wasm", import.meta.url).href);

const input = document.getElementById("fileInput") as HTMLInputElement;
const drop = document.getElementById("dropZone")!;
const results = document.getElementById("results")!;
const formatButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#formatSeg [data-format]"));
const downloadAll = document.getElementById("downloadAll") as HTMLButtonElement;

let target: Target = "png";
const finished: { url: string; name: string }[] = [];

function selectFormat(format: Target): void {
  target = format;
  for (const btn of formatButtons) {
    const on = btn.dataset.format === format;
    btn.setAttribute("aria-checked", String(on));
    btn.tabIndex = on ? 0 : -1;
  }
}
for (const btn of formatButtons) {
  btn.addEventListener("click", () => selectFormat(btn.dataset.format as Target));
}
selectFormat("png");

function outputName(name: string, format: Target): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "") || "image";
  return `${base}.${EXTENSION[format]}`;
}

async function convert(file: File): Promise<void> {
  const format = target;
  const row = document.createElement("li");
  row.className = "result";
  const label = document.createElement("span");
  label.className = "result-name";
  label.textContent = outputName(file.name, format);
  const status = document.createElement("span");
  status.className = "result-status";
  status.textContent = "Converting…";
  row.append(label, status);
  results.prepend(row);

  try {
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new ConversionError({
        reason: "unknown",
        message: "Your browser can't open this file. HEIC photos aren't supported in Chrome; try JPG, PNG, WebP, AVIF or GIF.",
      });
    });
    const blob =
      format === "compressed"
        ? (await encodeToTargetSize(bitmap, COMPRESSED_MAX_BYTES)).blob
        : await encodeImage(bitmap, format, JPG_QUALITY);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.className = "btn-secondary btn-sm";
    link.href = url;
    link.download = label.textContent;
    link.textContent = "Download";
    status.textContent = `${formatBytes(file.size)} → ${formatBytes(blob.size)} · ${bitmap.width} × ${bitmap.height}`;
    row.append(link);
    finished.push({ url, name: link.download });
    downloadAll.hidden = finished.length < 2;
  } catch (err) {
    row.classList.add("is-error");
    status.textContent = err instanceof ConversionError ? err.failure.message : "Couldn't convert this file.";
  }
}

async function handleFiles(files: Iterable<File>): Promise<void> {
  for (const file of files) {
    if (file.type.startsWith("image/") || /\.(heic|heif|avif|webp|png|jpe?g|gif|bmp|svg)$/i.test(file.name)) {
      await convert(file);
    }
  }
}

input.addEventListener("change", () => {
  if (input.files) void handleFiles(Array.from(input.files));
  input.value = "";
});

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("is-over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("is-over");
  if (event.dataTransfer?.files) void handleFiles(Array.from(event.dataTransfer.files));
});

document.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (files.length) void handleFiles(files);
});

downloadAll.addEventListener("click", () => {
  for (const { url, name } of finished) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
});
