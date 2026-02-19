import ical from "node-ical";
import { prisma } from "../utils/db";

export async function syncIcsCalendar(calendar: any) {
    if (!calendar.config?.url) return;

    let url = calendar.config.url;
    if (url.startsWith("webcal://")) {
        url = "https://" + url.slice(9);
    }

    const headers = calendar.config.password
        ? {
              Authorization: `Basic ${Buffer.from(
                  `${calendar.config.username || ""}:${calendar.config.password}`,
              ).toString("base64")}`,
          }
        : undefined;

    const rawData: any = await ical.async.fromURL(url, { headers });

    if (
        rawData == null ||
        typeof rawData !== "object" ||
        Array.isArray(rawData)
    ) {
        console.log(
            `No events found or parse error for calendar ${calendar.id}`,
        );
        await prisma.calendar.update({
            where: { id: calendar.id },
            data: { lastSync: new Date() },
        });
        return;
    }

    const data = rawData as Record<string, any>;

    const parsedEvents: {
        externalId: string;
        summary: string;
        description?: string;
        location?: string;
        startTime: Date;
        endTime: Date;
        allDay: boolean;
    }[] = [];

    for (const entry of Object.values(data)) {
        const e = entry as any;
        if (e.type !== "VEVENT" || !e.start || !e.end) continue;

        const externalId = e.uid ?? `${calendar.id}-${e.start.toISOString()}`;
        parsedEvents.push({
            externalId,
            summary: e.summary ?? "Untitled",
            description: e.description ?? null,
            location: e.location ?? null,
            startTime: new Date(e.start),
            endTime: new Date(e.end),
            allDay: e.datetype === "date",
        });
    }

    const uids = parsedEvents.map((e) => e.externalId);

    await prisma.$transaction(async (tx: any) => {
        await Promise.all(
            parsedEvents.map((ev) =>
                tx.event.upsert({
                    where: {
                        calendarId_externalId: {
                            calendarId: calendar.id,
                            externalId: ev.externalId,
                        },
                    },
                    update: {
                        title: ev.summary,
                        description: ev.description,
                        location: ev.location,
                        startTime: ev.startTime,
                        endTime: ev.endTime,
                        allDay: ev.allDay,
                    },
                    create: {
                        calendarId: calendar.id,
                        externalId: ev.externalId,
                        title: ev.summary,
                        description: ev.description,
                        location: ev.location,
                        startTime: ev.startTime,
                        endTime: ev.endTime,
                        allDay: ev.allDay,
                    },
                }),
            ),
        );

        if (uids.length > 0) {
            await tx.event.deleteMany({
                where: {
                    calendarId: calendar.id,
                    externalId: { notIn: uids },
                },
            });
        }

        await tx.calendar.update({
            where: { id: calendar.id },
            data: { lastSync: new Date() },
        });
    });
}
