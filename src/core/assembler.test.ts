import { expect, test } from "vitest";
import { parseText } from "./parser";
import { assemble } from "./assembler";
import { setUpIsa } from "./isa";
import isaData from "../../isa/tm16.json";

// tm16.json with the program starting at address 0 and labels pointing at the real address,
// so the expected numbers in these tests are easy to read
const plainIsa = { ...isaData, firstProgramIndex: 0, jumpToOneBeforeAddress: false };
const defaultSetup = setUpIsa(plainIsa);

function run(source: string, setup = defaultSetup) {
    const { instructions, labels } = parseText(source, setup.isa);
    return assemble(instructions, labels, setup);
}

test("assembles a loop (label used backwards)", () => {
    const source = [
        "LDI R1, 0",
        "LDI R2, 5",
        "loop: ADD R1, R1, R2",
        "ADDI R2, R2, -1",
        "BNE R2, R0, loop",
        "ST R1, R0, 0",
        "HALT",
    ].join("\n");
    expect(run(source)).toEqual([[7, 1, 0], [7, 2, 5], [1, 1, 1, 2], [6, 2, 2, -1], [11, 2, 0, 2], [9, 1, 0, 0], [15]]);
});

test("a label can be used before it is defined", () => {
    expect(run("JMP end\nNOP\nend: HALT")).toEqual([[12, 2], [0], [15]]);
});

test("an empty program gives no code", () => {
    expect(run("")).toEqual([]);
});

test("mnemonics and register names are not case sensitive", () => {
    expect(run("add r1, r2, R3")).toEqual([[1, 1, 2, 3]]);
});

test("register names in the ISA file may be lower case", () => {
    const isa = structuredClone(plainIsa) as any;
    isa.registers = isa.registers.map((r: string) => r.toLowerCase());
    expect(run("ADD R1, r2, R3", setUpIsa(isa))).toEqual([[1, 1, 2, 3]]);
});

test("immediates may be negative or fractional", () => {
    expect(run("ADDI R1, R2, -500.5")).toEqual([[6, 1, 2, -500.5]]);
    expect(run("LDI R1, .5")).toEqual([[7, 1, 0.5]]);
});

test("immRange limits are inclusive", () => {
    expect(run("SHL R1, R2, 0")).toEqual([[13, 1, 2, 0]]);
    expect(run("SHL R1, R2, 15")).toEqual([[13, 1, 2, 15]]);
});

test("machine code lines are passed through as numbers", () => {
    expect(run("7 1 0\n15\n5 1.5 -2")).toEqual([[7, 1, 0], [15], [5, 1.5, -2]]);
});

test("machine code can use labels and be mixed with assembly", () => {
    expect(run("start: LDI R1, 5\n12 start")).toEqual([[7, 1, 5], [12, 0]]);
});

test.each([
    ["unknown register", "ADD R1, R2, R9", "Error on line 1: argument 3 expects a register"],
    ["too few operands", "ADD R1, R2", "expected 3 operands but 2 were given"],
    ["too many operands", "NOP 5", "expected 0 operands but 1 were given"],
    ["immediate is not a number", "LDI R1, abc", "argument 2 expects a number"],
    ["immediate above immRange", "SHL R1, R2, 20", "argument 3 must be between 0 and 15"],
    ["immediate below immRange", "SHL R1, R2, -1", "argument 3 must be between 0 and 15"],
    ["unknown label", "JMP nowhere", "argument 1 expects a label"],
    ["reports the right line", "NOP\n\nADD R1", "Error on line 3: expected 3 operands"],
    ["unknown opcode in machine code", "FOO R1", "unknown instruction or opcode 'FOO'"],
    ["machine code operand that is no number or label", "7 R1", "should be numbers"],
])("assemble rejects: %s", (_name, source, message) => {
    expect(() => run(source)).toThrow(message);
});


test("labels start at firstProgramIndex", () => {
    const setup = setUpIsa({ ...plainIsa, firstProgramIndex: 3 });
    expect(run("start: NOP\nJMP start", setup)).toEqual([[0], [12, 3]]);
});

test("jumpToOneBeforeAddress makes label operands point one address earlier", () => {
    const setup = setUpIsa({ ...plainIsa, firstProgramIndex: 3, jumpToOneBeforeAddress: true });
    expect(run("start: NOP\nJMP start", setup)).toEqual([[0], [12, 2]]);
});
