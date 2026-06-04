export async function checkBasemapHealth(
    tileUrl: string,
    timeoutMs: number = 3000,
): Promise<boolean> {
    const previewUrl = tileUrl
        .replace(/{z}/g, "0")
        .replace(/{x}/g, "0")
        .replace(/{y}/g, "0");

    return new Promise<boolean>((resolve) => {
        const img = new window.Image();
        const timer = setTimeout(() => {
            img.src = "";
            resolve(false);
        }, timeoutMs);

        img.onload = () => {
            clearTimeout(timer);
            resolve(true);
        };

        img.onerror = () => {
            clearTimeout(timer);
            resolve(false);
        };

        img.src = previewUrl;
    });
}
