// Thin wrapper around chrome.notifications for surfacing classified save
// failures — see docs/architecture.md "A failure should be classified, not
// merely reported". Never shows a generic "Something went wrong".

export function notifyFailure(message: string): void {
  void chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Save Image As",
    message,
  });
}

/**
 * For a save that SUCCEEDED but didn't fully match what the user asked for —
 * e.g. a "Compressed" save that couldn't reach its size target even at the
 * lowest acceptable quality. Never used for outright failures (use
 * notifyFailure for those): the file was saved, this just tells the user the
 * honest result instead of silently claiming full success.
 */
export function notifyInfo(message: string): void {
  void chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Save Image As",
    message,
  });
}
