// Modes A and B: every instruction has a comparator that reads the PC and a row of Multiply gates that each
// store one number. The comparator switches its gates on, a red Aggregate per column adds all instructions.
//   z+0..1  comparator            z+2..3  gates (data)             z+4  red Aggregates (above the last row)
import { COLORS, createBlock, type Block } from "../model";
import { cellOf } from "./tiling";
import type { RomPlacement } from "./types";

export const GATE_ROW_HEIGHT = 4;

export function placeGateRows(stored: number[][], thresholds: number[], across: number, skipZeros: boolean): RomPlacement {
    const count = stored.length;
    const columns = stored[0]?.length ?? 0;
    const blocks: Block[] = [];
    const comparators: Block[] = [];
    const gates: Array<Array<Block | null>> = [];

    for (let r = 0; r < count; r++) {
        const { column, row } = cellOf(r, across);
        const x0 = column * columns;
        const z0 = row * GATE_ROW_HEIGHT;
        const values = stored[r];

        // a row of zeros needs no comparator, a plain block keeps the build connected
        const empty = skipZeros && values.every((v) => v === 0);
        const comparator = empty
            ? createBlock("grid", [x0, 0, z0])
            : createBlock("comp", [x0, 0, z0], [0, 0, 0], COLORS.comparison, { mode: 2, threshold: thresholds[r], output: 1 });
        blocks.push(comparator);
        if (!empty) comparators.push(comparator);

        gates[r] = values.map((value, j) => {
            const position = [x0 + j, 0, z0 + 2] as const;
            if (skipZeros && value === 0) {
                blocks.push(createBlock("grid", position));
                return null;
            }
            const gate = createBlock("arith", position, [0, 0, 1], COLORS.data, { operation: 2, constant: value });
            gate.inputs = [comparator];
            blocks.push(gate);
            return gate;
        });
    }

    const topZ = Math.ceil(count / across) * GATE_ROW_HEIGHT;
    const outputs: Block[] = [];
    for (let j = 0; j < columns; j++) {
        const red = createBlock("aggr", [j, 0, topZ], [0, 0, 1], COLORS.output);
        red.inputs = gates.map((row) => row[j]).filter((g): g is Block => g !== null);
        outputs.push(red);
        blocks.push(red);
    }
    return { blocks, comparators, outputs, topZ };
}
