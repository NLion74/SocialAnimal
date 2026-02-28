import { describe, it, expect } from "vitest";
import { createMockEvent } from "../../helpers/factories";
import { IcsExporter } from "../../../src/exports/subscription/ics";
import type { ExportContext } from "../../../src/exports/subscription/base";

const exporter = new IcsExporter();

function makeCtx(overrides: Partial<ExportContext> = {}): ExportContext {
    return {
        calendarName: "Test Calendar",
        events: [],
        permission: "full",
        ...overrides,
    };
}

describe("IcsExporter metadata", () => {
    it("has id ics", () => expect(exporter.id).toBe("ics"));
    it("has correct mimeType", () =>
        expect(exporter.mimeType).toBe("text/calendar; charset=utf-8"));
    it("has correct fileExtension", () =>
        expect(exporter.fileExtension).toBe("ics"));
});

describe("serialize - structure", () => {
    it("always produces BEGIN/END VCALENDAR", () => {
        const result = exporter.serialize(makeCtx());
        expect(result).toContain("BEGIN:VCALENDAR");
        expect(result).toContain("END:VCALENDAR");
    });

    it("includes calendar name", () => {
        const result = exporter.serialize(
            makeCtx({ calendarName: "My Work Cal" }),
        );
        expect(result).toContain("My Work Cal");
    });

    it("produces no VEVENT when events is empty", () => {
        const result = exporter.serialize(makeCtx({ events: [] }));
        expect(result).not.toContain("BEGIN:VEVENT");
    });

    it("produces one VEVENT per event", () => {
        const events = [
            createMockEvent("cal-1", { id: "e1" }),
            createMockEvent("cal-1", { id: "e2" }),
            createMockEvent("cal-1", { id: "e3" }),
        ];
        const result = exporter.serialize(makeCtx({ events }));
        const count = (result.match(/BEGIN:VEVENT/g) ?? []).length;
        expect(count).toBe(3);
    });

    it("includes DTSTART and DTEND", () => {
        const events = [
            createMockEvent("cal-1", {
                startTime: new Date("2026-03-01T10:00:00Z"),
                endTime: new Date("2026-03-01T11:00:00Z"),
            }),
        ];
        const result = exporter.serialize(makeCtx({ events }));
        expect(result).toContain("DTSTART");
        expect(result).toContain("DTEND");
    });

    it("omits DESCRIPTION when null", () => {
        const events = [createMockEvent("cal-1", { description: null })];
        const result = exporter.serialize(makeCtx({ events }));
        expect(result).not.toContain("DESCRIPTION:");
    });

    it("omits LOCATION when null", () => {
        const events = [createMockEvent("cal-1", { location: null })];
        const result = exporter.serialize(makeCtx({ events }));
        expect(result).not.toContain("LOCATION:");
    });

    it("includes DESCRIPTION when present", () => {
        const events = [
            createMockEvent("cal-1", { description: "Some notes" }),
        ];
        const result = exporter.serialize(makeCtx({ events }));
        expect(result).toContain("Some notes");
    });

    it("includes LOCATION when present", () => {
        const events = [createMockEvent("cal-1", { location: "Room 1" })];
        const result = exporter.serialize(makeCtx({ events }));
        expect(result).toContain("Room 1");
    });
});

describe("serialize - full permission", () => {
    it("exposes title", () => {
        const events = [createMockEvent("cal-1", { title: "Secret Meeting" })];
        const result = exporter.serialize(
            makeCtx({ events, permission: "full" }),
        );
        expect(result).toContain("Secret Meeting");
    });

    it("exposes description", () => {
        const events = [
            createMockEvent("cal-1", { description: "Confidential" }),
        ];
        const result = exporter.serialize(
            makeCtx({ events, permission: "full" }),
        );
        expect(result).toContain("Confidential");
    });

    it("exposes location", () => {
        const events = [createMockEvent("cal-1", { location: "HQ Floor 3" })];
        const result = exporter.serialize(
            makeCtx({ events, permission: "full" }),
        );
        expect(result).toContain("HQ Floor 3");
    });
});

