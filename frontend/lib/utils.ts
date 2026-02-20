export function getCurrentUserId(): string | null {
    const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return null;
    try {
        return JSON.parse(atob(token)).sub;
    } catch {
        return null;
    }
}
