import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockCalendar,
    createMockEvent,
    createMockUser,
    createMockFriendship,
} from "../helpers/factories";
import * as exportService from "../../src/services/exportService";
import { createQueryToken } from "../helpers/auth";

beforeEach(() => resetMocks());

describe("userFromToken", () => {
    it("returns user when token is valid", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue({
            id: user.id,
            name: user.name,
            email: user.email,
        });

        const result = await exportService.userFromToken(
            createQueryToken(user.id),
        );

        expect(result).not.toBeNull();
        expect(result?.id).toBe(user.id);
    });

    it("returns null for invalid token", async () => {
        expect(await exportService.userFromToken("not-a-token")).toBeNull();
    });

    it("returns null for undefined token", async () => {
        expect(await exportService.userFromToken(undefined)).toBeNull();
    });

    it("returns null when user no longer exists", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(null);
        expect(
            await exportService.userFromToken(createQueryToken(user.id)),
        ).toBeNull();
    });
});

describe("getUserBasicInfo", () => {
    it("returns id, name and email", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue({
            id: user.id,
            name: user.name,
            email: user.email,
        });

        const result = await exportService.getUserBasicInfo(user.id);

        expect(result?.id).toBe(user.id);
        expect(result?.name).toBeDefined();
        expect(result?.email).toBeDefined();
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: user.id },
            select: { id: true, name: true, email: true },
        });
    });

    it("returns null when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        expect(await exportService.getUserBasicInfo("ghost")).toBeNull();
    });
});

describe("getUserEvents", () => {
    it("returns all events owned by user across calendars", async () => {
        const events = [createMockEvent("cal-1"), createMockEvent("cal-2")];
        mockPrisma.event.findMany.mockResolvedValue(events);

        const result = await exportService.getUserEvents("user-1");

        expect(result).toHaveLength(2);
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendar: { userId: "user-1" } },
                orderBy: { startTime: "asc" },
            }),
        );
    });

    it("returns empty array when user has no events", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);
        expect(await exportService.getUserEvents("user-1")).toEqual([]);
    });

    it("selects only required fields", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);
        await exportService.getUserEvents("user-1");

        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                select: {
                    id: true,
                    title: true,
                    startTime: true,
                    endTime: true,
                    allDay: true,
                    description: true,
                    location: true,
                    createdAt: true,
                },
            }),
        );
    });
});

describe("getEventsByCalendarId", () => {
    it("returns events for the given calendar", async () => {
        const events = [createMockEvent("cal-1")];
        mockPrisma.event.findMany.mockResolvedValue(events);

        const result = await exportService.getEventsByCalendarId("cal-1");

        expect(result).toHaveLength(1);
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendarId: "cal-1" },
                orderBy: { startTime: "asc" },
            }),
        );
    });

    it("returns empty array for unknown calendar", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);
        expect(await exportService.getEventsByCalendarId("unknown")).toEqual(
            [],
        );
    });
});

describe("findAccessibleCalendar", () => {
    it("finds calendar owned by user", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        const result = await exportService.findAccessibleCalendar(
            calendar.id,
            "user-1",
        );

        expect(result).not.toBeNull();
        expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: calendar.id,
                    OR: [
                        { userId: "user-1" },
                        { shares: { some: { sharedWithId: "user-1" } } },
                    ],
                },
            }),
        );
    });

    it("finds calendar shared with user", async () => {
        const calendar = createMockCalendar("other-user");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);

        expect(
            await exportService.findAccessibleCalendar(calendar.id, "user-1"),
        ).not.toBeNull();
    });

    it("returns null when calendar is inaccessible", async () => {
        mockPrisma.calendar.findFirst.mockResolvedValue(null);
        expect(
            await exportService.findAccessibleCalendar("cal-1", "user-1"),
        ).toBeNull();
    });

    it("selects only required fields", async () => {
        mockPrisma.calendar.findFirst.mockResolvedValue(null);
        await exportService.findAccessibleCalendar("cal-1", "user-1");

        expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                select: { id: true, name: true, userId: true },
            }),
        );
    });
});

