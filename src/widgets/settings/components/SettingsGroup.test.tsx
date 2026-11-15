// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import "@testing-library/jest-dom/vitest";
import { StoreProvider } from "@core/shell";
import { LocaleStore } from "@core/common/locale/LocaleStore";
import { SettingsStore } from "@core/common/settings/SettingsStore";
import type { StoreRegistry } from "@core/store-registry";
import { SETTINGS_ID } from "..";
import { settingsTranslations } from "../locale";
import { SettingsGroupComponent } from "./SettingsGroup";

afterEach(cleanup);

const OWNER = "owner-x";

/** Group view over a real settings store; the widget renders `allSettingsGrouped`. */
function renderGroup(store: SettingsStore) {
    const localeStore = new LocaleStore();
    localeStore.registerTranslations(SETTINGS_ID, settingsTranslations);
    // The real Widget re-reads allSettingsGrouped on each store write —
    // a static prop would hide reset-driven re-renders from the group.
    const Harness = observer(() => {
        const group = store.allSettingsGrouped[0]!;
        return (
            <SettingsGroupComponent
                group={group}
                onChange={store.setSetting}
            />
        );
    });
    render(
        <StoreProvider
            store={
                { settingsStore: store, localeStore } as unknown as StoreRegistry
            }
        >
            <Harness />
        </StoreProvider>,
    );
}

describe("SettingsGroup reset", () => {
    it("a validation error does not outlive resetOwnerSettings", () => {
        const settings = new SettingsStore();
        settings.registerSettings(OWNER, "Owner X", [
            {
                id: "limit",
                label: "Limit",
                type: "number",
                defaultValue: 5,
                min: 0,
                max: 10,
            },
        ]);
        renderGroup(settings);

        const input = screen.getByRole("spinbutton");
        fireEvent.change(input, { target: { value: "99" } }); // out of range
        expect(
            screen.getByText("Value must be between {min} and {max}"),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Reset/i }));

        expect(
            screen.queryByText("Value must be between {min} and {max}"),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("spinbutton")).toHaveValue(5);
    });
});
