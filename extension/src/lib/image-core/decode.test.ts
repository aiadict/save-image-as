import { describe, expect, it } from "vitest";
import { looksLikeNonImageResponse } from "./decode";

describe("looksLikeNonImageResponse", () => {
  it("accepts standard image content types", () => {
    expect(looksLikeNonImageResponse("image/webp")).toBe(false);
    expect(looksLikeNonImageResponse("image/png")).toBe(false);
    expect(looksLikeNonImageResponse("image/jpeg")).toBe(false);
  });

  it("accepts an image type with parameters", () => {
    expect(looksLikeNonImageResponse("image/webp;charset=UTF-8")).toBe(false);
  });

  it("accepts generic/binary content types real servers actually send for images", () => {
    // This was the bug: a real .webp server sent "application/octet-stream"
    // and the old strict image/* prefix check rejected an otherwise-valid save.
    expect(looksLikeNonImageResponse("application/octet-stream")).toBe(false);
    expect(looksLikeNonImageResponse("binary/octet-stream")).toBe(false);
  });

  it("accepts a missing content type", () => {
    expect(looksLikeNonImageResponse("")).toBe(false);
  });

  it("rejects content types that indicate we fetched an error/login page instead", () => {
    expect(looksLikeNonImageResponse("text/html")).toBe(true);
    expect(looksLikeNonImageResponse("text/html; charset=utf-8")).toBe(true);
    expect(looksLikeNonImageResponse("application/json")).toBe(true);
    expect(looksLikeNonImageResponse("text/plain")).toBe(true);
  });
});
