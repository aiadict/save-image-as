/**
 * Generic bisection search for "highest encode quality that still fits under
 * a byte budget." Deliberately takes a `measure` callback instead of calling
 * OffscreenCanvas directly, for the same reason srcset.ts stays pure while
 * background/resolve-in-page.ts is the untested DOM-coupled caller: this file
 * can be fixture-tested in plain Vitest/Node, where OffscreenCanvas doesn't
 * exist. See image-core/encode.ts's encodeToTargetSize for the real caller.
 *
 * Assumes `measure` is monotonically non-increasing as quality decreases —
 * true for real JPEG/WebP encoders, not enforced here. A non-monotonic
 * `measure` would still terminate (iteration count is fixed) but might not
 * find the true optimum.
 */

export const MIN_QUALITY = 0.4;
export const MAX_QUALITY = 0.95;
export const MAX_ITERATIONS = 6;

export interface SizeSearchResult {
  /** The highest quality found that fits within maxBytes, or MIN_QUALITY if even that doesn't fit. */
  quality: number;
  /** The measured size at `quality`. */
  size: number;
  /** False when even MIN_QUALITY exceeds maxBytes — `quality`/`size` are the best-effort floor result. */
  hitTarget: boolean;
}

export async function findQualityForTargetSize(
  maxBytes: number,
  measure: (quality: number) => Promise<number>
): Promise<SizeSearchResult> {
  const floorSize = await measure(MIN_QUALITY);
  if (floorSize > maxBytes) {
    return { quality: MIN_QUALITY, size: floorSize, hitTarget: false };
  }

  let lo = MIN_QUALITY;
  let hi = MAX_QUALITY;
  let bestQuality = MIN_QUALITY;
  let bestSize = floorSize;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const size = await measure(mid);
    if (size <= maxBytes) {
      bestQuality = mid;
      bestSize = size;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return { quality: bestQuality, size: bestSize, hitTarget: true };
}
