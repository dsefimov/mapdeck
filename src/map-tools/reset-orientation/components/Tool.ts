import { MAP_TOOL_KIND } from "@core/contracts";
import type { ActionMapTool, ActionToolInvocation } from "@core/contracts";
import { resetOrientationTranslations } from "../locale";

export const RESET_ORIENTATION_TOOL_ID = "reset-orientation" as const;

/** One visible swing to north — long enough to read, short enough to feel instant. */
const ORIENTATION_RESET_DURATION_MS = 500;

/**
 * Map tool that resets camera orientation (pitch to 0) and rotates to north (bearing to 0)
 * This is an action tool - it executes on click without affecting other active tools
 */
export class ResetOrientationTool implements ActionMapTool {
    readonly id = RESET_ORIENTATION_TOOL_ID;
    readonly icon = "compass";
    readonly kind = MAP_TOOL_KIND.action;
    readonly localeTranslations = resetOrientationTranslations;

    execute({ map }: ActionToolInvocation): void {
        map.easeTo({
            pitch: 0,
            bearing: 0,
            duration: ORIENTATION_RESET_DURATION_MS,
        });
    }
}
