import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { mockPrisma, resetMocks } from "../../../helpers/prisma";
import {
    createMockCalendar,
    createMockEvent,
    createMockUser,
    createMockFriendship,
} from "../../../helpers/factories";
import icsSubscriptionRoutes from "../../../../src/routes/export/subscription/ics";
import { createQueryToken } from "../../../helpers/auth";

function buildApp() {
    const app = Fastify();
    app.register(icsSubscriptionRoutes);
    return app;
}

function authHeader(userId: string) {
    return { authorization: `Bearer ${createQueryToken(userId)}` };
}

beforeEach(() => resetMocks());

describe("authentication", () => {
    it("rejects request with no token", async () => {
        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
        });
        expect(res.statusCode).toBe(401);
    });

    it("rejects request with invalid token", async () => {
        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: { authorization: "Bearer not-a-valid-jwt" },
        });
        expect(res.statusCode).toBe(401);
    });

    it("accepts token via Authorization header", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(200);
    });

    it("accepts token via ?token= query param", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/my-calendar.ics?token=${createQueryToken(user.id)}`,
        });
        expect(res.statusCode).toBe(200);
    });

    it("rejects when user no longer exists in db", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader("deleted-user"),
        });
        expect(res.statusCode).toBe(401);
    });
});

describe("GET /my-calendar.ics", () => {
    it("returns valid ICS content type", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/calendar");
    });

    it("returns VCALENDAR wrapper", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("BEGIN:VCALENDAR");
        expect(res.body).toContain("END:VCALENDAR");
    });

    it("includes user events in output", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", {
                title: "My Event",
                startTime: new Date("2026-03-01T10:00:00Z"),
                endTime: new Date("2026-03-01T11:00:00Z"),
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("BEGIN:VEVENT");
        expect(res.body).toContain("My Event");
    });

    it("returns empty calendar when user has no events", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader(user.id),
        });
        expect(res.body).not.toContain("BEGIN:VEVENT");
    });

    it("queries events scoped to authenticated user only", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        await app.inject({
            method: "GET",
            url: "/my-calendar.ics",
            headers: authHeader(user.id),
        });
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendar: { userId: user.id } },
            }),
        );
    });
});

describe("GET /calendar/:calendarId.ics", () => {
    it("returns 404 when calendar is inaccessible", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: "/calendar/unknown-cal.ics",
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(404);
    });

    it("returns ICS for owned calendar", async () => {
        const user = createMockUser();
        const calendar = createMockCalendar(user.id, { name: "Work" });
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent(calendar.id, {
                title: "Standup",
                startTime: new Date("2026-03-01T09:00:00Z"),
                endTime: new Date("2026-03-01T09:15:00Z"),
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/calendar/${calendar.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Standup");
    });

    it("returns ICS for shared calendar", async () => {
        const user = createMockUser();
        const owner = createMockUser();
        const calendar = createMockCalendar(owner.id, { name: "Shared" });
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/calendar/${calendar.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(200);
    });

    it("uses calendar name in content-disposition filename", async () => {
        const user = createMockUser();
        const calendar = createMockCalendar(user.id, { name: "Personal" });
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/calendar/${calendar.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.headers["content-disposition"]).toContain("Personal");
    });
});

describe("GET /friend/:friendUserId.ics", () => {
    it("returns 403 when not friends", async () => {
        const user = createMockUser();
        const stranger = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${stranger.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(403);
    });

    it("returns 403 when friends but no calendars shared", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(403);
    });

    it("returns ICS when calendars are shared", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", { title: "Friend Event" }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("BEGIN:VCALENDAR");
    });

    it("uses friend name in content-disposition filename", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: "Alice",
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.headers["content-disposition"]).toContain("Alice");
    });

    it("falls back to email in filename when friend has no name", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: null,
                email: "alice@example.com",
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.headers["content-disposition"]).toContain(
            "alice@example.com",
        );
    });

    it("full permission - exposes title, description and location", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", {
                title: "Secret Meeting",
                description: "Confidential",
                location: "HQ",
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("Secret Meeting");
        expect(res.body).toContain("Confidential");
        expect(res.body).toContain("HQ");
    });

    it("titles permission - exposes title but strips description and location", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "titles" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", {
                title: "Secret Meeting",
                description: "Confidential",
                location: "HQ",
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("Secret Meeting");
        expect(res.body).not.toContain("Confidential");
        expect(res.body).not.toContain("HQ");
    });

    it("busy permission - replaces title with Busy and strips all details", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "busy" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", {
                title: "Secret Meeting",
                description: "Confidential",
                location: "HQ",
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("Busy");
        expect(res.body).not.toContain("Secret Meeting");
        expect(res.body).not.toContain("Confidential");
        expect(res.body).not.toContain("HQ");
    });

    it("busy permission - still includes time blocks", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "busy" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", {
                startTime: new Date("2026-03-01T10:00:00Z"),
                endTime: new Date("2026-03-01T11:00:00Z"),
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("DTSTART");
        expect(res.body).toContain("DTEND");
    });

    it("each calendar is masked by its own permission independently", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-full", permission: "full" },
            { calendarId: "cal-busy", permission: "busy" },
        ]);
        mockPrisma.event.findMany
            .mockResolvedValueOnce([
                createMockEvent("cal-full", {
                    title: "Visible Event",
                    description: "Visible Desc",
                }),
            ])
            .mockResolvedValueOnce([
                createMockEvent("cal-busy", {
                    title: "Hidden Event",
                    description: "Hidden Desc",
                }),
            ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("Visible Event");
        expect(res.body).toContain("Visible Desc");
        expect(res.body).toContain("Busy");
        expect(res.body).not.toContain("Hidden Event");
        expect(res.body).not.toContain("Hidden Desc");
    });

    it("null permission in db defaults to full", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: null },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent("cal-1", {
                title: "Secret Meeting",
                description: "Confidential",
            }),
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("Secret Meeting");
        expect(res.body).toContain("Confidential");
    });
});

describe("GET /friend/:friendUserId/:calendarId.ics", () => {
    it("returns 403 when not friends", async () => {
        const user = createMockUser();
        const stranger = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${stranger.id}/cal-1.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(403);
    });

    it("returns 403 when calendar is not shared with user", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}/cal-1.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(403);
    });

    it("returns 403 when a different calendar is shared but not the requested one", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "other-cal", permission: "full" },
        ]);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}/cal-1.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(403);
    });

    it("returns ICS for the specific shared calendar", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        const calendar = createMockCalendar(friend.id, { name: "Work" });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: "Alice",
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: calendar.id, permission: "full" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent(calendar.id, { title: "Team Standup" }),
        ]);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}/${calendar.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain("Team Standup");
    });

    it("uses friend name and calendar name in content-disposition", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        const calendar = createMockCalendar(friend.id, { name: "Work" });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: "Alice",
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: calendar.id, permission: "full" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([]);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}/${calendar.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.headers["content-disposition"]).toContain("Alice");
        expect(res.headers["content-disposition"]).toContain("Work");
    });

    it("respects permission level on the specific calendar", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        const calendar = createMockCalendar(friend.id, { name: "Private" });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: friend.id,
                name: friend.name,
                email: friend.email,
            });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(user.id, friend.id),
        );
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: calendar.id, permission: "busy" },
        ]);
        mockPrisma.event.findMany.mockResolvedValue([
            createMockEvent(calendar.id, {
                title: "Private Meeting",
                description: "Secret",
            }),
        ]);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        const app = buildApp();
        const res = await app.inject({
            method: "GET",
            url: `/friend/${friend.id}/${calendar.id}.ics`,
            headers: authHeader(user.id),
        });
        expect(res.body).toContain("Busy");
        expect(res.body).not.toContain("Private Meeting");
        expect(res.body).not.toContain("Secret");
    });
});
