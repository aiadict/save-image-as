/** One image found on the page: raw facts only, ranked later by page-images.ts. */
export interface ScannedImage {
  /** Absolute URL the element shows now (currentSrc for <img>, the url() for CSS). */
  src: string;
  /** Raw srcset values (the <img>'s own, data-srcset, and active <picture> sources), relative to PageScan.baseUrl. */
  srcsets: string[];
  /** Absolute data-src / data-lazy-src / data-original, for lazy-loading placeholders. */
  lazySrc: string | null;
  /** Absolute href of the wrapping link, if any. */
  linkUrl: string | null;
  naturalWidth: number;
  naturalHeight: number;
  alt: string;
  kind: "img" | "css";
}

export interface PageScan {
  pageUrl: string;
  baseUrl: string;
  title: string;
  images: ScannedImage[];
}

/**
 * Injected into the page via chrome.scripting.executeScript({ func }) when
 * someone clicks "Save images from this page" in the popup. Collects every
 * <img> and visible CSS background image as raw data.
 *
 * MUST STAY FULLY SELF-CONTAINED (no imports, no references outside its own
 * body): func-mode injection re-runs it from its source text in the page.
 * It deliberately does no srcset ranking: that runs in the extension with
 * the tested lib/image-core/srcset.ts (see lib/page-images.ts), so the
 * ranking rules aren't copied a third time (resolve-in-page.ts has the only
 * in-page copy). Reads the DOM only; makes no requests.
 */
export function scanImagesInPage(): PageScan {
  const MAX_RAW = 2000;
  const MAX_STYLED_ELEMENTS = 6000;
  const images: ScannedImage[] = [];

  const absolute = (url: string | null): string | null => {
    if (!url) return null;
    try {
      return new URL(url, document.baseURI).href;
    } catch {
      return null;
    }
  };
  const linkOf = (el: Element): string | null => {
    const a = el.closest("a");
    return a instanceof HTMLAnchorElement && a.href ? a.href : null;
  };

  for (const img of Array.from(document.images)) {
    if (images.length >= MAX_RAW) break;
    const srcsets: string[] = [];
    if (img.srcset) srcsets.push(img.srcset);
    const lazySrcset = img.getAttribute("data-srcset");
    if (lazySrcset) srcsets.push(lazySrcset);
    const picture = img.parentElement?.tagName === "PICTURE" ? img.parentElement : null;
    if (picture) {
      for (const source of Array.from(picture.querySelectorAll("source"))) {
        // Art direction: only the <source> whose media query applies now shows this image.
        const media = source.getAttribute("media");
        if (media && !window.matchMedia(media).matches) continue;
        const srcset = source.getAttribute("srcset") ?? source.getAttribute("data-srcset");
        if (srcset) srcsets.push(srcset);
      }
    }
    images.push({
      src: img.currentSrc || img.src,
      srcsets,
      lazySrc: absolute(img.getAttribute("data-src") ?? img.getAttribute("data-lazy-src") ?? img.getAttribute("data-original")),
      linkUrl: linkOf(img),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      alt: (img.alt ?? "").trim(),
      kind: "img",
    });
  }

  const elements = document.body ? document.body.getElementsByTagName("*") : [];
  for (let i = 0; i < elements.length && i < MAX_STYLED_ELEMENTS && images.length < MAX_RAW; i++) {
    const el = elements[i]!;
    const background = getComputedStyle(el).backgroundImage;
    if (!background || !background.includes("url(")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) continue;
    for (const match of background.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) {
      const src = absolute(match[2] ?? null);
      if (!src) continue;
      images.push({
        src,
        srcsets: [],
        lazySrc: null,
        linkUrl: linkOf(el),
        naturalWidth: 0,
        naturalHeight: 0,
        alt: (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "").trim(),
        kind: "css",
      });
    }
  }

  return { pageUrl: location.href, baseUrl: document.baseURI, title: document.title, images };
}
