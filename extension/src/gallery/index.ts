// Gallery tab for "Save images from this page". The popup scans the page and
// hands the ranked list over in chrome.storage.session (lib/gallery-store.ts);
// this page shows it, lets people pick, and saves with the same pipeline as a
// right-click save (lib/save-pipeline.ts). It saves here rather than in the
// service worker: this tab stays open while saving, and a .zip can be built
// and downloaded from an object URL without passing image bytes around.

import { getPreferences, type DefaultFormat } from "../lib/storage";
import { loadGallery } from "../lib/gallery-store";
import { bulkFolder, type GalleryData, type GalleryImage } from "../lib/page-images";
import { convertForSave, loadSourceBlob } from "../lib/save-pipeline";
import { downloadBlob } from "../lib/downloads";
import { incrementImagesSaved } from "../lib/stats";
import { createZip, uniqueName, type ZipEntry } from "../lib/zip";
import { hasBroadImageAccess, requestBroadImageAccess } from "../lib/permissions";
import { configureAvifWasm } from "../lib/image-core/avif";
import { sanitizeFolder } from "../lib/image-core/filename";
import { ConversionError, type ResolvedSource } from "../lib/image-core/types";

configureAvifWasm(chrome.runtime.getURL("codecs/avif_enc.wasm"));

/** Images converted at once: enough to overlap fetching and encoding, few enough to stay light. */
const CONCURRENCY = 2;

type TileState = "idle" | "saving" | "saved" | "blocked" | "failed";

interface Tile {
  image: GalleryImage;
  cell: HTMLLIElement;
  button: HTMLButtonElement;
  dims: HTMLElement;
  status: HTMLElement;
  selected: boolean;
  state: TileState;
}

const STATUS_LABEL: Record<TileState, string> = { idle: "", saving: "Saving…", saved: "Saved", blocked: "Blocked", failed: "Failed" };
const TYPE_LABEL: Record<string, string> = { jpg: "JPG", png: "PNG", webp: "WebP", avif: "AVIF", gif: "GIF", svg: "SVG", other: "Other" };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const grid = $("grid");
const saveBtn = $<HTMLButtonElement>("saveBtn");
const formatSelect = $<HTMLSelectElement>("formatSelect");
const zipToggle = $<HTMLInputElement>("zipToggle");
const typeFilter = $<HTMLSelectElement>("typeFilter");
const dest = $("dest");
const summary = $("summary");
const summaryText = $("summaryText");
const grantBtn = $<HTMLButtonElement>("grantBtn");
const showBtn = $<HTMLButtonElement>("showBtn");

let data: GalleryData;
let tiles: Tile[] = [];
let minSide = 0;
let type = "";
let lastClicked: Tile | null = null;
let busy = false;
let folder = "SaveImageAs";
let lastDownloadId: number | null = null;

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./i, "");
  } catch {
    return "this page";
  }
}

function isVisible(tile: Tile): boolean {
  if (type && tile.image.type !== type) return false;
  if (minSide > 0 && Math.max(tile.image.width, tile.image.height) < minSide) return false;
  return true;
}

function visibleTiles(): Tile[] {
  return tiles.filter((t) => !t.cell.hidden);
}

function chosen(): Tile[] {
  return visibleTiles().filter((t) => t.selected);
}

function setSelected(tile: Tile, on: boolean): void {
  tile.selected = on;
  tile.button.setAttribute("aria-checked", String(on));
}

function setState(tile: Tile, state: TileState, reason = ""): void {
  tile.state = state;
  tile.button.dataset.state = state;
  tile.status.textContent = STATUS_LABEL[state];
  tile.button.title = reason;
}

function describeSize(image: GalleryImage): string {
  return image.width > 0 && image.height > 0 ? `${image.width} × ${image.height}` : image.width > 0 ? `${image.width} px wide` : "Size unknown";
}

function applyFilters(): void {
  for (const tile of tiles) tile.cell.hidden = !isVisible(tile);
  $("empty").hidden = visibleTiles().length > 0;
  updateActionBar();
}

function updateActionBar(): void {
  const n = chosen().length;
  saveBtn.textContent = n === 0 ? "Select images to save" : `Save ${plural(n, "image")}`;
  saveBtn.disabled = busy || n === 0;
  dest.textContent = zipToggle.checked
    ? `Saves one file: Downloads/${sanitizeFolder(folder)}.zip`
    : `Saves to Downloads/${sanitizeFolder(folder)}/`;
}

