import { describe, expect, it } from "vitest";
import { findQualityForTargetSize, MAX_ITERATIONS, MAX_QUALITY, MIN_QUALITY } from "./size-search";

/** Deterministic stand-in for a real encoder: size scales linearly with quality. */
function linearMeasure(maxSize: number) {
  return async (quality: number): Promise<number> => Math.round(maxSize * quality);
}

describe("findQualityForTargetSize", () => {
  it("finds a quality comfortably under the target and reports hitTarget", async () => {
    const result = await findQualityForTargetSize(500, linearMeasure(1000));
    expect(result.hitTarget).toBe(true);
    expect(result.size).toBeLessThanOrEqual(500);
    // Bisection over [0.4, 0.95] targeting the 0.5-quality boundary should land close to it.
    expect(result.quality).toBeGreaterThan(0.45);
    expect(result.quality).toBeLessThan(0.55);
  });

  it("reports hitTarget=false when even MIN_QUALITY exceeds the budget", async () => {
    const result = await findQualityForTargetSize(10, linearMeasure(1000));
    expect(result.hitTarget).toBe(false);
    expect(result.quality).toBe(MIN_QUALITY);
    expect(result.size).toBe(Math.round(1000 * MIN_QUALITY));
  });

  it("converges toward MAX_QUALITY when the budget is generous", async () => {
    const result = await findQualityForTargetSize(10_000, linearMeasure(1000));
    expect(result.hitTarget).toBe(true);
    expect(result.quality).toBeGreaterThan(0.9);
    expect(result.quality).toBeLessThanOrEqual(MAX_QUALITY);
  });

  it("never calls measure more than MAX_ITERATIONS + 1 times (the floor check plus the search)", async () => {
    let calls = 0;
    const measure = async (quality: number): Promise<number> => {
      calls++;
      return Math.round(1000 * quality);
    };
    await findQualityForTargetSize(500, measure);
    expect(calls).toBeLessThanOrEqual(MAX_ITERATIONS + 1);
  });

  it("only ever measures qualities within [MIN_QUALITY, MAX_QUALITY]", async () => {
    const seen: number[] = [];
    const measure = async (quality: number): Promise<number> => {
      seen.push(quality);
      return Math.round(1000 * quality);
    };
    await findQualityForTargetSize(500, measure);
    for (const q of seen) {
      expect(q).toBeGreaterThanOrEqual(MIN_QUALITY);
      expect(q).toBeLessThanOrEqual(MAX_QUALITY);
    }
  });
});
