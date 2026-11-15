<script lang="ts">
    import {
        BlueprintError,
        MODES,
        buildBlocks,
        createBlueprint,
        defaultOptions,
        type BlueprintOptions,
        type BuildResult,
        type RomMode,
    } from "./blueprint";
    import { blockRect, cellAtPixel, previewView, renderPreview } from "./blueprint/preview";
    import { cellsOf } from "./blueprint/geometry";
    import type { Block } from "./blueprint/model";

    let { rows, firstIndex }: { rows: number[][]; firstIndex: number } = $props();

    const KEY = "tmcode.blueprint.v2";

    interface Saved {
        mode: RomMode;
        pcScale: BlueprintOptions["pcScale"];
        skipZeros: boolean;
        outputScale: number;
        tileColumns: BlueprintOptions["tileColumns"];
        testControls: "auto" | "off";
        seat: boolean;
        name: string;
        creator: string;
        steamId: string;
    }

    const defaults: Saved = {
        mode: defaultOptions.mode,
        pcScale: "auto",
        skipZeros: true,
        outputScale: 1000,
        tileColumns: "auto",
        testControls: "auto",
        seat: true,
        name: "ROM",
        creator: "",
        steamId: "",
    };

    function load(): Saved {
        try {
            const text = localStorage.getItem(KEY);
            if (text) return { ...defaults, ...JSON.parse(text) };
        } catch {
            // no saved settings
        }
        return { ...defaults };
    }

    let saved: Saved = $state(load());
    $effect(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(saved));
        } catch {
            // storage is not available
        }
    });

    // the inputs for numbers hold text so the person can clear them while typing
    let tileText = $state(saved.tileColumns === "auto" ? "" : String(saved.tileColumns));
    let scaleText = $state(String(saved.outputScale));
    $effect(() => {
        const n = Math.floor(Number(tileText));
        saved.tileColumns = tileText.trim() !== "" && n >= 1 ? n : "auto";
    });
    $effect(() => {
        const n = Number(scaleText);
        if (scaleText.trim() !== "" && Number.isFinite(n)) saved.outputScale = n;
    });

    let options = $derived<Partial<BlueprintOptions>>({
        mode: saved.mode,
        firstIndex,
        pcScale: saved.pcScale,
        skipZeros: saved.skipZeros,
        outputScale: saved.outputScale,
        tileColumns: saved.tileColumns,
        testControls: saved.testControls,
        seat: saved.seat,
    });

    // one build for the stats, warnings and preview. A BlueprintError is a mistake the person can fix.
    let built = $derived.by((): { result?: BuildResult; problem: string } => {
        if (rows.length === 0) return { problem: "" };
        try {
            return { result: buildBlocks(rows, options), problem: "" };
        } catch (e) {
            if (e instanceof BlueprintError) return { problem: e.message };
            return { problem: "Something went wrong while building: " + (e instanceof Error ? e.message : String(e)) };
        }
    });
    let result = $derived(built.result);
    let problem = $derived(built.problem);

    let counts = $derived.by(() => {
        const names: Record<string, string> = {
            comp: "comparators",
            arith: "arithmetics",
            aggr: "aggregates",
            disp: "displays",
            or: "OR gates",
            grid: "base blocks",
            seat: "seat",
        };
        const found = new Map<string, number>();
        for (const block of result?.blocks ?? []) found.set(names[block.type], (found.get(names[block.type]) ?? 0) + 1);
        return [...found.entries()].map(([name, n]) => `${n} ${n === 1 ? name.replace(/s$/, "") : name}`).join(", ");
    });

    let canvas: HTMLCanvasElement | undefined = $state();
    let view = $derived(result ? previewView(result.blocks) : undefined);

    // the block on top in every cell, for the hover text
    let topBlocks = $derived.by(() => {
        const map = new Map<string, Block>();
        for (const block of [...(result?.blocks ?? [])].sort((a, b) => a.pos[1] - b.pos[1]))
            for (const cell of cellsOf(block)) map.set(`${cell[0]},${cell[2]}`, block);
        return map;
    });

    function shortNumber(value: number) {
        return String(Math.round(value * 1000) / 1000);
    }

    // the number a block stands for, shown inside big enough cells
    function labelOf(block: Block): string {
        const p = block.params;
        if (block.color === 6) return shortNumber(block.type === "comp" ? (p.output ?? 0) * (saved.mode === "C" ? saved.outputScale : 1) : (p.constant ?? 0));
        return "";
    }

    $effect(() => {
        if (!canvas || !result || !view) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.putImageData(new ImageData(new Uint8ClampedArray(renderPreview(result.blocks)), 512, 512), 0, 0);

        if (view.scale >= 26) {
            context.font = `${Math.min(14, view.scale / 3)}px ui-monospace, monospace`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = "white";
            for (const block of result.blocks) {
                const text = labelOf(block);
                if (!text) continue;
                const rect = blockRect(view, block);
                context.fillText(text, (rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, rect.right - rect.left - 4);
            }
        }
    });

    function describe(block: Block): string {
        const p = block.params;
        const c = p.constant !== undefined ? shortNumber(p.constant) : "";
        switch (block.type) {
            case "comp":
                return block.color === 6
                    ? `Number ${labelOf(block)}: a comparator that outputs it when the PC is ${shortNumber(p.threshold ?? 0)}`
                    : `Row comparator: switches its numbers on when the PC is ${shortNumber(p.threshold ?? 0)}`;
            case "arith":
                if (block.color === 6) return `Number ${c}: a Multiply gate, switched on by its row`;
                if (block.color === 26) return `Output column: adds the column${saved.mode === "C" ? ` and multiplies by ${c}` : ""}`;
                if (block.color === 14) return `PC: the address, multiplied by ${c}`;
                return `Test key: sets the PC to ${c}`;
            case "aggr":
                return block.color === 26 ? "Output column: adds the numbers of the column" : "PC: the address";
            case "disp":
                return "Number display";
            case "or":
                return "Test key (a key bound OR gate)";
            case "grid":
                return "Plain block (keeps the build in one piece)";
            default:
                return "Seat";
        }
    }

    let hover = $state("");
    function onMove(event: MouseEvent & { currentTarget: HTMLCanvasElement }) {
        if (!view) return;
        const box = event.currentTarget.getBoundingClientRect();
        const [x, z] = cellAtPixel(view, ((event.clientX - box.left) / box.width) * 512, ((event.clientY - box.top) / box.height) * 512);
        const block = topBlocks.get(`${x},${z}`);
        hover = block ? describe(block) : "";
    }

    const legend: Array<[string, string]> = [
        ["rgb(40,90,220)", "numbers"],
        ["rgb(40,190,80)", "row comparators"],
        ["rgb(240,210,40)", "PC"],
        ["rgb(220,50,50)", "outputs"],
        ["rgb(120,120,130)", "other"],
    ];

    let downloadError = $state("");
    let busy = $state(false);

    async function download() {
        downloadError = "";
        busy = true;
        try {
            const name = saved.name.trim() || "ROM";
            const blueprint = await createBlueprint(rows, options, {
                name,
                description: "",
                tag: "",
                creator: saved.creator,
                steamId: saved.steamId,
                platform: "steamtoken",
            });
            const url = URL.createObjectURL(new Blob([blueprint.png as BlobPart], { type: "image/png" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = name.replace(/[^\w.-]+/g, "_") + ".png";
            link.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            downloadError = "Could not make the blueprint: " + (e instanceof Error ? e.message : String(e));
        } finally {
            busy = false;
        }
    }
</script>

<article>
    {#if rows.length === 0}
        <p class="help">Assemble a program first (the Assemble button), then its ROM is turned into a blueprint here.</p>
    {:else}
        <p class="help">
            {rows.length} ROM row{rows.length > 1 ? "s" : ""}, first PC value {firstIndex}. Put the downloaded .png in your Trailmakers blueprints folder.
        </p>

        <label>
            ROM type
            <select bind:value={saved.mode}>
                {#each Object.entries(MODES) as [key, mode]}
                    <option value={key}>{mode.label}</option>
                {/each}
            </select>
            <small>{MODES[saved.mode].description}</small>
        </label>

        {#if saved.mode === "C"}
            <label>
                Output scale (1 to 1000)
                <input type="text" inputmode="decimal" bind:value={scaleText} />
                <small>Numbers go from -scale to scale. 512 stores every number exactly, 1000 can be off by a tiny amount for some.</small>
            </label>
        {/if}

        <label>
            PC step
            <select bind:value={saved.pcScale}>
                <option value="auto">Automatic</option>
                <option value={1}>1 (up to address 100)</option>
                <option value={0.1}>0.1 (up to address 1000)</option>
            </select>
        </label>

        <label>
            Instructions side by side
            <input type="text" inputmode="numeric" placeholder="automatic (roughly square)" bind:value={tileText} />
        </label>

        <label class="checkbox">
            <input type="checkbox" bind:checked={saved.skipZeros} />
            Leave out numbers that are 0
        </label>
        <label class="checkbox">
            <input
                type="checkbox"
                checked={saved.testControls === "auto"}
                onchange={(e) => (saved.testControls = e.currentTarget.checked ? "auto" : "off")}
            />
            Test keys: 1 to 0 select the first rows
        </label>
        <label class="checkbox">
            <input type="checkbox" bind:checked={saved.seat} disabled={saved.testControls === "auto"} />
            Add a seat
        </label>

        <details>
            <summary>Blueprint details</summary>
            <div class="fields">
                <label>Name <input type="text" bind:value={saved.name} /></label>
                <label>Creator (optional) <input type="text" bind:value={saved.creator} /></label>
                <label>Steam ID (optional) <input type="text" inputmode="numeric" bind:value={saved.steamId} /></label>
                <small>Only stored inside the file, the game shows the creator in its blueprint list. Leave empty to stay anonymous.</small>
            </div>
        </details>

        {#if problem}
            <p class="error">{problem}</p>
        {:else if result}
            <p class="stats">
                {result.stats.blocks} blocks ({counts})<br />
                {result.stats.width} × {result.stats.depth} cells, {result.stats.across} instruction{result.stats.across > 1 ? "s" : ""} side by side, PC step {result.stats.pcScale}
            </p>
            {#each result.warnings as warning}
                <p class="warning">⚠ {warning}</p>
            {/each}
            <canvas
                bind:this={canvas}
                width="512"
                height="512"
                aria-label="Top view of the blueprint"
                onmousemove={onMove}
                onmouseleave={() => (hover = "")}
            ></canvas>
            <p class="hover">{hover || "Hover over the picture to see what a block does."}</p>
            <p class="legend">
                {#each legend as [colour, name]}
                    <span><i style:background={colour}></i>{name}</span>
                {/each}
            </p>
            <button onclick={download} disabled={busy}>{busy ? "Making…" : "Download blueprint (.png)"}</button>
            {#if downloadError}
                <p class="error">{downloadError}</p>
            {/if}
        {/if}
    {/if}
</article>

<style>
    article {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        font-size: 14px;
    }
    .help {
        margin: 2px 0 4px;
        font-size: 13px;
        color: var(--muted);
    }
    label {
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
    input:not([type="checkbox"]),
    select,
    button {
        font-size: 14px;
    }
    small {
        font-size: 12px;
        color: var(--muted);
        opacity: 0.85;
    }
    summary {
        cursor: pointer;
        font-weight: 600;
        padding: 4px 0;
    }
    .fields {
        display: grid;
        gap: 8px;
        margin-top: 6px;
    }
    .stats {
        margin: 0;
        font-size: 13px;
    }
    .warning {
        margin: 0;
        padding: 6px 8px;
        font-size: 13px;
        border-left: 3px solid var(--code2);
        background: var(--bg);
    }
    .hover {
        margin: 0;
        min-height: 2.6em;
        font-size: 13px;
    }
    .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        margin: 0;
        font-size: 12px;
        color: var(--muted);
    }
    .legend i {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-right: 5px;
        border-radius: 2px;
    }
    canvas {
        width: 100%;
        aspect-ratio: 1;
        border: 1px solid var(--line);
        border-radius: 5px;
        cursor: crosshair;
    }
</style>
