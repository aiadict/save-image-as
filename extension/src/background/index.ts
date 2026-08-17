// MV3 service worker — context-menu lifecycle, orchestrates the image-core
// pipeline, calls chrome.downloads. See docs/architecture.md "End-to-end
// data flow" for the pipeline this implements.

import { getPreferences, onPreferencesChanged, type DefaultFormat } from "../lib/storage";
import { tryRequestOriginPermission } from "../lib/permissions";
import { downloadBlob } from "../lib/downloads";
import { notifyFailure } from "../lib/notify";
import { base64ToBlob } from "../lib/base64";
import { fetchImageBlob, decodeImage } from "../lib/image-core/decode";
import { encodeImage } from "../lib/image-core/encode";
import { buildFilename, buildOriginalFilename } from "../lib/image-core/filename";
import { ConversionError, type OutputFormat, type ResolvedSource } from "../lib/image-core/types";
import { resolveImageInPage } from "./resolve-in-page";

const LOG_PREFIX = "[Save Image As]";
const SUBMENU_ID = "save-image-as-submenu";
const QUICK_SAVE_ID = "save-image-as-quick-save";

const FORMATS: readonly OutputFormat[] = ["png", "jpg", "webp", "avif", "pdf"];

chrome.runtime.onInstalled.addListener((details) => {
  console.log(LOG_PREFIX, "onInstalled", details.reason);
  void rebuildContextMenu();
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome/index.html") });
  }
});

onPreferencesChanged(() => {
  void rebuildContextMenu();
});

async function rebuildContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();

  const prefs = await getPreferences();

  if (prefs.defaultFormat !== "original") {
    chrome.contextMenus.create({
      id: QUICK_SAVE_ID,
      title: `Save as ${prefs.defaultFormat.toUpperCase()} → ${prefs.defaultFolder}/`,
      contexts: ["image"],
    });
  }

  chrome.contextMenus.create({
    id: SUBMENU_ID,
    title: "Save Image As",
    contexts: ["image"],
  });

  for (const format of FORMATS) {
    chrome.contextMenus.create({
      id: `${SUBMENU_ID}-${format}`,
      parentId: SUBMENU_ID,
      title: format.toUpperCase(),
      contexts: ["image"],
    });
  }

  chrome.contextMenus.create({
    id: `${SUBMENU_ID}-original`,
    parentId: SUBMENU_ID,
    title: "Save original",
    contexts: ["image"],
  });

  console.log(LOG_PREFIX, "context menu rebuilt", { defaultFormat: prefs.defaultFormat, defaultFolder: prefs.defaultFolder });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log(LOG_PREFIX, "menu item clicked", info.menuItemId, info.srcUrl);
  if (!info.srcUrl || !tab?.id) return;

  if (info.menuItemId === QUICK_SAVE_ID) {
    void handleQuickSave(info, tab.id);
    return;
  }

  if (info.menuItemId === `${SUBMENU_ID}-original`) {
    void handleSaveRequest(info, tab.id, "original");
    return;
  }

  const match = FORMATS.find((f) => info.menuItemId === `${SUBMENU_ID}-${f}`);
  if (match) {
    void handleSaveRequest(info, tab.id, match);
  }
});

async function handleQuickSave(info: chrome.contextMenus.OnClickData, tabId: number): Promise<void> {
  const prefs = await getPreferences();
  await handleSaveRequest(info, tabId, prefs.defaultFormat, prefs.defaultFolder);
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

async function handleSaveRequest(
  info: chrome.contextMenus.OnClickData,
  tabId: number,
  format: DefaultFormat,
  folder?: string
): Promise<void> {
  try {
    const resolved = await resolveSource(info, tabId);

    const prefs = await getPreferences();
    const saveAs = prefs.saveMode === "ask";

    let blob: Blob;
    if (resolved.inlineBlob) {
      // A blob: source whose bytes were already read in-page (the extension
      // background can't fetch a page-scoped blob: URL directly).
      blob = base64ToBlob(resolved.inlineBlob.base64, resolved.inlineBlob.mime);
    } else if (resolved.url.startsWith("blob:")) {
      // In-page resolution couldn't reach this blob: source either — nothing
      // left to try.
      throw new ConversionError({
        reason: "unsupported-source",
        message: "This image uses a temporary in-page source Save Image As can't reach.",
      });
    } else {
      // Try a direct fetch first — many images need no special permission at
      // all. Only fall back to requesting access if that actually fails.
      console.log(LOG_PREFIX, "fetching", resolved.url);
      // Best-effort mitigation for hotlink-protected image hosts (they check
      // Referer and silently serve a placeholder instead of erroring — see
      // docs/site-compatibility.md). info.pageUrl is the page the image was
      // actually found on, which is what a real browser navigation would send.
      const referrer = info.pageUrl;
      try {
        blob = await fetchImageBlob(resolved.url, referrer);
      } catch (err) {
        if (!(err instanceof ConversionError) || err.failure.reason !== "protected-source") {
          throw err;
        }
        console.log(LOG_PREFIX, "fetch blocked, requesting origin permission (best effort)", resolved.url);
        const granted = await tryRequestOriginPermission(resolved.url);
        if (!granted) {
          throw new ConversionError({
            reason: "permission-denied",
            message:
              'Save Image As doesn\'t have permission to read images from this site yet. Open the extension\'s Settings and turn on "Allow on all sites," then try again.',
          });
        }
        blob = await fetchImageBlob(resolved.url, referrer);
      }
    }

    if (format === "original") {
      const filename = buildOriginalFilename(resolved.url, folder);
      console.log(LOG_PREFIX, "downloading original", filename);
      await downloadBlob(blob, filename, saveAs);
      return;
    }

    console.log(LOG_PREFIX, "decoding");
    const bitmap = await decodeImage(blob);
    console.log(LOG_PREFIX, "encoding as", format);
    const encoded = await encodeImage(bitmap, format, prefs.jpgQuality);
    const filename = buildFilename(resolved.url, format, folder);
    console.log(LOG_PREFIX, "downloading", filename);
    await downloadBlob(encoded, filename, saveAs);
    console.log(LOG_PREFIX, "done", filename);
  } catch (err) {
    console.error(LOG_PREFIX, "save failed", err);
    const message =
      err instanceof ConversionError ? err.failure.message : "Something went wrong saving this image. Please try again.";
    notifyFailure(message);
  }
}
