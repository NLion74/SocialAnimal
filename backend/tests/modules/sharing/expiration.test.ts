import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { generateToken } from "../../../src/modules/identity";
import { compileRuleset } from "../../../src/services/permissions";

describe.skipIf(!process.env.TEST_DATABASE_URL)("Share expiration", () => {
	const owner = randomUUID(),
		friend = randomUUID(),
		calendarId = randomUUID(),
		rulesetId = randomUUID();

	let app: Awaited<ReturnType<typeof buildApp>>;

	const headers = (id: string) => ({
		authorization: `Bearer ${generateToken(id)}`,
	});

	const start = new Date(),
		end = new Date(Date.now() + 3600000);

	const interval = { start: start.toISOString(), end: end.toISOString() };
	let address = 1;

	const call = (
		method: "POST" | "PUT" | "GET",
		url: string,
		payload?: object,
		id = owner,
	) =>
		app.inject({
			method,
			url,
			payload,
			headers: headers(id),
			remoteAddress: `198.51.100.${address++}`,
		});

	beforeAll(async () => {
		if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
			throw new Error("Disposable database required");

		app = await buildApp();

		await prisma.user.createMany({
			data: [owner, friend].map((id) => ({
				id,
				email: `${id}@example.test`,
				passwordHash: "unused",
				emailVerifiedAt: new Date(),
			})),
		});

		await prisma.friendship.create({
			data: { user1Id: owner, user2Id: friend, status: "accepted" },
		});

		await prisma.calendar.create({
			data: {
				id: calendarId,
				userId: owner,
				type: "ics",
				name: "Expiry",
				syncInterval: 0,
			},
		});

		await prisma.permissionRuleset.create({
			data: {
				id: rulesetId,
				userId: owner,
				name: "Full",
				fallback: "full",
				rules: [],
			},
		});

		await prisma.event.create({
			data: {
				calendarId,
				title: "Private appointment",
				description: "Clinical detail",
				location: " ",
				isRecurring: true,
				startTime: start,
				endTime: end,
			},
		});
	});

	afterAll(async () => {
		await prisma.calendar.deleteMany({ where: { id: calendarId } });

		await prisma.user.deleteMany({
			where: { id: { in: [owner, friend] } },
		});

		await app.close();
		await prisma.$disconnect();
	});

	it("expires both public previews and feeds without a cleanup task", async () => {
		const created = await call(
			"POST",
			`/api/v1/calendars/${calendarId}/subscriptions`,
			{
				ceiling: "full",
				expiresAt: new Date(Date.now() + 60000).toISOString(),
			},
		);

		expect(created.statusCode, created.body).toBe(201);
		const link = created.json();
		const token = new URL(link.previewUrl).hash.slice(1);

		expect((await app.inject(new URL(link.url).pathname)).body).toContain(
			"Private appointment",
		);

		await prisma.subscription.update({
			where: { id: link.id },
			data: { expiresAt: new Date(0) },
		});

		expect((await app.inject(new URL(link.url).pathname)).statusCode).toBe(
			404,
		);

		expect(
			(
				await call("POST", "/api/v1/shared-calendar-previews", {
					token,
					...interval,
				})
			).statusCode,
		).toBe(404);
	});

	it("expires friend grants and their downstream subscriptions, preserving owner access", async () => {
		const grant = await call(
			"PUT",
			`/api/v1/calendars/${calendarId}/grants/${friend}`,
			{
				rulesetId,
				expiresAt: new Date(Date.now() + 60000).toISOString(),
			},
		);

		expect(grant.statusCode, grant.body).toBe(204);

		const created = await call(
			"POST",
			`/api/v1/calendars/${calendarId}/subscriptions`,
			{ ceiling: "full" },
			friend,
		);

		expect(created.statusCode, created.body).toBe(201);

		await prisma.calendarShare.update({
			where: {
				calendarId_sharedWithId: { calendarId, sharedWithId: friend },
			},
			data: { expiresAt: new Date(0) },
		});

		const query = new URLSearchParams(interval);

		expect(
			(
				await call("GET", `/api/v1/events?${query}`, undefined, friend)
			).json().items,
		).toHaveLength(0);

		expect(
			(await call("GET", `/api/v1/events?${query}`))
				.json()
				.items.some(
					(event: { title: string }) =>
						event.title === "Private appointment",
				),
		).toBe(true);

		expect(
			(await app.inject(new URL(created.json().url).pathname)).statusCode,
		).toBe(403);
	});

	it("rejects past expirations and exposes diagnostics only to the owner", async () => {
		expect(
			(
				await call(
					"PUT",
					`/api/v1/calendars/${calendarId}/grants/${friend}`,
					{ rulesetId, expiresAt: new Date(0).toISOString() },
				)
			).statusCode,
		).toBe(400);

		await prisma.permissionRuleset.update({
			where: { id: rulesetId },
			data: {
				fallback: "hidden",
				rules: [
					{
						when: {
							all: [
								{
									attribute: "event.description",
									operator: "contains",
									value: "Clinical",
								},
								{
									attribute: "event.hasLocation",
									operator: "equals",
									value: "no",
								},
								{
									attribute: "event.isRecurring",
									operator: "equals",
									value: "yes",
								},
							],
						},
						visibility: "busy",
					},
				],
			},
		});

		const preview = await call(
			"POST",
			`/api/v1/calendars/${calendarId}/grants/${friend}/previews`,
			{ rulesetId, ...interval },
		);

		expect(preview.statusCode, preview.body).toBe(200);

		expect(preview.json().items[0].explanation).toMatchObject({
			ruleIndex: 0,
			visibility: "busy",
		});

		expect(preview.json().items[0].explanation.conditions).toHaveLength(4);

		expect(
			(
				await call(
					"POST",
					`/api/v1/calendars/${calendarId}/grants/${friend}/previews`,
					{ rulesetId, ...interval },
					friend,
				)
			).statusCode,
		).toBe(403);
	});
});

it("explains nested temporal matches using the same evaluator, including unknown recurrence", () => {
	const rules = compileRuleset({
		fallback: "full",
		rules: [
			{
				visibility: "busy",
				when: {
					all: [
						{
							attribute: "timegrid.day",
							operator: "equals",
							value: "monday",
						},
						{
							attribute: "timegrid.time",
							operator: "between",
							value: ["13:00", "14:00"],
						},
						{
							not: {
								attribute: "event.isRecurring",
								operator: "equals",
								value: "yes",
							},
						},
					],
				},
			},
		],
	});

	const start = new Date("2026-10-05T10:30:00Z"),
		end = new Date("2026-10-05T12:30:00Z");

	const context = { "event.isRecurring": "no" };
	const trace = rules.explain(context, start, end, "Europe/Berlin");

	expect(trace.visibility).toBe(
		rules.during(context, start, end, "Europe/Berlin"),
	);

	expect(trace).toMatchObject({
		visibility: "busy",
		ruleIndex: 0,
		matchedAt: "2026-10-05T11:00:00.000Z",
	});

	expect(rules.explain({}, start, end, "Europe/Berlin")).toMatchObject({
		visibility: "full",
		ruleIndex: null,
	});
});
