import { prisma } from "../../core/database";
import { fail } from "../../core/http";
import { tokenHash } from "../../core/secrets";
import { access, ceiling } from "./authorization";

export async function subscriptionAccess(token: string) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(token))
		fail(404, "LINK_UNAVAILABLE", "This sharing link is unavailable");

	const row = await prisma.subscription.findUnique({
		where: { tokenHash: tokenHash(token) },
	});

	if (!row || row.revokedAt)
		return fail(
			404,
			"LINK_UNAVAILABLE",
			"This sharing link is unavailable",
		);

	return {
		calendarId: row.calendarId,
		permission: ceiling(
			await access(row.calendarId, row.issuerId),
			row.ceiling,
		),
	};
}
