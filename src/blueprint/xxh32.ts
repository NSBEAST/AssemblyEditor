// xxHash32, the checksum LZ4 frames use for the header and the content
const P1 = 2654435761;
const P2 = 2246822519;
const P3 = 3266489917;
const P4 = 668265263;
const P5 = 374761393;

const rotl = (x: number, r: number) => ((x << r) | (x >>> (32 - r))) >>> 0;
const mul = (a: number, b: number) => Math.imul(a, b) >>> 0;

export function xxh32(data: Uint8Array, seed = 0): number {
    const n = data.length;
    const view = new DataView(data.buffer, data.byteOffset, n);
    let i = 0;
    let h: number;

    if (n >= 16) {
        let v1 = (seed + P1 + P2) >>> 0;
        let v2 = (seed + P2) >>> 0;
        let v3 = seed >>> 0;
        let v4 = (seed - P1) >>> 0;
        for (; i <= n - 16; i += 16) {
            v1 = mul(rotl((v1 + mul(view.getUint32(i, true), P2)) >>> 0, 13), P1);
            v2 = mul(rotl((v2 + mul(view.getUint32(i + 4, true), P2)) >>> 0, 13), P1);
            v3 = mul(rotl((v3 + mul(view.getUint32(i + 8, true), P2)) >>> 0, 13), P1);
            v4 = mul(rotl((v4 + mul(view.getUint32(i + 12, true), P2)) >>> 0, 13), P1);
        }
        h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0;
    } else {
        h = (seed + P5) >>> 0;
    }

    h = (h + n) >>> 0;
    for (; i + 4 <= n; i += 4) h = mul(rotl((h + mul(view.getUint32(i, true), P3)) >>> 0, 17), P4);
    for (; i < n; i++) h = mul(rotl((h + mul(data[i], P5)) >>> 0, 11), P1);

    h = mul((h ^ (h >>> 15)) >>> 0, P2);
    h = mul((h ^ (h >>> 13)) >>> 0, P3);
    return (h ^ (h >>> 16)) >>> 0;
}
