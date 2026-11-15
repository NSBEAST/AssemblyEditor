import { describe, expect, test } from "vitest";
import { buildBlocks } from "./build";
import { checkGeometry } from "./geometry";
import { f32 } from "./floats";
import { MODES } from "./modes";
import { BlueprintError, type BlueprintOptions, type RomMode } from "./options";
import { simulate } from "./simulate";
import type { Block } from "./model";

const PROGRAM = [
    [1, 2, 3, 4],
    [5, 7, 9, 11],
    [13, 16, 19, 22],
];

// what the displays under the red blocks show while the test key for `row` is held
function readRow(blocks: Block[], row: number, firstIndex: number, keyIndex = row - firstIndex) {
    const read = simulate([40 + keyIndex]);
    const displays = blocks.filter((b) => b.type === "disp").sort((a, b) => a.pos[0] - b.pos[0]);
    const columns = displays.length - 1; // the last display is the PC's
    return { outputs: displays.slice(0, columns).map((d) => read(d)), pc: read(displays[columns]) };
}

function expectedRow(mode: RomMode, row: number[]) {
    if (mode !== "B") return row;
    return Array.from({ length: Math.ceil(row.length / 2) }, (_, j) => f32(row[2 * j] + (row[2 * j + 1] ?? 0) / 1000));
}

function checkAll(mode: RomMode, rows: number[][], overrides: Partial<BlueprintOptions> = {}) {
    const first = overrides.firstIndex ?? 0;
    const { blocks, warnings, stats } = buildBlocks(rows, { mode, ...overrides });
    const report = checkGeometry(blocks);
    expect(report.overlaps).toEqual([]);
    expect(report.groups).toHaveLength(1);
    const tested = overrides.testControls === undefined || overrides.testControls === "auto" ? rows.slice(0, 10).map((_, i) => first + i) : (overrides.testControls as number[]);
    for (const [i, address] of tested.entries()) {
        const { outputs } = readRow(blocks, address, first, i);
        const want = expectedRow(mode, rows[address - first]);
        for (const [j, value] of outputs.entries()) expect(value, `${mode} row ${address} column ${j}`).toBeCloseTo(want[j], 3);
    }
    return { blocks, warnings, stats };
}

describe.each(["A", "B", "C"] as const)("mode %s", (mode) => {
    test("reads back the example program, one row per test key", () => {
        const { blocks } = checkAll(mode, PROGRAM, { firstIndex: 1 });
        const first = readRow(blocks, 1, 1);
        expect(first.pc).toBe(1);
        expect(first.outputs).toEqual(expectedRow(mode, PROGRAM[0]));
    });

    test("with no key held the PC is 0: nothing shows when the program starts at 1", () => {
        const { blocks } = buildBlocks(PROGRAM, { mode, firstIndex: 1 });
        const read = simulate();
        for (const display of blocks.filter((b) => b.type === "disp")) expect(read(display)).toBe(0);
    });

    test("with no key held the PC is 0, so a program that starts at 0 shows its first row", () => {
        const { blocks } = buildBlocks(PROGRAM, { mode, firstIndex: 0 });
        const read = simulate();
        const displays = blocks.filter((b) => b.type === "disp").sort((a, b) => a.pos[0] - b.pos[0]);
        expect(read(displays.at(-1)!)).toBe(0); // the PC
        expect(read(displays[0])).toBeCloseTo(expectedRow(mode, PROGRAM[0])[0], 3);
    });

    test("the example fits in one piece without overlaps", () => {
        const { blocks, stats } = buildBlocks(PROGRAM, { mode });
        expect(checkGeometry(blocks)).toEqual({ overlaps: [], groups: [blocks.length] });
        expect(stats.rows).toBe(3);
    });

    test("a program of 57 rows works, also with different tile widths", () => {
        let seed = mode.charCodeAt(0);
        const next = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) % 1000;
        const rows = Array.from({ length: 57 }, () => Array.from({ length: 5 }, () => (next() % 4 === 0 ? 0 : next())));
        const picks = [0, 1, 17, 18, 31, 40, 56];
        const first = 3;
        for (const tileColumns of ["auto", 1, 2, 5, 11, 57] as const)
            checkAll(mode, rows, { firstIndex: first, tileColumns, testControls: picks.map((p) => p + first) });
    });

    test("skipping zeros gives the same outputs with fewer blocks", () => {
        const rows = Array.from({ length: 12 }, (_, r) => [r % 3 === 0 ? 0 : r, 0, r % 2 ? 0 : 100 + r, 0]);
        const full = checkAll(mode, rows, { skipZeros: false });
        const skipped = checkAll(mode, rows, { skipZeros: true });
        const logic = (blocks: Block[]) => blocks.filter((b) => b.type === "comp" || b.type === "arith").length;
        expect(logic(skipped.blocks)).toBeLessThan(logic(full.blocks));
        expect(skipped.blocks.length).toBe(full.blocks.length); // fillers keep the size
    });

    test("an all zero program still builds", () => {
        checkAll(mode, [[0, 0], [0, 0], [0, 0]]);
    });
});

