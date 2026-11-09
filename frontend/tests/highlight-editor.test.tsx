import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import RulesetEditor, {
	VisibilitySelect,
} from "../features/permissions/RulesetEditor";

vi.mock("../features/permissions/api", () => ({
	permissionsApi: { registry: () => new Promise(() => {}) },
}));
vi.mock("../features/permissions/EditorFrame", () => ({
	default: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

it("offers Highlight only in Expert controls", () => {
	const view = render(<VisibilitySelect value="full" onChange={() => {}} />);
	expect(screen.queryByRole("option", { name: /Highlight/ })).toBeNull();
	view.rerender(<VisibilitySelect value="full" onChange={() => {}} expert />);
	expect(screen.getByRole("option", { name: /Highlight/ })).toBeTruthy();
});

it("keeps existing Highlight fallback in Expert mode", () => {
	render(
		<RulesetEditor
			existing={{
				id: "highlight",
				name: "Highlights",
				fallback: "highlight",
				rules: [],
				version: 1,
				seedKey: null,
				updatedAt: "2027-01-01T00:00:00Z",
			}}
			onClose={() => {}}
			onSaved={() => {}}
			onDeleted={() => {}}
		/>,
	);
	expect(
		screen
			.getByRole("button", { name: "Expert" })
			.getAttribute("aria-pressed"),
	).toBe("true");
	expect(
		(
			screen.getByRole("button", {
				name: "Basic",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
});
