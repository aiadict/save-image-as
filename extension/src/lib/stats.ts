// Local-only usage counters powering the popup's "Trust Ledger" line, plus
// the small bits of popup state that depend on them (rating prompt,
// milestone cards, "what's new").
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
// scripts/check-no-telemetry.mjs). Nothing here ever leaves the device.

export type RatingState = "none" | "rated" | "dismissed";

export interface Stats {
  imagesSavedCount: number;
  /** Whether the user rated (opened the store or feedback page) or dismissed the prompt. */
  ratingState: RatingState;
  /** imagesSavedCount when ratingState last changed. */
  ratingStateAtCount: number;
  /** How many times the prompt was dismissed; after the first, it comes back once, 50 saves later. */
  ratingDismissals: number;
  /** Highest milestone (see MILESTONES) whose card was already shown. */
  lastMilestoneShown: number;
  /** Version whose "what's new" card should show once; "" when none. */
  whatsNew: string;
}

const DEFAULT_STATS: Stats = {
  imagesSavedCount: 0,
  ratingState: "none",
  ratingStateAtCount: 0,
  ratingDismissals: 0,
  lastMilestoneShown: 0,
  whatsNew: "",
};

/** Ask for a rating only after this many successful saves. */
export const RATING_MIN_SAVES = 3;
/** A dismissed rating prompt comes back once, this many saves later. */
export const RATING_REASK_AFTER = 50;
export const MILESTONES = [10, 100, 500, 1000, 5000] as const;

export async function getStats(): Promise<Stats> {
  const stored = await chrome.storage.local.get(DEFAULT_STATS);
  return stored as Stats;
}

export async function setStats(patch: Partial<Stats>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function incrementImagesSaved(by = 1): Promise<void> {
  const { imagesSavedCount } = await getStats();
  await chrome.storage.local.set({ imagesSavedCount: imagesSavedCount + by });
}

/** Pure: should the popup show the star rating row? */
export function shouldAskForRating(
  s: Pick<Stats, "imagesSavedCount" | "ratingState" | "ratingStateAtCount" | "ratingDismissals">
): boolean {
  if (s.imagesSavedCount < RATING_MIN_SAVES) return false;
  if (s.ratingState === "none") return true;
  return s.ratingState === "dismissed" && s.ratingDismissals === 1 && s.imagesSavedCount >= s.ratingStateAtCount + RATING_REASK_AFTER;
}

/** Pure: the milestone whose card should show now, if any. */
export function milestoneToShow(s: Pick<Stats, "imagesSavedCount" | "lastMilestoneShown">): number | null {
  const reached = MILESTONES.filter((m) => s.imagesSavedCount >= m && m > s.lastMilestoneShown);
  return reached.length ? reached[reached.length - 1]! : null;
}
