import type { ParsedInstruction } from "./instruction";
import type { Isa } from "./isa";
import { AsmError, AsmErrors } from "./asmError";

export function stripComment(line: string): string {
    if (line.indexOf(";") === -1) return line;
    const position: number = line.indexOf(";");
    return line.slice(0, position).trim()
}

export function splitLabel(line: string) {
    if (line.indexOf(":") === -1) return {label: undefined, rest: line.trim()};
    const position: number = line.indexOf(":");
    const label: string = line.slice(0, position).trim();
    const rest: string = line.slice(position+1).trim();
    return {label: label, rest: rest};
}

// assumes trimmed text
export function splitInstruction(text: string) {
    const position = text.indexOf(" ");
    if (position === -1) return {mnemonic: text.toUpperCase(), operands: []};
    const mnemonic = text.slice(0, position).toUpperCase();
    const rest = text.slice(position + 1);
    const operands = rest.split(/,| /).map(x => x.trim());
    const nonEmtpyOperands = operands.filter(x => x !== "");
    return {mnemonic: mnemonic, operands: nonEmtpyOperands}
}

export function parseText(text: string, isa: Isa): {instructions: ParsedInstruction[], labels: Map<string, number>} {
    const lines: string[] = text.split(/\r?\n/);
    let instructions: ParsedInstruction[] = [];
    const labels = new Map<string, number>();
    const errors: AsmError[] = [];

    let index: number = isa.firstProgramIndex;
    for (const [i, line] of lines.entries()) {
        const strippedLine = stripComment(line);
        const {label, rest} = splitLabel(strippedLine);

        if (label) {
            if (labels.has(label))
                errors.push(new AsmError(i + 1, `label '${label}' is already defined`));
            else
                labels.set(label, index);
        }

        const {mnemonic, operands} = splitInstruction(rest);

        if (mnemonic !== "" || operands.length !== 0) {
            const instruction: ParsedInstruction = {mnemonic: mnemonic, operands: operands, source_line: i + 1};
            instructions.push(instruction);
            index++;
        }
    }
    if (errors.length) throw new AsmErrors(errors);

    return {instructions: instructions, labels: labels}
}
