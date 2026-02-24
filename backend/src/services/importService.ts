import * as calendarService from "./calendarService";
import { syncCalendar, testCalendarConnection } from "../utils/sync";
import { env, isGoogleConfigured } from "../utils/env";
import type { SyncResult, TestResult } from "../types";
import type { Calendar } from "@prisma/client";

interface ImportIcsInput {
    userId: string;
    name: string;
    url?: string;
    config?: { url?: string; username?: string; password?: string };
}

interface ImportGoogleCalendarInput {
    userId: string;
    calendarId: string;
    summary: string;
    accessToken: string;
    refreshToken: string;
}

interface ImportResult {
    calendar: Calendar;
    sync: SyncResult;
}

type ImportIcsError = "missing-name" | "missing-url";
type ImportGoogleError =
    | "not-configured"
    | "token-exchange-failed"
    | "calendar-fetch-failed"
    | "no-calendars-found";

export async function importIcsCalendar(
    input: ImportIcsInput,
): Promise<ImportResult | ImportIcsError> {
    const { userId, name, url, config } = input;

    if (!name) return "missing-name";
    if (!url && !config?.url) return "missing-url";

    const calendar = await calendarService.createCalendar({
        userId,
        name,
        type: "ics",
        url,
        config,
    });

    const sync = await syncCalendar(calendar.id);

    return { calendar, sync };
}

export async function getGoogleAuthUrl(
    userId: string,
): Promise<string | "not-configured"> {
    if (!isGoogleConfigured()) return "not-configured";

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.google.clientId!);
    url.searchParams.set("redirect_uri", env.google.redirectUri!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
        "scope",
        "https://www.googleapis.com/auth/calendar.readonly",
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", userId);

    return url.toString();
}

export async function exchangeGoogleCode(
    code: string,
): Promise<
    { accessToken: string; refreshToken: string } | "token-exchange-failed"
> {
    if (!isGoogleConfigured()) return "token-exchange-failed";

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: env.google.clientId!,
            client_secret: env.google.clientSecret!,
            redirect_uri: env.google.redirectUri!,
            grant_type: "authorization_code",
        }),
    });

    if (!res.ok) return "token-exchange-failed";

    const data = (await res.json()) as any;
    if (!data.access_token) return "token-exchange-failed";

    return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function fetchGoogleCalendars(
    accessToken: string,
): Promise<
    | Array<{ id: string; summary: string }>
    | "calendar-fetch-failed"
    | "no-calendars-found"
> {
    const res = await fetch(`${env.google.apiUrl}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return "calendar-fetch-failed";

    const data = (await res.json()) as any;

    if (!data.items?.length) return "no-calendars-found";

    return data.items.map((cal: any) => ({
        id: cal.id,
        summary: cal.summary || "Unnamed Calendar",
    }));
}

export async function importGoogleCalendar(
    input: ImportGoogleCalendarInput,
): Promise<Calendar> {
    const { userId, calendarId, summary, accessToken, refreshToken } = input;

    const calendar = await calendarService.createCalendar({
        userId,
        name: summary,
        type: "google",
        config: {
            accessToken,
            refreshToken,
            calendarId,
        },
    });

    syncCalendar(calendar.id).catch((err) =>
        console.error("[sync] initial Google sync failed:", err),
    );

    return calendar;
}

export async function importAllGoogleCalendars(
    userId: string,
    code: string,
): Promise<{ count: number; calendars: Calendar[] } | ImportGoogleError> {
    if (!isGoogleConfigured()) return "not-configured";

    const tokens = await exchangeGoogleCode(code);
    if (tokens === "token-exchange-failed") return "token-exchange-failed";

    const calendarList = await fetchGoogleCalendars(tokens.accessToken);
    if (calendarList === "calendar-fetch-failed")
        return "calendar-fetch-failed";
    if (calendarList === "no-calendars-found") return "no-calendars-found";

    const calendars: Calendar[] = [];

    for (const cal of calendarList) {
        const calendar = await importGoogleCalendar({
            userId,
            calendarId: cal.id,
            summary: cal.summary,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });
        calendars.push(calendar);
    }

    return { count: calendars.length, calendars };
}

export async function testImportConnection(
    type: Calendar["type"],
    config: any,
): Promise<TestResult> {
    return testCalendarConnection({ type, config });
}
