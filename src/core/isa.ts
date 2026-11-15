import {operandTypes} from "./types";

export interface Format {
    operands: Array<{
        field: string,
        type: string
    }>
}

// how the numbers of one assembled instruction are laid out
//  variable: [opcode, ...operands in the order they are written] (or opcode last)
//  fixed:    one value per column, unused columns get unusedValue, so JMP 15 can become 12 0 0 15
//  addressing 'instruction': the PC counts instructions, 'word': the PC counts every single number
export interface WordLayout {
    mode: "variable" | "fixed"
    opcodePosition: "first" | "last"
    columns: Array<string>
    unusedValue: number
    addressing: "instruction" | "word"
}

export const defaultWordLayout: WordLayout = {
    mode: "variable",
    opcodePosition: "first",
    columns: [],
    unusedValue: 0,
    addressing: "instruction",
};

export interface Isa {
    name: string
    description: string
    registers: Array<string>
    firstProgramIndex: number
    jumpToOneBeforeAddress: boolean
    wordLayout?: Partial<WordLayout>
    formats: Record<string, Format>
    instructions: Array<{
        mnemonic: string
        opcode: number
        format: string
        immRange?: Array<number>
    }>
    pseudoInstructions: Array<{
        mnemonic: string
        params: Array<string>
        expandsTo: Array<string>
    }>
}

export type InstructionDef = Isa["instructions"][number];
export type PseudoInstructionDef = Isa["pseudoInstructions"][number];

