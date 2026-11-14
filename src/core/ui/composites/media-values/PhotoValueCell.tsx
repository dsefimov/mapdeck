import type { ReactNode } from "react";
import { interpolate, typedDict } from "@core/lib/text";
import type { Dictionary } from "../../types";
import type { MediaValueKey, PhotoValueItem } from "./types";
import styles from "./PhotoValueCell.module.css";

export interface PhotoValueCellProps {
    photo: PhotoValueItem;
    /** Accessible name; defaults to the photo's title. */
    name?: string | undefined;
    /** Photo count of the album this preview stands for; absent for one photo. */
    count?: number;
    dict: Dictionary;
    onOpen: () => void;
}

/**
 * The table's virtualization assumes uniform rows — the preview must
 * never grow the row.
 */
export const PhotoValueCell: (props: PhotoValueCellProps) => ReactNode = ({
    photo,
    name,
    count,
    dict,
    onOpen,
}) => {
    const labels = typedDict<MediaValueKey>(dict);
    const label =
        name ??
        photo.title ??
        labels[count !== undefined ? "mediaValue.album" : "mediaValue.photo"];
    const ariaLabel =
        count !== undefined
            ? `${label} (${interpolate(labels["mediaValue.photoCount"], { count: String(count) })})`
            : label;

    return (
        <button
            type="button"
            className={styles.cell}
            aria-label={ariaLabel}
            title={labels["mediaValue.expand"]}
            onClick={onOpen}
        >
            <img
                className={styles.thumbnail}
                src={photo.thumbnailUrl ?? photo.url}
                alt=""
                loading="lazy"
            />
            {count !== undefined && count > 1 && (
                <span className={styles.badge} aria-hidden="true">
                    {count}
                </span>
            )}
        </button>
    );
};
