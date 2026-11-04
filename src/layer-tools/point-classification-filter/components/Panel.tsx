import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import {
    isLayerNode,
    findPointCloudDataAdapter,
    classificationColor,
    POINT_CLOUD_INCOMING_SUFFIX,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { typedDict } from "@core/lib/text";
import { CheckboxInput, EmptyState, Field, Text } from "@core/ui/components";
import { setHiddenClassifications } from "@core/domain/layer-tree";
import type { PointClassificationFilterLocaleKey } from "../locale";
import { POINT_CLASSIFICATION_FILTER_ID } from "./Tool";
import styles from "./Panel.module.css";

export interface PointClassificationFilterProps {
    nodeId: string;
}

/** A trusted LAS classification code: an integer in the 0–255 byte range. */
function isClassificationCode(code: unknown): code is number {
    return (
        typeof code === "number" &&
        Number.isInteger(code) &&
        code >= 0 &&
        code <= 255
    );
}

/**
 * Reads the hidden LAS classification codes off the style metadata.
 * Unvalidated metadata: only a list of integer codes in the LAS range is
 * trusted; anything else reads as "nothing hidden".
 */
function readHiddenCodes(value: unknown): number[] {
    return Array.isArray(value) ? value.filter(isClassificationCode) : [];
}

export const PointClassificationFilterComponent: (
    props: PointClassificationFilterProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = typedDict<PointClassificationFilterLocaleKey>(
        rootStore.localeStore.t(POINT_CLASSIFICATION_FILTER_ID),
    );
    const node = rootStore.treeStore.node(nodeId);

    // Hooks run before the node guard: the early return below must not
    // sit between them.
    const adapter = findPointCloudDataAdapter(
        rootStore.protocolRegistry,
        nodeId,
    );
    const base = adapter?.getLoadedData(nodeId);
    const incoming = adapter?.getLoadedData(
        nodeId + POINT_CLOUD_INCOMING_SUFFIX,
    );

    // The style object is replaced on every update (immutable mutators),
    // so its identity is the memo's freshness signal.
    const style = node && isLayerNode(node) ? node.style : undefined;
    const hidden = useMemo(
        () => readHiddenCodes(style?.metadata?.hiddenClassifications),
        [style],
    );

    // Classes present in the streamed cloud — a new envelope object means
    // a new commit, the only moment the set can have grown.
    const loadedCodes = useMemo(() => {
        const codes = new Set<number>();
        for (const part of [base, incoming]) {
            if (!part?.classifications) continue;
            const { classifications, pointCount } = part;
            for (let i = 0; i < pointCount; i++) {
                codes.add(classifications[i]!);
            }
        }
        return codes;
    }, [base, incoming]);

    // The streamed cloud lives outside MobX: envelopes swap on every
    // commit, but no observable changes with them. Poll — fast while the
    // list is empty, slow once classes landed (a rare class can still
    // arrive with a later LOD level); any style change refreshes the
    // list immediately on its own.
    const listEmpty = loadedCodes.size === 0;
    const [, setStreamTick] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(
            () => setStreamTick((t) => t + 1),
            listEmpty ? 1000 : 3000,
        );
        return () => window.clearInterval(timer);
    }, [listEmpty]);

    // Hidden codes stay listed: once dropped from the packed bytes they
    // exist nowhere in the data — the style alone keeps their rows alive.
    const codes = useMemo(() => {
        const merged = new Set(loadedCodes);
        for (const code of hidden) merged.add(code);
        return [...merged].sort((a, b) => a - b);
    }, [loadedCodes, hidden]);

    if (!node || !isLayerNode(node)) {
        logger.warn(
            `PointClassificationFilter: node ${nodeId} is not a layer`,
        );
        return null;
    }

    const labelForClass = (code: number): string => {
        const key = `class.${code}`;
        if (key in dict) {
            return dict[key as PointClassificationFilterLocaleKey];
        }
        // A partial locale dict may miss even this key — degrade, never crash.
        return (
            dict["label.fallbackClass"]?.replace("{code}", String(code)) ??
            `Class ${code}`
        );
    };

    const handleToggle = (code: number, checked: boolean) => {
        const next = checked
            ? hidden.filter((c) => c !== code)
            : [...hidden, code];
        rootStore.treeStore.updateLayerStyle(
            nodeId,
            setHiddenClassifications(node.style ?? {}, next),
        );
    };

    if (codes.length === 0) {
        return (
            <EmptyState
                message={dict["empty.noData"]}
                className={styles.empty ?? ""}
            />
        );
    }

    const firstCheckboxId = `point-class-${nodeId}-${codes[0]}`;

    return (
        <Field label={dict["label.classes"]} htmlFor={firstCheckboxId}>
            <ul className={styles.list} aria-label={dict["label.classes"]}>
                {codes.map((code) => {
                    const checkboxId = `point-class-${nodeId}-${code}`;
                    const [r, g, b] = classificationColor(code);
                    return (
                        <li key={code} className={styles.row}>
                            <span
                                className={styles.swatch}
                                style={{
                                    backgroundColor: `rgb(${r}, ${g}, ${b})`,
                                }}
                                aria-hidden="true"
                            />
                            <label
                                className={styles.rowLabel}
                                htmlFor={checkboxId}
                            >
                                <Text variant="body" truncate>
                                    {labelForClass(code)}
                                </Text>
                            </label>
                            <CheckboxInput
                                id={checkboxId}
                                checked={!hidden.includes(code)}
                                onChange={(checked) =>
                                    handleToggle(code, checked)
                                }
                            />
                        </li>
                    );
                })}
            </ul>
        </Field>
    );
});

export default PointClassificationFilterComponent;
