// the few protobuf pieces a blueprint needs (writing only)
import { concat, f32le } from "./bytes";

export function varint(n: number): Uint8Array {
    if (!Number.isInteger(n)) throw new Error(`protobuf varint needs an integer, got ${n}`);
    let v = BigInt(n);
    if (v < 0n) v = BigInt.asUintN(64, v); // negative numbers are 10 bytes
    const out: number[] = [];
    for (;;) {
        const low = Number(v & 0x7fn);
        v >>= 7n;
        if (v === 0n) {
            out.push(low);
            return Uint8Array.from(out);
        }
        out.push(low | 0x80);
    }
}

const tag = (field: number, wireType: number) => varint((field << 3) | wireType);

export const pbVarint = (field: number, value: number) => concat(tag(field, 0), varint(value));
export const pbLen = (field: number, bytes: Uint8Array) => concat(tag(field, 2), varint(bytes.length), bytes);
// a float, or four raw bytes (used for the exact NaN pattern the game writes)
export const pbF32 = (field: number, value: number | Uint8Array) =>
    concat(tag(field, 5), typeof value === "number" ? f32le(value) : value);
export const pbFix64 = (field: number, bytes8: Uint8Array) => concat(tag(field, 1), bytes8);

// integer vector, a zero component is left out like the game does
export function vecInt(x: number, y: number, z: number): Uint8Array {
    const parts: Uint8Array[] = [];
    if (x) parts.push(pbVarint(1, x));
    if (y) parts.push(pbVarint(2, y));
    if (z) parts.push(pbVarint(3, z));
    return concat(...parts);
}

export const vecFloat = (x: number, y: number, z: number) => concat(pbF32(1, x), pbF32(2, y), pbF32(3, z));

export interface Field {
    field: number;
    wireType: number;
    // varint: a number (bigint when it doesn't fit 53 bits), fixed32/64 and length delimited: the raw bytes
    value: number | bigint | Uint8Array;
}

// reads one level of a message, nested messages are Uint8Array values to parse again
export function parseFields(bytes: Uint8Array): Field[] {
    const fields: Field[] = [];
    let i = 0;
    const readVarint = (): bigint => {
        let result = 0n;
        for (let shift = 0n; ; shift += 7n) {
            if (i >= bytes.length) throw new Error("protobuf: ran out of bytes inside a varint");
            const b = bytes[i++];
            result |= BigInt(b & 0x7f) << shift;
            if (!(b & 0x80)) return result;
        }
    };
    while (i < bytes.length) {
        const key = Number(readVarint());
        const field = key >>> 3;
        const wireType = key & 7;
        if (wireType === 0) {
            const v = readVarint();
            fields.push({ field, wireType, value: v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v });
        } else if (wireType === 2) {
            const length = Number(readVarint());
            fields.push({ field, wireType, value: bytes.subarray(i, i + length) });
            i += length;
        } else if (wireType === 5 || wireType === 1) {
            const length = wireType === 5 ? 4 : 8;
            fields.push({ field, wireType, value: bytes.subarray(i, i + length) });
            i += length;
        } else {
            throw new Error(`protobuf: unsupported wire type ${wireType}`);
        }
    }
    return fields;
}
