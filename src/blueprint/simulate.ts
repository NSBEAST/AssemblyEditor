// A float32 model of the logic, to check a build without the game.
import { addF32, f32, mulF32 } from "./floats";
import type { Block } from "./model";

// returns a function that gives the output of any block while the given keys are held
export function simulate(keysHeld: Iterable<number> = []): (block: Block) => number {
    const held = new Set(keysHeld);
    const memo = new Map<Block, number>();

    const output = (block: Block): number => {
        const known = memo.get(block);
        if (known !== undefined) return known;

        let sum = 0;
        for (const source of block.inputs) if (source.type !== "seat") sum = addF32(sum, output(source));

        const p = block.params;
        let result = 0;
        switch (block.type) {
            case "arith":
                result = p.operation === 2 ? mulF32(p.constant ?? 0, sum) : addF32(p.constant ?? 0, sum);
                break;
            case "comp":
                result = p.mode === 2 && sum === f32(p.threshold ?? 0) ? f32(p.output ?? 1) : 0;
                break;
            case "aggr":
            case "disp":
                result = sum;
                break;
            case "or":
                result = p.key !== undefined && held.has(p.key) ? 1 : 0;
                break;
        }
        memo.set(block, result);
        return result;
    };
    return output;
}
