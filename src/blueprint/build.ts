// the ROM rows -> the blocks of the blueprint (the steps are described in the numbered comments)
import { f32, mulF32 } from "./floats";
import { checkGeometry, cellsOf } from "./geometry";
import { chooseAcross } from "./layout/tiling";
import type { Block } from "./model";
import { MODES } from "./modes";
import { BlueprintError, defaultOptions, type BlueprintOptions } from "./options";
import { addReadout, READOUT_HEIGHT, readoutWidth, TEST_KEY_CODES } from "./readout";

// the comparator's threshold slider
export const THRESHOLD_LIMIT = 100;
// the Arithmetics constant slider, test keys set the PC with it
const CONSTANT_LIMIT = 1000;

export interface BuildStats {
    blocks: number;
    rows: number;
    columns: number;
    across: number; // instructions side by side
    pcScale: number;
    width: number; // in cells of 0.25 m
    depth: number;
}

export interface BuildResult {
    blocks: Block[];
    warnings: string[];
    stats: BuildStats;
}

function pcScaleFor(options: BlueprintOptions, firstIndex: number, count: number): 1 | 0.1 {
    const biggest = Math.max(Math.abs(firstIndex), Math.abs(firstIndex + count - 1));
    if (options.pcScale === 1 || (options.pcScale === "auto" && biggest <= THRESHOLD_LIMIT)) {
        if (biggest > THRESHOLD_LIMIT)
            throw new BlueprintError(`With PC scale 1 the comparators only reach address ${THRESHOLD_LIMIT}, this program goes up to ${biggest}. Use PC scale 0.1.`);
        return 1;
    }
    if (mulF32(biggest, 0.1) > THRESHOLD_LIMIT)
        throw new BlueprintError(`A ROM holds at most 1000 addresses (the PC divided by 10 must stay within ${THRESHOLD_LIMIT}), this program goes up to ${biggest}.`);
    return 0.1;
}

function testPcValues(options: BlueprintOptions, firstIndex: number, count: number): number[] {
    if (options.testControls === "off") return [];
    const values = options.testControls === "auto" ? Array.from({ length: Math.min(count, 10) }, (_, i) => firstIndex + i) : options.testControls;
    if (values.length > TEST_KEY_CODES.length) throw new BlueprintError(`There are keys for at most ${TEST_KEY_CODES.length} test rows.`);
    for (const value of values)
        if (!Number.isFinite(value) || Math.abs(value) > CONSTANT_LIMIT) throw new BlueprintError(`A test key can't set the PC to ${value}, the limit is ${CONSTANT_LIMIT}.`);
    return values;
}

// rows: what the ROM stores, one row per PC value, all the same width (see toRom)
export function buildBlocks(rows: number[][], overrides: Partial<BlueprintOptions> = {}): BuildResult {
    const options: BlueprintOptions = { ...defaultOptions, ...overrides };
    if (rows.length === 0) throw new BlueprintError("The program is empty, there is nothing to put in a ROM.");
    const width = Math.max(...rows.map((r) => r.length));
    if (width === 0) throw new BlueprintError("The program has no numbers.");
    const padded = rows.map((row) => [...row, ...new Array<number>(width - row.length).fill(0)]);
    const firstIndex = options.firstIndex;
    const mode = MODES[options.mode];
    const warnings: string[] = [];

    // 1. check the numbers and turn them into what the gates store
    const prepared = mode.prepare(padded, firstIndex, options);
    warnings.push(...prepared.warnings);

    // 2. one threshold per row: the exact float the PC gate makes for that row's address
    const pcScale = pcScaleFor(options, firstIndex, padded.length);
    const thresholds = padded.map((_, r) => {
        const address = firstIndex + r;
        return options.typedThresholds ? f32(Number((address * pcScale).toFixed(6))) : mulF32(address, pcScale);
    });
    if (pcScale !== 1)
        warnings.push(
            options.typedThresholds
                ? "Test build: the PC is multiplied by 0.1 and the thresholds are typed decimals (like 0.9), not the exact floats the PC block makes."
                : "The PC is multiplied by 0.1, so address 9 becomes a float like 0.90000004, not 0.9. The thresholds are written as exactly those floats, that works whether or not the game compares with a tolerance. Thresholds typed by hand (0.9) may miss rows.",
        );

    // 3. the layout: instructions in a grid that makes the whole build roughly square
    const keys = testPcValues(options, firstIndex, padded.length);
    const readout = { pcScale, testPcValues: keys, seat: options.seat };
    const across =
        options.tileColumns === "auto"
            ? chooseAcross(
                  padded.length,
                  mode.cellWidth(prepared.columns),
                  mode.cellHeight,
                  READOUT_HEIGHT,
                  readoutWidth(prepared.columns, readout),
              )
            : Math.min(Math.max(1, Math.floor(options.tileColumns)), padded.length);
    const rom = mode.place(prepared, thresholds, across, options);
    const blocks = addReadout(rom, readout);

    // 4. a safety check: nothing may overlap and everything has to hang together
    const report = checkGeometry(blocks);
    if (report.overlaps.length) throw new Error(`internal error: ${report.overlaps.length} cells are used by two blocks (first at ${report.overlaps[0].cell})`);
    if (report.groups.length > 1) throw new Error(`internal error: the blocks fall into ${report.groups.length} separate pieces`);

    const cells = blocks.flatMap((b) => cellsOf(b));
    const span = (axis: 0 | 2) => Math.max(...cells.map((c) => c[axis])) - Math.min(...cells.map((c) => c[axis])) + 1;
    return {
        blocks,
        warnings,
        stats: { blocks: blocks.length, rows: padded.length, columns: prepared.columns, across, pcScale, width: span(0), depth: span(2) },
    };
}
