// where blocks really are: rotated cells, attachment faces, overlap and connection checks
import { BLOCK_TYPES } from "./blockTypes";
import type { Block, Vec3 } from "./model";

// Unity's Quaternion.Euler(90 rx, 90 ry, 90 rz): first around z, then x, then y
export function rotate(v: Vec3, rot: Vec3): Vec3 {
    let [x, y, z] = v;
    const turns = (n: number) => ((n % 4) + 4) % 4;
    for (let i = 0; i < turns(rot[2]); i++) [x, y] = [-y, x];
    for (let i = 0; i < turns(rot[0]); i++) [y, z] = [-z, y];
    for (let i = 0; i < turns(rot[1]); i++) [x, z] = [z, -x];
    return [x + 0, y + 0, z + 0]; // + 0 turns -0 into 0
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const cellKey = (c: Vec3) => `${c[0]},${c[1]},${c[2]}`;

export function cellsOf(block: Block): Vec3[] {
    return BLOCK_TYPES[block.type].cells.map((c) => add(block.pos, rotate(c, block.rot)));
}

// for every fully covered face (as a world direction): the cells that touch it
export function facesOf(block: Block): Map<string, Vec3[]> {
    const type = BLOCK_TYPES[block.type];
    const own = new Set(type.cells.map(cellKey));
    const result = new Map<string, Vec3[]>();
    for (const face of type.faces) {
        const touching = type.cells.filter((c) => !own.has(cellKey(add(c, face.normal))));
        if (face.points < touching.length) continue;
        result.set(
            cellKey(rotate(face.normal, block.rot)),
            touching.map((c) => add(block.pos, rotate(c, block.rot))),
        );
    }
    return result;
}

export interface GeometryReport {
    overlaps: Array<{ cell: Vec3; a: Block; b: Block }>;
    // sizes of the groups of blocks that hold together, one group means everything is attached
    groups: number[];
}

export function checkGeometry(blocks: Block[]): GeometryReport {
    const occupied = new Map<string, Block>();
    const overlaps: GeometryReport["overlaps"] = [];
    for (const block of blocks) {
        for (const cell of cellsOf(block)) {
            const other = occupied.get(cellKey(cell));
            if (other) overlaps.push({ cell, a: other, b: block });
            occupied.set(cellKey(cell), block);
        }
    }

    const faces = new Map(blocks.map((b) => [b, facesOf(b)] as const));
    const neighbours = new Map<Block, Set<Block>>(blocks.map((b) => [b, new Set()]));
    for (const block of blocks) {
        for (const [normalKey, cells] of faces.get(block)!) {
            const normal = normalKey.split(",").map(Number) as unknown as Vec3;
            const opposite = cellKey([-normal[0], -normal[1], -normal[2]]);
            for (const cell of cells) {
                const next = add(cell, normal);
                const other = occupied.get(cellKey(next));
                if (!other || other === block) continue;
                // the other block must have a face looking back that covers this cell
                const back = faces.get(other)!.get(opposite);
                if (back?.some((c) => cellKey(c) === cellKey(next))) {
                    neighbours.get(block)!.add(other);
                    neighbours.get(other)!.add(block);
                }
            }
        }
    }

    const seen = new Set<Block>();
    const groups: number[] = [];
    for (const start of blocks) {
        if (seen.has(start)) continue;
        let size = 0;
        const stack = [start];
        seen.add(start);
        while (stack.length) {
            const current = stack.pop()!;
            size++;
            for (const next of neighbours.get(current)!) {
                if (!seen.has(next)) {
                    seen.add(next);
                    stack.push(next);
                }
            }
        }
        groups.push(size);
    }
    return { overlaps, groups };
}
