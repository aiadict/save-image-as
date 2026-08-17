// Pure, DOM-free parsing/ranking logic for image source detection.
//
// This is the TESTED source of truth for this logic — but it is NOT called
// directly by the actual runtime resolver. `chrome.scripting.executeScript`'s
// `func` injection mode serializes the function by its own source text only;
// it cannot carry closures over other module-scope functions, so the real
// in-page resolver (`background/resolve-in-page.ts`) has to inline an
// equivalent, self-contained copy of this same parsing logic to run inside
// the page. Keep the two in sync if you change one — see the comment at the
// top of resolve-in-page.ts.

export interface SrcsetCandidate {
  url: string;
  /** Declared width in px from a "NNNw" descriptor; 0 if this entry uses a density descriptor instead (the two are mutually exclusive per spec). */
  width: number;
  /** Declared multiplier from a "Nx" descriptor; defaults to 1 when neither descriptor is present; 0 when a width descriptor IS present. */
  density: number;
}

/** Parses a srcset attribute value into absolute-URL candidates. */
export function parseSrcset(srcset: string, baseUrl: string): SrcsetCandidate[] {
  return srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawUrl, descriptor] = part.split(/\s+/);
      const widthMatch = /^(\d+)w$/.exec(descriptor ?? "");
      const densityMatch = /^([\d.]+)x$/.exec(descriptor ?? "");
      return {
        url: resolveUrl(rawUrl ?? "", baseUrl),
        width: widthMatch ? Number(widthMatch[1]) : 0,
        density: widthMatch ? 0 : densityMatch ? Number(densityMatch[1]) : 1,
      };
    })
    .filter((c) => c.url.length > 0);
}

function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
  }
}

/**
 * Heuristic: does this URL look like it points directly at an image file?
 * Used to decide whether a wrapping <a href> is plausibly a "linked
 * full-size original" rather than an unrelated page link.
 *
 * Checks ONLY the URL's own pathname, not the full string — a viewer/redirect
 * page that embeds the real image URL as a query parameter (e.g. Google
 * Images' `/imgres?imgurl=https://example.com/photo.jpg?token=...&...`) would
 * otherwise false-positive: the embedded "...jpg?token=..." substring matches
 * an extension-then-query-boundary pattern even though the OUTER url isn't an
 * image at all. Anchoring to `new URL(url).pathname` sidesteps that entirely,
 * since pathname never includes the query string.
 */
export function isLikelyImageUrl(url: string): boolean {
  try {
    return /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * A single comparable "how good is this candidate" score.
 *
 * BUG THIS FIXES (confirmed live on Wikipedia's own article images, not
 * hypothetical): sites very commonly serve their higher-resolution variant
 * via a bare density descriptor with NO width descriptor at all — e.g.
 * `src=".../250px-cat.jpg" srcset=".../500px-cat.jpg 2x"`. The currently
 * displayed 250px image has a real, precisely-known width (250, from
 * naturalWidth); the genuinely-larger 500px "2x" variant has width=0
 * because it carries a density descriptor instead. Ranking by raw width
 * alone made the unknown-width (0) candidate lose to the known-but-smaller
 * one — i.e. "highest resolution available" was picking the LOWER
 * resolution image, exactly backwards.
 *
 * Fix: a bare density descriptor is scored as `density * 1000` rather than
 * 0 — treating "declared 2x" as roughly comparable to "declared ~2000px",
 * which is a coarse but directionally-correct heuristic for the common
 * case (density descriptors are almost always small integers like 1/1.5/2/3,
 * and a real declared pixel width big enough to matter is usually in the
 * hundreds-to-thousands range). An explicit, large known width from another
 * candidate can still outrank a modest density claim, and a genuinely small
 * density source correctly sorts below a genuinely large known width.
 */
export function candidateScore(c: { width: number; density: number }): number {
  return c.width > 0 ? c.width : c.density * 1000;
}

/** Highest-scoring candidate first — see candidateScore() for the ranking rule. */
export function rankByScore<T extends { width: number; density: number }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a));
}
