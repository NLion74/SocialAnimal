import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockUser,
    createMockFriendship,
    createMockCalendar,
} from "../helpers/factories";
import * as friendService from "../../src/services/friendService";

beforeEach(() => resetMocks());

describe("requestFriend", () => {
    it("creates friendship request when target user exists", async () => {
        const target = createMockUser({ email: "friend@example.com" });
        const friendship = createMockFriendship("user-1", target.id, {
            status: "pending",
        });

        mockPrisma.user.findUnique.mockResolvedValue({ id: target.id });
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        mockPrisma.friendship.create.mockResolvedValue({
            ...friendship,
            user2: { id: target.id, email: target.email, name: target.name },
        });

        const result = await friendService.requestFriend(
            "user-1",
            "friend@example.com",
        );

        expect(result).not.toBe("not-found");
        expect(result).not.toBe("exists");
        expect(mockPrisma.friendship.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    user1Id: "user-1",
                    user2Id: target.id,
                    status: "pending",
                }),
            }),
        );
    });

    it("returns not-found when target email does not exist", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        const result = await friendService.requestFriend(
            "user-1",
            "nobody@example.com",
        );
        expect(result).toBe("not-found");
    });

    it("returns self when user tries to friend themselves", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
        const result = await friendService.requestFriend(
            "user-1",
            "self@example.com",
        );
        expect(result).toBe("self");
    });

    it("returns exists when friendship already exists", async () => {
        const target = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue({ id: target.id });
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship("user-1", target.id),
        );

        const result = await friendService.requestFriend(
            "user-1",
            target.email,
        );
        expect(result).toBe("exists");
    });
});

describe("acceptFriendRequest", () => {
    it("accepts pending request when user is user2", async () => {
        const friendship = createMockFriendship("user-1", "user-2", {
            status: "pending",
        });
        mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
        mockPrisma.friendship.update.mockResolvedValue({
            ...friendship,
            status: "accepted",
        });

        const result = await friendService.acceptFriendRequest(
            "user-2",
            friendship.id,
        );

        expect(result).not.toBeNull();
        expect(mockPrisma.friendship.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: "accepted" },
            }),
        );
    });

    it("returns null when friendship not found or user is not user2", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        const result = await friendService.acceptFriendRequest(
            "user-1",
            "friendship-1",
        );
        expect(result).toBeNull();
    });
});

describe("removeFriendship", () => {
    it("removes friendship and cleans up calendar shares", async () => {
        const friendship = createMockFriendship("user-1", "user-2");
        mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
        mockPrisma.calendarShare.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.friendship.delete.mockResolvedValue(friendship);

        const result = await friendService.removeFriendship(
            "user-1",
            friendship.id,
        );

        expect(result).toBe(true);
        expect(mockPrisma.calendarShare.deleteMany).toHaveBeenCalled();
        expect(mockPrisma.friendship.delete).toHaveBeenCalledWith({
            where: { id: friendship.id },
        });
    });

    it("correctly identifies friendId when user is user2", async () => {
        const friendship = createMockFriendship("user-1", "user-2");
        mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
        mockPrisma.calendarShare.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.friendship.delete.mockResolvedValue(friendship);

        await friendService.removeFriendship("user-2", friendship.id);

        expect(mockPrisma.calendarShare.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        expect.objectContaining({
                            calendar: { userId: "user-2" },
                            sharedWithId: "user-1",
                        }),
                        expect.objectContaining({
                            calendar: { userId: "user-1" },
                            sharedWithId: "user-2",
                        }),
                    ]),
                }),
            }),
        );
    });

    it("returns false when friendship not found or user not involved", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);
        const result = await friendService.removeFriendship(
            "user-1",
            "friendship-1",
        );
        expect(result).toBe(false);
        expect(mockPrisma.friendship.delete).not.toHaveBeenCalled();
    });
});

