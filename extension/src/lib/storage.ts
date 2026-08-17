// Typed chrome.storage.sync wrapper for user preferences.
// See docs/architecture.md "Storage schema" — this is the ONLY persisted
// state; never add image URLs, filenames, or browsing history here.

export type SaveMode = "ask" | "quick";
export type DefaultFormat = "png" | "jpg" | "webp" | "avif" | "pdf" | "original";

export interface Preferences {
  saveMode: SaveMode;
  defaultFormat: DefaultFormat;
  defaultFolder: string;
  jpgQuality: number;
  hasCompletedOnboarding: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  saveMode: "ask",
  defaultFormat: "png",
  defaultFolder: "SaveImageAs",
  jpgQuality: 0.92,
  hasCompletedOnboarding: false,
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
