import React, { useCallback, useRef } from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./ColorSlider.module.css";

export interface ColorSliderProps {
    id: string;
    /** Hue, 0..360 */
    value: number;
    onChange: (hue: number) => void;
    /** Slider aria-name */
    label: string;
    className?: string;
}

/** Clamp a hue into the 0..360 wheel range. */
const clampHue = (hue: number): number => Math.max(0, Math.min(360, hue));

/**
 * Hue wheel slider: a gradient bar with a draggable thumb, pointer-event
 * driven (mouse and touch alike), keyboard-walkable.
 */
export const ColorSlider: (props: ColorSliderProps) => React.ReactNode = ({
    id,
    value,
    onChange,
    label,
    className,
}) => {
    const trackRef = useRef<HTMLDivElement>(null);

    const pick = useCallback(
        (clientX: number): void => {
            const track = trackRef.current;
            if (!track) return;
            const rect = track.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            onChange(Math.round((x / rect.width) * 360));
        },
        [onChange],
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX);
        },
        [pick],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                pick(e.clientX);
            }
        },
        [pick],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            const step = e.shiftKey ? 30 : 5;
            switch (e.key) {
                case "ArrowLeft":
                case "ArrowDown":
                    e.preventDefault();
                    onChange(clampHue(Math.round(value) - step));
                    break;
                case "ArrowRight":
                case "ArrowUp":
                    e.preventDefault();
                    onChange(clampHue(Math.round(value) + step));
                    break;
                case "Home":
                    e.preventDefault();
                    onChange(0);
                    break;
                case "End":
                    e.preventDefault();
                    onChange(360);
                    break;
                default:
                    break;
            }
        },
        [value, onChange],
    );

    return (
        <div className={cn(styles.wrapper, className)}>
            <div
                ref={trackRef}
                id={id}
                className={styles.track}
                role="slider"
                tabIndex={0}
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(value)}
                aria-valuetext={`${Math.round(value)}°`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onKeyDown={handleKeyDown}
            >
                <div
                    className={styles.thumb}
                    style={
                        {
                            "--pos": `${(value / 360) * 100}%`,
                        } as React.CSSProperties
                    }
                />
            </div>
        </div>
    );
};