describe("serialize - titles permission", () => {
    const events = [
        createMockEvent("cal-1", {
            title: "Secret Meeting",
            description: "Confidential",
            location: "HQ Floor 3",
        }),
    ];

    it("exposes title", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "titles" }),
        );
        expect(result).toContain("Secret Meeting");
    });

    it("strips description", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "titles" }),
        );
        expect(result).not.toContain("Confidential");
    });

    it("strips location", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "titles" }),
        );
        expect(result).not.toContain("HQ Floor 3");
    });

    it("still has time blocks", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "titles" }),
        );
        expect(result).toContain("DTSTART");
        expect(result).toContain("DTEND");
    });
});

describe("serialize - busy permission", () => {
    const events = [
        createMockEvent("cal-1", {
            title: "Secret Meeting",
            description: "Confidential",
            location: "HQ Floor 3",
        }),
    ];

    it("replaces title with Busy", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "busy" }),
        );
        expect(result).toContain("Busy");
    });

    it("does not leak original title", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "busy" }),
        );
        expect(result).not.toContain("Secret Meeting");
    });

    it("strips description", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "busy" }),
        );
        expect(result).not.toContain("Confidential");
    });

    it("strips location", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "busy" }),
        );
        expect(result).not.toContain("HQ Floor 3");
    });

    it("still has time blocks", () => {
        const result = exporter.serialize(
            makeCtx({ events, permission: "busy" }),
        );
        expect(result).toContain("DTSTART");
        expect(result).toContain("DTEND");
    });
});

describe("mask", () => {
    const event = createMockEvent("cal-1", {
        title: "Team Meeting",
        description: "Discuss roadmap",
        location: "Room 42",
    });

    it("full - returns same reference", () => {
        expect(exporter.mask(event, "full")).toBe(event);
    });

    it("titles - keeps title", () => {
        expect(exporter.mask(event, "titles").title).toBe("Team Meeting");
    });

    it("titles - nulls description", () => {
        expect(exporter.mask(event, "titles").description).toBeNull();
    });

    it("titles - nulls location", () => {
        expect(exporter.mask(event, "titles").location).toBeNull();
    });

    it("titles - preserves time fields", () => {
        const result = exporter.mask(event, "titles");
        expect(result.startTime).toEqual(event.startTime);
        expect(result.endTime).toEqual(event.endTime);
        expect(result.allDay).toBe(event.allDay);
    });

    it("busy - sets title to Busy", () => {
        expect(exporter.mask(event, "busy").title).toBe("Busy");
    });

    it("busy - nulls description", () => {
        expect(exporter.mask(event, "busy").description).toBeNull();
    });

    it("busy - nulls location", () => {
        expect(exporter.mask(event, "busy").location).toBeNull();
    });

    it("busy - preserves time fields", () => {
        const result = exporter.mask(event, "busy");
        expect(result.startTime).toEqual(event.startTime);
        expect(result.endTime).toEqual(event.endTime);
        expect(result.allDay).toBe(event.allDay);
    });

    it("does not mutate original event", () => {
        exporter.mask(event, "busy");
        expect(event.title).toBe("Team Meeting");
        expect(event.description).toBe("Discuss roadmap");
        expect(event.location).toBe("Room 42");
    });
});

describe("maskAll", () => {
    it("applies mask to every event", () => {
        const events = [
            createMockEvent("cal-1", { title: "A" }),
            createMockEvent("cal-1", { title: "B" }),
            createMockEvent("cal-1", { title: "C" }),
        ];
        exporter.maskAll(events, "busy").forEach((e) => {
            expect(e.title).toBe("Busy");
        });
    });

    it("returns empty array for empty input", () => {
        expect(exporter.maskAll([], "busy")).toEqual([]);
    });

    it("does not mutate original array or events", () => {
        const events = [createMockEvent("cal-1", { title: "Original" })];
        exporter.maskAll(events, "busy");
        expect(events[0].title).toBe("Original");
    });

    it("returns a new array, not the original", () => {
        const events = [createMockEvent("cal-1")];
        const result = exporter.maskAll(events, "full");
        expect(result).not.toBe(events);
    });
});
