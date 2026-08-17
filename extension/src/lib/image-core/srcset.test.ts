import { describe, expect, it } from "vitest";
import { candidateScore, isLikelyImageUrl, parseSrcset, rankByScore } from "./srcset";

describe("parseSrcset", () => {
  const base = "https://example.com/gallery/";

  it("parses width-descriptor candidates and resolves them against the base URL", () => {
    const result = parseSrcset("photo-480.jpg 480w, photo-800.jpg 800w, photo-1600.jpg 1600w", base);
    expect(result).toEqual([
      { url: "https://example.com/gallery/photo-480.jpg", width: 480, density: 0 },
      { url: "https://example.com/gallery/photo-800.jpg", width: 800, density: 0 },
      { url: "https://example.com/gallery/photo-1600.jpg", width: 1600, density: 0 },
    ]);
  });

  it("parses density descriptors (2x) as width=0 with the density recorded", () => {
    const result = parseSrcset("photo.jpg 1x, photo@2x.jpg 2x", base);
    expect(result).toEqual([
      { url: "https://example.com/gallery/photo.jpg", width: 0, density: 1 },
      { url: "https://example.com/gallery/photo@2x.jpg", width: 0, density: 2 },
    ]);
  });

  it("handles a single candidate with no descriptor at all (implicit 1x)", () => {
    expect(parseSrcset("photo.jpg", base)).toEqual([
      { url: "https://example.com/gallery/photo.jpg", width: 0, density: 1 },
    ]);
  });

  it("resolves absolute URLs unchanged", () => {
    const result = parseSrcset("https://cdn.example.com/full.jpg 2000w", base);
    expect(result).toEqual([{ url: "https://cdn.example.com/full.jpg", width: 2000, density: 0 }]);
  });

  it("drops empty entries from stray commas/whitespace", () => {
    expect(parseSrcset("photo.jpg 480w, , photo2.jpg 800w", base)).toHaveLength(2);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseSrcset("", base)).toEqual([]);
  });
});

describe("isLikelyImageUrl", () => {
  it.each([
    "https://example.com/full/photo.jpg",
    "https://example.com/full/photo.JPEG",
    "https://example.com/full/photo.png?v=2",
    "https://example.com/full/photo.webp#frag",
    "https://example.com/full/photo.avif",
  ])("accepts %s", (url) => {
    expect(isLikelyImageUrl(url)).toBe(true);
  });

  it.each(["https://example.com/articles/some-post", "https://example.com/photo.html", "https://example.com/photo"])(
    "rejects %s",
    (url) => {
      expect(isLikelyImageUrl(url)).toBe(false);
    }
  );

  it("rejects a viewer/redirect page that embeds a real image URL as a query param (regression: Google Images /imgres)", () => {
    const googleImgres =
      "https://www.google.com/imgres?q=cat&imgurl=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Fthumb%2F4%2F4d%2FCat_November_2010-1a.jpg%2F960px-Cat_November_2010-1a.jpg%3Futm_source%3Dpl.wikipedia.org&imgrefurl=https%3A%2F%2Fpl.wikipedia.org%2Fwiki%2FPlik%3ACat_November_2010-1a.jpg";
    expect(isLikelyImageUrl(googleImgres)).toBe(false);

    // Also cover the case where the embedded param isn't percent-encoded at
    // all, which is what actually fooled the old full-string regex: a raw
    // ".jpg?" substring appears inside the query string, not at the end of
    // the outer URL's own path.
    const partiallyEncoded = "https://www.google.com/imgres?imgurl=https://example.com/photo.jpg?utm_source=foo&imgrefurl=bar";
    expect(isLikelyImageUrl(partiallyEncoded)).toBe(false);
  });
});

describe("candidateScore / rankByScore", () => {
  it("sorts descending by known width when all candidates have one", () => {
    const result = rankByScore([
      { width: 480, density: 0 },
      { width: 1600, density: 0 },
      { width: 800, density: 0 },
    ]);
    expect(result.map((c) => c.width)).toEqual([1600, 800, 480]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { width: 100, density: 0 },
      { width: 200, density: 0 },
    ];
    const result = rankByScore(input);
    expect(input.map((c) => c.width)).toEqual([100, 200]);
    expect(result).not.toBe(input);
  });

  it("ranks a 2x density candidate above a smaller precisely-known width (regression: Wikipedia's 250px-src + 2x-srcset pattern)", () => {
    // src="250px-cat.jpg" (naturalWidth 250, exactly known) +
    // srcset="500px-cat.jpg 2x" (width unknown, density 2) — the 2x variant
    // IS the genuinely larger image and must win.
    const displayed = { url: "250px-cat.jpg", width: 250, density: 0 };
    const densityVariant = { url: "500px-cat.jpg", width: 0, density: 2 };
    const [best] = rankByScore([displayed, densityVariant]);
    expect(best!.url).toBe("500px-cat.jpg");
  });

  it("still lets a genuinely large known width beat a modest density claim", () => {
    const huge = { url: "huge.jpg", width: 5000, density: 0 };
    const modestDensity = { url: "2x.jpg", width: 0, density: 2 };
    const [best] = rankByScore([modestDensity, huge]);
    expect(best!.url).toBe("huge.jpg");
  });

  it("ranks higher density above lower density when neither has a known width", () => {
    const result = rankByScore([
      { width: 0, density: 1 },
      { width: 0, density: 3 },
      { width: 0, density: 2 },
    ]);
    expect(result.map((c) => c.density)).toEqual([3, 2, 1]);
  });

  it("candidateScore treats width as authoritative over density when both are somehow present", () => {
    expect(candidateScore({ width: 300, density: 5 })).toBe(300);
  });
});
