import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@core/ui/components/primitives/icon/Icon";
import { Text } from "@core/ui/components/primitives/text/Text";
import { useClickOutside } from "@core/ui/hooks/useClickOutside";
import { cn } from "@core/ui/utils/cn";
import styles from "./SelectInput.module.css";

export interface SelectOption {
    label: string;
    value: string;
}

export interface SelectGroup {
    label: string;
    options: SelectOption[];
}

interface SelectItem {
    value: string;
    label: string;
    groupLabel?: string;
}

export interface SelectInputProps {
    id: string;
    value: string;
    /** Flat options (no groups) */
    options?: SelectOption[];
    /** Grouped options (rendered with group labels) */
    groups?: SelectGroup[];
    /** Text shown when no value is selected (color --color-text-secondary) */
    placeholder?: string;
    /** Text shown when the option list is empty */
    emptyText?: string;
    disabled?: boolean;
    /** Accessible name for the trigger when there is no visible label */
    ariaLabel?: string;
    onChange: (value: string) => void;
    className?: string;
}

/** Panel offset from the trigger, px */
const PANEL_OFFSET = 4;

const DEFAULT_EMPTY_TEXT = "No options";

/**
 * id the trigger's aria-activedescendant points at — the currently
 * highlighted option, only while an open panel has options to show.
 */
function activeDescendantId(
    id: string,
    open: boolean,
    itemCount: number,
    highlight: number,
): string | undefined {
    return open && itemCount > 0 ? `${id}-option-${highlight}` : undefined;
}

/** One flat item with its index — the keyboard model stays flat. */
interface OptionEntry {
    item: SelectItem;
    index: number;
}

/** Consecutive items sharing a groupLabel render as one labeled group. */
interface ListSection {
    label?: string | undefined;
    entries: OptionEntry[];
}

/**
 * Groups flat items into renderable sections: a run of options with the
 * same groupLabel becomes one `[role="group"]`, unlabeled runs stay direct
 * children of the listbox.
 */
function buildSections(items: SelectItem[]): ListSection[] {
    const sections: ListSection[] = [];
    items.forEach((item, index) => {
        const last = sections[sections.length - 1];
        if (last && last.label === item.groupLabel) {
            last.entries.push({ item, index });
        } else {
            sections.push({
                label: item.groupLabel,
                entries: [{ item, index }],
            });
        }
    });
    return sections;
}

/**
 * Custom dropdown. The panel opens via a portal, closes on outside
 * click/Escape/Tab, supports arrow-key navigation.
 */
export const SelectInput: (props: SelectInputProps) => React.ReactNode = ({
    id,
    value,
    options,
    groups,
    placeholder,
    emptyText = DEFAULT_EMPTY_TEXT,
    disabled,
    ariaLabel,
    onChange,
    className,
}) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);

    const items = useMemo<SelectItem[]>(() => {
        const flat: SelectItem[] = [];
        for (const group of groups ?? []) {
            for (const option of group.options) {
                flat.push({
                    value: option.value,
                    label: option.label,
                    groupLabel: group.label,
                });
            }
        }
        for (const option of options ?? []) {
            flat.push({ value: option.value, label: option.label });
        }
        return flat;
    }, [groups, options]);

    const selected = items.find((item) => item.value === value);

    const measure = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPosition({
            top: rect.bottom + PANEL_OFFSET,
            left: rect.left,
            width: rect.width,
        });
    }, []);

    const closePanel = useCallback(() => {
        setOpen(false);
    }, []);

    const openPanel = useCallback(() => {
        if (disabled) return;
        measure();
        const index = Math.max(
            0,
            items.findIndex((item) => item.value === value),
        );
        setHighlight(index);
        setOpen(true);
    }, [disabled, items, measure, value]);

    const selectItem = useCallback(
        (item: SelectItem) => {
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

    // Panel position is fixed — close on outside scroll/resize so it does
    // not end up misplaced. The panel's own list scrolls too (max-height +
    // overflow): the wheel and the arrow-key scrollIntoView both land
    // there, and those scrolls must not close it.
    useEffect(() => {
        if (!open) return;
        const close = (event: Event): void => {
            if (
                event.target instanceof Node &&
                panelRef.current?.contains(event.target)
            ) {
                return;
            }
            closePanel();
        };
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return () => {
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [open, closePanel]);

    const optionRefs = useRef(new Map<number, HTMLDivElement>());
    useEffect(() => {
        if (!open) return;
        optionRefs.current
            .get(highlight)
            ?.scrollIntoView({ block: "nearest" });
    }, [open, highlight]);

    const sections = useMemo(() => buildSections(items), [items]);

    const renderOption = ({ item, index }: OptionEntry): React.ReactNode => (
        <div
            key={`${item.groupLabel ?? ""}:${item.value}`}
            role="option"
            id={`${id}-option-${index}`}
            aria-selected={item.value === value}
            data-index={index}
            ref={(el) => {
                if (el) {
                    optionRefs.current.set(index, el);
                } else {
                    optionRefs.current.delete(index);
                }
            }}
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
        if (e.key === "ArrowDown") {
            e.preventDefault();
            navigate(1);
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            navigate(-1);
            return;
        }
        if (e.key === "Home") {
            e.preventDefault();
            setHighlight(0);
            return;
        }
        if (e.key === "End") {
            e.preventDefault();
            setHighlight(Math.max(0, items.length - 1));
            return;
        }
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectHighlighted();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        } else if (e.key === "Tab") {
            // Tab — close without preventDefault, focus moves naturally
            setOpen(false);
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
                aria-activedescendant={activeDescendantId(
                    id,
                    open,
                    items.length,
                    highlight,
                )}
                onClick={() => (open ? setOpen(false) : openPanel())}
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

export default SelectInput;
