<script lang="ts">
    import { tick } from "svelte";
    import { loadIsa, type Isa } from "./core/isa";
    import { operandTypes } from "./core/types";

    let { isa, onapply }: { isa: Isa; onapply: (data: unknown) => void } =
        $props();

    // The editor works on its own editable copy ("draft"). Users never see
    // "formats": every instruction lists its own operands, and toIsa() generates
    // the formats (identical operand lists share one format) when applying/saving.
    type OperandRow = { field: string; type: string };
    type InstructionRow = {
        mnemonic: string;
        opcode: number | null;
        operands: OperandRow[];
        preferredFormat: string; // original format name, reused when possible
        hasRange: boolean;
        min: number | null;
        max: number | null;
        open: boolean; // UI only: row expanded?
    };
    type PseudoRow = {
        mnemonic: string;
        params: string;
        expandsTo: string;
        open: boolean;
    };

    const typeLabels: Record<string, string> = {
        register: "register",
        immediate: "number (immediate)",
        label: "label (jump target)",
    };

    function fromIsa(source: Isa) {
        return {
            name: source.name,
            description: source.description,
            firstProgramIndex: source.firstProgramIndex as number | null,
            jumpToOneBeforeAddress: source.jumpToOneBeforeAddress,
            registers: [...source.registers],
            instructions: source.instructions.map(
                (ins): InstructionRow => ({
                    mnemonic: ins.mnemonic,
                    opcode: ins.opcode,
                    operands: source.formats[ins.format].operands.map((o) => ({ ...o })),
                    preferredFormat: ins.format,
                    hasRange: ins.immRange !== undefined,
                    min: ins.immRange?.[0] ?? 0,
                    max: ins.immRange?.[1] ?? 0,
                    open: false,
                }),
            ),
            pseudoInstructions: source.pseudoInstructions.map(
                (p): PseudoRow => ({
                    mnemonic: p.mnemonic,
                    params: p.params.join(", "),
                    expandsTo: p.expandsTo.join("\n"),
                    open: false,
                }),
            ),
        };
    }

    // svelte-ignore state_referenced_locally
    let draft = $state(fromIsa(isa));
    let error: string = $state("");
    let newRegister: string = $state("");

    function splitList(text: string, separator: RegExp) {
        return text
            .split(separator)
            .map((s) => s.trim())
            .filter((s) => s !== "");
    }

    // ---------- registers (chips) ----------
    function addRegisters(text: string) {
        for (const r of splitList(text, /[,\s]+/)) {
            if (!draft.registers.includes(r)) draft.registers.push(r);
        }
        newRegister = "";
    }
    function onRegisterKey(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault();
            addRegisters(newRegister);
        } else if (e.key === "Backspace" && newRegister === "") {
            draft.registers.pop();
        }
    }

    // ---------- draft -> ISA json ----------
    const typeLetter: Record<string, string> = { register: "R", immediate: "I", label: "L" };

    // operands without a name get one from their type, e.g. "register2"
    function operandName(operands: OperandRow[], i: number) {
        const own = operands[i].field.trim();
        if (own) return own;
        const type = operands[i].type;
        const same = operands.filter((o) => o.type === type);
        const nth = operands.slice(0, i + 1).filter((o) => o.type === type).length;
        return same.length > 1 ? `${type}${nth}` : type;
    }

    function toIsa(): unknown {
        const formats: Record<string, { operands: OperandRow[] }> = {};
        const bySignature = new Map<string, string>();

        // finds or creates the format for an instruction's operand list
        function formatFor(ins: InstructionRow): string {
            const operands = ins.operands.map((o, i) => ({
                field: operandName(ins.operands, i),
                type: o.type,
            }));
            const signature = JSON.stringify(operands);
            const existing = bySignature.get(signature);
            if (existing !== undefined) return existing;

            const auto = operands.length
                ? operands.map((o) => typeLetter[o.type] ?? o.type[0]?.toUpperCase() ?? "X").join("")
                : "N";
            const base = ins.preferredFormat && !(ins.preferredFormat in formats) ? ins.preferredFormat : auto;
            let name = base;
            for (let n = 2; name in formats; n++) name = base + n;
            formats[name] = { operands };
            bySignature.set(signature, name);
            return name;
        }

        const instructions = draft.instructions.map((ins) => ({
            mnemonic: ins.mnemonic,
            opcode: ins.opcode,
            format: formatFor(ins),
            ...(ins.hasRange ? { immRange: [ins.min, ins.max] } : {}),
        }));
        return {
            name: draft.name,
            description: draft.description,
            registers: [...draft.registers],
            firstProgramIndex: draft.firstProgramIndex,
            jumpToOneBeforeAddress: draft.jumpToOneBeforeAddress,
            formats,
            instructions,
            pseudoInstructions: draft.pseudoInstructions.map((p) => ({
                mnemonic: p.mnemonic,
                params: splitList(p.params, /[,\s]+/),
                expandsTo: splitList(p.expandsTo, /\n/),
            })),
        };
    }

    // errors from loadIsa look like "'instructions[3].opcode' must ..."
    // -> find the row so it can be highlighted and opened
    let errorRow = $derived.by(() => {
        const m = error.match(/^'(instructions|pseudoInstructions)\[(\d+)\]/);
        return m ? { kind: m[1], index: Number(m[2]) } : null;
    });

    // returns the validated ISA, or null (and shows the error)
    async function validate(): Promise<unknown | null> {
        error = "";
        try {
            const data = toIsa();
            loadIsa(data);
            return data;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            const row = errorRow;
            if (row) {
                const rows = row.kind === "instructions" ? draft.instructions : draft.pseudoInstructions;
                rows[row.index].open = true;
                await tick();
                document
                    .getElementById(`${row.kind === "instructions" ? "ins" : "pins"}-${row.index}`)
                    ?.scrollIntoView({ block: "nearest" });
            }
            return null;
        }
    }

    async function apply() {
        addRegisters(newRegister);
        const data = await validate();
        if (data) onapply(data);
    }

    async function download() {
        addRegisters(newRegister);
        const data = await validate();
        if (!data) return;
        const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${draft.name.trim() || "isa"}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function addInstruction() {
        const used = draft.instructions.map((i) => i.opcode ?? -1);
        draft.instructions.push({
            mnemonic: "",
            opcode: Math.max(-1, ...used) + 1,
            operands: [],
            preferredFormat: "",
            hasRange: false,
            min: 0,
            max: 0,
            open: true,
        });
    }
    function addPseudo() {
        draft.pseudoInstructions.push({ mnemonic: "", params: "", expandsTo: "", open: true });
    }
</script>

<article>
    <header><h2>ISA editor</h2></header>

    <details open>
        <summary>General</summary>
        <div class="fields">
            <label>
                Name
                <input type="text" bind:value={draft.name} />
            </label>
            <label>
                Description
                <input type="text" bind:value={draft.description} />
            </label>
            <label>
                First program index
                <input type="number" min="0" bind:value={draft.firstProgramIndex} />
                <small>The address where the first instruction of your program is stored.</small>
            </label>
            <label class="checkbox">
                <input type="checkbox" bind:checked={draft.jumpToOneBeforeAddress} />
                Jump to one before jump address
            </label>
            <small class="under-checkbox">
                Some CPUs add 1 before jumping, so labels must point one address lower.
            </small>
            <div class="field">
                <span class="label-text">Registers</span>
                <div class="chips">
                    {#each draft.registers as register, i}
                        <span class="chip">
                            {register}
                            <button class="chip-x" onclick={() => draft.registers.splice(i, 1)} aria-label="Remove {register}">✕</button>
                        </span>
                    {/each}
                    <input
                        type="text"
                        class="chip-input"
                        placeholder="Add…"
                        aria-label="Add register"
                        bind:value={newRegister}
                        onkeydown={onRegisterKey}
                        onblur={() => addRegisters(newRegister)}
                    />
                </div>
                <small>Type a name and press Enter.</small>
            </div>
        </div>
    </details>

    <details>
        <summary>Instructions ({draft.instructions.length})</summary>
        <p class="help">Operands are the values you write after the instruction, in order.</p>
        {#each draft.instructions as ins, i}
            <details
                class="item"
                class:invalid={errorRow?.kind === "instructions" && errorRow.index === i}
                id="ins-{i}"
                bind:open={ins.open}
            >
                <summary>
                    <span class="name">{ins.mnemonic || "(new)"}</span>
                    <span class="meta">{ins.opcode ?? "?"}</span>
                    <span class="ops">{ins.operands.map((_, j) => operandName(ins.operands, j)).join(", ")}</span>
                </summary>
                <div class="body">
                    <div class="row">
                        <input
                            type="text"
                            class="mnemonic"
                            placeholder="Mnemonic"
                            aria-label="Mnemonic"
                            bind:value={ins.mnemonic}
                        />
                        <input
                            type="number"
                            class="opcode"
                            min="0"
                            placeholder="Opcode"
                            aria-label="Opcode"
                            bind:value={ins.opcode}
                        />
                        <button class="ghost danger" onclick={() => draft.instructions.splice(i, 1)} aria-label="Remove instruction">✕</button>
                    </div>
                    {#each ins.operands as operand, j}
                        <div class="row">
                            <select aria-label="Operand type" bind:value={operand.type}>
                                {#each operandTypes as type}
                                    <option value={type}>{typeLabels[type] ?? type}</option>
                                {/each}
                            </select>
                            <input
                                type="text"
                                placeholder="name (optional)"
                                aria-label="Operand name"
                                bind:value={operand.field}
                            />
                            <button class="ghost danger" onclick={() => ins.operands.splice(j, 1)} aria-label="Remove operand">✕</button>
                        </div>
                    {/each}
                    <button class="link" onclick={() => ins.operands.push({ field: "", type: "register" })}>+ Add operand</button>
                    <div class="row">
                        <label class="checkbox">
                            <input type="checkbox" bind:checked={ins.hasRange} />
                            Limit the number range
                        </label>
                        {#if ins.hasRange}
                            <input type="number" class="range" aria-label="Minimum" bind:value={ins.min} />
                            <span class="hint">to</span>
                            <input type="number" class="range" aria-label="Maximum" bind:value={ins.max} />
                        {/if}
                    </div>
                </div>
            </details>
        {/each}
        <button class="ghost" onclick={addInstruction}>+ Instruction</button>
    </details>

    <details>
        <summary>Pseudo-instructions ({draft.pseudoInstructions.length})</summary>
        <p class="help">Shortcuts that expand into one or more real instructions.</p>
        {#each draft.pseudoInstructions as pins, i}
            <details
                class="item"
                class:invalid={errorRow?.kind === "pseudoInstructions" && errorRow.index === i}
                id="pins-{i}"
                bind:open={pins.open}
            >
                <summary>
                    <span class="name">{pins.mnemonic || "(new)"}</span>
                    <span class="ops">{pins.params}</span>
                </summary>
                <div class="body">
                    <div class="row">
                        <input
                            type="text"
                            placeholder="Mnemonic"
                            aria-label="Mnemonic"
                            bind:value={pins.mnemonic}
                        />
                        <button class="ghost danger" onclick={() => draft.pseudoInstructions.splice(i, 1)} aria-label="Remove pseudo-instruction">✕</button>
                    </div>
                    <label>
                        <span class="label-text">Parameters <span class="hint">(separated by commas)</span></span>
                        <input type="text" placeholder="rd, rs" bind:value={pins.params} />
                    </label>
                    <label>
                        <span class="label-text">Expands to <span class="hint">(one instruction per line)</span></span>
                        <textarea rows="3" placeholder="ADD $rd, $rs, R0" bind:value={pins.expandsTo}></textarea>
                        <small>Write <code>$name</code> wherever a parameter should be inserted.</small>
                    </label>
                </div>
            </details>
        {/each}
        <button class="ghost" onclick={addPseudo}>+ Pseudo-instruction</button>
    </details>

    <div class="actionbar">
        {#if error}
            <p class="error">{error}</p>
        {/if}
        <div class="actions">
            <button onclick={apply}>Apply</button>
            <button class="ghost outlined" onclick={download}>Download .json</button>
        </div>
    </div>
</article>

<style>
    article {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        font-size: 14px;
    }
    h2 {
        margin: 0;
    }
    input:not([type="checkbox"]),
    select,
    textarea,
    button {
        font-size: 14px;
    }
    summary {
        cursor: pointer;
        font-weight: 600;
        padding: 4px 0;
    }
    .fields,
    .body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
    }
    .fields {
        margin-top: 6px;
    }
    .help {
        margin: 2px 0 8px;
        font-size: 13px;
        color: var(--muted);
    }
    label,
    .field {
        display: grid;
        gap: 4px;
        font-size: 13px;
        color: var(--muted);
    }
    label.checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    small {
        font-size: 12px;
        color: var(--muted);
        opacity: 0.85;
    }
    .under-checkbox {
        margin-top: -4px;
    }
    .hint {
        font-weight: 400;
        opacity: 0.8;
    }
    code {
        font-size: 12px;
    }

    /* instruction / pseudo-instruction rows */
    .item {
        margin: 4px 0;
        border: 1px solid var(--line);
        border-radius: 6px;
    }
    .item.invalid {
        border-color: var(--error);
    }
    .item > summary {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 6px 8px;
        font-weight: 400;
        list-style-position: inside;
    }
    .item > summary:hover {
        background: var(--bg);
    }
    .item .name {
        font-family: var(--font-code);
        font-weight: 600;
        color: var(--code2);
    }
    .item .meta {
        font-family: var(--font-code);
        font-size: 12px;
        color: var(--muted);
    }
    .item .ops {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--muted);
    }
    .body {
        padding: 8px;
        border-top: 1px solid var(--line);
    }

    .row {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .row > * {
        min-width: 0;
    }
    .row input[type="text"],
    .row select {
        flex: 1;
    }
    .row .mnemonic {
        flex: 1.2;
    }
    .row .opcode {
        width: 72px;
        flex: none;
    }
    .row .range {
        width: 70px;
        flex: none;
    }
    textarea {
        resize: vertical;
        font-family: var(--font-code);
        font-size: 13px;
    }

    /* register chips */
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px;
        background: var(--bg);
        border: 1px solid var(--line);
        border-radius: 5px;
    }
    .chips:focus-within {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
    }
    .chip {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px 4px 2px 8px;
        background: var(--bars);
        border-radius: 4px;
        font-family: var(--font-code);
        font-size: 13px;
        color: var(--code1);
    }
    .chip-x {
        background: transparent;
        color: var(--muted);
        border: none;
        padding: 0 4px;
        font-size: 11px;
    }
    .chip-x:hover {
        color: var(--error);
    }
    .chips .chip-input {
        flex: 1;
        min-width: 60px;
        border: none;
        background: transparent;
        padding: 2px 4px;
        outline: none;
    }

    /* buttons */
    button.ghost {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--line);
        align-self: start;
    }
    button.ghost.outlined {
        border-color: var(--accent);
    }
    button.ghost.danger {
        padding: 5px 8px;
        color: var(--muted);
        flex: none;
    }
    button.ghost.danger:hover {
        color: var(--error);
        border-color: var(--error);
    }
    button.link {
        background: none;
        color: var(--accent);
        padding: 2px 0;
        justify-self: start;
    }

    /* Apply / Download stay visible while scrolling */
    .actionbar {
        position: sticky;
        bottom: -10px; /* cancels the panel's padding so the bar touches the edge */
        margin: 0 -10px -10px;
        padding: 8px 10px 10px;
        background: var(--panel);
        border-top: 1px solid var(--line);
    }
    .actions {
        display: flex;
        gap: 8px;
    }
    .error {
        margin: 0 0 8px;
        font-size: 13px;
        color: var(--error);
    }
</style>
