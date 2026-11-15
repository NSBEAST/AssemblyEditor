import type { Block } from "../model";

// what a mode's layout gives back: the ROM blocks and the places the readout needs
export interface RomPlacement {
    blocks: Block[];
    comparators: Block[]; // the blocks that read the PC
    outputs: Block[]; // the red blocks, one per output column
    topZ: number; // the first free cell row above the ROM
}