describe("squareness", () => {
    test.each(["A", "B", "C"] as const)("a long program is not a long strip in mode %s", (mode) => {
        const rows = Array.from({ length: 100 }, (_, i) => [i, i % 7, 1, 2]);
        const { stats } = buildBlocks(rows, { mode, pcScale: 1 });
        const ratio = Math.max(stats.width, stats.depth) / Math.min(stats.width, stats.depth);
        expect(ratio).toBeLessThan(1.8);
        expect(stats.across).toBeGreaterThan(1);
    });

    test("a single instruction is just one cell", () => {
        expect(buildBlocks([[1, 2]], { mode: "C" }).stats.across).toBe(1);
    });
});

describe("PC scale", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [i + 1]);

    test("auto picks 1 for up to 100 addresses and 0.1 above", () => {
        expect(buildBlocks(rows.slice(0, 100), { mode: "C" }).stats.pcScale).toBe(1);
        expect(buildBlocks(rows.slice(0, 100), { mode: "C", firstIndex: 1 }).stats.pcScale).toBe(1);
        expect(buildBlocks(rows, { mode: "C" }).stats.pcScale).toBe(0.1);
    });

    test("too many rows for scale 1 is an error that names the limit", () => {
        expect(() => buildBlocks(rows, { mode: "C", pcScale: 1 })).toThrow(BlueprintError);
        expect(() => buildBlocks(rows, { mode: "C", pcScale: 1 })).toThrow("only reach address 100");
    });

    test("more than 1000 addresses is an error", () => {
        const big = Array.from({ length: 1002 }, () => [1]);
        expect(() => buildBlocks(big, { mode: "C" })).toThrow("at most 1000 addresses");
    });

    test("exact thresholds find every row, typed decimals miss some (the float problem)", () => {
        const wanted = [9, 13, 18, 21, 26, 31, 36, 42, 47, 52].map((k) => k - 1);
        const read = (typed: boolean) => {
            const { blocks } = buildBlocks(rows, { mode: "C", firstIndex: 1, testControls: wanted.map((r) => r + 1), typedThresholds: typed });
            return wanted.map((r, i) => readRow(blocks, r + 1, 1, i).outputs[0]);
        };
        expect(read(false)).toEqual(wanted.map((r) => r + 1));
        expect(read(true).some((v) => v === 0)).toBe(true);
    });

    test("scale 0.1 shows a warning about it, scale 1 does not", () => {
        expect(buildBlocks(rows, { mode: "C" }).warnings.join(" ")).toContain("multiplied by 0.1");
        expect(buildBlocks(rows.slice(0, 5), { mode: "C" }).warnings).toEqual([]);
    });
});

