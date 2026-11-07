import React, { useState } from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./NumberInput.module.css";

export interface NumberInputProps {
    id: string;
    value: number;
    min?: number | undefined;
    max?: number | undefined;
    step?: number | undefined;
    onChange: (value: number) => void;
    disabled?: boolean;
    /** Accessible name for the input when there is no visible label */
    ariaLabel?: string;
    className?: string | undefined;
}

/** `Number("")` is 0 — an empty buffer must parse to null instead. */
const parseDraft = (draft: string): number | null =>
    draft === "" ? null : Number(draft);

/**
 * Controlled number field with an editing draft: the field can be cleared
 * and mid-edit text (`"1e"`) is left alone instead of snapping to `0` —
 * `onChange` fires only on a complete, finite input. `min`/`max`/`step`
 * are pass-through hints for the browser's stepper; range validation
 * belongs to the consumer. An external `value` change (store write,
 * settings reset) retires the draft.
 */
export const NumberInput: (props: NumberInputProps) => React.ReactNode = ({
    id,
    value,
    min,
    max,
    step,
    onChange,
    disabled,
    ariaLabel,
    className,
}) => {
    // null — no draft, the committed value is displayed.
    const [draft, setDraft] = useState<string | null>(null);
    // External value changes (store write, settings reset) retire a draft
    // that no longer matches — the render-time adjust pattern (React docs),
    // not an effect.
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        if (draft !== null && parseDraft(draft) !== value) {
            setDraft(null);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === "") {
            // type=number reports "" for incomplete text ("1e"): keep the
            // browser's buffer, commit nothing until it becomes parseable.
            if (!e.target.validity.badInput) setDraft("");
            return;
        }
        setDraft(raw);
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(parsed);
    };

    return (
        <input
            id={id}
            type="number"
            className={cn(styles.input, className)}
            value={draft ?? value}
            min={min}
            max={max}
            step={step ?? 1}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={handleChange}
        />
    );
};
