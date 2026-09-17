import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("formats sub-kilobyte sizes in bytes", () => {
    expect(formatBytes(512)).toBe("512B");
  });

  it("formats kilobyte-range sizes", () => {
    expect(formatBytes(204_800)).toBe("200KB");
  });

  it("formats megabyte-range sizes with one decimal", () => {
    expect(formatBytes(1_572_864)).toBe("1.5MB");
  });

  it("rounds cleanly at the 1MB boundary", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0MB");
  });
});
