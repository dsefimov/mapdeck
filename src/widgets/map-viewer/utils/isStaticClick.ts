export function isStaticClick(
    start: { x: number; y: number },
    end: { x: number; y: number },
    threshold: number,
): boolean {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
}
