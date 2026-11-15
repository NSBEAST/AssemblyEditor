import type { ParsedInstruction } from "./instruction";
import type { InstructionDef, Isa, IsaSetup, WordLayout } from "./isa";
import { resolveWordLayout } from "./isa";
import { AsmError, AsmErrors } from "./asmError";

// puts the opcode and the checked operand values (in the order of the format) into one machine word
export function placeWord(opcode: number, values: number[], formatOperands: Array<{ field: string }>, layout: WordLayout): number[] {
    if (layout.mode === "fixed") {
        const word: number[] = new Array(layout.columns.length).fill(layout.unusedValue);
        word[layout.columns.indexOf("opcode")] = opcode;
        for (const [i, operand] of formatOperands.entries())
            word[layout.columns.indexOf(operand.field)] = values[i];
        return word;
    }
    return layout.opcodePosition === "last" ? [...values, opcode] : [opcode, ...values];
}

// how many numbers an instruction takes, needed to give labels a word address
function wordLength(instruction: ParsedInstruction, setup: IsaSetup, layout: WordLayout): number {
    const def = setup.mnemonicMap.get(instruction.mnemonic);
    if (def === undefined) return 1 + instruction.operands.length; // machine code line
    if (layout.mode === "fixed") return layout.columns.length;
    return 1 + setup.isa.formats[def.format].operands.length;
}

function assembleMnemonic(instruction: ParsedInstruction, isa: Isa, labels: Map<string, number>, def: InstructionDef, layout: WordLayout) {
    const { opcode, format, immRange } = def;
    const formatOperands = isa.formats[format].operands;
    const registers = isa.registers.map((r) => r.toUpperCase());

    const values: number[] = [];

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
                values.push(registerNumber);
                break;
            }

            case "label": {
                const address = labels.get(operand);
                if (address === undefined)
                    throw new AsmError(instruction.source_line, `argument ${index + 1} expects a label, '${operand}' was given instead`);
                values.push(isa.jumpToOneBeforeAddress ? address - 1 : address);
                break;
            }

            case "immediate": {
                const isNumber = /^-?(\d+(\.\d+)?|\.\d+)$/.test(operand);
                if (!isNumber)
                    throw new AsmError(instruction.source_line, `argument ${index + 1} expects a number, '${operand}' was given instead`);
                const value = Number(operand);
                if (immRange !== undefined && (value < immRange[0] || value > immRange[1]))
                    throw new AsmError(instruction.source_line, `argument ${index + 1} must be between ${immRange[0]} and ${immRange[1]}, '${operand}' was given instead`);
                values.push(value);
                break;
            }

            default:
                // loadIsa only allows known operand types, so this should never happen
                throw new AsmError(instruction.source_line, `argument ${index + 1} has unknown operand type '${type}'`);
        }
    }

    return placeWord(opcode, values, formatOperands, layout);
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
    const layout = resolveWordLayout(isa);
    const errors: AsmError[] = [];

    const finalCode: number[][] = []

    // with word addressing a label is the address of its first number, not of its instruction
    if (layout.addressing === "word") {
        const starts: number[] = [];
        let next = isa.firstProgramIndex;
        for (const instruction of instructions) {
            starts.push(next);
            next += wordLength(instruction, setup, layout);
        }
        starts.push(next);
        labels = new Map([...labels].map(([name, address]) => [name, starts[address - isa.firstProgramIndex]]));
    }

    for (const instruction of instructions) {
        const def = mnemonicMap.get(instruction.mnemonic);
        try {
            if (def !== undefined) {
                finalCode.push(assembleMnemonic(instruction, isa, labels, def, layout));
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

export interface Rom {
    rows: number[][];
    // names of the columns, only known when every row has exactly the layout's columns
    columns: string[] | undefined;
}

// the table a ROM stores: one row per PC value, padded to the same width.
// machine code lines are always variable length, so they are padded here
export function toRom(code: number[][], isa: Isa): Rom {
    const layout = resolveWordLayout(isa);
    if (layout.addressing === "word")
        return { rows: code.flat().map((value) => [value]), columns: undefined };

    const width = Math.max(layout.mode === "fixed" ? layout.columns.length : 0, ...code.map((row) => row.length));
    const rows = code.map((row) => [...row, ...new Array(width - row.length).fill(layout.unusedValue)]);
    const named = layout.mode === "fixed" && width === layout.columns.length;
    return { rows, columns: named ? layout.columns : undefined };
}
