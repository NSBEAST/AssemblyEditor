// blocks -> the Protobuf "structure" a blueprint stores
import { concat } from "./bytes";
import { GUID_BYTES, BLOCK_TYPES } from "./blockTypes";
import { cellsOf } from "./geometry";
import type { Block } from "./model";
import { pbF32, pbFix64, pbLen, pbVarint, vecFloat, vecInt } from "./protobuf";

// the game version field copied from a real blueprint (game 2.5.3, build 518205)
const GAME_VERSION = Uint8Array.from([0x08, 0x02, 0x10, 0x05, 0x18, 0x03, 0x20, 0xbd, 0xd0, 0x1f]);

// the id a link carries to say which block it comes from
const linkId = (sourceIndex: number) => 1000 + sourceIndex;

// links are stored on the receiving block, as the distance (in blocks) back to the sender
function linkEntry(block: Block, source: Block, index: Map<Block, number>): Uint8Array {
    const offset = index.get(source)! - index.get(block)!;
    const parts = [pbVarint(1, offset)];
    if (source.type === "seat") {
        parts.push(pbVarint(4, 17 + (block.params.keyPair ?? 0)));
    } else {
        const id = linkId(index.get(source)!);
        parts.push(pbVarint(2, id), pbVarint(3, id));
    }
    parts.push(pbVarint(7, offset));
    return pbLen(1, concat(...parts));
}

export function encodeBlock(block: Block, index: Map<Block, number>): Uint8Array {
    const type = BLOCK_TYPES[block.type];
    const fields: Uint8Array[] = [];

    if (block.type === "seat") {
        fields.push(pbLen(3, concat(...(block.params.keys ?? []).map((k) => pbLen(1, pbVarint(3, k))))));
    } else {
        if (type.settings) fields.push(type.settings(block.params));
        for (const source of block.inputs) fields.push(linkEntry(block, source, index));
        if (block.params.key !== undefined) fields.push(pbVarint(15, block.params.key));
    }
    fields.push(pbVarint(17, 14), pbLen(25, pbVarint(1, block.color)), pbLen(26, pbVarint(1, block.color)));

    const guid = GUID_BYTES[block.type];
    const parts = [pbLen(1, vecInt(...block.pos)), pbLen(2, vecInt(...block.rot)), pbVarint(4, -1)];
    const own = index.get(block)!;
    if (own) parts.push(pbVarint(5, own));
    parts.push(
        pbLen(6, concat(...fields)),
        pbLen(7, concat(pbFix64(1, guid.subarray(0, 8)), pbFix64(2, guid.subarray(8)))),
        pbVarint(9, -1),
    );
    return concat(...parts);
}

export function encodeStructure(blocks: Block[]): Uint8Array {
    const index = new Map(blocks.map((b, i) => [b, i] as const));
    const parts = blocks.map((b) => pbLen(1, encodeBlock(b, index)));

    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const block of blocks) {
        for (const cell of cellsOf(block)) {
            for (let a = 0; a < 3; a++) {
                lo[a] = Math.min(lo[a], cell[a]);
                hi[a] = Math.max(hi[a], cell[a]);
            }
        }
    }
    // metres: a cell is 0.25 m, hi is the far side of the last cell
    const low = lo.map((v) => v * 0.25);
    const high = hi.map((v) => (v + 1) * 0.25);
    const centre = low.map((l, a) => (l + high[a]) / 2) as [number, number, number];
    const size = low.map((l, a) => high[a] - l) as [number, number, number];

    parts.push(pbLen(3, concat(pbLen(1, vecFloat(...centre)), pbLen(2, vecFloat(...size)))));
    parts.push(pbF32(4, centre[1] - size[1] / 2));
    parts.push(pbLen(5, vecFloat(...centre)));
    parts.push(pbVarint(7, 32));
    parts.push(pbLen(8, GAME_VERSION));
    return concat(...parts);
}
