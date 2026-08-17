import { ConversionError } from "./types";

/**
 * Fetch the raw bytes of a candidate image source. Deliberately makes no
 * decision about permissions/CORS — that's the background script's job
 * (see docs/architecture.md "End-to-end data flow": host permission is
 * requested by the caller before this runs against an http(s) URL, so this
 * function can stay chrome-API-free and fixture-testable).
 *
 * `referrer` (the page the image was found on, if known) is passed through
 * to fetch() as a best-effort mitigation for sites with hotlink protection —
 * some image hosts check the Referer header and, instead of erroring,
 * silently serve a placeholder/"hotlinking not allowed" image with a normal
 * 200 status, which would otherwise save successfully but be the WRONG
 * image with no error at all. Not guaranteed to work from an extension
 * background context (unverified how consistently Chrome honors a
 * cross-origin `referrer` option there); harmless to always try. See
 * docs/site-compatibility.md.
 */
export async function fetchImageBlob(url: string, referrer?: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, referrer ? { referrer, referrerPolicy: "strict-origin-when-cross-origin" } : undefined);
  } catch {
    throw new ConversionError({
      reason: "protected-source",
      message: "This image is on a site Save Image As doesn't have permission to read yet.",
    });
  }

  if (!response.ok) {
    throw new ConversionError({
      reason: "unknown",
      message: `The image could not be downloaded (server responded ${response.status}).`,
    });
  }

  const blob = await response.blob();
  if (looksLikeNonImageResponse(blob.type)) {
    throw new ConversionError({
      reason: "bad-mime-type",
      message: "This doesn't look like an image file — the site may have returned an error or login page instead.",
    });
  }

  return blob;
}

/**
 * Real-world image servers routinely send generic or missing Content-Type
 * headers for perfectly valid images (`application/octet-stream`, empty,
 * CDN quirks, etc.) — rejecting anything that doesn't start with "image/"
 * was too strict and broke legitimate saves. Instead, only reject content
 * types that clearly indicate we fetched something OTHER than the image
 * (an HTML error/login page, a JSON API error, plain text) and let
 * createImageBitmap be the real, authoritative validator for everything else.
 */
export function looksLikeNonImageResponse(mimeType: string): boolean {
  if (!mimeType) return false;
  if (mimeType.startsWith("image/")) return false;
  return /^(text\/html|application\/json|text\/plain|text\/xml|application\/xml)/i.test(mimeType);
}

/** Decode fetched bytes into a bitmap ready for re-encoding. */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new ConversionError({
      reason: "unknown",
      message: "This image could not be decoded — it may be corrupted or in an unsupported format.",
    });
  }
}
