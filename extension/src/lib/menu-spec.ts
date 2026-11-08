// Pure description of the right-click menu for a given set of preferences.
// background/index.ts turns each entry into a chrome.contextMenus.create()
// call; keeping the structure here, free of chrome.* APIs, lets the exact
// menu be unit-tested (menu-spec.test.ts).
//
// Chrome folds an extension's top-level items into one parent named after
// the extension as soon as there are two or more. So everything lives under
// a single "Save Image As" parent (shown directly in Chrome's menu), and the
// one-click-only style uses a single top-level item, which Chrome shows
// directly too: right-click, then click. See docs/architecture.md
// "Right-click menu".

import type { Preferences, SizeBudget } from "./storage";
import type { OutputFormat } from "./image-core/types";

export const SUBMENU_ID = "save-image-as-submenu";
export const QUICK_SAVE_ID = "save-image-as-quick-save";
export const COMPRESSED_ID = "save-image-as-compressed";
export const ORIGINAL_ID = `${SUBMENU_ID}-original`;

export const FORMATS: readonly OutputFormat[] = ["png", "jpg", "webp", "avif", "pdf"];

const FORMAT_LABEL: Record<OutputFormat, string> = {
  png: "PNG",
  jpg: "JPG",
  webp: "WebP",
  avif: "AVIF",
  pdf: "PDF",
};

export const SIZE_BUDGET_LABEL: Record<SizeBudget, string> = {
  chat: "1 MB",
  web: "200 KB",
};

export function formatItemId(format: OutputFormat): string {
  return `${SUBMENU_ID}-${format}`;
}

export interface MenuEntry {
  id: string;
  title?: string;
  parentId?: string;
  type?: "separator";
}

type MenuPrefs = Pick<Preferences, "defaultFormat" | "defaultFolder" | "sizeBudget" | "menuStyle">;

export function quickSaveTitle(prefs: Pick<Preferences, "defaultFormat" | "defaultFolder">): string {
  const what = prefs.defaultFormat === "original" ? "Save original" : `Save as ${FORMAT_LABEL[prefs.defaultFormat]}`;
  return `${what} → ${prefs.defaultFolder}/`;
}

export function buildMenuSpec(prefs: MenuPrefs): MenuEntry[] {
  if (prefs.menuStyle === "oneClick") {
    return [{ id: QUICK_SAVE_ID, title: quickSaveTitle(prefs) }];
  }

  const entries: MenuEntry[] = [
    { id: SUBMENU_ID, title: "Save Image As" },
    { id: QUICK_SAVE_ID, parentId: SUBMENU_ID, title: quickSaveTitle(prefs) },
    { id: `${SUBMENU_ID}-separator-formats`, parentId: SUBMENU_ID, type: "separator" },
  ];

  for (const format of FORMATS) {
    entries.push({ id: formatItemId(format), parentId: SUBMENU_ID, title: FORMAT_LABEL[format] });
  }

  entries.push(
    { id: `${SUBMENU_ID}-separator-more`, parentId: SUBMENU_ID, type: "separator" },
    { id: COMPRESSED_ID, parentId: SUBMENU_ID, title: `Compressed (WebP, under ${SIZE_BUDGET_LABEL[prefs.sizeBudget]})` },
    { id: ORIGINAL_ID, parentId: SUBMENU_ID, title: "Original file" }
  );

  return entries;
}
