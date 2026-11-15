// the blocks of a blueprint as the layout code sees them

export type Vec3 = readonly [number, number, number];

export type BlockTypeName = "arith" | "aggr" | "disp" | "comp" | "or" | "grid" | "seat";

// every setting a block type can have, a type only reads the ones it needs
export interface BlockParams {
    constant?: number; // arith: the Arithmetics constant
    operation?: number; // arith: 0 add, 2 multiply (dropdown index)
    threshold?: number; // comp
    output?: number; // comp: the value it outputs when equal
    mode?: number; // comp: 2 = equals
    rounding?: number; // disp: 0 off, 1 nearest, 2 floor, 3 ceil
    keys?: number[]; // seat: the key codes it offers
    key?: number; // or: the key code it listens to
    keyPair?: number; // or: which key pair of the seat that is (index)
}

export interface Block {
    type: BlockTypeName;
    pos: Vec3; // in cells of 0.25 m
    rot: Vec3; // in quarter turns
    color: number;
    params: BlockParams;
    inputs: Block[]; // blocks whose output is summed into this block
}

// colour numbers of the game's palette
export const COLORS = {
    data: 6, // blue: instruction data
    comparison: 12, // green: PC comparison
    pc: 14, // yellow: PC input
    output: 26, // red: instruction output
    base: 36, // grey: everything else
} as const;

export function createBlock(
    type: BlockTypeName,
    pos: Vec3,
    rot: Vec3 = [0, 0, 0],
    color: number = COLORS.base,
    params: BlockParams = {},
): Block {
    return { type, pos, rot, color, params, inputs: [] };
}
