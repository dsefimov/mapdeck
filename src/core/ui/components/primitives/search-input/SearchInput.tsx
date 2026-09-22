import React from "react";
import { Icon } from "@core/ui/components/primitives/icon/Icon";
import { cn } from "@core/ui/utils/cn";
import styles from "./SearchInput.module.css";

export interface SearchInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    /** Accessible name for the input when there is no visible label */
    ariaLabel?: string;
    className?: string;
}

/**
 * Search input with a search icon on the left. The "refresh" button is a
 * separate IconButton rendered next to the field by the consumer.
 */
export const SearchInput: (props: SearchInputProps) => React.ReactNode = ({
    id,
    value,
    onChange,
    placeholder,
    disabled,
    ariaLabel,
    className,
}) => {
    return (
        <div className={cn(styles.wrapper, className)}>
            <Icon
                name="search"
                {...(styles.searchIcon && { className: styles.searchIcon })}
            />
            <input
                id={id}
                type="text"
                className={styles.input}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                aria-label={ariaLabel}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
};

export default SearchInput;
