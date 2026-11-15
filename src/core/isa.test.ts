import { expect, test } from "vitest";
import { loadIsa, buildMnemonicMap, setUpIsa, resolveWordLayout, rawIsaData } from "./isa";
import isaData from "../../isa/tm16.json";

// every bad ISA below is a copy of tm16.json with one thing changed, so the original stays untouched
const copyOfIsa = () => structuredClone(isaData) as any;

test("loadIsa accepts tm16.json", () => {
    expect(() => loadIsa(isaData)).not.toThrow();
});

test.each([null, [], "text"])("loadIsa rejects %j (not an object)", (value) => {
    expect(() => loadIsa(value)).toThrow("ISA file must be a JSON object");
});

test("loadIsa rejects an empty object", () => {
    expect(() => loadIsa({})).toThrow("'name' must be a string");
});

const badIsas: Array<[string, (isa: any) => void, string]> = [
    ["negative firstProgramIndex", (isa) => { isa.firstProgramIndex = -1; }, "'firstProgramIndex' must be a non-negative integer"],
    ["fractional firstProgramIndex", (isa) => { isa.firstProgramIndex = 1.5; }, "'firstProgramIndex' must be a non-negative integer"],
    ["non-boolean jumpToOneBeforeAddress", (isa) => { isa.jumpToOneBeforeAddress = "true"; }, "'jumpToOneBeforeAddress' must be a boolean"],
    ["non-string register", (isa) => { isa.registers[2] = 5; }, "'registers[2]' must be a string"],
    ["unknown operand type", (isa) => { isa.formats.R.operands[0].type = "bogus"; }, "'formats.R.operands[0].type' must be one of"],
    ["unknown format name", (isa) => { isa.instructions[3].format = "NOPE"; }, "'instructions[3].format' must be one of"],
    ["negative opcode", (isa) => { isa.instructions[0].opcode = -1; }, "'instructions[0].opcode' must be a non-negative integer"],
    ["fractional opcode", (isa) => { isa.instructions[0].opcode = 1.5; }, "'instructions[0].opcode' must be a non-negative integer"],
    ["immRange with one item", (isa) => { isa.instructions[13].immRange = [5]; }, "must contain exactly 2 items"],
    ["immRange with min above max", (isa) => { isa.instructions[13].immRange = [9, 3]; }, "min lower than max"],
    ["duplicate opcode", (isa) => { isa.instructions[1].opcode = 0; }, "'instructions[1].opcode' must be unique"],
    ["duplicate mnemonic, ignoring case", (isa) => { isa.instructions[2].mnemonic = "add"; }, "'instructions[2].mnemonic' must be unique"],
    ["pseudo instruction that is not an object", (isa) => { isa.pseudoInstructions[0] = 7; }, "'pseudoInstructions[0]' must be an object"],
];

test.each(badIsas)("loadIsa rejects: %s", (_name, change, message) => {
    const isa = copyOfIsa();
    change(isa);
    expect(() => loadIsa(isa)).toThrow(message);
});

test("buildMnemonicMap contains every instruction", () => {
    const map = buildMnemonicMap(loadIsa(isaData));
    expect(map.size).toBe(16);
    expect(map.get("BNE")?.opcode).toBe(11);
    expect(map.get("SHL")?.immRange).toEqual([0, 15]);
    expect(map.get("NOPE")).toBeUndefined();
});

test("buildMnemonicMap uses upper case keys", () => {
    const isa = copyOfIsa();
    isa.instructions[1].mnemonic = "add";
    const map = buildMnemonicMap(loadIsa(isa));
    expect(map.get("ADD")?.opcode).toBe(1);
    expect(map.get("add")).toBeUndefined();
});

test("setUpIsa validates and builds the mnemonic map", () => {
    const setup = setUpIsa(isaData);
    expect(setup.isa.name).toBe("TM16");
    expect(setup.mnemonicMap.get("ADD")?.opcode).toBe(1);
    expect(() => setUpIsa({})).toThrow();
});


