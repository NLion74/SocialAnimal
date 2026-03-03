import { describe, expect, it } from "vitest";
import { applyPermission, isSharePermission } from "../../src/utils/permission";

describe("permission utils", () => {
    const baseEvent = {
        id: "evt-1",
        title: "Private Meeting",
        description: "Confidential notes",
        location: "Room 42",
        startTime: "2026-03-03T10:00:00.000Z",
        endTime: "2026-03-03T11:00:00.000Z",
        allDay: false,
        calendarId: "cal-1",
        owner: { id: "user-1" },
        isFriend: true,
    };

    it("recognizes valid share permissions", () => {
        expect(isSharePermission("full")).toBe(true);
        expect(isSharePermission("titles")).toBe(true);
        expect(isSharePermission("busy")).toBe(true);
    });

    it("rejects invalid share permissions", () => {
        expect(isSharePermission("owner")).toBe(false);
        expect(isSharePermission("")).toBe(false);
        expect(isSharePermission(undefined)).toBe(false);
        expect(isSharePermission(null)).toBe(false);
    });

    it("keeps all fields for full permission", () => {
        const result = applyPermission(baseEvent, "full");

        expect(result).toMatchObject({
            title: "Private Meeting",
            description: "Confidential notes",
            location: "Room 42",
        });
    });

    it("keeps title but hides sensitive fields for titles permission", () => {
        const result = applyPermission(baseEvent, "titles");

        expect(result.title).toBe("Private Meeting");
        expect(result).not.toHaveProperty("description");
        expect(result).not.toHaveProperty("location");
    });

    it("masks title and hides sensitive fields for busy permission", () => {
        const result = applyPermission(baseEvent, "busy");

        expect(result.title).toBe("Busy");
        expect(result).not.toHaveProperty("description");
        expect(result).not.toHaveProperty("location");
    });
});
