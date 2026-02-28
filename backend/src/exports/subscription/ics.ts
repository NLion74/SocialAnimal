import icalGenerator from "ical-generator";
import { SubscriptionExporter, ExportContext } from "./base";

export class IcsExporter extends SubscriptionExporter {
    readonly id = "ics";
    readonly label = "ICS Subscription Link";
    readonly mimeType = "text/calendar; charset=utf-8";
    readonly fileExtension = "ics";

    serialize(ctx: ExportContext): string {
        const cal = icalGenerator({ name: ctx.calendarName, timezone: "UTC" });
        for (const e of this.maskAll(ctx.events, ctx.permission)) {
            cal.createEvent({
                start: e.startTime,
                end: e.endTime,
                allDay: e.allDay,
                summary: e.title,
                description: e.description ?? undefined,
                location: e.location ?? undefined,
                id: e.id,
                stamp: e.createdAt,
            });
        }
        return cal.toString();
    }
}
