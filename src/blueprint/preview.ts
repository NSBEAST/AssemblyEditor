// the top view of a blueprint (x across, z up), used for the picture in the game's blueprint list
// and for the preview on the site
import { cellsOf } from "./geometry";
import { COLORS, type Block } from "./model";
import { SIZE } from "./png";

const BACKGROUND = [24, 26, 34];
const SEAT = [200, 200, 210];
export const PALETTE: Record<number, number[]> = {
    [COLORS.data]: [40, 90, 220],
    [COLORS.comparison]: [40, 190, 80],
    [COLORS.pc]: [240, 210, 40],
    [COLORS.output]: [220, 50, 50],
    [COLORS.base]: [120, 120, 130],
};

export interface PreviewView {
    x0: number; // the left most cell
    z0: number; // the lowest cell row
    scale: number; // pixels per cell
}

const LEFT = 36;
const BOTTOM = 440;

export function previewView(blocks: Block[]): PreviewView {
    const cells = blocks.flatMap((b) => cellsOf(b));
    if (cells.length === 0) return { x0: 0, z0: 0, scale: 1 };
    const xs = cells.map((c) => c[0]);
    const zs = cells.map((c) => c[2]);
    const x0 = Math.min(...xs);
    const z0 = Math.min(...zs);
    return { x0, z0, scale: Math.min(440 / (Math.max(...xs) - x0 + 1), 380 / (Math.max(...zs) - z0 + 1)) };
}

// the pixels of one cell (rounded so neighbouring cells share an edge)
export function cellRect(view: PreviewView, x: number, z: number) {
    const left = Math.round(LEFT + (x - view.x0) * view.scale);
    const right = Math.max(left + 1, Math.round(LEFT + (x - view.x0 + 1) * view.scale));
    const bottom = Math.round(BOTTOM - (z - view.z0) * view.scale);
    const top = Math.min(bottom - 1, Math.round(BOTTOM - (z - view.z0 + 1) * view.scale));
    return { left, right, top, bottom };
}

// which cell is under a pixel
export function cellAtPixel(view: PreviewView, px: number, py: number): [number, number] {
    return [Math.floor((px - LEFT) / view.scale) + view.x0, Math.floor((BOTTOM - py) / view.scale) + view.z0];
}

export function blockColour(block: Block): number[] {
    return block.type === "seat" ? SEAT : (PALETTE[block.color] ?? [150, 150, 150]);
}

// a block seen from above is one rectangle as big as the block (a 1 x 2 gate is not two squares)
export function blockRect(view: PreviewView, block: Block) {
    const cells = cellsOf(block);
    const xs = cells.map((c) => c[0]);
    const zs = cells.map((c) => c[2]);
    const low = cellRect(view, Math.min(...xs), Math.min(...zs));
    const high = cellRect(view, Math.max(...xs), Math.max(...zs));
    return { left: low.left, right: high.right, top: high.top, bottom: low.bottom };
}

export function renderPreview(blocks: Block[]): Uint8Array {
    const rgba = new Uint8Array(SIZE * SIZE * 4);
    for (let p = 0; p < SIZE * SIZE; p++) rgba.set([...BACKGROUND, 255], p * 4);
    if (blocks.length === 0) return rgba;

    const view = previewView(blocks);
    // blocks higher up are painted last so they show on top
    for (const block of [...blocks].sort((a, b) => a.pos[1] - b.pos[1])) {
        const colour = blockColour(block);
        const edge = colour.map((c) => Math.round(c * 0.6));
        const { left, right, top, bottom } = blockRect(view, block);
        // a darker edge when the block is big enough, so neighbours can be told apart
        const outline = right - left >= 5 && bottom - top >= 5;
        for (let y = Math.max(top, 0); y < Math.min(bottom, SIZE); y++)
            for (let x = Math.max(left, 0); x < Math.min(right, SIZE); x++) {
                const onEdge = outline && (x === left || y === top || x === right - 1 || y === bottom - 1);
                rgba.set([...(onEdge ? edge : colour), 255], (y * SIZE + x) * 4);
            }
    }
    return rgba;
}
