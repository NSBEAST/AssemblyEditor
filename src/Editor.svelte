<script lang="ts">
    import { onMount } from "svelte";
    import { EditorView, basicSetup } from "codemirror";
    import { keymap, placeholder } from "@codemirror/view";
    import { indentWithTab } from "@codemirror/commands";
    import { Compartment, StateEffect } from "@codemirror/state";
    import { makeAsmLanguage, asmHighlighting } from "./asmLanguage";
    import { linter, type Diagnostic } from "@codemirror/lint";
    import { assembleSource } from "./core/assembleSource";
    import type { IsaSetup } from "./core/isa";

    let {
        value,
        onchange,
        onrun,
        mnemonics,
        registers,
        labels,
        setup,
        oncursor,
    }: {
        value: string;
        onchange: (text: string) => void;
        onrun: () => void;
        mnemonics: Set<string>;
        registers: Set<string>;
        labels: Set<string>;
        setup: IsaSetup;
        oncursor?: (line: number, col: number) => void;
    } = $props();

    let container: HTMLDivElement;
    let view: EditorView;

    const languageSlot = new Compartment();
    const isaChanged = StateEffect.define<null>();

    const asmLinter = linter(
        (view): Diagnostic[] => {
            const { errors } = assembleSource(view.state.doc.toString(), setup);
            const diagnostics = errors
                .filter((x) => x.line >= 1 && x.line <= view.state.doc.lines)
                .map(
                    (err): Diagnostic => ({
                        from: view.state.doc.line(err.line).from,
                        to: view.state.doc.line(err.line).to,
                        severity: "error",
                        message: err.message.slice(
                            err.message.indexOf(":") + 2,
                        ),
                    }),
                );
            return diagnostics;
        },
        {
            needsRefresh: (update) =>
                update.transactions.some((tr) =>
                    tr.effects.some((e) => e.is(isaChanged)),
                ),
        },
    );

    $effect(() => {
        const language = makeAsmLanguage(mnemonics, registers, labels);
        view?.dispatch({
            effects: languageSlot.reconfigure(language),
        });
    });

    $effect(() => {
        setup;
        view?.dispatch({ effects: isaChanged.of(null) });
    });

    $effect(() => {
        const text = value;
        if (view && text !== view.state.doc.toString()) {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: text },
            });
        }
    });

    const theme = EditorView.theme(
        {
            "&": {
                height: "100%",
                backgroundColor: "var(--bg)",
                color: "var(--text)",
            },
            "&.cm-focused": {
                outline: "none",
            },
            ".cm-scroller": {
                fontFamily: "var(--font-code)",
                lineHeight: "1.5",
            },
            ".cm-content": {
                caretColor: "var(--accent)",
                padding: "12px 0",
            },
            ".cm-cursor": {
                borderLeftColor: "var(--accent)",
            },
            ".cm-placeholder": {
                color: "var(--muted)",
            },
            ".cm-gutters": {
                backgroundColor: "var(--bars)",
                color: "var(--muted)",
                border: "none",
            },
            ".cm-activeLine": {
                backgroundColor: "rgba(255, 255, 255, 0.04)",
            },
            ".cm-activeLineGutter": {
                backgroundColor: "var(--panel)",
                color: "var(--text)",
            },
            "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                {
                    backgroundColor: "#4a6078",
                },
        },
        { dark: true },
    );

    onMount(() => {
        view = new EditorView({
            parent: container,
            doc: value,
            extensions: [
                keymap.of([
                    {
                        key: "Mod-Enter",
                        run: () => {
                            onrun();
                            return true;
                        },
                    },
                    indentWithTab,
                ]),
                basicSetup,
                theme,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onchange(update.state.doc.toString());
                    }
                    if (update.docChanged || update.selectionSet) {
                        const head = update.state.selection.main.head;
                        const line = update.state.doc.lineAt(head);
                        oncursor?.(line.number, head - line.from + 1);
                    }
                }),
                languageSlot.of(makeAsmLanguage(mnemonics, registers, labels)),
                asmHighlighting,
                asmLinter,
                placeholder("Write assembly here, Ctrl+Enter to assemble"),
            ],
        });

        return () => view.destroy();
    });
</script>

<div class="host" bind:this={container}></div>

<style>
    .host {
        height: 100%;
        border: 1px solid transparent;
    }
    .host:focus-within {
        border-color: var(--accent);
    }
</style>
