import { makeAutoObservable } from "mobx";
import type { FeatureGroup } from "@core/contracts";

/**
 * Observable results of a feature-info session. Lives in the state
 * container keyed by tool id, so results survive deactivate → activate.
 */
export class FeatureInfoStore {
    groups: FeatureGroup[] = [];
    selectedIndex = 0;
    loading = false;
    hasClicked = false;

    constructor() {
        makeAutoObservable(this);
    }

    /** New collection results clamp the selection back into range. */
    setGroups(groups: FeatureGroup[]): void {
        this.groups = groups;
        if (this.selectedIndex >= groups.length) this.selectedIndex = 0;
    }

    setSelectedIndex(index: number): void {
        this.selectedIndex = index;
    }

    setLoading(loading: boolean): void {
        this.loading = loading;
    }

    /** A map click opened a new session: previous results are dropped. */
    markClicked(): void {
        this.hasClicked = true;
        this.selectedIndex = 0;
    }
}
