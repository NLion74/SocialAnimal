import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { generateToken } from "../../../src/modules/identity";
import { opaqueToken, tokenHash } from "../../../src/core/secrets";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Permanent subscription deletion",
	() => {
		const owner = randomUUID(),
			other = randomUUID();

		let calendarId: string,
			id: string,
			app: Awaited<ReturnType<typeof buildApp>>;

		const token = opaqueToken();

		const remove = (user: string, permanent = true) =>
			app.inject({
				method: "DELETE",
				url: `/api/v1/subscriptions/${id}${permanent ? "?permanent=true" : ""}`,
				headers: { authorization: `Bearer ${generateToken(user)}` },
			});

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			await prisma.user.createMany({
				data: [owner, other].map((id) => ({
					id,
					email: `${id}@example.test`,
					passwordHash: "unused",
				})),
			});

			calendarId = (
				await prisma.calendar.create({
					data: { userId: owner, type: "ics", name: "Delete test" },
				})
			).id;

			id = (
				await prisma.subscription.create({
					data: {
						calendarId,
						issuerId: owner,
						tokenHash: tokenHash(token),
						ceiling: "busy",
					},
				})
			).id;

			app = await buildApp();
		});

		afterAll(async () => {
			await prisma.calendar.deleteMany({ where: { id: calendarId } });

			await prisma.user.deleteMany({
				where: { id: { in: [owner, other] } },
			});

			await app.close();
			await prisma.$disconnect();
		});

		it("requires ownership and prior revocation, preserving link rejection after deletion", async () => {
			expect((await remove(other)).statusCode).toBe(404);
			expect((await remove(owner)).statusCode).toBe(409);
			expect((await remove(owner, false)).statusCode).toBe(204);

			expect((await app.inject(`/feeds/${token}.ics`)).statusCode).toBe(
				404,
			);

			expect((await remove(other)).statusCode).toBe(404);
			expect((await remove(owner)).statusCode).toBe(204);

			expect(
				await prisma.subscription.findUnique({ where: { id } }),
			).toBeNull();

			expect((await app.inject(`/feeds/${token}.ics`)).statusCode).toBe(
				404,
			);
		});
	},
);
