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
