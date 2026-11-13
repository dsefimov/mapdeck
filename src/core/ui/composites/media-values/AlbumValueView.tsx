import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { typedDict } from "@core/lib/text";
import { Text } from "../../components/primitives/text/Text";
import type { Dictionary } from "../../types";
import { cn } from "../../utils/cn";
import type { AlbumValueItem, MediaValueKey } from "./types";
import { PhotoImage } from "./PhotoValueView";
import styles from "./AlbumValueView.module.css";

export interface AlbumValueViewProps {
    album: AlbumValueItem;
    dict: Dictionary;
}

/**
 * Fullscreen album carousel: the current photograph next to a vertical
 * filmstrip of thumbnails (left). Arrow keys wrap around; the active
 * thumbnail scrolls itself into view.
 */
export const AlbumValueView: (props: AlbumValueViewProps) => ReactNode = ({
    album,
    dict,
}) => {
    const labels = typedDict<MediaValueKey>(dict);
    const [index, setIndex] = useState(0);
    const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const photos = album.photos;
    const total = photos.length;
    const current = photos[index];

    const select = (next: number): void => {
        setIndex(((next % total) + total) % total);
    };

    useEffect(() => {
        thumbRefs.current[index]?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
        });
    }, [index]);

    const handleKeyDown = (
        event: ReactKeyboardEvent<HTMLDivElement>,
    ): void => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            select(index + 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            select(index - 1);
        }
    };

    if (!current) return null;

    return (
        <div className={styles.album} onKeyDown={handleKeyDown}>
            <nav
                className={styles.filmstrip}
                aria-label={album.title ?? labels["mediaValue.album"]}
            >
                {photos.map((photo, i) => (
                    <button
                        key={i}
                        ref={(el) => {
                            thumbRefs.current[i] = el;
                        }}
                        type="button"
                        className={cn(
                            styles.thumb,
                            i === index && styles.active,
                        )}
                        aria-current={i === index ? "true" : undefined}
                        aria-label={photo.title ?? String(i + 1)}
                        onClick={() => select(i)}
                    >
                        <img
                            src={photo.thumbnailUrl ?? photo.url}
                            alt=""
                            loading="lazy"
                        />
                    </button>
                ))}
            </nav>
            <div className={styles.stage}>
                {/* Keyed by index: every switch is a fresh load state. */}
                <PhotoImage key={index} photo={current} dict={dict} />
                <Text variant="body" tone="secondary" className={styles.counter}>
                    {album.title ? `${album.title} · ` : ""}
                    {index + 1} / {total}
                </Text>
            </div>
        </div>
    );
};
