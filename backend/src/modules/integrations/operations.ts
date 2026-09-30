import { prisma } from "../../core/database";
import { decrypt, encrypt, type Credentials } from "../../core/secrets";
import { fail, HttpError } from "../../core/http";
import { registry, type Provider } from "./adapters";

export function capability<K extends Exclude<keyof Provider, "name">>(
	adapter: Provider,
	name: K,
): NonNullable<Provider[K]> {
	const operation = adapter[name];

	if (!operation)
		return fail(
			422,
			"CAPABILITY_UNSUPPORTED",
			`${adapter.name} does not support ${name}`,
		);

	return operation;
}

export function provider(type: string) {
	const adapter = registry[type];

	if (!adapter)
		return fail(
			422,
			"PROVIDER_UNSUPPORTED",
			`Provider ${type} is not supported`,
		);

	return adapter;
}

export async function connectionForUser(id: string, userId: string) {
	const row = await prisma.connection.findFirst({ where: { id, userId } });
	if (!row) return fail(404, "NOT_FOUND", "Connection not found");
	return row;
}

export const publicConnection = (row: {
	id: string;
	type: string;
	name: string;
	credentials: string;
}) => ({
	id: row.id,
	type: row.type,
	name: row.name,
	hasCredentials: !!row.credentials,
});

export async function withProvider<T>(
	id: string,
	userId: string,
	action: (p: ReturnType<typeof provider>, c: Credentials) => Promise<T>,
) {
	const row = await connectionForUser(id, userId);
	const credentials = decrypt(row.credentials);
	const before = JSON.stringify(credentials);
	const adapter = provider(row.type);

	try {
		const result = await action(adapter, credentials);

		if (before !== JSON.stringify(credentials))
			await prisma.connection.updateMany({
				where: { id, credentials: row.credentials },
				data: { credentials: encrypt(credentials) },
			});

		return result;
	} catch (error) {
		if (error instanceof HttpError) throw error;

		const auth =
			error instanceof Error && error.message === "PROVIDER_AUTH_FAILED";

		return fail(
			502,
			auth ? "PROVIDER_AUTH_FAILED" : "PROVIDER_UNAVAILABLE",
			auth
				? "Provider rejected the credentials. Reconnect this account."
				: "Provider request failed. Check the connection and try again.",
		);
	}
}

export async function importCalendar(
	userId: string,
	input: {
		connectionId: string;
		remoteId: string;
		name: string;
		syncInterval?: number;
	},
) {
	const connection = await connectionForUser(input.connectionId, userId);
	capability(provider(connection.type), "fetch");
	// Serialize the identity lookup/create so concurrent requests return the same row.
	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.connectionId + ":" + input.remoteId}))`;

		return tx.calendar.upsert({
			where: {
				connectionId_remoteId: {
					connectionId: input.connectionId,
					remoteId: input.remoteId,
				},
			},
			create: { ...input, userId, type: connection.type },
			update: {},
		});
	});
}
