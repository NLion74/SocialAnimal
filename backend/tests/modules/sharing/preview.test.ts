import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { generateToken } from "../../../src/modules/identity";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Public calendar preview",
	() => {
		let app: Awaited<ReturnType<typeof buildApp>>;

		const owner = randomUUID(),
			friend = randomUUID();

		let calendarId: string;

		const auth = (id = owner) => ({
			authorization: `Bearer ${generateToken(id)}`,
		});

		const interval = {
			start: "2026-09-10T00:00:00Z",
			end: "2026-09-20T00:00:00Z",
		};

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			app = await buildApp();

			await prisma.user.createMany({
				data: [owner, friend].map((id) => ({
					id,
					email: `${id}@example.test`,
					passwordHash: "private-hash",
				})),
			});

			await prisma.friendship.create({
				data: { user1Id: owner, user2Id: friend, status: "accepted" },
			});

			const calendar = await prisma.calendar.create({
				data: {
					userId: owner,
					name: "Private calendar name",
					type: "ics",
					syncInterval: 0,
				},
			});

			calendarId = calendar.id;

			await prisma.event.create({
				data: {
					calendarId,
					title: "Sensitive meeting",
					description: "Private notes",
					location: "Secret room",
					externalId: "provider-secret-id",
					startTime: new Date("2026-09-01"),
					endTime: new Date("2026-10-01"),
				},
			});
		});

		afterAll(async () => {
			await prisma.calendar.deleteMany({ where: { userId: owner } });

			await prisma.user.deleteMany({
				where: { id: { in: [owner, friend] } },
			});

			await app.close();
			await prisma.$disconnect();
		});

		const create = async (
			ceiling = "full",
			issuer = owner,
			replaceId?: string,
		) =>
			app.inject({
				method: "POST",
				url: `/api/v1/calendars/${calendarId}/subscriptions`,
				headers: auth(issuer),
				payload: { ceiling, replaceId },
			});

		const preview = (url: string, body = {}) =>
			app.inject({
				method: "POST",
				url: "/api/v1/shared-calendar-previews",
				payload: {
					token: new URL(url).hash.slice(1),
					...interval,
					...body,
				},
			});

		it("allows anonymous previews with field masking and no owner or provider details", async () => {
			for (const permission of ["busy", "titles", "full"]) {
				const subscription = (await create(permission)).json();
				const response = await preview(subscription.previewUrl);
				expect(response.statusCode, response.body).toBe(200);
				expect(response.headers["cache-control"]).toBe("no-store");

				expect(response.json().items[0].title).toBe(
					permission === "busy" ? "Busy" : "Sensitive meeting",
				);

				expect(response.json().items[0].description).toBe(
					permission === "full" ? "Private notes" : null,
				);

				for (const secret of [
					owner,
					"example.test",
					"provider-secret-id",
					"passwordHash",
					"calendarId",
					"credentials",
				])
					expect(response.body).not.toContain(secret);

				if (permission === "busy")
					expect(response.body).not.toContain(
						"Private calendar name",
					);
			}
		});

		it("rechecks grants and rejects revoked links and ordinary API authentication", async () => {
			await prisma.calendarShare.create({
				data: { calendarId, sharedWithId: friend, permission: "full" },
			});

			const sub = (await create("full", friend)).json();

			await prisma.calendarShare.updateMany({
				where: { calendarId, sharedWithId: friend },
				data: { permission: "busy" },
			});

			expect((await preview(sub.previewUrl)).json().items[0].title).toBe(
				"Busy",
			);

			const token = new URL(sub.previewUrl).hash.slice(1);

			expect(
				(
					await app.inject({
						url: "/api/v1/me",
						headers: { authorization: `Bearer ${token}` },
					})
				).statusCode,
			).toBe(401);

			await prisma.calendarShare.deleteMany({
				where: { calendarId, sharedWithId: friend },
			});

			expect((await preview(sub.previewUrl)).statusCode).toBe(403);

			await app.inject({
				method: "DELETE",
				url: `/api/v1/subscriptions/${sub.id}`,
				headers: auth(friend),
			});

			expect((await preview(sub.previewUrl)).statusCode).toBe(404);
		});

		it("replaces both links atomically and rejects replacement of another user's link", async () => {
			const old = (await create()).json();

			await prisma.calendarShare.create({
				data: { calendarId, sharedWithId: friend, permission: "full" },
			});

			const before = await prisma.subscription.count({
				where: { calendarId },
			});

			expect((await create("full", friend, old.id)).statusCode).toBe(404);

			expect(
				await prisma.subscription.count({ where: { calendarId } }),
			).toBe(before);

			expect((await preview(old.previewUrl)).statusCode).toBe(200);
			const next = await create("titles", owner, old.id);
			expect(next.statusCode).toBe(201);
			expect((await preview(old.previewUrl)).statusCode).toBe(404);

			expect(
				(await app.inject(new URL(old.url).pathname)).statusCode,
			).toBe(404);

			expect((await preview(next.json().previewUrl)).statusCode).toBe(
				200,
			);
		});

		it("bounds preview reads and never publishes tokens in the document", async () => {
			const sub = (await create()).json();

			for (const body of [
				{ end: interval.start },
				{ end: "2028-01-01T00:00:00Z" },
				{ limit: 501 },
			])
				expect((await preview(sub.previewUrl, body)).statusCode).toBe(
					400,
				);

			expect(
				(await preview("http://localhost/shared#invalid")).statusCode,
			).toBe(404);

			const listing = await app.inject({
				url: `/api/v1/calendars/${calendarId}/subscriptions`,
				headers: auth(),
			});

			expect(listing.body).not.toContain(
				new URL(sub.previewUrl).hash.slice(1),
			);
		});
	},
);
