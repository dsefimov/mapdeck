/** Registration modifiers — the explicit replacement escape hatch. */
export interface RegisterOptions {
    /** Replace an existing entry with the same id (logs a warning). */
    override?: boolean;
}
