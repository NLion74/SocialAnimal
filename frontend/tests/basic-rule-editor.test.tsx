import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BasicRuleEditor from "../features/permissions/BasicRuleEditor";
import type { BasicFilters } from "../features/permissions/basic-rules";

function Editor() {
	const [value, setValue] = useState<BasicFilters>({});
	return <BasicRuleEditor value={value} onChange={setValue} />;
}

describe("Basic filter controls", () => {
	it("offers only essential filters, once each, and weekday buttons", () => {
		render(<Editor />);
		expect(screen.queryByText("regex")).toBeNull();
		fireEvent.change(screen.getByLabelText("Add a filter"), {
			target: { value: "days" },
		});
		expect(screen.getByRole("alert").textContent).toContain(
			"Choose at least one weekday",
		);
		fireEvent.click(screen.getByRole("button", { name: "monday" }));
		fireEvent.click(screen.getByRole("button", { name: "friday" }));
		expect(screen.queryByRole("alert")).toBeNull();
		expect(
			screen
				.getByRole("button", { name: "monday" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.queryByRole("option", { name: "Weekdays" })).toBeNull();
		fireEvent.click(
			screen.getByRole("button", { name: "Remove weekdays filter" }),
		);
		expect(screen.getByRole("option", { name: "Weekdays" })).toBeTruthy();
	});

	it("limits text matching to is and contains and explains incomplete values", () => {
		render(<Editor />);
		fireEvent.change(screen.getByLabelText("Add a filter"), {
			target: { value: "description" },
		});
		expect(screen.getByRole("alert").textContent).toContain(
			"Enter the description",
		);
		expect(
			Array.from(
				(screen.getByLabelText("Match") as HTMLSelectElement).options,
			).map((option) => option.text),
		).toEqual(["is", "contains"]);
		fireEvent.change(
			screen.getByLabelText("Description", { exact: true }),
			{ target: { value: "Private" } },
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
