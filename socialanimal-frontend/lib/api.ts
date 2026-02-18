export function getToken(): string | null {
    return typeof window !== "undefined" ? localStorage.getItem("token") : null;
}

export function authHeaders(): Record<string, string> {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiFetch<T = any>(
    path: string,
    opts: RequestInit = {},
): Promise<T> {
    const res = await fetch(path, {
        ...opts,
        headers: {
            ...authHeaders(),
            ...(opts.body ? { "Content-Type": "application/json" } : {}),
            ...(opts.headers ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Request failed");
    }
    return res.json();
}

export function getUid(): string | null {
    const t = getToken();
    if (!t) return null;
    try {
        const parts = t.split(".");
        const payload = parts.length === 3 ? parts[1] : parts[0];
        return JSON.parse(atob(payload)).sub;
    } catch {
        return null;
    }
}
