// chrome.downloads wrapper. Converts blobs to base64 data URLs rather than
// object URLs before handing them to chrome.downloads.download — an object
// URL can go stale if the MV3 service worker is recycled between encode and
// download; a self-contained data URL can't. See docs/architecture.md
// "End-to-end data flow" for the trade-off (fine for single images; revisit
// for Phase 3 batch downloads of many large files).

import { arrayBufferToBase64 } from "./base64";

export async function downloadBlob(blob: Blob, filename: string, saveAs: boolean): Promise<number> {
  const url = await blobToDataUrl(blob);
  return chrome.downloads.download({ url, filename, saveAs });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
}
