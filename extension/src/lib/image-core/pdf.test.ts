import { describe, expect, it } from "vitest";
import { buildSinglePageImagePdf } from "./pdf";

describe("buildSinglePageImagePdf", () => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // minimal SOI+EOI marker pair, not a real decodable JPEG — structural test only

  it("produces a valid PDF header and EOF trailer", () => {
    const pdf = buildSinglePageImagePdf(fakeJpeg, 800, 600);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("embeds the exact JPEG byte length and declared dimensions", () => {
    const pdf = buildSinglePageImagePdf(fakeJpeg, 800, 600);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text).toContain(`/Width 800 /Height 600`);
    expect(text).toContain(`/Length ${fakeJpeg.length}`);
    expect(text).toContain("/Filter /DCTDecode");
  });

  it("every xref offset points at the correct 'N 0 obj' marker", () => {
    const pdf = buildSinglePageImagePdf(fakeJpeg, 10, 10);
    const text = new TextDecoder("latin1").decode(pdf);

    const xrefMatch = /xref\n0 (\d+)\n([\s\S]+?)trailer/.exec(text);
    expect(xrefMatch).not.toBeNull();
    const xrefBody = xrefMatch?.[2];
    expect(xrefBody).toBeDefined();
    const lines = xrefBody!.trim().split("\n");

    // First entry is the free-list head; the rest are objects 1..N-1.
    for (let objNum = 1; objNum < lines.length; objNum++) {
      const line = lines[objNum];
      expect(line).toBeDefined();
      const offset = Number(line!.slice(0, 10));
      expect(text.slice(offset, offset + `${objNum} 0 obj`.length)).toBe(`${objNum} 0 obj`);
    }
  });
});
