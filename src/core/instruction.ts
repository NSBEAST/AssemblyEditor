export interface ParsedInstruction {
    mnemonic: string;
    operands: string[];
    source_line: number;
}