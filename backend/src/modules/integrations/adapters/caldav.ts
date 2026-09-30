import { createDAVClient } from "tsdav";
import type { DAVCalendar, DAVCalendarObject } from "tsdav";
import ical from "node-ical";

export interface CaldavConfig {
	url: string;
	username?: string;
	password?: string;
	calendarPath?: string;
}

type ParsedEvent = {
	externalId: string;
	summary: string;
	description: string | null;
	location: string | null;
	startTime: Date;
	endTime: Date;
	allDay: boolean;
};

type FloatingHint = {
	raw: string;
	floating: boolean;
};

type FloatingHints = {
	byUid: Record<string, { start?: FloatingHint; end?: FloatingHint }>;
	calendarTimeZone?: string;
};

function extractServerRoot(url: string): string {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}`;
}

function normalizeUrl(url: string): string {
	return url.replace(/\/$/, "");
}

export class CaldavAdapter {
	private validateConfig(config: any): config is CaldavConfig {
		return !!(
			config &&
			typeof config.url === "string" &&
			config.url.length > 0
		);
	}

	private async createClient(config: CaldavConfig): Promise<any> {
		return createDAVClient({
			serverUrl: extractServerRoot(config.url),
			credentials: {
				username: config.username || "",
				password: config.password || "",
			},
			authMethod: "Basic",
			defaultAccountType: "caldav",
			fetch: async (url: string, init: RequestInit = {}) => {
				const response = await fetch(url, {
					...init,
					signal: AbortSignal.timeout(60000),
				});

				if (response.status === 401 || response.status === 403)
					throw new Error("PROVIDER_AUTH_FAILED");

				if (response.status >= 500)
					throw new Error("PROVIDER_UNAVAILABLE");

				return response;
			},
		});
	}

	private parseICalData(
		icalData: string,
		userTimezone?: string,
	): ParsedEvent[] {
		const parsed = ical.parseICS(icalData);
		const events: ParsedEvent[] = [];
		const hints = this.extractFloatingHints(icalData);

		for (const component of Object.values(parsed) as any[]) {
			if (!component || component.type !== "VEVENT") continue;

			if (!component.uid || !component.start || !component.end)
				throw new Error("Incomplete provider event");

			const allDay = component.datetype === "date";

			events.push({
				externalId: String(component.uid),
				summary: String(component.summary || "Untitled"),
				description: component.description
					? String(component.description)
					: null,
				location: component.location
					? String(component.location)
					: null,
				startTime: this.resolveDate(
					component.start,
					allDay,
					String(component.uid),
					"start",
					hints,
					userTimezone,
				),
				endTime: this.resolveDate(
					component.end,
					allDay,
					String(component.uid),
					"end",
					hints,
					userTimezone,
				),
				allDay,
			});
		}

		return events;
	}

	private resolveDate(
		value: Date,
		isAllDay: boolean,
		uid: string,
		field: "start" | "end",
		hints: FloatingHints,
		userTimezone?: string,
	): Date {
		if (isAllDay) return new Date(value);

		const withTz = value as Date & { tz?: string; dateOnly?: true };

		if (withTz.tz || withTz.dateOnly) {
			return new Date(value);
		}

		const hint = hints.byUid[uid]?.[field];

		if (!hint?.floating) {
			return new Date(value);
		}

		const tz = hints.calendarTimeZone || userTimezone;

		if (!tz) {
			return new Date(value);
		}

		return this.floatingToUtc(hint.raw, tz);
	}

	private extractFloatingHints(icsText: string): FloatingHints {
		const lines = icsText
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		const byUid: FloatingHints["byUid"] = {};
		const calendarTimeZone = this.extractCalendarTimeZone(lines);

		let inEvent = false;
		let uid: string | undefined;
		let start: FloatingHint | undefined;
		let end: FloatingHint | undefined;

		const flush = () => {
			if (!uid) return;

			byUid[uid] = {
				...(start ? { start } : {}),
				...(end ? { end } : {}),
			};
		};

		for (const line of lines) {
			if (line === "BEGIN:VEVENT") {
				inEvent = true;
				uid = undefined;
				start = undefined;
				end = undefined;
				continue;
			}

			if (line === "END:VEVENT") {
				flush();
				inEvent = false;
				uid = undefined;
				start = undefined;
				end = undefined;
				continue;
			}

			if (!inEvent) continue;

			if (line.startsWith("UID:")) {
				uid = line.slice(4).trim();
				continue;
			}

			const parseField = (prefix: string): FloatingHint | undefined => {
				if (!line.startsWith(prefix)) return undefined;
				const colon = line.indexOf(":");
				if (colon < 0) return undefined;
				const left = line.slice(0, colon);
				const raw = line.slice(colon + 1).trim();
				const isDateOnly = /(?:^|;)VALUE=DATE(?:;|$)/.test(left);
				const hasTzid = /(?:^|;)TZID=/.test(left);
				const hasZoneSuffix = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);

				const floating =
					!isDateOnly &&
					!hasTzid &&
					!hasZoneSuffix &&
					/^\d{8}T\d{6}$/.test(raw);

				return { raw, floating };
			};

			start = start ?? parseField("DTSTART");
			end = end ?? parseField("DTEND");
		}

		return { byUid, ...(calendarTimeZone ? { calendarTimeZone } : {}) };
	}

	private extractCalendarTimeZone(lines: string[]): string | undefined {
		for (const line of lines) {
			if (line.startsWith("X-WR-TIMEZONE:")) {
				const tz = line.slice("X-WR-TIMEZONE:".length).trim();
				if (tz) return tz;
			}

			if (line.startsWith("TIMEZONE-ID:")) {
				const tz = line.slice("TIMEZONE-ID:".length).trim();
				if (tz) return tz;
			}
		}

		let inVTimeZone = false;

		for (const line of lines) {
			if (line === "BEGIN:VTIMEZONE") {
				inVTimeZone = true;
				continue;
			}

			if (line === "END:VTIMEZONE") {
				inVTimeZone = false;
				continue;
			}

			if (inVTimeZone && line.startsWith("TZID:")) {
				const tz = line.slice("TZID:".length).trim();
				if (tz) return tz;
			}
		}

		return undefined;
	}

	private floatingToUtc(raw: string, timeZone: string): Date {
		const y = Number(raw.slice(0, 4));
		const m = Number(raw.slice(4, 6)) - 1;
		const d = Number(raw.slice(6, 8));
		const h = Number(raw.slice(9, 11));
		const min = Number(raw.slice(11, 13));
		const sec = Number(raw.slice(13, 15));

		let utcTs = Date.UTC(y, m, d, h, min, sec);

		for (let i = 0; i < 2; i++) {
			const offset = this.timeZoneOffsetMs(new Date(utcTs), timeZone);
			const adjusted = Date.UTC(y, m, d, h, min, sec) - offset;
			if (adjusted === utcTs) break;
			utcTs = adjusted;
		}

		return new Date(utcTs);
	}

	private timeZoneOffsetMs(value: Date, timeZone: string): number {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour12: false,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).formatToParts(value);

		const map: Record<string, string> = {};

		for (const part of parts) {
			if (part.type !== "literal") map[part.type] = part.value;
		}

		const asUtc = Date.UTC(
			Number(map.year),
			Number(map.month) - 1,
			Number(map.day),
			Number(map.hour),
			Number(map.minute),
			Number(map.second),
		);

		return asUtc - value.getTime();
	}

	private async resolveTargetCalendar(
		client: any,
		config: CaldavConfig,
	): Promise<DAVCalendar | null> {
		const targetUrl = config.calendarPath || config.url;
		let discovered: DAVCalendar[] = [];

		try {
			discovered = await client.fetchCalendars();
		} catch {
			return { url: targetUrl } as DAVCalendar;
		}

		if (!discovered.length) {
			return { url: targetUrl } as DAVCalendar;
		}

		const exact = discovered.find(
			(c: DAVCalendar) => normalizeUrl(c.url) === normalizeUrl(targetUrl),
		);

		if (exact) return exact;

		return { url: targetUrl } as DAVCalendar;
	}

	public async fetchEvents(
		config: CaldavConfig,
		userTimezone?: string,
	): Promise<ParsedEvent[]> {
		const client = await this.createClient(config);
		const target = await this.resolveTargetCalendar(client, config);
		if (!target) return [];

		const objects = await client.fetchCalendarObjects({
			calendar: target,
			fetchOptions: { signal: AbortSignal.timeout(60000) },
		});

		const events: ParsedEvent[] = [];

		for (const obj of objects as DAVCalendarObject[]) {
			if (
				!obj.data ||
				!obj.data.includes("BEGIN:VCALENDAR") ||
				!obj.data.includes("END:VCALENDAR")
			)
				throw new Error("Incomplete provider snapshot");

			events.push(...this.parseICalData(obj.data, userTimezone));
		}

		return events;
	}

	async discover(config: CaldavConfig) {
		const client = await this.createClient(config);
		const calendars: DAVCalendar[] = await client.fetchCalendars();

		return calendars.map((c) => ({
			remoteId: c.url,
			name: String(c.displayName || "Calendar"),
			color:
				typeof c.calendarColor === "string"
					? c.calendarColor
					: undefined,
		}));
	}
}
