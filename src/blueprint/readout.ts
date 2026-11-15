// Everything around the ROM that makes it usable: the PC block, number displays, test keys and the seat.
//   z+0..1  red outputs | PC | test gates     z+2..3  displays | OR gates     under the strip: the base blocks
import { f32 } from "./floats";
import type { RomPlacement } from "./layout/types";
import { COLORS, createBlock, type Block } from "./model";

// Key codes the seat offers for the digit keys 1 to 0 (not tested in the game yet)
export const TEST_KEY_CODES = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49];
export const READOUT_HEIGHT = 4;

export interface ReadoutOptions {
    pcScale: number;
    testPcValues: number[]; // the PC value each test key sets
    seat: boolean;
}

// how wide the strip above the ROM is, so the layout can keep the whole build square
export function readoutWidth(columns: number, options: ReadoutOptions): number {
    return columns + 1 + options.testPcValues.length + (options.seat || options.testPcValues.length ? 2 : 0);
}

export function addReadout(rom: RomPlacement, options: ReadoutOptions): Block[] {
    const columns = rom.outputs.length;
    const z = rom.topZ;
    const keys = options.testPcValues.length;
    const blocks = [...rom.blocks];

    // the PC is a plain sum, or a sum multiplied by the scale (0.1) so the comparators can count in steps of 0.1
    const pc =
        options.pcScale === 1
            ? createBlock("aggr", [columns, 0, z], [0, 0, 1], COLORS.pc)
            : createBlock("arith", [columns, 0, z], [0, 0, 1], COLORS.pc, { operation: 2, constant: f32(options.pcScale) });
    blocks.push(pc);
    for (const comparator of rom.comparators) comparator.inputs = [pc];

    // the PC's display first, then one for every output column
    const shown: Array<[number, Block]> = [[columns, pc], ...rom.outputs.map((out, j): [number, Block] => [j, out])];
    for (const [x, source] of shown) {
        const display = createBlock("disp", [x, 0, z + 2], [0, 0, 1], COLORS.base);
        display.inputs = [source];
        blocks.push(display);
    }

    const seatX = columns + keys + 1;
    const seat = options.seat || keys > 0 ? createBlock("seat", [seatX, 0, z + 1], [0, 0, 0], COLORS.base, { keys: TEST_KEY_CODES.slice(0, keys) }) : null;

    for (let i = 0; i < keys; i++) {
        const x = columns + 1 + i;
        const gate = createBlock("arith", [x, 0, z], [0, 0, 1], COLORS.base, { operation: 2, constant: options.testPcValues[i] });
        const key = createBlock("or", [x, 0, z + 2], [0, 0, 1], COLORS.base, { key: TEST_KEY_CODES[i], keyPair: i });
        key.inputs = [seat!];
        gate.inputs = [key];
        pc.inputs.push(gate);
        blocks.push(gate, key);
    }

    if (seat) {
        // The seat can only attach with its bottom, so it sits on plain blocks that also touch the strip.
        // Two are enough (the geometry test checks it): one under the last strip block, one under the seat.
        // The seat is first in the file, the plain blocks come last.
        blocks.unshift(seat);
        for (const x of [seatX - 1, seatX]) blocks.push(createBlock("grid", [x, -1, z]));
    }
    return blocks;
}
