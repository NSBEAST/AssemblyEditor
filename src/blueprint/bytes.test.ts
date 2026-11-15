import { expect, test } from "vitest";
import { concat, guidBytes, toHex } from "./bytes";
import { varint, vecInt, pbLen } from "./protobuf";

test("varints use 7 bits per byte", () => {
    expect(toHex(varint(0))).toBe("00");
    expect(toHex(varint(127))).toBe("7f");
    expect(toHex(varint(300))).toBe("ac02");
});

test("a negative varint is 10 bytes (64 bit two's complement)", () => {
    expect(toHex(varint(-1))).toBe("ffffffffffffffffff01");
});

test("varint rejects fractions", () => {
    expect(() => varint(1.5)).toThrow("needs an integer");
});

test("an integer vector leaves out zero components", () => {
    expect(vecInt(0, 0, 0)).toHaveLength(0);
    expect(toHex(vecInt(1, 0, 2))).toBe("08011802");
    expect(toHex(vecInt(-1, 0, 0))).toBe("08ffffffffffffffffff01");
});

test("length delimited fields get a length prefix", () => {
    expect(toHex(pbLen(3, Uint8Array.from([1, 2])))).toBe("1a020102");
});

test("a GUID keeps the .NET byte order", () => {
    expect(toHex(guidBytes("0e89fb46-4344-4e9e-81a2-c8a659a5d95e"))).toBe("46fb890e44439e4e81a2c8a659a5d95e");
    expect(() => guidBytes("nope")).toThrow("not a GUID");
});

test("concat joins parts", () => {
    expect(toHex(concat(Uint8Array.from([1]), new Uint8Array(), Uint8Array.from([2, 3])))).toBe("010203");
});
