import { describe, expect, it } from "vitest";
import { bulkFolder, imageType, rankPageImages } from "./page-images";
import type { PageScan, ScannedImage } from "./scan-in-page";

const BASE = "https://example.com/blog/post.html";

function img(patch: Partial<ScannedImage>): ScannedImage {
  return {
    src: "https://example.com/a.jpg",
    srcsets: [],
    lazySrc: null,
    linkUrl: null,
    naturalWidth: 400,
    naturalHeight: 300,
    alt: "",
    kind: "img",
    ...patch,
  };
}

function scan(images: ScannedImage[]): PageScan {
  return { pageUrl: BASE, baseUrl: BASE, title: "Post", images };
}

describe("rankPageImages", () => {
  it("keeps a plain image with its natural size", () => {
    const { images } = rankPageImages(scan([img({ alt: "A cat" })]));
    expect(images).toEqual([
      { url: "https://example.com/a.jpg", thumb: "https://example.com/a.jpg", width: 400, height: 300, alt: "A cat", type: "jpg" },
    ]);
  });

  it("picks the widest srcset candidate, resolved against the page, and scales the height", () => {
    const { images } = rankPageImages(scan([img({ srcsets: ["a-400.jpg 400w, a-1600.jpg 1600w"] })]));
    expect(images[0]).toMatchObject({ url: "https://example.com/blog/a-1600.jpg", thumb: "https://example.com/a.jpg", width: 1600, height: 1200 });
  });

  it("ranks a density descriptor above the displayed size, like a right-click save", () => {
    const { images } = rankPageImages(scan([img({ naturalWidth: 250, naturalHeight: 250, srcsets: ["a-500.jpg 2x"] })]));
    expect(images[0]!.url).toBe("https://example.com/blog/a-500.jpg");
  });

  it("prefers a linked image file as the full-size original", () => {
    const { images } = rankPageImages(scan([img({ linkUrl: "https://example.com/full/a.png" })]));
    expect(images[0]).toMatchObject({ url: "https://example.com/full/a.png", type: "png", width: 400 });
  });

  it("ignores links to pages", () => {
    const { images } = rankPageImages(scan([img({ linkUrl: "https://example.com/gallery/a" })]));
    expect(images[0]!.url).toBe("https://example.com/a.jpg");
  });

  it("uses data-src when the displayed image is a placeholder", () => {
    const { images } = rankPageImages(
      scan([img({ src: "data:image/gif;base64,R0lGOD", naturalWidth: 1, naturalHeight: 1, lazySrc: "https://example.com/real.webp" })])
    );
    expect(images[0]).toMatchObject({ url: "https://example.com/real.webp", thumb: "https://example.com/real.webp", width: 0, type: "webp" });
  });

  it("drops tracking pixels and page blob: URLs", () => {
    const { images } = rankPageImages(
      scan([img({ src: "https://t.example/p.gif", naturalWidth: 1, naturalHeight: 1 }), img({ src: "blob:https://example.com/123" })])
    );
    expect(images).toEqual([]);
  });

  it("merges entries that share a source URL and keeps the better one in the first position", () => {
    const { images } = rankPageImages(
      scan([
        img({ src: "https://example.com/hero-400.jpg" }),
        img({ src: "https://example.com/other.png" }),
        img({ src: "https://example.com/hero-400.jpg", srcsets: ["hero-2000.jpg 2000w"], alt: "Hero" }),
        img({ src: "https://example.com/blog/hero-2000.jpg", kind: "css", naturalWidth: 0, naturalHeight: 0 }),
      ])
    );
    expect(images.map((i) => i.url)).toEqual(["https://example.com/blog/hero-2000.jpg", "https://example.com/other.png"]);
    expect(images[0]!.alt).toBe("Hero");
  });

  it("caps the list and counts the rest", () => {
    const many = Array.from({ length: 5 }, (_, i) => img({ src: `https://example.com/${i}.jpg` }));
    const result = rankPageImages(scan(many), 3);
    expect(result.images).toHaveLength(3);
    expect(result.more).toBe(2);
  });
});

describe("imageType", () => {
  it.each([
    ["https://x.test/a.JPEG?w=2", "jpg"],
    ["https://x.test/a.svg", "svg"],
    ["data:image/svg+xml;utf8,<svg/>", "svg"],
    ["data:image/png;base64,AA", "png"],
    ["https://x.test/image?id=3", "other"],
  ])("%s → %s", (url, type) => {
    expect(imageType(url)).toBe(type);
  });
});

describe("bulkFolder", () => {
  it("puts each site in its own sub-folder", () => {
    expect(bulkFolder("SaveImageAs", "https://www.example.com/a")).toBe("SaveImageAs/example.com");
    expect(bulkFolder("Pics/Web/", "http://localhost:8080/")).toBe("Pics/Web/localhost-8080");
    expect(bulkFolder("", "not a url")).toBe("SaveImageAs/page");
  });
});
