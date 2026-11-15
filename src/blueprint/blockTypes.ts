// one entry per block type: its GUID, footprint, the faces other blocks can attach to and how its settings are written.
// A new block type only needs a new entry here (and a name in model.ts).
import { guidBytes, concat } from "./bytes";
import { NAN_BYTES } from "./floats";
import type { BlockParams, BlockTypeName, Vec3 } from "./model";
import { pbF32, pbLen, pbVarint } from "./protobuf";

export interface Face {
    normal: Vec3;
    // how many of the block's cells touch this face, a face only attaches when every cell of that side is there
    points: number;
}

export interface BlockType {
    guid: string;
    cells: Vec3[]; // occupied cells for rotation (0, 0, 0)
    faces: Face[];
    settings?: (params: BlockParams) => Uint8Array;
}

const nan = (field: number) => pbF32(field, NAN_BYTES);
// field 5 is a dropdown, index 0 is the default and left out
const dropdown = (value: number | undefined) => pbLen(5, value ? pbVarint(1, value) : new Uint8Array());

// Arithmetics, Aggregate and Number Display attach on these faces
const GATE_FACES: Face[] = [
    { normal: [0, 1, 0], points: 2 },
    { normal: [0, 0, 1], points: 1 },
    { normal: [-1, 0, 0], points: 2 },
    { normal: [0, -1, 0], points: 2 },
    { normal: [0, 0, -1], points: 1 },
];
// Comparison and OR
const COMPARE_FACES: Face[] = [
    { normal: [1, 0, 0], points: 2 },
    { normal: [0, 0, 1], points: 1 },
    { normal: [-1, 0, 0], points: 2 },
    { normal: [0, -1, 0], points: 2 },
    { normal: [0, 0, -1], points: 1 },
];
const GRID_FACES: Face[] = [
    { normal: [1, 0, 0], points: 2 },
    { normal: [0, 1, 0], points: 2 },
    { normal: [0, 0, 1], points: 1 },
    { normal: [-1, 0, 0], points: 2 },
    { normal: [0, -1, 0], points: 2 },
    { normal: [0, 0, -1], points: 1 },
];

// all logic gates are 1 x 1 x 2 cells (0.25 x 0.25 x 0.5 m), not 1 x 1 x 1
const GATE_CELLS: Vec3[] = [
    [0, 0, 0],
    [0, 0, 1],
];

// the seat is 2 x 4 x 4 cells
const SEAT_CELLS: Vec3[] = [];
for (const x of [0, 1]) for (const y of [0, 1, 2, 3]) for (const z of [-1, 0, 1, 2]) SEAT_CELLS.push([x, y, z]);

const settings = (...fields: Uint8Array[]) => pbLen(6, concat(...fields));

export const BLOCK_TYPES: Record<BlockTypeName, BlockType> = {
    arith: {
        guid: "bf9831c9-8279-42e9-80c0-7de9d8b7308e",
        cells: GATE_CELLS,
        faces: GATE_FACES,
        settings: (p) =>
            settings(dropdown(p.operation), pbF32(1, p.constant ?? 0), nan(2), nan(3), nan(4), nan(6)),
    },
    aggr: {
        guid: "1585459a-3308-4b00-97db-113deb771fa1",
        cells: GATE_CELLS,
        faces: GATE_FACES,
        settings: () => settings(dropdown(0), nan(1), nan(2), nan(3), nan(4), nan(6)),
    },
    disp: {
        guid: "9f121579-e2d5-4f99-be52-3c13a355f82c",
        cells: GATE_CELLS,
        faces: GATE_FACES,
        settings: (p) => settings(dropdown(p.rounding), nan(1), nan(2), nan(3), nan(4), nan(6)),
    },
    comp: {
        guid: "828087ab-748b-412d-92e6-2c3006d1772e",
        cells: GATE_CELLS,
        faces: COMPARE_FACES,
        settings: (p) =>
            settings(dropdown(p.mode), pbF32(1, p.threshold ?? 0), pbF32(2, p.output ?? 1), nan(3), nan(4), nan(6)),
    },
    or: {
        guid: "18a33a8a-5d5b-46b8-8142-f7c7f1f9c9dd",
        cells: GATE_CELLS,
        faces: COMPARE_FACES,
        settings: () => settings(dropdown(0), pbF32(1, 1), pbF32(2, 1), pbF32(3, 1), nan(4), nan(6)),
    },
    grid: {
        guid: "1b4249ae-63f8-4268-9d17-501c006c5497",
        cells: GATE_CELLS,
        faces: GRID_FACES,
    },
    // only the bottom face is modelled: 8 cells, the other faces are partial
    seat: {
        guid: "0e89fb46-4344-4e9e-81a2-c8a659a5d95e",
        cells: SEAT_CELLS,
        faces: [{ normal: [0, -1, 0], points: 8 }],
    },
};

export const GUID_BYTES: Record<BlockTypeName, Uint8Array> = Object.fromEntries(
    Object.entries(BLOCK_TYPES).map(([name, type]) => [name, guidBytes(type.guid)]),
) as Record<BlockTypeName, Uint8Array>;
