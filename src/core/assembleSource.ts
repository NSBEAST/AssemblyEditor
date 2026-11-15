import { assemble } from "./assembler";
import type { IsaSetup } from "./isa";
import { expandPseudo } from "./expandPseudo";
import { parseText } from "./parser";
import { AsmError, AsmErrors } from "./asmError";

export function assembleSource(source: string, setup: IsaSetup) {
    try {
        const { instructions, labels } = parseText(source, setup.isa);
        const expanded = expandPseudo(instructions, labels, setup.pseudoMnemonicMap, setup.isa);
        const output = assemble(expanded.instructions, expanded.labels, setup);
        return { output, errors: [] as AsmError[] };
    } catch (e) {
        if (!(e instanceof AsmErrors)) throw e;
        return { output: [] as number[][], errors: e.errors };
    }
}