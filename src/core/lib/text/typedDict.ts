/**
 * Compile-checked view over a string dictionary.
 *
 * The single sanctioned place where a plain `Record<string, string>` is
 * trusted to carry every key of `Key`: dictionaries are authored as one
 * complete literal (the en locale), so the trust is structural, not
 * speculative. With the view in hand, a typo or missing key at a lookup
 * site is a compile error instead of a runtime `undefined`.
 */
export function typedDict<Key extends string>(
    dict: Record<string, string>,
): Record<Key, string> {
    return dict as Record<Key, string>;
}
