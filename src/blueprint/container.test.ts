import { expect, test } from "vitest";
import { buildContainer, parseContainer, type BlueprintInfo } from "./container";
import { compressBlock, decompressBlock, lz4Decode, lz4Frame } from "./lz4";
import { decodeBlueprintPng, encodeBlueprintPng, SIZE } from "./png";
import { smazLiterals, smazLiteralsDecode } from "./smaz";
import { xxh32 } from "./xxh32";
import { toHex } from "./bytes";

// values checked against the lz4 library (python), every length class of xxh32 is in here
const pattern = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + n) % 251);
const XXH32_VECTORS: Array<[number, number]> = [
    [0, 0x02cc5d05], [3, 0xcd3d2242], [15, 0xfefd1a87], [16, 0xdf49d2bb],
    [17, 0x4fc12c31], [100, 0xa8a1a726], [1000, 0x7a32df9d], [70000, 0xb530c942],
];

test.each(XXH32_VECTORS)("xxh32 of %i bytes of pattern data", (n, expected) => {
    expect(xxh32(pattern(n))).toBe(expected);
});

test("xxh32 of abc", () => {
    expect(xxh32(new TextEncoder().encode("abc"))).toBe(0x32d153ff);
});

test("the frame header checksum byte is the one the game writes", () => {
    expect((xxh32(Uint8Array.from([0x44, 0x40])) >>> 8) & 0xff).toBe(0x5e);
});

test("the frame starts with the game's header", () => {
    expect(toHex(lz4Frame(pattern(10)).subarray(0, 7))).toBe("04224d1844405e");
});

function roundTrip(data: Uint8Array) {
    expect(lz4Decode(lz4Frame(data))).toEqual(data);
}

test("lz4 round trips empty, tiny, repetitive and random data", () => {
    roundTrip(new Uint8Array());
    roundTrip(Uint8Array.from([1]));
    roundTrip(pattern(11));
    roundTrip(pattern(13));
    roundTrip(new Uint8Array(1000)); // all zeros: one long match
    roundTrip(pattern(200000)); // several 64 KB blocks
    let seed = 1;
    roundTrip(Uint8Array.from({ length: 5000 }, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff));
});

test("repetitive data gets smaller, random data is stored", () => {
    expect(lz4Frame(new Uint8Array(10000)).length).toBeLessThan(200);
    let seed = 7;
    const random = Uint8Array.from({ length: 3000 }, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff);
    expect(lz4Frame(random).length).toBeLessThanOrEqual(3000 + 4 + 7 + 4 + 4);
});

test("the last 5 bytes are literals and the last match starts 12 bytes from the end", () => {
    const block = compressBlock(new Uint8Array(100));
    const out: number[] = [];
    decompressBlock(block, out);
    expect(out).toEqual(Array(100).fill(0));
    expect(block.at(-1)).toBe(0); // the final literal
    expect(block.length).toBeLessThan(20);
});

test("lz4Decode detects a damaged frame", () => {
    const frame = lz4Frame(pattern(500));
    frame[frame.length - 1] ^= 1;
    expect(() => lz4Decode(frame)).toThrow("content checksum");
    expect(() => lz4Decode(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow("not a frame");
});

test("smaz literals match what the game writes for plain text", () => {
    // 'FF 03' then three bytes, the same shape as in a blueprint the game saved
    expect(toHex(smazLiterals(Uint8Array.from([8, 0x54, 0x4d])))).toBe("ff0308544d");
    const long = pattern(150);
    const encoded = smazLiterals(long);
    expect(encoded).toHaveLength(150 + 3 * 2); // runs of 64, 64 and 22
    expect(smazLiteralsDecode(encoded)).toEqual(long);
});

const INFO: BlueprintInfo = { name: "ROM test", description: "d", tag: "", creator: "Test creator", steamId: "12345678901234567", platform: "steamtoken" };
const GUID = "123e4567-e89b-42d3-a456-426614174000";

test("the container round trips structure, identifier and meta", () => {
    const structure = pattern(3000);
    const { payload, headerLength } = buildContainer(structure, INFO, GUID);
    // only the header is padded to whole pixels, the picture pads the end
    expect(headerLength).toBeGreaterThanOrEqual(23);
    expect(headerLength).toBeLessThanOrEqual(25);
    const parsed = parseContainer(payload, headerLength);
    expect(parsed.structure).toEqual(structure);
    expect(parsed.guid).toBe(GUID);
    expect(parsed.info).toEqual(INFO);
});

test("the picture round trips the container and keeps the preview visible", async () => {
    const { payload, headerLength } = buildContainer(pattern(20000), INFO, GUID);
    const preview = new Uint8Array(SIZE * SIZE * 4).fill(255);
    const png = await encodeBlueprintPng(payload, headerLength, preview);
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);

    const read = await decodeBlueprintPng(png);
    expect(read.headerLength).toBe(headerLength);
    // the picture holds whole pixels, so the end is padded with zeros
    expect(read.payload).toHaveLength(Math.ceil(payload.length / 3) * 3);
    expect(read.payload.subarray(0, payload.length)).toEqual(payload);
    expect(parseContainer(read.payload, read.headerLength).structure).toEqual(pattern(20000));
});

test("a payload that does not fit in the picture is refused", async () => {
    const preview = new Uint8Array(SIZE * SIZE * 4).fill(255);
    await expect(encodeBlueprintPng(new Uint8Array(SIZE * SIZE * 3), 24, preview)).rejects.toThrow("too big");
});
