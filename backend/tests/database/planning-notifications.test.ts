import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/core/database";
import { generateToken } from "../../src/modules/identity";
import { eventAccess } from "../../src/modules/sharing";
import {
	notify,
	deliverNotification,
	reconcileHighlights,
} from "../../src/modules/notifications";
import * as mail from "../../src/core/mail";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"planning, colors and notifications",
	() => {
		let app: Awaited<ReturnType<typeof buildApp>>;
		const owner = randomUUID(),
			viewer = randomUUID(),
			outsider = randomUUID();
		const ids = [owner, viewer, outsider];
		let calendarId: string, rulesetId: string, shareId: string;
		const day = new Date(Date.now() + 3 * 86400000)
			.toISOString()
			.slice(0, 10);
		const at = (time: string) => new Date(`${day}T${time}:00Z`);
		const headers = (id = viewer) => ({
			authorization: `Bearer ${generateToken(id)}`,
		});
		const search = (
			options: { includeAllDay?: boolean; calendarIds?: string[] } = {},
		) =>
			app.inject({
				method: "POST",
				url: "/api/v1/availability/searches",
				headers: headers(),
				payload: {
					friendIds: [owner],
					start: day,
					end: day,
					from: "09:00",
					to: "17:00",
					minutes: 60,
					...options,
				},
			});

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");
			app = await buildApp();
			await prisma.appSettings.upsert({
				where: { id: "global" },
				create: {},
				update: {
					requireEmailVerification: false,
					requireTwoFactor: false,
				},
			});
			for (const id of ids)
				await prisma.user.create({
					data: {
						id,
						email: `${id}@example.test`,
						passwordHash: "unused",
						emailVerifiedAt: new Date(),
						settings: { create: { timezone: "UTC" } },
					},
				});
			await prisma.friendship.create({
				data: { user1Id: owner, user2Id: viewer, status: "accepted" },
			});
			for (const userId of [owner, viewer]) {
				const calendar = await prisma.calendar.create({
					data: {
						userId,
						name: "Planning",
						type: "ics",
						syncInterval: 0,
						lastSuccess: new Date(),
						coverageStart: new Date(Date.now() - 86400000),
						coverageEnd: new Date(Date.now() + 30 * 86400000),
					},
				});
				if (userId === owner) calendarId = calendar.id;
			}
			const ruleset = await prisma.permissionRuleset.create({
				data: {
					userId: owner,
					name: "Highlight Paul",
					fallback: "full",
					rules: [
						{
							when: {
								attribute: "event.title",
								operator: "equals",
								value: "Hidden meeting",
							},
							visibility: "hidden",
						},
						{
							when: {
								attribute: "event.title",
								operator: "contains",
								value: "Paul",
							},
							visibility: "highlight",
						},
					],
				},
			});
			rulesetId = ruleset.id;
			shareId = (
				await prisma.calendarShare.create({
					data: { calendarId, sharedWithId: viewer, rulesetId },
				})
			).id;
			for (const [title, start, end] of [
				["Hidden meeting", "09:00", "10:00"],
				["Meet Paul", "11:00", "12:00"],
				["Visible meeting", "12:00", "13:00"],
			])
				await prisma.event.create({
					data: {
						calendarId,
						title,
						description: "Full details",
						startTime: at(start),
						endTime: at(end),
					},
				});
		});

		afterAll(async () => {
			await prisma.recoveryMail.deleteMany({
				where: { userId: { in: ids } },
			});
			await prisma.calendar.deleteMany({
				where: { userId: { in: ids } },
			});
			await prisma.user.deleteMany({ where: { id: { in: ids } } });
			await app.close();
			await prisma.$disconnect();
			vi.restoreAllMocks();
		});

		it("counts hidden events as free without returning their fields", async () => {
			const response = await search();
			expect(response.statusCode, response.body).toBe(200);
			expect(response.json().notices).toEqual([]);
			expect(response.json().items).toEqual([
				{
					start: at("09:00").toISOString(),
					end: at("11:00").toISOString(),
				},
				{
					start: at("13:00").toISOString(),
					end: at("17:00").toISOString(),
				},
			]);
			expect(response.body).not.toContain("Hidden meeting");
		});

		it("checks only selected owned calendars, including their coverage", async () => {
			const baseline = (await search()).json().items;
			const own = await prisma.calendar.findFirstOrThrow({
				where: { userId: viewer },
			});
			const extra = await prisma.calendar.create({
				data: {
					userId: viewer,
					name: "Not selected",
					type: "ics",
					syncInterval: 0,
					lastSuccess: new Date(),
					coverageStart: own.coverageStart,
					coverageEnd: own.coverageEnd,
					events: {
						create: {
							title: "Away",
							startTime: at("00:00"),
							endTime: at("23:59"),
						},
					},
				},
			});

			try {
				expect((await search()).json().items).toEqual([]);
				expect(
					(await search({ calendarIds: [own.id] })).json().items,
				).toEqual(baseline);
				await prisma.calendar.update({
					where: { id: extra.id },
					data: { lastError: "Failed", coverageStart: null },
				});
				expect(
					(await search({ calendarIds: [own.id] })).json(),
				).toMatchObject({ items: baseline, notices: [] });
				expect(
					(await search({ calendarIds: [extra.id] })).json().notices,
				).toHaveLength(1);
				expect(
					(await search({ calendarIds: [] })).json(),
				).toMatchObject({ items: baseline, notices: [] });
			} finally {
				await prisma.calendar.delete({ where: { id: extra.id } });
			}
		});

		it("rejects borrowed, unknown and duplicate calendar selections", async () => {
			for (const id of [calendarId, randomUUID()]) {
				const response = await search({ calendarIds: [id] });
				expect(response.statusCode).toBe(403);
				expect(response.json().code).toBe("FORBIDDEN");
			}
			const own = await prisma.calendar.findFirstOrThrow({
				where: { userId: viewer },
			});
			expect(
				(await search({ calendarIds: [own.id, own.id] })).statusCode,
			).toBe(400);
		});

		it("respects provider free time and an explicit choice to exclude all-day events", async () => {
			const baseline = (await search()).json().items;
			const event = await prisma.event.create({
				data: {
					calendarId,
					title: "Term dates",
					startTime: new Date(Date.now() - 30 * 86400000),
					endTime: new Date(Date.now() + 60 * 86400000),
					allDay: true,
					blocksTime: false,
				},
			});

			try {
				expect((await search()).json()).toMatchObject({
					items: baseline,
					allDayEvents: 0,
				});
				await prisma.event.update({
					where: { id: event.id },
					data: { blocksTime: true },
				});
				expect((await search()).json()).toMatchObject({
					items: [],
					allDayEvents: 1,
				});
				expect(
					(await search({ includeAllDay: false })).json().items,
				).toEqual(baseline);

				// Timed events spanning days must still block their actual interval.
				await prisma.event.update({
					where: { id: event.id },
					data: { allDay: false },
				});
				expect(
					(await search({ includeAllDay: false })).json().items,
				).toEqual([]);

				await prisma.event.update({
					where: { id: event.id },
					data: { title: "Hidden meeting", allDay: true },
				});
				expect((await search()).json()).toMatchObject({
					items: baseline,
					allDayEvents: 0,
				});
			} finally {
				await prisma.event.delete({ where: { id: event.id } });
			}
		});

		it("refuses false-free results for unknown coverage and active failure", async () => {
			const prior = await prisma.calendar.findUniqueOrThrow({
				where: { id: calendarId },
			});
			await prisma.calendar.update({
				where: { id: calendarId },
				data: { coverageStart: null },
			});
			expect((await search()).json().items).toEqual([]);
			expect((await search()).json().notices).toHaveLength(1);
			await prisma.calendar.update({
				where: { id: calendarId },
				data: {
					coverageStart: prior.coverageStart,
					lastError: "Failed",
				},
			});
			expect((await search()).json().items).toEqual([]);
			await prisma.calendar.update({
				where: { id: calendarId },
				data: { lastError: null },
			});
		});

		it("returns highlighted full details while respecting export ceilings", async () => {
			const response = await app.inject({
				url: `/api/v1/events?start=${at("00:00").toISOString()}&end=${at("23:59").toISOString()}`,
				headers: headers(),
			});
			expect(response.statusCode, response.body).toBe(200);
			const event = response
				.json()
				.items.find(
					(row: { title: string }) => row.title === "Meet Paul",
				);
			expect(event.highlighted).toBe(true);
			expect(event.description).toBe("Full details");
			const raw = await prisma.event.findUniqueOrThrow({
				where: { id: event.id },
			});
			const mask = await eventAccess(calendarId, viewer, "busy");
			expect(mask(raw)).toMatchObject({
				title: "Busy",
				description: null,
				highlighted: false,
			});
		});

		it("persists private colors without changing the owner default or allowing outsiders", async () => {
			const url = `/api/v1/me/calendar-colors/${calendarId}`;
			expect(
				(
					await app.inject({
						method: "PUT",
						url,
						headers: headers(),
						payload: { color: "rose" },
					})
				).statusCode,
			).toBe(200);
			expect(
				(
					await prisma.calendar.findUniqueOrThrow({
						where: { id: calendarId },
					})
				).color,
			).toBe("blue");
			const result = await app.inject({
				url: "/api/v1/calendar-sources",
				headers: headers(),
			});
			expect(
				result
					.json()
					.items.find((row: { id: string }) => row.id === calendarId)
					.color,
			).toBe("rose");
			expect(
				(
					await app.inject({
						method: "PUT",
						url,
						headers: headers(outsider),
						payload: { color: "green" },
					})
				).statusCode,
			).toBe(403);
		});

		it("creates one highlight update per change and emails are off by default", async () => {
			await reconcileHighlights();
			await reconcileHighlights();
			expect(
				await prisma.notification.count({
					where: { userId: viewer, kind: "highlight" },
				}),
			).toBe(1);
			expect(
				await prisma.recoveryMail.count({ where: { userId: viewer } }),
			).toBe(0);
			const response = await app.inject({
				url: "/api/v1/me/notification-settings",
				headers: headers(),
			});
			expect(Object.values(response.json())).toEqual([
				false,
				false,
				false,
				false,
			]);
		});

		it("reading a sync warning leaves attention active; recovery clears it", async () => {
			await prisma.calendar.update({
				where: { id: calendarId },
				data: { lastError: "Provider unavailable" },
			});
			await prisma.$transaction((tx) =>
				notify(
					tx,
					owner,
					"syncFailure",
					calendarId,
					`test:${randomUUID()}`,
				),
			);
			const notice = await prisma.notification.findFirstOrThrow({
				where: { userId: owner, kind: "syncFailure" },
			});
			await app.inject({
				method: "PATCH",
				url: `/api/v1/me/notifications/${notice.id}`,
				headers: headers(owner),
				payload: { read: true },
			});
			const attention = () =>
				app.inject({
					url: "/api/v1/me/attention",
					headers: headers(owner),
				});
			expect(
				(await attention())
					.json()
					.items.some(
						(item: { tab: string }) => item.tab === "calendar",
					),
			).toBe(true);
			await prisma.calendar.update({
				where: { id: calendarId },
				data: { lastError: null, lastSuccess: new Date() },
			});
			expect((await attention()).json().items).toEqual([]);
		});

		it("queues optional email only when opted in and rechecks revoked access before delivery", async () => {
			vi.spyOn(mail, "mailConfigured").mockReturnValue(true);
			const send = vi
				.spyOn(mail, "sendNotificationEmail")
				.mockResolvedValue();
			await prisma.userSettings.update({
				where: { userId: viewer },
				data: { emailHighlights: true },
			});
			await prisma.$transaction((tx) =>
				notify(
					tx,
					viewer,
					"highlight",
					calendarId,
					`email:${randomUUID()}`,
				),
			);
			expect(
				await prisma.recoveryMail.count({ where: { userId: viewer } }),
			).toBe(1);
			const notification = await prisma.notification.findFirstOrThrow({
				where: { userId: viewer, dedupeKey: { startsWith: "email:" } },
			});
			expect(
				await deliverNotification(
					notification.id,
					`${viewer}@example.test`,
				),
			).toBe(true);
			expect(send).toHaveBeenCalledTimes(1);
			await prisma.calendarShare.update({
				where: { id: shareId },
				data: { expiresAt: new Date(0) },
			});
			expect(
				await deliverNotification(
					notification.id,
					`${viewer}@example.test`,
				),
			).toBe(false);
			expect(send).toHaveBeenCalledTimes(1);
			expect(
				(
					await app.inject({
						url: "/api/v1/me/notifications",
						headers: headers(),
					})
				).json().items,
			).toEqual([]);
			expect((await search()).json().notices).toHaveLength(1);
		});

		it("reports the owner timezone independently of the viewer", async () => {
			await prisma.userSettings.update({
				where: { userId: owner },
				data: { timezone: "Asia/Tokyo" },
			});
			await prisma.userSettings.update({
				where: { userId: viewer },
				data: { timezone: "America/New_York" },
			});
			await prisma.calendarShare.update({
				where: { id: shareId },
				data: { expiresAt: null },
			});
			const sources = await app.inject({
				url: "/api/v1/calendar-sources",
				headers: headers(),
			});
			expect(
				sources
					.json()
					.items.find((row: { id: string }) => row.id === calendarId)
					.timezone,
			).toBe("Asia/Tokyo");
			const own = await app.inject({
				url: "/api/v1/calendars",
				headers: headers(owner),
			});
			expect(
				own
					.json()
					.items.find((row: { id: string }) => row.id === calendarId)
					.timezone,
			).toBe("Asia/Tokyo");
		});

		it("serializes Highlight shares and honors public preview ceilings", async () => {
			await prisma.permissionRuleset.update({
				where: { id: rulesetId },
				data: {
					fallback: "highlight",
					rules: [],
					version: { increment: 1 },
				},
			});
			const friends = await app.inject({
				url: "/api/v1/friendships",
				headers: headers(),
			});
			expect(friends.statusCode, friends.body).toBe(200);
			expect(friends.body).toContain("Highlighted");
			const created = await app.inject({
				method: "POST",
				url: `/api/v1/calendars/${calendarId}/subscriptions`,
				headers: headers(owner),
				payload: { ceiling: "titles", rulesetId },
			});
			expect(created.statusCode, created.body).toBe(201);
			const preview = await app.inject({
				method: "POST",
				url: "/api/v1/shared-calendar-previews",
				payload: {
					token: new URL(created.json().previewUrl).hash.slice(1),
					start: at("00:00").toISOString(),
					end: at("23:59").toISOString(),
				},
			});
			expect(preview.statusCode, preview.body).toBe(200);
			expect(
				preview
					.json()
					.items.every(
						(event: { visibility: string; description: unknown }) =>
							event.visibility === "titles" &&
							event.description === null,
					),
			).toBe(true);
			expect(preview.json().color).toBe("blue");
		});

		it("creates friend updates atomically with requests and acceptance", async () => {
			const created = await app.inject({
				method: "POST",
				url: "/api/v1/friendships",
				headers: headers(outsider),
				payload: { targetUserId: viewer },
			});
			expect(created.statusCode, created.body).toBe(201);
			const friendshipId = created.json().id;
			expect(
				await prisma.notification.count({
					where: {
						userId: viewer,
						kind: "friendRequest",
						referenceId: friendshipId,
					},
				}),
			).toBe(1);
			const accepted = await app.inject({
				method: "PATCH",
				url: `/api/v1/friendships/${friendshipId}`,
				headers: headers(),
				payload: { status: "accepted" },
			});
			expect(accepted.statusCode, accepted.body).toBe(200);
			expect(
				await prisma.notification.count({
					where: {
						userId: outsider,
						kind: "friendAccepted",
						referenceId: friendshipId,
						readAt: null,
					},
				}),
			).toBe(1);
			const tasks = await app.inject({
				url: "/api/v1/me/attention",
				headers: headers(),
			});
			expect(
				tasks
					.json()
					.items.some(
						(item: { id: string }) =>
							item.id === `friendRequest:${friendshipId}`,
					),
			).toBe(false);
		});

		it("removes highlights after rules or sharing change", async () => {
			await prisma.permissionRuleset.update({
				where: { id: rulesetId },
				data: {
					rules: [],
					fallback: "hidden",
					version: { increment: 1 },
				},
			});
			await reconcileHighlights();
			expect(
				await prisma.eventHighlight.count({
					where: { userId: viewer },
				}),
			).toBe(0);
		});
	},
);
