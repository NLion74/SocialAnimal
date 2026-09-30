import { obj, str, nullableString, integer, bool, date } from "../../core/http";

export const calendarSchema = obj(
	{
		id: str,
		name: str,
		type: str,
		connectionId: nullableString,
		remoteId: nullableString,
		syncInterval: integer,
		eventCount: integer,
		lastSync: nullableString,
		lastAttempt: nullableString,
		lastSuccess: nullableString,
		lastError: nullableString,
	},
	["id", "name", "type", "syncInterval"],
);

export const eventSchema = obj({
	id: str,
	calendarId: str,
	title: str,
	description: nullableString,
	location: nullableString,
	startTime: date,
	endTime: date,
	allDay: bool,
	isFriend: bool,
	calendar: obj({ id: str, name: str, type: str }),
	owner: obj({ id: str, email: str, name: nullableString }),
});

export const syncSchema = obj(
	{
		id: str,
		calendarId: str,
		status: str,
		eventsSynced: { type: ["integer", "null"] },
		error: nullableString,
		statusUrl: str,
	},
	["id", "calendarId", "status"],
);
