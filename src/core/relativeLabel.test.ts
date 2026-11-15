import { expect, test } from "vitest";
import { assembleSource } from "./assembleSource";
import { setUpIsa } from "./isa";
import isaData from "../../isa/tm16.json";

// tm16.json where the branches (BEQ, BNE) jump relative and JMP stays absolute
function makeSetup(change: (isa: any) => void = () => {}) {
    const isa = { ...structuredClone(isaData), firstProgramIndex: 0, jumpToOneBeforeAddress: false } as any;
    isa.formats.B.operands[2].type = "relativeLabel";
    isa.pseudoInstructions = [{ mnemonic: "TWO", params: [], expandsTo: ["NOP", "NOP"] }];
    change(isa);
    return setUpIsa(isa);
}
const run = (source: string, setup = makeSetup()) => assembleSource(source, setup);

test("a backward jump is a negative offset from the jump instruction", () => {
    const result = run("NOP\nloop: NOP\nNOP\nBNE R1, R0, loop");
    expect(result.errors).toEqual([]);
    expect(result.output[3]).toEqual([11, 1, 0, -2]);
});

test("a forward jump is a positive offset", () => {
    expect(run("BEQ R1, R2, end\nNOP\nNOP\nend: HALT").output[0]).toEqual([10, 1, 2, 3]);
});

test("a jump to itself is offset 0, to the next instruction is 1", () => {
    expect(run("here: BEQ R0, R0, here\nBEQ R0, R0, next\nnext: HALT").output).toEqual([[10, 0, 0, 0], [10, 0, 0, 1], [15]]);
});

test("a label after the last instruction can be a target", () => {
    expect(run("BEQ R0, R0, end\nend:").output).toEqual([[10, 0, 0, 1]]);
});

test("absolute labels in the same ISA are unchanged", () => {
    expect(run("NOP\nNOP\nJMP end\nend: HALT").output[2]).toEqual([12, 3]);
});

test("jumpToOneBeforeAddress makes the offset one lower", () => {
    const setup = makeSetup((isa) => { isa.jumpToOneBeforeAddress = true; });
    expect(assembleSource("loop: NOP\nBNE R1, R0, loop", setup).output[1]).toEqual([11, 1, 0, -2]);
});

test("the offset does not depend on firstProgramIndex", () => {
    const setup = makeSetup((isa) => { isa.firstProgramIndex = 10; });
    expect(assembleSource("loop: NOP\nBNE R1, R0, loop", setup).output[1]).toEqual([11, 1, 0, -1]);
});

test("pseudo-instructions that expand to several instructions are counted", () => {
    expect(run("TWO\nloop: NOP\nTWO\nBEQ R0, R0, loop").output[5]).toEqual([10, 0, 0, -3]);
});

test("with word addressing the offset counts numbers", () => {
    const setup = makeSetup((isa) => { isa.wordLayout = { addressing: "word" }; });
    // LDI takes 3 numbers, NOP 1, so BEQ starts at word 4 and loop is word 3
    expect(assembleSource("LDI R1, 5\nloop: NOP\nBEQ R0, R0, loop", setup).output[2]).toEqual([10, 0, 0, -1]);
});

test("with fixed columns the offset goes in the operand's column", () => {
    const setup = makeSetup((isa) => {
        isa.wordLayout = { mode: "fixed", columns: ["opcode", "rd", "rs1", "rs2", "imm", "offset", "addr"] };
    });
    expect(assembleSource("loop: NOP\nBEQ R1, R2, loop", setup).output[1]).toEqual([10, 0, 1, 2, 0, -1, 0]);
});

test("immRange limits are inclusive for the offset", () => {
    const setup = makeSetup((isa) => {
        isa.instructions.find((i: any) => i.mnemonic === "BEQ").immRange = [-2, 2];
    });
    expect(assembleSource("loop: NOP\nNOP\nBEQ R0, R0, loop", setup).output[2]).toEqual([10, 0, 0, -2]);
    expect(assembleSource("BEQ R0, R0, end\nNOP\nend: HALT", setup).output[0]).toEqual([10, 0, 0, 2]);
});

test("an offset outside immRange is an error", () => {
    const setup = makeSetup((isa) => {
        isa.instructions.find((i: any) => i.mnemonic === "BEQ").immRange = [-2, 2];
    });
    const { errors } = assembleSource("loop: NOP\nNOP\nNOP\nBEQ R0, R0, loop", setup);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("the jump to 'loop' is -3 away, but the offset must be between -2 and 2");
});

test("an unknown label is an error", () => {
    expect(run("BEQ R0, R0, nowhere").errors[0].message).toContain("argument 3 expects a label, 'nowhere' was given instead");
});
