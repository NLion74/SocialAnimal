import { it, expect } from "vitest";
import { ceiling, maskEvent } from "../../../src/modules/sharing/authorization";

it("applies the stricter permission to API and feed event fields", () => {
	const event = { title: "Private", description: "Notes", location: "Room" };
	expect(maskEvent(event, "full")).toEqual(event);

	expect(maskEvent(event, "titles")).toEqual({
		title: "Private",
		description: null,
		location: null,
	});

	expect(maskEvent(event, ceiling("full", "busy"))).toEqual({
		title: "Busy",
		description: null,
		location: null,
	});

	expect(ceiling("titles", "full")).toBe("titles");
});
