/**
 * Wraps a single baseline JPEG image as a minimal one-page PDF. The JPEG
 * bytes are embedded as-is via the /DCTDecode filter — no re-encoding of
 * the image data, just a small amount of hand-written PDF structure around
 * it. No external PDF library needed for this "one image, one page" case.
 *
 * Page size is set to the image's pixel dimensions (1px = 1pt) — simple and
 * predictable, not calibrated to a physical paper size. Revisit if Phase 2+
 * adds orientation/paper-size options (see docs/roadmap.md).
 */
export function buildSinglePageImagePdf(jpegBytes: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushText = (text: string) => push(enc.encode(text));
  const startObj = (num: number) => {
    offsets[num] = offset;
    pushText(`${num} 0 obj\n`);
  };
  const endObj = () => pushText("endobj\n");

  pushText("%PDF-1.4\n");

  startObj(1);
  pushText("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  startObj(2);
  pushText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
  endObj();

  startObj(3);
  pushText(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`
  );
  endObj();

  startObj(4);
  pushText(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  push(jpegBytes);
  pushText("\nendstream\n");
  endObj();

  const content = enc.encode(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
  startObj(5);
  pushText(`<< /Length ${content.length} >>\nstream\n`);
  push(content);
  pushText("\nendstream\n");
  endObj();

  const xrefOffset = offset;
  const objectCount = 6; // objects 0 (free) through 5
  pushText(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let i = 1; i < objectCount; i++) {
    pushText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
