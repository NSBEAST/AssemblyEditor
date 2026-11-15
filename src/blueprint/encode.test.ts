import { expect, test } from "vitest";
import { encodeBlock } from "./encode";
import { toHex } from "./bytes";
import { COLORS, createBlock } from "./model";

// a grid block copied byte for byte from a blueprint the game saved
const GAME_GRID_BLOCK =
    "0a001202100120ffffffffffffffffff01320d88010eca01020824d2010208243a1209ae49421bf8636842119d17501c006c549748ffffffffffffffffff01";

test("a grid block encodes exactly like the game's own", () => {
    const block = createBlock("grid", [0, 0, 0], [0, 1, 0], COLORS.base);
    expect(toHex(encodeBlock(block, new Map([[block, 0]])))).toBe(GAME_GRID_BLOCK);
});
