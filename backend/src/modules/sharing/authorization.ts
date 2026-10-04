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
	const shared = {
		shares: {
			some: {
				sharedWithId: userId,
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
			},
		},
	};

	if (scope === "mine") return { userId };
	if (scope === "shared") return shared;
	return { OR: [{ userId }, shared] };
}

export function permissionFor(
	calendar: {
		userId: string;
		shares: Array<{
			permission: SharePermission;
			rulesetId?: string | null;
			expiresAt?: Date | null;
			ruleset?: { fallback: string; rules: unknown } | null;
		}>;
	},
	userId: string,
): SharePermission {
	if (calendar.userId === userId) return "full";

	if (
		!calendar.shares[0] ||
		(calendar.shares[0].expiresAt &&
			calendar.shares[0].expiresAt <= new Date())
	)
		return fail(403, "FORBIDDEN", "Calendar is not shared with you");

	const share = calendar.shares[0];

	if (share.ruleset) {
		const outcomes = [
			share.ruleset.fallback,
			...(share.ruleset.rules as Array<{ visibility: string }>).map(
				(rule) => rule.visibility,
			),
		];

		return outcomes.includes("full")
			? "full"
			: outcomes.includes("titles")
				? "titles"
				: "busy";
	}

	return share.permission;
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
				select: {
					expiresAt: true,
					permission: true,
					rulesetId: true,
					ruleset: { select: { fallback: true, rules: true } },
				},
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
	rulesetId?: string,
	expiresAt?: string | null,
) {
	return prisma.$transaction(async (tx) => {
		if (expiresAt && new Date(expiresAt) <= new Date())
			fail(400, "INVALID_EXPIRATION", "Choose a future expiration");

		// Shared lock order with friendship deletion prevents a grant surviving removal.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${[ownerId, userId].sort().join(":")}))`;

		const calendar = await tx.calendar.findFirst({
			where: { id: calendarId, userId: ownerId },
		});

		if (!calendar) fail(403, "FORBIDDEN", "Calendar ownership required");

		if (rulesetId) {
			const ruleset = await tx.permissionRuleset.findFirst({
				where: { id: rulesetId, userId: ownerId },
			});

			if (!ruleset) return fail(404, "NOT_FOUND", "Ruleset not found");

			const permission: SharePermission =
				ruleset.fallback === "titles"
					? "titles"
					: ruleset.fallback === "full"
						? "full"
						: "busy";

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
				create: {
					calendarId,
					sharedWithId: userId,
					permission,
					expiresAt: expiresAt ? new Date(expiresAt) : null,
					rulesetId,
				},
				update: {
					permission,
					rulesetId,
					expiresAt:
						expiresAt === undefined
							? undefined
							: expiresAt
								? new Date(expiresAt)
								: null,
				},
			});
		} else
			await tx.calendarShare.deleteMany({
				where: { calendarId, sharedWithId: userId },
			});
	});
}
