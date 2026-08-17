import type { ResolvedSource } from "../lib/image-core/types";

/**
 * Injected into the page via chrome.scripting.executeScript({ func }) at the
 * moment of a right-click on an image — resolves the ACTUAL highest-quality
 * source available (srcset/<picture>/linked-original), not just whatever
 * thumbnail URL Chrome's contextMenus API happened to hand us.
 *
 * MUST STAY FULLY SELF-CONTAINED: `func`-mode injection serializes this
 * function by its own source text and re-runs it standalone in the page —
 * it cannot close over anything outside its own body (no imports, no
 * references to sibling functions in this module). That's why the
 * srcset-parsing/scoring logic below is a duplicate of the tested pure
 * version in `lib/image-core/srcset.ts`, not a call into it — keep them in
 * sync if you change the parsing/ranking rules. See docs/architecture.md
 * "Phase 2 source detection" and docs/site-compatibility.md.
 *
 * Never throws outward: any internal failure just resolves to the original
 * srcUrl unchanged, so the caller can always fall back to Phase 1 behavior.
 */
export function resolveImageInPage(srcUrl: string, linkUrl: string | null): Promise<ResolvedSource> {
  return (async (): Promise<ResolvedSource> => {
    const fallback: ResolvedSource = { url: srcUrl, width: 0, height: 0 };

    try {
      type Candidate = { url: string; width: number; density: number; height: number };

      const resolveUrl = (url: string): string => {
        try {
          return new URL(url, document.baseURI).href;
        } catch {
          return "";
        }
      };

      const parseSrcset = (srcset: string): Candidate[] =>
        srcset
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [rawUrl, descriptor] = part.split(/\s+/);
            const widthMatch = /^(\d+)w$/.exec(descriptor ?? "");
            const densityMatch = /^([\d.]+)x$/.exec(descriptor ?? "");
            return {
              url: resolveUrl(rawUrl ?? ""),
              width: widthMatch ? Number(widthMatch[1]) : 0,
              density: widthMatch ? 0 : densityMatch ? Number(densityMatch[1]) : 1,
              height: 0,
            };
          })
          .filter((c) => c.url.length > 0);

      // See lib/image-core/srcset.ts candidateScore() for the full reasoning:
      // a bare density descriptor (e.g. "2x", no width given at all) is
      // scored as density*1000 rather than 0, because sites very commonly
      // serve their higher-res variant that way (confirmed live on
      // Wikipedia's own article images: src="250px-cat.jpg" + srcset="500px-
      // cat.jpg 2x" — ranking by raw width alone picked the smaller,
      // precisely-known-width image over the genuinely larger density-only one).
      const score = (c: { width: number; density: number }): number => (c.width > 0 ? c.width : c.density * 1000);

      // Checks ONLY the pathname, not the full URL string — a viewer/redirect
      // page that embeds the real image URL as a query param (e.g. Google
      // Images' /imgres?imgurl=https://example.com/photo.jpg?token=...&...)
      // would otherwise false-positive on the embedded "...jpg?token=..."
      // substring even though the OUTER url isn't an image at all.
      const isLikelyImageUrl = (url: string): boolean => {
        try {
          return /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(new URL(url).pathname);
        } catch {
          return false;
        }
      };

      const candidates: Candidate[] = [];

      const images = Array.from(document.images);
      const el = images.find((img) => img.currentSrc === srcUrl || img.src === srcUrl) ?? null;

      if (el) {
        candidates.push({ url: el.currentSrc || el.src, width: el.naturalWidth || 0, density: 0, height: el.naturalHeight || 0 });

        if (el.srcset) {
          candidates.push(...parseSrcset(el.srcset));
        }

        const picture = el.closest("picture");
        if (picture) {
          for (const source of Array.from(picture.querySelectorAll("source"))) {
            // <picture> is also used for ART DIRECTION, not just resolution
            // switching: different <source media="..."> entries can point at
            // COMPLETELY DIFFERENT images for different viewports (confirmed
            // live in Wikipedia's own footer markup — a button graphic swaps
            // for a logo graphic below a breakpoint, not just a resized
            // version of the same image). Only consider a <source> whose
            // media condition is actually active right now, the same rule
            // the browser itself uses to pick which one applies — otherwise
            // we could save a visually different image than the one displayed.
            const media = source.getAttribute("media");
            if (media && !window.matchMedia(media).matches) continue;
            const srcset = source.getAttribute("srcset");
            if (srcset) candidates.push(...parseSrcset(srcset));
          }
        }
      }

      if (linkUrl && isLikelyImageUrl(linkUrl)) {
        // We can't know the linked file's real dimensions without an extra
        // fetch, so use a heuristic: rank it just above whatever we already
        // know about, rather than assuming it's automatically the best.
        const maxKnownScore = candidates.reduce((max, c) => Math.max(max, score(c)), 0);
        candidates.push({ url: resolveUrl(linkUrl), width: maxKnownScore + 1, density: 0, height: 0 });
      }

      if (candidates.length === 0) {
        candidates.push({ ...fallback, density: 0 });
      }

      candidates.sort((a, b) => score(b) - score(a));
      const best = candidates[0] ?? fallback;

      if (best.url.startsWith("blob:")) {
        const res = await fetch(best.url);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return {
          url: best.url,
          width: best.width,
          height: best.height,
          inlineBlob: { base64: btoa(binary), mime: res.headers.get("content-type") || "application/octet-stream" },
        };
      }

      return { url: best.url, width: best.width, height: best.height };
    } catch {
      return fallback;
    }
  })();
}
