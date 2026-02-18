export type Permission = "busy" | "titles" | "full";

export function applyPermission(event: any, permission: Permission) {
    if (permission === "full") return event;
    if (permission === "titles") {
        const { description, location, ...rest } = event;
        return rest;
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
