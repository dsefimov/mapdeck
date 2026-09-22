import type { RegisteredSetting } from "@core/contracts";

export type ValidationResult =
    | { ok: true; value: string | number | boolean }
    | { ok: false; reason: "type" | "range" | "select" | "notfound" };

/**
 * Validates a value against a registered setting. Checks the declared type
 * first, then number `min`/`max` range, then select `options` membership.
 * On success carries the type-checked value through, so callers never cast.
 * Deterministic and side-effect free — no store or React imports.
 */
export function validateSettingValue(
    setting: RegisteredSetting,
    value: unknown,
): ValidationResult {
    if (!hasValidType(setting, value)) {
        return { ok: false, reason: "type" };
    }

    if (
        setting.type === "number" &&
        typeof value === "number" &&
        isOutOfRange(setting, value)
    ) {
        return { ok: false, reason: "range" };
    }

    if (
        setting.type === "select" &&
        typeof value === "string" &&
        !isAllowedOption(setting, value)
    ) {
        return { ok: false, reason: "select" };
    }

    return { ok: true, value };
}

/** Whether the runtime type of the value matches the declared one. */
function hasValidType(
    setting: RegisteredSetting,
    value: unknown,
): value is string | number | boolean {
    switch (setting.type) {
        case "string":
        case "select":
            return typeof value === "string";
        case "number":
            return typeof value === "number" && !Number.isNaN(value);
        case "boolean":
            return typeof value === "boolean";
    }
}

function isOutOfRange(
    setting: Extract<RegisteredSetting, { type: "number" }>,
    value: number,
): boolean {
    return (
        (setting.min !== undefined && value < setting.min) ||
        (setting.max !== undefined && value > setting.max)
    );
}

function isAllowedOption(
    setting: Extract<RegisteredSetting, { type: "select" }>,
    value: string,
): boolean {
    return (
        setting.options.length === 0 ||
        setting.options.some((o) => o.value === value)
    );
}
