import type { OutputFormat } from "./types";

/**
 * Build a safe download filename: keep the original basename where possible,
 * swap the extension to match the target format, sanitize for the
 * filesystem, and prefix with the default sub-folder when one is set.
 *
 * See docs/architecture.md "Storage schema" for the defaultFolder constraint
 * (must be a relative path under the Downloads root, no arbitrary OS path).
 */
export function buildFilename(
  originalUrl: string,
  format: OutputFormat,
  folder?: string
): string {
  const base = sanitize(guessBasename(originalUrl));
  const withExt = `${base}.${format}`;
  return folder ? `${sanitizeFolder(folder)}/${withExt}` : withExt;
}

/**
 * Same as buildFilename, but for the unconverted "Save original" path:
 * keeps whatever extension the source URL actually had (falls back to no
 * extension if none is present — the browser still saves it fine).
 */
export function buildOriginalFilename(originalUrl: string, folder?: string): string {
  const base = sanitize(guessBasename(originalUrl));
  const ext = guessExtension(originalUrl);
  const withExt = ext ? `${base}.${ext}` : base;
  return folder ? `${sanitizeFolder(folder)}/${withExt}` : withExt;
}

function guessBasename(url: string): string {
  // data: URLs have no path — new URL(url).pathname returns the ENTIRE
  // base64 payload (which can itself contain "/"), so parsing it as a path
  // produces a garbage, extremely long "filename". Short-circuit instead.
  if (url.startsWith("data:")) return "image";
  try {
    const { pathname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop() ?? "image";
    return last.replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return "image";
  }
}

function guessExtension(url: string): string | undefined {
  if (url.startsWith("data:")) {
    // No path to inspect, but the MIME type right there in the URL is a
    // more reliable source anyway: "data:image/svg+xml;base64,..." -> "svg".
    const match = /^data:image\/([a-z0-9.+-]+)/i.exec(url);
    return match?.[1]?.split("+")[0]?.toLowerCase();
  }
  try {
    const { pathname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop() ?? "";
    const match = /\.([a-z0-9]+)$/i.exec(last);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

// Guards against real-world filenames long enough to hit OS/filesystem path
// limits (some CMSes generate very long slugs) — chrome.downloads.download
// would otherwise fail with an unhelpful generic error.
const MAX_BASENAME_LENGTH = 120;

function sanitize(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "image";
  return cleaned.length > MAX_BASENAME_LENGTH ? cleaned.slice(0, MAX_BASENAME_LENGTH) : cleaned;
}

function sanitizeFolder(folder: string): string {
  return folder
    .split("/")
    .map((part) => sanitize(part))
    .filter(Boolean)
    .join("/");
}
