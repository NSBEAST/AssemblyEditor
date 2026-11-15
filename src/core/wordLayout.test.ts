import { expect, test } from "vitest";
import { assembleSource } from "./assembleSource";
import { setUpIsa } from "./isa";
import { rawIsaData } from "./isa";
import isaData from "../../isa/tm16.json";

// tm16.json starting at address 0 with plain label addresses, so the numbers are easy to read
const base = { ...isaData, firstProgramIndex: 0, jumpToOneBeforeAddress: false } as any;
const withLayout = (wordLayout: object) => setUpIsa({ ...structuredClone(base), wordLayout });

const columns = ["opcode", "rd", "rs1", "rs2", "imm", "offset", "addr"];
const fixed = () => withLayout({ mode: "fixed", columns });

test("variable layout keeps the written operand order (JMP 15 is 12 15)", () => {
    const result = assembleSource("JMP end\nend: HALT", setUpIsa(base));
    expect(result.output).toEqual([[12, 1], [15]]);
    expect(result.errors).toEqual([]);
});

test("opcode last moves the opcode behind the operands", () => {
    const setup = withLayout({ mode: "variable", opcodePosition: "last" });
    expect(assembleSource("ADD R1, R2, R3\nHALT", setup).output).toEqual([[1, 2, 3, 1], [15]]);
});

test("fixed layout puts every operand in its own column and fills the rest", () => {
    const { output, errors } = assembleSource("ADD R1, R2, R3\nLDI R4, 9\nJMP end\nend: HALT", fixed());
    expect(errors).toEqual([]);
    expect(output).toEqual([
        [1, 1, 2, 3, 0, 0, 0],
        [7, 4, 0, 0, 9, 0, 0],
        [12, 0, 0, 0, 0, 0, 3],
        [15, 0, 0, 0, 0, 0, 0],
    ]);
});

test("fixed layout uses unusedValue for unused columns", () => {
    const setup = withLayout({ mode: "fixed", columns, unusedValue: -1 });
    expect(assembleSource("HALT", setup).output).toEqual([[15, -1, -1, -1, -1, -1, -1]]);
});

test("the opcode column can be anywhere", () => {
    const setup = withLayout({ mode: "fixed", columns: ["rd", "rs1", "rs2", "imm", "offset", "addr", "opcode"] });
    expect(assembleSource("ADD R1, R2, R3", setup).output).toEqual([[1, 2, 3, 0, 0, 0, 1]]);
});

test("machine code lines stay variable length in a fixed layout", () => {
    const { output, rom, romColumns } = assembleSource("12 15\nHALT\n1 2 3 4 5 6 7 8", fixed());
    expect(output).toEqual([[12, 15], [15, 0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6, 7, 8]]);
    // the ROM is padded to the longest row, so the columns can't be named any more
    expect(rom.every((row) => row.length === 8)).toBe(true);
    expect(romColumns).toBeUndefined();
});

test("the ROM of a fixed layout names its columns", () => {
    const { rom, romColumns } = assembleSource("12 15\nHALT", fixed());
    expect(rom).toEqual([[12, 15, 0, 0, 0, 0, 0], [15, 0, 0, 0, 0, 0, 0]]);
    expect(romColumns).toEqual(columns);
});

test("the ROM of a variable layout is padded with unusedValue to the longest row", () => {
    const setup = withLayout({ mode: "variable", unusedValue: 7 });
    expect(assembleSource("HALT\nADD R1, R2, R3", setup).rom).toEqual([[15, 7, 7, 7], [1, 1, 2, 3]]);
});

test("word addressing gives labels the address of their first number", () => {
    // HALT is 1 number, LDI 3 and JMP 2: loop is word 1 and end is word 1 + 3 + 2 + 2 = 8
    const source = "HALT\nloop: LDI R1, 5\nJMP loop\nJMP end\nend: HALT";
    const setup = withLayout({ addressing: "word" });
    expect(assembleSource(source, setup).output).toEqual([[15], [7, 1, 5], [12, 1], [12, 8], [15]]);
});

test("word addressing counts fixed layout words by their column count", () => {
    const setup = withLayout({ mode: "fixed", columns, addressing: "word" });
    const { output } = assembleSource("NOP\nend: HALT\nJMP end", setup);
    expect(output[2][6]).toBe(7);
});

test("word addressing counts machine code lines by their length", () => {
    const setup = withLayout({ addressing: "word" });
    expect(assembleSource("1 2 3\nJMP end\nend: HALT", setup).output).toEqual([[1, 2, 3], [12, 5], [15]]);
});

test("word addressing makes a ROM with one number per row", () => {
    const setup = withLayout({ addressing: "word" });
    expect(assembleSource("LDI R1, 5\nHALT", setup).rom).toEqual([[7], [1], [5], [15]]);
});

test("word addressing starts counting at firstProgramIndex", () => {
    const setup = setUpIsa({ ...structuredClone(base), firstProgramIndex: 10, wordLayout: { addressing: "word" } });
    expect(assembleSource("LDI R1, 5\nend: HALT\nJMP end", setup).output[2]).toEqual([12, 13]);
});

test("pseudo-instructions work with word addressing", () => {
    const setup = withLayout({ addressing: "word" });
    const result = assembleSource("JMP end\nend: HALT", setup);
    expect(result.errors).toEqual([]);
    expect(result.output).toEqual([[12, 2], [15]]);
});

test("the raw ISA assembles plain machine code with labels, any length", () => {
    const setup = setUpIsa(rawIsaData);
    const { output, rom, errors } = assembleSource("1 2\nloop: 5 6 7\n8 loop", setup);
    expect(errors).toEqual([]);
    expect(output).toEqual([[1, 2], [5, 6, 7], [8, 1]]);
    expect(rom).toEqual([[1, 2, 0], [5, 6, 7], [8, 1, 0]]);
});

test("the raw ISA rejects mnemonics", () => {
    expect(assembleSource("ADD R1", setUpIsa(rawIsaData)).errors[0].message).toContain("unknown instruction or opcode 'ADD'");
});
