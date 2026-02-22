import crypto from "crypto";

export function createMockUser(overrides: any = {}) {
    return {
        id: crypto.randomUUID(),
        email: `test-${crypto.randomUUID().slice(0, 8)}@example.com`,
        passwordHash: "hashed",
        salt: "salt",
        name: "Test User",
        avatar: null,
        createdAt: new Date(),
        isAdmin: false,
        ...overrides,
    };
}

export function createMockCalendar(userId: string, overrides: any = {}) {
    return {
        id: crypto.randomUUID(),
        userId,
        name: "Test Calendar",
        type: "ics",
        url: "https://example.com/cal.ics",
        config: {},
        syncInterval: 60,
        lastSync: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

export function createMockEvent(calendarId: string, overrides: any = {}) {
    const now = new Date();
    return {
        id: crypto.randomUUID(),
        calendarId,
        externalId: null,
        title: "Test Event",
        description: null,
        location: null,
        startTime: now,
        endTime: new Date(now.getTime() + 3600000),
        allDay: false,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

export function createMockFriendship(
    user1Id: string,
    user2Id: string,
    overrides: any = {},
) {
    return {
        id: crypto.randomUUID(),
        user1Id,
        user2Id,
        status: "accepted",
        createdAt: new Date(),
        updatedAt: new Date(),
        sharedCalendars: false,
        ...overrides,
    };
}
