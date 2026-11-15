// the blueprint picture: 512 x 512 RGBA. The data hides in the RGB of fully transparent pixels,
// from the bottom left going right and then up. The top right pixel holds the header length in its alpha.
export const SIZE = 512;
const PIXELS = SIZE * SIZE;

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(parts: Uint8Array[]): number {
    let c = 0xffffffff;
    for (const part of parts) for (const b of part) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const source = new Blob([data as BlobPart]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(source).arrayBuffer());
}
const deflate = (data: Uint8Array) => pipe(data, new CompressionStream("deflate"));
const inflate = (data: Uint8Array) => pipe(data, new DecompressionStream("deflate"));

function chunk(type: string, data: Uint8Array): Uint8Array {
    const name = Uint8Array.from(type, (c) => c.charCodeAt(0));
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(name, 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32([name, data]));
    return out;
}

// puts the payload into a copy of the preview (512 x 512 x 4 bytes, alpha 255) and encodes it as a PNG
export async function encodeBlueprintPng(payload: Uint8Array, headerLength: number, preview: Uint8Array): Promise<Uint8Array> {
    if (preview.length !== PIXELS * 4) throw new Error("the preview must be 512 x 512 RGBA");
    const dataPixels = Math.ceil(payload.length / 3);
    // the last pixel is taken by the header length
    if (dataPixels > PIXELS - 1) throw new Error(`this blueprint is too big for one picture (${payload.length} of ${(PIXELS - 1) * 3} bytes)`);
    if (headerLength > 255) throw new Error("the header is too long to store in one pixel");

    const rgba = preview.slice();
    for (let p = 0; p < dataPixels; p++) {
        // stream order starts at the bottom left, the file's first row is the top
        const at = ((SIZE - 1 - Math.floor(p / SIZE)) * SIZE + (p % SIZE)) * 4;
        rgba[at] = payload[3 * p] ?? 0;
        rgba[at + 1] = payload[3 * p + 1] ?? 0;
        rgba[at + 2] = payload[3 * p + 2] ?? 0;
        rgba[at + 3] = 0;
    }
    rgba.set([0, 0, 0, headerLength], (SIZE - 1) * 4); // top row, last column

    // every row starts with filter type 0 (none)
    const raw = new Uint8Array(SIZE * (1 + SIZE * 4));
    for (let y = 0; y < SIZE; y++) raw.set(rgba.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), y * (1 + SIZE * 4) + 1);

    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, SIZE);
    view.setUint32(4, SIZE);
    header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA, standard compression and filter, no interlace

    const parts = [SIGNATURE, chunk("IHDR", header), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array())];
    let length = 0;
    for (const part of parts) length += part.length;
    const png = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        png.set(part, offset);
        offset += part.length;
    }
    return png;
}

const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// reads the hidden payload back out of a blueprint picture
export async function decodeBlueprintPng(png: Uint8Array): Promise<{ payload: Uint8Array; headerLength: number }> {
    if (!SIGNATURE.every((b, i) => png[i] === b)) throw new Error("this is not a PNG file");
    const view = new DataView(png.buffer, png.byteOffset, png.length);
    const idat: Uint8Array[] = [];
    let width = 0;
    let height = 0;
    for (let i = 8; i < png.length; ) {
        const length = view.getUint32(i);
        const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
        const data = png.subarray(i + 8, i + 8 + length);
        if (type === "IHDR") {
            const header = new DataView(data.buffer, data.byteOffset, data.length);
            width = header.getUint32(0);
            height = header.getUint32(4);
            if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("only 8 bit RGBA pictures without interlacing are supported");
        } else if (type === "IDAT") idat.push(data);
        i += 12 + length;
    }
    if (width !== SIZE || height !== SIZE) throw new Error("a blueprint picture is 512 x 512");

    let total = 0;
    for (const part of idat) total += part.length;
    const compressed = new Uint8Array(total);
    let at = 0;
    for (const part of idat) {
        compressed.set(part, at);
        at += part.length;
    }
    const raw = await inflate(compressed);

    const stride = SIZE * 4;
    const rgba = new Uint8Array(SIZE * stride);
    for (let y = 0; y < SIZE; y++) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const value = raw[y * (stride + 1) + 1 + x];
            const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
            const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
            const upLeft = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
            const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
            if (predicted === undefined) throw new Error(`unknown PNG filter ${filter}`);
            rgba[y * stride + x] = (value + predicted) & 0xff;
        }
    }

    const headerLength = rgba[(SIZE - 1) * 4 + 3];
    const bytes: number[] = [];
    for (let p = 0; p < PIXELS - 1; p++) {
        const index = ((SIZE - 1 - Math.floor(p / SIZE)) * SIZE + (p % SIZE)) * 4;
        if (rgba[index + 3] !== 0) break;
        bytes.push(rgba[index], rgba[index + 1], rgba[index + 2]);
    }
    return { payload: Uint8Array.from(bytes), headerLength };
}
