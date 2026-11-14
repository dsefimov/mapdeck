import { createContext, useContext } from "react";

/**
 * Aria wiring a `Field` provides to the control rendered as its child:
 * the ids of the hint/error texts (for `aria-describedby`), whether the
 * field is in the error state (for `aria-invalid`), and whether the Field
 * already renders the visible label (a control with its own label skips
 * it to avoid duplication). Inputs consume it opportunistically — outside
 * a Field the context is absent and nothing is attached.
 */
export interface FieldAria {
    describedBy: string | undefined;
    invalid: boolean;
    labelled: boolean;
}

export const FieldContext = createContext<FieldAria | undefined>(undefined);

export function useFieldAria(): FieldAria {
    return (
        useContext(FieldContext) ?? {
            describedBy: undefined,
            invalid: false,
            labelled: false,
        }
    );
}
