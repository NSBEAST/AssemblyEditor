import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export function findLabels(source: string) {
    const matches = source.matchAll(/^[ \t]*(\w+):/gm);
    const labelSet: Set<string> = new Set();
    for (const match of matches) {
        labelSet.add(match[1]);
    }
    return labelSet;
}

export function makeAsmLanguage(mnemonics: Set<string>, registers: Set<string>, labels: Set<string>) {
    return StreamLanguage.define({
        name: "asm",
        token(stream) {
            if (stream.eatSpace()) return null;

            if (stream.match(";")) {
                stream.skipToEnd();
                return "comment";
            }

            if (stream.match(/^-?(0x[0-9a-f]+|\d+)/i)) {
                return "number";
            }

            if (stream.match(/^\w+:/)) {
                return "labelName";
            }

            if (stream.match(/^\w+/)) {
                const text = stream.current().toUpperCase();
                if (mnemonics.has(text)) return "keyword";
                if (registers.has(text)) return "variableName";
                if (labels.has(stream.current())) return "labelName";
                return null;
            }

            stream.next();
            return null;
        },
        languageData: { commentTokens: { line: ";" } },
    })
}


export const asmHighlighting = syntaxHighlighting(
    HighlightStyle.define([
        { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
        { tag: tags.keyword, color: "var(--code2)" },
        { tag: tags.variableName, color: "var(--code1)" },
        { tag: tags.labelName, color: "var(--accent)" },
    ]),
);