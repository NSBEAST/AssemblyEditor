<script lang="ts">
    import type { Isa } from "./core/isa";

    let { isa }: { isa: Isa } = $props();

    // svelte-ignore state_referenced_locally
    let draft = $state(structuredClone(isa));
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
