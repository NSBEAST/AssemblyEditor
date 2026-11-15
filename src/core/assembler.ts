import type { ParsedInstruction } from "./instruction";
import type { InstructionDef, Isa, IsaSetup } from "./isa";
import { AsmError, AsmErrors } from "./asmError";

function assembleMnemonic(instruction: ParsedInstruction, isa: Isa, labels: Map<string, number>, def: InstructionDef) {
    const { mnemonic, opcode, format, immRange } = def;
    const formatOperands = isa.formats[format].operands;
    const registers = isa.registers.map((r) => r.toUpperCase());

    let rawNumbers: number[] = [opcode]

    if (instruction.operands.length !== formatOperands.length)
        throw new AsmError(instruction.source_line, `expected ${formatOperands.length} operands but ${instruction.operands.length} were given instead`);

    for (const [index, operand] of instruction.operands.entries()) {
        const formatOperand = formatOperands[index];
        const type = formatOperand.type;
        switch (type) {
            case "register": {
                const registerNumber = registers.indexOf(operand.toUpperCase());
                if (registerNumber === -1)
                    throw new AsmError(instruction.source_line, `argument ${index + 1} expects a register ('${registers[0]}' to '${registers[registers.length - 1]}'), '${operand}' was given instead`);
                rawNumbers.push(registerNumber);
                break;
            }

            case "label": {
                const address = labels.get(operand);
                if (address === undefined)
                    throw new AsmError(instruction.source_line, `argument ${index + 1} expects a label, '${operand}' was given instead`);
                rawNumbers.push(isa.jumpToOneBeforeAddress ? address - 1 : address);
                break;
            }

            case "immediate": {
                const isNumber = /^-?(\d+(\.\d+)?|\.\d+)$/.test(operand);
                if (!isNumber)
                    throw new AsmError(instruction.source_line, `argument ${index + 1} expects a number, '${operand}' was given instead`);
                const value = Number(operand);
                if (immRange !== undefined && (value < immRange[0] || value > immRange[1]))
                    throw new AsmError(instruction.source_line, `argument ${index + 1} must be between ${immRange[0]} and ${immRange[1]}, '${operand}' was given instead`);
                rawNumbers.push(value);
                break;
            }

            default:
                // loadIsa only allows known operand types, so this should never happen
                throw new AsmError(instruction.source_line, `argument ${index + 1} has unknown operand type '${type}'`);
        }
    }

    return rawNumbers;
}

function assembleMachineCode(instruction: ParsedInstruction, labels: Map<string, number>, isa: Isa) {
    const isNumber = /^-?(\d+(\.\d+)?|\.\d+)$/.test(instruction.mnemonic);
    if (!isNumber)
        throw new AsmError(instruction.source_line, `unknown instruction or opcode '${instruction.mnemonic}'`);

    let rawNumbers: number[] = [Number(instruction.mnemonic)];

    for (const operand of instruction.operands) {
        const isNumber = /^-?(\d+(\.\d+)?|\.\d+)$/.test(operand);
        if (!isNumber) {
            const address = labels.get(operand);
            if (address !== undefined) {
                rawNumbers.push(isa.jumpToOneBeforeAddress ? address - 1 : address);
            }
            else {
                throw new AsmError(instruction.source_line, `all arguments in machine code, except labels, should be numbers, '${operand}' was given instead`);
            }
        } else {
            rawNumbers.push(Number(operand));
        }
    }

    return rawNumbers;
}

export function assemble(instructions: ParsedInstruction[], labels: Map<string, number>, setup: IsaSetup) {
    const isa = setup.isa;
    const mnemonicMap = setup.mnemonicMap;
    const errors: AsmError[] = [];

    const finalCode: number[][] = []

    for (const [i, instruction] of instructions.entries()) {
        const def = mnemonicMap.get(instruction.mnemonic);
        try {
            if (def !== undefined) {
                finalCode.push(assembleMnemonic(instruction, isa, labels, def));
            }
            else {
                finalCode.push(assembleMachineCode(instruction, labels, isa));
            }
        } catch (e) {
            if (!(e instanceof AsmError)) throw e;
            errors.push(e);
        }
    }

    if (errors.length) throw new AsmErrors(errors);

    return finalCode;
}