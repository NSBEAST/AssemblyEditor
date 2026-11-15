// The blueprint's text fields are Smaz compressed. We only write literals (no codebook words),
// which every Smaz reader accepts: FF, a count, then that many bytes. Runs are 64 bytes at most.
const RUN = 64;

export function smazLiterals(bytes: Uint8Array): Uint8Array {
    const out: number[] = [];
    for (let start = 0; start < bytes.length; start += RUN) {
        const run = bytes.subarray(start, start + RUN);
        out.push(255, run.length, ...run);
    }
    return Uint8Array.from(out);
}

// reads literal runs back, text the game compressed with codebook words can't be read
export function smazLiteralsDecode(bytes: Uint8Array): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < bytes.length; ) {
        if (bytes[i] === 254) {
            out.push(bytes[i + 1]);
            i += 2;
        } else if (bytes[i] === 255) {
            const count = bytes[i + 1];
            out.push(...bytes.subarray(i + 2, i + 2 + count));
            i += 2 + count;
        } else {
            throw new Error("Smaz: this text uses codebook words, only literal text can be read");
        }
    }
    return Uint8Array.from(out);
}
