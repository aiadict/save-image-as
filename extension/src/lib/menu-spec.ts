// Pure description of the right-click menu for a given set of preferences.
// background/index.ts turns each entry into a chrome.contextMenus.create()
// call; keeping the structure here, free of chrome.* APIs, lets the exact
// menu be unit-tested (menu-spec.test.ts).

import type { Preferences, SizeBudget } from "./storage";
import type { OutputFormat } from "./image-core/types";

export const SUBMENU_ID = "save-image-as-submenu";
export const QUICK_SAVE_ID = "save-image-as-quick-save";
export const COMPRESSED_ID = "save-image-as-compressed";
export const ORIGINAL_ID = `${SUBMENU_ID}-original`;

export const FORMATS: readonly OutputFormat[] = ["png", "jpg", "webp", "avif", "pdf"];

export const SIZE_BUDGET_LABEL: Record<SizeBudget, string> = {
  chat: "1MB",
  web: "200KB",
};

export function formatItemId(format: OutputFormat): string {
  return `${SUBMENU_ID}-${format}`;
}

export interface MenuEntry {
  id: string;
  title: string;
  parentId?: string;
}

export function buildMenuSpec(prefs: Pick<Preferences, "defaultFormat" | "defaultFolder" | "sizeBudget">): MenuEntry[] {
  const entries: MenuEntry[] = [];

  if (prefs.defaultFormat !== "original") {
    entries.push({
      id: QUICK_SAVE_ID,
      title: `Save as ${prefs.defaultFormat.toUpperCase()} → ${prefs.defaultFolder}/`,
    });
  }

  entries.push({ id: SUBMENU_ID, title: "Save Image As" });

  for (const format of FORMATS) {
    entries.push({ id: formatItemId(format), parentId: SUBMENU_ID, title: format.toUpperCase() });
  }

  entries.push({
    id: COMPRESSED_ID,
    parentId: SUBMENU_ID,
    title: `Compressed (WebP, under ${SIZE_BUDGET_LABEL[prefs.sizeBudget]})`,
  });

  entries.push({ id: ORIGINAL_ID, parentId: SUBMENU_ID, title: "Save original" });

  return entries;
}
