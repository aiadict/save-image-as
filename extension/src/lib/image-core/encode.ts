import { ConversionError, type OutputFormat } from "./types";
import { buildSinglePageImagePdf } from "./pdf";
import { findQualityForTargetSize, type SizeSearchResult } from "./size-search";

const MIME: Record<OutputFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
};

// Safety cap so a single huge image can't hang the service worker or blow
// past OffscreenCanvas limits. Revisit if Phase 2/3 needs larger originals.
const MAX_DIMENSION = 12000;

/**
 * Re-encode a decoded bitmap to the target format via OffscreenCanvas
 * (available directly in the MV3 service worker — no offscreen document
 * needed, see docs/architecture.md). JPG has no alpha channel, so
 * transparent sources are flattened onto white first.
 */
export async function encodeImage(bitmap: ImageBitmap, format: OutputFormat, quality: number): Promise<Blob> {
  if (bitmap.width > MAX_DIMENSION || bitmap.height > MAX_DIMENSION) {
    throw new ConversionError({
      reason: "oversized",
      message: `This image is too large to convert (over ${MAX_DIMENSION}px). Try saving the original instead.`,
    });
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ConversionError({ reason: "unknown", message: "Couldn't prepare this image for conversion." });
  }

  // JPG and PDF (which embeds a JPEG) have no alpha channel — flatten onto white first.
  if (format === "jpg" || format === "pdf") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  }
  ctx.drawImage(bitmap, 0, 0);

  if (format === "pdf") {
    return encodePdfPage(canvas, quality, bitmap.width, bitmap.height);
  }

  try {
    return await canvas.convertToBlob({
      type: MIME[format],
      quality: format === "png" ? undefined : quality,
    });
  } catch {
    throw new ConversionError({
      reason: "unsupported-format",
      message: `Your browser can't encode ${format.toUpperCase()} yet. Try a different format.`,
    });
  }
}

export interface TargetSizeEncodeResult extends SizeSearchResult {
  blob: Blob;
}

/**
 * Encode to the highest quality that still fits under `maxBytes`, via
 * bisection search (see size-search.ts). Always outputs WebP: it's the only
 * format here that combines a tunable quality knob (unlike lossless PNG,
 * which has none) with alpha support (unlike JPG, which would flatten
 * transparent sources onto white) — so it's the one format that can honor
 * both "hit this size" and "don't silently change how the image looks."
 *
 * `hitTarget: false` on the result means even MIN_QUALITY (see size-search.ts)
 * didn't fit the budget — the caller gets the smallest achievable result
 * back rather than a silently-broken or over-compressed image, and should
 * tell the user honestly rather than claim success at the requested size.
 */
export async function encodeToTargetSize(bitmap: ImageBitmap, maxBytes: number): Promise<TargetSizeEncodeResult> {
  const blobsByQuality = new Map<number, Blob>();

  const result = await findQualityForTargetSize(maxBytes, async (quality) => {
    const blob = await encodeImage(bitmap, "webp", quality);
    blobsByQuality.set(quality, blob);
    return blob.size;
  });

  const blob = blobsByQuality.get(result.quality);
  if (!blob) {
    // Unreachable in practice: every quality findQualityForTargetSize tries is recorded above.
    throw new ConversionError({ reason: "unknown", message: "Couldn't prepare a compressed version of this image." });
  }

  return { ...result, blob };
}

async function encodePdfPage(canvas: OffscreenCanvas, quality: number, width: number, height: number): Promise<Blob> {
  let jpegBlob: Blob;
  try {
    jpegBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  } catch {
    throw new ConversionError({
      reason: "unsupported-format",
      message: "Your browser couldn't prepare this image for PDF export.",
    });
  }
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBytes = buildSinglePageImagePdf(jpegBytes, width, height);
  return new Blob([pdfBytes], { type: "application/pdf" });
}
