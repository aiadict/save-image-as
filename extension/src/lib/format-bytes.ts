/** Human-readable byte size for UI copy — e.g. notifying the user when a compressed save couldn't hit its target. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
