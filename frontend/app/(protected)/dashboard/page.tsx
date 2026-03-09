"use client";

import { useState, useEffect } from "react";
import {
    Plus,
    RefreshCw,
    Trash2,
    Check,
    Link,
    Calendar,
    Edit,
    Loader2,
    Share2,
    Copy,
    CircleHelp,
} from "lucide-react";
import { apiClient } from "../../../lib/api";
import type { CalendarData, Friend, Permission } from "../../../lib/types";
import { fmtDateTime } from "../../../lib/date";
import s from "./page.module.css";
import Modal from "../../../components/Modal";
import GoogleCalendarSelect from "../../../components/GoogleCalendarSelect";
import ServerCalendarSelect from "../../../components/ServerCalendarSelect";
import PasswordInput from "../../../components/PasswordInput";

type ImportType = "ics" | "caldav" | "icloud" | "google";

const PROVIDER_HELP: Record<
    ImportType,
    {
        title: string;
        intro: string;
        steps: Array<{
            id: string;
            text: string;
            link?: {
                label: string;
                href: string;
            };
        }>;
    }
> = {
    ics: {
        title: "ICS / iCal Link",
        intro: "Use this for public or private .ics feeds from another app.",
        steps: [
            {
                id: "ics-1",
                text: "Enter a calendar name and paste the ICS URL.",
            },
            {
                id: "ics-2",
                text: "If your feed requires authentication, add username/password.",
            },
            {
                id: "ics-3",
                text: "Click Save to test access and import the calendar.",
            },
            {
                id: "ics-4",
                text: "If the URL changes later, delete and re-import with the new URL.",
            },
        ],
    },
    caldav: {
        title: "CalDAV",
        intro: "Use this for self-hosted or provider CalDAV servers.",
        steps: [
            { id: "caldav-1", text: "Enter the CalDAV server URL." },
            {
                id: "caldav-2",
                text: "Add username/password if required by your server.",
            },
            {
                id: "caldav-3",
                text: "Click Add Calendar to discover available calendars.",
            },
            {
                id: "caldav-4",
                text: "If discovery is not supported, add direct calendar URL. Often looks similiar to: https://your-server.com/caldav/calendar-name",
            },
            { id: "caldav-5", text: "Select calendars and confirm import." },
        ],
    },
    icloud: {
        title: "iCloud",
        intro: "Use this to import Apple iCloud calendars.",
        steps: [
            { id: "icloud-1", text: "Use your Apple ID email as username." },
            {
                id: "icloud-2",
                text: "Generate an app-specific (not your iCloud password) password under Sign-In and Security at",
                link: {
                    label: "appleid.apple.com",
                    href: "https://appleid.apple.com",
                },
            },
            {
                id: "icloud-3",
                text: "Paste the app-specific password (not your account password).",
            },
            {
                id: "icloud-4",
                text: "Click Add Calendar, then choose calendars to import.",
            },
        ],
    },
    google: {
        title: "Google Calendar",
        intro: "Use OAuth to connect your Google account securely.",
        steps: [
            { id: "google-1", text: "Click Connect with Google." },
            {
                id: "google-2",
                text: "Approve access in the Google consent screen.",
            },
            {
                id: "google-3",
                text: "Google will redirect you to select calendars.",
            },
            {
                id: "google-4",
                text: "Import selected calendars into your dashboard.",
            },
            {
                id: "google-5",
                text: "If an error occurs, try another browser or contact the administrator.",
            },
        ],
    },
};

interface GoogleCalendar {
    id: string;
    summary: string;
    color?: string;
}

interface DiscoveredCalendar {
    url: string;
    displayName: string;
    color?: string;
}

type ServerSelectType = "caldav" | "icloud";

type CaldavCredentials = {
    url: string;
    username?: string;
    password?: string;
};

type IcloudCredentials = {
    username?: string;
    password?: string;
};

type ServerCredentials = CaldavCredentials | IcloudCredentials;

const PERM_LABELS: Record<Permission, string> = {
    busy: "Busy Only",
    titles: "Titles Only",
    full: "Full Details",
};

interface IncomingShare {
    friendshipId: string;
    calendarId: string;
    calendarName: string;
    ownerName: string;
    ownerEmail: string;
    permission: Permission;
    ownerId: string;
}

