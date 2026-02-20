import { FirstDay } from "./types";

export const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function startOfWeek(d: Date, firstDay: FirstDay = "sunday"): Date {
    const n = new Date(d);
    const current = d.getDay();
    const shift = firstDay === "monday" ? (current + 6) % 7 : current;
    n.setDate(d.getDate() - shift);
    return n;
}

export function isSameDay(a: Date, b: Date): boolean {
    return a.toDateString() === b.toDateString();
}

export function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

export function fmtHour(hour: number): string {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
}

export function getMonthDayHeaders(firstDay: FirstDay): string[] {
    const offset = firstDay === "monday" ? 1 : 0;
    return Array.from({ length: 7 }, (_, i) => DAYS[(i + offset) % 7]);
}

export function getMonthCells(
    date: Date,
    firstDay: FirstDay,
): (number | null)[] {
    const y = date.getFullYear();
    const m = date.getMonth();
    const firstOfMonth = new Date(y, m, 1).getDay();
    const offset = firstDay === "monday" ? 1 : 0;
    const leadingBlanks = (firstOfMonth - offset + 7) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    return cells;
}
