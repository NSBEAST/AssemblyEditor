<script lang="ts">
    import { assemble } from "./core/assembler";
    import isaData from "../isa/tm16.json";
    import { setUpIsa } from "./core/isa";
    import { parseText } from "./core/parser";
    import { expandPseudo } from "./core/expandPseudo";
    import IsaEditor from "./IsaEditor.svelte";
    let setup = $state.raw(setUpIsa(isaData));
    let output: number[][] = $state([]);
    let error = $state("");
    let isaError = $state("");
    let copied = $state(false);
    let editing = $state(false);

    let source = $state("");
    function assembleButton() {
        error = "";
        try {
            const { instructions, labels } = parseText(source, setup.isa);
            const { instructions: newInstructions, labels: newLabels } =
                expandPseudo(
                    instructions,
                    labels,
                    setup.pseudoMnemonicMap,
                    setup.isa,
                );
            output = assemble(newInstructions, newLabels, setup);
        } catch (e) {
            output = [];
            error = e instanceof Error ? e.message : String(e);
        }
    }

    async function importIsa(
        event: Event & { currentTarget: HTMLInputElement },
    ) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".json")) {
            isaError = `Could not load ISA file: '${file.name}' is not a .json file`;
            return;
        }

        isaError = "";
        try {
            const text = await file.text();
            setup = setUpIsa(JSON.parse(text));
            output = [];
            error = "";
        } catch (e) {
            isaError =
                "Could not load ISA file: " +
                (e instanceof Error ? e.message : String(e));
        }

        input.value = "";
    }

    function applyIsa(data: unknown) {
        setup = setUpIsa(data);
        output = [];
        error = "";
        editing = false;
    }

    function handleKey(event: KeyboardEvent) {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            assembleButton();
        }
    }

    function outputToText() {
        return output.map((row) => row.join(" ")).join("\n");
    }

    async function copyOutputToClipboard() {
        try {
            await navigator.clipboard.writeText(outputToText());
            copied = true;
            setTimeout(() => {
                copied = false;
            }, 1500);
        } catch (e) {
            error =
                "Could not copy: " +
                (e instanceof Error ? e.message : String(e));
        }
    }
</script>

<main>
    <div class="main">
        <h1>Trailmakers Assembler</h1>
        <label>
            ISA file (active: {setup.isa.name})
            <input type="file" accept=".json" onchange={importIsa} />
        </label>
        <button onclick={() => (editing = !editing)}>
            {editing ? "Close editor" : "Edit ISA"}
        </button>
        {#if editing}
            <IsaEditor isa={setup.isa} onapply={applyIsa} />
        {/if}
        {#if isaError}
            <p class="error">{isaError}</p>
        {/if}



        <details>
            <summary>ISA Reference</summary>
            <div class="ISA-reference">
                {#if setup.isa.description.trim()}
                <details class="indented">
                    <summary>Description</summary>
                    <p class="indented">{setup.isa.description}</p>
                </details>
                {/if}

                {#if setup.isa.instructions.length !== 0}
                <details class="indented">
                    <summary>Instructions</summary>
                    <table>
                        <thead>
                            <tr>
                                <th>Mnemonic</th>
                                <th>Opcode</th>
                                <th>Operands</th>
                                <th>immRange</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each setup.isa.instructions as ins}
                                <tr>
                                    <td>{ins.mnemonic}</td>
                                    <td>{ins.opcode}</td>
                                    <td>
                                        {setup.isa.formats[ins.format].operands
                                            .map(
                                                (o) =>
                                                    o.field +
                                                    " (" +
                                                    o.type +
                                                    ")",
                                            )
                                            .join(", ")}
                                    </td>
                                    <td>
                                        {#if ins.immRange}{ins.immRange[0] +
                                                " to " +
                                                ins.immRange[1]}{/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </details>
                {/if}

                {#if setup.isa.pseudoInstructions.length !== 0}
                    <details class="indented">
                        <summary>Pseudo-instructions</summary>
                        <table>
                            <thead>
                                <tr>
                                    <th>Mnemonic</th>
                                    <th>Params</th>
                                    <th>Replaces</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each setup.isa.pseudoInstructions as pins}
                                    <tr>
                                        <td>{pins.mnemonic}</td>
                                        <td>{pins.params.join(", ")}</td>
                                        <td>
                                            {#each pins.expandsTo as line}
                                                <div>- {line}</div>
                                            {/each}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </details>
                {/if}

                {#if setup.isa.registers.length}
                <details class="indented">
                    <summary>Registers</summary>
                    <p class="indented">{setup.isa.registers.join(", ")}</p>
                </details>
                {/if}

                <details class="indented">
                    <summary>Other</summary>
                    <table>
                        <thead>
                            <tr>
                                <th>Field</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>First program index</td>
                                <td>{setup.isa.firstProgramIndex}</td>
                            </tr>
                            <tr>
                                <td>Jump to one before jump address</td>
                                <td>{setup.isa.jumpToOneBeforeAddress}</td>
                            </tr>
                        </tbody>
                    </table>
                </details>
            </div>
        </details>

        <div class="workspace">
            <div>
                <textarea
                    class="input-area"
                    bind:value={source}
                    onkeydown={handleKey}></textarea>
                <button onclick={assembleButton}>Assemble</button>
            </div>
            {#if output.length > 0}
                <div>
                    <table>
                        <thead>
                            <tr>
                                <th>Addr</th>
                                <th>Opcode</th>
                                <th>Operands</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each output as row, i}
                                <tr>
                                    <td>{i + setup.isa.firstProgramIndex}</td>
                                    <td>{row[0]}</td>
                                    <td>{row.slice(1).join(" ")}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                    <button onclick={copyOutputToClipboard}>
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
            {/if}
        </div>

        {#if error}
            <p class="error">{error}</p>
        {/if}
    </div>
</main>

<style>
    .indented {
        margin-left: 1.5rem;
    }
    summary::after {
        display: none;
    }
    summary::before {
        content: "▸";
    }
    details[open] > summary::before {
        content: "▾";
    }
    .main {
        margin: 1rem;
    }
    .workspace {
        display: grid;
        grid-template-columns: 1fr 1fr; /* two equal columns */
        gap: 1rem;
        align-items: start;
    }
    .ISA-reference {
        max-height: 500px;
        overflow: auto;
    }
    .input-area {
        font-size: medium;
    }
</style>
