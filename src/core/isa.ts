import {operandTypes} from "./types";

export interface Format {
    operands: Array<{
        field: string,
        type: string
    }>
}

export interface Isa {
    name: string
    description: string
    registers: Array<string>
    firstProgramIndex: number
    jumpToOneBeforeAddress: boolean
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