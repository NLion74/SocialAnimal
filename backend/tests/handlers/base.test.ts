import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    resolveShareExportAccess,
    maskExportEventFields,
} from "../../src/handlers/providers/base";
import { generateToken } from "../../src/utils/auth";
import { mockPrisma } from "../setup";

function resetMocks() {
    vi.clearAllMocks();
}

describe("resolveShareExportAccess", () => {
    beforeEach(resetMocks);

    it("denies access when no token is provided", async () => {
        const result = await resolveShareExportAccess("cal-1");
        expect(result.allowed).toBe(false);
        expect(result.permission).toBe("busy");
        expect(result.userId).toBeUndefined();
    });

    it("denies access when token is undefined", async () => {
        const result = await resolveShareExportAccess("cal-1", undefined);
        expect(result.allowed).toBe(false);
    });

    it("denies access with an invalid/malformed token", async () => {
        const result = await resolveShareExportAccess(
            "cal-1",
            "not-a-valid-jwt",
        );
        expect(result.allowed).toBe(false);
        expect(result.permission).toBe("busy");
    });

    it("denies access with a tampered token", async () => {
        const token = generateToken("user-1");
        const tampered = token.slice(0, -5) + "xxxxx";
        const result = await resolveShareExportAccess("cal-1", tampered);
        expect(result.allowed).toBe(false);
    });

    it("denies access when calendar does not exist", async () => {
        const token = generateToken("user-1");
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const result = await resolveShareExportAccess("nonexistent-cal", token);
        expect(result.allowed).toBe(false);
        expect(result.userId).toBe("user-1");
    });

    it("allows full access when user owns the calendar", async () => {
        const token = generateToken("owner-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [],
        });

        const result = await resolveShareExportAccess("cal-1", token);
        expect(result.allowed).toBe(true);
        expect(result.permission).toBe("full");
        expect(result.userId).toBe("owner-1");
    });

    it("allows access with share permission when user has a share record", async () => {
        const token = generateToken("friend-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "titles" }],
        });

        const result = await resolveShareExportAccess("cal-1", token);
        expect(result.allowed).toBe(true);
        expect(result.permission).toBe("titles");
        expect(result.userId).toBe("friend-1");
    });

    it("denies access when user is not the owner and has no share record", async () => {
        const token = generateToken("stranger-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [],
        });

        const result = await resolveShareExportAccess("cal-1", token);
        expect(result.allowed).toBe(false);
        expect(result.userId).toBe("stranger-1");
    });

    it("returns busy permission for shared user with busy-only access", async () => {
        const token = generateToken("friend-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "busy" }],
        });

        const result = await resolveShareExportAccess("cal-1", token);
        expect(result.allowed).toBe(true);
        expect(result.permission).toBe("busy");
    });
});

describe("maskExportEventFields", () => {
    const baseEvent = {
        id: "evt-1",
        title: "Board Meeting",
        description: "Q4 financial review",
        location: "Conference Room A",
        startTime: new Date("2026-03-01T10:00:00Z"),
        endTime: new Date("2026-03-01T11:00:00Z"),
    };

    it("returns all fields with full permission", () => {
        const result = maskExportEventFields(baseEvent, "full");
        expect(result.title).toBe("Board Meeting");
        expect(result.description).toBe("Q4 financial review");
        expect(result.location).toBe("Conference Room A");
    });

    it("returns title but nullifies description/location with titles permission", () => {
        const result = maskExportEventFields(baseEvent, "titles");
        expect(result.title).toBe("Board Meeting");
        expect(result.description).toBeNull();
        expect(result.location).toBeNull();
    });

    it("replaces title with Busy and nullifies fields with busy permission", () => {
        const result = maskExportEventFields(baseEvent, "busy");
        expect(result.title).toBe("Busy");
        expect(result.description).toBeNull();
        expect(result.location).toBeNull();
    });

    it("defaults title to Untitled for titles permission when title is empty", () => {
        const emptyTitle = { ...baseEvent, title: "" };
        const result = maskExportEventFields(emptyTitle, "titles");
        expect(result.title).toBe("Untitled");
    });

    it("always returns Busy title for busy permission regardless of actual title", () => {
        const result = maskExportEventFields(
            { ...baseEvent, title: "Important" },
            "busy",
        );
        expect(result.title).toBe("Busy");
    });

    it("preserves non-masked fields across all permission levels", () => {
        for (const perm of ["full", "titles", "busy"] as const) {
            const result = maskExportEventFields(baseEvent, perm);
            expect(result.startTime).toEqual(baseEvent.startTime);
            expect(result.endTime).toEqual(baseEvent.endTime);
            expect(result.id).toBe(baseEvent.id);
        }
    });
});
