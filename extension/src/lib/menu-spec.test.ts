import { describe, expect, it } from "vitest";
import { buildMenuSpec, COMPRESSED_ID, ORIGINAL_ID, QUICK_SAVE_ID, SUBMENU_ID } from "./menu-spec";

const base = { defaultFormat: "png", defaultFolder: "SaveImageAs", sizeBudget: "chat" } as const;

describe("buildMenuSpec", () => {
  it("builds today's menu: a top-level quick item plus a format submenu", () => {
    expect(buildMenuSpec(base)).toEqual([
      { id: QUICK_SAVE_ID, title: "Save as PNG → SaveImageAs/" },
      { id: SUBMENU_ID, title: "Save Image As" },
      { id: `${SUBMENU_ID}-png`, parentId: SUBMENU_ID, title: "PNG" },
      { id: `${SUBMENU_ID}-jpg`, parentId: SUBMENU_ID, title: "JPG" },
      { id: `${SUBMENU_ID}-webp`, parentId: SUBMENU_ID, title: "WEBP" },
      { id: `${SUBMENU_ID}-avif`, parentId: SUBMENU_ID, title: "AVIF" },
      { id: `${SUBMENU_ID}-pdf`, parentId: SUBMENU_ID, title: "PDF" },
      { id: COMPRESSED_ID, parentId: SUBMENU_ID, title: "Compressed (WebP, under 1MB)" },
      { id: ORIGINAL_ID, parentId: SUBMENU_ID, title: "Save original" },
    ]);
  });

  it("uses the default format and folder in the quick item", () => {
    const spec = buildMenuSpec({ ...base, defaultFormat: "jpg", defaultFolder: "Photos/2026" });
    expect(spec[0]).toEqual({ id: QUICK_SAVE_ID, title: "Save as JPG → Photos/2026/" });
  });

  it("omits the quick item when the default is Original", () => {
    const spec = buildMenuSpec({ ...base, defaultFormat: "original" });
    expect(spec.some((e) => e.id === QUICK_SAVE_ID)).toBe(false);
    expect(spec[0]?.id).toBe(SUBMENU_ID);
  });

  it("labels the compressed item with the chosen size budget", () => {
    const spec = buildMenuSpec({ ...base, sizeBudget: "web" });
    expect(spec.find((e) => e.id === COMPRESSED_ID)?.title).toBe("Compressed (WebP, under 200KB)");
  });

  it("gives every entry a unique id", () => {
    const ids = buildMenuSpec(base).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
