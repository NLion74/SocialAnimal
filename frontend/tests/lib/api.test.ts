import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiClient, ApiError } from "../../lib/api";

global.fetch = vi.fn();

describe("API Client", () => {
    let client: ApiClient;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        client = new ApiClient("/api");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("ApiError", () => {
        it("should create error with message", () => {
            const error = new ApiError("Test error");
            expect(error.message).toBe("Test error");
            expect(error.name).toBe("ApiError");
            expect(error.status).toBe(0);
        });

        it("should create error with status and data", () => {
            const error = new ApiError("Not found", 404, {
                detail: "Resource missing",
            });
            expect(error.status).toBe(404);
            expect(error.data).toEqual({ detail: "Resource missing" });
        });
    });

    describe("ApiClient constructor", () => {
        it("should initialize with basePath", () => {
            const c = new ApiClient("/api");
            expect(c.basePath).toBe("/api");
        });

        it("should remove trailing slashes from basePath", () => {
            const c = new ApiClient("/api///");
            expect(c.basePath).toBe("/api");
        });

        it("should handle empty basePath", () => {
            const c = new ApiClient("");
            expect(c.basePath).toBe("");
        });
    });

    describe("getToken / setToken", () => {
        it("should get token from localStorage", () => {
            localStorage.setItem("token", "test-token");
            expect(client.getToken()).toBe("test-token");
        });

        it("should return null when no token", () => {
            expect(client.getToken()).toBeNull();
        });

        it("should set token in localStorage", () => {
            client.setToken("new-token");
            expect(localStorage.getItem("token")).toBe("new-token");
        });

        it("should remove token when setting null", () => {
            localStorage.setItem("token", "old-token");
            client.setToken(null);
            expect(localStorage.getItem("token")).toBeNull();
        });
    });

    describe("getUid", () => {
        it("should extract uid from JWT token", () => {
            const payload = JSON.stringify({ sub: "user-123" });
            const token = `header.${btoa(payload)}.signature`;
            client.setToken(token);

            expect(client.getUid()).toBe("user-123");
        });

        it("should handle simple base64 token", () => {
            const payload = JSON.stringify({ sub: "user-456" });
            const token = btoa(payload);
            client.setToken(token);

            expect(client.getUid()).toBe("user-456");
        });

        it("should return null when no token", () => {
            expect(client.getUid()).toBeNull();
        });

        it("should return null for invalid token", () => {
            client.setToken("invalid-token");
            expect(client.getUid()).toBeNull();
        });
    });

    describe("authHeaders", () => {
        it("should return Authorization header when token exists", () => {
            client.setToken("test-token");
            const headers = client.authHeaders();

            expect(headers).toEqual({
                Authorization: "Bearer test-token",
            });
        });

        it("should return empty object when no token", () => {
            const headers = client.authHeaders();
            expect(headers).toEqual({});
        });
    });

    describe("request", () => {
        it("should make GET request", async () => {
            const mockResponse = { data: "test" };
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify(mockResponse),
            });

            const result = await client.request("/users");

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/users",
                expect.objectContaining({
                    headers: expect.any(Object),
                }),
            );
            expect(result).toEqual(mockResponse);
        });

        it("should include auth token in headers", async () => {
            client.setToken("auth-token");
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "{}",
            });

            await client.request("/protected");

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: "Bearer auth-token",
                    }),
                }),
            );
        });

        it("should serialize JSON body", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "{}",
            });

            const payload = { name: "test" };
            await client.request("/users", {
                method: "POST",
                body: payload,
            });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: JSON.stringify(payload),
                    headers: expect.objectContaining({
                        "Content-Type": "application/json",
                    }),
                }),
            );
        });

        it("should handle FormData without serialization", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "{}",
            });

            const formData = new FormData();
            formData.append("file", "test");

            await client.request("/upload", {
                method: "POST",
                body: formData,
            });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: formData,
                }),
            );
        });

        it("should handle empty response", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "",
            });

            const result = await client.request("/empty");
            expect(result).toBeUndefined();
        });

        it("should throw ApiError on failed request", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: async () =>
                    JSON.stringify({ error: "Resource not found" }),
            });

            await expect(client.request("/missing")).rejects.toThrow(ApiError);
        });

        it("should extract error message from response", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: "Bad Request",
                text: async () => JSON.stringify({ error: "Invalid input" }),
            });

            try {
                await client.request("/bad");
            } catch (e: any) {
                expect(e.message).toBe("Invalid input");
                expect(e.status).toBe(400);
            }
        });

        it("should clear token on 401 error", async () => {
            client.setToken("expired-token");

            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                text: async () => "",
            });

            await expect(client.request("/protected")).rejects.toThrow();
            expect(client.getToken()).toBeNull();
        });

        it("should clear token on 403 error", async () => {
            client.setToken("forbidden-token");

            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: "Forbidden",
                text: async () => "",
            });

            await expect(client.request("/admin")).rejects.toThrow();
            expect(client.getToken()).toBeNull();
        });

        it("should handle network errors", async () => {
            (global.fetch as any).mockRejectedValueOnce(
                new Error("Network failure"),
            );

            try {
                await client.request("/test");
            } catch (e: any) {
                expect(e).toBeInstanceOf(ApiError);
                expect(e.message).toBe("Network failure");
                expect(e.status).toBe(0);
            }
        });

        it("should handle absolute URLs", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "{}",
            });

            await client.request("https://external.com/api/test");

            expect(global.fetch).toHaveBeenCalledWith(
                "https://external.com/api/test",
                expect.any(Object),
            );
        });

        it("should strip leading slashes from path", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "{}",
            });

            await client.request("///users");

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/users",
                expect.any(Object),
            );
        });
    });

    describe("convenience methods", () => {
        beforeEach(() => {
            (global.fetch as any).mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify({ success: true }),
            });
        });

        it("should make GET request", async () => {
            await client.get("/users");

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ method: "GET" }),
            );
        });

        it("should make POST request with body", async () => {
            const body = { name: "test" };
            await client.post("/users", body);

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify(body),
                }),
            );
        });

        it("should make PUT request with body", async () => {
            const body = { name: "updated" };
            await client.put("/users/1", body);

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    method: "PUT",
                    body: JSON.stringify(body),
                }),
            );
        });

        it("should make DELETE request", async () => {
            await client.del("/users/1");

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ method: "DELETE" }),
            );
        });
    });

    describe("Edge cases", () => {
        it("should handle non-JSON response", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                text: async () => "Plain text response",
            });

            const result = await client.request("/text");
            expect(result).toBe("Plain text response");
        });

        it("should handle error with plain text response", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                text: async () => "Server crashed",
            });

            try {
                await client.request("/crash");
            } catch (e: any) {
                expect(e.message).toBe("Server crashed");
                expect(e.data).toBe("Server crashed");
            }
        });

        it("should handle error with empty response", async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                text: async () => "",
            });

            try {
                await client.request("/error");
            } catch (e: any) {
                expect(e.message).toBe("Internal Server Error");
            }
        });
    });
});
