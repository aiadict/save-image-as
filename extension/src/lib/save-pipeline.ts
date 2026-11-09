// The save pipeline shared by a right-click save (background/index.ts) and
// the bulk gallery (gallery/index.ts): get the source bytes, then convert
// and name the file. Downloading and counting stay with the callers. See
// docs/architecture.md "End-to-end data flow".

import { base64ToBlob } from "./base64";
import type { DefaultFormat, Preferences, SizeBudget } from "./storage";
import { fetchImageBlob, decodeImage } from "./image-core/decode";
import { encodeImage, encodeToTargetSize } from "./image-core/encode";
import { buildFilename, buildOriginalFilename } from "./image-core/filename";
import { ConversionError, type OutputFormat, type ResolvedSource } from "./image-core/types";

export type SaveFormat = DefaultFormat | "compressed";

/** Byte targets for the "Compressed" context-menu item — see docs/architecture.md "Size-budget compression". */
export const SIZE_BUDGET_BYTES: Record<SizeBudget, number> = {
  chat: 1024 * 1024, // 1MB — comfortable for email/Slack/messaging attachments
  web: 200 * 1024, // 200KB — for fastest page loads
};

export const PERMISSION_DENIED_MESSAGE =
  'Save Image As doesn\'t have permission to read images from this site yet. Open the extension\'s Settings and turn on "Allow on all sites," then try again.';

/**
 * Gets the source image's bytes: in-page blob bytes, or a fetch. When the
 * fetch is blocked, `onBlocked` may try to get access (it resolves true if
 * it did, and the fetch is retried); without it, or if it fails, this
 * throws a "permission-denied" ConversionError.
 */
export async function loadSourceBlob(
  resolved: ResolvedSource,
  pageUrl: string | undefined,
  onBlocked?: (url: string) => Promise<boolean>
): Promise<Blob> {
  if (resolved.inlineBlob) {
    // A blob: source whose bytes were already read in-page (the extension
    // background can't fetch a page-scoped blob: URL directly).
    return base64ToBlob(resolved.inlineBlob.base64, resolved.inlineBlob.mime);
  }
  if (resolved.url.startsWith("blob:")) {
    // In-page resolution couldn't reach this blob: source either — nothing
    // left to try.
    throw new ConversionError({
      reason: "unsupported-source",
      message: "This image uses a temporary in-page source Save Image As can't reach.",
    });
  }

  // Try a direct fetch first — many images need no special permission at
  // all. Only fall back to requesting access if that actually fails.
  // Best-effort mitigation for hotlink-protected image hosts (they check
  // Referer and silently serve a placeholder instead of erroring — see
  // docs/site-compatibility.md). pageUrl is the page the image was
  // actually found on, which is what a real browser navigation would send.
  try {
    return await fetchImageBlob(resolved.url, pageUrl);
  } catch (err) {
    if (!(err instanceof ConversionError) || err.failure.reason !== "protected-source") {
      throw err;
    }
    const granted = onBlocked ? await onBlocked(resolved.url) : false;
    if (!granted) {
      throw new ConversionError({ reason: "permission-denied", message: PERMISSION_DENIED_MESSAGE });
    }
    return fetchImageBlob(resolved.url, pageUrl);
  }
}

export interface ConvertedImage {
  blob: Blob;
  /** Download path relative to the Downloads folder. */
  filename: string;
  /** The decoded image (absent for "original", which isn't decoded). */
  bitmap?: ImageBitmap;
  /** "compressed" only: set when even the lowest quality missed the size budget. */
  missedTarget?: boolean;
}

/** Converts fetched bytes to the chosen format and builds the filename. Throws a ConversionError on failure. */
export async function convertForSave(
  source: Blob,
  resolved: ResolvedSource,
  format: SaveFormat,
  prefs: Pick<Preferences, "jpgQuality" | "sizeBudget" | "useDescriptiveFilenames">,
  folder?: string
): Promise<ConvertedImage> {
  // Descriptive-filenames feature: only pass alt text through when the user
  // opted in — buildFilename/buildOriginalFilename fall back to the CDN
  // basename on `undefined` either way, so this is the only place the
  // preference is consulted.
  const altText = prefs.useDescriptiveFilenames ? resolved.alt : undefined;

  if (format === "original") {
    return { blob: source, filename: buildOriginalFilename(resolved.url, folder, altText) };
  }

  const bitmap = await decodeImage(source);
  if (format === "compressed") {
    const result = await encodeToTargetSize(bitmap, SIZE_BUDGET_BYTES[prefs.sizeBudget]);
    return {
      blob: result.blob,
      filename: buildFilename(resolved.url, "webp", folder, altText),
      bitmap,
      missedTarget: !result.hitTarget,
    };
  }

  const outputFormat: OutputFormat = format;
  return {
    blob: await encodeImage(bitmap, outputFormat, prefs.jpgQuality),
    filename: buildFilename(resolved.url, outputFormat, folder, altText),
    bitmap,
  };
}
