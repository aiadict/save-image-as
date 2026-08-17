// Framework-free types for the image-core pipeline.
// image-core must stay free of chrome.* APIs so it can be fixture-tested in
// plain Node/Vitest and, later, reused by a browser-based web converter.
// See docs/architecture.md "Component map" and tests/fixtures/README.md.

export type OutputFormat = "png" | "jpg" | "webp" | "avif" | "pdf";

/**
 * Best candidate source resolved for a right-clicked image — either a plain
 * URL to fetch, or bytes already read in-page (for blob: sources the
 * background can't reach directly). See background/resolve-in-page.ts.
 */
export interface ResolvedSource {
  url: string;
  width: number;
  height: number;
  inlineBlob?: { base64: string; mime: string };
}

export type ConversionFailureReason =
  | "protected-source" // e.g. cross-origin, no permission granted
  | "permission-denied" // user declined the runtime host-permission prompt
  | "unsupported-source" // e.g. a page-scoped blob: URL the background can't reach
  | "thumbnail-only" // page only ever loaded a low-res placeholder
  | "unsupported-animation" // e.g. GIF -> static-only export
  | "unsupported-format" // browser can't encode the requested output format
  | "oversized" // exceeds safe encode dimensions
  | "bad-mime-type"
  | "unknown";

export interface ConversionFailure {
  reason: ConversionFailureReason;
  message: string; // user-facing, specific — see docs/architecture.md "failure UX"
}

/** Thrown at any pipeline stage; always carries a classified, user-facing failure. */
export class ConversionError extends Error {
  readonly failure: ConversionFailure;
  constructor(failure: ConversionFailure) {
    super(failure.message);
    this.name = "ConversionError";
    this.failure = failure;
  }
}
