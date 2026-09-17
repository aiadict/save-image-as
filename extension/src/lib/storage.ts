// Typed chrome.storage.sync wrapper for user preferences.
// See docs/architecture.md "Storage schema" — this is the ONLY persisted
// state; never add image URLs, filenames, or browsing history here.

export type SaveMode = "ask" | "quick";
export type DefaultFormat = "png" | "jpg" | "webp" | "avif" | "pdf" | "original";
/** Target size for the context menu's "Compressed" item — see image-core/size-search.ts. */
export type SizeBudget = "chat" | "web";

export interface Preferences {
  saveMode: SaveMode;
  defaultFormat: DefaultFormat;
  defaultFolder: string;
  jpgQuality: number;
  hasCompletedOnboarding: boolean;
  /**
   * When true, a converted file is named from the source image's alt text
   * (when present and non-empty) instead of its CDN filename — e.g.
   * "golden-retriever-puppy.jpg" instead of "IMG_20938.jpg". Falls back to
   * the original-URL basename whenever alt text is missing. Default true:
   * this only ever replaces an already-arbitrary CDN name, so the fallback
   * chain means there's no meaningful downside to leaving it on.
   */
  useDescriptiveFilenames: boolean;
  /** Byte target for the "Compressed" context-menu item. See image-core/size-search.ts for the thresholds. */
  sizeBudget: SizeBudget;
  /**
   * Set by the background pipeline when a save fails specifically because
   * "Allow on all sites" wasn't granted; cleared on a successful save or
   * once the user grants/dismisses it. Drives the reactive permission
   * banner in the popup — see docs/architecture.md "Reactive permission
   * prompt". Deliberately NOT surfaced by default to everyone; only shown
   * to someone who just actually hit the problem.
   */
  lastSaveBlockedByPermission: boolean;
  /** Origin of the site that triggered the block above, for a concrete banner message; "" if unknown. */
  lastBlockedOrigin: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  saveMode: "ask",
  defaultFormat: "png",
  defaultFolder: "SaveImageAs",
  jpgQuality: 0.92,
  hasCompletedOnboarding: false,
  useDescriptiveFilenames: true,
  sizeBudget: "chat",
  lastSaveBlockedByPermission: false,
  lastBlockedOrigin: "",
};

export async function getPreferences(): Promise<Preferences> {
  const stored = await chrome.storage.sync.get(DEFAULT_PREFERENCES);
  return stored as Preferences;
}

export async function setPreferences(patch: Partial<Preferences>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

export function onPreferencesChanged(callback: (prefs: Preferences) => void): void {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== "sync") return;
    void getPreferences().then(callback);
  });
}