describe("setCalendarShare", () => {
    it("creates share when sharing with friend", async () => {
        const friendship = createMockFriendship("user-1", "user-2");
        const calendar = createMockCalendar("user-1");
        mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.calendarShare.upsert.mockResolvedValue({});

        const result = await friendService.setCalendarShare({
            ownerId: "user-1",
            friendId: "user-2",
            calendarId: calendar.id,
            share: true,
            permission: "full",
        });

        expect(result).toBe("ok");
        expect(mockPrisma.calendarShare.upsert).toHaveBeenCalled();
    });

    it("removes share when unsharing", async () => {
        const friendship = createMockFriendship("user-1", "user-2");
        const calendar = createMockCalendar("user-1");
        mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.calendarShare.deleteMany.mockResolvedValue({ count: 1 });

        const result = await friendService.setCalendarShare({
            ownerId: "user-1",
            friendId: "user-2",
            calendarId: calendar.id,
            share: false,
            permission: "full",
        });

        expect(result).toBe("ok");
        expect(mockPrisma.calendarShare.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendarId: calendar.id, sharedWithId: "user-2" },
            }),
        );
    });

    it("returns not-friend when no accepted friendship exists", async () => {
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        const result = await friendService.setCalendarShare({
            ownerId: "user-1",
            friendId: "user-2",
            calendarId: "cal-1",
            share: true,
            permission: "full",
        });

        expect(result).toBe("not-friend");
        expect(mockPrisma.calendarShare.upsert).not.toHaveBeenCalled();
    });

    it("returns no-calendar when calendar not owned by user", async () => {
        const friendship = createMockFriendship("user-1", "user-2");
        mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const result = await friendService.setCalendarShare({
            ownerId: "user-1",
            friendId: "user-2",
            calendarId: "cal-1",
            share: true,
            permission: "full",
        });

        expect(result).toBe("no-calendar");
    });
});

describe("listFriendshipsWithShares", () => {
    it("returns friendships enriched with share data", async () => {
        const user = createMockUser({ id: "user-1" });
        const friend = createMockUser({ id: "user-2" });
        const friendship = createMockFriendship(user.id, friend.id);

        mockPrisma.friendship.findMany.mockResolvedValue([
            {
                ...friendship,
                user1: { id: user.id, email: user.email, name: user.name },
                user2: {
                    id: friend.id,
                    email: friend.email,
                    name: friend.name,
                },
            },
        ]);
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);

        const result = await friendService.listFriendshipsWithShares(user.id);

        expect(result).toHaveLength(1);
        expect(result[0].sharedCalendarIds).toEqual([]);
        expect(result[0].sharedWithMe).toEqual([]);
    });

    it("correctly identifies friendId when user is user2", async () => {
        const user = createMockUser({ id: "user-2" });
        const friend = createMockUser({ id: "user-1" });
        const friendship = createMockFriendship(friend.id, user.id);

        mockPrisma.friendship.findMany.mockResolvedValue([
            {
                ...friendship,
                user1: {
                    id: friend.id,
                    email: friend.email,
                    name: friend.name,
                },
                user2: { id: user.id, email: user.email, name: user.name },
            },
        ]);
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);

        const result = await friendService.listFriendshipsWithShares(user.id);

        expect(mockPrisma.calendarShare.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    sharedWithId: friend.id,
                }),
            }),
        );
        expect(result[0].sharedCalendarIds).toEqual([]);
    });

    it("returns sharedWithMe populated from their shares", async () => {
        const user = createMockUser({ id: "user-1" });
        const friend = createMockUser({ id: "user-2" });
        const friendship = createMockFriendship(user.id, friend.id);
        const calendar = createMockCalendar(friend.id);

        mockPrisma.friendship.findMany.mockResolvedValue([
            {
                ...friendship,
                user1: { id: user.id, email: user.email, name: user.name },
                user2: {
                    id: friend.id,
                    email: friend.email,
                    name: friend.name,
                },
            },
        ]);
        mockPrisma.calendarShare.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    calendarId: calendar.id,
                    permission: "full",
                    calendar: { name: calendar.name },
                },
            ]);

        const result = await friendService.listFriendshipsWithShares(user.id);

        expect(result[0].sharedWithMe).toEqual([
            { id: calendar.id, name: calendar.name, permission: "full" },
        ]);
    });
});
