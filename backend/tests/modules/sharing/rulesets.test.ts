import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { generateToken } from "../../../src/modules/identity";
import { seedRulesets } from "../../../src/modules/sharing";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("Rulesets with PostgreSQL", () => {
	let app: Awaited<ReturnType<typeof buildApp>>;

	const owner = randomUUID(),
		friend = randomUUID(),
		stranger = randomUUID();

	let calendarId: string,
		rulesetId: string,
		subscription: { url: string; previewUrl: string };

	const auth = (id = owner) => ({
		authorization: `Bearer ${generateToken(id)}`,
	});

	const interval = {
		start: "2026-10-01T00:00:00Z",
		end: "2026-11-01T00:00:00Z",
	};

	const when = {
		all: [
			{ attribute: "timegrid.day", operator: "equals", value: "monday" },
			{
				attribute: "timegrid.time",
				operator: "between",
				value: ["13:00", "14:00"],
			},
		],
	};

	const request = (
		method: "GET" | "POST" | "PUT" | "DELETE",
		url: string,
		payload?: object,
		id = owner,
	) =>
		app.inject({
			method,
			url: `/api/v1${url}`,
			headers: auth(id),
			...(payload ? { payload } : {}),
		});

	beforeAll(async () => {
		if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
			throw new Error("Disposable database required");

		app = await buildApp();

		await prisma.appSettings.upsert({
			where: { id: "global" },
			create: { id: "global" },
			update: { requireEmailVerification: false },
		});

		await prisma.user.createMany({
			data: [owner, friend, stranger].map((id) => ({
				id,
				email: `${id}@example.test`,
				passwordHash: "secret",
			})),
		});

		await prisma.$transaction((tx) => seedRulesets(tx, owner));

		await prisma.friendship.create({
			data: { user1Id: owner, user2Id: friend, status: "accepted" },
		});

		await prisma.userSettings.create({
			data: { userId: owner, timezone: "Europe/Berlin" },
		});

		calendarId = (
			await prisma.calendar.create({
				data: {
					userId: owner,
					name: "Work",
					type: "ics",
					syncInterval: 0,
				},
			})
		).id;

		await prisma.event.createMany({
			data: [
				{
					id: `abac-a-${owner}`,
					calendarId,
					title: "Hidden meeting",
					startTime: new Date("2026-10-06T11:00Z"),
					endTime: new Date("2026-10-06T12:00Z"),
					description: "Secret",
					location: "Office",
				},
				{
					id: `abac-b-${owner}`,
					calendarId,
					title: "Monday meeting",
					startTime: new Date("2026-10-05T11:30Z"),
					endTime: new Date("2026-10-05T12:30Z"),
					description: "Secret",
					location: "Office",
				},
			],
		});
	});

	afterAll(async () => {
		await prisma.calendar.deleteMany({ where: { userId: owner } });

		await prisma.user.deleteMany({
			where: { id: { in: [owner, friend, stranger] } },
		});

		await app.close();
		await prisma.$disconnect();
	});

	it("seeds four editable defaults and reports the registries", async () => {
		const rows = (await request("GET", "/rulesets")).json().items;

		expect(
			rows.map((r: { fallback: string }) => r.fallback).sort(),
		).toEqual(["busy", "full", "hidden", "titles"]);

		expect(
			(await request("GET", "/permission-registry")).json().attributes,
		).toContainEqual(
			expect.objectContaining({ id: "timegrid.time", type: "time" }),
		);

		const created = await request("POST", "/rulesets", {
			name: "Monday hours",
			fallback: "hidden",
			rules: [{ when, visibility: "busy" }],
		});

		expect(created.statusCode, created.body).toBe(201);
		rulesetId = created.json().id;

		const granted = await request(
			"PUT",
			`/calendars/${calendarId}/grants/${friend}`,
			{ rulesetId },
		);

		expect(granted.statusCode, granted.body).toBe(204);
	});

	it("enforces ownership, accepted friendship, and one share per calendar/friend", async () => {
		expect(
			(
				await request(
					"PUT",
					`/calendars/${calendarId}/grants/${stranger}`,
					{ rulesetId },
				)
			).statusCode,
		).toBe(403);

		expect(
			(
				await request(
					"PUT",
					`/calendars/${calendarId}/grants/${friend}`,
					{ rulesetId },
					stranger,
				)
			).statusCode,
		).toBe(403);

		expect(
			(
				await request(
					"PUT",
					`/rulesets/${rulesetId}`,
					{ name: "Stolen", fallback: "full", rules: [], version: 1 },
					stranger,
				)
			).statusCode,
		).toBe(409);

		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				request("PUT", `/calendars/${calendarId}/grants/${friend}`, {
					rulesetId,
				}),
			),
		);

		expect(results.every((r) => r.statusCode === 204)).toBe(true);

		expect(
			await prisma.calendarShare.count({
				where: { calendarId, sharedWithId: friend },
			}),
		).toBe(1);

		expect(
			(await request("DELETE", `/rulesets/${rulesetId}`)).statusCode,
		).toBe(409);
	});

	it("uses the same masking in API reads, owner previews, anonymous previews and feeds", async () => {
		const events = await request(
			"GET",
			`/events?${new URLSearchParams(interval)}`,
			undefined,
			friend,
		);

		expect(events.statusCode, events.body).toBe(200);

		expect(
			events.json().items.map((e: { title: string }) => e.title),
		).toEqual(["Busy"]);

		const preview = await request(
			"POST",
			`/calendars/${calendarId}/grants/${friend}/previews`,
			{ ...interval, rulesetId },
		);

		expect(preview.statusCode, preview.body).toBe(200);

		expect(
			preview
				.json()
				.items.map((event: { visibility: string }) => event.visibility)
				.sort(),
		).toEqual(["busy", "hidden"]);

		expect(
			preview
				.json()
				.items.every(
					(event: { explanation?: unknown }) => event.explanation,
				),
		).toBe(true);

		expect(
			(
				await request(
					"POST",
					`/calendars/${calendarId}/grants/${friend}/previews`,
					{ ...interval, rulesetId },
					stranger,
				)
			).statusCode,
		).toBe(403);

		subscription = (
			await request(
				"POST",
				`/calendars/${calendarId}/subscriptions`,
				{ ceiling: "full" },
				friend,
			)
		).json();

		const feed = await app.inject(new URL(subscription.url).pathname);
		expect(feed.body).toContain("SUMMARY:Busy");
		expect(feed.body).not.toContain("Hidden meeting");
		expect(feed.body).not.toContain("Secret");

		const publicPreview = await app.inject({
			method: "POST",
			url: "/api/v1/shared-calendar-previews",
			payload: {
				token: new URL(subscription.previewUrl).hash.slice(1),
				...interval,
			},
		});

		expect(
			publicPreview.json().items.map((e: { title: string }) => e.title),
		).toEqual(["Busy"]);

		const first = (
			await request(
				"GET",
				`/events?${new URLSearchParams(interval)}&limit=1`,
				undefined,
				friend,
			)
		).json();

		expect(first.items).toHaveLength(1);
		expect(first.items[0].title).toBe("Busy");
		expect(first.nextCursor).toBeNull();
	});

	it("applies edits immediately, fences stale saves, and keeps link ceilings", async () => {
		const updated = await request("PUT", `/rulesets/${rulesetId}`, {
			name: "Hidden now",
			rules: [],
			fallback: "hidden",
			version: 1,
		});

		expect(updated.statusCode, updated.body).toBe(200);

		expect(
			(await app.inject(new URL(subscription.url).pathname)).body,
		).not.toContain("SUMMARY:");

		expect(
			(
				await request("PUT", `/rulesets/${rulesetId}`, {
					name: "Stale",
					rules: [],
					fallback: "full",
					version: 1,
				})
			).statusCode,
		).toBe(409);

		await request("PUT", `/rulesets/${rulesetId}`, {
			name: "Full now",
			rules: [],
			fallback: "full",
			version: 2,
		});

		const feed = await app.inject(new URL(subscription.url).pathname);
		expect(feed.body).toContain("SUMMARY:Busy");
		expect(feed.body).not.toContain("Secret");
		await request("DELETE", `/calendars/${calendarId}/grants/${friend}`);

		expect(
			(await app.inject(new URL(subscription.url).pathname)).statusCode,
		).toBe(403);
	});

	it("rejects excessive nesting and enforces the ruleset quota under concurrency", async () => {
		let condition: unknown = when;
		for (let i = 0; i < 6; i++) condition = { not: condition };

		expect(
			(
				await request("POST", "/rulesets", {
					name: "Too deep",
					fallback: "full",
					rules: [{ when: condition, visibility: "hidden" }],
				})
			).statusCode,
		).toBe(400);

		await prisma.permissionRuleset.createMany({
			data: Array.from({ length: 31 }, (_, i) => ({
				userId: stranger,
				name: String(i),
				fallback: "hidden",
				rules: [],
			})),
		});

		const results = await Promise.all(
			Array.from({ length: 3 }, () =>
				request(
					"POST",
					"/rulesets",
					{ name: "Last slot", fallback: "hidden", rules: [] },
					stranger,
				),
			),
		);

		expect(results.map((r) => r.statusCode).sort()).toEqual([
			201, 409, 409,
		]);
	});
});
