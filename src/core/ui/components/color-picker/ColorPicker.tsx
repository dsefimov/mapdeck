import React, { useRef, useEffect, useState, useCallback } from "react";
import styles from "./ColorPicker.module.css";

export interface ColorPickerProps {
    value: string;
    label: string;
    onChange: (color: string) => void;
}

const HEX_REGEX = /^#?([0-9a-fA-F]{6})$/;

function isValidHex(value: string): boolean {
    return HEX_REGEX.test(value);
}

function formatHex(value: string): string {
    const clean = value.replace("#", "");
    if (clean.length === 6) return `#${clean}`;
    return value;
}

function hueToHex(hue: number): string {
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

function hexToHue(hex: string): number {
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

export const ColorPicker: React.FC<ColorPickerProps> = ({
    value,
    label,
    onChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hexInput, setHexInput] = useState(value);

    useEffect(() => {
        setHexInput(value);
    }, [value]);

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

    const handleHexChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            setHexInput(raw);

            const formatted = formatHex(raw);
            if (isValidHex(formatted)) {
                onChange(formatted);
            }
        },
        [onChange],
    );

    const handleHexBlur = useCallback(() => {
        const formatted = formatHex(hexInput);
        if (isValidHex(formatted)) {
            setHexInput(formatted);
            onChange(formatted);
        } else {
            setHexInput(value);
        }
    }, [hexInput, onChange, value]);

    const currentHue = hexToHue(value);
    const thumbPercent = (currentHue / 360) * 100;

    return (
        <div className={styles.container}>
            <label className={styles.label}>{label}</label>
            <div className={styles.row}>
                <div
                    className={styles.swatch}
                    style={{ backgroundColor: value }}
                />
                <input
                    type="text"
                    className={styles.hexInput}
                    value={hexInput}
                    onChange={handleHexChange}
                    onBlur={handleHexBlur}
                    maxLength={7}
                    placeholder="#000000"
                    aria-label={`${label} hex value`}
                />
            </div>
            <div className={styles.sliderWrapper}>
                <canvas
                    ref={canvasRef}
                    className={styles.hueCanvas}
                    width={200}
                    height={16}
                    onMouseDown={handlePointerDown}
                    role="slider"
                    aria-label={`${label} hue`}
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={currentHue}
                />
                <div
                    className={styles.hueThumb}
                    style={{ left: `${thumbPercent}%` }}
                />
            </div>
        </div>
    );
};
