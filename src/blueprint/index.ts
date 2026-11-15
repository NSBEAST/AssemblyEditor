// the public side of the blueprint code: ROM rows in, a blueprint picture out
import { encodeStructure } from "./encode";
import { buildBlocks, type BuildResult } from "./build";
import { randomGuid } from "./bytes";
import { buildContainer, type BlueprintInfo } from "./container";
import { renderPreview } from "./preview";
import { encodeBlueprintPng } from "./png";
import type { BlueprintOptions } from "./options";

export { BlueprintError, defaultOptions, type BlueprintOptions, type RomMode } from "./options";
export { MODES } from "./modes";
export { buildBlocks, type BuildResult, type BuildStats } from "./build";
export type { BlueprintInfo } from "./container";

export interface Blueprint extends BuildResult {
    png: Uint8Array;
}

export async function createBlueprint(
    rows: number[][],
    options: Partial<BlueprintOptions>,
    info: BlueprintInfo,
    guid: string = randomGuid(),
): Promise<Blueprint> {
    const built = buildBlocks(rows, options);
    const container = buildContainer(encodeStructure(built.blocks), info, guid);
    const png = await encodeBlueprintPng(container.payload, container.headerLength, renderPreview(built.blocks));
    return { ...built, png };
}
