import { vi } from "vitest";
import { mockPrisma } from "../setup";

export { mockPrisma };

export function resetMocks() {
    vi.clearAllMocks();
}