describe("ensureFriendship", () => {
    it("returns true for accepted friendship", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship("user-1", "user-2", { status: "accepted" }),
        );
        expect(await exportService.ensureFriendship("user-1", "user-2")).toBe(
            true,
        );
    });

    it("returns false when no friendship exists", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        expect(await exportService.ensureFriendship("user-1", "user-2")).toBe(
            false,
        );
    });

    it("returns false for pending friendship", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        expect(await exportService.ensureFriendship("user-1", "user-2")).toBe(
            false,
        );
    });

    it("checks friendship in both directions", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        await exportService.ensureFriendship("user-1", "user-2");

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

describe("getSharedCalendars", () => {
    it("returns calendar IDs with their permission levels", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
            { calendarId: "cal-2", permission: "titles" },
            { calendarId: "cal-3", permission: "busy" },
        ]);

        const result = await exportService.getSharedCalendars(
            "user-1",
            "owner-1",
        );

        expect(result).toEqual([
            { calendarId: "cal-1", permission: "full" },
            { calendarId: "cal-2", permission: "titles" },
            { calendarId: "cal-3", permission: "busy" },
        ]);
    });

    it("defaults to full permission when permission is null", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: null },
        ]);

        const result = await exportService.getSharedCalendars(
            "user-1",
            "owner-1",
        );

        expect(result[0].permission).toBe("full");
    });

    it("queries with correct sharedWithId and ownerId", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);
        await exportService.getSharedCalendars("user-1", "owner-1");

        expect(mockPrisma.calendarShare.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    sharedWithId: "user-1",
                    calendar: { userId: "owner-1" },
                },
            }),
        );
    });

    it("returns empty array when nothing is shared", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);
        expect(
            await exportService.getSharedCalendars("user-1", "owner-1"),
        ).toEqual([]);
    });
});

describe("getSharedEventsForUser", () => {
    it("returns empty array when user has no shared calendars", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result).toEqual([]);
        expect(mockPrisma.calendarShare.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { sharedWithId: "user-1" },
            }),
        );
    });

    it("does not crash when prisma returns undefined (defensive default)", async () => {
        // Simulate missing mock / broken prisma
        mockPrisma.calendarShare.findMany.mockResolvedValue(undefined as any);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result).toEqual([]);
    });

    it("returns full event details when permission is full", async () => {
        const event = createMockEvent("cal-1", {
            title: "Meeting",
            description: "Secret",
            location: "HQ",
        });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
        ]);

        mockPrisma.event.findMany.mockResolvedValue([event]);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result).toHaveLength(1);
        expect(result[0].title).toBe("Meeting");
        expect(result[0].description).toBe("Secret");
        expect(result[0].location).toBe("HQ");
    });

    it("strips description and location for titles permission", async () => {
        const event = createMockEvent("cal-1", {
            title: "Meeting",
            description: "Secret",
            location: "HQ",
        });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "titles" },
        ]);

        mockPrisma.event.findMany.mockResolvedValue([event]);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result[0].title).toBe("Meeting");
        expect(result[0].description).toBeNull();
        expect(result[0].location).toBeNull();
    });

    it("replaces title and strips all details for busy permission", async () => {
        const event = createMockEvent("cal-1", {
            title: "Meeting",
            description: "Secret",
            location: "HQ",
        });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "busy" },
        ]);

        mockPrisma.event.findMany.mockResolvedValue([event]);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result[0].title).toBe("Busy");
        expect(result[0].description).toBeNull();
        expect(result[0].location).toBeNull();
    });

    it("defaults to full permission when permission is null", async () => {
        const event = createMockEvent("cal-1", {
            title: "Meeting",
            description: "Secret",
        });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: null },
        ]);

        mockPrisma.event.findMany.mockResolvedValue([event]);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result[0].title).toBe("Meeting");
        expect(result[0].description).toBe("Secret");
    });

    it("aggregates events from multiple shared calendars independently", async () => {
        const fullEvent = createMockEvent("cal-full", {
            title: "Visible",
            description: "Shown",
        });

        const busyEvent = createMockEvent("cal-busy", {
            title: "Hidden",
            description: "Hidden Desc",
        });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-full", permission: "full" },
            { calendarId: "cal-busy", permission: "busy" },
        ]);

        mockPrisma.event.findMany
            .mockResolvedValueOnce([fullEvent])
            .mockResolvedValueOnce([busyEvent]);

        const result = await exportService.getSharedEventsForUser("user-1");

        expect(result).toHaveLength(2);

        expect(result).toContainEqual(
            expect.objectContaining({
                title: "Visible",
                description: "Shown",
            }),
        );

        expect(result).toContainEqual(
            expect.objectContaining({
                title: "Busy",
                description: null,
            }),
        );
    });

    it("queries events by calendarId for each shared calendar", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([
            { calendarId: "cal-1", permission: "full" },
            { calendarId: "cal-2", permission: "full" },
        ]);

        mockPrisma.event.findMany.mockResolvedValue([]);

        await exportService.getSharedEventsForUser("user-1");

        expect(mockPrisma.event.findMany).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: { calendarId: "cal-1" },
            }),
        );

        expect(mockPrisma.event.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: { calendarId: "cal-2" },
            }),
        );
    });
});
