// Mode C: no gates for the data. Each value is a comparator that reads the PC and outputs value / scale when
// the PC matches its row. A red Arithmetics block per column adds the column and multiplies by scale again.
//   z+0..1  comparators (data)             z+2  red Arithmetics (above the last row)
import { exactOutput } from "../floats";
import { COLORS, createBlock, type Block } from "../model";
import { cellOf } from "./tiling";
import type { RomPlacement } from "./types";

export const COMPARATOR_ROW_HEIGHT = 2;

export function placeComparatorGrid(
    stored: number[][],
    thresholds: number[],
    across: number,
    skipZeros: boolean,
    scale: number,
): RomPlacement {
    const count = stored.length;
    const columns = stored[0]?.length ?? 0;
    const blocks: Block[] = [];
    const comparators: Block[] = [];
    const byColumn: Block[][] = Array.from({ length: columns }, () => []);

    for (let r = 0; r < count; r++) {
        const { column, row } = cellOf(r, across);
        for (let j = 0; j < columns; j++) {
            const value = stored[r][j];
            const position = [column * columns + j, 0, row * COMPARATOR_ROW_HEIGHT] as const;
            if (skipZeros && value === 0) {
                blocks.push(createBlock("grid", position));
                continue;
            }
            const cell = createBlock("comp", position, [0, 0, 0], COLORS.data, {
                mode: 2,
                threshold: thresholds[r],
                output: exactOutput(value, scale).output,
            });
            blocks.push(cell);
            comparators.push(cell);
            byColumn[j].push(cell);
        }
    }

    const topZ = Math.ceil(count / across) * COMPARATOR_ROW_HEIGHT;
    const outputs = byColumn.map((cells, j) => {
        const red = createBlock("arith", [j, 0, topZ], [0, 0, 1], COLORS.output, { operation: 2, constant: scale });
        red.inputs = cells;
        blocks.push(red);
        return red;
    });
    return { blocks, comparators, outputs, topZ };
}
