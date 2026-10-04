import { type SyncWindow } from "./window";
import type { Credentials } from "../../../core/secrets";
import { IcsAdapter } from "./ics";
import { CaldavAdapter } from "./caldav";
import {
	googleFetch,
	googleDiscover,
	googleAuthUrl,
	exchangeCode,
} from "./google";

export type RemoteCalendar = { remoteId: string; name: string; color?: string };

export type RemoteEvent = {
	isRecurring?: boolean | null;
	externalId: string;
	title: string;
	description: string | null;
	location: string | null;
	startTime: Date;
	endTime: Date;
	allDay: boolean;
};

export type FetchResult =
	| {
			kind: "snapshot";
			complete: boolean;
			events: RemoteEvent[];
			coverage?: SyncWindow;
	  }
	| { kind: "delta"; events: RemoteEvent[]; deletedIds: string[] };

export interface Discoverable {
	discover(credentials: Credentials): Promise<RemoteCalendar[]>;
}

export interface Syncable {
	fetch(
		credentials: Credentials,
		remoteId: string,
		timezone?: string,
		window?: SyncWindow,
	): Promise<FetchResult>;
}

export interface Testable {
	test(credentials: Credentials): Promise<void>;
}

export interface Authorizable {
	authorize: {
		url(state: string): string;
		exchange(code: string): Promise<Credentials>;
	};
}

export interface Provider
	extends
		Partial<Discoverable>,
		Partial<Syncable>,
		Partial<Testable>,
		Partial<Authorizable> {
	name: string;
}

const snapshot = (
	events: RemoteEvent[],
	coverage?: SyncWindow,
): FetchResult => ({
	kind: "snapshot",
	complete: true,
	coverage,
	events,
});

const normalize = (e: any): RemoteEvent => ({
	externalId: e.externalId,
	isRecurring: e.isRecurring ?? null,
	title: e.summary,
	description: e.description,
	location: e.location,
	startTime: e.startTime,
	endTime: e.endTime,
	allDay: e.allDay,
});

const dav = new CaldavAdapter();

function davProvider(icloud = false): Provider {
	const config = (c: Credentials) => ({
		...c,
		url: icloud ? "https://caldav.icloud.com" : c.url,
	});

	return {
		name: icloud ? "Apple Calendar (iCloud)" : "CalDAV",
		discover: (c) => dav.discover(config(c)),
		test: async (c) => {
			await dav.discover(config(c));
		},
		fetch: async (c, remoteId, timezone, window) =>
			snapshot(
				(
					await dav.fetchEvents(
						{ ...config(c), calendarPath: remoteId },
						timezone,
						window,
					)
				).map(normalize),
				window,
			),
	};
}

export const registry: Record<string, Provider> = {
	ics: {
		name: "ICS / iCal Link",
		test: async (c) => {
			await new IcsAdapter().fetchEvents(
				{
					id: "feed",
					config: { ...c, url: c.url },
				},
				{
					start: new Date(),
					end: new Date(Date.now() + 86400000),
					pastDays: 0,
					futureDays: 1,
				},
			);
		},
		fetch: async (c, _id, timezone, window) =>
			snapshot(
				(
					await new IcsAdapter().fetchEvents(
						{
							id: "feed",
							config: { ...c, url: c.url },
							user: { settings: { timezone } },
						},
						window,
					)
				).map(normalize),
				window,
			),
	},
	caldav: davProvider(),
	icloud: davProvider(true),
	google: {
		name: "Google Calendar",
		discover: googleDiscover,
		test: async (c) => {
			await googleDiscover(c);
		},
		fetch: async (c, id, _timezone, window) =>
			snapshot(await googleFetch(c, id, window), window),
		authorize: { url: googleAuthUrl, exchange: exchangeCode },
	},
};