export default function DashboardPage() {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [eventCountsByCalendar, setEventCountsByCalendar] = useState<
        Record<string, number>
    >({});
    const [totalEvents, setTotalEvents] = useState(0);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [incomingShares, setIncomingShares] = useState<IncomingShare[]>([]);
    const [loading, setLoading] = useState(true);
    const [timezone, setTimezone] = useState(browserTimezone || "UTC");
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

    const [showModal, setShowModal] = useState(false);
    const [helpType, setHelpType] = useState<ImportType | null>(null);
    const [editingCalendar, setEditingCalendar] = useState<CalendarData | null>(
        null,
    );
    const [importType, setImportType] = useState<ImportType>("ics");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [sync, setSync] = useState(60);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [googleLoading, setGoogleLoading] = useState(false);
    const [showGoogleSelect, setShowGoogleSelect] = useState(false);
    const [googleToken, setGoogleToken] = useState("");
    const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>(
        [],
    );
    const [importedGoogleIds, setImportedGoogleIds] = useState<string[]>([]);
    const [selectedGoogleIds, setSelectedGoogleIds] = useState<string[]>([]);
    const [googleSelectLoading, setGoogleSelectLoading] = useState(false);
    const [googleImporting, setGoogleImporting] = useState(false);

    const [showServerSelect, setShowServerSelect] = useState(false);
    const [serverSelectType, setServerSelectType] =
        useState<ServerSelectType | null>(null);
    const [serverCredentials, setServerCredentials] =
        useState<ServerCredentials | null>(null);
    const [discoveredCalendars, setDiscoveredCalendars] = useState<
        DiscoveredCalendar[]
    >([]);
    const [selectedCalendarUrls, setSelectedCalendarUrls] = useState<string[]>(
        [],
    );
    const [discoveringCalendars, setDiscoveringCalendars] = useState(false);
    const [serverImporting, setServerImporting] = useState(false);
    const [serverError, setServerError] = useState("");

    const [copied, setCopied] = useState(false);
    const [exportCtx, setExportCtx] = useState<{
        title: string;
        subtitle?: string;
        link: string;
    } | null>(null);

    const uid = apiClient.getUid();

    const withTimeout = async <T,>(
        promise: Promise<T>,
        timeoutMs = 12000,
    ): Promise<T> => {
        return await new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error("Request timed out")),
                timeoutMs,
            );

            promise
                .then((value) => {
                    clearTimeout(timeout);
                    resolve(value);
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    };

    useEffect(() => {
        checkGoogleCallback();
        void loadAll();
    }, []);

    useEffect(() => {
        if (!editingCalendar) {
            resetForm();
            return;
        }
        setName(editingCalendar.name);
        setUrl(editingCalendar.config?.url || "");
        setUsername(editingCalendar.config?.username || "");
        setPassword(editingCalendar.config?.password || "");
        setSync(editingCalendar.syncInterval ?? 60);
    }, [editingCalendar]);

    const resetForm = () => {
        setName("");
        setUrl("");
        setUsername("");
        setPassword("");
        setSync(60);
        setError("");
        setImportType("ics");
    };

    const loadAll = async () => {
        setLoading(true);
        try {
            const [crRaw, eventsRaw, frRaw, me] = await Promise.all([
                withTimeout(
                    apiClient.request<CalendarData[]>("/api/calendars"),
                ).catch(() => []),
                withTimeout(
                    apiClient.request<Array<{ calendar?: { id?: string } }>>(
                        "/api/events",
                    ),
                ).catch(() => []),
                withTimeout(apiClient.request<Friend[]>("/api/friends")).catch(
                    () => [],
                ),
                withTimeout(apiClient.request<any>("/api/users/me")).catch(
                    () => null,
                ),
            ]);

            const calculatedCounts = eventsRaw.reduce<Record<string, number>>(
                (acc, ev) => {
                    const calendarId = ev?.calendar?.id;
                    if (!calendarId) return acc;
                    acc[calendarId] = (acc[calendarId] ?? 0) + 1;
                    return acc;
                },
                {},
            );

            const fallbackCounts = crRaw.reduce<Record<string, number>>(
                (acc, calendar) => {
                    acc[calendar.id] = calendar.events?.length ?? 0;
                    return acc;
                },
                {},
            );

            const countsByCalendar =
                Object.keys(calculatedCounts).length > 0
                    ? calculatedCounts
                    : fallbackCounts;

            setEventCountsByCalendar(countsByCalendar);
            setTotalEvents(
                Object.values(countsByCalendar).reduce(
                    (sum, count) => sum + count,
                    0,
                ),
            );

            setCalendars((prev) =>
                crRaw.map((c) => {
                    const old = prev.find((p) => p.id === c.id);
                    return {
                        ...c,
                        lastSyncSuccess:
                            c.lastSyncSuccess ?? old?.lastSyncSuccess ?? true,
                        lastTestSuccess:
                            c.lastTestSuccess ?? old?.lastTestSuccess ?? true,
                        lastError: c.lastError ?? old?.lastError ?? null,
                    };
                }),
            );

            setFriends(frRaw);
            setIncomingShares(deriveIncomingShares(frRaw, uid as string));

            if (me?.settings?.timezone) {
                setTimezone(me.settings.timezone);
            }
        } finally {
            setLoading(false);
        }
    };

    function isCaldavCreds(
        creds: ServerCredentials,
    ): creds is CaldavCredentials {
        return typeof (creds as CaldavCredentials).url === "string";
    }

    const normalizeRef = (value?: string | null) =>
        String(value || "")
            .trim()
            .replace(/\/$/, "")
            .toLowerCase();

    const getImportedGoogleIds = () =>
        calendars
            .filter((c) => c.type === "google")
            .map((c) => (c.config as any)?.calendarId)
            .filter((id): id is string => !!id);

    const parseGoogleOAuthToken = (
        token: string,
    ): { accessToken: string; refreshToken: string } | null => {
        try {
            const [, payloadBase64] = token.split(".");
            if (!payloadBase64) return null;
            const payload = JSON.parse(atob(payloadBase64));
            if (!payload?.accessToken) return null;
            return {
                accessToken: String(payload.accessToken),
                refreshToken: String(payload.refreshToken || ""),
            };
        } catch {
            return null;
        }
    };

    const getImportedServerUrls = (type: ServerSelectType | null) => {
        if (!type) return [] as string[];
        return calendars
            .filter((c) => c.type === type)
            .map((c) => (c.config as any)?.calendarPath || c.config?.url)
            .filter((url): url is string => !!url);
    };

    const importedServerUrls = getImportedServerUrls(serverSelectType);

    const deriveIncomingShares = (
        frRaw: Friend[],
        currentUid: string,
    ): IncomingShare[] => {
        const shares: IncomingShare[] = [];
        for (const f of frRaw) {
            if (f.status !== "accepted") continue;
            const owner = f.user1.id === currentUid ? f.user2 : f.user1;
            for (const cal of f.sharedWithMe ?? []) {
                shares.push({
                    friendshipId: f.id,
                    calendarId: cal.id,
                    calendarName: cal.name,
                    ownerName: owner.name ?? "",
                    ownerEmail: owner.email,
                    permission: cal.permission ?? "full",
                    ownerId: owner.id,
                });
            }
        }
        return shares;
    };

    const openCreate = () => {
        setEditingCalendar(null);
        resetForm();
        setShowModal(true);
    };

    const openEdit = (c: CalendarData) => {
        setEditingCalendar(c);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setHelpType(null);
        setEditingCalendar(null);
        resetForm();
    };

    const doDelete = async (id: string) => {
        if (!confirm("Delete this calendar? This cannot be undone.")) return;
        try {
            await apiClient.request(`/api/calendars/${id}`, {
                method: "DELETE",
            });
            setCalendars((prev) => prev.filter((c) => c.id !== id));
        } catch (err: any) {
            alert(err.message || "Failed to delete calendar");
        }
    };

    const saveIcsCalendar = async () => {
        if (!name || !url) return;

        setSaving(true);
        setError("");

        const config = {
            url,
            ...(username && { username }),
            ...(password && { password }),
        };

        try {
            const testRes = await apiClient.post(
                "/api/providers/ics/test",
                config,
            );

            if (!testRes?.success) {
                setError(testRes?.error || "Connection test failed");
                return;
            }

            if (editingCalendar) {
                await apiClient.request(
                    `/api/calendars/${editingCalendar.id}`,
                    {
                        method: "PUT",
                        body: { name, syncInterval: sync, config },
                    },
                );
            } else {
                await apiClient.post("/api/providers/ics/import", {
                    name,
                    url,
                    config,
                });
            }

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Test or save failed");
        } finally {
            setSaving(false);
        }
    };

    const saveServerEditing = async () => {
        if (!editingCalendar) return;

        setSaving(true);
        setError("");

        const existingUrl = editingCalendar.config?.url || url;

        const config = {
            url: existingUrl,
            username,
            password,
        };

        try {
            await apiClient.request(`/api/calendars/${editingCalendar.id}`, {
                method: "PUT",
                body: { name, syncInterval: sync, config },
            });

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const connectCaldav = async () => {
        if (!url) {
            setError("CalDAV URL is required.");
            return;
        }

        setDiscoveringCalendars(true);
        setError("");

        try {
            const testRes = await apiClient.post("/api/providers/caldav/test", {
                url,
                username,
                password,
            });

            if (!testRes?.success) {
                setError(testRes?.error || "Connection test failed");
                return;
            }

            const creds = { url, username, password };
            let found: DiscoveredCalendar[] = [];

            try {
                const res = await apiClient.post<{
                    calendars: DiscoveredCalendar[];
                }>("/api/providers/caldav/discover", creds);
                found = res?.calendars ?? [];
            } catch {
                found = [];
            }

            if (found.length > 0) {
                setDiscoveredCalendars(found);
                setSelectedCalendarUrls([]);
                setServerCredentials(creds);
                setServerSelectType("caldav");
                closeModal();
                setShowServerSelect(true);
                return;
            }

            await apiClient.post("/api/providers/caldav/import", {
                credentials: creds,
                calendars: [{ name: name || url, url }],
            });

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to connect");
        } finally {
            setDiscoveringCalendars(false);
        }
    };

    const connectICloud = async () => {
        setDiscoveringCalendars(true);
        setError("");

        try {
            const testRes = await apiClient.post("/api/providers/icloud/test", {
                username,
                password,
            });

            if (!testRes?.success) {
                setError(testRes?.error || "Connection test failed");
                return;
            }

            const creds = { username, password };
            const res = await apiClient.post<{
                calendars: DiscoveredCalendar[];
            }>("/api/providers/icloud/discover", creds);

            const found = res?.calendars ?? [];

            setDiscoveredCalendars(found);
            setSelectedCalendarUrls([]);
            setServerCredentials(creds);
            setServerSelectType("icloud");
            closeModal();
            setShowServerSelect(true);
        } catch (e: any) {
            setError(e.message || "Failed to connect");
        } finally {
            setDiscoveringCalendars(false);
        }
    };

    const closeServerSelect = () => {
        setShowServerSelect(false);
        setServerSelectType(null);
        setServerCredentials(null);
        setDiscoveredCalendars([]);
        setSelectedCalendarUrls([]);
        setServerError("");
    };

    const toggleServerCalendar = (u: string) => {
        const normalized = normalizeRef(u);
        if (
            importedServerUrls.some(
                (existing) => normalizeRef(existing) === normalized,
            )
        ) {
            return;
        }
        setSelectedCalendarUrls((prev) =>
            prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u],
        );
    };

    const selectAllServer = () =>
        setSelectedCalendarUrls(
            discoveredCalendars
                .map((c) => c.url)
                .filter(
                    (url) =>
                        !importedServerUrls.some(
                            (existing) =>
                                normalizeRef(existing) === normalizeRef(url),
                        ),
                ),
        );

    const deselectAllServer = () => setSelectedCalendarUrls([]);

    const importSelectedServer = async () => {
        if (
            !serverCredentials ||
            !serverSelectType ||
            selectedCalendarUrls.length === 0
        )
            return;

        setServerImporting(true);
        setServerError("");

        try {
            const calendarsPayload = selectedCalendarUrls
                .filter(
                    (url) =>
                        !importedServerUrls.some(
                            (existing) =>
                                normalizeRef(existing) === normalizeRef(url),
                        ),
                )
                .map((u) => ({
                    name:
                        discoveredCalendars.find((c) => c.url === u)
                            ?.displayName ?? u,
                    url: u,
                }));

            if (!calendarsPayload.length) {
                setServerError("All selected calendars are already imported.");
                return;
            }

            const endpoint =
                serverSelectType === "caldav"
                    ? "/api/providers/caldav/import"
                    : "/api/providers/icloud/import";

            const credentials = isCaldavCreds(serverCredentials)
                ? {
                      url: serverCredentials.url,
                      username: serverCredentials.username || "",
                      password: serverCredentials.password || "",
                  }
                : {
                      username: serverCredentials.username || "",
                      password: serverCredentials.password || "",
                  };

            await apiClient.post(endpoint, {
                credentials,
                calendars: calendarsPayload,
            });

            closeServerSelect();
            alert(
                `Successfully imported ${selectedCalendarUrls.length} calendar${
                    selectedCalendarUrls.length !== 1 ? "s" : ""
                }!`,
            );
            await loadAll();
        } catch (e: any) {
            setServerError(e.message || "Failed to import calendars");
        } finally {
            setServerImporting(false);
        }
    };

    const checkGoogleCallback = () => {
        const params = new URLSearchParams(globalThis.location.search);
        const status = params.get("googleAuthSuccess");
        const googleTokenParam = params.get("googleToken");
        const importedCount = params.get("imported");

        if (!status) {
            return;
        }

        const cleanUrl = `${globalThis.location.pathname}${globalThis.location.hash}`;
        globalThis.history.replaceState(globalThis.history.state, "", cleanUrl);

        if (status === "success" && googleTokenParam) {
            setGoogleToken(googleTokenParam);
            void openGoogleSelect(googleTokenParam);
            return;
        }

        if (status === "success") {
            if (importedCount) {
                alert(`Google import complete: ${importedCount} calendar(s).`);
            }
            return;
        }

        if (status === "error") {
            alert(
                `Google authentication failed: ${
                    params.get("reason") || "Unknown error"
                }`,
            );
        }
    };

    const connectGoogle = async () => {
        setGoogleLoading(true);
        setError("");

        try {
            const res = await apiClient.request<{ url: string }>(
                "/api/providers/google/auth-url",
            );
            window.location.href = res.url;
        } catch (err: any) {
            setError(err.message || "Failed to get Google auth URL");
            setGoogleLoading(false);
        }
    };

    const openGoogleSelect = async (token: string) => {
        setShowModal(false);
        setShowGoogleSelect(true);
        setGoogleToken(token);
        setGoogleSelectLoading(true);
        setError("");

        try {
            const parsed = parseGoogleOAuthToken(token);
            if (!parsed) {
                throw new Error("Invalid Google OAuth token");
            }

            const calendarsRes = await apiClient.post<{
                calendars: GoogleCalendar[];
            }>("/api/providers/google/discover", {
                accessToken: parsed.accessToken,
            });

            setGoogleCalendars(calendarsRes.calendars);
            setImportedGoogleIds(getImportedGoogleIds());
        } catch (err: any) {
            setError(err.message || "Failed to load calendars");
        } finally {
            setGoogleSelectLoading(false);
        }
    };

    const closeGoogleSelect = () => {
        setShowGoogleSelect(false);
        setGoogleToken("");
        setGoogleCalendars([]);
        setSelectedGoogleIds([]);
        setError("");
    };

    const toggleGoogleCalendar = (id: string) => {
        if (importedGoogleIds.includes(id)) return;
        setSelectedGoogleIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const selectAllGoogle = () => {
        const availableIds = googleCalendars
            .filter((cal) => !importedGoogleIds.includes(cal.id))
            .map((cal) => cal.id);
        setSelectedGoogleIds(availableIds);
    };

    const deselectAllGoogle = () => setSelectedGoogleIds([]);

    const importSelectedGoogle = async () => {
        if (!googleToken || selectedGoogleIds.length === 0) return;

        setGoogleImporting(true);
        setError("");

        try {
            const parsed = parseGoogleOAuthToken(googleToken);
            if (!parsed) {
                throw new Error("Invalid Google OAuth token");
            }

            const importableIds = selectedGoogleIds.filter(
                (calendarId) => !importedGoogleIds.includes(calendarId),
            );

            if (!importableIds.length) {
                setError("All selected calendars are already imported.");
                return;
            }

            await Promise.all(
                importableIds.map((calendarId) => {
                    const calendar = googleCalendars.find(
                        (c) => c.id === calendarId,
                    );
                    return apiClient.post("/api/providers/google/import", {
                        calendarId,
                        summary: calendar?.summary,
                        color: calendar?.color,
                        accessToken: parsed.accessToken,
                        refreshToken: parsed.refreshToken,
                    });
                }),
            );

            closeGoogleSelect();
            alert(
                `Successfully imported ${importableIds.length} calendar${
                    importableIds.length !== 1 ? "s" : ""
                }!`,
            );
            await loadAll();
        } catch (err: any) {
            setError(err.message || "Failed to import calendars");
        } finally {
            setGoogleImporting(false);
        }
    };

    const saveGoogleCalendar = async () => {
        if (!name || !editingCalendar) return;

        setSaving(true);
        setError("");

        try {
            await apiClient.request(`/api/calendars/${editingCalendar.id}`, {
                method: "PUT",
                body: { name, syncInterval: sync },
            });

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to save calendar");
        } finally {
            setSaving(false);
        }
    };

    const doSync = async (c: CalendarData) => {
        setSyncingId(c.id);
        try {
            const res = await apiClient.post(`/api/calendars/${c.id}/sync`);
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastSyncSuccess: res?.success !== false,
                              lastError:
                                  res?.success === false
                                      ? (res?.error ?? "Sync failed")
                                      : null,
                          }
                        : cal,
                ),
            );
        } catch (err: any) {
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastSyncSuccess: false,
                              lastError: err.message ?? "Sync error",
                          }
                        : cal,
                ),
            );
        } finally {
            await loadAll();
            setSyncingId(null);
        }
    };

    const doTest = async (c: CalendarData) => {
        setTestingId(c.id);
        try {
            const res = await apiClient.request(`/api/calendars/${c.id}/test`);
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastTestSuccess: res.success,
                              lastError: res.success
                                  ? null
                                  : (res.error ?? "Test failed"),
                          }
                        : cal,
                ),
            );
        } catch (err: any) {
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastTestSuccess: false,
                              lastError: err.message ?? "Network error",
                          }
                        : cal,
                ),
            );
        } finally {
            setTestingId(null);
        }
    };

    const openExport = async (
        title: string,
        subtitle: string | undefined,
        id?: string,
    ) => {
        try {
            let link = "";

            if (id) {
                const res = await apiClient.request<{ url: string }>(
                    `/api/providers/ics/export/${id}?type=link`,
                );
                link = res.url;
            }

            if (!link) {
                setError("Failed to generate export link");
                return;
            }

            setExportCtx({ title, subtitle, link });
            setCopied(false);
        } catch (err: any) {
            setError(err?.message || "Failed to generate export link");
        }
    };

    const doCopy = () => {
        if (!exportCtx) return;
        navigator.clipboard.writeText(exportCtx.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const activeImportType = editingCalendar
        ? (editingCalendar.type as ImportType)
        : importType;

    const accepted = friends.filter((f) => f.status === "accepted");

    const getCalendarEventCount = (calendar: CalendarData) =>
        eventCountsByCalendar[calendar.id] ?? calendar.events?.length ?? 0;

    if (loading) {
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading...</span>
            </div>
        );
    }

    return (
        <div className={s.page}>
            <div className={s.pageHeader}>
                <h1 className={s.pageTitle}>Dashboard</h1>
                <div className={s.btnRow}>
                    <button
                        className={`${s.btn} ${s.btnPrimary}`}
                        onClick={openCreate}
                    >
                        <Plus size={14} /> Import Calendar
                    </button>
                </div>
            </div>

            <div className={s.statsGrid}>
                {[
                    { label: "Calendars", value: calendars.length },
                    { label: "Total Events", value: totalEvents },
                    { label: "Friends", value: accepted.length },
                ].map(({ label, value }) => (
                    <div key={label} className={s.statCard}>
                        <div className={s.statValue}>{value}</div>
                        <div className={s.statLabel}>{label}</div>
                    </div>
                ))}
            </div>

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>My Calendars</span>
                    <button
                        className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
                        onClick={openCreate}
                    >
                        <Plus size={12} /> Add
                    </button>
                </div>

                {calendars.length === 0 ? (
                    <div className={s.empty}>
                        <Calendar size={38} className={s.emptyIcon} />
                        <span>No calendars yet</span>
                    </div>
                ) : (
                    <div className={s.list}>
                        {calendars.map((c) => (
                            <div key={c.id} className={s.row}>
                                <div className={s.rowInfo}>
                                    <div className={s.rowName}>
                                        {c.name}
                                        {(c.lastTestSuccess === false ||
                                            c.lastSyncSuccess === false) && (
                                            <span
                                                className={s.rowFailedDot}
                                                title={
                                                    c.lastError ||
                                                    "Last sync or connection test failed"
                                                }
                                            />
                                        )}
                                    </div>
                                    <div className={s.rowMeta}>
                                        <span
                                            className={`${s.badge} ${s.badgePurple}`}
                                        >
                                            {c.type}
                                        </span>
                                        <span className={s.metaText}>
                                            {getCalendarEventCount(c)} events
                                        </span>
                                        {c.lastSync && (
                                            <span className={s.metaText}>
                                                synced{" "}
                                                {fmtDateTime(
                                                    c.lastSync,
                                                    timezone,
                                                )}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className={s.rowActions}>
                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() =>
                                            openExport(
                                                c.name,
                                                `${getCalendarEventCount(c)} events`,
                                                c.id,
                                            )
                                        }
                                        title="Export ICS link"
                                    >
                                        <Link size={12} />
                                    </button>

                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() => doTest(c)}
                                        disabled={testingId === c.id}
                                        title="Test Connection"
                                    >
                                        {testingId === c.id ? (
                                            <Loader2
                                                size={12}
                                                className={s.spin}
                                            />
                                        ) : (
                                            <Check size={12} />
                                        )}
                                    </button>

                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() => doSync(c)}
                                        disabled={syncingId === c.id}
                                        title="Sync Calendar"
                                    >
                                        {syncingId === c.id ? (
                                            <Loader2
                                                size={12}
                                                className={s.spin}
                                            />
                                        ) : (
                                            <RefreshCw size={12} />
                                        )}
                                    </button>

                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() => openEdit(c)}
                                        title="Edit calendar"
                                    >
                                        <Edit size={12} />
                                    </button>

                                    <button
                                        className={`${s.btn} ${s.btnDanger} ${s.btnSm} ${s.btnIcon}`}
                                        onClick={() => doDelete(c.id)}
                                        title="Delete calendar"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>
                        Shared with you ({incomingShares.length})
                    </span>
                </div>

                {incomingShares.length === 0 ? (
                    <div className={s.empty}>
                        <Share2 size={38} className={s.emptyIcon} />
                        <span>No calendars shared with you yet</span>
                    </div>
                ) : (
                    <div className={s.list}>
                        {incomingShares.map((share) => (
                            <div
                                key={`${share.friendshipId}-${share.calendarId}`}
                                className={s.row}
                            >
                                <div className={s.rowInfo}>
                                    <div className={s.rowName}>
                                        {share.calendarName}
                                    </div>
                                    <div className={s.rowMeta}>
                                        <span className={s.metaText}>
                                            {share.ownerName ||
                                                share.ownerEmail}
                                        </span>
                                        <span className={s.permLabel}>
                                            {PERM_LABELS[share.permission]}
                                        </span>
                                    </div>
                                </div>

                                <div className={s.rowActions}>
                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() =>
                                            openExport(
                                                share.calendarName,
                                                share.ownerName ||
                                                    share.ownerEmail,
                                                share.calendarId,
                                            )
                                        }
                                        title="Export ICS link"
                                    >
                                        <Link size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                isOpen={showModal}
                onClose={closeModal}
                title={editingCalendar ? "Edit Calendar" : "Import Calendar"}
            >
                {!editingCalendar && (
                    <div className={s.typeSection}>
                        <div className={s.typeHeader}>
                            <span className={s.helpLabel}>
                                Need help with{" "}
                                {PROVIDER_HELP[activeImportType].title}?
                            </span>
                            <button
                                type="button"
                                className={s.contextHelpBtn}
                                onClick={() => setHelpType(activeImportType)}
                                title={`Help for ${PROVIDER_HELP[activeImportType].title}`}
                                aria-label={`Help for ${PROVIDER_HELP[activeImportType].title}`}
                            >
                                <CircleHelp size={14} />
                            </button>
                        </div>

                        <div className={s.typeGrid}>
                            {(
                                [
                                    "ics",
                                    "caldav",
                                    "icloud",
                                    "google",
                                ] as ImportType[]
                            ).map((type) => (
                                <button
                                    key={type}
                                    className={`${s.typeBtn} ${importType === type ? s.typeTabActive : ""}`}
                                    onClick={() => setImportType(type)}
                                >
                                    <div className={s.typeName}>
                                        {
                                            {
                                                ics: "ICS / iCal Link",
                                                caldav: "CalDAV",
                                                icloud: "iCloud",
                                                google: "Google Calendar",
                                            }[type]
                                        }
                                    </div>
                                    <div className={s.typeDesc}>
                                        {
                                            {
                                                ics: "Import from ICS/iCal URL",
                                                caldav: "Connect a CalDAV server",
                                                icloud: "Connect Apple iCloud",
                                                google: "Connect your Google account",
                                            }[type]
                                        }
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeImportType === "ics" && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Name</label>
                            <input
                                className={s.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>ICS URL</label>
                            <input
                                className={s.input}
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                disabled={!!editingCalendar}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Username (optional)
                            </label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Password (optional)
                            </label>
                            <PasswordInput
                                className={s.input}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Auto-sync (minutes)
                            </label>
                            <input
                                className={s.input}
                                type="number"
                                min={0}
                                value={sync}
                                onChange={(e) =>
                                    setSync(Number(e.target.value))
                                }
                            />
                        </div>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={saveIcsCalendar}
                                disabled={saving}
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "caldav" && editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Name</label>
                            <input
                                className={s.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>CalDAV URL</label>
                            <input className={s.input} value={url} disabled />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>Username</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>Password</label>
                            <PasswordInput
                                className={s.input}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Auto-sync (minutes)
                            </label>
                            <input
                                className={s.input}
                                type="number"
                                min={0}
                                value={sync}
                                onChange={(e) =>
                                    setSync(Number(e.target.value))
                                }
                            />
                        </div>

                        <p className={s.hint}>
                            URL cannot be changed. Delete and re-import if
                            needed.
                        </p>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={saveServerEditing}
                                disabled={saving}
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "caldav" && !editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>CalDAV URL</label>
                            <input
                                className={s.input}
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://caldav.example.com/"
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Username (optional)
                            </label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Password (optional)
                            </label>
                            <PasswordInput
                                className={s.input}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Name{" "}
                                <span style={{ fontWeight: 400, opacity: 0.6 }}>
                                    (only needed if discovery is unavailable)
                                </span>
                            </label>
                            <input
                                className={s.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="My Calendar"
                            />
                        </div>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={connectCaldav}
                                disabled={discoveringCalendars}
                            >
                                {discoveringCalendars ? (
                                    <>
                                        <Loader2 size={14} className={s.spin} />{" "}
                                        Connecting…
                                    </>
                                ) : (
                                    "Add Calendar"
                                )}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "icloud" && editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Name</label>
                            <input
                                className={s.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>Apple ID</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="you@icloud.com"
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                App-specific password{" "}
                                <span style={{ fontWeight: 400, opacity: 0.6 }}>
                                    (not your iCloud/Apple ID password)
                                </span>
                            </label>
                            <PasswordInput
                                className={s.input}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Auto-sync (minutes)
                            </label>
                            <input
                                className={s.input}
                                type="number"
                                min={0}
                                value={sync}
                                onChange={(e) =>
                                    setSync(Number(e.target.value))
                                }
                            />
                        </div>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={saveServerEditing}
                                disabled={saving}
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "icloud" && !editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Apple ID</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="you@icloud.com"
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                App-specific password{" "}
                                <span style={{ fontWeight: 400, opacity: 0.6 }}>
                                    (not your iCloud/Apple ID password)
                                </span>
                            </label>
                            <PasswordInput
                                className={s.input}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <p className={s.hint}>
                            Generate an App-specific password at{" "}
                            <a
                                href="https://appleid.apple.com"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                appleid.apple.com
                            </a>{" "}
                            under Sign-In and Security
                        </p>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={connectICloud}
                                disabled={discoveringCalendars}
                            >
                                {discoveringCalendars ? (
                                    <>
                                        <Loader2 size={14} className={s.spin} />{" "}
                                        Connecting…
                                    </>
                                ) : (
                                    "Add Calendar"
                                )}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "google" && !editingCalendar && (
                    <div className={s.formStack}>
                        <p className={s.hint}>
                            Connect your Google account to select which
                            calendars to import. You will be redirected to
                            Google to authorize access.
                        </p>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={connectGoogle}
                                disabled={googleLoading}
                            >
                                {googleLoading
                                    ? "Redirecting…"
                                    : "Connect with Google"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "google" && editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Name</label>
                            <input
                                className={s.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                Auto-sync (minutes)
                            </label>
                            <input
                                className={s.input}
                                type="number"
                                min={0}
                                value={sync}
                                onChange={(e) =>
                                    setSync(Number(e.target.value))
                                }
                            />
                        </div>

                        <p className={s.hint}>
                            Google Calendar URL cannot be changed. Delete and
                            re-import if needed.
                        </p>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={saveGoogleCalendar}
                                disabled={saving}
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={helpType !== null}
                onClose={() => setHelpType(null)}
                title={
                    helpType
                        ? `${PROVIDER_HELP[helpType].title} Instructions`
                        : "Provider Instructions"
                }
            >
                {helpType && (
                    <div className={s.formStack}>
                        <p className={s.hint}>
                            {PROVIDER_HELP[helpType].intro}
                        </p>
                        <ol className={s.helpList}>
                            {PROVIDER_HELP[helpType].steps.map((step) => (
                                <li key={step.id}>
                                    {step.text}{" "}
                                    {step.link && (
                                        <a
                                            href={step.link.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {step.link.label}
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ol>
                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={() => setHelpType(null)}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <GoogleCalendarSelect
                isOpen={showGoogleSelect}
                onClose={closeGoogleSelect}
                loading={googleSelectLoading}
                error={error}
                calendars={googleCalendars}
                importedIds={importedGoogleIds}
                selectedIds={selectedGoogleIds}
                onToggle={toggleGoogleCalendar}
                onSelectAll={selectAllGoogle}
                onDeselectAll={deselectAllGoogle}
                onImport={importSelectedGoogle}
                importing={googleImporting}
            />

            <ServerCalendarSelect
                isOpen={showServerSelect}
                onClose={closeServerSelect}
                loading={false}
                error={serverError}
                calendars={discoveredCalendars}
                importedUrls={importedServerUrls}
                selectedUrls={selectedCalendarUrls}
                onToggle={toggleServerCalendar}
                onSelectAll={selectAllServer}
                onDeselectAll={deselectAllServer}
                onImport={importSelectedServer}
                importing={serverImporting}
                title={
                    serverSelectType === "icloud"
                        ? "Select iCloud Calendars"
                        : "Select CalDAV Calendars"
                }
            />

            <Modal
                isOpen={!!exportCtx}
                onClose={() => setExportCtx(null)}
                title="Export Calendar"
            >
                <div className={s.formStack}>
                    <div>
                        <label className={s.fieldLabel}>Calendar</label>
                        <div className={s.inputStatic}>
                            {exportCtx?.title ?? ""}
                        </div>
                        {exportCtx?.subtitle && (
                            <p className={s.hint}>{exportCtx.subtitle}</p>
                        )}
                    </div>

                    <div>
                        <label className={s.fieldLabel}>Type</label>
                        <div className={s.inputStatic}>ICS iCal</div>
                    </div>

                    <div>
                        <label className={s.fieldLabel}>
                            Subscription link
                        </label>
                        <input
                            className={s.input}
                            value={exportCtx?.link ?? ""}
                            readOnly
                            onFocus={(e) => e.target.select()}
                            style={{
                                fontFamily: "ui-monospace, monospace",
                                fontSize: 12,
                            }}
                        />
                        <p className={s.hint}>
                            Use this link to subscribe in other apps. Do not
                            share it: it contains a secret token that grants
                            access to your calendar data.
                        </p>
                    </div>

                    <div className={s.formRow}>
                        <button
                            className={`${s.btn} ${s.btnPrimary}`}
                            style={{ flex: 1 }}
                            onClick={doCopy}
                        >
                            {copied ? (
                                <>
                                    <Check size={14} /> Copied
                                </>
                            ) : (
                                <>
                                    <Copy size={14} /> Copy link
                                </>
                            )}
                        </button>
                        <button
                            className={`${s.btn} ${s.btnSecondary}`}
                            onClick={() => setExportCtx(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
