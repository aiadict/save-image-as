// Local-only usage counters powering the popup's "Trust Ledger" line.
// Deliberately chrome.storage.LOCAL, not chrome.storage.sync like storage.ts:
//
//  1. chrome.storage.sync enforces tight write-rate quotas (MAX_WRITE_OPERATIONS
//     PER_MINUTE / PER_HOUR) meant for occasional preference changes. Incrementing
//     a counter on every single save would risk exhausting that quota for anyone
//     who saves a lot of images in a short span — a self-inflicted bug for a
//     feature whose whole point is to build trust, not degrade the product.
//  2. This is a per-installation usage count, not a preference — there's no
//     reason it should sync across a user's devices, so sync's cross-device
//     behavior would be actively wrong here, not just unnecessary.
//
// See docs/architecture.md "Trust ledger" for the exact wording rules this
// counter must satisfy (it must stay literally true — see the CI guard at
// scripts/check-no-telemetry.mjs).

export interface Stats {
  imagesSavedCount: number;
}

const DEFAULT_STATS: Stats = { imagesSavedCount: 0 };

export async function getStats(): Promise<Stats> {
  const stored = await chrome.storage.local.get(DEFAULT_STATS);
  return stored as Stats;
}

export async function incrementImagesSaved(): Promise<void> {
  const { imagesSavedCount } = await getStats();
  await chrome.storage.local.set({ imagesSavedCount: imagesSavedCount + 1 });
}
