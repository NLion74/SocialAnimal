import { providerFetch } from "../../../core/http/provider-fetch";
import ical from "node-ical";

export interface IcsConfig {
	url: string;
	username?: string;
	password?: string;
}

type VEvent = any;

type FloatingHint = {
	raw: string;
	floating: boolean;
};

type FloatingHints = {
	byUid: Record<string, { start?: FloatingHint; end?: FloatingHint }>;
	calendarTimeZone?: string;
};

export class IcsAdapter {
	getType(): string {
		return "ics";
	}

	private getConfig(config: any): IcsConfig {
		if (!this.validateConfig(config)) {
			throw new Error("Invalid ICS config");
		}

		return config as IcsConfig;
	}

	protected validateConfig(config: any): boolean {
		if (!config || typeof config !== "object") return false;
		return typeof config.url === "string";
	}

	public async fetchEvents(calendar: {
		id: string;
		config: IcsConfig;
		user?: { settings?: { timezone?: string } };
	}): Promise<any[]> {
		const config = this.getConfig(calendar.config);
		const userTimezone = (calendar as any)?.user?.settings?.timezone;
		const icsText = await this.fetchIcs(config);
		const hints = this.extractFloatingHints(icsText);
		const events = this.extractEvents(ical.parseICS(icsText));

		return events.map((e: VEvent) => ({
			externalId: e.uid || `${calendar.id}-${e.start.toISOString()}`,
			summary: e.summary || "Untitled",
			description: e.description || null,
			location: e.location || null,
			startTime: this.resolveDate(
				e.start,
				e.datetype === "date",
				e.uid,
				"start",
				hints,
				userTimezone,
			),
			endTime: this.resolveDate(
				e.end,
				e.datetype === "date",
				e.uid,
				"end",
				hints,
				userTimezone,
			),
			allDay: e.datetype === "date",
		}));
	}

	private resolveDate(
		value: Date,
		isAllDay: boolean,
		uid: string | undefined,
		field: "start" | "end",
		hints: FloatingHints,
		userTimezone?: string,
	): Date {
		if (isAllDay) return new Date(value);

		const withTz = value as Date & { tz?: string; dateOnly?: true };

		if (withTz.tz || withTz.dateOnly) {
			return new Date(value);
		}

		const hint = uid ? hints.byUid[uid]?.[field] : undefined;

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

	private normalizeUrl(raw: string): string {
		if (raw.startsWith("webcal://")) return "https://" + raw.slice(9);
		if (!raw.includes("://")) return "https://" + raw;
		return raw;
	}

	private extractEvents(raw: Record<string, VEvent>): VEvent[] {
		const events = Object.values(raw).filter(
			(e: any) => e?.type === "VEVENT",
		);

		if (events.some((e) => !e.start || !e.end))
			throw new Error("Incomplete provider snapshot");

		return events;
	}

	private async fetchIcs(
		config: IcsConfig,
		timeoutMs = 15000,
	): Promise<string> {
		if (!config?.url) throw new Error("No ICS URL provided");

		const headers: Record<string, string> = {};

		if (config.username && config.password) {
			headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
		}

		const response = await providerFetch(this.normalizeUrl(config.url), {
			headers,
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (response.status === 401 || response.status === 403)
			throw new Error("PROVIDER_AUTH_FAILED");

		if (!response.ok) throw new Error("PROVIDER_UNAVAILABLE");

		const text = await response.text();

		if (
			!text.includes("BEGIN:VCALENDAR") ||
			!text.includes("END:VCALENDAR")
		)
			throw new Error("Invalid ICS data");

		return text;
	}
}
