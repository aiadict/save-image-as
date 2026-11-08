import { describe, expect, it } from "vitest";
import { buildMenuSpec, COMPRESSED_ID, ORIGINAL_ID, QUICK_SAVE_ID, SUBMENU_ID } from "./menu-spec";

const base = { defaultFormat: "png", defaultFolder: "SaveImageAs", sizeBudget: "chat", menuStyle: "full" } as const;

describe("buildMenuSpec", () => {
  it("puts everything under one top-level parent, so formats are one level deep", () => {
    expect(buildMenuSpec(base)).toEqual([
      { id: SUBMENU_ID, title: "Save Image As" },
      { id: QUICK_SAVE_ID, parentId: SUBMENU_ID, title: "Save as PNG → SaveImageAs/" },
      { id: `${SUBMENU_ID}-separator-formats`, parentId: SUBMENU_ID, type: "separator" },
      { id: `${SUBMENU_ID}-png`, parentId: SUBMENU_ID, title: "PNG" },
      { id: `${SUBMENU_ID}-jpg`, parentId: SUBMENU_ID, title: "JPG" },
      { id: `${SUBMENU_ID}-webp`, parentId: SUBMENU_ID, title: "WebP" },
      { id: `${SUBMENU_ID}-avif`, parentId: SUBMENU_ID, title: "AVIF" },
      { id: `${SUBMENU_ID}-pdf`, parentId: SUBMENU_ID, title: "PDF" },
      { id: `${SUBMENU_ID}-separator-more`, parentId: SUBMENU_ID, type: "separator" },
      { id: COMPRESSED_ID, parentId: SUBMENU_ID, title: "Compressed (WebP, under 1 MB)" },
      { id: ORIGINAL_ID, parentId: SUBMENU_ID, title: "Original file" },
    ]);
  });

  it("has exactly one top-level item in every style (Chrome shows it directly)", () => {
    for (const menuStyle of ["full", "oneClick"] as const) {
      expect(buildMenuSpec({ ...base, menuStyle }).filter((e) => !e.parentId)).toHaveLength(1);
    }
  });

  it("uses the default format and folder in the quick item", () => {
    const spec = buildMenuSpec({ ...base, defaultFormat: "webp", defaultFolder: "Photos/2026" });
    expect(spec.find((e) => e.id === QUICK_SAVE_ID)?.title).toBe("Save as WebP → Photos/2026/");
  });

  it("offers Original as a one-click default", () => {
    const spec = buildMenuSpec({ ...base, defaultFormat: "original" });
    expect(spec.find((e) => e.id === QUICK_SAVE_ID)?.title).toBe("Save original → SaveImageAs/");
  });

  it("one-click style is just the quick item, at the top level", () => {
    expect(buildMenuSpec({ ...base, menuStyle: "oneClick", defaultFormat: "jpg" })).toEqual([
      { id: QUICK_SAVE_ID, title: "Save as JPG → SaveImageAs/" },
    ]);
  });

  it("labels the compressed item with the chosen size budget", () => {
    const spec = buildMenuSpec({ ...base, sizeBudget: "web" });
    expect(spec.find((e) => e.id === COMPRESSED_ID)?.title).toBe("Compressed (WebP, under 200 KB)");
  });

  it("gives every entry a unique id", () => {
    const ids = buildMenuSpec(base).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