function renderTile(image: GalleryImage): Tile {
  const cell = document.createElement("li");
  cell.className = "cell";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tile";
  button.setAttribute("role", "checkbox");
  button.setAttribute("aria-checked", "false");
  button.setAttribute("aria-label", image.alt || image.url.split(/[?#]/)[0]!.split("/").pop() || "Image");

  const thumb = document.createElement("span");
  thumb.className = "thumb";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = "";
  // Many image hosts refuse other sites' referrers; an empty one usually passes.
  img.referrerPolicy = "no-referrer";
  thumb.append(img);

  const check = document.createElement("span");
  check.className = "check";
  check.setAttribute("aria-hidden", "true");
  check.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>';

  const meta = document.createElement("span");
  meta.className = "meta";
  const dims = document.createElement("span");
  dims.textContent = describeSize(image);
  const kind = document.createElement("span");
  kind.className = "type";
  kind.textContent = TYPE_LABEL[image.type] ?? "Other";
  meta.append(dims, kind);

  const status = document.createElement("span");
  status.className = "status";

  button.append(thumb, check, meta, status);
  cell.append(button);

  const tile: Tile = { image, cell, button, dims, status, selected: false, state: "idle" };

  img.addEventListener("load", () => {
    // CSS backgrounds and lazy images arrive without a size; the preview is the image itself.
    if (image.width === 0 && image.thumb === image.url) {
      image.width = img.naturalWidth;
      image.height = img.naturalHeight;
      dims.textContent = describeSize(image);
      if (minSide > 0) applyFilters();
    }
  });
  img.addEventListener("error", () => thumb.classList.add("is-broken"));
  img.src = image.thumb;

  button.addEventListener("click", (event) => {
    if (busy) return;
    const on = !tile.selected;
    if (event.shiftKey && lastClicked && lastClicked !== tile) {
      // Shift-click: the whole visible range between the two clicks follows this one.
      const visible = visibleTiles();
      const a = visible.indexOf(lastClicked);
      const b = visible.indexOf(tile);
      if (a !== -1 && b !== -1) {
        for (const t of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) setSelected(t, on);
      }
    }
    setSelected(tile, on);
    lastClicked = tile;
    updateActionBar();
  });

  return tile;
}

function initFilters(): void {
  const sizeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#sizeFilter [data-size]"));
  const selectSize = (value: number) => {
    minSide = value;
    for (const b of sizeButtons) b.setAttribute("aria-checked", String(Number(b.dataset.size) === value));
    applyFilters();
  };
  for (const b of sizeButtons) b.addEventListener("click", () => selectSize(Number(b.dataset.size)));
  selectSize(0);

  const counts = new Map<string, number>();
  for (const t of tiles) counts.set(t.image.type, (counts.get(t.image.type) ?? 0) + 1);
  for (const key of Object.keys(TYPE_LABEL)) {
    const n = counts.get(key);
    if (!n) continue;
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${TYPE_LABEL[key]} (${n})`;
    typeFilter.append(option);
  }
  typeFilter.addEventListener("change", () => {
    type = typeFilter.value;
    applyFilters();
  });

  $("selectAll").addEventListener("click", () => {
    if (busy) return;
    for (const t of visibleTiles()) setSelected(t, true);
    updateActionBar();
  });
  $("selectNone").addEventListener("click", () => {
    if (busy) return;
    for (const t of tiles) setSelected(t, false);
    updateActionBar();
  });
}

/** Runs `task` over `items`, at most `limit` at a time. */
async function runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function downloadZip(zip: Blob, filename: string): Promise<number> {
  const url = URL.createObjectURL(zip);
  return chrome.downloads.download({ url, filename, saveAs: false }).then((id) => {
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === id && (delta.state?.current === "complete" || delta.state?.current === "interrupted")) {
        URL.revokeObjectURL(url);
        chrome.downloads.onChanged.removeListener(listener);
      }
    };
    chrome.downloads.onChanged.addListener(listener);
    return id;
  });
}

async function save(list: Tile[]): Promise<void> {
  busy = true;
  summary.hidden = true;
  updateActionBar();

  const prefs = await getPreferences();
  const format = formatSelect.value as DefaultFormat;
  const asZip = zipToggle.checked;
  const entries: ZipEntry[] = [];
  const zipNames = new Set<string>();
  // One ledger write at a time, so parallel saves don't overwrite each other's count.
  let ledger = Promise.resolve();
  const count = (n: number) => {
    ledger = ledger.then(() => incrementImagesSaved(n));
  };

  let done = 0;
  const progress = () => {
    saveBtn.textContent = `Saving ${Math.min(done + 1, list.length)} of ${list.length}…`;
  };
  progress();

  await runPool(list, CONCURRENCY, async (tile) => {
    setState(tile, "saving");
    const resolved: ResolvedSource = {
      url: tile.image.url,
      width: tile.image.width,
      height: tile.image.height,
      alt: tile.image.alt || undefined,
    };
    try {
      const source = await loadSourceBlob(resolved, data.pageUrl);
      const converted = await convertForSave(source, resolved, format, prefs, folder);
      converted.bitmap?.close();
      if (__E2E__) e2eSaves.push(converted.filename);
      if (asZip) {
        const name = uniqueName(converted.filename.split("/").pop()!, zipNames);
        entries.push({ name, data: new Uint8Array(await converted.blob.arrayBuffer()) });
      } else {
        lastDownloadId = await downloadBlob(converted.blob, converted.filename, false);
        count(1);
      }
      setState(tile, "saved");
    } catch (err) {
      const blocked = err instanceof ConversionError && err.failure.reason === "permission-denied";
      const reason = err instanceof ConversionError ? err.failure.message : "Something went wrong saving this image.";
      console.warn("[Save Image As] bulk save failed", tile.image.url, err);
      setState(tile, blocked ? "blocked" : "failed", reason);
    }
    done++;
    progress();
  });

  let zipError = "";
  if (asZip && entries.length > 0) {
    try {
      const zipName = `${sanitizeFolder(folder)}.zip`;
      if (__E2E__) e2eSaves.push(zipName);
      lastDownloadId = await downloadZip(createZip(entries), zipName);
      count(entries.length);
    } catch (err) {
      console.warn("[Save Image As] zip failed", err);
      zipError = "The .zip couldn't be saved. Try again without “One .zip file”.";
      for (const t of list) if (t.state === "saved") setState(t, "failed", zipError);
    }
  }
  await ledger;

  busy = false;
  updateActionBar();
  await showSummary(list, asZip, zipError);
}

async function showSummary(list: Tile[], asZip: boolean, zipError: string): Promise<void> {
  const saved = list.filter((t) => t.state === "saved").length;
  const blocked = list.filter((t) => t.state === "blocked").length;
  const failed = list.filter((t) => t.state === "failed").length;
  const canGrant = blocked > 0 && !(await hasBroadImageAccess());

  const parts: string[] = [];
  if (saved > 0) {
    parts.push(asZip ? `${plural(saved, "image")} saved in one .zip.` : `${plural(saved, "image")} saved.`);
  }
  if (zipError) parts.push(zipError);
  if (blocked > 0) {
    parts.push(
      canGrant
        ? `${blocked} blocked by the site: allow Save Image As on all sites and they'll be saved.`
        : `${blocked} couldn't be downloaded from the site.`
    );
  }
  if (failed > 0 && !zipError) parts.push(`${failed} couldn't be converted (hover over them to see why).`);

  summaryText.textContent = parts.join(" ") || "Nothing was saved.";
  grantBtn.hidden = !canGrant;
  showBtn.hidden = lastDownloadId === null || saved === 0;
  summary.hidden = false;
}

async function init(): Promise<void> {
  const id = location.hash.slice(1);
  const stored = id ? await loadGallery(id) : null;
  if (!stored) {
    $("heading").textContent = "Save images from a page";
    $("expired").hidden = false;
    return;
  }
  data = stored;

  const prefs = await getPreferences();
  folder = bulkFolder(prefs.defaultFolder, data.pageUrl);
  formatSelect.value = prefs.defaultFormat;

  const host = hostOf(data.pageUrl);
  document.title = `Images on ${host} · Save Image As`;
  $("heading").textContent = `${plural(data.images.length, "image")} on ${host}`;
  const sub = $("subheading");
  const link = document.createElement("a");
  link.href = data.pageUrl;
  link.textContent = data.title || data.pageUrl;
  link.rel = "noreferrer";
  sub.append(link);
  if (data.more > 0) sub.append(` · showing the first ${data.images.length}; ${data.more.toLocaleString()} more weren't listed`);

  tiles = data.images.map(renderTile);
  grid.append(...tiles.map((t) => t.cell));
  $("toolbar").hidden = false;
  $("actionBar").hidden = false;
  initFilters();

  zipToggle.addEventListener("change", updateActionBar);
  saveBtn.addEventListener("click", () => void save(chosen()));
  grantBtn.addEventListener("click", () => {
    // First statement of the click handler: permissions.request needs the user gesture.
    void requestBroadImageAccess().then((granted) => {
      if (granted) void save(tiles.filter((t) => t.state === "blocked"));
    });
  });
  showBtn.addEventListener("click", () => {
    if (lastDownloadId !== null) chrome.downloads.show(lastDownloadId);
  });
}

// E2E builds only (see e2e/README.md): Playwright stores downloads under
// random names, so tests read the requested paths here.
const e2eSaves: string[] = [];
if (__E2E__) (globalThis as unknown as { __siaTest: { saves: string[] } }).__siaTest = { saves: e2eSaves };

void init();
