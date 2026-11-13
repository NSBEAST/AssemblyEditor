import { expect, test } from "vitest";
import { loadIsa, buildMnemonicMap, setUpIsa } from "./isa";
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
