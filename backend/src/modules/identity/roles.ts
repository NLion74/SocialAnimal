import { prisma, type Prisma } from "../../core/database";
import { fail } from "../../core/http";

export const roles = ["admin", "moderator", "normal", "readonly"] as const;

export type AccountRole = (typeof roles)[number];

export async function requireStaff(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { isAdmin: true, accountRole: true, disabled: true },
	});

	if (
		!user ||
		user.disabled ||
		(!user.isAdmin && user.accountRole !== "moderator")
	)
		fail(403, "FORBIDDEN", "Administrator or moderator access required");
}

export async function protectLastAdmin(
	tx: Prisma.TransactionClient,
	id: string,
) {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(742901)`;

	const user = await tx.user.findUnique({
		where: { id },
		select: { isAdmin: true, disabled: true },
	});

	if (
		user?.isAdmin &&
		!user.disabled &&
		(await tx.user.count({
			where: { isAdmin: true, disabled: false, id: { not: id } },
		})) === 0
	)
		fail(409, "LAST_ADMIN", "Keep at least one active administrator");
}
