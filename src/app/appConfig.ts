/**
 * Assembly configuration of this deployment — the build-time choices a
 * geoportal is composed from. The base registers extensions; this
 * file decides how they are assembled.
 */
export interface AppConfig {
    /**
     * Source type served when no type is named — must match a registered
     * source adapter. A missing value fails initialization visibly: an empty
     * tree must be a source's answer, never a wiring accident.
     */
    readonly defaultSourceType?: string;
}

export const appConfig: AppConfig = {
    defaultSourceType: "stac",
};
