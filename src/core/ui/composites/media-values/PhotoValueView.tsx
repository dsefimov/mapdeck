import { useState } from "react";
import type { ReactNode } from "react";
import { typedDict } from "@core/lib/text";
import { Text } from "../../components/primitives/text/Text";
import { Spinner } from "../../components/primitives/spinner/Spinner";
import type { Dictionary } from "../../types";
import { cn } from "../../utils/cn";
import type { MediaValueKey, PhotoValueItem } from "./types";
import styles from "./PhotoValueView.module.css";

type LoadState = "loading" | "loaded" | "error";

interface PhotoImageProps {
    photo: PhotoValueItem;
    dict: Dictionary;
}

export const PhotoImage: (props: PhotoImageProps) => ReactNode = ({
    photo,
    dict,
}) => {
    const labels = typedDict<MediaValueKey>(dict);
    const [state, setState] = useState<LoadState>("loading");

    return (
        <figure className={styles.figure}>
            {state === "loading" && (
                <div className={styles.loading} role="status">
                    <Spinner />
                </div>
            )}
            {state === "error" && (
                <div className={styles.error} role="alert">
                    <Text variant="hint" tone="error">
                        {labels["mediaValue.loadError"]}
                    </Text>
                    <Text variant="caption" tone="secondary">
                        {photo.title ?? photo.url}
                    </Text>
                </div>
            )}
            <img
                className={cn(styles.image, state === "loaded" && styles.loaded)}
                src={photo.url}
                alt={photo.title ?? labels["mediaValue.photo"]}
                onLoad={() => setState("loaded")}
                onError={() => setState("error")}
            />
        </figure>
    );
};

export interface PhotoValueViewProps {
    photo: PhotoValueItem;
    dict: Dictionary;
}

/** Single-photo viewer content; the photo's title lives in the window header. */
export const PhotoValueView: (props: PhotoValueViewProps) => ReactNode = ({
    photo,
    dict,
}) => (
    <div className={styles.view}>
        <PhotoImage photo={photo} dict={dict} />
        {photo.description && (
            <Text variant="caption" tone="secondary" className={styles.description}>
                {photo.description}
            </Text>
        )}
    </div>
);
