import type { Widget, WidgetSizeConfig } from "@core/contracts";
import { ATTRIBUTE_VALUE_VIEWER_WIDGET_ID } from "@core/common/attribute-value";
import icon from "@core/ui/icons/photo.svg";
import { mediaViewerTranslations } from "./locale";
import MediaViewerComponent from "./components/Widget";
import type { MediaViewerWidgetProps } from "./types";

/**
 * Opens at the full grid — a value view wants the whole workspace — with
 * a floor that keeps manual shrinking useful.
 */
const SIZE: WidgetSizeConfig = {
    defaultWidth: 80,
    defaultHeight: 45,
    minWidth: 24,
    minHeight: 12,
    maxWidth: 80,
    maxHeight: 45,
};

/** The attribute value viewer: a grid window over the open value view. */
export class MediaViewerWidget implements Widget<MediaViewerWidgetProps> {
    readonly id = ATTRIBUTE_VALUE_VIEWER_WIDGET_ID;
    readonly icon = icon;
    readonly component = MediaViewerComponent;
    readonly localeTranslations = mediaViewerTranslations;
    readonly size = SIZE;
    readonly showInSidebar = false;
}

export default MediaViewerWidget;
export type { MediaViewerWidgetProps } from "./types";
