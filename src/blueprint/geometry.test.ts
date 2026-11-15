import { expect, test } from "vitest";
import { checkGeometry, cellsOf, rotate } from "./geometry";
import { createBlock } from "./model";

test("rotation follows Unity: z first, then x, then y", () => {
    expect(rotate([1, 0, 0], [0, 0, 1])).toEqual([0, 1, 0]);
    expect(rotate([0, 1, 0], [0, 0, 1])).toEqual([-1, 0, 0]);
    expect(rotate([0, 1, 0], [1, 0, 0])).toEqual([0, 0, 1]);
    expect(rotate([1, 0, 0], [0, 1, 0])).toEqual([0, 0, -1]);
    expect(rotate([0, 0, 1], [0, 0, 1])).toEqual([0, 0, 1]);
    expect(rotate([1, 0, 0], [0, 0, 4])).toEqual([1, 0, 0]);
});

test("a gate is 1 x 1 x 2 cells, and rotates as one piece", () => {
    expect(cellsOf(createBlock("arith", [3, 0, 5]))).toEqual([[3, 0, 5], [3, 0, 6]]);
    expect(cellsOf(createBlock("arith", [3, 0, 5], [1, 0, 0]))).toEqual([[3, 0, 5], [3, -1, 5]]); // a quarter turn around x turns +z into -y
});

test("the seat is 2 x 4 x 4 cells", () => {
    expect(cellsOf(createBlock("seat", [0, 0, 0]))).toHaveLength(32);
});

test("blocks sharing a cell overlap", () => {
    const a = createBlock("grid", [0, 0, 0]);
    const b = createBlock("grid", [0, 0, 1]); // 1 x 1 x 2 blocks, so this clashes with a
    const { overlaps } = checkGeometry([a, b]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].cell).toEqual([0, 0, 1]);
});

test("gates stacked in the long direction are attached", () => {
    const blocks = [createBlock("arith", [0, 0, 0]), createBlock("arith", [0, 0, 2]), createBlock("arith", [0, 0, 4])];
    expect(checkGeometry(blocks)).toEqual({ overlaps: [], groups: [3] });
});

test("blocks with a gap in between are separate groups", () => {
    const blocks = [createBlock("arith", [0, 0, 0]), createBlock("arith", [0, 0, 3])];
    expect(checkGeometry(blocks).groups.sort()).toEqual([1, 1]);
});

test("a comparator and a grid block attach side by side", () => {
    const blocks = [createBlock("comp", [0, 0, 0]), createBlock("grid", [1, 0, 0])];
    expect(checkGeometry(blocks).groups).toEqual([2]);
});

test("a gate has no face on its +x side", () => {
    const blocks = [createBlock("arith", [0, 0, 0]), createBlock("arith", [1, 0, 0])];
    // the second gate's -x face looks at the first, but the first one has nothing there to attach
    expect(checkGeometry(blocks).groups.sort()).toEqual([1, 1]);
});

test("a seat attaches to a grid block row under it", () => {
    const blocks = [createBlock("seat", [0, 0, 0])];
    for (let z = -1; z < 3; z += 2) for (let x = 0; x < 2; x++) blocks.push(createBlock("grid", [x, -1, z]));
    expect(checkGeometry(blocks).groups).toEqual([5]);
});
