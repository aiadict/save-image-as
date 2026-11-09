// MV3 service worker — context-menu lifecycle, orchestrates the image-core
// pipeline, calls chrome.downloads. See docs/architecture.md "End-to-end
// data flow" for the pipeline this implements.

import { getPreferences, setPreferences, onPreferencesChanged } from "../lib/storage";
import { tryRequestOriginPermission } from "../lib/permissions";
import { downloadBlob } from "../lib/downloads";
import { notifyFailure, notifyInfo } from "../lib/notify";
import { incrementImagesSaved, setStats } from "../lib/stats";
import { showFailed, showSaved } from "../lib/badge";
import { FEEDBACK_FORM_URL } from "../lib/config";
import { formatBytes } from "../lib/format-bytes";
import {
  buildMenuSpec,
  COMPRESSED_ID,
  FORMATS,
  formatItemId,
  ORIGINAL_ID,
  QUICK_SAVE_ID,
  SIZE_BUDGET_LABEL,
  type MenuEntry,
} from "../lib/menu-spec";
import { configureAvifWasm } from "../lib/image-core/avif";
import { ConversionError, type ResolvedSource } from "../lib/image-core/types";
import { convertForSave, loadSourceBlob, type SaveFormat } from "../lib/save-pipeline";
import { resolveImageInPage } from "./resolve-in-page";

const LOG_PREFIX = "[Save Image As]";

configureAvifWasm(chrome.runtime.getURL("codecs/avif_enc.wasm"));

chrome.runtime.onInstalled.addListener((details) => {
  console.log(LOG_PREFIX, "onInstalled", details.reason);
  void rebuildContextMenu();
  // Opens an optional feedback page when someone uninstalls. Nothing is sent
  // unless they choose to submit the form there.
  void chrome.runtime.setUninstallURL(`${FEEDBACK_FORM_URL}?reason=uninstall`);
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome/index.html") });
  }
  if (details.reason === "update" && isOlderThan(details.previousVersion, WHATS_NEW_VERSION)) {
    // A one-time card in the popup; never a tab opened on update.
    void setStats({ whatsNew: WHATS_NEW_VERSION });
  }
});

/** The release whose highlights the popup's "What's new" card describes. */
const WHATS_NEW_VERSION = "1.3.0";

function isOlderThan(version: string | undefined, than: string): boolean {
  if (!version) return false;
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

onPreferencesChanged(() => {
  void rebuildContextMenu();
});

async function rebuildContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();

  const prefs = await getPreferences();
  const spec = buildMenuSpec(prefs);
  for (const entry of spec) {
    chrome.contextMenus.create({ ...entry, contexts: ["image"] });
  }
  if (__E2E__) e2e.lastMenuSpec = spec;

  console.log(LOG_PREFIX, "context menu rebuilt", { defaultFormat: prefs.defaultFormat, defaultFolder: prefs.defaultFolder });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void dispatchMenuClick(info, tab);
});

/** Routes a context-menu click to the right save. Also the entry point the E2E suite drives. */
async function dispatchMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  console.log(LOG_PREFIX, "menu item clicked", info.menuItemId, info.srcUrl);
  if (!info.srcUrl || !tab?.id) return;

  if (info.menuItemId === QUICK_SAVE_ID) {
    const prefs = await getPreferences();
    await handleSaveRequest(info, tab.id, prefs.defaultFormat, prefs.defaultFolder);
    return;
  }

  if (info.menuItemId === ORIGINAL_ID) {
    await handleSaveRequest(info, tab.id, "original");
    return;
  }

  if (info.menuItemId === COMPRESSED_ID) {
    await handleSaveRequest(info, tab.id, "compressed");
    return;
  }

  const match = FORMATS.find((f) => info.menuItemId === formatItemId(f));
  if (match) {
    await handleSaveRequest(info, tab.id, match);
  }
}

/**
 * Runs resolveImageInPage in the clicked tab/frame to find the actual
 * highest-quality source (srcset/<picture>/linked-original), instead of
 * trusting whatever thumbnail URL Chrome's contextMenus API handed us.
 * Never throws — any failure here (blocked injection, unusual page, etc.)
 * just falls back to the plain srcUrl, so Phase 2 can only ever do as well
 * as or better than the Phase 1 behavior, never worse.
 */
