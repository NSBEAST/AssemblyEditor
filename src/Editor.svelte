<script lang="ts">
    import { onMount } from "svelte";
    import { EditorView, basicSetup } from "codemirror";
    import { keymap } from "@codemirror/view";
    import { indentWithTab } from "@codemirror/commands";

    let {
        value,
        onchange,
        onrun,
    }: { value: string; onchange: (text: string) => void; onrun: () => void } =
        $props();

    let container: HTMLDivElement;
    let view: EditorView;

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
                }),
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
