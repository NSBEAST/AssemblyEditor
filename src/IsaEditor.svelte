<script lang="ts">
    import { loadIsa, type Isa } from "./core/isa";

    let { isa, onapply}: { isa: Isa, onapply: (data: unknown) => void } = $props();
    let error: string = $state("");

    // svelte-ignore state_referenced_locally
    let draft = $state(structuredClone(isa));

    function apply() {
        error = "";
        try {
            loadIsa(draft);
            onapply($state.snapshot(draft));
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    }

</script>

<article>
    <header><h2>ISA editor</h2></header>
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
            <input type="number" bind:value={draft.firstProgramIndex} />
        </label>
        <label class="checkbox">
            <input type="checkbox" bind:checked={draft.jumpToOneBeforeAddress} />
            Jump to one before jump address
        </label>
    </div>
    <button onclick={apply}>Apply</button>
    {#if error}
        <p class="error">
            {error}
        </p>
    {/if}
</article>

<style>
    article {
        margin-top: 1rem;
    }
    h2 {
        margin: 0;
        font-size: 1.25rem;
    }
    .fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 1rem;
        align-items: end;
    }
    .checkbox {
        grid-column: 1 / -1;
    }
</style>
