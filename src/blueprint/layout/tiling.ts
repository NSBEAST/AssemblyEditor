// Instructions are put in a grid of "cells" so the build comes out roughly square instead of one long strip.

// where instruction r goes when `across` instructions sit side by side
export function cellOf(r: number, across: number) {
    return { column: r % across, row: Math.floor(r / across) };
}

// how many instructions go side by side. The build is cellWidth * across wide (at least minWidth) and
// ceil(count / across) * cellHeight + extraHeight tall, the best choice makes those two closest.
export function chooseAcross(count: number, cellWidth: number, cellHeight: number, extraHeight: number, minWidth: number): number {
    let best = 1;
    let bestScore = Infinity;
    for (let across = 1; across <= Math.max(1, count); across++) {
        const width = Math.max(across * cellWidth, minWidth);
        const height = Math.ceil(count / across) * cellHeight + extraHeight;
        const score = Math.abs(width - height);
        if (score < bestScore) {
            best = across;
            bestScore = score;
        }
    }
    return best;
}
