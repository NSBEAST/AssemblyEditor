import type { ParsedInstruction } from "./instruction";
import type { PseudoInstructionDef, Isa } from "./isa";
import { splitInstruction, stripComment } from "./parser";
import { AsmError, AsmErrors } from "./asmError";

function createInstructions(def: PseudoInstructionDef, instruction: ParsedInstruction) {
    let newInstructions: ParsedInstruction[] = [];

    if (instruction.operands.length !== def.params.length)
        throw new AsmError(instruction.source_line, `pseudo-instruction '${def.mnemonic}' expects ${def.params.length} operands, ${instruction.operands.length} were given instead`);

    for (const expanded of def.expandsTo) {
        const {mnemonic, operands} = splitInstruction(stripComment(expanded));

        const newOperands: string[] = [];
        for (const operand of operands) {
            if (operand.startsWith("$")) {
                const operandIndex = def.params.indexOf(operand.slice(1));
                if (operandIndex === -1)
                    throw new AsmError(instruction.source_line, `can't find parameter '${operand.slice(1)}' in pseudo instruction '${def.mnemonic}' 'params' list, check the validity of the .json`);
                newOperands.push(instruction.operands[operandIndex]);

            } else
                newOperands.push(operand);
        }
        const newInstruction: ParsedInstruction = {mnemonic: mnemonic, operands: newOperands, source_line: instruction.source_line};
        newInstructions.push(newInstruction);
    }

    return newInstructions;
}

export function expandPseudo(instructions: ParsedInstruction[], labels: Map<string, number>, pseudoMap: Map<string, PseudoInstructionDef>, isa: Isa): {instructions: ParsedInstruction[], labels: Map<string, number>} {
    let newInstructions: ParsedInstruction[] = [];
    let newIndex: number[] = []
    const errors: AsmError[] = [];

    for (const instruction of instructions) {
        newIndex.push(newInstructions.length);
        const def = pseudoMap.get(instruction.mnemonic);

        if (def === undefined) {
            newInstructions.push(instruction);
            continue;
        }

        try {
            const expandedInstructions: ParsedInstruction[] = createInstructions(def, instruction);
            for (const instruction of expandedInstructions) {
                newInstructions.push(instruction);
            }
        } catch (e) {
            if (!(e instanceof AsmError)) throw e;
            errors.push(e);
        }
    }
    if (errors.length) throw new AsmErrors(errors);

    newIndex.push(newInstructions.length);
    let newLabelMap: Map<string, number> = new Map<string, number>();
    for (const [name, address] of labels.entries()) {
        newLabelMap.set(name, newIndex[address-isa.firstProgramIndex] + isa.firstProgramIndex);
    }

    return {instructions: newInstructions, labels: newLabelMap};
}