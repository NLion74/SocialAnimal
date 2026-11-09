import { prisma, type Prisma } from "../../core/database";
import { fail } from "../../core/http";
import {
	validateRuleset,
	RulesetError,
	limits,
	type Ruleset,
} from "../../services/permissions";

export async function seedRulesets(
	tx: Prisma.TransactionClient,
	userId: string,
) {
	for (const [fallback, name] of [
		["full", "Full details"],
		["titles", "Titles only"],
		["busy", "Busy only"],
		["hidden", "Hide"],
	]) {
		await tx.permissionRuleset.upsert({
			where: { userId_seedKey: { userId, seedKey: fallback } },
			create: { userId, seedKey: fallback, name, fallback, rules: [] },
			update: {},
		});
	}

	await tx.user.update({
		where: { id: userId },
		data: { permissionsInitialized: true },
	});
}

export async function initializePermissions() {
	for (;;) {
		const users = await prisma.user.findMany({
			where: { permissionsInitialized: false },
			select: { id: true },
			take: 100,
		});

		if (!users.length) break;

		for (const user of users)
			await prisma.$transaction(async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"rulesets:" + user.id}))`;
				await seedRulesets(tx, user.id);

				const defaults = await tx.permissionRuleset.findMany({
					where: { userId: user.id },
				});

				for (const ruleset of defaults) {
					if (
						!["full", "titles", "busy"].includes(
							ruleset.seedKey || "",
						)
					)
						continue;

					await tx.calendarShare.updateMany({
						where: {
							calendar: { userId: user.id },
							rulesetId: null,
							permission: ruleset.seedKey as
								"full" | "titles" | "busy",
						},
						data: { rulesetId: ruleset.id },
					});
				}
			});
	}
}

export function validateDocument(input: unknown): Ruleset {
	try {
		return validateRuleset(input);
	} catch (error) {
		if (error instanceof RulesetError)
			return fail(400, "INVALID_RULESET", error.message);

		throw error;
	}
}

export async function saveRuleset(
	userId: string,
	input: Ruleset & { name: string; version?: number },
	id?: string,
) {
	const document = validateDocument({
		fallback: input.fallback,
		rules: input.rules,
	});

	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"rulesets:" + userId}))`;

		const data = {
			name: input.name.trim(),
			fallback: document.fallback,
			rules: document.rules as unknown as Prisma.InputJsonValue,
		};

		if (!data.name) fail(400, "INVALID_RULESET", "Give the ruleset a name");

		if (id) {
			const changed = await tx.permissionRuleset.updateMany({
				where: { id, userId, version: input.version },
				data: { ...data, version: { increment: 1 } },
			});

			if (!changed.count)
				fail(
					409,
					"RULESET_CHANGED",
					"Ruleset changed or is unavailable. Reload before saving.",
				);

			return tx.permissionRuleset.findUniqueOrThrow({ where: { id } });
		}

		if (
			(await tx.permissionRuleset.count({ where: { userId } })) >=
			limits.rulesets
		)
			fail(
				409,
				"RULESET_LIMIT",
				`You can have at most ${limits.rulesets} rulesets`,
			);

		return tx.permissionRuleset.create({ data: { ...data, userId } });
	});
}
