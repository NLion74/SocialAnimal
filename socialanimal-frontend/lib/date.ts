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

export function startOfWeek(d: Date): Date {
    const n = new Date(d);
    n.setDate(d.getDate() - d.getDay());
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
