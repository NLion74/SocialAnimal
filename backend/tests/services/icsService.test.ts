import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockCalendar,
    createMockEvent,
    createMockUser,
    createMockFriendship,
} from "../helpers/factories";
import * as icsService from "../../src/services/icsService";
import { createQueryToken } from "../helpers/auth";

beforeEach(() => resetMocks());

describe("getUserBasicInfo", () => {
    it("returns id, name and email", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue({
            id: user.id,
            name: user.name,
            email: user.email,
        });

        const result = await icsService.getUserBasicInfo(user.id);

        expect(result?.id).toBeDefined();
        expect(result?.name).toBeDefined();
        expect(result?.email).toBeDefined();
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: user.id },
            select: { id: true, name: true, email: true },
        });
    });

    it("returns null when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        const result = await icsService.getUserBasicInfo("non-existent");
        expect(result).toBeNull();
    });
});

describe("findAccessibleCalendar", () => {
    it("finds calendar owned by user", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        const result = await icsService.findAccessibleCalendar(
            calendar.id,
            "user-1",
        );

        expect(result).not.toBeNull();
        expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith({
            where: {
                id: calendar.id,
                OR: [
                    { userId: "user-1" },
                    { shares: { some: { sharedWithId: "user-1" } } },
                ],
            },
        });
    });

    it("finds calendar shared with user", async () => {
        const calendar = createMockCalendar("other-user");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        const result = await icsService.findAccessibleCalendar(
            calendar.id,
            "user-1",
        );

        expect(result).not.toBeNull();
    });

    it("returns null when calendar is inaccessible", async () => {
        mockPrisma.calendar.findFirst.mockResolvedValue(null);
        const result = await icsService.findAccessibleCalendar(
            "cal-1",
            "user-1",
        );
        expect(result).toBeNull();
    });
});

describe("userFromToken", () => {
    it("returns user when token is valid", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue({ id: user.id });

        const result = await icsService.userFromToken(
            createQueryToken(user.id),
        );

        expect(result).not.toBeNull();
        expect(result?.id).toBe(user.id);
    });

    it("returns null when token is invalid", async () => {
        const result = await icsService.userFromToken("invalid-token");
        expect(result).toBeNull();
    });

    it("returns null when token is undefined", async () => {
        const result = await icsService.userFromToken(undefined);
        expect(result).toBeNull();
    });

    it("returns null when user not found", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(null);

        const result = await icsService.userFromToken(
            createQueryToken(user.id),
        );
        expect(result).toBeNull();
    });
});

describe("buildIcs", () => {
    it("builds valid ICS string with events", () => {
        const events = [
            {
                id: "evt-1",
                title: "Test Event",
                startTime: new Date("2026-03-01T10:00:00Z"),
                endTime: new Date("2026-03-01T11:00:00Z"),
                allDay: false,
                description: "Description",
                location: "Location",
                createdAt: new Date(),
            },
        ];

        const result = icsService.buildIcs("My Calendar", events);

        expect(result).toContain("BEGIN:VCALENDAR");
        expect(result).toContain("END:VCALENDAR");
        expect(result).toContain("BEGIN:VEVENT");
        expect(result).toContain("Test Event");
        expect(result).toContain("END:VEVENT");
    });

    it("builds empty ICS when no events", () => {
        const result = icsService.buildIcs("My Calendar", []);

        expect(result).toContain("BEGIN:VCALENDAR");
        expect(result).toContain("END:VCALENDAR");
        expect(result).not.toContain("BEGIN:VEVENT");
    });

    it("handles null description and location gracefully", () => {
        const result = icsService.buildIcs("Calendar", [
            {
                id: "evt-1",
                title: "No Details",
                startTime: new Date("2026-03-01T10:00:00Z"),
                endTime: new Date("2026-03-01T11:00:00Z"),
                allDay: false,
                description: null,
                location: null,
                createdAt: new Date(),
            },
        ]);

        expect(result).toContain("BEGIN:VEVENT");
        expect(result).toContain("No Details");
        expect(result).not.toContain("DESCRIPTION:");
        expect(result).not.toContain("LOCATION:");
    });

    it("handles allDay events", () => {
        const result = icsService.buildIcs("Calendar", [
            {
                id: "evt-1",
                title: "All Day Event",
                startTime: new Date("2026-03-01T00:00:00Z"),
                endTime: new Date("2026-03-01T00:00:00Z"),
                allDay: true,
                description: null,
                location: null,
                createdAt: new Date(),
            },
        ]);

        expect(result).toContain("BEGIN:VEVENT");
        expect(result).toContain("All Day Event");
    });
});

describe("getUserEvents", () => {
    it("returns events for user across all calendars", async () => {
        const events = [createMockEvent("cal-1")];
        mockPrisma.event.findMany.mockResolvedValue(events);

        const result = await icsService.getUserEvents("user-1");

        expect(result).toHaveLength(1);
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendar: { userId: "user-1" } },
            }),
        );
    });
});

describe("getEventsByCalendarId", () => {
    it("returns events for specific calendar", async () => {
        const events = [createMockEvent("cal-1")];
        mockPrisma.event.findMany.mockResolvedValue(events);

        const result = await icsService.getEventsByCalendarId("cal-1");

        expect(result).toHaveLength(1);
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendarId: "cal-1" },
            }),
        );
    });
});

describe("getEventsByCalendarIds", () => {
    it("returns events for multiple calendars", async () => {
        const events = [createMockEvent("cal-1"), createMockEvent("cal-2")];
        mockPrisma.event.findMany.mockResolvedValue(events);

        const result = await icsService.getEventsByCalendarIds([
            "cal-1",
            "cal-2",
        ]);

        expect(result).toHaveLength(2);
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendarId: { in: ["cal-1", "cal-2"] } },
            }),
        );
    });
});

describe("ensureFriendship", () => {
    it("returns true when accepted friendship exists", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship("user-1", "user-2", { status: "accepted" }),
        );

        const result = await icsService.ensureFriendship("user-1", "user-2");
        expect(result).toBe(true);
    });

    it("returns false when no friendship exists", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        const result = await icsService.ensureFriendship("user-1", "user-2");
        expect(result).toBe(false);
    });

    it("checks friendship in both directions", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        await icsService.ensureFriendship("user-1", "user-2");

        expect(mockPrisma.friendship.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        { user1Id: "user-1", user2Id: "user-2" },
                        { user1Id: "user-2", user2Id: "user-1" },
                    ]),
                }),
            }),
        );
    });
});

describe("getSharedCalendarIdsForUser", () => {
    it("returns calendar IDs shared with user by owner", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1" },
            { calendarId: "cal-2" },
        ]);

        const result = await icsService.getSharedCalendarIdsForUser(
            "user-1",
            "owner-1",
        );

        expect(result).toEqual(["cal-1", "cal-2"]);
        expect(mockPrisma.calendarShare.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    sharedWithId: "user-1",
                    calendar: { userId: "owner-1" },
                },
            }),
        );
    });

    it("returns empty array when no calendars shared", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);
        const result = await icsService.getSharedCalendarIdsForUser(
            "user-1",
            "owner-1",
        );
        expect(result).toEqual([]);
    });
});
