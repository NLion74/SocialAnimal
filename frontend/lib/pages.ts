export async function allPages<T>(
	load: (
		cursor?: string,
	) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
	const items: T[] = [];
	let cursor: string | undefined;

	do {
		const result = await load(cursor);
		items.push(...result.items);
		cursor = result.nextCursor || undefined;
	} while (cursor);

	return items;
}
