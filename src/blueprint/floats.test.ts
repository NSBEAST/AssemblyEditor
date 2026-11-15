import { expect, test } from "vitest";
import { exactOutput, f32, mulF32, nextAfter32 } from "./floats";

test("nextAfter32 steps one float32 up and down, for both signs", () => {
    expect(nextAfter32(1, true)).toBe(1 + 2 ** -23);
    expect(nextAfter32(1, false)).toBe(1 - 2 ** -24);
    expect(nextAfter32(-1, true)).toBe(-(1 - 2 ** -24));
    expect(nextAfter32(-1, false)).toBe(-(1 + 2 ** -23));
    expect(nextAfter32(0, true)).toBe(2 ** -149);
    expect(nextAfter32(0, false)).toBe(-(2 ** -149));
});

test("the PC multiplied by 0.1 is not always the float of the typed decimal", () => {
    expect(mulF32(1, 0.1)).toBe(f32(0.1));
    // the first row where typing 0.9 would never match
    expect(mulF32(9, 0.1)).not.toBe(f32(0.9));
});

test("199 of the rows 0 to 1000 differ when thresholds are typed as decimals", () => {
    let different = 0;
    for (let k = 0; k <= 1000; k++) if (mulF32(k, 0.1) !== f32(Math.round(k) / 10)) different++;
    expect(different).toBe(199);
});

test("scale 512 is exact for every value from -512 to 512", () => {
    for (let v = -512; v <= 512; v++) expect(exactOutput(v, 512).error).toBe(0);
});

test("scale 1000 can't hit about 20 values exactly, and only misses by a tiny amount", () => {
    let inexact = 0;
    let worst = 0;
    for (let v = -1000; v <= 1000; v++) {
        const { output, error } = exactOutput(v, 1000);
        expect(Math.abs(output)).toBeLessThanOrEqual(1);
        if (error > 0) inexact++;
        worst = Math.max(worst, error);
    }
    expect(inexact).toBeGreaterThan(0);
    expect(inexact).toBeLessThanOrEqual(20);
    expect(worst).toBeLessThan(4e-5);
});
