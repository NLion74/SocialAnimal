import { prisma } from "./db";
import { syncIcsCalendar } from "../syncs/ics";

type SyncDriver = (calendar: any) => Promise<void>;

const drivers: Record<string, SyncDriver> = {
    ics_url: syncIcsCalendar,
};

export async function syncCalendar(calendarId: string): Promise<void> {
    const calendar = await prisma.calendar.findUnique({
        where: { id: calendarId },
    });
    if (!calendar) throw new Error("Calendar not found");

    console.log(
        `[sync] calendar: ${calendar.name}, type: ${calendar.type}, config: ${JSON.stringify(calendar.config)}`,
    );

    const driver = drivers[calendar.type];
    if (!driver) throw new Error(`No sync driver for type: ${calendar.type}`);

    await driver(calendar);

    await prisma.calendar.update({
        where: { id: calendarId },
        data: { lastSync: new Date() },
    });
}

export async function runDueCalendars(): Promise<void> {
    const now = new Date();
    const calendars = await prisma.calendar.findMany({
        where: { syncInterval: { gt: 0 } },
    });
    for (const cal of calendars) {
        if (
            !cal.lastSync ||
            (now.getTime() - cal.lastSync.getTime()) / 60000 >= cal.syncInterval
        ) {
            await syncCalendar(cal.id).catch(console.error);
        }
    }
}
