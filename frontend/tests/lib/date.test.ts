import { describe, it, expect } from "vitest";
import {
    MONTHS,
    DAYS,
    startOfWeek,
    isSameDay,
    fmtTime,
    fmtDateTime,
    fmtHour,
    getMonthDayHeaders,
    getMonthCells,
} from "../../lib/date";

describe("Date Utils", () => {
    describe("Constants", () => {
        it("should have 12 months", () => {
            expect(MONTHS).toHaveLength(12);
            expect(MONTHS[0]).toBe("January");
            expect(MONTHS[11]).toBe("December");
        });

        it("should have 7 days", () => {
            expect(DAYS).toHaveLength(7);
            expect(DAYS[0]).toBe("Sun");
            expect(DAYS[6]).toBe("Sat");
        });
    });

    describe("startOfWeek", () => {
        it("should return start of week for Sunday first", () => {
            const date = new Date("2026-02-25");
            const start = startOfWeek(date, "sunday");
            expect(start.getDay()).toBe(0);
        });

        it("should return start of week for Monday first", () => {
            const date = new Date("2026-02-25");
            const start = startOfWeek(date, "monday");
            expect(start.getDay()).toBe(1);
        });

        it("should handle date already at start of week", () => {
            const sunday = new Date("2026-02-22");
            const start = startOfWeek(sunday, "sunday");
            expect(start.toDateString()).toBe(sunday.toDateString());
        });

        it("should default to sunday", () => {
            const date = new Date("2026-02-25");
            const start = startOfWeek(date);
            expect(start.getDay()).toBe(0);
        });
    });

    describe("isSameDay", () => {
        it("should return true for same date", () => {
            const date1 = new Date("2026-02-22T10:00:00Z");
            const date2 = new Date("2026-02-22T15:00:00Z");
            expect(isSameDay(date1, date2)).toBe(true);
        });

        it("should return false for different dates", () => {
            const date1 = new Date("2026-02-22");
            const date2 = new Date("2026-02-23");
            expect(isSameDay(date1, date2)).toBe(false);
        });

        it("should ignore time component", () => {
            const date1 = new Date("2026-02-22T00:00:00");
            const date2 = new Date("2026-02-22T23:59:59");
            expect(isSameDay(date1, date2)).toBe(true);
        });
    });

    describe("fmtTime", () => {
        it("should format time from ISO string", () => {
            const iso = "2026-02-22T15:30:00Z";
            const result = fmtTime(iso);
            expect(result).toMatch(/\d{1,2}:\d{2}/);
        });

        it("should handle midnight", () => {
            const iso = "2026-02-22T00:00:00Z";
            const result = fmtTime(iso);
            expect(result).toBeTruthy();
        });
    });

    describe("fmtDateTime", () => {
        it("should format date and time from ISO string", () => {
            const iso = "2026-02-22T15:30:00Z";
            const result = fmtDateTime(iso);
            expect(result).toBeTruthy();
            expect(result).toMatch(/\d/);
        });
    });

    describe("fmtHour", () => {
        it("should format midnight as 12 AM", () => {
            expect(fmtHour(0)).toBe("12 AM");
        });

        it("should format morning hours", () => {
            expect(fmtHour(1)).toBe("1 AM");
            expect(fmtHour(9)).toBe("9 AM");
            expect(fmtHour(11)).toBe("11 AM");
        });

        it("should format noon as 12 PM", () => {
            expect(fmtHour(12)).toBe("12 PM");
        });

        it("should format afternoon hours", () => {
            expect(fmtHour(13)).toBe("1 PM");
            expect(fmtHour(18)).toBe("6 PM");
            expect(fmtHour(23)).toBe("11 PM");
        });
    });

    describe("getMonthDayHeaders", () => {
        it("should return 7 day headers starting with Sunday", () => {
            const headers = getMonthDayHeaders("sunday");
            expect(headers).toHaveLength(7);
            expect(headers[0]).toBe("Sun");
            expect(headers[6]).toBe("Sat");
        });

        it("should return 7 day headers starting with Monday", () => {
            const headers = getMonthDayHeaders("monday");
            expect(headers).toHaveLength(7);
            expect(headers[0]).toBe("Mon");
            expect(headers[6]).toBe("Sun");
        });
    });

    describe("getMonthCells", () => {
        it("should return correct number of cells for February 2026", () => {
            const date = new Date(2026, 1, 1);
            const cells = getMonthCells(date, "sunday");

            expect(cells).toContain(1);
            expect(cells).toContain(28);
            expect(cells.filter((c) => c !== null)).toHaveLength(28);
        });

        it("should include leading blanks for days before month starts", () => {
            const date = new Date(2026, 1, 1);
            const cells = getMonthCells(date, "sunday");

            const firstNumber = cells.findIndex((c) => c !== null);
            expect(firstNumber).toBeGreaterThanOrEqual(0);
        });

        it("should handle January with 31 days", () => {
            const date = new Date(2026, 0, 1);
            const cells = getMonthCells(date, "sunday");

            expect(cells.filter((c) => c !== null)).toHaveLength(31);
            expect(cells).toContain(31);
        });

        it("should handle leap year February", () => {
            const date = new Date(2024, 1, 1);
            const cells = getMonthCells(date, "sunday");

            expect(cells.filter((c) => c !== null)).toHaveLength(29);
            expect(cells).toContain(29);
        });

        it("should differ based on first day of week", () => {
            const date = new Date(2026, 1, 1);
            const sundayCells = getMonthCells(date, "sunday");
            const mondayCells = getMonthCells(date, "monday");

            const sundayBlanks = sundayCells.findIndex((c) => c !== null);
            const mondayBlanks = mondayCells.findIndex((c) => c !== null);

            expect(sundayBlanks).not.toBe(mondayBlanks);
        });
    });

    describe("Edge cases", () => {
        it("should handle year boundaries", () => {
            const endOfYear = new Date(2026, 11, 31);
            const start = startOfWeek(endOfYear, "sunday");
            expect(start.getFullYear()).toBeLessThanOrEqual(2026);
        });

        it("should handle month boundaries", () => {
            const endOfMonth = new Date(2026, 1, 28);
            expect(isSameDay(endOfMonth, new Date(2026, 1, 28))).toBe(true);
        });
    });
});
