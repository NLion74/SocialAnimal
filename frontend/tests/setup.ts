import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

Object.defineProperty(window, "localStorage", {
    value: {
        store: {} as Record<string, string>,
        getItem(key: string) {
            return this.store[key] || null;
        },
        setItem(key: string, value: string) {
            this.store[key] = value;
        },
        removeItem(key: string) {
            delete this.store[key];
        },
        clear() {
            this.store = {};
        },
    },
    writable: true,
});
