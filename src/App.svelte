<script lang="ts">
    import isaData from "../isa/tm16.json";
    import { setUpIsa, rawIsaData, resolveWordLayout, type IsaSetup } from "./core/isa";
    import IsaEditor from "./IsaEditor.svelte";
    import Editor from "./Editor.svelte";
    import { findLabels } from "./asmLanguage";
    import { AsmError } from "./core/asmError";
    import { assembleSource } from "./core/assembleSource";

    const SOURCE_KEY = "tmcode.source";
    const ISA_KEY = "tmcode.isa";

    function loadSavedSetup(): IsaSetup {
        try {
            const saved = localStorage.getItem(ISA_KEY);
            if (saved) return setUpIsa(JSON.parse(saved));
        } catch {
            
        }
        return setUpIsa(isaData);
    }

    function saveIsa(current: IsaSetup) {
        try {
            localStorage.setItem(ISA_KEY, JSON.stringify(current.isa));
        } catch {
            
        }
    }

    function loadSavedSource(): string {
        try {
            return localStorage.getItem(SOURCE_KEY) ?? "";
        } catch {
            return "";
        }
    }

    let setup: IsaSetup = $state.raw(loadSavedSetup());
    let output: number[][] = $state([]);
    // what the ROM stores: padded rows, or one number per row with word addressing
    let romRows: number[][] = $state([]);
    let romColumns: string[] | undefined = $state(undefined);

    let layout = $derived(resolveWordLayout(setup.isa));

    // every ISA file in the isa folder can be loaded from the toolbar
    const builtinIsas = Object.values(
        import.meta.glob("../isa/*.json", { eager: true, import: "default" }),
    ).map((data) => ({ name: (data as { name: string }).name, data }));
    builtinIsas.push({ name: rawIsaData.name, data: rawIsaData });

    function clearOutput() {
        output = [];
        romRows = [];
        romColumns = undefined;
        errors = [];
    }

    function loadBuiltin(event: Event & { currentTarget: HTMLSelectElement }) {
        const select = event.currentTarget;
        const chosen = builtinIsas[Number(select.value)];
        select.value = "";
        if (!chosen) return;
        isaError = "";
        setup = setUpIsa(chosen.data);
        saveIsa(setup);
        clearOutput();
    }

    let errors: AsmError[] = $state([]);
    let copyError: string = $state("");
    let isaError = $state("");

    let copied = $state(false);
    let editing = $state(false);
    let fileInput: HTMLInputElement;

    let mnemonicSet = $derived(
        new Set(
            [
                ...setup.mnemonicMap.keys(),
                ...setup.pseudoMnemonicMap.keys(),
            ].map((m) => m.toUpperCase()),
        ),
    );

    let registerSet = $derived(
        new Set(setup.isa.registers.map((r) => r.toUpperCase())),
    );

    let source = $state(loadSavedSource());

    $effect(() => {
        try {
            localStorage.setItem(SOURCE_KEY, source);
        } catch {
            
        }
    });

    let liveErrors = $derived(assembleSource(source, setup).errors);
    let cursor = $state({ line: 1, col: 1 });

    let labelSet = $derived(findLabels(source));

    function assembleButton() {
        const result = assembleSource(source, setup);
        output = result.output;
        romRows = result.rom;
        romColumns = result.romColumns;
        errors = result.errors;
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
            saveIsa(setup);
            clearOutput();
        } catch (e) {
            isaError =
                "Could not load ISA file: " +
                (e instanceof Error ? e.message : String(e));
        }

        input.value = "";
    }

    function applyIsa(data: unknown) {
        setup = setUpIsa(data);
        saveIsa(setup);
        clearOutput();
        editing = false;
    }

    let sourceInput: HTMLInputElement;

    async function openSource(
        event: Event & { currentTarget: HTMLInputElement },
    ) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        source = await file.text();
        clearOutput();
        input.value = "";
    }

    function saveSource() {
        const blob = new Blob([source], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "program.asm";
        link.click();
        URL.revokeObjectURL(url);
    }

    function outputToText() {
        const rows = layout.addressing === "word" ? romRows : output;
        return rows.map((row) => row.join(" ")).join("\n");
    }

    async function copyOutputToClipboard() {
        copyError = "";
        try {
            await navigator.clipboard.writeText(outputToText());
            copied = true;
            setTimeout(() => {
                copied = false;
            }, 1500);
        } catch (e) {
            copyError =
                "Could not copy: " +
                (e instanceof Error ? e.message : String(e));
        }
    }
</script>

<div class="layout">
    <header class="toolbar">
        <h1>TM Code Editor</h1>
        <button onclick={assembleButton} title="Ctrl+Enter">Assemble</button>

        <input
            type="file"
            accept=".json"
            aria-label="Import ISA file"
            hidden
            bind:this={fileInput}
            onchange={importIsa}
        />
        <button class="secondary-button" onclick={() => fileInput.click()}>
            Import ISA
        </button>
        <select class="secondary-button" aria-label="Load built-in ISA" value="" onchange={loadBuiltin}>
            <option value="" disabled>Built-in ISA…</option>
            {#each builtinIsas as builtin, i}
                <option value={i}>{builtin.name}</option>
            {/each}
        </select>

        <input
            type="file"
            accept=".asm,.s,.txt"
            aria-label="Open assembly file"
            hidden
            bind:this={sourceInput}
            onchange={openSource}
        />
        <button class="secondary-button" onclick={() => sourceInput.click()}>
            Open .asm
        </button>
        <button class="secondary-button" onclick={saveSource}>
            Save .asm
        </button>

        <p class="isa-label">{setup.isa.name}</p>
    </header>

    <aside class="sidebar">
        <header><h2>ISA Reference</h2></header>
        <div class="isa-reference">
            {#if setup.isa.description.trim()}
                <details>
                    <summary>Description</summary>
                    <p class="instruction-description value">
                        {setup.isa.description}
                    </p>
                </details>
            {/if}

            {#if setup.isa.instructions.length !== 0}
                <details>
                    <summary>Instructions</summary>
                    {#each setup.isa.instructions as ins}
                        <details class="nested">
                            <summary>{ins.mnemonic}</summary>
                            {#if setup.isa.formats[ins.format].operands.length !== 0}
                                <p class="instruction-description">
                                    Operands: {#each setup.isa.formats[ins.format].operands as op, i}
                                        {#if i > 0},{/if}
                                        <span class="value" title={op.type}>
                                            {op.field}
                                        </span>
                                    {/each}
                                </p>
                                {#if ins.immRange}
                                    <p class="instruction-description">
                                        Immediate range: <span class="value">
                                            [{ins.immRange[0]} to {ins
                                                .immRange[1]}]
                                        </span>
                                    </p>
                                {/if}
                            {:else}
                                <p class="instruction-description value">
                                    No operands
                                </p>
                            {/if}
                        </details>
                    {/each}
                </details>
            {/if}

            {#if setup.isa.pseudoInstructions.length !== 0}
                <details>
                    <summary>Pseudo-instructions</summary>
                    {#each setup.isa.pseudoInstructions as ins}
                        <details class="nested">
                            <summary>{ins.mnemonic}</summary>
                            {#if ins.params.length !== 0}
                                <p class="instruction-description">
                                    Operands: <span class="value">
                                        {#each ins.params as op, i}
                                            {#if i > 0},{/if}
                                            {op}
                                        {/each}
                                    </span>
                                </p>
                                <p class="instruction-description">
                                    Expands to:
                                </p>
                                {#each ins.expandsTo as exp}
                                    <p
                                        class="instruction-description expansion"
                                    >
                                        <code class="value">{exp}</code>
                                    </p>
                                {/each}
                            {:else}
                                <p class="instruction-description">
                                    No parameters
                                </p>
                            {/if}
                        </details>
                    {/each}
                </details>
            {/if}

            {#if setup.isa.registers.length}
                <details>
                    <summary>Registers</summary>
                    <div class="registers">
                        {#each setup.isa.registers as reg}
                            <span class="register">{reg}</span>
                        {/each}
                    </div>
                </details>
            {/if}

            <details>
                <summary>Other</summary>
                <p class="instruction-description">
                    First program index: <span class="value">
                        {setup.isa.firstProgramIndex}
                    </span>
                </p>
                <p class="instruction-description">
                    Jump to one before address: <span class="value">
                        {setup.isa.jumpToOneBeforeAddress}
                    </span>
                </p>
                <p class="instruction-description">
                    Instruction length: <span class="value">
                        {layout.mode === "fixed"
                            ? `fixed, columns ${layout.columns.join(" ")}`
                            : `variable, opcode ${layout.opcodePosition}`}
                    </span>
                </p>
                {#if layout.mode === "fixed" && layout.unusedValue !== 0}
                    <p class="instruction-description">
                        Unused columns: <span class="value">{layout.unusedValue}</span>
                    </p>
                {/if}
                <p class="instruction-description">
                    PC counts: <span class="value">
                        {layout.addressing === "word" ? "every number" : "instructions"}
                    </span>
                </p>
            </details>
        </div>
    </aside>

    <main class="editor">
        <Editor
            value={source}
            onchange={(text) => (source = text)}
            onrun={assembleButton}
            oncursor={(line, col) => (cursor = { line, col })}
            mnemonics={mnemonicSet}
            registers={registerSet}
            labels={labelSet}
            setup={setup}
        />
    </main>

    <section class="panel">
        <div class="tabs" role="tablist">
            <button
                role="tab"
                aria-selected={!editing}
                onclick={() => (editing = false)}
            >
                Output
            </button>
            <button
                role="tab"
                aria-selected={editing}
                onclick={() => (editing = true)}
            >
                Edit ISA
            </button>
        </div>
        {#if editing}
            {#key setup}
                <IsaEditor isa={setup.isa} onapply={applyIsa} />
            {/key}
        {:else}
            {#if !errors.length}
                <table class="output-table">
                    <thead>
                        <tr>
                            <th>Addr</th>
                            {#if layout.addressing === "word"}
                                <th>Value</th>
                            {:else if romColumns}
                                {#each romColumns as column}
                                    <th>{column}</th>
                                {/each}
                            {:else if layout.mode === "variable" && layout.opcodePosition === "first"}
                                <th>Opcode</th>
                                <th>Operands</th>
                            {:else}
                                <th>Numbers</th>
                            {/if}
                        </tr>
                    </thead>
                    <tbody>
                        {#each layout.addressing === "word" || romColumns ? romRows : output as row, i}
                            <tr>
                                <td>{i + setup.isa.firstProgramIndex}</td>
                                {#if layout.addressing === "word"}
                                    <td>{row[0]}</td>
                                {:else if romColumns}
                                    {#each row as value}
                                        <td>{value}</td>
                                    {/each}
                                {:else if layout.mode === "variable" && layout.opcodePosition === "first"}
                                    <td>{row[0]}</td>
                                    <td>{row.slice(1).join(" ")}</td>
                                {:else}
                                    <td>{row.join(" ")}</td>
                                {/if}
                            </tr>
                        {/each}
                    </tbody>
                </table>

                {#if output.length !== 0}
                    <button onclick={copyOutputToClipboard} class="copy-button">
                        {copied ? "Copied!" : "Copy"}
                    </button>
                {/if}
            {:else}
                {#each errors as err}
                    <p class="error">{err.message}</p>
                {/each}
            {/if}
        {/if}
    </section>

    <footer class="status-bar">
        {#if isaError}
            <p class="error">{isaError}</p>
        {/if}

        {#if errors.length}
            <p class="error status-error">
                {errors.length} error{errors.length > 1 ? "s" : ""}: {errors[0].message.slice(
                    errors[0].message.indexOf("line"),
                )}
            </p>
        {/if}

        {#if copyError}
            <p class="error">{copyError}</p>
        {/if}

        {#if output.length !== 0}
            <p class="status-bar-message">
                {output.length} instruction{output.length > 1 ? "s" : ""} assembled{layout.addressing === "word"
                    ? `, ${romRows.length} numbers`
                    : ""}
            </p>
        {/if}

        <p class="status-right" class:has-errors={liveErrors.length > 0}>
            {liveErrors.length
                ? `${liveErrors.length} error${liveErrors.length > 1 ? "s" : ""}`
                : "No errors"} · Ln {cursor.line}, Col {cursor.col}
        </p>
    </footer>
</div>

<style>
    .layout {
        display: grid;
        height: 100vh;
        color: var(--text);
        grid-template-areas:
            "toolbar toolbar toolbar"
            "sidebar editor panel"
            "status-bar status-bar status-bar";
        grid-template-rows: 50px 1fr 50px;
        grid-template-columns: 300px 2fr clamp(350px, 30vw, 480px);
    }
    .toolbar {
        grid-area: toolbar;
        background-color: var(--bars);
        border-bottom: 2px solid var(--line);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 10px;
    }
    .secondary-button {
        background-color: transparent;
        outline: 2px solid var(--accent);
        outline-offset: -2px;
        color: var(--text);
    }
    select.secondary-button option {
        background-color: var(--panel);
        color: var(--text);
    }

    .isa-label {
        margin-left: auto;
    }
    .isa-label {
        color: white;
    }

    .sidebar {
        grid-area: sidebar;
        background-color: var(--panel);
        border-right: 2px solid var(--line);
        padding: 10px;
        min-height: 0;
        overflow: auto;
    }
    details > :not(summary) {
        margin-left: 1rem;
    }
    .isa-reference > details > summary {
        letter-spacing: 0.05rem;
        color: var(--muted);
        font-weight: 600;
    }
    .instruction-description {
        margin-block: 0;
        color: var(--muted);
        font-size: 14px;
    }
    .expansion {
        padding-left: 1rem;
    }
    .value {
        color: var(--text);
        font-size: 16px;
    }
    .registers {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 4px 0;
    }
    .register {
        background-color: var(--bars);
        color: var(--text);
        font-family: var(--font-code);
        font-size: 15px;
        padding: 2px 8px;
        border-radius: 4px;
    }
    .nested {
        border-left: 1px solid var(--muted);
    }
    .nested > summary {
        font-family: var(--font-code);
        color: var(--code2);
        padding-left: 0.5rem;
    }
    summary {
        padding: 3px 0;
        cursor: pointer;
    }
    summary::marker {
        color: var(--muted);
    }
    summary:hover {
        background: var(--bars);
    }

    .editor {
        grid-area: editor;
        background-color: var(--bg);
        min-height: 0;
    }

    .panel {
        grid-area: panel;
        background-color: var(--panel);
        border-left: 2px solid var(--line);
        padding: 10px;
        min-height: 0;
        overflow: auto;
    }
    .output-table {
        width: 100%;
    }
    .tabs {
        display: flex;
        border-bottom: 2px solid var(--line);
        padding-bottom: 15px;
    }
    .tabs button {
        background: transparent;
        color: var(--muted);
        border-radius: 0;
        border-bottom: 2px solid transparent;
    }
    .tabs button[aria-selected="true"] {
        color: var(--text);
        border-bottom-color: var(--accent);
    }
    .tabs button:hover {
        color: var(--text);
    }
    .copy-button {
        margin-top: 10px;
    }

    .status-bar {
        grid-area: status-bar;
        background-color: var(--bars);
        border-top: 2px solid var(--line);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 10px;
    }
    .error {
        color: var(--error);
        border-left: 3px solid var(--error);
        padding-left: 5px;
    }
    .status-error {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }
    .status-right {
        margin-left: auto;
        flex: none;
        white-space: nowrap;
        color: var(--muted);
        font-size: 16px;
    }
    .status-right.has-errors {
        color: var(--error);
    }
    .status-bar-message {
        color: var(--muted);
        font-size: 16px;
    }
</style>
