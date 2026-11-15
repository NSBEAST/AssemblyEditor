// everything the person can set for a blueprint. New settings go here with their default.

export type RomMode = "A" | "B" | "C";

export interface BlueprintOptions {
    mode: RomMode;
    // the PC value of the first ROM row (the ISA's first program index)
    firstIndex: number;
    // 1: the PC counts 1, 2, 3.. (at most 100 rows). 0.1: a gate divides the PC by 10 first (at most 1000 rows)
    pcScale: "auto" | 1 | 0.1;
    // leave out gates that would store 0, a plain block takes their place so the build stays in one piece
    skipZeros: boolean;
    // mode C: the comparators store value / outputScale and the red block multiplies by it again
    outputScale: number;
    // how many instructions sit side by side, "auto" makes the build roughly square
    tileColumns: "auto" | number;
    // keys 1 to 0 set the PC to a row so the ROM can be tried without a CPU. "auto": the first 10 rows,
    // or a list of PC values (at most 10), or "off"
    testControls: "auto" | "off" | number[];
    // a seat with the base blocks under it. Always there when there are test controls
    seat: boolean;
    // test only: thresholds typed as decimals (0.9) instead of the exact float the PC gate makes
    typedThresholds: boolean;
}

export const defaultOptions: BlueprintOptions = {
    mode: "C",
    firstIndex: 0,
    pcScale: "auto",
    skipZeros: true,
    outputScale: 1000,
    tileColumns: "auto",
    testControls: "auto",
    seat: true,
    typedThresholds: false,
};

// what the person did wrong, as a sentence they can act on
export class BlueprintError extends Error {}
