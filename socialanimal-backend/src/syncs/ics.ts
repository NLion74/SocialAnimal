import ical from "node-ical";
import { prisma } from "../utils/db";

export async function syncIcsCalendar(calendar: any) {
    if (!calendar.config?.url) return;

    const data = await ical.async.fromURL(calendar.config.url);

    for (const entry of Object.values(data)) {
        const e = entry as any;
        if (e.type !== "VEVENT" || !e.start || !e.end) continue;

        const externalId = e.uid ?? `${calendar.id}-${e.start.toISOString()}`;

        await prisma.event.upsert({
            where: {
                calendarId_externalId: {
                    calendarId: calendar.id,
                    externalId,
                },
            },
            update: {
                title: e.summary ?? "Untitled",
                description: e.description ?? null,
                location: e.location ?? null,
                startTime: new Date(e.start),
                endTime: new Date(e.end),
                allDay: e.datetype === "date",
            },
            create: {
                calendarId: calendar.id,
                externalId,
                title: e.summary ?? "Untitled",
                description: e.description ?? null,
                location: e.location ?? null,
                startTime: new Date(e.start),
                endTime: new Date(e.end),
                allDay: e.datetype === "date",
            },
        });
    }

    await prisma.calendar.update({
        where: { id: calendar.id },
        data: { lastSync: new Date() },
    });
}
