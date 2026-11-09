// Turns a raw page scan (lib/scan-in-page.ts) into the gallery's list: the
// best source for each image, ranked with the same tested rules as a
// right-click save (lib/image-core/srcset.ts), de-duplicated and capped.

import { candidateScore, isLikelyImageUrl, parseSrcset, rankByScore } from "./image-core/srcset";
import type { PageScan, ScannedImage } from "./scan-in-page";

/** Most images one gallery shows; the rest are counted in `more`. */
export const MAX_GALLERY_IMAGES = 300;
/** Smaller than this on either side is a spacer, tracking pixel or bullet. */
const MIN_SIDE = 16;
/** Inline data: images longer than this are skipped (they'd fill session storage). */
const MAX_DATA_URL_LENGTH = 512 * 1024;

export type ImageType = "jpg" | "png" | "webp" | "avif" | "gif" | "svg" | "other";

export interface GalleryImage {
  /** The best source: what gets saved. */
  url: string;
  /** What the gallery shows as the thumbnail (usually the version the page already displayed). */
  thumb: string;
  /** Best known size of `url`; 0 when unknown. */
  width: number;
  height: number;
  alt: string;
  type: ImageType;
}

export interface GalleryData {
  pageUrl: string;
  title: string;
  images: GalleryImage[];
  /** Images left out past MAX_GALLERY_IMAGES. */
  more: number;
}

interface Candidate {
  url: string;
  width: number;
  density: number;
  isLink?: boolean;
}

function usable(url: string): boolean {
  if (url.startsWith("data:image/")) return url.length <= MAX_DATA_URL_LENGTH;
  // blob: URLs belong to the page and can't be read from the gallery.
  return /^https?:\/\//i.test(url);
}

export function imageType(url: string): ImageType {
  let ext = "";
  if (url.startsWith("data:")) {
    ext = /^data:image\/([a-z0-9.+-]+)/i.exec(url)?.[1] ?? "";
  } else {
    try {
      ext = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1] ?? "";
    } catch {
      ext = "";
    }
  }
  ext = ext.toLowerCase().replace(/\+xml$/, "");
  if (ext === "jpeg") return "jpg";
  return (["jpg", "png", "webp", "avif", "gif", "svg"] as const).find((t) => t === ext) ?? "other";
}

/** The best source for one scanned image, plus every URL that names the same picture. */
function bestSource(s: ScannedImage, baseUrl: string): { image: GalleryImage; score: number; keys: string[] } | null {
  // A lazy-loading placeholder (tiny or inline) stands in for data-src.
  const placeholder = !s.src || s.src.startsWith("data:") || (s.naturalWidth > 0 && s.naturalWidth < MIN_SIDE);
  const base = s.lazySrc && placeholder ? s.lazySrc : s.src;
  const baseIsDisplayed = base === s.src;

  const candidates: Candidate[] = [
    { url: base, width: baseIsDisplayed ? s.naturalWidth : 0, density: 0 },
    ...s.srcsets.flatMap((srcset) => parseSrcset(srcset, baseUrl)),
  ].filter((c) => usable(c.url));
  if (candidates.length === 0) return null;

  // Spacers and tracking pixels with nothing larger on offer.
  const tiny = baseIsDisplayed && s.naturalWidth > 0 && (s.naturalWidth < MIN_SIDE || s.naturalHeight < MIN_SIDE);
  if (tiny && candidates.length === 1) return null;

  const keys = candidates.map((c) => c.url);
  if (s.linkUrl && isLikelyImageUrl(s.linkUrl)) {
    // Same heuristic as a right-click save: a linked image file is likely the
    // full-size original, so it ranks just above everything known.
    const top = Math.max(...candidates.map(candidateScore));
    candidates.push({ url: s.linkUrl, width: top + 1, density: 0, isLink: true });
  }

  const best = rankByScore(candidates)[0]!;
  const knownWidth = baseIsDisplayed ? s.naturalWidth : 0;
  const knownHeight = baseIsDisplayed ? s.naturalHeight : 0;
  let width = knownWidth;
  let height = knownHeight;
  if (best.url !== s.src && !best.isLink && best.width > 0) {
    width = best.width;
    height = knownWidth > 0 ? Math.round((best.width * knownHeight) / knownWidth) : 0;
  }
  if (best.isLink) keys.push(best.url);

  return {
    image: {
      url: best.url,
      thumb: usable(s.src) && !placeholder ? s.src : best.url,
      width,
      height,
      alt: s.alt,
      type: imageType(best.url),
    },
    score: candidateScore(best),
    keys,
  };
}

/**
 * Ranks every scanned image and drops duplicates: two entries are the same
 * picture when any of their source URLs match (the same photo in a srcset
 * group, a thumbnail and its CSS twin…). The better-ranked one is kept, in
 * the position the picture first appeared on the page.
 */
export function rankPageImages(scan: PageScan, max = MAX_GALLERY_IMAGES): GalleryData {
  const images: GalleryImage[] = [];
  const scores: number[] = [];
  const indexByUrl = new Map<string, number>();
  let more = 0;

  for (const scanned of scan.images) {
    const found = bestSource(scanned, scan.baseUrl);
    if (!found) continue;
    const existing = found.keys.map((k) => indexByUrl.get(k)).find((i) => i !== undefined);
    if (existing !== undefined) {
      if (found.score > scores[existing]!) {
        images[existing] = { ...found.image, alt: found.image.alt || images[existing]!.alt };
        scores[existing] = found.score;
      }
      for (const key of found.keys) indexByUrl.set(key, existing);
      continue;
    }
    if (images.length >= max) {
      more++;
      continue;
    }
    for (const key of found.keys) indexByUrl.set(key, images.length);
    images.push(found.image);
    scores.push(found.score);
  }

  return { pageUrl: scan.pageUrl, title: scan.title, images, more };
}

/** Bulk saves go to a folder per site: "SaveImageAs/example.com". */
export function bulkFolder(defaultFolder: string, pageUrl: string): string {
  let host = "";
  try {
    host = new URL(pageUrl).host.replace(/^www\./i, "");
  } catch {
    host = "";
  }
  host = host.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "page";
  const root = defaultFolder.trim().replace(/^\/+|\/+$/g, "") || "SaveImageAs";
  return `${root}/${host}`;
}
