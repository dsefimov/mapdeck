import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import type { RelatedObject } from "@core/contracts";
import { formatDict, typedDict } from "@core/lib/text";
import { Text } from "@core/ui/components";
import { IconButton } from "@core/ui/components/primitives/icon-button/IconButton";
import { openReport, downloadReport } from "../utils";
import type { LayerTreeLocaleKey } from "../locale";
import { LAYER_TREE_ID } from "..";
import styles from "./ReportDownloads.module.css";

export interface ReportDownloadsProps {
    nodeId: string;
}

/**
 * Renders download buttons for all report-type related objects of a node.
 */
export const ReportDownloads: (props: ReportDownloadsProps) => React.ReactNode =
    observer(({ nodeId }) => {
        const rootStore = useRootStore();
        const dict = typedDict<LayerTreeLocaleKey>(
            rootStore.localeStore.t(LAYER_TREE_ID),
        );
        const node = rootStore.treeStore.node(nodeId);

        if (!node) return null;

        const reportObjects: RelatedObject[] = node.relatedObjects.filter(
            (o) => o.type === "report",
        );

        if (reportObjects.length === 0) return null;

        return (
            <div className={styles.reportDownloadsContainer}>
                <Text variant="caption" tone="muted">
                    {dict["label.reports"]}
                </Text>
                <div className={styles.reportButtons}>
                    {reportObjects.map((obj) => (
                        <div key={obj.id} className={styles.reportRow}>
                            <button
                                className={styles.reportButton}
                                onClick={() =>
                                    openReport(obj.sourceUrl ?? "", obj.title)
                                }
                                title={formatDict(dict["aria.openReport"], {
                                    label: obj.title,
                                })}
                            >
                                <Text
                                    variant="body"
                                    truncate
                                    className={styles.reportButtonText}
                                >
                                    {obj.title}
                                </Text>
                            </button>
                            <IconButton
                                icon="file-download"
                                label={formatDict(
                                    dict["aria.downloadReport"],
                                    { label: obj.title },
                                )}
                                onClick={() =>
                                    downloadReport(
                                        obj.sourceUrl ?? "",
                                        obj.title,
                                    )
                                }
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    });

export default ReportDownloads;
