import { fail, type PageQuery } from "./index";

// Page after authorization: never expose hidden record IDs or empty continuation pages.
export async function visiblePage<
	T extends { id: string },
	U extends { id: string },
>(
	{ limit = 100, cursor }: PageQuery,
	load: (after: string | undefined, take: number) => Promise<T[]>,
	filter: (rows: T[]) => Promise<U[]>,
) {
	const items: U[] = [];
	let after = cursor;

	for (let scanned = 0; scanned < 10000; scanned += 250) {
		const rows = await load(after, 250);
		items.push(...(await filter(rows)));

		if (items.length > limit)
			return {
				items: items.slice(0, limit),
				nextCursor: items[limit - 1].id,
			};

		if (rows.length < 250) return { items, nextCursor: null };
		after = rows.at(-1)!.id;
	}

	return fail(
		422,
		"INTERVAL_TOO_DENSE",
		"Too many events to evaluate. Choose a shorter date interval.",
	);
}
