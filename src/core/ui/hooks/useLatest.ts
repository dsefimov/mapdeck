import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * A ref that always holds the latest `value`. The write happens in a layout
 * effect — never during render — so a discarded render cannot leak the side
 * effect into the committed tree.
 */
export function useLatest<T>(value: T): RefObject<T> {
    const ref = useRef(value);
    useLayoutEffect(() => {
        ref.current = value;
    });
    return ref;
}
