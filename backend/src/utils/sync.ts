import { prisma } from "./db";
import { syncIcsCalendar } from "../syncs/ics";

export async function syncCalendar(calendarId: string) {
    const calendar = await prisma.calendar.findUnique({
        where: { id: calendarId },
    });
    if (!calendar) return;

    return syncIcsCalendar(calendar);
}

export async function runDueCalendars() {
    const now = new Date();
    const due = await prisma.calendar.findMany({
        where: {
            syncInterval: { gt: 0 },
            OR: [
                { lastSync: null },
                { lastSync: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
            ],
        },
    });

    for (const cal of due) {
        await syncCalendar(cal.id).catch(console.error);
    }
}
