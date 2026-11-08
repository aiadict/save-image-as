// Feedback on the toolbar icon for the tab a save came from: a check mark
// for a couple of seconds after success, "!" after a failure until the popup
// is opened on that tab. No permission needed. Colours match tokens.css
// (light theme; the toolbar doesn't follow the page theme).

const SUCCESS_MS = 2500;

export function showSaved(tabId: number): void {
  void setBadge(tabId, "✓", "#0a7f8f");
  setTimeout(() => void clearBadge(tabId), SUCCESS_MS);
}

export function showFailed(tabId: number): void {
  void setBadge(tabId, "!", "#b42318");
}

export async function clearBadge(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: "" });
  } catch {
    // Tab already closed.
  }
}

async function setBadge(tabId: number, text: string, color: string): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    // setBadgeTextColor needs Chrome 110+; the manifest allows 116, but be safe.
    await chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" });
    await chrome.action.setBadgeText({ tabId, text });
  } catch {
    // Tab closed while saving; nothing to show.
  }
}
