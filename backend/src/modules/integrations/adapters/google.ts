import { type SyncWindow, maxSnapshotEvents } from "./window";
import { env, isGoogleConfigured } from "../../../core/config";
import type { Credentials } from "../../../core/secrets";

export function googleAuthUrl(state: string) {
	if (!isGoogleConfigured()) throw new Error("GOOGLE_NOT_CONFIGURED");
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

	url.search = new URLSearchParams({
		client_id: env.google.clientId!,
		redirect_uri: env.google.redirectUri!,
		response_type: "code",
		scope: "https://www.googleapis.com/auth/calendar.readonly",
		access_type: "offline",
		prompt: "consent",
		state,
	}).toString();

	return url.toString();
}

export async function exchangeCode(code: string): Promise<Credentials> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		signal: AbortSignal.timeout(20000),
		body: new URLSearchParams({
			code,
			client_id: env.google.clientId!,
			client_secret: env.google.clientSecret!,
			redirect_uri: env.google.redirectUri!,
			grant_type: "authorization_code",
		}),
	});

	if (!response.ok) throw new Error("PROVIDER_AUTH_FAILED");

	const data = (await response.json()) as {
		access_token: string;
		refresh_token?: string;
	};

	if (!data.access_token) throw new Error("PROVIDER_AUTH_FAILED");

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token || "",
	};
}

async function refresh(config: Credentials) {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		signal: AbortSignal.timeout(20000),
		body: new URLSearchParams({
			client_id: env.google.clientId!,
			client_secret: env.google.clientSecret!,
			refresh_token: config.refreshToken,
			grant_type: "refresh_token",
		}),
	});

	if (!response.ok) throw new Error("PROVIDER_AUTH_FAILED");
	const data = (await response.json()) as { access_token: string };
	if (!data.access_token) throw new Error("PROVIDER_AUTH_FAILED");
	config.accessToken = data.access_token;
}

async function get(config: Credentials, path: string) {
	const run = () =>
		fetch(`${env.google.apiUrl}${path}`, {
			headers: { Authorization: `Bearer ${config.accessToken}` },
			signal: AbortSignal.timeout(20000),
		});

	let response = await run();

	if (response.status === 401 && config.refreshToken) {
		await refresh(config);
		response = await run();
	}

	if (!response.ok)
		throw new Error(
			response.status === 401 || response.status === 403
				? "PROVIDER_AUTH_FAILED"
				: "PROVIDER_UNAVAILABLE",
		);

	return response.json() as Promise<{
		items?: any[];
		nextPageToken?: string;
	}>;
}

async function pages(
	config: Credentials,
	path: string,
	query: Record<string, string> = {},
) {
	const items: any[] = [];
	let token: string | undefined;

	do {
		const params = new URLSearchParams({
			...query,
			...(token ? { pageToken: token } : {}),
		});

		const result = await get(config, `${path}?${params}`);
		items.push(...(result.items || []));

		if (items.length > maxSnapshotEvents)
			throw new Error("Snapshot too large");

		token = result.nextPageToken;
	} while (token);

	return items;
}

export const googleDiscover = async (config: Credentials) =>
	(await pages(config, "/users/me/calendarList")).map((c) => ({
		remoteId: String(c.id),
		name: String(c.summary || "Calendar"),
		color: c.backgroundColor as string | undefined,
	}));

export const googleFetch = async (
	config: Credentials,
	remoteId: string,
	window?: SyncWindow,
) =>
	(
		await pages(
			config,
			`/calendars/${encodeURIComponent(remoteId)}/events`,
			{
				singleEvents: "true",
				maxResults: "2500",
				...(window
					? {
							timeMin: window.start.toISOString(),
							timeMax: window.end.toISOString(),
						}
					: {}),
			},
		)
	)
		.filter((e) => e.status !== "cancelled")
		.map((e) => ({
			externalId: String(e.id),
			isRecurring: !!(e.recurringEventId || e.recurrence?.length),
			title: String(e.summary || "Untitled"),
			description: e.description || null,
			location: e.location || null,
			startTime: new Date(e.start.dateTime || e.start.date),
			endTime: new Date(e.end.dateTime || e.end.date),
			allDay: !e.start.dateTime,
		}));
