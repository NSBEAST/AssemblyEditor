import { expect, test } from "vitest";
import { splitInstruction, splitLabel, stripComment, parseText } from "./parser";
import { setUpIsa } from "./isa";
import isaData from "../../isa/tm16.json";

// tm16.json with the program starting at address 0, so the expected label addresses are easy to read
const isa = setUpIsa({ ...isaData, firstProgramIndex: 0 }).isa;

test.each([
    ["trailing comment", "ADD R1, R2 ; hello", "ADD R1, R2"],
    ["comment only", "; only", ""],
    ["several semicolons", "NOP ; a ; b", "NOP"],
    ["no comment", "NOP", "NOP"],
])("stripComment: %s", (_name, line, expected) => {
    expect(stripComment(line)).toBe(expected);
});

test.each([
    ["space before the colon", "test : NOP 5", { label: "test", rest: "NOP 5" }],
    ["label only", "loop:", { label: "loop", rest: "" }],
    ["no label", "NOP 5", { label: undefined, rest: "NOP 5" }],
    ["no label, indented", "   NOP 5  ", { label: undefined, rest: "NOP 5" }],
])("splitLabel: %s", (_name, line, expected) => {
    expect(splitLabel(line)).toEqual(expected);
});

test.each([
    ["commas and spaces", "ADD 5, 7, 8", { mnemonic: "ADD", operands: ["5", "7", "8"] }],
    ["spaces only", "ADD 5 7 8", { mnemonic: "ADD", operands: ["5", "7", "8"] }],
    ["commas only", "ADD 5,7,8", { mnemonic: "ADD", operands: ["5", "7", "8"] }],
    ["mixed separators and extra spaces", "SUB   5, R6 9", { mnemonic: "SUB", operands: ["5", "R6", "9"] }],
    ["lower case mnemonic", "add R1, R2", { mnemonic: "ADD", operands: ["R1", "R2"] }],
    ["no operands", "HALT", { mnemonic: "HALT", operands: [] }],
    ["empty text", "", { mnemonic: "", operands: [] }],
])("splitInstruction: %s", (_name, text, expected) => {
    expect(splitInstruction(text)).toEqual(expected);
});

test("parseText: comments, labels, blank lines and indentation", () => {
    const code = "begin: ADD R1, R2 ; hello \n end: SUB ; comment ; comment \n empty: \n test: ADD 7 9";
    expect(parseText(code, isa)).toEqual({
        instructions: [
            { mnemonic: "ADD", operands: ["R1", "R2"], source_line: 1 },
            { mnemonic: "SUB", operands: [], source_line: 2 },
            { mnemonic: "ADD", operands: ["7", "9"], source_line: 4 },
        ],
        labels: new Map([["begin", 0], ["end", 1], ["empty", 2], ["test", 2]]),
    });
});

test("parseText: indented instruction without a label", () => {
    expect(parseText("   add R1, R2", isa).instructions).toEqual([
        { mnemonic: "ADD", operands: ["R1", "R2"], source_line: 1 },
    ]);
});

test("parseText rejects a label that is defined twice", () => {
    expect(() => parseText("a: NOP\n\na: HALT", isa)).toThrow("Error on line 3: label 'a' is already defined");
});


test("parseText: label addresses start at firstProgramIndex", () => {
    const shifted = setUpIsa({ ...isaData, firstProgramIndex: 5 }).isa;
    expect(parseText("a: NOP\nb: HALT", shifted).labels).toEqual(new Map([["a", 5], ["b", 6]]));
});
