// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SelectInput } from "./SelectInput";
import type { SelectGroup } from "./SelectInput";

afterEach(cleanup);

// happy-dom may lack scrollIntoView; the keyboard-navigation effect calls it.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

const LONG_LIST = Array.from({ length: 30 }, (_, i) => ({
    value: `v${i}`,
    label: `Option ${i}`,
}));

const ARROW_DOWN = "{ArrowDown}";

const BETA_1 = "Beta 1";

/** DOM id of the flat option at `index` (SelectInput's own scheme). */
const optionId = (index: number): string => `sel-option-${index}`;

/** aria-activedescendant of the trigger, null when absent. */
function activeDescendantOf(trigger: HTMLElement): string | null {
    return trigger.getAttribute("aria-activedescendant");
}

function renderSelect(
    options = LONG_LIST,
    onChange: (value: string) => void = vi.fn(),
) {
    render(
        <SelectInput
            id="sel"
            value=""
            options={options}
            onChange={onChange}
        />,
    );
    return screen.getByRole("button");
}

async function openPanel(
    user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
    await user.click(screen.getByRole("button"));
    return screen.getByRole("listbox");
}

const GROUPED: SelectGroup[] = [
    {
        label: "Group A",
        options: [
            { value: "a1", label: "Alpha 1" },
            { value: "a2", label: "Alpha 2" },
        ],
    },
    {
        label: "Group B",
        options: [{ value: "b1", label: BETA_1 }],
    },
];

function renderGroupedSelect(
    options = [{ value: "u1", label: "Ungrouped" }],
    onChange: (value: string) => void = vi.fn(),
) {
    render(
        <SelectInput
            id="sel"
            value=""
            groups={GROUPED}
            options={options}
            onChange={onChange}
        />,
    );
    return screen.getByRole("button");
}

describe("SelectInput scroll behaviour", () => {
    it("keeps the panel open when its own list scrolls", async () => {
        const user = userEvent.setup();
        renderSelect();
        const panel = await openPanel(user);

        fireEvent.scroll(panel);

        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes the panel on an outside scroll", async () => {
        const user = userEvent.setup();
        renderSelect();
        await openPanel(user);

        fireEvent.scroll(document.body);

        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("keeps the panel open while arrow keys scroll the highlighted option into view", async () => {
        const user = userEvent.setup();
        const trigger = renderSelect();
        await user.click(trigger);
        trigger.focus();

        for (let i = 0; i < 12; i++) {
            await user.keyboard(ARROW_DOWN);
        }

        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
});

describe("SelectInput regression guards", () => {
    it("closes on Escape", async () => {
        const user = userEvent.setup();
        renderSelect();
        await openPanel(user);

        await user.keyboard("{Escape}");

        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("selects an option, reports it and closes", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderSelect(LONG_LIST, onChange);
        await openPanel(user);

        await user.click(screen.getByRole("option", { name: "Option 5" }));

        expect(onChange).toHaveBeenCalledWith("v5");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
});

describe("SelectInput keyboard focus is exposed to AT", () => {
    it("tracks the highlighted option via aria-activedescendant", async () => {
        const user = userEvent.setup();
        const trigger = renderSelect();
        trigger.focus();

        expect(activeDescendantOf(trigger)).toBeNull();

        await user.keyboard(ARROW_DOWN); // opens + highlights first
        expect(activeDescendantOf(trigger)).toBe(optionId(0));

        await user.keyboard(ARROW_DOWN);
        expect(activeDescendantOf(trigger)).toBe(optionId(1));
        expect(
            document.getElementById(optionId(1)),
        ).toHaveAccessibleName("Option 1");
    });

    it("End jumps to the last option and Home back to the first", async () => {
        const user = userEvent.setup();
        const trigger = renderSelect();
        trigger.focus();

        await user.keyboard(ARROW_DOWN); // open
        await user.keyboard("{End}");
        expect(activeDescendantOf(trigger)).toBe(optionId(29));

        await user.keyboard("{Home}");
        expect(activeDescendantOf(trigger)).toBe(optionId(0));
    });

    it("clears aria-activedescendant when the panel closes", async () => {
        const user = userEvent.setup();
        const trigger = renderSelect();
        trigger.focus();

        await user.keyboard(ARROW_DOWN); // open
        await user.keyboard("{End}");
        await user.keyboard("{Escape}");

        expect(activeDescendantOf(trigger)).toBeNull();
    });
});

describe("SelectInput grouped options", () => {
    it("exposes named groups; ungrouped options stay listbox children", async () => {
        const user = userEvent.setup();
        renderGroupedSelect();
        await openPanel(user);

        const groupA = screen.getByRole("group", { name: "Group A" });
        expect(groupA).toContainElement(
            screen.getByRole("option", { name: "Alpha 2" }),
        );

        const groupB = screen.getByRole("group", { name: "Group B" });
        expect(groupB).toContainElement(
            screen.getByRole("option", { name: BETA_1 }),
        );

        const ungrouped = screen.getByRole("option", { name: "Ungrouped" });
        expect(ungrouped.closest('[role="group"]')).toBeNull();
        expect(ungrouped.closest('[role="listbox"]')).toBe(
            screen.getByRole("listbox"),
        );
    });

    it("keeps the flat keyboard model across group boundaries", async () => {
        const user = userEvent.setup();
        const trigger = renderGroupedSelect();
        trigger.focus();

        await user.keyboard(ARROW_DOWN); // opens + highlights Alpha 1
        expect(activeDescendantOf(trigger)).toBe(optionId(0));

        await user.keyboard(ARROW_DOWN);
        await user.keyboard(ARROW_DOWN); // crosses into Group B
        expect(activeDescendantOf(trigger)).toBe(optionId(2));
        expect(
            document.getElementById(optionId(2)),
        ).toHaveAccessibleName(BETA_1);

        await user.keyboard(ARROW_DOWN); // crosses into the ungrouped run
        expect(
            document.getElementById(activeDescendantOf(trigger) ?? ""),
        ).toHaveAccessibleName("Ungrouped");

        await user.keyboard("{Home}");
        expect(activeDescendantOf(trigger)).toBe(optionId(0));
    });

    it("selects an option from within a group", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        renderGroupedSelect(undefined, onChange);
        await openPanel(user);

        await user.click(screen.getByRole("option", { name: BETA_1 }));

        expect(onChange).toHaveBeenCalledWith("b1");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
});