export function loadIsa(data: unknown): Isa {
    if (typeof data !== "object" || data === null || Array.isArray(data))
        throw new Error("ISA file must be a JSON object");
    const obj = data as Record<string, unknown>;

    // check top level keys
    if (typeof obj.name !== "string")
        throw new Error("'name' must be a string");
    if (obj.name.trim() === "")
        throw new Error("'name' must not be empty");
    if (typeof obj.description !== "string")
        throw new Error("'description' must be a string");
    if (!Array.isArray(obj.registers))
        throw new Error("'registers' must be a list");
    if (typeof obj.firstProgramIndex !== "number" || !Number.isInteger(obj.firstProgramIndex) || obj.firstProgramIndex < 0)
        throw new Error("'firstProgramIndex' must be a non-negative integer");
    if (typeof obj.jumpToOneBeforeAddress !== "boolean")
        throw new Error("'jumpToOneBeforeAddress' must be a boolean");
    if (typeof obj.formats !== "object" || obj.formats === null || Array.isArray(obj.formats))
        throw new Error("'formats' must be an object");
    if (!Array.isArray(obj.instructions))
        throw new Error("'instructions' must be a list");
    if (!Array.isArray(obj.pseudoInstructions))
        throw new Error("'pseudoInstructions' must be a list");

    // check registers
    for (const [i, register] of obj.registers.entries()) {
        if (typeof register !== "string")
            throw new Error(`'registers[${i}]' must be a string`);
    }

    // check formats (second level)
    for (const [name, format] of Object.entries(obj.formats)) {
        if (typeof format !== "object" || format === null || Array.isArray(format))
            throw new Error(`'formats.${name}' must be an object`);
        if (!Array.isArray(format.operands))
            throw new Error(`'formats.${name}.operands' must be a list`);

        // check operands of each format (third level)
        for (const [i, operand] of format.operands.entries()) {
            const where = `formats.${name}.operands[${i}]`;
            if (typeof operand !== "object" || operand === null || Array.isArray(operand))
                throw new Error(`'${where}' must be an object`);
            if (typeof operand.field !== "string")
                throw new Error(`'${where}.field' must be a string`);
            if (typeof operand.type !== "string")
                throw new Error(`'${where}.type' must be a string`);
            if (!operandTypes.includes(operand.type))
                throw new Error(`'${where}.type' must be one of: ${operandTypes.join(", ")} (got '${operand.type}')`);
        }
    }

    // check optional wordLayout (second level)
    if (obj.wordLayout !== undefined) {
        const layout = obj.wordLayout;
        if (typeof layout !== "object" || layout === null || Array.isArray(layout))
            throw new Error("'wordLayout' must be an object");
        const l = layout as Record<string, unknown>;

        const checkChoice = (key: string, choices: string[]) => {
            if (l[key] !== undefined && !choices.includes(l[key] as string))
                throw new Error(`'wordLayout.${key}' must be one of: ${choices.join(", ")} (got ${JSON.stringify(l[key])})`);
        };
        checkChoice("mode", ["variable", "fixed"]);
        checkChoice("opcodePosition", ["first", "last"]);
        checkChoice("addressing", ["instruction", "word"]);

        if (l.unusedValue !== undefined && (typeof l.unusedValue !== "number" || !Number.isFinite(l.unusedValue)))
            throw new Error("'wordLayout.unusedValue' must be a number");

        if (l.columns !== undefined) {
            if (!Array.isArray(l.columns))
                throw new Error("'wordLayout.columns' must be a list");
            const seen = new Set<string>();
            for (const [i, column] of l.columns.entries()) {
                if (typeof column !== "string" || column.trim() === "")
                    throw new Error(`'wordLayout.columns[${i}]' must be a non-empty string`);
                if (seen.has(column))
                    throw new Error(`'wordLayout.columns[${i}]' must be unique ('${column}' is already a column)`);
                seen.add(column);
            }
        }

        if (l.mode === "fixed") {
            if (!Array.isArray(l.columns))
                throw new Error("'wordLayout.columns' is required when 'wordLayout.mode' is 'fixed'");
            const columns = l.columns as string[];
            const opcodeColumns = columns.filter(c => c === "opcode").length;
            if (opcodeColumns !== 1)
                throw new Error(`'wordLayout.columns' must contain 'opcode' exactly once (found ${opcodeColumns})`);

            // every operand needs its own column, 'opcode' is reserved for the opcode
            for (const [name, format] of Object.entries(obj.formats)) {
                const used = new Set<string>();
                for (const [i, operand] of format.operands.entries()) {
                    const where = `formats.${name}.operands[${i}].field`;
                    if (operand.field === "opcode")
                        throw new Error(`'${where}' can't be 'opcode', that column is reserved for the opcode`);
                    if (!columns.includes(operand.field))
                        throw new Error(`'${where}' must be one of the 'wordLayout.columns': ${columns.join(", ")} (got '${operand.field}')`);
                    if (used.has(operand.field))
                        throw new Error(`'${where}' must be unique within format '${name}' ('${operand.field}' is used twice)`);
                    used.add(operand.field);
                }
            }
        }
    }

    // check instructions (second level)
    const seenMnemonics = new Set<string>();
    const seenOpcodes = new Map<number, string>();
    for (const [i, instruction] of obj.instructions.entries()) {
        const where = `instructions[${i}]`;
        if (typeof instruction !== "object" || instruction === null || Array.isArray(instruction))
            throw new Error(`'${where}' must be an object`);
        if (typeof instruction.mnemonic !== "string")
            throw new Error(`'${where}.mnemonic' must be a string`);
        if (!Number.isInteger(instruction.opcode) || instruction.opcode < 0)
            throw new Error(`'${where}.opcode' must be a non-negative integer`);
        if (typeof instruction.format !== "string")
            throw new Error(`'${where}.format' must be a string`);
        if (!Object.hasOwn(obj.formats, instruction.format))
            throw new Error(`'${where}.format' must be one of: ${Object.keys(obj.formats).join(", ")} (got '${instruction.format}')`);

        // mnemonics are compared in upper case, because the parser upper-cases source mnemonics
        const mnemonic = instruction.mnemonic.toUpperCase();
        if (seenMnemonics.has(mnemonic))
            throw new Error(`'${where}.mnemonic' must be unique ('${mnemonic}' is already defined)`);
        seenMnemonics.add(mnemonic);

        const usedBy = seenOpcodes.get(instruction.opcode);
        if (usedBy !== undefined)
            throw new Error(`'${where}.opcode' must be unique (${instruction.opcode} is already used by '${usedBy}')`);
        seenOpcodes.set(instruction.opcode, mnemonic);

        // check optional immRange (third level)
        if (instruction.immRange !== undefined) {
            if (!Array.isArray(instruction.immRange))
                throw new Error(`'${where}.immRange' must be a list`);
            if (instruction.immRange.length !== 2)
                throw new Error(`'${where}.immRange' must contain exactly 2 items`);
            if (typeof instruction.immRange[0] !== "number" || typeof instruction.immRange[1] !== "number")
                throw new Error(`'${where}.immRange' must contain only numbers`);
            if (instruction.immRange[0] >= instruction.immRange[1])
                throw new Error(`'${where}.immRange' must be [min, max] with min lower than max`);
        }
    }

    // check pseudoInstructions (second level)
    for (const [i, pins] of obj.pseudoInstructions.entries()) {
        const where = `pseudoInstructions[${i}]`;
        if (typeof pins !== "object" || pins === null || Array.isArray(pins))
            throw new Error(`'${where}' must be an object`);
        if (typeof pins.mnemonic !== "string")
            throw new Error(`'${where}.mnemonic' must be a string`);
        if (!Array.isArray(pins.params))
            throw new Error(`'${where}.params' must be a list`);
        if (!Array.isArray(pins.expandsTo))
            throw new Error(`'${where}.expandsTo' must be a list`);

        // check params and expandsTo (third level)
        for (const [j, param] of pins.params.entries()) {
            if (typeof param !== "string")
                throw new Error(`'${where}.params[${j}]' must be a string`);
        }
        for (const [j, line] of pins.expandsTo.entries()) {
            if (typeof line !== "string")
                throw new Error(`'${where}.expandsTo[${j}]' must be a string`);
        }
    }

    // return Isa object
    return data as Isa;
}

