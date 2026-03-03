import { SharePermission } from "@prisma/client";

const SHARE_PERMISSIONS: SharePermission[] = ["busy", "titles", "full"];

export function isSharePermission(value: unknown): value is SharePermission {
    return (
        typeof value === "string" &&
        SHARE_PERMISSIONS.includes(value as SharePermission)
    );
}

export function applyPermission(event: any, permission: SharePermission) {
    if (permission === "full") return event;

    if (permission === "titles") {
        return {
            id: event.id,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
            calendarId: event.calendarId,
            calendar: event.calendar,
            owner: event.owner,
            isFriend: event.isFriend,
        };
    }

    return {
        id: event.id,
        title: "Busy",
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        calendarId: event.calendarId,
        calendar: event.calendar,
        owner: event.owner,
        isFriend: event.isFriend,
    };
}
