import { FastifyPluginAsync } from "fastify";
import { authenticateToken } from "../utils/auth";
import { prisma } from "../utils/db";
import ical from "node-ical";

const calendarsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", authenticateToken);

    fastify.get("/", async (request) => {
        return prisma.calendar.findMany({
            where: { userId: (request as any).user.id },
            include: {
                events: {
                    select: {
                        id: true,
                        title: true,
                        startTime: true,
                        endTime: true,
                        allDay: true,
                    },
                },
            },
        });
    });

    fastify.post("/", async (request, reply) => {
        const { name, type, url } = request.body as any;

        if (!name || !type) {
            return reply.status(400).send({ error: "Name and type required" });
        }

        const calendar = await prisma.calendar.create({
            data: {
                userId: (request as any).user.id,
                name,
                type,
                url: url || null,
                config: {},
            },
        });

        if (type === "ics_url" && url) {
            try {
                const count = await syncIcsCalendar(calendar.id, url);
                await prisma.calendar.update({
                    where: { id: calendar.id },
                    data: { lastSync: new Date() },
                });
                fastify.log.info(
                    `Auto-synced ${count} events for calendar ${calendar.id}`,
                );
            } catch (err) {
                fastify.log.error(`Auto-sync failed: ${err}`);
            }
        }

        return reply.status(201).send(
            await prisma.calendar.findUnique({
                where: { id: calendar.id },
                include: {
                    events: {
                        select: {
                            id: true,
                            title: true,
                            startTime: true,
                            endTime: true,
                            allDay: true,
                        },
                    },
                },
            }),
        );
    });

    fastify.post("/:id/sync", async (request, reply) => {
        const { id } = request.params as any;

        const calendar = await prisma.calendar.findFirst({
            where: { id, userId: (request as any).user.id },
        });

        if (!calendar)
            return reply.status(404).send({ error: "Calendar not found" });
        if (calendar.type !== "ics_url" || !calendar.url) {
            return reply
                .status(400)
                .send({ error: "Calendar does not support sync" });
        }

        const count = await syncIcsCalendar(calendar.id, calendar.url);

        await prisma.calendar.update({
            where: { id },
            data: { lastSync: new Date() },
        });

        return { message: `Synced ${count} events` };
    });

    fastify.delete("/:id", async (request, reply) => {
        const { id } = request.params as any;

        const calendar = await prisma.calendar.findFirst({
            where: { id, userId: (request as any).user.id },
        });

        if (!calendar)
            return reply.status(404).send({ error: "Calendar not found" });

        await prisma.event.deleteMany({ where: { calendarId: id } });
        await prisma.calendar.delete({ where: { id } });

        return reply.status(204).send();
    });
};

async function syncIcsCalendar(
    calendarId: string,
    url: string,
): Promise<number> {
    const rawEvents = await ical.async.fromURL(url);
    let count = 0;

    for (const event of Object.values(rawEvents)) {
        if (event.type !== "VEVENT") continue;
        if (!event.start) continue;

        const externalId =
            event.uid ?? `${calendarId}-${event.start.toISOString()}`;
        const startTime = new Date(event.start);
        const endTime = event.end ? new Date(event.end) : startTime;
        const allDay = (event.start as any).dateOnly === true;

        await prisma.event.upsert({
            where: { calendarId_externalId: { calendarId, externalId } },
            update: {
                title: event.summary ?? "Untitled",
                description:
                    typeof event.description === "string"
                        ? event.description
                        : null,
                location:
                    typeof event.location === "string" ? event.location : null,
                startTime,
                endTime,
                allDay,
            },
            create: {
                calendarId,
                externalId,
                title: event.summary ?? "Untitled",
                description:
                    typeof event.description === "string"
                        ? event.description
                        : null,
                location:
                    typeof event.location === "string" ? event.location : null,
                startTime,
                endTime,
                allDay,
            },
        });
        count++;
    }

    return count;
}

export default calendarsRoutes;
