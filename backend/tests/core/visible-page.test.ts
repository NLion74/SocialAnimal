import { describe, expect, it } from "vitest";
import { visiblePage } from "../../src/core/http/visible-page";

describe("Authorized pagination", () => {
	it("fills pages across hidden rows without exposing hidden IDs as cursors", async () => {
		const rows = Array.from({ length: 600 }, (_, index) => ({
			id: String(index).padStart(4, "0"),
			visible: index % 200 === 0,
		}));

		const load = async (after: string | undefined, take: number) =>
			rows.filter((row) => !after || row.id > after).slice(0, take);

		const filter = async (values: typeof rows) =>
			values.filter((row) => row.visible);

		const first = await visiblePage({ limit: 2 }, load, filter);
		expect(first.items.map((row) => row.id)).toEqual(["0000", "0200"]);
		expect(first.nextCursor).toBe("0200");

		const next = await visiblePage(
			{ limit: 2, cursor: first.nextCursor! },
			load,
			filter,
		);

		expect(next.items.map((row) => row.id)).toEqual(["0400"]);
		expect(next.nextCursor).toBeNull();

		expect(await visiblePage({}, load, async () => [])).toEqual({
			items: [],
			nextCursor: null,
		});
	});
});