// ---- wordLayout

const fixedLayout = { mode: "fixed", columns: ["opcode", "rd", "rs1", "rs2", "imm", "offset", "addr"] };

test("without wordLayout the defaults are variable length, opcode first, instruction addressing", () => {
    expect(resolveWordLayout(loadIsa(isaData))).toEqual({ mode: "variable", opcodePosition: "first", columns: [], unusedValue: 0, addressing: "instruction" });
});

test("loadIsa accepts a complete fixed wordLayout", () => {
    const isa = copyOfIsa();
    isa.wordLayout = { ...fixedLayout, unusedValue: 0, addressing: "word" };
    const layout = resolveWordLayout(loadIsa(isa));
    expect(layout.mode).toBe("fixed");
    expect(layout.columns).toHaveLength(7);
    expect(layout.addressing).toBe("word");
});

test("the raw machine code ISA is valid", () => {
    expect(() => setUpIsa(rawIsaData)).not.toThrow();
});

const badLayouts: Array<[string, (layout: any) => void, string]> = [
    ["unknown mode", (l) => { l.mode = "wide"; }, "'wordLayout.mode' must be one of: variable, fixed"],
    ["unknown opcodePosition", (l) => { l.opcodePosition = "middle"; }, "'wordLayout.opcodePosition' must be one of: first, last"],
    ["unknown addressing", (l) => { l.addressing = "byte"; }, "'wordLayout.addressing' must be one of: instruction, word"],
    ["non-numeric unusedValue", (l) => { l.unusedValue = "0"; }, "'wordLayout.unusedValue' must be a number"],
    ["columns that is not a list", (l) => { l.columns = "opcode"; }, "'wordLayout.columns' must be a list"],
    ["empty column name", (l) => { l.columns[1] = " "; }, "'wordLayout.columns[1]' must be a non-empty string"],
    ["duplicate column", (l) => { l.columns[2] = "rd"; }, "'wordLayout.columns[2]' must be unique"],
    ["fixed without columns", (l) => { delete l.columns; }, "'wordLayout.columns' is required"],
    ["fixed without opcode column", (l) => { l.columns[0] = "op"; }, "must contain 'opcode' exactly once (found 0)"],
    ["operand field missing in columns", (l) => { l.columns = l.columns.filter((c: string) => c !== "imm"); }, "'formats.I.operands[2].field' must be one of the 'wordLayout.columns'"],
];

test.each(badLayouts)("loadIsa rejects wordLayout with %s", (_name, change, message) => {
    const isa = copyOfIsa();
    isa.wordLayout = structuredClone(fixedLayout);
    change(isa.wordLayout);
    expect(() => loadIsa(isa)).toThrow(message);
});

test("loadIsa rejects a wordLayout that is not an object", () => {
    const isa = copyOfIsa();
    isa.wordLayout = [];
    expect(() => loadIsa(isa)).toThrow("'wordLayout' must be an object");
});

test("loadIsa rejects an operand using the reserved opcode column", () => {
    const isa = copyOfIsa();
    isa.wordLayout = structuredClone(fixedLayout);
    isa.formats.J.operands[0].field = "opcode";
    expect(() => loadIsa(isa)).toThrow("can't be 'opcode'");
});

test("loadIsa rejects a format that uses one column twice", () => {
    const isa = copyOfIsa();
    isa.wordLayout = structuredClone(fixedLayout);
    isa.formats.R.operands[2].field = "rs1";
    expect(() => loadIsa(isa)).toThrow("'formats.R.operands[2].field' must be unique within format 'R'");
});

test("variable mode does not check the operand fields", () => {
    const isa = copyOfIsa();
    isa.wordLayout = { mode: "variable" };
    isa.formats.R.operands[2].field = "rs1";
    expect(() => loadIsa(isa)).not.toThrow();
});
