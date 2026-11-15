/**
 * Simple template interpolation for translation strings.
 *
 * Replaces `{placeholder}` tokens with values from `params` — own
 * properties only, never the prototype chain. Missing params are left
 * as-is in the output.
 *
 * Example:
 *   interpolate("Vertex {from} → {to}", { from: 1, to: 2 })
 *   // => "Vertex 1 → 2"
 */
export function interpolate(
    template: string,
    params: Record<string, string | number>,
): string {
    return template.replace(
        /\{(\w+)\}/g,
        (match, key: string) =>
            Object.hasOwn(params, key) ? String(params[key]) : match,
    );
}
