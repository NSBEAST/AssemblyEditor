// float32 helpers. The game computes in float32, so thresholds and outputs are chosen with them.

export const f32 = Math.fround;

// the exact bytes the game writes for an unset slider (a quiet NaN)
export const NAN_BYTES = Uint8Array.from([0x00, 0x00, 0xc0, 0x7f]);

// the product of two float32 values. Their exact product fits in a double, so one rounding step is exact.
export const mulF32 = (a: number, b: number) => f32(f32(a) * f32(b));
export const addF32 = (a: number, b: number) => f32(f32(a) + f32(b));

const view = new DataView(new ArrayBuffer(4));

// the next float32 after x, going up or down
export function nextAfter32(x: number, up: boolean): number {
    if (x === 0) return up ? 2 ** -149 : -(2 ** -149);
    view.setFloat32(0, x);
    // for both signs, one more in the raw bits is one step away from zero
    const awayFromZero = x > 0 === up;
    view.setInt32(0, view.getInt32(0) + (awayFromZero ? 1 : -1));
    return view.getFloat32(0);
}

// A comparator's Output x (-1..1) such that f32(x * scale) is as close to value as possible.
// With scale 1000 about 20 values in -1000..1000 can't be hit exactly, error says how far off it is.
export function exactOutput(value: number, scale: number, maxSteps = 6): { output: number; error: number } {
    const x0 = f32(value / scale);
    let best = x0;
    let bestError = Math.abs(mulF32(x0, scale) - value);
    for (const up of [true, false]) {
        let y = x0;
        for (let step = 0; step < maxSteps; step++) {
            y = nextAfter32(y, up);
            const error = Math.abs(mulF32(y, scale) - value);
            if (error < bestError) {
                best = y;
                bestError = error;
            }
        }
    }
    return { output: best, error: bestError };
}
