export class AsmError extends Error {
    constructor(public line: number, text: string) {
        super(`Error on line ${line}: ${text}`);
    }
}

export class AsmErrors extends Error {
    constructor(public errors: AsmError[]) {
        super(`${errors.map((e) => e.message).join("\n")}`);
    }
}