describe("checks and errors", () => {
    test("an empty program", () => {
        expect(() => buildBlocks([])).toThrow("empty");
    });

    test("mode A refuses numbers outside -1000..1000, and says where", () => {
        expect(() => buildBlocks([[1, 2], [3, 1001]], { mode: "A", firstIndex: 5 })).toThrow("row 6, number 2 is 1001");
    });

    test("mode B refuses negatives, fractions and numbers above 999", () => {
        expect(() => buildBlocks([[1, -1]], { mode: "B" })).toThrow("between 0 and 999");
        expect(() => buildBlocks([[1000, 1]], { mode: "B" })).toThrow("between 0 and 999");
        expect(() => buildBlocks([[1, 1.5]], { mode: "B" })).toThrow("whole numbers");
    });

    test("mode B pairs the numbers, an odd count is padded with 0", () => {
        const { blocks, stats } = buildBlocks([[1, 2, 3]], { mode: "B", firstIndex: 0 });
        expect(stats.columns).toBe(2);
        expect(readRow(blocks, 0, 0).outputs).toEqual([f32(1.002), 3]);
    });

    test("mode C: negatives work and the scale limits the range", () => {
        const { blocks } = buildBlocks([[-1000, 1000, -5]], { mode: "C" });
        expect(readRow(blocks, 0, 0).outputs).toEqual([-1000, 1000, -5]);
        expect(() => buildBlocks([[600]], { mode: "C", outputScale: 512 })).toThrow("between -512 and 512");
        expect(() => buildBlocks([[1]], { mode: "C", outputScale: 2000 })).toThrow("at most 1000");
    });

    test("mode C warns about numbers it can't store exactly, scale 512 does not", () => {
        const rows = [[127, 251, 5]];
        expect(buildBlocks(rows, { mode: "C" }).warnings.join(" ")).toContain("127, 251");
        expect(buildBlocks(rows, { mode: "C", outputScale: 512 }).warnings).toEqual([]);
    });

    test("only 10 test keys exist", () => {
        expect(() => buildBlocks([[1]], { testControls: Array.from({ length: 11 }, (_, i) => i) })).toThrow("at most 10");
    });
});

describe("the readout", () => {
    test("there is a seat and it comes first, with the digit keys", () => {
        const { blocks } = buildBlocks(PROGRAM);
        expect(blocks[0].type).toBe("seat");
        expect(blocks[0].params.keys).toHaveLength(3);
    });

    test("the seat hangs on just two plain blocks under the strip", () => {
        const { blocks } = buildBlocks(PROGRAM);
        const under = blocks.filter((b) => b.type === "grid" && b.pos[1] === -1);
        expect(under).toHaveLength(2);
        expect(checkGeometry(blocks).groups).toHaveLength(1);
        // no seat and no test keys: nothing hangs below at all
        const none = buildBlocks(PROGRAM, { testControls: "off", seat: false }).blocks;
        expect(none.some((b) => b.pos[1] < 0)).toBe(false);
    });

    test("without test controls the PC block is left open for the CPU, the seat stays", () => {
        const { blocks } = buildBlocks(PROGRAM, { testControls: "off" });
        const pc = blocks.find((b) => b.color === 14)!;
        expect(pc.inputs).toEqual([]);
        expect(blocks[0].type).toBe("seat");
        expect(checkGeometry(blocks).groups).toHaveLength(1);
        expect(buildBlocks(PROGRAM, { testControls: "off", seat: false }).blocks.some((b) => b.type === "seat")).toBe(false);
    });

    test("colours: data blue, comparison green, PC yellow, output red", () => {
        const { blocks } = buildBlocks(PROGRAM, { mode: "A" });
        const colours = (type: string) => new Set(blocks.filter((b) => b.type === type).map((b) => b.color));
        expect(colours("comp")).toEqual(new Set([12]));
        expect(blocks.filter((b) => b.color === 6).every((b) => b.type === "arith")).toBe(true);
        expect(blocks.filter((b) => b.color === 26).every((b) => b.type === "aggr")).toBe(true);
        expect(blocks.filter((b) => b.color === 14)).toHaveLength(1);
    });

    test("mode names exist for the interface", () => {
        expect(Object.keys(MODES)).toEqual(["A", "B", "C"]);
        for (const mode of Object.values(MODES)) expect(mode.label.length).toBeGreaterThan(3);
    });
});
