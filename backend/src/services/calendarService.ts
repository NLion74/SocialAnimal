import { prisma } from "../utils/db";

export async function getUserCalendars(userId: string) {
    return prisma.calendar.findMany({
        where: { userId },
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
}

export async function findCalendarForUser(id: string, userId: string) {
    return prisma.calendar.findFirst({ where: { id, userId } });
}
