import { describe, expect, it } from "vitest";
import { milestoneToShow, shouldAskForRating } from "./stats";

const fresh = { imagesSavedCount: 0, ratingState: "none", ratingStateAtCount: 0, ratingDismissals: 0 } as const;

describe("shouldAskForRating", () => {
  it("waits for 3 successful saves", () => {
    expect(shouldAskForRating({ ...fresh, imagesSavedCount: 2 })).toBe(false);
    expect(shouldAskForRating({ ...fresh, imagesSavedCount: 3 })).toBe(true);
  });

  it("never asks again after rating", () => {
    expect(shouldAskForRating({ ...fresh, imagesSavedCount: 999, ratingState: "rated" })).toBe(false);
  });

  it("asks once more 50 saves after the first dismissal, then never", () => {
    const dismissed = { ...fresh, ratingState: "dismissed", ratingStateAtCount: 10, ratingDismissals: 1 } as const;
    expect(shouldAskForRating({ ...dismissed, imagesSavedCount: 59 })).toBe(false);
    expect(shouldAskForRating({ ...dismissed, imagesSavedCount: 60 })).toBe(true);
    expect(shouldAskForRating({ ...dismissed, imagesSavedCount: 500, ratingDismissals: 2, ratingStateAtCount: 60 })).toBe(false);
  });
});

describe("milestoneToShow", () => {
  it("shows the highest reached milestone not yet shown", () => {
    expect(milestoneToShow({ imagesSavedCount: 9, lastMilestoneShown: 0 })).toBeNull();
    expect(milestoneToShow({ imagesSavedCount: 10, lastMilestoneShown: 0 })).toBe(10);
    expect(milestoneToShow({ imagesSavedCount: 140, lastMilestoneShown: 0 })).toBe(100);
    expect(milestoneToShow({ imagesSavedCount: 140, lastMilestoneShown: 100 })).toBeNull();
  });
});
