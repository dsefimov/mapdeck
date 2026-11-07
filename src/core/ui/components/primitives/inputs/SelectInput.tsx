import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { typedDict } from "@core/lib/text";
import { Icon } from "@core/ui/components/primitives/icon/Icon";
import { Text } from "@core/ui/components/primitives/text/Text";
import { useClickOutside } from "@core/ui/hooks/useClickOutside";
import { cn } from "@core/ui/utils/cn";
import {
    activeDescendantId,
    buildSections,
    optionDomId,
    type OptionEntry,
    type SelectOption,
} from "./selectModel";
import { useSelectPanel } from "./useSelectPanel";
import styles from "./SelectInput.module.css";

export type { SelectOption } from "./selectModel";

export interface SelectInputProps {
    id: string;
    value: string;
    options: SelectOption[];
    /** Text shown when no value is selected (color --color-text-secondary) */
    placeholder?: string;
    disabled?: boolean;
    /** Accessible name for the trigger when there is no visible label */
    ariaLabel?: string;
    /** Core dictionary carrying `select.noOptions` */
    dict: Record<string, string>;
    onChange: (value: string) => void;
    className?: string;
}

/**
 * Custom dropdown. The panel opens via a portal, closes on outside
 * click/Escape/Tab, supports arrow-key navigation.
 */
export const SelectInput: (props: SelectInputProps) => React.ReactNode = ({
    id,
    value,
    options: items,
    placeholder,
    disabled,
    ariaLabel,
    dict,
    onChange,
    className,
}) => {
    const emptyText = typedDict<"select.noOptions">(dict)[
        "select.noOptions"
    ];
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);

    const closePanel = useCallback(() => {
        setOpen(false);
    }, []);

    const { triggerRef, panelRef, position } = useSelectPanel(open, closePanel);

    const selected = items.find((item) => item.value === value);

    const openPanel = useCallback(() => {
        if (disabled) return;
        const index = Math.max(
            0,
            items.findIndex((item) => item.value === value),
        );
        setHighlight(index);
        setOpen(true);
    }, [disabled, items, value]);

    const selectItem = useCallback(
        (item: SelectOption) => {
            onChange(item.value);
            setOpen(false);
        },
        [onChange],
    );

    // The trigger is part of the control: without it in the watch list a
    // mousedown on the open trigger would close via "outside" and the
    // ensuing click would immediately reopen the panel.
    useClickOutside([panelRef, triggerRef], closePanel, open, {
        defer: true,
    });

    useEffect(() => {
        if (!open) return;
        document
            .getElementById(optionDomId(id, highlight))
            ?.scrollIntoView({ block: "nearest" });
    }, [open, highlight, id]);

    const sections = useMemo(() => buildSections(items), [items]);

    const renderOption = ({ item, index }: OptionEntry): React.ReactNode => (
        <div
            key={`${item.group ?? ""}:${item.value}`}
            role="option"
            id={optionDomId(id, index)}
            aria-selected={item.value === value}
            className={cn(
                styles.option,
                index === highlight && styles.highlight,
            )}
            onClick={() => selectItem(item)}
        >
            <Text
                variant="body"
                tone={item.value === value ? "accent" : undefined}
                weight={item.value === value ? "semibold" : undefined}
            >
                {item.label}
            </Text>
        </div>
    );

    const navigate = (direction: 1 | -1): void => {
        setHighlight((h) =>
            items.length === 0
                ? 0
                : (h + direction + items.length) % items.length,
        );
    };

    const selectHighlighted = (): void => {
        const item = items[highlight];
        if (item) selectItem(item);
    };

    const handleClosedKeyDown = (
        e: React.KeyboardEvent<HTMLButtonElement>,
    ): void => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPanel();
        }
    };

    const handleOpenKeyDown = (
        e: React.KeyboardEvent<HTMLButtonElement>,
    ): void => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                navigate(1);
                return;
            case "ArrowUp":
                e.preventDefault();
                navigate(-1);
                return;
            case "Home":
                e.preventDefault();
                setHighlight(0);
                return;
            case "End":
                e.preventDefault();
                setHighlight(Math.max(0, items.length - 1));
                return;
            case "Enter":
            case " ":
                e.preventDefault();
                selectHighlighted();
                return;
            case "Escape":
                e.preventDefault();
                closePanel();
                return;
            case "Tab":
                // Close without preventDefault — focus moves naturally.
                closePanel();
        }
    };

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLButtonElement>,
    ): void => {
        if (disabled) return;
        if (!open) {
            handleClosedKeyDown(e);
            return;
        }
        handleOpenKeyDown(e);
    };

    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                className={cn(styles.trigger, className)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                aria-controls={`${id}-listbox`}
                aria-activedescendant={
                    open
                        ? activeDescendantId(id, items.length, highlight)
                        : undefined
                }
                onClick={() => (open ? closePanel() : openPanel())}
                onKeyDown={handleKeyDown}
            >
                <Text
                    variant="body"
                    truncate
                    className={styles.value}
                    tone={!selected ? "secondary" : undefined}
                >
                    {selected?.label ?? placeholder}
                </Text>
                <span className={styles.chevronArea} aria-hidden="true">
                    <Icon
                        name="angle-down"
                        className={cn(
                            styles.chevron,
                            open && styles.chevronOpen,
                        )}
                    />
                </span>
            </button>
            {open &&
                position &&
                createPortal(
                    <div
                        ref={panelRef}
                        id={`${id}-listbox`}
                        role="listbox"
                        className={styles.panel}
                        style={{
                            top: position.top,
                            left: position.left,
                            width: position.width,
                        }}
                    >
                        {items.length === 0 ? (
                            <Text
                                variant="body"
                                tone="secondary"
                                className={styles.empty}
                            >
                                {emptyText}
                            </Text>
                        ) : (
                            sections.map((section, sectionIndex) =>
                                section.label ? (
                                    <div
                                        key={`${sectionIndex}:${section.label}`}
                                        role="group"
                                        aria-label={section.label}
                                    >
                                        <Text
                                            variant="caption"
                                            className={styles.groupLabel}
                                            ariaHidden
                                        >
                                            {section.label}
                                        </Text>
                                        {section.entries.map(renderOption)}
                                    </div>
                                ) : (
                                    <React.Fragment key={sectionIndex}>
                                        {section.entries.map(renderOption)}
                                    </React.Fragment>
                                ),
                            )
                        )}
                    </div>,
                    document.body,
                )}
        </>
    );
};
