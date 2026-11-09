// Hands a page scan from the popup to the gallery tab it opens, through
// chrome.storage.session: in memory only, never synced, and cleared when the
// browser closes. Keyed by a random id in the gallery's URL hash.

import type { GalleryData } from "./page-images";

const PREFIX = "gallery:";
/** Older scans are dropped once this many are kept (each is ~100 KB at most). */
const KEEP = 10;

interface StoredGallery extends GalleryData {
  createdAt: number;
}

export async function storeGallery(data: GalleryData): Promise<string> {
  const all = (await chrome.storage.session.get(null)) as Record<string, StoredGallery>;
  const old = Object.entries(all)
    .filter(([key]) => key.startsWith(PREFIX))
    .sort(([, a], [, b]) => b.createdAt - a.createdAt)
    .slice(KEEP - 1)
    .map(([key]) => key);
  if (old.length) await chrome.storage.session.remove(old);

  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [PREFIX + id]: { ...data, createdAt: Date.now() } satisfies StoredGallery });
  return id;
}

export async function loadGallery(id: string): Promise<GalleryData | null> {
  const key = PREFIX + id;
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as StoredGallery | undefined) ?? null;
}
