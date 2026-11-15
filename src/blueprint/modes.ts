// The ROM modes. A mode checks the ROM rows, turns them into the numbers the gates store and places the blocks.
// A new mode is a new entry in MODES (plus its name in options.ts).
import { exactOutput, f32 } from "./floats";
import { COMPARATOR_ROW_HEIGHT, placeComparatorGrid } from "./layout/comparatorGrid";
import { GATE_ROW_HEIGHT, placeGateRows } from "./layout/gateRows";
import type { RomPlacement } from "./layout/types";
import { BlueprintError, type BlueprintOptions, type RomMode } from "./options";

// the Arithmetics constant slider
export const CONSTANT_LIMIT = 1000;

export interface Prepared {
    columns: number; // output columns of the ROM
    stored: number[][]; // what the gates of every row store
    warnings: string[];
}

export interface ModeDefinition {
    label: string;
    description: string;
    prepare(rows: number[][], firstIndex: number, options: BlueprintOptions): Prepared;
    // the size of one instruction on the grid, in cells, for choosing a square layout
    cellWidth(columns: number): number;
    cellHeight: number;
    place(prepared: Prepared, thresholds: number[], across: number, options: BlueprintOptions): RomPlacement;
}

function where(r: number, j: number, firstIndex: number) {
    return `row ${firstIndex + r}, number ${j + 1}`;
}

function checkRange(rows: number[][], firstIndex: number, min: number, max: number, what: string) {
    rows.forEach((row, r) =>
        row.forEach((value, j) => {
            if (!Number.isFinite(value) || value < min || value > max)
                throw new BlueprintError(`${where(r, j, firstIndex)} is ${value}, but ${what} must be between ${min} and ${max}.`);
        }),
    );
}

const MODES_A: ModeDefinition = {
    label: "A: a gate for every number",
    description: "Each number is a Multiply gate that the instruction's comparator switches on.",
    prepare(rows, firstIndex) {
        checkRange(rows, firstIndex, -CONSTANT_LIMIT, CONSTANT_LIMIT, "a number in this mode");
        return { columns: rows[0].length, stored: rows, warnings: [] };
    },
    cellWidth: (columns) => columns,
    cellHeight: GATE_ROW_HEIGHT,
    place: (p, thresholds, across, options) => placeGateRows(p.stored, thresholds, across, options.skipZeros),
};

const MODES_B: ModeDefinition = {
    label: "B: two numbers in every gate",
    description: "Two numbers a and b share one gate as a + b / 1000, so the ROM is half as wide.",
    prepare(rows, firstIndex) {
        checkRange(rows, firstIndex, 0, 999, "a number in this mode");
        rows.forEach((row, r) =>
            row.forEach((value, j) => {
                if (!Number.isInteger(value)) throw new BlueprintError(`${where(r, j, firstIndex)} is ${value}, but this mode only stores whole numbers.`);
            }),
        );
        const columns = Math.ceil(rows[0].length / 2);
        const stored = rows.map((row) =>
            Array.from({ length: columns }, (_, j) => f32(row[2 * j] + (row[2 * j + 1] ?? 0) / 1000)),
        );
        return { columns, stored, warnings: [] };
    },
    cellWidth: (columns) => columns,
    cellHeight: GATE_ROW_HEIGHT,
    place: (p, thresholds, across, options) => placeGateRows(p.stored, thresholds, across, options.skipZeros),
};

const MODES_C: ModeDefinition = {
    label: "C: a comparator for every number",
    description: "Each number is a comparator that outputs number / 1000 for its row, the red block scales it back.",
    prepare(rows, firstIndex, options) {
        const scale = options.outputScale;
        if (!(scale > 0 && scale <= CONSTANT_LIMIT))
            throw new BlueprintError(`The output scale must be above 0 and at most ${CONSTANT_LIMIT} (the Arithmetics slider).`);
        checkRange(rows, firstIndex, -scale, scale, `a number with output scale ${scale}`);

        // the output is a float, so some numbers come back a tiny bit off after the multiplication
        const off = new Set<number>();
        for (const row of rows) for (const value of row) if (exactOutput(value, scale).error > 0) off.add(value);
        const warnings: string[] = [];
        if (off.size) {
            const list = [...off].sort((a, b) => a - b).slice(0, 8).join(", ");
            warnings.push(
                `With output scale ${scale} the number${off.size > 1 ? "s" : ""} ${list}${off.size > 8 ? ", …" : ""} can't be stored exactly and read back slightly off (like 127.00001). Output scale 512 is exact for -512 to 512, mode A is always exact.`,
            );
        }
        return { columns: rows[0].length, stored: rows, warnings };
    },
    cellWidth: (columns) => columns,
    cellHeight: COMPARATOR_ROW_HEIGHT,
    place: (p, thresholds, across, options) => placeComparatorGrid(p.stored, thresholds, across, options.skipZeros, options.outputScale),
};

export const MODES: Record<RomMode, ModeDefinition> = { A: MODES_A, B: MODES_B, C: MODES_C };
