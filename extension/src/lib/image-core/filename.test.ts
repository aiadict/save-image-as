import { describe, expect, it } from "vitest";
import { buildFilename, buildOriginalFilename } from "./filename";

describe("buildFilename", () => {
  it("swaps the extension to match the target format", () => {
    expect(buildFilename("https://example.com/photos/sunset.webp", "jpg")).toBe("sunset.jpg");
  });

  it("prefixes the default sub-folder when one is set", () => {
    expect(buildFilename("https://example.com/img/cat.png", "webp", "SaveImageAs")).toBe("SaveImageAs/cat.webp");
  });

  it("sanitizes unsafe filesystem characters", () => {
    // Note: "?" isn't testable here — new URL() treats it as the query
    // delimiter, not a literal path character, before sanitize() ever runs.
    expect(buildFilename("https://example.com/img/weird:name*.png", "png")).toBe("weird-name-.png");
  });

  it("falls back to 'image' when the URL has no usable basename", () => {
    expect(buildFilename("https://example.com/", "png")).toBe("image.png");
  });

  it("falls back to 'image' for an unparsable URL", () => {
    expect(buildFilename("not-a-url", "jpg")).toBe("image.jpg");
  });

  it("falls back to 'image' for a data: URL instead of parsing the base64 payload as a path (regression)", () => {
    // The bug: new URL(dataUrl).pathname returns the ENTIRE base64 payload
    // (which can itself contain "/"), producing a huge garbage filename.
    const longPayload = "data:image/png;base64," + "A".repeat(5000) + "/" + "B".repeat(5000);
    const result = buildFilename(longPayload, "jpg");
    expect(result).toBe("image.jpg");
    expect(result.length).toBeLessThan(20);
  });

  it("truncates an excessively long basename instead of failing (regression: some CMS slugs are very long)", () => {
    const hugeSlug = "a".repeat(300);
    const result = buildFilename(`https://example.com/img/${hugeSlug}.png`, "jpg");
    expect(result.length).toBeLessThanOrEqual(124); // 120 + ".jpg"
    expect(result.endsWith(".jpg")).toBe(true);
  });

  describe("descriptive filenames (alt text)", () => {
    it("uses alt text over the CDN basename when provided", () => {
      expect(buildFilename("https://cdn.example.com/a8f3e9d1.jpg", "jpg", undefined, "Golden retriever puppy")).toBe(
        "Golden retriever puppy.jpg"
      );
    });

    it("falls back to the CDN basename when alt text is empty", () => {
      expect(buildFilename("https://cdn.example.com/a8f3e9d1.jpg", "jpg", undefined, "")).toBe("a8f3e9d1.jpg");
    });

    it("falls back to the CDN basename when alt text is whitespace-only", () => {
      expect(buildFilename("https://cdn.example.com/a8f3e9d1.jpg", "jpg", undefined, "   ")).toBe("a8f3e9d1.jpg");
    });

    it("falls back to the CDN basename when alt text is undefined (preference off)", () => {
      expect(buildFilename("https://cdn.example.com/a8f3e9d1.jpg", "jpg", undefined, undefined)).toBe("a8f3e9d1.jpg");
    });

    it("sanitizes unsafe characters in alt text the same way as URL-derived names", () => {
      expect(buildFilename("https://cdn.example.com/x.png", "png", undefined, 'weird:name*"?')).toBe("weird-name-.png");
    });

    it("truncates excessively long alt text (regression: some CMSes stuff alt text for SEO)", () => {
      const hugeAlt = "a".repeat(300);
      const result = buildFilename("https://cdn.example.com/x.png", "jpg", undefined, hugeAlt);
      expect(result.length).toBeLessThanOrEqual(124);
      expect(result.endsWith(".jpg")).toBe(true);
    });

    it("still prefixes the default sub-folder when alt text is used", () => {
      expect(buildFilename("https://cdn.example.com/x.png", "webp", "SaveImageAs", "Cat")).toBe("SaveImageAs/Cat.webp");
    });
  });
});

describe("buildOriginalFilename", () => {
  it("keeps the source's own extension", () => {
    expect(buildOriginalFilename("https://example.com/img/cat.avif")).toBe("cat.avif");
  });

  it("drops the extension when the source has none", () => {
    expect(buildOriginalFilename("https://example.com/img/cat")).toBe("cat");
  });

  it("prefixes the default sub-folder when one is set", () => {
    expect(buildOriginalFilename("https://example.com/img/cat.jpg", "SaveImageAs")).toBe("SaveImageAs/cat.jpg");
  });

  it("infers the extension from a data: URL's own MIME type instead of parsing it as a path (regression)", () => {
    expect(buildOriginalFilename("data:image/png;base64,iVBORw0KGgo=")).toBe("image.png");
    expect(buildOriginalFilename("data:image/svg+xml;base64,PHN2Zz4=")).toBe("image.svg");
  });

  it("uses alt text over the CDN basename when provided", () => {
    expect(buildOriginalFilename("https://cdn.example.com/a8f3e9d1.jpg", undefined, "Golden retriever puppy")).toBe(
      "Golden retriever puppy.jpg"
    );
  });
});