// built-in ISA for writing plain machine code without an ISA file: no mnemonics, so every line is numbers
export const rawIsaData: Isa = {
    name: "Raw machine code",
    description: "No ISA, every line is numbers and labels",
    registers: [],
    firstProgramIndex: 0,
    jumpToOneBeforeAddress: false,
    formats: {},
    instructions: [],
    pseudoInstructions: [],
};

// the layout with every missing setting filled in with its default
export function resolveWordLayout(isa: Isa): WordLayout {
    const layout = isa.wordLayout ?? {};
    return {
        mode: layout.mode ?? defaultWordLayout.mode,
        opcodePosition: layout.opcodePosition ?? defaultWordLayout.opcodePosition,
        columns: [...(layout.columns ?? defaultWordLayout.columns)],
        unusedValue: layout.unusedValue ?? defaultWordLayout.unusedValue,
        addressing: layout.addressing ?? defaultWordLayout.addressing,
    };
}

// maps each mnemonic (upper case) to its instruction definition, for fast lookup
export function buildMnemonicMap(isa: Isa): Map<string, InstructionDef> {
    const map = new Map<string, InstructionDef>();
    for (const instruction of isa.instructions) {
        map.set(instruction.mnemonic.toUpperCase(), instruction);
    }
    return map;
}

function buildPseudoMnemonicMap(isa: Isa): Map<string, PseudoInstructionDef> {
    const map = new Map<string, PseudoInstructionDef>();
    for (const pins of isa.pseudoInstructions) {
        map.set(pins.mnemonic.toUpperCase(), pins)
    }
    return map;
}

export interface IsaSetup {
    isa: Isa;
    mnemonicMap: Map<string, InstructionDef>;
    pseudoMnemonicMap: Map<string, PseudoInstructionDef>;
}

export function setUpIsa(data: unknown): IsaSetup {
    const isa = loadIsa(data);
    const mnemonicMap = buildMnemonicMap(isa);
    const pseudoMnemonicMap = buildPseudoMnemonicMap(isa);
    return {isa: isa, mnemonicMap: mnemonicMap, pseudoMnemonicMap: pseudoMnemonicMap};
}