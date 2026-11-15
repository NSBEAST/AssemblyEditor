// small byte helpers shared by the whole blueprint code

export function concat(...parts: Uint8Array[]): Uint8Array {
    let length = 0;
    for (const part of parts) length += part.length;
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

export function u32le(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
}

export function f32le(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setFloat32(0, value, true);
    return out;
}

export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// the 16 bytes of a .NET Guid: the first three groups are stored little endian
export function guidBytes(guid: string): Uint8Array {
    const hex = guid.replaceAll("-", "");
    if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`'${guid}' is not a GUID`);
    const plain = Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
    const out = new Uint8Array(16);
    out.set([plain[3], plain[2], plain[1], plain[0], plain[5], plain[4], plain[7], plain[6]]);
    out.set(plain.subarray(8), 8);
    return out;
}

export function randomGuid(): string {
    return crypto.randomUUID();
}
