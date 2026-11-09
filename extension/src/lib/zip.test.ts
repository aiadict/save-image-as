/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, createZip, uniqueName } from "./zip";

function hasUnzip(): boolean {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for no data", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("createZip", () => {
  const entries = [
    { name: "hello.txt", data: new TextEncoder().encode("Hello, zip!\n") },
    { name: "photo.png", data: Uint8Array.from({ length: 70_000 }, (_, i) => (i * 31) & 0xff) },
    { name: "empty.bin", data: new Uint8Array() },
  ];

  it("writes the signatures and entry count", async () => {
    const bytes = new Uint8Array(await createZip(entries).arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(3);
  });

  it("stores names as UTF-8 and flags them", async () => {
    const bytes = new Uint8Array(await createZip([{ name: "zdjęcie.png", data: new Uint8Array([1]) }]).arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(new TextDecoder().decode(bytes.subarray(30, 30 + view.getUint16(26, true)))).toBe("zdjęcie.png");
  });

  it.skipIf(!hasUnzip())("passes unzip -t and round-trips the contents", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sia-zip-"));
    const file = join(dir, "test.zip");
    writeFileSync(file, new Uint8Array(await createZip(entries).arrayBuffer()));
    expect(() => execFileSync("unzip", ["-t", file], { stdio: "pipe" })).not.toThrow();
    expect(execFileSync("unzip", ["-p", file, "hello.txt"]).toString()).toBe("Hello, zip!\n");
    const png = execFileSync("unzip", ["-p", file, "photo.png"]);
    expect(Buffer.compare(png, Buffer.from(entries[1]!.data))).toBe(0);
  });
});

describe("uniqueName", () => {
  it("numbers repeats and ignores case", () => {
    const used = new Set<string>();
    expect(uniqueName("photo.png", used)).toBe("photo.png");
    expect(uniqueName("photo.png", used)).toBe("photo-2.png");
    expect(uniqueName("Photo.PNG", used)).toBe("Photo-3.PNG");
    expect(uniqueName("noext", used)).toBe("noext");
    expect(uniqueName("noext", used)).toBe("noext-2");
  });
});