async function resolveSource(info: chrome.contextMenus.OnClickData, tabId: number): Promise<ResolvedSource> {
  const fallback: ResolvedSource = { url: info.srcUrl!, width: 0, height: 0 };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, ...(info.frameId !== undefined ? { frameIds: [info.frameId] } : {}) },
      func: resolveImageInPage,
      args: [info.srcUrl!, info.linkUrl ?? null],
    });
    const resolved = results[0]?.result;
    if (resolved) {
      console.log(LOG_PREFIX, "resolved source", resolved.url, `${resolved.width}x${resolved.height}`, !!resolved.inlineBlob);
    }
    return resolved ?? fallback;
  } catch (err) {
    console.warn(LOG_PREFIX, "in-page source resolution failed, falling back to srcUrl", err);
    return fallback;
  }
}

/** One right-click save: resolve the real source, then save it. Reports failures as a notification. */
async function handleSaveRequest(
  info: chrome.contextMenus.OnClickData,
  tabId: number,
  format: SaveFormat,
  folder?: string
): Promise<void> {
  try {
    const resolved = await resolveSource(info, tabId);
    await saveResolvedImage(resolved, format, { folder, pageUrl: info.pageUrl });
    showSaved(tabId);
  } catch (err) {
    showFailed(tabId);
    console.error(LOG_PREFIX, "save failed", err);
    const message =
      err instanceof ConversionError ? err.failure.message : "Something went wrong saving this image. Please try again.";
    notifyFailure(message);
  }
}

interface SaveOptions {
  folder?: string;
  /** The page the image was found on — sent as the referrer (hotlink protection). */
  pageUrl?: string;
}

/**
 * Fetch → convert → download → count, for an already-resolved source.
 * Throws a ConversionError on failure; the caller decides how to report it.
 */
async function saveResolvedImage(resolved: ResolvedSource, format: SaveFormat, options: SaveOptions): Promise<void> {
  const { folder, pageUrl } = options;
  const prefs = await getPreferences();
  const saveAs = prefs.saveMode === "ask";

  console.log(LOG_PREFIX, "fetching", resolved.url);
  const source = await loadSourceBlob(resolved, pageUrl, requestAccessAfterBlock);
  console.log(LOG_PREFIX, "converting to", format);
  const converted = await convertForSave(source, resolved, format, prefs, folder);
  if (converted.missedTarget) {
    // Saved successfully, just not as small as requested — tell the user
    // the honest result instead of silently claiming full success. See
    // docs/architecture.md "Size-budget compression".
    notifyInfo(
      `Saved at ${formatBytes(converted.blob.size)} — the smallest size possible without losing too much quality (target was under ${SIZE_BUDGET_LABEL[prefs.sizeBudget]}).`
    );
  }

  console.log(LOG_PREFIX, "downloading", converted.filename);
  if (__E2E__) await recordSave(converted.blob, converted.filename, converted.bitmap);
  await downloadBlob(converted.blob, converted.filename, saveAs);
  console.log(LOG_PREFIX, "done", converted.filename);
  void incrementImagesSaved();
  void clearPermissionBlockFlag();
}

/** A right-click save was blocked: try a narrow per-site grant, and flag the popup banner if that fails. */
async function requestAccessAfterBlock(url: string): Promise<boolean> {
  console.log(LOG_PREFIX, "fetch blocked, requesting origin permission (best effort)", url);
  const granted = await tryRequestOriginPermission(url);
  if (!granted) {
    void setPreferences({ lastSaveBlockedByPermission: true, lastBlockedOrigin: safeOrigin(url) });
  }
  return granted;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** A successful save means the block (if any) is no longer relevant — don't keep nagging about it. */
async function clearPermissionBlockFlag(): Promise<void> {
  const prefs = await getPreferences();
  if (prefs.lastSaveBlockedByPermission) {
    await setPreferences({ lastSaveBlockedByPermission: false, lastBlockedOrigin: "" });
  }
}

// ---------- E2E test hook ----------
// Only in `node build.mjs --e2e` builds: __E2E__ is defined as false for
// production, so esbuild drops all of this (npm test checks dist/ for it).

interface E2EHook {
  dispatchMenuClick: typeof dispatchMenuClick;
  lastMenuSpec: MenuEntry[];
  lastSave: { filename: string; mime: string; size: number; head: string; width?: number; height?: number } | null;
}

const e2e: E2EHook = { dispatchMenuClick, lastMenuSpec: [], lastSave: null };

if (__E2E__) {
  (globalThis as unknown as { __siaTest: E2EHook }).__siaTest = e2e;
}

async function recordSave(blob: Blob, filename: string, bitmap?: ImageBitmap): Promise<void> {
  const head = Array.from(new Uint8Array(await blob.slice(0, 16).arrayBuffer()), (b) => b.toString(16).padStart(2, "0")).join("");
  e2e.lastSave = { filename, mime: blob.type, size: blob.size, head, width: bitmap?.width, height: bitmap?.height };
}
