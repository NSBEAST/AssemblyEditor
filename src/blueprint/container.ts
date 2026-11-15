// the bytes hidden in the picture: a header and three sections (structure, identifier, meta)
import { concat } from "./bytes";
import { lz4Decode, lz4Frame } from "./lz4";
import { parseFields, pbLen, pbVarint } from "./protobuf";
import { smazLiterals, smazLiteralsDecode } from "./smaz";

export interface BlueprintInfo {
    name: string;
    description: string;
    tag: string;
    creator: string;
    steamId: string;
    platform: string;
}

const utf8 = new TextEncoder();
const text = new TextDecoder();

export interface Container {
    payload: Uint8Array; // everything that goes into the pixels (the picture pads the end to whole pixels)
    headerLength: number; // the unpadded length of the header, stored in the picture's last pixel
}

export function buildContainer(structure: Uint8Array, info: BlueprintInfo, guid: string): Container {
    const compressed = lz4Frame(structure);
    const identifier = concat(pbVarint(1, 2), pbLen(2, utf8.encode(guid)));
    const meta = smazLiterals(
        concat(
            ...[info.name, info.description, info.tag, info.creator, info.steamId, info.platform].map((value, i) =>
                pbLen(i + 1, utf8.encode(value)),
            ),
        ),
    );

    // generation C: a 0x08 byte, then a message with the sizes. 12 spaces is what the game writes.
    const header = concat(
        Uint8Array.from([0x08]),
        pbVarint(1, 1),
        pbLen(2, utf8.encode(" ".repeat(12))),
        pbVarint(3, compressed.length),
        pbVarint(4, identifier.length),
        pbVarint(5, meta.length),
    );
    const padded = concat(header, new Uint8Array((3 - (header.length % 3)) % 3));
    return { payload: concat(padded, compressed, identifier, meta), headerLength: header.length };
}

export interface ParsedContainer {
    structure: Uint8Array;
    guid: string;
    info: BlueprintInfo;
}

export function parseContainer(payload: Uint8Array, headerLength: number): ParsedContainer {
    if (payload[0] !== 0x08) throw new Error("this is not a generation C blueprint header");
    const sizes = new Map(parseFields(payload.subarray(1, headerLength)).map((f) => [f.field, Number(f.value)]));
    const start = Math.ceil(headerLength / 3) * 3;
    const structureSize = sizes.get(3)!;
    const identifierSize = sizes.get(4)!;
    const metaSize = sizes.get(5)!;
    let at = start;
    const section = (size: number) => payload.subarray(at, (at += size));

    const structure = lz4Decode(section(structureSize));
    const identifier = parseFields(section(identifierSize));
    const metaFields = parseFields(smazLiteralsDecode(section(metaSize)));
    const field = (n: number) => {
        const value = metaFields.find((f) => f.field === n)?.value;
        return value instanceof Uint8Array ? text.decode(value) : "";
    };
    const guid = identifier.find((f) => f.field === 2)?.value;
    return {
        structure,
        guid: guid instanceof Uint8Array ? text.decode(guid) : "",
        info: {
            name: field(1),
            description: field(2),
            tag: field(3),
            creator: field(4),
            steamId: field(5),
            platform: field(6),
        },
    };
}
