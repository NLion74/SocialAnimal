export function getCurrentUserId(): string | null {
    const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return null;
    try {
        // Token is plain base64 JSON, NOT a 3-part JWT
        return JSON.parse(atob(token)).sub;
    } catch {
        return null;
    }
}
