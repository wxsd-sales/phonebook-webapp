import { describe, expect, test } from "@jest/globals";
import { crc32, createZip } from "../../wizard/zip.js";

describe("crc32", () => {
  test("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("createZip", () => {
  const encode = (text) => new TextEncoder().encode(text);

  test("writes local headers, a central directory and an end record", () => {
    const zip = createZip([
      { path: "a/one.txt", data: encode("hello") },
      { path: "two.txt", data: encode("world!") },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    expect(view.getUint32(0, true)).toBe(0x04034b50);

    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);

    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });

  test("stores file contents uncompressed after the name", () => {
    const zip = createZip([{ path: "x.txt", data: encode("payload") }]);
    const text = new TextDecoder().decode(zip.subarray(30 + 5, 30 + 5 + 7));
    expect(text).toBe("payload");
  });
});
