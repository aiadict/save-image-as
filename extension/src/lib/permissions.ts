// Two-tier host-permission strategy (see docs/architecture.md "Permissions plan"):
//
//  1. The background pipeline ALWAYS tries a direct fetch() first (see
//     background/index.ts). Plenty of image CDNs send permissive CORS
//     headers, so a real fraction of saves need no permission at all.
//
//  2. If that fails, the reliable path is an explicit, one-time opt-in:
//     an "Allow on all sites" button on the Options page that calls
//     requestBroadImageAccess() directly inside its click handler — a
//     synchronous user gesture, which is the only context
//     chrome.permissions.request() reliably honors.
//
//  3. As a bonus, the background pipeline also makes a best-effort narrow
//     per-origin request after a failed fetch. This is NOT reliable —
//     requesting permissions from deep inside an async chain, several
//     `await`s past the original contextMenus click, routinely fails in
//     current Chrome because the user-gesture window has closed by then.
//     That fragility was the root cause of saves silently failing
//     end-to-end in the first cut of this pipeline: it was the ONLY path,
//     called unconditionally before ever attempting a fetch, so it aborted
//     nearly every save regardless of whether the site even needed it.

const BROAD_ORIGIN = "*://*/*";

export async function hasBroadImageAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [BROAD_ORIGIN] });
}

/** Call ONLY as the first statement of a direct button-click handler. */
export async function requestBroadImageAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: [BROAD_ORIGIN] });
}

/**
 * Best-effort narrow permission request from the background pipeline.
 * May legitimately fail/throw outside a user-gesture window — that's
 * expected, not a bug; the caller should fall back to a clear message
 * pointing at the Options page's reliable opt-in.
 */
export async function tryRequestOriginPermission(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  let origin: string;
  try {
    origin = `${new URL(url).origin}/*`;
  } catch {
    return false;
  }
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}
