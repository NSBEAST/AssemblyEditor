import { expect, test } from "vitest";
import { expandPseudo } from "./expandPseudo";
import { setUpIsa } from "./isa";
import type { PseudoInstructionDef } from "./isa";
import type { ParsedInstruction } from "./instruction";
import isaData from "../../isa/tm16.json";

// the pseudo instructions are defined here, so the tests do not depend on tm16.json
const defs: PseudoInstructionDef[] = [
    { mnemonic: "MOV", params: ["rd", "rs"], expandsTo: ["ADD $rd, $rs, R0"] },
    { mnemonic: "SWAPZ", params: ["a"], expandsTo: ["ADD $a, R0, R0", "ADD R7, $a, R0"] },
    { mnemonic: "BEQZ", params: ["r", "t"], expandsTo: ["BEQ $r, R0, $t"] },
    { mnemonic: "BAD", params: ["a"], expandsTo: ["ADD $a, $b, R0"] },
];
const pseudoMap = new Map(defs.map((d) => [d.mnemonic, d]));

const isaAt = (firstProgramIndex: number) => setUpIsa({ ...isaData, firstProgramIndex }).isa;

const ins = (mnemonic: string, operands: string[], source_line: number): ParsedInstruction =>
    ({ mnemonic, operands, source_line });

function expand(instructions: ParsedInstruction[], labels: Array<[string, number]> = [], firstProgramIndex = 0) {
    return expandPseudo(instructions, new Map(labels), pseudoMap, isaAt(firstProgramIndex));
}

test("a pseudo instruction is replaced by its expansion", () => {
    expect(expand([ins("MOV", ["R1", "R2"], 1)]).instructions).toEqual([
        ins("ADD", ["R1", "R2", "R0"], 1),
    ]);
});

test("one pseudo instruction can expand to several instructions", () => {
    expect(expand([ins("SWAPZ", ["R3"], 4)]).instructions).toEqual([
        ins("ADD", ["R3", "R0", "R0"], 4),
        ins("ADD", ["R7", "R3", "R0"], 4),
    ]);
});

test("normal instructions pass through unchanged", () => {
    const program = [ins("NOP", [], 1), ins("ADD", ["R1", "R2", "R3"], 2), ins("12", ["7"], 3)];
    expect(expand(program).instructions).toEqual(program);
});

test("source_line of the original line is kept for every expanded instruction", () => {
    const result = expand([ins("NOP", [], 1), ins("SWAPZ", ["R1"], 2), ins("NOP", [], 3)]).instructions;
    expect(result.map((i) => i.source_line)).toEqual([1, 2, 2, 3]);
});

test("a label can be an operand of a pseudo instruction", () => {
    expect(expand([ins("BEQZ", ["R1", "top"], 1)]).instructions).toEqual([
        ins("BEQ", ["R1", "R0", "top"], 1),
    ]);
});

test("an empty program stays empty", () => {
    expect(expand([])).toEqual({ instructions: [], labels: new Map() });
});

test.each([
    ["too few operands", ins("MOV", ["R1"], 3), "Error on line 3: pseudo-instruction 'MOV' expects 2 operands, 1 were given instead"],
    ["too many operands", ins("MOV", ["R1", "R2", "R3"], 5), "Error on line 5: pseudo-instruction 'MOV' expects 2 operands, 3 were given instead"],
    ["no operands", ins("MOV", [], 1), "Error on line 1: pseudo-instruction 'MOV' expects 2 operands, 0 were given instead"],
    ["unknown $parameter in the template", ins("BAD", ["R1"], 2), "Error on line 2: can't find parameter 'b'"],
])("expandPseudo rejects: %s", (_name, instruction, message) => {
    expect(() => expand([instruction])).toThrow(message);
});

// labels: addresses are counted before expansion, so they have to be moved when an expansion adds instructions

test("labels before any expansion do not move", () => {
    const program = [ins("NOP", [], 1), ins("SWAPZ", ["R1"], 2)];
    expect(expand(program, [["start", 0]]).labels).toEqual(new Map([["start", 0]]));
});

test("a label after a 2-instruction expansion moves by 1", () => {
    const program = [ins("NOP", [], 1), ins("SWAPZ", ["R1"], 2), ins("HALT", [], 3)];
    expect(expand(program, [["after", 2]]).labels).toEqual(new Map([["after", 3]]));
});

test("a label on a pseudo instruction points to its first expanded instruction", () => {
    const program = [ins("NOP", [], 1), ins("SWAPZ", ["R1"], 2), ins("HALT", [], 3)];
    expect(expand(program, [["here", 1]]).labels).toEqual(new Map([["here", 1]]));
});

test("a label at the end of the program points one past the last instruction", () => {
    expect(expand([ins("SWAPZ", ["R1"], 1)], [["end", 1]]).labels).toEqual(new Map([["end", 2]]));
});

test("expansions of one instruction do not move labels", () => {
    const program = [ins("MOV", ["R1", "R2"], 1), ins("HALT", [], 2)];
    expect(expand(program, [["a", 0], ["b", 1]]).labels).toEqual(new Map([["a", 0], ["b", 1]]));
});

test("every label after several expansions moves by the total added so far", () => {
    const program = [ins("SWAPZ", ["R1"], 1), ins("NOP", [], 2), ins("SWAPZ", ["R2"], 3), ins("HALT", [], 4)];
    const labels: Array<[string, number]> = [["a", 1], ["b", 3]];
    expect(expand(program, labels).labels).toEqual(new Map([["a", 2], ["b", 5]]));
});

test("label addresses respect firstProgramIndex", () => {
    const program = [ins("NOP", [], 1), ins("SWAPZ", ["R1"], 2), ins("HALT", [], 3)];
    expect(expand(program, [["after", 7]], 5).labels).toEqual(new Map([["after", 8]]));
});
