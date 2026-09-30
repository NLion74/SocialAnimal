import { prisma } from "../../core/database";
import {
	decrypt,
	encrypt,
	encryptionKey,
	type Credentials,
} from "../../core/secrets";

export async function backfillConnections(batchSize = 100) {
	encryptionKey(); // Fail before modifying even a single row.
	let processed = 0;

	for (;;) {
		const calendars = await prisma.calendar.findMany({
			where: { connectionId: null },
			orderBy: { id: "asc" },
			take: batchSize,
		});

		if (!calendars.length) break;

		for (const calendar of calendars)
			await prisma.$transaction(async (tx) => {
				const config = (calendar.config || {}) as Credentials;

				const credentials = {
					...config,
					...(config.url
						? {}
						: calendar.url
							? { url: calendar.url }
							: {}),
				};

				const remoteId =
					calendar.type === "ics"
						? "feed"
						: config.calendarId ||
							config.calendarPath ||
							config.url ||
							calendar.url ||
							calendar.id;

				const id = `legacy-${calendar.id}`;
				const encrypted = encrypt(credentials);

				if (
					JSON.stringify(decrypt(encrypted)) !==
					JSON.stringify(credentials)
				)
					throw new Error("Credential verification failed");

				const connection = await tx.connection.upsert({
					where: { id },
					create: {
						id,
						userId: calendar.userId,
						name: calendar.name,
						type: calendar.type,
						credentials: encrypted,
					},
					update: {},
				});

				if (
					connection.userId !== calendar.userId ||
					connection.type !== calendar.type ||
					JSON.stringify(decrypt(connection.credentials)) !==
						JSON.stringify(credentials)
				) {
					throw new Error(
						"Existing backfill connection does not match its calendar",
					);
				}

				await tx.calendar.updateMany({
					where: { id: calendar.id, connectionId: null },
					data: {
						connectionId: id,
						remoteId,
						lastAttempt: calendar.lastSync,
					},
				});

				processed++;
			});
	}

	await validateConnections();
	return processed;
}

export async function validateConnections() {
	if (
		await prisma.calendar.count({
			where: { OR: [{ connectionId: null }, { remoteId: null }] },
		})
	)
		throw new Error("Incomplete connection backfill");

	const invalid = await prisma.$queryRaw<
		Array<{ id: string }>
	>`SELECT c.id FROM "Calendar" c JOIN "Connection" x ON x.id = c."connectionId" WHERE c."userId" <> x."userId" OR c.type <> x.type LIMIT 1`;

	if (invalid.length)
		throw new Error("Connection ownership/type validation failed");

	let cursor: string | undefined;

	for (;;) {
		const rows = await prisma.connection.findMany({
			take: 100,
			orderBy: { id: "asc" },
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
		});

		if (!rows.length) break;
		for (const row of rows) decrypt(row.credentials);
		cursor = rows.at(-1)!.id;
	}
}
