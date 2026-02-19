export interface CalendarEvent {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
}

export interface CalendarData {
    id: string;
    name: string;
    type: string;
    url?: string;
    config?: Record<string, any>;
    syncInterval: number;
    lastSync?: string | null;
    createdAt: string;
    updatedAt: string;
    events?: CalendarEvent[];
}

export interface FriendUser {
    id: string;
    email: string;
    name?: string;
}

export interface Friend {
    id: string;
    user1: FriendUser;
    user2: FriendUser;
    status: string;
    createdAt?: string;
    sharedCalendarIds?: string[];
    sharedCalendarPermissions?: Record<string, Permission>;
    sharedWithMe?: { id: string; name: string }[];
}

export interface CalEvent extends CalendarEvent {
    description?: string;
    location?: string;
    isFriend?: boolean;
    owner?: { id: string; name?: string; email: string } | null;
    calendar: { id: string; name: string; type: string };
}

export interface CalSource {
    id: string;
    name: string;
    isFriend: boolean;
}

export type Permission = "busy" | "titles" | "full";
