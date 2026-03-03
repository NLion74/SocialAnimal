import { describe, it, expect, beforeEach } from "vitest";
import { IcsHandler } from "../../src/handlers/ics";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { generateToken } from "../../src/utils/auth";

describe("IcsHandler basic behavior", () => {
    const handler = new IcsHandler();

    beforeEach(() => {
        resetMocks();
    });

    it("returns validation error for test without url", async () => {
        const result = await handler.test({});

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid ICS config");
    });

    it("returns import validation error when user is missing", async () => {
        const result = await handler.import({
            calendars: [{ name: "Team", url: "https://example.com/team.ics" }],
        });

        expect(result).toEqual({
            success: false,
            error: "userId, name, and url/config.url are required",
            eventsSynced: 0,
        });
    });

    it("creates link export for calendar shared with requester", async () => {
        const token = generateToken("user-1");

        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "titles" }],
        });

        const result = await handler.export({
            type: "link",
            calendarId: "cal-1",
            userId: "user-1",
            token,
        });

        expect(result).toEqual({
            url: expect.stringContaining(
                `/api/providers/ics/export/cal-1?token=${encodeURIComponent(token)}`,
            ),
        });
    });

    it("masks subscription event details based on share permission", async () => {
        const token = generateToken("user-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "busy" }],
        });
        mockPrisma.event.findMany.mockResolvedValue([
            {
                id: "evt-1",
                externalId: "ext-1",
                title: "Private Meeting",
                description: "Confidential notes",
                location: "Room 101",
                startTime: new Date("2026-03-03T10:00:00.000Z"),
                endTime: new Date("2026-03-03T11:00:00.000Z"),
            },
        ]);

        const result = await handler.export({
            calendarId: "cal-1",
            subscription: true,
            token,
        });

        expect(result.body).toContain("SUMMARY:Busy");
        expect(result.body).not.toContain("DESCRIPTION:");
        expect(result.body).not.toContain("LOCATION:");
    });
});
