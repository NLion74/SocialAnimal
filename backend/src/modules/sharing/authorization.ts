import type { SharePermission } from "@prisma/client";
import { prisma, type Prisma } from "../../core/database";
import { fail } from "../../core/http";

export const permissionSchema = {
	type: "string",
	enum: ["busy", "titles", "full"],
};

export function visibility(
	userId: string,
	scope: "mine" | "shared" | "all" = "all",
): Prisma.CalendarWhereInput {
	const shared = { shares: { some: { sharedWithId: userId } } };
	if (scope === "mine") return { userId };
	if (scope === "shared") return shared;
	return { OR: [{ userId }, shared] };
}

export function permissionFor(
	calendar: {
		userId: string;
		shares: Array<{ permission: SharePermission }>;
	},
	userId: string,
): SharePermission {
	if (calendar.userId === userId) return "full";

	if (!calendar.shares[0])
		return fail(403, "FORBIDDEN", "Calendar is not shared with you");

	return calendar.shares[0].permission;
}

export async function access(
	calendarId: string,
	userId: string,
	tx: Prisma.TransactionClient = prisma,
): Promise<SharePermission> {
	const calendar = await tx.calendar.findUnique({
		where: { id: calendarId },
		select: {
			userId: true,
			shares: {
				where: { sharedWithId: userId },
				select: { permission: true },
			},
		},
	});

	if (!calendar) return fail(404, "NOT_FOUND", "Calendar not found");
	return permissionFor(calendar, userId);
}

export function ceiling(
	a: SharePermission,
	b: SharePermission,
): SharePermission {
	const levels: SharePermission[] = ["busy", "titles", "full"];
	return levels[Math.min(levels.indexOf(a), levels.indexOf(b))];
}

export function maskEvent<
	T extends {
		title: string;
		description: string | null;
		location: string | null;
	},
>(event: T, permission: SharePermission): T {
	return {
		...event,
		title: permission === "busy" ? "Busy" : event.title,
		description: permission === "full" ? event.description : null,
		location: permission === "full" ? event.location : null,
	};
}

export async function setGrant(
	ownerId: string,
	userId: string,
	calendarId: string,
	permission?: SharePermission,
) {
	return prisma.$transaction(async (tx) => {
		// Shared lock order with friendship deletion prevents a grant surviving removal.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${[ownerId, userId].sort().join(":")}))`;

		const calendar = await tx.calendar.findFirst({
			where: { id: calendarId, userId: ownerId },
		});

		if (!calendar) fail(403, "FORBIDDEN", "Calendar ownership required");

		if (permission) {
			const friendship = await tx.friendship.findFirst({
				where: {
					status: "accepted",
					OR: [
						{ user1Id: ownerId, user2Id: userId },
						{ user1Id: userId, user2Id: ownerId },
					],
				},
			});

			if (!friendship)
				fail(403, "NOT_FRIENDS", "Accepted friendship required");

			await tx.calendarShare.upsert({
				where: {
					calendarId_sharedWithId: {
						calendarId,
						sharedWithId: userId,
					},
				},
				create: { calendarId, sharedWithId: userId, permission },
				update: { permission },
			});
		} else
			await tx.calendarShare.deleteMany({
				where: { calendarId, sharedWithId: userId },
			});
	});
}
