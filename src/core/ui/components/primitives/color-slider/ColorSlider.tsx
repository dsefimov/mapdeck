import React, { useCallback, useEffect, useRef } from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./ColorSlider.module.css";

export interface ColorSliderProps {
    id: string;
    /** Current color in #RRGGBB format */
    value: string;
    onChange: (color: string) => void;
    /** Slider aria-name */
    label: string;
    className?: string;
}

/** Hue → #RRGGBB (s=1, l=0.5) */
export function hueToHex(hue: number): string {
    const h = hue / 360;
    const s = 1;
    const l = 0.5;

    const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** #RRGGBB → hue (0..360) */
export function hexToHue(hex: string): number {
    const clean = hex.replace("#", "");
    if (clean.length !== 6) return 0;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (delta === 0) return 0;
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    return Math.round(hue * 60 + (hue < 0 ? 360 : 0));
}

/**
 * Hue gradient bar with a draggable thumb.
 */
export const ColorSlider: (props: ColorSliderProps) => React.ReactNode = ({
    id,
    value,
    onChange,
    label,
    className,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);

        for (let i = 0; i <= 360; i += 30) {
            gradient.addColorStop(i / 360, hueToHex(i));
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }, []);

    const handlePointerDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const pick = (clientX: number): void => {
                const rect = canvas.getBoundingClientRect();
                const x = Math.max(
                    0,
                    Math.min(clientX - rect.left, rect.width),
                );
                const hue = Math.round((x / rect.width) * 360);
                onChange(hueToHex(hue));
            };

            pick(e.clientX);

            const onMove = (ev: MouseEvent): void => pick(ev.clientX);
            const onUp = (): void => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [onChange],
    );

    const currentHue = hexToHue(value);
    const thumbPercent = (currentHue / 360) * 100;

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLCanvasElement>) => {
            const step = e.shiftKey ? 30 : 5;
            switch (e.key) {
                case "ArrowLeft":
                    e.preventDefault();
                    onChange(hueToHex(Math.max(0, currentHue - step)));
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    onChange(hueToHex(Math.min(360, currentHue + step)));
                    break;
                case "Home":
                    e.preventDefault();
                    onChange(hueToHex(0));
                    break;
                case "End":
                    e.preventDefault();
                    onChange(hueToHex(360));
                    break;
                default:
                    break;
            }
        },
        [currentHue, onChange],
    );

    return (
        <div className={cn(styles.wrapper, className)}>
            <canvas
                ref={canvasRef}
                id={id}
                className={styles.canvas}
                onMouseDown={handlePointerDown}
                onKeyDown={handleKeyDown}
                role="slider"
                tabIndex={0}
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={currentHue}
            />
            <div
                className={styles.thumb}
                style={{ left: `${thumbPercent}%` }}
            />
        </div>
    );
};

export default ColorSlider;
