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

    getToken(): string | null {
        return typeof window !== "undefined"
            ? localStorage.getItem("token")
            : null;
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

    setToken(token: string | null) {
        if (typeof window === "undefined") return;
        if (token === null) localStorage.removeItem("token");
        else localStorage.setItem("token", token);
    }

    authHeaders(): Record<string, string> {
        const t = this.getToken();
        return t ? { Authorization: `Bearer ${t}` } : {};
    }

    private buildUrl(path: string) {
        if (!path) return this.basePath || "/";
        if (/^https?:\/\//.test(path)) return path;
        const p = path.replace(/^\/+/, "");
        return this.basePath ? `${this.basePath}/${p}` : `/${p}`;
    }

    async request<T = any>(path: string, opts: ReqOpts = {}): Promise<T> {
        const extraHeaders: Record<string, string> = {};
        if (opts.headers) {
            const h = new Headers(opts.headers as HeadersInit);
            h.forEach((v, k) => (extraHeaders[k] = v));
        }

        const headers: Record<string, string> = {
            ...this.authHeaders(),
            ...extraHeaders,
        };

        let body = opts.body as any;
        const hasWindow = typeof window !== "undefined";

        const isFormData =
            typeof FormData !== "undefined" && body instanceof FormData;
        const isURLSearchParams =
            typeof URLSearchParams !== "undefined" &&
            body instanceof URLSearchParams;
        const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
        const isArrayBuffer =
            typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer;

        if (
            body !== undefined &&
            body !== null &&
            typeof body !== "string" &&
            !isFormData &&
            !isURLSearchParams &&
            !isBlob &&
            !isArrayBuffer
        ) {
            body = JSON.stringify(body);
            headers["Content-Type"] = "application/json";
        }

        let res: Response;
        try {
            res = await fetch(this.buildUrl(path), {
                ...opts,
                body,
                headers,
            } as RequestInit);
        } catch (e: any) {
            throw new ApiError(e?.message ?? "Network error", 0, null);
        }

        if (!res.ok) {
            let errData: any = null;
            let errMsg = res.statusText || `Request failed: ${res.status}`;
            const txt = await res.text().catch(() => "");
            if (txt) {
                try {
                    errData = JSON.parse(txt);
                    errMsg =
                        errData?.error ??
                        errData?.message ??
                        JSON.stringify(errData);
                } catch {
                    errData = txt;
                    errMsg = txt;
                }
            }

            if (res.status === 401 || res.status === 403) {
                try {
                    this.setToken(null);
                    if (hasWindow) {
                        window.dispatchEvent(
                            new CustomEvent("api:logout", {
                                detail: { status: res.status },
                            }),
                        );
                    }
                } catch {}
            }

            throw new ApiError(errMsg, res.status, errData);
        }

        const text = await res.text().catch(() => "");
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
