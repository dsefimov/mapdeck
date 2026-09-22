/**
 * Simple template interpolation for translation strings.
 *
 * Replaces `{placeholder}` tokens with values from `params`.
 * Missing params are left as-is in the output.
 *
 * Example:
 *   formatDict("Vertex {from} → {to}", { from: 1, to: 2 })
 *   // => "Vertex 1 → 2"
 */
export function formatDict(
    template: string,
    params: Record<string, string | number>,
): string {
    return template.replace(
        /\{(\w+)\}/g,
        (_match, key: string) => String(params[key] ?? `{${key}}`),
    );
}
