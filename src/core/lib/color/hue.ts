import { hexToRgba } from "./hexToRgba";

/** Hue-wheel color as #RRGGBB (s=1, l=0.5) — the pure-wheel rendering of a hue. */
export function hueToHex(hue: number): string {
    const h = hue / 360;

    const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = 1;
    const p = 0;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** RGB channels, each 0..1, → hue 0..360. Grays (r=g=b) read as 0. */
export function rgbToHue(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 0;

    let hue: number;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;

    const degrees = hue * 60;
    return Math.round((degrees + 360) % 360);
}

/** #RGB/#RRGGBB → hue 0..360; invalid input throws via hexToRgba. */
export function hexToHue(hex: string): number {
    const [r, g, b] = hexToRgba(hex);
    return rgbToHue(r / 255, g / 255, b / 255);
}
