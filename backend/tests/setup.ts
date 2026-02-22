import { vi, beforeAll } from "vitest";

export const mockPrisma = {
    user: {
        count: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    calendar: {
        count: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    event: {
        create: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
    },
    friendship: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    calendarShare: {
        create: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
    userSettings: {
        deleteMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
    },
    inviteCode: {
        create: vi.fn(),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
    },
    appSettings: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $connect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockResolvedValue([]),
};

vi.mock("../src/utils/db", () => ({
    prisma: mockPrisma,
    disconnectDb: vi.fn(),
}));

beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "test-secret";
});
