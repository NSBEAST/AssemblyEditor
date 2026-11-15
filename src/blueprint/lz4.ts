// LZ4 frame writer and reader without dependencies.
// The game saves frames with flags 0x44 0x40 (linked 64 KB blocks, content checksum), we write the same header.
import { concat, u32le } from "./bytes";
import { xxh32 } from "./xxh32";

const MAGIC = Uint8Array.from([0x04, 0x22, 0x4d, 0x18]);
const FLAGS = 0x44;
const BLOCK_DESCRIPTOR = 0x40;
const BLOCK_SIZE = 64 * 1024;

const read32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const hash4 = (v: number) => Math.imul(v, 2654435761) >>> 16;

function pushLength(out: number[], length: number) {
    while (length >= 255) {
        out.push(255);
        length -= 255;
    }
    out.push(length);
}

// one LZ4 block, found with a greedy search. Matches never reach back past the start of the block.
export function compressBlock(src: Uint8Array): Uint8Array {
    const n = src.length;
    const out: number[] = [];
    const table = new Int32Array(1 << 16).fill(-1);
    let anchor = 0;
    let i = 0;

    const emit = (literalEnd: number, offset: number, matchLength: number) => {
        const literals = literalEnd - anchor;
        const matchPart = offset ? matchLength - 4 : 0;
        out.push((Math.min(literals, 15) << 4) | Math.min(matchPart, 15));
        if (literals >= 15) pushLength(out, literals - 15);
        for (let k = anchor; k < literalEnd; k++) out.push(src[k]);
        if (offset) {
            out.push(offset & 0xff, offset >> 8);
            if (matchPart >= 15) pushLength(out, matchPart - 15);
        }
    };

    // the last match has to start 12 bytes before the end and the last 5 bytes are always literals
    while (i + 12 <= n) {
        const h = hash4(read32(src, i));
        const ref = table[h];
        table[h] = i;
        if (ref >= 0 && i - ref <= 0xffff && read32(src, ref) === read32(src, i)) {
            let length = 4;
            while (i + length < n - 5 && src[ref + length] === src[i + length]) length++;
            emit(i, i - ref, length);
            i += length;
            anchor = i;
        } else {
            i++;
        }
    }
    emit(n, 0, 0);
    return Uint8Array.from(out);
}

export function decompressBlock(src: Uint8Array, out: number[]) {
    let i = 0;
    while (i < src.length) {
        const token = src[i++];
        let literals = token >> 4;
        if (literals === 15) {
            let extra: number;
            do {
                extra = src[i++];
                literals += extra;
            } while (extra === 255);
        }
        for (let k = 0; k < literals; k++) out.push(src[i++]);
        if (i >= src.length) return; // the last sequence has no match
        const offset = src[i] | (src[i + 1] << 8);
        i += 2;
        let length = (token & 15) + 4;
        if ((token & 15) === 15) {
            let extra: number;
            do {
                extra = src[i++];
                length += extra;
            } while (extra === 255);
        }
        if (offset === 0 || offset > out.length) throw new Error("LZ4: a match points before the start of the data");
        for (let k = 0; k < length; k++) out.push(out[out.length - offset]);
    }
}

export function lz4Frame(data: Uint8Array): Uint8Array {
    const descriptor = Uint8Array.from([FLAGS, BLOCK_DESCRIPTOR]);
    const parts: Uint8Array[] = [MAGIC, descriptor, Uint8Array.from([(xxh32(descriptor) >>> 8) & 0xff])];
    for (let start = 0; start < data.length; start += BLOCK_SIZE) {
        const chunk = data.subarray(start, start + BLOCK_SIZE);
        const packed = compressBlock(chunk);
        if (packed.length < chunk.length) {
            parts.push(u32le(packed.length), packed);
        } else {
            parts.push(u32le(chunk.length | 0x80000000), chunk); // stored as is
        }
    }
    parts.push(u32le(0), u32le(xxh32(data)));
    return concat(...parts);
}

export function lz4Decode(frame: Uint8Array): Uint8Array {
    if (read32(frame, 0) !== read32(MAGIC, 0)) throw new Error("LZ4: not a frame (wrong magic number)");
    const flags = frame[4];
    if (flags & 0x08 || flags & 0x01) throw new Error("LZ4: content size and dictionary ids are not supported");
    const blockChecksum = Boolean(flags & 0x10);
    const contentChecksum = Boolean(flags & 0x04);
    let i = 7; // magic, flags, block descriptor, header checksum
    const out: number[] = [];
    for (;;) {
        const size = read32(frame, i);
        i += 4;
        if (size === 0) break;
        const stored = Boolean(size & 0x80000000);
        const length = size & 0x7fffffff;
        const block = frame.subarray(i, i + length);
        i += length;
        if (blockChecksum) i += 4;
        if (stored) for (const b of block) out.push(b);
        else decompressBlock(block, out);
    }
    const data = Uint8Array.from(out);
    if (contentChecksum && read32(frame, i) !== xxh32(data)) throw new Error("LZ4: the content checksum does not match");
    return data;
}
