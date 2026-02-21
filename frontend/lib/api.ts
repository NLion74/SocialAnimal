type ReqOpts = Omit<RequestInit, "body"> & { body?: any };

export class ApiError extends Error {
    status: number;
    data: any;
    constructor(message: string, status = 0, data: any = null) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

export class ApiClient {
    basePath: string;

    constructor(basePath = "") {
        this.basePath = basePath.replace(/\/+$/, "");
    }

    getUid(): string | null {
        const t = this.getToken();
        if (!t) return null;
        try {
            const parts = t.split(".");
            const payload = parts.length === 3 ? parts[1] : parts[0];
            return JSON.parse(atob(payload)).sub;
        } catch {
            return null;
        }
    }

    getToken(): string | null {
        if (typeof window === "undefined") return null;
        const token = localStorage.getItem("token");
        return token || null;
    }

    setToken(token: string | null) {
        if (typeof window === "undefined") return;
        if (!token) localStorage.removeItem("token");
        else localStorage.setItem("token", token);
    }

    authHeaders(): Record<string, string> {
        const token = this.getToken();
        if (!token) return {};
        return { Authorization: `Bearer ${token}` };
    }

    private buildUrl(path: string) {
        if (!path) return this.basePath || "/";
        if (/^https?:\/\//.test(path)) return path;
        const p = path.replace(/^\/+/, "");
        return this.basePath ? `${this.basePath}/${p}` : `/${p}`;
    }

    async request<T = any>(path: string, opts: ReqOpts = {}): Promise<T> {
        const headers: Record<string, string> = {
            ...this.authHeaders(),
            ...(opts.headers || {}),
        };

        let body = opts.body;
        const hasWindow = typeof window !== "undefined";

        if (body && typeof body !== "string" && !(body instanceof FormData)) {
            body = JSON.stringify(body);
            headers["Content-Type"] = "application/json";
        }

        let res: Response;
        try {
            res = await fetch(this.buildUrl(path), {
                ...opts,
                headers,
                body,
            } as RequestInit);
        } catch (e: any) {
            throw new ApiError(e?.message ?? "Network error", 0, null);
        }

        if (!res.ok) {
            let errMsg = res.statusText || `Request failed: ${res.status}`;
            let errData: any = null;

            try {
                const text = await res.text();
                if (text) {
                    try {
                        errData = JSON.parse(text);
                        errMsg = errData?.error ?? errData?.message ?? text;
                    } catch {
                        errData = text;
                        errMsg = text;
                    }
                }
            } catch {}

            if (res.status === 401 || res.status === 403) {
                this.setToken(null);
                if (hasWindow) {
                    window.dispatchEvent(
                        new CustomEvent("api:logout", {
                            detail: { status: res.status },
                        }),
                    );
                }
            }

            throw new ApiError(errMsg, res.status, errData);
        }

        const text = await res.text();
        if (!text) return undefined as unknown as T;

        try {
            return JSON.parse(text) as T;
        } catch {
            return text as unknown as T;
        }
    }

    get<T = any>(path: string, opts: ReqOpts = {}) {
        return this.request<T>(path, { ...opts, method: "GET" });
    }
    post<T = any>(path: string, body?: any, opts: ReqOpts = {}) {
        return this.request<T>(path, { ...opts, method: "POST", body });
    }
    put<T = any>(path: string, body?: any, opts: ReqOpts = {}) {
        return this.request<T>(path, { ...opts, method: "PUT", body });
    }
    del<T = any>(path: string, opts: ReqOpts = {}) {
        return this.request<T>(path, { ...opts, method: "DELETE" });
    }
}

export const apiClient = new ApiClient("");
